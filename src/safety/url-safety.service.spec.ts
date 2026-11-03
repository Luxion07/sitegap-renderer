import { Test, TestingModule } from '@nestjs/testing';
import { UrlSafetyService } from './url-safety.service';
import { ADDRESS_CHECKER } from './address-checker.interface';
import { DefaultAddressChecker } from './default-address-checker';
import { DNS_RESOLVER } from './dns-resolver.interface';
import { InvalidUrlError } from './errors/invalid-url.error';
import { BlockedUrlError } from './errors/blocked-url.error';

describe('UrlSafetyService', () => {
  let service: UrlSafetyService;
  let mockDnsResolver: { resolve: jest.Mock };

  beforeEach(async () => {
    mockDnsResolver = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlSafetyService,
        {
          provide: ADDRESS_CHECKER,
          useClass: DefaultAddressChecker,
        },
        {
          provide: DNS_RESOLVER,
          useValue: mockDnsResolver,
        },
      ],
    }).compile();

    service = module.get<UrlSafetyService>(UrlSafetyService);
  });

  function mockDns(addresses: string[]) {
    mockDnsResolver.resolve.mockResolvedValue(addresses);
  }

  it('accepts a public IPv4 address', async () => {
    mockDns(['93.184.216.34']);

    const result = await service.assertSafeUrl('https://example.com');

    expect(result.ip).toBe('93.184.216.34');
    expect(result.url.hostname).toBe('example.com');
  });

  it('rejects a malformed URL', async () => {
    await expect(service.assertSafeUrl('not a url')).rejects.toThrow(
      InvalidUrlError,
    );
  });

  it('rejects a non-http(s) protocol', async () => {
    await expect(service.assertSafeUrl('ftp://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
    await expect(service.assertSafeUrl('file:///etc/passwd')).rejects.toThrow(
      BlockedUrlError,
    );
    await expect(service.assertSafeUrl('javascript:alert(1)')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects loopback (127.0.0.1)', async () => {
    mockDns(['127.0.0.1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects the cloud metadata IP (169.254.169.254)', async () => {
    mockDns(['169.254.169.254']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects private 10.x', async () => {
    mockDns(['10.0.0.5']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects private 172.16.0.0/12 and allows just outside its boundary', async () => {
    mockDns(['172.20.5.5']);
    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );

    mockDns(['172.32.0.1']);
    await expect(
      service.assertSafeUrl('https://example.com'),
    ).resolves.toBeDefined();
  });

  it('rejects private 192.168.x', async () => {
    mockDns(['192.168.1.1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects IPv6 loopback (::1)', async () => {
    mockDns(['::1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects IPv6 unique-local (fd00::/fc00::)', async () => {
    mockDns(['fd12:3456::1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects IPv6 link-local (fe80::)', async () => {
    mockDns(['fe80::1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects an IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', async () => {
    mockDns(['::ffff:127.0.0.1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects when any resolved address is blocked, even if another is public', async () => {
    mockDns(['93.184.216.34', '127.0.0.1']);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('accepts when every resolved address is public', async () => {
    mockDns(['93.184.216.34', '1.1.1.1']);

    await expect(
      service.assertSafeUrl('https://example.com'),
    ).resolves.toBeDefined();
  });

  it('rejects when DNS lookup fails', async () => {
    mockDnsResolver.resolve.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      InvalidUrlError,
    );
  });

  it('rejects when DNS returns no addresses', async () => {
    mockDns([]);

    await expect(service.assertSafeUrl('https://example.com')).rejects.toThrow(
      InvalidUrlError,
    );
  });

  describe('literal IP in URL (skips DNS resolution)', () => {
    it('rejects literal IPv4 loopback without calling DNS', async () => {
      await expect(
        service.assertSafeUrl('http://127.0.0.1:8080/admin'),
      ).rejects.toThrow(BlockedUrlError);
      expect(mockDnsResolver.resolve).not.toHaveBeenCalled();
    });

    it('rejects literal bracketed IPv6 loopback without calling DNS', async () => {
      await expect(
        service.assertSafeUrl('http://[::1]/secret'),
      ).rejects.toThrow(BlockedUrlError);
      expect(mockDnsResolver.resolve).not.toHaveBeenCalled();
    });

    it('rejects literal bracketed IPv4-mapped IPv6 hex loopback without calling DNS', async () => {
      await expect(
        service.assertSafeUrl('http://[::ffff:7f00:1]/status'),
      ).rejects.toThrow(BlockedUrlError);
      expect(mockDnsResolver.resolve).not.toHaveBeenCalled();
    });

    it('accepts literal public IPv4 URL without calling DNS', async () => {
      const result = await service.assertSafeUrl(
        'http://93.184.216.34:8080/path',
      );
      expect(result.ip).toBe('93.184.216.34');
      expect(mockDnsResolver.resolve).not.toHaveBeenCalled();
    });
  });
});
