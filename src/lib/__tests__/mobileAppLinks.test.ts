import {
  ANDROID_DEEP_LINK_DEFAULT,
  ANDROID_STORE_URL_DEFAULT,
  getMobileAppLinks,
  getIosAppStoreId,
  getIosSmartAppBannerMetaContent,
  getPreferredMobileStoreUrl,
  IOS_APP_STORE_ID_DEFAULT,
  IOS_DEEP_LINK_DEFAULT,
  IOS_STORE_URL_DEFAULT,
} from '../mobileAppLinks';

describe('mobileAppLinks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_MVP_IOS_APP_STORE_URL;
    delete process.env.NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL;
    delete process.env.NEXT_PUBLIC_MVP_IOS_DEEP_LINK;
    delete process.env.NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses BracketIQ defaults when overrides are absent', () => {
    expect(getMobileAppLinks()).toEqual({
      iosStoreUrl: IOS_STORE_URL_DEFAULT,
      androidStoreUrl: ANDROID_STORE_URL_DEFAULT,
      iosDeepLink: IOS_DEEP_LINK_DEFAULT,
      androidDeepLink: ANDROID_DEEP_LINK_DEFAULT,
    });
    expect(getPreferredMobileStoreUrl()).toBe(IOS_STORE_URL_DEFAULT);
    expect(IOS_STORE_URL_DEFAULT).toBe('https://apps.apple.com/us/app/bracketiq/id6746649739');
    expect(getIosAppStoreId()).toBe(IOS_APP_STORE_ID_DEFAULT);
    expect(getIosSmartAppBannerMetaContent()).toBe('app-id=6746649739');
  });

  it('derives the smart banner app ID from an overridden App Store URL', () => {
    process.env.NEXT_PUBLIC_MVP_IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/bracketiq/id1234567890?pt=42';

    expect(getIosAppStoreId()).toBe('1234567890');
    expect(getIosSmartAppBannerMetaContent('https://bracket-iq.com/discover')).toBe(
      'app-id=1234567890, app-argument=https://bracket-iq.com/discover',
    );
  });
});
