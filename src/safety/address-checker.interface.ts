export interface AddressChecker {
  isBlocked(ip: string, port?: number): boolean;
}

export const ADDRESS_CHECKER = Symbol('ADDRESS_CHECKER');
