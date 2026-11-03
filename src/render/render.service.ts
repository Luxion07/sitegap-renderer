import { Injectable, Optional } from '@nestjs/common';
import { SlotLimiter } from '../browser/slot-limiter';
import { BrowserService } from '../browser/browser.service';
import { RequestGuard } from '../safety/request-guard';
import { TextExtractor } from '../extraction/text-extractor';
import { SlotsBusyError } from './errors/slots-busy.error';
import { RenderTimeoutError } from './errors/render-timeout.error';
import { validateEnv } from '../config/env.validation';

export interface RenderResult {
  text: string;
  finalUrl: string;
}

@Injectable()
export class RenderService {
  private readonly maxRenderMs: number;

  constructor(
    private readonly slotLimiter: SlotLimiter,
    private readonly browserService: BrowserService,
    private readonly requestGuard: RequestGuard,
    private readonly textExtractor: TextExtractor,
    @Optional() maxRenderMs?: number,
  ) {
    this.maxRenderMs =
      maxRenderMs ?? validateEnv(process.env).RENDERER_MAX_RENDER_MS;
  }

  async render(url: string, deadlineMs?: number): Promise<RenderResult> {
    if (!this.slotLimiter.acquire()) {
      throw new SlotsBusyError();
    }

    const timeout =
      deadlineMs !== undefined
        ? Math.min(deadlineMs, this.maxRenderMs)
        : this.maxRenderMs;

    try {
      return await this.browserService.withContext(async (context) => {
        await this.requestGuard.install(context);

        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: 'load', timeout });
        } catch (err) {
          const mainDocumentError = this.requestGuard.getMainDocumentError();
          if (mainDocumentError) {
            throw mainDocumentError;
          }

          if (this.isTimeoutError(err)) {
            throw new RenderTimeoutError();
          }

          throw err;
        }

        const mainDocumentError = this.requestGuard.getMainDocumentError();
        if (mainDocumentError) {
          throw mainDocumentError;
        }

        const text = await this.textExtractor.extract(page);
        const finalUrl = page.url();

        return { text, finalUrl };
      });
    } finally {
      this.slotLimiter.release();
    }
  }

  private isTimeoutError(err: unknown): boolean {
    if (err instanceof Error) {
      return (
        err.name === 'TimeoutError' ||
        err.message.toLowerCase().includes('timeout')
      );
    }
    return false;
  }
}
