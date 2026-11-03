import { Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { DnsResolver } from './dns-resolver.interface';

@Injectable()
export class NodeDnsResolver implements DnsResolver {
  async resolve(hostname: string): Promise<string[]> {
    const addresses = await dns.lookup(hostname, { all: true });
    return addresses.map((entry) => entry.address);
  }
}
