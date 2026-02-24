import { getEventImageFallbackUrl, getEventImageUrl } from '@/types';

describe('event image fallbacks', () => {
  it('uses local initials placeholder when no event image is provided', () => {
    const url = getEventImageUrl({ imageId: undefined, width: 800, height: 200 });

    expect(url).toContain('/api/avatars/initials?');
    expect(url).toContain('name=Event');
    expect(url).not.toContain('images.unsplash.com');
  });

  it('prefers organization logo for event image fallback', () => {
    const url = getEventImageFallbackUrl({
      event: {
        organization: {
          $id: 'org_1',
          name: 'My Org',
          logoId: 'logo_1',
        },
        hostId: 'host_1',
      } as any,
      width: 640,
      height: 320,
    });

    expect(url).toBe('/api/files/logo_1/preview?w=640&h=320&fit=cover');
  });

  it('falls back to host avatar placeholder when organization is unavailable', () => {
    const url = getEventImageFallbackUrl({
      event: {
        organization: null,
        hostId: 'host_abc',
      } as any,
      width: 640,
      height: 320,
    });

    expect(url).toContain('/api/avatars/initials?');
    expect(url).toContain('name=host_abc');
  });
});
