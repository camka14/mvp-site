export const IOS_STORE_URL_DEFAULT = 'https://apps.apple.com/us/search?term=Razumly%20MVP';
export const ANDROID_STORE_URL_DEFAULT = 'https://play.google.com/store/apps/details?id=com.razumly.mvp';
export const IOS_DEEP_LINK_DEFAULT = 'mvp://discover';
export const ANDROID_DEEP_LINK_DEFAULT = 'razumly://mvp';

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
