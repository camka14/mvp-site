export const IOS_APP_STORE_ID_DEFAULT = '6746649739';
export const IOS_STORE_URL_DEFAULT = `https://apps.apple.com/us/app/bracketiq/id${IOS_APP_STORE_ID_DEFAULT}`;
export const ANDROID_STORE_URL_DEFAULT = 'https://play.google.com/store/apps/details?id=com.razumly.mvp';
export const IOS_DEEP_LINK_DEFAULT = 'mvp://discover';
export const ANDROID_DEEP_LINK_DEFAULT = 'razumly://mvp';
const IOS_APP_STORE_ID_PATTERN = /\/id(\d+)(?:[/?#]|$)/i;

export function getMobileAppLinks() {
  return {
    iosStoreUrl: process.env.NEXT_PUBLIC_MVP_IOS_APP_STORE_URL || IOS_STORE_URL_DEFAULT,
    androidStoreUrl: process.env.NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL || ANDROID_STORE_URL_DEFAULT,
    iosDeepLink: process.env.NEXT_PUBLIC_MVP_IOS_DEEP_LINK || IOS_DEEP_LINK_DEFAULT,
    androidDeepLink: process.env.NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK || ANDROID_DEEP_LINK_DEFAULT,
  };
}

export function getPreferredMobileStoreUrl() {
  const { iosStoreUrl } = getMobileAppLinks();
  return iosStoreUrl;
}

export function getIosAppStoreId() {
  const { iosStoreUrl } = getMobileAppLinks();
  const match = IOS_APP_STORE_ID_PATTERN.exec(iosStoreUrl);

  return match?.[1] ?? IOS_APP_STORE_ID_DEFAULT;
}

export function getIosSmartAppBannerMetaContent(appArgument?: string) {
  const parts = [`app-id=${getIosAppStoreId()}`];

  if (appArgument) {
    parts.push(`app-argument=${appArgument}`);
  }

  return parts.join(', ');
}
