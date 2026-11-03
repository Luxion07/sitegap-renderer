import { Module } from '@nestjs/common';
import { ADDRESS_CHECKER } from './address-checker.interface';
import { DefaultAddressChecker } from './default-address-checker';
import { DNS_RESOLVER } from './dns-resolver.interface';
import { NodeDnsResolver } from './node-dns-resolver';
import { UrlSafetyService } from './url-safety.service';

@Module({
  providers: [
    UrlSafetyService,
    {
      provide: ADDRESS_CHECKER,
      useClass: DefaultAddressChecker,
    },
    {
      provide: DNS_RESOLVER,
      useClass: NodeDnsResolver,
    },
  ],
  exports: [UrlSafetyService, ADDRESS_CHECKER, DNS_RESOLVER],
})
export class SafetyModule {}
