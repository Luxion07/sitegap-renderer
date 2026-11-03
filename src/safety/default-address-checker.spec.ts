import { DefaultAddressChecker } from './default-address-checker';

describe('DefaultAddressChecker', () => {
  let checker: DefaultAddressChecker;

  beforeEach(() => {
    checker = new DefaultAddressChecker();
  });

  describe('IPv4 public addresses', () => {
    it('allows public IPv4 addresses', () => {
      expect(checker.isBlocked('93.184.216.34')).toBe(false);
      expect(checker.isBlocked('1.1.1.1')).toBe(false);
      expect(checker.isBlocked('8.8.8.8')).toBe(false);
      expect(checker.isBlocked('172.32.0.1')).toBe(false);
      expect(checker.isBlocked('192.169.0.1')).toBe(false);
    });
  });

  describe('IPv4 blocked ranges', () => {
    it('blocks loopback (127.0.0.0/8)', () => {
      expect(checker.isBlocked('127.0.0.1')).toBe(true);
      expect(checker.isBlocked('127.0.0.2')).toBe(true);
      expect(checker.isBlocked('127.255.255.255')).toBe(true);
    });

    it('blocks "this network" (0.0.0.0/8)', () => {
      expect(checker.isBlocked('0.0.0.0')).toBe(true);
      expect(checker.isBlocked('0.255.255.255')).toBe(true);
    });

    it('blocks private 10.0.0.0/8', () => {
      expect(checker.isBlocked('10.0.0.1')).toBe(true);
      expect(checker.isBlocked('10.255.255.255')).toBe(true);
    });

    it('blocks cloud metadata and link-local (169.254.0.0/16)', () => {
      expect(checker.isBlocked('169.254.169.254')).toBe(true);
      expect(checker.isBlocked('169.254.0.1')).toBe(true);
      expect(checker.isBlocked('169.254.255.255')).toBe(true);
    });

    it('blocks private 172.16.0.0/12', () => {
      expect(checker.isBlocked('172.16.0.1')).toBe(true);
      expect(checker.isBlocked('172.20.5.5')).toBe(true);
      expect(checker.isBlocked('172.31.255.255')).toBe(true);
    });

    it('blocks private 192.168.0.0/16', () => {
      expect(checker.isBlocked('192.168.0.1')).toBe(true);
      expect(checker.isBlocked('192.168.1.1')).toBe(true);
      expect(checker.isBlocked('192.168.255.255')).toBe(true);
    });
  });

  describe('IPv6 addresses', () => {
    it('blocks loopback ::1 and bracketed [::1]', () => {
      expect(checker.isBlocked('::1')).toBe(true);
      expect(checker.isBlocked('[::1]')).toBe(true);
    });

    it('blocks unspecified address :: and [::]', () => {
      expect(checker.isBlocked('::')).toBe(true);
      expect(checker.isBlocked('[::]')).toBe(true);
    });

    it('blocks unique-local fc00::/7 (fc00:: and fd00::)', () => {
      expect(checker.isBlocked('fc00::1')).toBe(true);
      expect(checker.isBlocked('[fc00::1]')).toBe(true);
      expect(checker.isBlocked('fd12:3456::1')).toBe(true);
      expect(checker.isBlocked('[fd12:3456::1]')).toBe(true);
    });

    it('blocks link-local fe80::/10', () => {
      expect(checker.isBlocked('fe80::1')).toBe(true);
      expect(checker.isBlocked('[fe80::1]')).toBe(true);
    });

    it('allows public IPv6 addresses', () => {
      expect(checker.isBlocked('2606:4700:4700::1111')).toBe(false);
      expect(checker.isBlocked('[2606:4700:4700::1111]')).toBe(false);
    });
  });

  describe('IPv4-mapped IPv6 addresses', () => {
    it('unwraps and blocks dotted IPv4-mapped loopback', () => {
      expect(checker.isBlocked('::ffff:127.0.0.1')).toBe(true);
      expect(checker.isBlocked('[::ffff:127.0.0.1]')).toBe(true);
    });

    it('unwraps and blocks hex IPv4-mapped loopback', () => {
      expect(checker.isBlocked('::ffff:7f00:1')).toBe(true);
      expect(checker.isBlocked('[::ffff:7f00:1]')).toBe(true);
      expect(checker.isBlocked('::ffff:7f00:0001')).toBe(true);
    });

    it('unwraps and blocks private IPv4-mapped addresses', () => {
      expect(checker.isBlocked('::ffff:10.0.0.1')).toBe(true);
      expect(checker.isBlocked('::ffff:169.254.169.254')).toBe(true);
      expect(checker.isBlocked('[::ffff:192.168.1.1]')).toBe(true);
    });

    it('unwraps and allows public IPv4-mapped addresses', () => {
      expect(checker.isBlocked('::ffff:93.184.216.34')).toBe(false);
      expect(checker.isBlocked('[::ffff:93.184.216.34]')).toBe(false);
      // 93.184.216.34 in hex: 0x5db8:0xd822
      expect(checker.isBlocked('::ffff:5db8:d822')).toBe(false);
      expect(checker.isBlocked('[::ffff:5db8:d822]')).toBe(false);
    });
  });

  describe('non-IP or malformed input', () => {
    it('fails closed (blocks) for invalid IP strings', () => {
      expect(checker.isBlocked('not-an-ip')).toBe(true);
      expect(checker.isBlocked('')).toBe(true);
      expect(checker.isBlocked('999.999.999.999')).toBe(true);
    });
  });
});
