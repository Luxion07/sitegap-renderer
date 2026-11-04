import { Injectable } from '@nestjs/common';
import { BrowserContext, Route } from 'playwright';
import { UrlSafetyService } from './url-safety.service';

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);
const MAX_REDIRECTS = 10;

@Injectable()
export class RequestGuard {
  constructor(private readonly urlSafetyService: UrlSafetyService) {}

  async install(context: BrowserContext): Promise<GuardSession> {
    const session = new GuardSession();

    await context.routeWebSocket('**/*', (ws) => {
      void ws.close();
    });

    await context.route('**/*', async (route) => {
      await this.handleRoute(route, session);
    });

    return session;
  }

  private async handleRoute(
    route: Route,
    session: GuardSession,
  ): Promise<void> {
    const request = route.request();
    const isMainDocument =
      request.isNavigationRequest() &&
      (typeof request.frame === 'function' && request.frame()
        ? request.frame().parentFrame() === null
        : true);
    const resourceType = request.resourceType();

    if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      await route.abort('blockedbyclient');
      return;
    }

    const currentUrl = request.url();
    try {
      await this.urlSafetyService.assertSafeUrl(currentUrl);
    } catch (err) {
      if (isMainDocument) {
        session.setMainDocumentError(
          err instanceof Error ? err : new Error(String(err)),
        );
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
          if (isMainDocument) {
            session.setMainDocumentError(new Error('Too many redirects'));
          }
          await route.abort('failed');
          return;
        }

        const location = response.headers()['location'];
        if (!location) {
          if (isMainDocument) {
            session.setMainDocumentFinalUrl(redirectUrl);
          }
          await route.fulfill({ response });
          return;
        }

        const nextUrl = new URL(location, redirectUrl).href;
        try {
          await this.urlSafetyService.assertSafeUrl(nextUrl);
        } catch (err) {
          if (isMainDocument) {
            session.setMainDocumentError(
              err instanceof Error ? err : new Error(String(err)),
            );
          }
          await route.abort('blockedbyclient');
          return;
        }

        redirectUrl = nextUrl;
        currentMethod = 'GET';
        postData = undefined;
        continue;
      }

      if (isMainDocument) {
        session.setMainDocumentFinalUrl(redirectUrl);
      }

      await route.fulfill({ response });
      return;
    }
  }
}

export class GuardSession {
  private mainDocumentError: Error | null = null;
  private mainDocumentFinalUrl: string | null = null;

  getMainDocumentError(): Error | null {
    return this.mainDocumentError;
  }

  setMainDocumentError(error: Error | null): void {
    this.mainDocumentError = error;
  }

  getMainDocumentFinalUrl(): string | null {
    return this.mainDocumentFinalUrl;
  }

  setMainDocumentFinalUrl(url: string | null): void {
    this.mainDocumentFinalUrl = url;
  }
}
