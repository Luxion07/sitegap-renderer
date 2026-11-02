import { Test, TestingModule } from '@nestjs/testing';
import { BrowserModule } from '../src/browser/browser.module';
import { BrowserService } from '../src/browser/browser.service';

describe('BrowserService e2e', () => {
  let moduleRef: TestingModule;
  let browserService: BrowserService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [BrowserModule],
    }).compile();

    await moduleRef.init();
    browserService = moduleRef.get(BrowserService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should launch real Chromium and open a page', async () => {
    expect(browserService.isConnected).toBe(true);

    const headingText = await browserService.withContext(async (context) => {
      const page = await context.newPage();
      await page.setContent('<h1>Hello SiteGap</h1>');
      return page.textContent('h1');
    });

    expect(headingText).toBe('Hello SiteGap');
  });
});
