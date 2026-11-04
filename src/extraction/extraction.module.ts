import { Module } from '@nestjs/common';
import { TextExtractor } from './text-extractor';

@Module({
  providers: [TextExtractor],
  exports: [TextExtractor],
})
export class ExtractionModule {}
