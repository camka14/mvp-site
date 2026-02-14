import { normalizeSpacesEndpoint } from '@/lib/storageProvider';

describe('normalizeSpacesEndpoint', () => {
  it('keeps region-level endpoint unchanged', () => {
    expect(normalizeSpacesEndpoint('https://sfo3.digitaloceanspaces.com', 'mvp-storage')).toBe(
      'https://sfo3.digitaloceanspaces.com',
    );
  });

  it('strips a single bucket prefix from endpoint host', () => {
    expect(
      normalizeSpacesEndpoint('https://mvp-storage.sfo3.digitaloceanspaces.com', 'mvp-storage'),
    ).toBe('https://sfo3.digitaloceanspaces.com');
  });

  it('strips repeated bucket prefixes from endpoint host', () => {
    expect(
      normalizeSpacesEndpoint('mvp-storage.mvp-storage.sfo3.digitaloceanspaces.com', 'mvp-storage'),
    ).toBe('https://sfo3.digitaloceanspaces.com');
  });

  it('throws for invalid endpoint values', () => {
    expect(() => normalizeSpacesEndpoint('not a valid endpoint%%%', 'mvp-storage')).toThrow(
      'DO_SPACES_ENDPOINT must be a valid URL or hostname',
    );
  });
});
