import { Module } from '@nestjs/common';
import { RenderController } from './render/render.controller';
import { BrowserModule } from './browser/browser.module';

@Module({
  imports: [BrowserModule],
  controllers: [RenderController],
  providers: [],
})
export class AppModule {}
