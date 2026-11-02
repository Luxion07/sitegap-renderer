import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  const env = validateEnv(process.env);
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
        url: env.RENDERER_ADDRESS,
      },
    },
  );

  app.enableShutdownHooks();
  await app.listen();
}

void bootstrap();
