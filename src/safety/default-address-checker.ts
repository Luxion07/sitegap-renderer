import { Injectable } from '@nestjs/common';
import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { AddressChecker } from './address-checker.interface';

@Injectable()
export class DefaultAddressChecker implements AddressChecker {
  private readonly blockList: BlockList;

  constructor() {
    this.blockList = new BlockList();

    this.blockList.addSubnet('0.0.0.0', 8, 'ipv4');
    this.blockList.addSubnet('10.0.0.0', 8, 'ipv4');
    this.blockList.addSubnet('127.0.0.0', 8, 'ipv4');
    this.blockList.addSubnet('169.254.0.0', 16, 'ipv4');
    this.blockList.addSubnet('172.16.0.0', 12, 'ipv4');
    this.blockList.addSubnet('192.168.0.0', 16, 'ipv4');

    this.blockList.addAddress('::1', 'ipv6');
    this.blockList.addAddress('::', 'ipv6');
    this.blockList.addSubnet('fe80::', 10, 'ipv6');
    this.blockList.addSubnet('fc00::', 7, 'ipv6');
  }

  isBlocked(ip: string, _port?: number): boolean {
    const unwrapped = this.unwrap(ip);
    if (!unwrapped) {
      return true;
    }

    return this.blockList.check(unwrapped.address, unwrapped.type);
  }

  private unwrap(
    raw: string,
  ): { address: string; type: 'ipv4' | 'ipv6' } | null {
    if (!raw) {
      return null;
    }

    const cleaned = raw
      .trim()
      .replace(/^\[|\]$/g, '')
      .toLowerCase();

    const dottedMatch = cleaned.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dottedMatch) {
      const ipv4 = dottedMatch[1];
      if (isIPv4(ipv4)) {
        return { address: ipv4, type: 'ipv4' };
      }
      return null;
    }

    const hexMatch = cleaned.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const high = parseInt(hexMatch[1], 16);
      const low = parseInt(hexMatch[2], 16);
      const b1 = (high >> 8) & 0xff;
      const b2 = high & 0xff;
      const b3 = (low >> 8) & 0xff;
      const b4 = low & 0xff;
      const ipv4 = `${b1}.${b2}.${b3}.${b4}`;
      if (isIPv4(ipv4)) {
        return { address: ipv4, type: 'ipv4' };
      }
      return null;
    }

    if (isIPv4(cleaned)) {
      return { address: cleaned, type: 'ipv4' };
    }

    if (isIPv6(cleaned)) {
      return { address: cleaned, type: 'ipv6' };
    }

    return null;
  }
}
