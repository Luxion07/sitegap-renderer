import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'sitegap.renderer.v1',
        protoPath: join(
          process.cwd(),
          'proto/sitegap/renderer/v1/renderer.proto',
        ),
        url: '0.0.0.0:50051',
      },
    },
  );

  app.enableShutdownHooks();
  await app.listen();
}

void bootstrap();
