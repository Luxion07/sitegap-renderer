import { INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import {
  ADDRESS_CHECKER,
  AddressChecker,
} from '../src/safety/address-checker.interface';
import { DefaultAddressChecker } from '../src/safety/default-address-checker';

interface GrpcRenderResponse {
  text: string;
  final_url?: string;
  finalUrl?: string;
}

interface GrpcRendererClient extends grpc.Client {
  render(
    request: { url: string },
    callback: (
      error: grpc.ServiceError | null,
      response: GrpcRenderResponse,
    ) => void,
  ): void;
}

type ClientConstructor = new (
  url: string,
  creds: grpc.ChannelCredentials,
) => GrpcRendererClient;

interface GrpcPackageRoot {
  sitegap: {
    renderer: {
      v1: {
        Renderer: ClientConstructor;
      };
    };
  };
}

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

describe('Renderer gRPC e2e', () => {
  let serverApp: INestMicroservice;
  let grpcClient: GrpcRendererClient;
  let allowedServer: http.Server;
  let forbiddenServer: http.Server;
  let allowedPort: number;
  let forbiddenPort: number;

  const TEST_PORT = 50059;
  const TEST_SERVER_URL = `0.0.0.0:${TEST_PORT}`;
  const PROTO_FILE_PATH = join(
    process.cwd(),
    'proto/sitegap/renderer/v1/renderer.proto',
  );

  beforeAll(async () => {
    forbiddenServer = http.createServer((_req, res) => {
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
      if (req.url === '/js-rendered') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><style>body { font-size: 14px; }</style></head>
            <body>
              <header><nav>Navigation To Strip</nav></header>
              <div id="content">Initial Server Text</div>
              <footer>Footer To Strip</footer>
              <script>
                document.getElementById('content').textContent = 'Rendered dynamically by JavaScript';
              </script>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/redirect-source') {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${allowedPort}/redirect-target`,
        });
        res.end();
        return;
      }

      if (req.url === '/redirect-target') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <main>Redirect Target Content</main>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/redirect-to-blocked') {
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

    const testModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ADDRESS_CHECKER)
      .useValue(new TestAddressChecker(allowedPort))
      .compile();

    serverApp = testModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'sitegap.renderer.v1',
        protoPath: PROTO_FILE_PATH,
        url: TEST_SERVER_URL,
      },
    });

    await serverApp.init();
    await serverApp.listen();

    const loadedProtoDefinition = protoLoader.loadSync(PROTO_FILE_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const grpcPackage = grpc.loadPackageDefinition(
      loadedProtoDefinition,
    ) as unknown as GrpcPackageRoot;

    const RendererClientConstructor = grpcPackage.sitegap.renderer.v1.Renderer;
    grpcClient = new RendererClientConstructor(
      `localhost:${TEST_PORT}`,
      grpc.credentials.createInsecure(),
    );
  });

  afterAll(async () => {
    grpcClient?.close();
    await serverApp?.close();
    await new Promise<void>((resolve) => allowedServer?.close(() => resolve()));
    await new Promise<void>((resolve) =>
      forbiddenServer?.close(() => resolve()),
    );
  });

  function sendRenderRequest(requestData: {
    url: string;
  }): Promise<GrpcRenderResponse> {
    return new Promise((resolve, reject) => {
      grpcClient.render(requestData, (grpcError, response) => {
        if (grpcError) {
          return reject(grpcError);
        }
        resolve(response);
      });
    });
  }

  it('renders dynamic client-side JS and extracts clean text', async () => {
    const response = await sendRenderRequest({
      url: `http://127.0.0.1:${allowedPort}/js-rendered`,
    });

    expect(response.text).toBe('Rendered dynamically by JavaScript');
    const finalUrl = response.final_url ?? response.finalUrl;
    expect(finalUrl).toBe(`http://127.0.0.1:${allowedPort}/js-rendered`);
  });

  it('follows safe redirect and returns final redirected URL', async () => {
    const response = await sendRenderRequest({
      url: `http://127.0.0.1:${allowedPort}/redirect-source`,
    });

    expect(response.text).toBe('Redirect Target Content');
    const finalUrl = response.final_url ?? response.finalUrl;
    expect(finalUrl).toBe(`http://127.0.0.1:${allowedPort}/redirect-target`);
  });

  it('returns INVALID_ARGUMENT when URL format is invalid', async () => {
    await expect(
      sendRenderRequest({ url: 'not-a-valid-url' }),
    ).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
  });

  it('returns PERMISSION_DENIED when target URL resolves to blocked address', async () => {
    await expect(
      sendRenderRequest({
        url: `http://127.0.0.1:${forbiddenPort}/secret`,
      }),
    ).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED,
      details: 'This URL cannot be analyzed for security reasons.',
    });
  });

  it('returns PERMISSION_DENIED when redirect hop resolves to blocked address', async () => {
    await expect(
      sendRenderRequest({
        url: `http://127.0.0.1:${allowedPort}/redirect-to-blocked`,
      }),
    ).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED,
      details: 'This URL cannot be analyzed for security reasons.',
    });
  });
});
