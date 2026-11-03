import { Module } from '@nestjs/common';
import { RenderController } from './render/render.controller';
import { BrowserModule } from './browser/browser.module';
import { SafetyModule } from './safety/safety.module';

@Module({
  imports: [BrowserModule, SafetyModule],
  controllers: [RenderController],
  providers: [],
})
export class AppModule {}
