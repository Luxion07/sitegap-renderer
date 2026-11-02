import { INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import {
  RenderRequest,
  RenderResponse,
} from '../src/proto/sitegap/renderer/v1/renderer';

interface GrpcRendererClient extends grpc.Client {
  render(
    request: RenderRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: RenderResponse,
    ) => void,
  ): void;
}

type ClientConstructor = new (
  url: string,
  creds: grpc.ChannelCredentials,
) => GrpcRendererClient;

interface GrpcPackageRoot {
  sitegap: {
    renderer: {
      v1: {
        Renderer: ClientConstructor;
      };
    };
  };
}

describe('Renderer gRPC e2e', () => {
  let serverApp: INestMicroservice;
  let grpcClient: GrpcRendererClient;

  const TEST_PORT = 50059;
  const TEST_SERVER_URL = `0.0.0.0:${TEST_PORT}`;
  const PROTO_FILE_PATH = join(
    process.cwd(),
    'proto/sitegap/renderer/v1/renderer.proto',
  );

  beforeAll(async () => {
    const testModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    serverApp = testModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'sitegap.renderer.v1',
        protoPath: PROTO_FILE_PATH,
        url: TEST_SERVER_URL,
      },
    });

    await serverApp.init();
    await serverApp.listen();

    const loadedProtoDefinition = protoLoader.loadSync(PROTO_FILE_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const grpcPackage = grpc.loadPackageDefinition(
      loadedProtoDefinition,
    ) as unknown as GrpcPackageRoot;

    const RendererClientConstructor = grpcPackage.sitegap.renderer.v1.Renderer;
    grpcClient = new RendererClientConstructor(
      `localhost:${TEST_PORT}`,
      grpc.credentials.createInsecure(),
    );
  });

  afterAll(async () => {
    grpcClient?.close();
    await serverApp?.close();
  });

  function sendRenderRequest(
    requestData: RenderRequest,
  ): Promise<RenderResponse> {
    return new Promise((resolve, reject) => {
      grpcClient.render(requestData, (grpcError, response) => {
        if (grpcError) {
          return reject(grpcError);
        }
        resolve(response);
      });
    });
  }

  it('should return UNIMPLEMENTED status when URL is valid', async () => {
    const validRequest: RenderRequest = { url: 'https://example.com' };

    await expect(sendRenderRequest(validRequest)).rejects.toMatchObject({
      code: grpc.status.UNIMPLEMENTED,
      details: 'Render is not implemented yet',
    });
  });

  it('should return INVALID_ARGUMENT status when URL is invalid', async () => {
    const invalidRequest: RenderRequest = { url: 'not-a-valid-url' };

    await expect(sendRenderRequest(invalidRequest)).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
  });
});
