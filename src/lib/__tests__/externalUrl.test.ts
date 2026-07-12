import {
  isValidOptionalExternalHttpUrl,
  normalizeExternalHttpUrl,
} from '@/lib/externalUrl';

describe('external URL normalization', () => {
  it('canonicalizes public http and https URLs', () => {
    expect(normalizeExternalHttpUrl(' HTTPS://Partner.Example.com/register '))
      .toBe('https://partner.example.com/register');
    expect(normalizeExternalHttpUrl('http://partner.example.com')).toBe('http://partner.example.com/');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'ftp://partner.example.com',
    'https://user:password@partner.example.com/register',
    'https://partner.example.com@evil.example/register',
    'not a URL',
  ])('rejects unsafe external destination %s', (value) => {
    expect(normalizeExternalHttpUrl(value)).toBeNull();
    expect(isValidOptionalExternalHttpUrl(value)).toBe(false);
  });

  it('permits empty optional values so callers can clear a link', () => {
    expect(isValidOptionalExternalHttpUrl(null)).toBe(true);
    expect(isValidOptionalExternalHttpUrl(undefined)).toBe(true);
    expect(isValidOptionalExternalHttpUrl('   ')).toBe(true);
  });
});
