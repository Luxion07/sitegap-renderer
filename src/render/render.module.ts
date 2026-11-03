import { Module } from '@nestjs/common';
import { BrowserModule } from '../browser/browser.module';
import { SafetyModule } from '../safety/safety.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';

@Module({
  imports: [BrowserModule, SafetyModule, ExtractionModule],
  controllers: [RenderController],
  providers: [RenderService],
  exports: [RenderService],
})
export class RenderModule {}
