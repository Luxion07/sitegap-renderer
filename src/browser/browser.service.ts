import { Browser, BrowserContext } from 'playwright';
import { BrowserUnavailableError } from './errors/browser-unavailable.error';

export class BrowserService {
  protected browser: Browser | null = null;

  async withContext<T>(
    action: (context: BrowserContext) => Promise<T>,
  ): Promise<T> {
    if (!this.browser || !this.browser.isConnected()) {
      throw new BrowserUnavailableError();
    }
    const context = await this.browser.newContext({ serviceWorkers: 'block' });
    try {
      return await action(context);
    } finally {
      await context.close();
    }
  }
}
