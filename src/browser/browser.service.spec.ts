import { Browser } from 'playwright';
import { BrowserService } from './browser.service';
import { BrowserUnavailableError } from './errors/browser-unavailable.error';

describe('BrowserService', () => {
  let service: BrowserService;
  let mockContext: { close: jest.Mock };
  let mockBrowser: { isConnected: jest.Mock; newContext: jest.Mock };

  beforeEach(() => {
    service = new BrowserService();

    mockContext = {
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockBrowser = {
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue(mockContext),
    };
  });

  it('should throw BrowserUnavailableError when browser is not launched', async () => {
    await expect(
      service.withContext(() => Promise.resolve('ok')),
    ).rejects.toThrow(BrowserUnavailableError);
  });

  it('should close context in finally even if action throws an error', async () => {
    (service as unknown as { browser: Browser }).browser =
      mockBrowser as unknown as Browser;

    const actionWithError = () =>
      Promise.reject(new Error('Render crashed unexpectedly'));

    await expect(service.withContext(actionWithError)).rejects.toThrow(
      'Render crashed unexpectedly',
    );
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });

  it('should create context with serviceWorkers blocked for security', async () => {
    (service as unknown as { browser: Browser }).browser =
      mockBrowser as unknown as Browser;

    await service.withContext(() => Promise.resolve('ok'));

    expect(mockBrowser.newContext).toHaveBeenCalledWith({
      serviceWorkers: 'block',
    });
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });
});
