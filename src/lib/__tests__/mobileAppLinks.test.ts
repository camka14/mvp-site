import {
  ANDROID_DEEP_LINK_DEFAULT,
  ANDROID_STORE_URL_DEFAULT,
  getMobileAppLinks,
  getPreferredMobileStoreUrl,
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
    expect(IOS_STORE_URL_DEFAULT).toBe('https://apps.apple.com/us/search?term=BracketIQ');
  });
});
