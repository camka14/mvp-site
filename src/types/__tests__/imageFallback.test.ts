import { getEventImageFallbackUrl, getEventImageUrl, getTeamAvatarUrl, getUserAvatarUrl } from '@/types';

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

describe('avatar placeholder urls', () => {
  it('passes full team name to initials endpoint so backend can derive up to three initials', () => {
    const url = getTeamAvatarUrl(
      {
        name: 'Red River Rockets',
        profileImageId: '',
      } as any,
      72,
    );

    expect(url).toContain('/api/avatars/initials?');
    expect(url).toContain('name=Red+River+Rockets');
    expect(url).toContain('size=72');
  });

  it('passes user full name to initials endpoint', () => {
    const url = getUserAvatarUrl(
      {
        firstName: 'Ana',
        lastName: 'Maria Lopez',
        userName: 'amlopez',
        profileImageId: '',
      } as any,
      80,
    );

    expect(url).toContain('/api/avatars/initials?');
    expect(url).toContain('name=Ana+Maria+Lopez');
    expect(url).toContain('size=80');
  });

  it('uses jersey number override before profile image', () => {
    const url = getUserAvatarUrl(
      {
        firstName: 'Ana',
        lastName: 'Lopez',
        userName: 'amlopez',
        profileImageId: 'profile_file_1',
      } as any,
      40,
      '12',
    );

    expect(url).toContain('/api/avatars/initials?');
    expect(url).toContain('name=12');
    expect(url).toContain('size=40');
    expect(url).not.toContain('/api/files/profile_file_1/preview');
  });
});
