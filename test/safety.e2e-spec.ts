import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { BrowserModule } from '../src/browser/browser.module';
import { BrowserService } from '../src/browser/browser.service';
import { SafetyModule } from '../src/safety/safety.module';
import { RequestGuard } from '../src/safety/request-guard';
import {
  ADDRESS_CHECKER,
  AddressChecker,
} from '../src/safety/address-checker.interface';
import { DefaultAddressChecker } from '../src/safety/default-address-checker';
import { BlockedUrlError } from '../src/safety/errors/blocked-url.error';

class TestAddressChecker implements AddressChecker {
  private readonly realChecker = new DefaultAddressChecker();

  constructor(private readonly allowedPort: number) {}

  isBlocked(ip: string, port?: number): boolean {
    const unbracketed = ip.replace(/^\[|\]$/g, '');
    if (
      (unbracketed === '127.0.0.1' || unbracketed === 'localhost') &&
      port === this.allowedPort
    ) {
      return false;
    }
    return this.realChecker.isBlocked(ip, port);
  }
}

describe('SSRF Guard e2e', () => {
  let moduleRef: TestingModule;
  let browserService: BrowserService;
  let allowedServer: http.Server;
  let forbiddenServer: http.Server;
  let allowedPort: number;
  let forbiddenPort: number;
  let forbiddenHits = 0;

  beforeAll(async () => {
    forbiddenServer = http.createServer((_req, res) => {
      forbiddenHits++;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('secret-data');
    });

    await new Promise<void>((resolve) => {
      forbiddenServer.listen(0, '127.0.0.1', () => {
        forbiddenPort = (forbiddenServer.address() as AddressInfo).port;
        resolve();
      });
    });

    allowedServer = http.createServer((req, res) => {
      if (req.url === '/safe-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>Safe Content</h1>
              <script>
                fetch('http://127.0.0.1:${forbiddenPort}/leak').catch(() => {});
              </script>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/safe-page-with-iframe') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>Safe Content With Iframe</h1>
              <iframe src="http://127.0.0.1:${forbiddenPort}/forbidden-iframe"></iframe>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/redirect-to-safe') {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${allowedPort}/safe-page`,
        });
        res.end();
        return;
      }

      if (req.url === '/redirect-to-loopback') {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${forbiddenPort}/secret`,
        });
        res.end();
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) => {
      allowedServer.listen(0, '127.0.0.1', () => {
        allowedPort = (allowedServer.address() as AddressInfo).port;
        resolve();
      });
    });

    moduleRef = await Test.createTestingModule({
      imports: [BrowserModule, SafetyModule],
    })
      .overrideProvider(ADDRESS_CHECKER)
      .useValue(new TestAddressChecker(allowedPort))
      .compile();

    await moduleRef.init();
    browserService = moduleRef.get(BrowserService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await new Promise<void>((resolve) => allowedServer.close(() => resolve()));
    await new Promise<void>((resolve) =>
      forbiddenServer.close(() => resolve()),
    );
  });

  beforeEach(() => {
    forbiddenHits = 0;
  });

  it('blocks subresource requests to loopback while allowing page to render', async () => {
    await browserService.withContext(async (context) => {
      const guard = moduleRef.get(RequestGuard);
      const session = await guard.install(context);

      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${allowedPort}/safe-page`);

      // Give in-page script a moment to fire fetch
      await page.waitForTimeout(200);

      const heading = await page.textContent('h1');
      expect(heading).toBe('Safe Content');
      expect(forbiddenHits).toBe(0);
      expect(session.getMainDocumentError()).toBeNull();
    });
  });

  it('blocks iframe requests to loopback while allowing page to render', async () => {
    await browserService.withContext(async (context) => {
      const guard = moduleRef.get(RequestGuard);
      const session = await guard.install(context);

      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${allowedPort}/safe-page-with-iframe`);

      // Give iframe navigation a moment to be intercepted
      await page.waitForTimeout(200);

      const heading = await page.textContent('h1');
      expect(heading).toBe('Safe Content With Iframe');
      expect(forbiddenHits).toBe(0);
      expect(session.getMainDocumentError()).toBeNull();
    });
  });

  it('blocks navigation when redirect points to a loopback address', async () => {
    await browserService.withContext(async (context) => {
      const guard = moduleRef.get(RequestGuard);
      const session = await guard.install(context);

      const page = await context.newPage();
      await expect(
        page.goto(`http://127.0.0.1:${allowedPort}/redirect-to-loopback`),
      ).rejects.toThrow();

      expect(forbiddenHits).toBe(0);
      expect(session.getMainDocumentError()).toBeInstanceOf(BlockedUrlError);
    });
  });

  it('allows navigation when redirect points to a safe address', async () => {
    await browserService.withContext(async (context) => {
      const guard = moduleRef.get(RequestGuard);
      const session = await guard.install(context);

      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${allowedPort}/redirect-to-safe`);
      } catch {
        const nextUrl = session.consumeRedirectTarget();
        if (nextUrl) {
          await page.goto(nextUrl);
        }
      }

      const heading = await page.textContent('h1');
      expect(heading).toBe('Safe Content');
      expect(session.getMainDocumentError()).toBeNull();
    });
  });
});
