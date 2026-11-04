import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { HealthController } from './health.controller';
import { BrowserService } from '../browser/browser.service';
import { HealthCheckResponse_ServingStatus } from '../proto/grpc/health/v1/health';

describe('HealthController', () => {
  let controller: HealthController;
  let mockBrowserService: { isConnected: boolean };

  beforeEach(async () => {
    mockBrowserService = {
      isConnected: true,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: BrowserService,
          useValue: mockBrowserService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Check', () => {
    it('returns SERVING for empty service string when browser is connected', () => {
      mockBrowserService.isConnected = true;
      const response = controller.check({ service: '' });
      expect(response.status).toBe(HealthCheckResponse_ServingStatus.SERVING);
    });

    it('returns SERVING for sitegap.renderer.v1.Renderer when browser is connected', () => {
      mockBrowserService.isConnected = true;
      const response = controller.check({
        service: 'sitegap.renderer.v1.Renderer',
      });
      expect(response.status).toBe(HealthCheckResponse_ServingStatus.SERVING);
    });

    it('returns NOT_SERVING for overall server when browser is disconnected', () => {
      mockBrowserService.isConnected = false;
      const response = controller.check({ service: '' });
      expect(response.status).toBe(
        HealthCheckResponse_ServingStatus.NOT_SERVING,
      );
    });

    it('returns NOT_SERVING for sitegap.renderer.v1.Renderer when browser is disconnected', () => {
      mockBrowserService.isConnected = false;
      const response = controller.check({
        service: 'sitegap.renderer.v1.Renderer',
      });
      expect(response.status).toBe(
        HealthCheckResponse_ServingStatus.NOT_SERVING,
      );
    });

    it('returns SERVICE_UNKNOWN for unknown service name', () => {
      mockBrowserService.isConnected = true;
      const response = controller.check({ service: 'unknown.Service' });
      expect(response.status).toBe(
        HealthCheckResponse_ServingStatus.SERVICE_UNKNOWN,
      );
    });
  });

  describe('Watch', () => {
    it('emits current status in observable stream', async () => {
      mockBrowserService.isConnected = true;
      const stream = controller.watch({ service: '' });
      const response = await firstValueFrom(stream);
      expect(response.status).toBe(HealthCheckResponse_ServingStatus.SERVING);
    });
  });
});
