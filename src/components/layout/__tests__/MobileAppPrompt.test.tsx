import { supportsNativeIosSmartAppBanner } from '../MobileAppPrompt';

describe('MobileAppPrompt browser gating', () => {
  it('suppresses the custom prompt for iPhone Safari so the native banner is the only iOS prompt', () => {
    const safariUserAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

    expect(supportsNativeIosSmartAppBanner(safariUserAgent, 5)).toBe(true);
  });

  it('keeps the custom prompt available for non-Safari iOS browsers', () => {
    const chromeOnIosUserAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/135.0.7049.53 Mobile/15E148 Safari/604.1';

    expect(supportsNativeIosSmartAppBanner(chromeOnIosUserAgent, 5)).toBe(false);
  });
});
