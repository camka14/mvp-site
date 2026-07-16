/** @jest-environment node */

import {
  affiliateIntakeUrlKey,
  assertSafePublicUrl,
  canonicalizeAffiliateIntakeUrl,
  createPinnedAddressLookup,
  isUnsafePublicAddress,
} from '@/server/affiliateImports/sourceIntakeUrlSafety';

describe('affiliate source intake URL safety', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '198.51.100.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ])('rejects private or reserved address %s', (address) => {
    expect(isUnsafePublicAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public address %s', (address) => {
    expect(isUnsafePublicAddress(address)).toBe(false);
  });

  it('rejects unsafe protocols, credentials, local names, and private DNS results', async () => {
    await expect(assertSafePublicUrl('file:///tmp/source.html')).rejects.toThrow('http or https');
    await expect(assertSafePublicUrl('https://user:secret@example.com')).rejects.toThrow('credentials');
    await expect(assertSafePublicUrl('http://localhost/events')).rejects.toThrow('not public');
    await expect(assertSafePublicUrl('https://events.example.test', async () => [
      { address: '10.1.2.3', family: 4 },
    ])).rejects.toThrow('private or reserved');
  });

  it('accepts a public DNS result', async () => {
    await expect(assertSafePublicUrl('https://events.example.test', async () => [
      { address: '203.0.114.12', family: 4 },
    ])).resolves.toEqual(expect.objectContaining({
      addresses: [{ address: '203.0.114.12', family: 4 }],
    }));
  });

  it('canonicalizes equivalent source URLs and removes tracking parameters', () => {
    const first = canonicalizeAffiliateIntakeUrl(
      'HTTPS://Example.COM:443/events/?b=2&utm_source=newsletter&a=1#schedule',
    );
    const second = canonicalizeAffiliateIntakeUrl('https://example.com/events?a=1&b=2');

    expect(first).toBe('https://example.com/events?a=1&b=2');
    expect(affiliateIntakeUrlKey(first)).toBe(affiliateIntakeUrlKey(second));
  });

  it('returns an address array when Node requests an all-address lookup', () => {
    const callback = jest.fn();
    createPinnedAddressLookup({ address: '93.184.216.34', family: 4 })(
      'example.com',
      { all: true },
      callback,
    );
    expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  });
});
