import { Module } from '@nestjs/common';
import { BrowserModule } from './browser/browser.module';
import { SafetyModule } from './safety/safety.module';
import { ExtractionModule } from './extraction/extraction.module';
import { RenderModule } from './render/render.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    BrowserModule,
    SafetyModule,
    ExtractionModule,
    RenderModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
