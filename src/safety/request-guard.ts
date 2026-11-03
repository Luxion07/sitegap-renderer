import { Injectable } from '@nestjs/common';
import { BrowserContext, Route } from 'playwright';
import { UrlSafetyService } from './url-safety.service';

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);
const MAX_REDIRECTS = 10;

@Injectable()
export class RequestGuard {
  private mainDocumentError: Error | null = null;

  constructor(private readonly urlSafetyService: UrlSafetyService) {}

  getMainDocumentError(): Error | null {
    return this.mainDocumentError;
  }

  async install(context: BrowserContext): Promise<void> {
    this.mainDocumentError = null;

    await context.routeWebSocket('**/*', (ws) => {
      void ws.close();
    });

    await context.route('**/*', async (route) => {
      await this.handleRoute(route);
    });
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const isNavigation = request.isNavigationRequest();
    const resourceType = request.resourceType();

    if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      await route.abort('blockedbyclient');
      return;
    }

    const currentUrl = request.url();
    try {
      await this.urlSafetyService.assertSafeUrl(currentUrl);
    } catch (err) {
      if (isNavigation) {
        this.mainDocumentError =
          err instanceof Error ? err : new Error(String(err));
      }
      await route.abort('blockedbyclient');
      return;
    }

    let redirectUrl = currentUrl;
    let currentMethod = request.method();
    const currentHeaders = request.headers();
    let postData: Buffer | undefined = request.postDataBuffer() ?? undefined;

    let redirectCount = 0;
    while (true) {
      let response;
      try {
        response = await route.fetch({
          url: redirectUrl,
          method: currentMethod,
          headers: currentHeaders,
          postData,
          maxRedirects: 0,
        });
      } catch {
        await route.abort('failed');
        return;
      }

      const status = response.status();
      if (status >= 300 && status < 400) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          if (isNavigation) {
            this.mainDocumentError = new Error('Too many redirects');
          }
          await route.abort('failed');
          return;
        }

        const location = response.headers()['location'];
        if (!location) {
          await route.fulfill({ response });
          return;
        }

        const nextUrl = new URL(location, redirectUrl).href;
        try {
          await this.urlSafetyService.assertSafeUrl(nextUrl);
        } catch (err) {
          if (isNavigation) {
            this.mainDocumentError =
              err instanceof Error ? err : new Error(String(err));
          }
          await route.abort('blockedbyclient');
          return;
        }

        redirectUrl = nextUrl;
        currentMethod = 'GET';
        postData = undefined;
        continue;
      }

      await route.fulfill({ response });
      return;
    }
  }
}
