import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable, of } from 'rxjs';
import { BrowserService } from '../browser/browser.service';
import {
  HealthCheckRequest,
  HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
  HealthController as IHealthController,
} from '../proto/grpc/health/v1/health';

const SUPPORTED_SERVICES = new Set(['', 'sitegap.renderer.v1.Renderer']);

@Controller()
export class HealthController implements IHealthController {
  constructor(private readonly browserService: BrowserService) {}

  @GrpcMethod('Health', 'Check')
  check(request: HealthCheckRequest): HealthCheckResponse {
    const serviceName = request?.service ?? '';
    if (!SUPPORTED_SERVICES.has(serviceName)) {
      return { status: HealthCheckResponse_ServingStatus.SERVICE_UNKNOWN };
    }

    const isServing = this.browserService.isConnected;
    return {
      status: isServing
        ? HealthCheckResponse_ServingStatus.SERVING
        : HealthCheckResponse_ServingStatus.NOT_SERVING,
    };
  }

  @GrpcMethod('Health', 'Watch')
  watch(request: HealthCheckRequest): Observable<HealthCheckResponse> {
    return of(this.check(request));
  }
}
