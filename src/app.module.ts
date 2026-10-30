import { Module } from '@nestjs/common';
import { RenderController } from './render/render.controller';

@Module({
  imports: [],
  controllers: [RenderController],
  providers: [],
})
export class AppModule {}
