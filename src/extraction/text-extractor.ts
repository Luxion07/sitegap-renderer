import { Injectable } from '@nestjs/common';
import { Page } from 'playwright';

export const MAX_EXTRACTED_CHARS = 40000;
export const REMOVED_SELECTORS =
  'script, style, noscript, nav, footer, header, svg, iframe';

@Injectable()
export class TextExtractor {
  async extract(page: Page): Promise<string> {
    return page.evaluate((selectors: string) => {
      if (!document.body) {
        return '';
      }

      const clone = document.body.cloneNode(true) as HTMLElement;
      const elementsToRemove = clone.querySelectorAll(selectors);
      for (let i = 0; i < elementsToRemove.length; i++) {
        elementsToRemove[i].remove();
      }

      return (clone.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40000);
    }, REMOVED_SELECTORS);
  }
}
