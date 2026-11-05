import { Test, TestingModule } from '@nestjs/testing';
import { RenderService } from './render.service';
import { SlotLimiter } from '../browser/slot-limiter';
import { BrowserService } from '../browser/browser.service';
import { RequestGuard } from '../safety/request-guard';
import { TextExtractor } from '../extraction/text-extractor';
import { SlotsBusyError } from './errors/slots-busy.error';
import { RenderTimeoutError } from './errors/render-timeout.error';
import { BlockedUrlError } from '../safety/errors/blocked-url.error';

describe('RenderService', () => {
  let service: RenderService;
  let slotLimiter: SlotLimiter;
  let mockBrowserService: { withContext: jest.Mock };
  let mockGuardSession: {
    getMainDocumentError: jest.Mock;
    getMainDocumentFinalUrl: jest.Mock;
    consumeRedirectTarget: jest.Mock;
  };
  let mockRequestGuard: {
    install: jest.Mock;
  };
  let mockTextExtractor: { extract: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    slotLimiter = new SlotLimiter(1);

    mockBrowserService = {
      withContext: jest.fn(),
    };

    mockGuardSession = {
      getMainDocumentError: jest.fn().mockReturnValue(null),
      getMainDocumentFinalUrl: jest.fn().mockReturnValue(null),
      consumeRedirectTarget: jest.fn().mockReturnValue(null),
    };

    mockRequestGuard = {
      install: jest.fn().mockResolvedValue(mockGuardSession),
    };

    mockTextExtractor = {
      extract: jest.fn().mockResolvedValue('Hello World'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenderService,
        { provide: SlotLimiter, useValue: slotLimiter },
        { provide: BrowserService, useValue: mockBrowserService },
        { provide: RequestGuard, useValue: mockRequestGuard },
        { provide: TextExtractor, useValue: mockTextExtractor },
      ],
    }).compile();

    service = module.get<RenderService>(RenderService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Bounded Concurrency', () => {
    it('rejects immediately with SlotsBusyError when no slots are available', async () => {
      slotLimiter.acquire();

      await expect(service.render('https://example.com')).rejects.toThrow(
        SlotsBusyError,
      );

      expect(mockBrowserService.withContext).not.toHaveBeenCalled();
    });
  });

  describe('Happy path rendering', () => {
    it('opens context, installs guard, navigates, extracts text, and releases slot', async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        url: jest.fn().mockReturnValue('https://example.com/final'),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
      };

      mockBrowserService.withContext.mockImplementation(
        async (callback: (ctx: unknown) => Promise<unknown>) => {
          return callback(mockContext);
        },
      );

      mockTextExtractor.extract.mockResolvedValue('Welcome to SiteGap');

      const result = await service.render('https://example.com/start');

      expect(mockBrowserService.withContext).toHaveBeenCalledTimes(1);
      expect(mockRequestGuard.install).toHaveBeenCalledWith(mockContext);
      expect(mockContext.newPage).toHaveBeenCalledTimes(1);
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/start', {
        waitUntil: 'load',
        timeout: 20000,
      });
      expect(mockTextExtractor.extract).toHaveBeenCalledWith(mockPage);
      expect(result).toEqual({
        text: 'Welcome to SiteGap',
        finalUrl: 'https://example.com/final',
      });
      expect(slotLimiter.active).toBe(0);
    });

    it('follows redirects using page.goto loop and returns final redirected URL', async () => {
      let gotoCalls = 0;
      const mockPage = {
        goto: jest.fn().mockImplementation((targetUrl: string) => {
          gotoCalls++;
          if (gotoCalls === 1) {
            mockGuardSession.consumeRedirectTarget.mockReturnValueOnce(
              'https://example.com/redirect-target',
            );
            return Promise.reject(new Error('page.goto: net::ERR_ABORTED'));
          }
          mockPage.url.mockReturnValue(targetUrl);
          return Promise.resolve();
        }),
        url: jest.fn().mockReturnValue('https://example.com/redirect-target'),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
      };

      mockBrowserService.withContext.mockImplementation(
        async (callback: (ctx: unknown) => Promise<unknown>) => {
          return callback(mockContext);
        },
      );

      const result = await service.render('https://example.com/start');

      expect(mockPage.goto).toHaveBeenCalledTimes(2);
      expect(mockPage.goto).toHaveBeenNthCalledWith(
        1,
        'https://example.com/start',
        expect.any(Object),
      );
      expect(mockPage.goto).toHaveBeenNthCalledWith(
        2,
        'https://example.com/redirect-target',
        expect.any(Object),
      );
      expect(result.finalUrl).toBe('https://example.com/redirect-target');
    });
  });

  describe('Deadline and timeouts', () => {
    it('respects caller deadline when smaller than maxRenderMs', async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        url: jest.fn().mockReturnValue('https://example.com'),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
      };

      mockBrowserService.withContext.mockImplementation(
        async (callback: (ctx: unknown) => Promise<unknown>) => {
          return callback(mockContext);
        },
      );

      await service.render('https://example.com', 5000);

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'load',
        timeout: 5000,
      });
      expect(slotLimiter.active).toBe(0);
    });

    it('caps caller deadline at maxRenderMs when caller deadline is larger', async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        url: jest.fn().mockReturnValue('https://example.com'),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
      };

      mockBrowserService.withContext.mockImplementation(
        async (callback: (ctx: unknown) => Promise<unknown>) => {
          return callback(mockContext);
        },
      );

      await service.render('https://example.com', 45000);

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'load',
        timeout: 20000,
      });
      expect(slotLimiter.active).toBe(0);
    });

    it('throws RenderTimeoutError when page navigation exceeds timeout and releases slot', async () => {
      const timeoutError = new Error('Timeout 20000ms exceeded.');
      timeoutError.name = 'TimeoutError';

      const mockPage = {
        goto: jest.fn().mockRejectedValue(timeoutError),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
      };

      mockBrowserService.withContext.mockImplementation(
        async (callback: (ctx: unknown) => Promise<unknown>) => {
          return callback(mockContext);
        },
      );

      await expect(service.render('https://example.com')).rejects.toThrow(
        RenderTimeoutError,
      );
      expect(slotLimiter.active).toBe(0);
    });
  });

  describe('SSRF Guard errors', () => {
    it('throws BlockedUrlError when main document is blocked and releases slot', async () => {
      const blockedError = new BlockedUrlError();
      mockGuardSession.getMainDocumentError.mockReturnValue(blockedError);

      const navError = new Error('net::ERR_BLOCKED_BY_CLIENT');
      const mockPage = {
        goto: jest.fn().mockRejectedValue(navError),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
      };

      mockBrowserService.withContext.mockImplementation(
        async (callback: (ctx: unknown) => Promise<unknown>) => {
          return callback(mockContext);
        },
      );

      await expect(service.render('https://example.com')).rejects.toThrow(
        BlockedUrlError,
      );
      expect(slotLimiter.active).toBe(0);
    });
  });
});
