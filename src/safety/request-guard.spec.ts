import { Test, TestingModule } from '@nestjs/testing';
import { BrowserContext, Request, Route, WebSocketRoute } from 'playwright';
import { RequestGuard } from './request-guard';
import { UrlSafetyService } from './url-safety.service';
import { BlockedUrlError } from './errors/blocked-url.error';
import { InvalidUrlError } from './errors/invalid-url.error';

describe('RequestGuard', () => {
  let guard: RequestGuard;
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
    await guard.install(mockContext);

    expect(routeMock).toHaveBeenCalledWith('**/*', expect.any(Function));
    expect(routeWebSocketMock).toHaveBeenCalledWith(
      '**/*',
      expect.any(Function),
    );
  });

  it('immediately closes any incoming WebSocket connection', async () => {
    await guard.install(mockContext);

    const closeMock = jest.fn();
    const mockWs = { close: closeMock } as unknown as WebSocketRoute;
    wsHandler(mockWs);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  describe('resource type filtering', () => {
    beforeEach(async () => {
      await guard.install(mockContext);
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
      await guard.install(mockContext);
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
      expect(guard.getMainDocumentError()).toBeNull();
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
      expect(guard.getMainDocumentError()).toBeNull();
    });
  });

  describe('main document navigation requests', () => {
    beforeEach(async () => {
      await guard.install(mockContext);
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
      expect(guard.getMainDocumentError()).toBeInstanceOf(BlockedUrlError);
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
      expect(guard.getMainDocumentError()).toBeInstanceOf(InvalidUrlError);
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
      expect(guard.getMainDocumentError()).toBeInstanceOf(BlockedUrlError);
    });

    it('allows document navigation when redirect chain is fully safe', async () => {
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
            url: () => 'https://example.com/start',
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
      expect(guard.getMainDocumentError()).toBeNull();
    });
  });
});
