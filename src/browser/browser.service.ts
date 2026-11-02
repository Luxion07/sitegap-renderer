import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Browser, BrowserContext, chromium } from 'playwright';
import { BrowserUnavailableError } from './errors/browser-unavailable.error';

@Injectable()
export class BrowserService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BrowserService.name);
  protected browser: Browser | null = null;
  private isShuttingDown = false;

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Launching headless Chromium...');
    this.browser = await chromium.launch({ headless: true });

    this.browser.on('disconnected', () => {
      if (this.isShuttingDown) {
        return;
      }
      this.logger.error(
        'Chromium disconnected unexpectedly. Exiting process...',
      );
      process.exit(1);
    });

    this.logger.log('Chromium successfully launched');
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.browser) {
      this.logger.log('Closing Chromium...');
      await this.browser.close();
      this.browser = null;
      this.logger.log('Chromium closed');
    }
  }

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

  get isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}
