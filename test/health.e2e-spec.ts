import { INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { BrowserService } from '../src/browser/browser.service';
import {
  HealthCheckRequest,
  HealthCheckResponse_ServingStatus,
} from '../src/proto/grpc/health/v1/health';

interface GrpcHealthClient extends grpc.Client {
  check(
    request: HealthCheckRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: { status: string | number },
    ) => void,
  ): void;
}

type ClientConstructor = new (
  url: string,
  creds: grpc.ChannelCredentials,
) => GrpcHealthClient;

interface GrpcPackageRoot {
  grpc: {
    health: {
      v1: {
        Health: ClientConstructor;
      };
    };
  };
}

describe('Health gRPC e2e', () => {
  let serverApp: INestMicroservice;
  let healthClient: GrpcHealthClient;
  let browserService: BrowserService;

  const TEST_PORT = 50058;
  const TEST_SERVER_URL = `0.0.0.0:${TEST_PORT}`;
  const HEALTH_PROTO_PATH = join(
    process.cwd(),
    'proto/grpc/health/v1/health.proto',
  );

  beforeAll(async () => {
    const testModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    browserService = testModule.get<BrowserService>(BrowserService);

    serverApp = testModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'grpc.health.v1',
        protoPath: HEALTH_PROTO_PATH,
        url: TEST_SERVER_URL,
      },
    });

    await serverApp.init();
    await serverApp.listen();

    const loadedProtoDefinition = protoLoader.loadSync(HEALTH_PROTO_PATH, {
      keepCase: true,
      longs: String,
      defaults: true,
      oneofs: true,
    });

    const grpcPackage = grpc.loadPackageDefinition(
      loadedProtoDefinition,
    ) as unknown as GrpcPackageRoot;

    const HealthClientConstructor = grpcPackage.grpc.health.v1.Health;
    healthClient = new HealthClientConstructor(
      `localhost:${TEST_PORT}`,
      grpc.credentials.createInsecure(),
    );
  });

  afterAll(async () => {
    healthClient?.close();
    await serverApp?.close();
  });

  function sendCheckRequest(
    request: HealthCheckRequest,
  ): Promise<{ status: string | number }> {
    return new Promise((resolve, reject) => {
      healthClient.check(request, (error, response) => {
        if (error) {
          return reject(error);
        }
        resolve(response);
      });
    });
  }

  it('returns SERVING for empty service when browser is active', async () => {
    const response = await sendCheckRequest({ service: '' });
    expect(
      response.status === HealthCheckResponse_ServingStatus.SERVING ||
        response.status === 'SERVING',
    ).toBe(true);
  });

  it('returns SERVING for sitegap.renderer.v1.Renderer when browser is active', async () => {
    const response = await sendCheckRequest({
      service: 'sitegap.renderer.v1.Renderer',
    });
    expect(
      response.status === HealthCheckResponse_ServingStatus.SERVING ||
        response.status === 'SERVING',
    ).toBe(true);
  });

  it('returns SERVICE_UNKNOWN for unknown service name', async () => {
    const response = await sendCheckRequest({
      service: 'nonexistent.Service',
    });
    expect(
      response.status === HealthCheckResponse_ServingStatus.SERVICE_UNKNOWN ||
        response.status === 'SERVICE_UNKNOWN',
    ).toBe(true);
  });

  it('returns NOT_SERVING after browser is disconnected', async () => {
    // Simulate browser shutdown
    await browserService.onApplicationShutdown();

    const response = await sendCheckRequest({ service: '' });
    expect(
      response.status === HealthCheckResponse_ServingStatus.NOT_SERVING ||
        response.status === 'NOT_SERVING',
    ).toBe(true);
  });
});
