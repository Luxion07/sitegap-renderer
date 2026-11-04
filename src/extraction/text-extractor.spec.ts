import { Page } from 'playwright';
import {
  TextExtractor,
  MAX_EXTRACTED_CHARS,
  REMOVED_SELECTORS,
} from './text-extractor';

describe('TextExtractor', () => {
  let extractor: TextExtractor;

  beforeEach(() => {
    extractor = new TextExtractor();
  });

  it('defines MAX_EXTRACTED_CHARS as 40000', () => {
    expect(MAX_EXTRACTED_CHARS).toBe(40000);
  });

  it('defines REMOVED_SELECTORS matching basic-scraper', () => {
    expect(REMOVED_SELECTORS).toBe(
      'script, style, noscript, nav, footer, header, svg, iframe',
    );
  });

  it('calls page.evaluate and returns extracted text', async () => {
    const evaluateMock = jest.fn().mockResolvedValue('Hello SiteGap');
    const mockPage = {
      evaluate: evaluateMock,
    } as unknown as Page;

    const result = await extractor.extract(mockPage);

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('Hello SiteGap');
  });

  it('passes REMOVED_SELECTORS to page.evaluate', async () => {
    const evaluateMock = jest.fn().mockResolvedValue('text');
    const mockPage = {
      evaluate: evaluateMock,
    } as unknown as Page;

    await extractor.extract(mockPage);

    expect(evaluateMock).toHaveBeenCalledWith(
      expect.any(Function),
      REMOVED_SELECTORS,
    );
  });

  describe('DOM evaluation callback logic', () => {
    let capturedCallback: (selectors: string) => string;

    beforeEach(async () => {
      const evaluateMock = jest.fn(
        (fn: (selectors: string) => string): Promise<string> => {
          capturedCallback = fn;
          return Promise.resolve('');
        },
      );
      const mockPage = {
        evaluate: evaluateMock,
      } as unknown as Page;

      await extractor.extract(mockPage);
    });

    it('returns empty string if document.body is null', () => {
      const originalDoc = globalThis.document;
      try {
        globalThis.document = { body: null } as unknown as Document;
        expect(capturedCallback(REMOVED_SELECTORS)).toBe('');
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it('removes target elements and collapses whitespace', () => {
      const originalDoc = globalThis.document;
      try {
        const removeMock = jest.fn();
        const mockClone = {
          querySelectorAll: jest.fn().mockReturnValue([{ remove: removeMock }]),
          textContent: '  Hello \n\n world!   Multiple   spaces.  ',
        };
        const mockBody = {
          cloneNode: jest.fn().mockReturnValue(mockClone),
        };
        globalThis.document = { body: mockBody } as unknown as Document;

        const result = capturedCallback(REMOVED_SELECTORS);

        expect(mockClone.querySelectorAll).toHaveBeenCalledWith(
          REMOVED_SELECTORS,
        );
        expect(removeMock).toHaveBeenCalledTimes(1);
        expect(result).toBe('Hello world! Multiple spaces.');
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it('caps extracted text at 40,000 characters', () => {
      const originalDoc = globalThis.document;
      try {
        const longText = 'a'.repeat(50000);
        const mockClone = {
          querySelectorAll: jest.fn().mockReturnValue([]),
          textContent: longText,
        };
        const mockBody = {
          cloneNode: jest.fn().mockReturnValue(mockClone),
        };
        globalThis.document = { body: mockBody } as unknown as Document;

        const result = capturedCallback(REMOVED_SELECTORS);

        expect(result.length).toBe(40000);
        expect(result).toBe('a'.repeat(40000));
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });
});
