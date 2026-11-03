export interface DnsResolver {
  resolve(hostname: string): Promise<string[]>;
}

export const DNS_RESOLVER = Symbol('DNS_RESOLVER');
