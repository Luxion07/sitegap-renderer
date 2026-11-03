import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { ADDRESS_CHECKER, AddressChecker } from './address-checker.interface';
import { DNS_RESOLVER, DnsResolver } from './dns-resolver.interface';
import { InvalidUrlError } from './errors/invalid-url.error';
import { BlockedUrlError } from './errors/blocked-url.error';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

@Injectable()
export class UrlSafetyService {
  constructor(
    @Inject(ADDRESS_CHECKER)
    private readonly addressChecker: AddressChecker,
    @Inject(DNS_RESOLVER)
    private readonly dnsResolver: DnsResolver,
  ) {}

  async assertSafeUrl(rawUrl: string): Promise<{ url: URL; ip: string }> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new InvalidUrlError();
    }

    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      throw new BlockedUrlError();
    }

    const port = url.port ? parseInt(url.port, 10) : undefined;
    const hostname = url.hostname;

    const unbracketed = hostname.replace(/^\[|\]$/g, '');
    if (isIP(unbracketed) || unbracketed.startsWith('::ffff:')) {
      if (this.addressChecker.isBlocked(hostname, port)) {
        throw new BlockedUrlError();
      }
      return { url, ip: unbracketed };
    }

    let addresses: string[];
    try {
      addresses = await this.dnsResolver.resolve(hostname);
    } catch {
      throw new InvalidUrlError();
    }

    if (!addresses || addresses.length === 0) {
      throw new InvalidUrlError();
    }

    if (addresses.some((addr) => this.addressChecker.isBlocked(addr, port))) {
      throw new BlockedUrlError();
    }

    return { url, ip: addresses[0] };
  }
}
