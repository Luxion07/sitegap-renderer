import { Test, TestingModule } from '@nestjs/testing';
import {
  BrowserContext,
  Frame,
  Request,
  Route,
  WebSocketRoute,
} from 'playwright';
import { GuardSession, RequestGuard } from './request-guard';
import { UrlSafetyService } from './url-safety.service';
import { BlockedUrlError } from './errors/blocked-url.error';
import { InvalidUrlError } from './errors/invalid-url.error';

describe('RequestGuard', () => {
  let guard: RequestGuard;
  let session: GuardSession;
  let mockSafetyService: { assertSafeUrl: jest.Mock };
  let routeMock: jest.Mock;
  let routeWebSocketMock: jest.Mock;
  let mockContext: BrowserContext;
  let routeHandler: (route: Route) => Promise<void> | void;
  let wsHandler: (ws: WebSocketRoute) => void;

  beforeEach(async () => {
    mockSafetyService = {
      assertSafeUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestGuard,
        {
          provide: UrlSafetyService,
          useValue: mockSafetyService,
        },
      ],
    }).compile();

    guard = module.get<RequestGuard>(RequestGuard);

    routeMock = jest.fn((_pattern: string, handler: (route: Route) => void) => {
      routeHandler = handler;
      return Promise.resolve();
    });

    routeWebSocketMock = jest.fn(
      (_pattern: string, handler: (ws: WebSocketRoute) => void) => {
        wsHandler = handler;
        return Promise.resolve();
      },
    );

    mockContext = {
      route: routeMock,
      routeWebSocket: routeWebSocketMock,
    } as unknown as BrowserContext;
  });

  it('installs route and routeWebSocket on BrowserContext', async () => {
    session = await guard.install(mockContext);

    expect(routeMock).toHaveBeenCalledWith('**/*', expect.any(Function));
    expect(routeWebSocketMock).toHaveBeenCalledWith(
      '**/*',
      expect.any(Function),
    );
  });

  it('immediately closes any incoming WebSocket connection', async () => {
    session = await guard.install(mockContext);

    const closeMock = jest.fn();
    const mockWs = { close: closeMock } as unknown as WebSocketRoute;
    wsHandler(mockWs);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  describe('resource type filtering', () => {
    beforeEach(async () => {
      session = await guard.install(mockContext);
    });

    it.each(['image', 'font', 'media'])(
      'aborts %s requests',
      async (resourceType) => {
        const abortMock = jest.fn().mockResolvedValue(undefined);
        const mockRoute = {
          request: () =>
            ({
              resourceType: () => resourceType,
              url: () => 'https://example.com/asset.png',
              isNavigationRequest: () => false,
            }) as unknown as Request,
          abort: abortMock,
        } as unknown as Route;

        await routeHandler(mockRoute);

        expect(abortMock).toHaveBeenCalledWith('blockedbyclient');
        expect(mockSafetyService.assertSafeUrl).not.toHaveBeenCalled();
      },
    );
  });

  describe('subresource requests', () => {
    beforeEach(async () => {
      session = await guard.install(mockContext);
    });

    it('allows safe subresources (e.g. script)', async () => {
      mockSafetyService.assertSafeUrl.mockResolvedValue({
        url: new URL('https://example.com/script.js'),
        ip: '93.184.216.34',
      });

      const mockResponse = {
        status: () => 200,
        headers: () => ({}),
      };

      const fulfillMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'script',
            url: () => 'https://example.com/script.js',
            isNavigationRequest: () => false,
            headers: () => ({}),
            method: () => 'GET',
            postDataBuffer: () => null,
          }) as unknown as Request,
        fetch: jest.fn().mockResolvedValue(mockResponse),
        fulfill: fulfillMock,
        abort: jest.fn().mockResolvedValue(undefined),
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(mockSafetyService.assertSafeUrl).toHaveBeenCalledWith(
        'https://example.com/script.js',
      );
      expect(fulfillMock).toHaveBeenCalledWith({ response: mockResponse });
      expect(session.getMainDocumentError()).toBeNull();
    });

    it('aborts blocked subresource without failing main document', async () => {
      mockSafetyService.assertSafeUrl.mockRejectedValue(new BlockedUrlError());

      const abortMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'script',
            url: () => 'http://127.0.0.1/evil.js',
            isNavigationRequest: () => false,
          }) as unknown as Request,
        abort: abortMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(abortMock).toHaveBeenCalledWith('blockedbyclient');
      expect(session.getMainDocumentError()).toBeNull();
    });

    it('aborts blocked iframe navigation without failing main document', async () => {
      mockSafetyService.assertSafeUrl.mockRejectedValue(new BlockedUrlError());

      const abortMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'http://127.0.0.1/evil-iframe',
            isNavigationRequest: () => true,
            frame: () =>
              ({
                parentFrame: () => ({}) as unknown as Frame,
              }) as unknown as Frame,
          }) as unknown as Request,
        abort: abortMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(abortMock).toHaveBeenCalledWith('blockedbyclient');
      expect(session.getMainDocumentError()).toBeNull();
    });
  });

  describe('main document navigation requests', () => {
    beforeEach(async () => {
      session = await guard.install(mockContext);
    });

    it('records BlockedUrlError when initial document URL is blocked', async () => {
      mockSafetyService.assertSafeUrl.mockRejectedValue(new BlockedUrlError());

      const abortMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'http://127.0.0.1:8080/admin',
            isNavigationRequest: () => true,
          }) as unknown as Request,
        abort: abortMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(abortMock).toHaveBeenCalledWith('blockedbyclient');
      expect(session.getMainDocumentError()).toBeInstanceOf(BlockedUrlError);
    });

    it('records InvalidUrlError when document URL is invalid', async () => {
      mockSafetyService.assertSafeUrl.mockRejectedValue(new InvalidUrlError());

      const abortMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'https://non-existent-domain-xyz.local',
            isNavigationRequest: () => true,
          }) as unknown as Request,
        abort: abortMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(abortMock).toHaveBeenCalledWith('blockedbyclient');
      expect(session.getMainDocumentError()).toBeInstanceOf(InvalidUrlError);
    });

    it('records BlockedUrlError when document redirects to a blocked URL', async () => {
      mockSafetyService.assertSafeUrl.mockImplementation(
        (targetUrl: string) => {
          if (targetUrl === 'https://example.com/start') {
            return Promise.resolve({
              url: new URL(targetUrl),
              ip: '93.184.216.34',
            });
          }
          return Promise.reject(new BlockedUrlError());
        },
      );

      const mockRedirectResponse = {
        status: () => 302,
        headers: () => ({
          location: 'http://169.254.169.254/latest/meta-data',
        }),
      };

      const abortMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'https://example.com/start',
            isNavigationRequest: () => true,
            headers: () => ({}),
            method: () => 'GET',
            postDataBuffer: () => null,
          }) as unknown as Request,
        fetch: jest.fn().mockResolvedValue(mockRedirectResponse),
        abort: abortMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(abortMock).toHaveBeenCalledWith('blockedbyclient');
      expect(session.getMainDocumentError()).toBeInstanceOf(BlockedUrlError);
    });

    it('sets redirect target and aborts with aborted when document redirect is safe', async () => {
      mockSafetyService.assertSafeUrl.mockResolvedValue({
        url: new URL('https://example.com/next'),
        ip: '93.184.216.34',
      });

      const mockRedirectResponse = {
        status: () => 302,
        headers: () => ({
          location: 'https://example.com/next',
        }),
      };

      const abortMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'https://example.com/start',
            isNavigationRequest: () => true,
            headers: () => ({}),
            method: () => 'GET',
            postDataBuffer: () => null,
          }) as unknown as Request,
        fetch: jest.fn().mockResolvedValue(mockRedirectResponse),
        abort: abortMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(abortMock).toHaveBeenCalledWith('aborted');
      expect(session.getRedirectTarget()).toBe('https://example.com/next');
      expect(session.getMainDocumentError()).toBeNull();
    });

    it('allows document navigation when final document is safe', async () => {
      mockSafetyService.assertSafeUrl.mockResolvedValue({
        url: new URL('https://example.com/final'),
        ip: '93.184.216.34',
      });

      const mockFinalResponse = {
        status: () => 200,
        headers: () => ({}),
      };

      const fulfillMock = jest.fn().mockResolvedValue(undefined);
      const mockRoute = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'https://example.com/final',
            isNavigationRequest: () => true,
            headers: () => ({}),
            method: () => 'GET',
            postDataBuffer: () => null,
          }) as unknown as Request,
        fetch: jest.fn().mockResolvedValue(mockFinalResponse),
        fulfill: fulfillMock,
      } as unknown as Route;

      await routeHandler(mockRoute);

      expect(fulfillMock).toHaveBeenCalledWith({
        response: mockFinalResponse,
      });
      expect(session.getMainDocumentError()).toBeNull();
    });

    it('isolates state across concurrent sessions', async () => {
      let routeHandler1!: (route: Route) => Promise<void>;
      let routeHandler2!: (route: Route) => Promise<void>;

      const context1 = {
        route: jest.fn((_p: string, h: (route: Route) => Promise<void>) => {
          routeHandler1 = h;
          return Promise.resolve();
        }),
        routeWebSocket: jest.fn().mockResolvedValue(undefined),
      } as unknown as BrowserContext;

      const context2 = {
        route: jest.fn((_p: string, h: (route: Route) => Promise<void>) => {
          routeHandler2 = h;
          return Promise.resolve();
        }),
        routeWebSocket: jest.fn().mockResolvedValue(undefined),
      } as unknown as BrowserContext;

      const session1 = await guard.install(context1);
      const session2 = await guard.install(context2);

      mockSafetyService.assertSafeUrl.mockImplementation((url: string) => {
        if (url.includes('evil')) {
          return Promise.reject(new BlockedUrlError());
        }
        return Promise.resolve({ url: new URL(url), ip: '93.184.216.34' });
      });

      // Context 1 triggers blocked URL
      const route1 = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'http://127.0.0.1/evil',
            isNavigationRequest: () => true,
          }) as unknown as Request,
        abort: jest.fn().mockResolvedValue(undefined),
      } as unknown as Route;
      await routeHandler1(route1);

      // Context 2 triggers safe URL
      const route2 = {
        request: () =>
          ({
            resourceType: () => 'document',
            url: () => 'https://example.com/safe',
            isNavigationRequest: () => true,
            headers: () => ({}),
            method: () => 'GET',
            postDataBuffer: () => null,
          }) as unknown as Request,
        fetch: jest.fn().mockResolvedValue({
          status: () => 200,
          headers: () => ({}),
        }),
        fulfill: jest.fn().mockResolvedValue(undefined),
      } as unknown as Route;
      await routeHandler2(route2);

      expect(session1.getMainDocumentError()).toBeInstanceOf(BlockedUrlError);
      expect(session2.getMainDocumentError()).toBeNull();
      expect(session2.getMainDocumentFinalUrl()).toBe(
        'https://example.com/safe',
      );
    });
  });
});
