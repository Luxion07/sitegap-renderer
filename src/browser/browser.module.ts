import { Module } from '@nestjs/common';
import { BrowserService } from './browser.service';
import { SlotLimiter } from './slot-limiter';
import { validateEnv } from '../config/env.validation';

@Module({
  providers: [
    BrowserService,
    {
      provide: SlotLimiter,
      useFactory: () => {
        const env = validateEnv(process.env);
        return new SlotLimiter(env.RENDERER_SLOTS);
      },
    },
  ],
  exports: [BrowserService, SlotLimiter],
})
export class BrowserModule {}
