import {
  ANDROID_ASSET_LINKS_BODY,
  APPLE_APP_SITE_ASSOCIATION_BODY,
} from '../appSiteAssociations';

describe('appSiteAssociations', () => {
  it('publishes the Android asset links payload for the BracketIQ app', () => {
    expect(ANDROID_ASSET_LINKS_BODY).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.razumly.mvp',
          sha256_cert_fingerprints: [
            '35:36:FA:A7:DA:49:D8:2F:B9:D3:F5:3F:EC:BD:D6:18:4C:2C:AF:2B:A7:6A:CE:9F:05:78:47:44:83:7B:95:13',
            'B4:68:A7:4F:90:0D:4F:38:06:62:CF:B2:89:4A:E8:6B:C3:7E:CB:28:17:04:BD:96:E9:40:AA:F2:94:EC:8A:E6',
          ],
        },
      },
    ]);
  });

  it('publishes the Apple universal links payload for the BracketIQ app', () => {
    expect(APPLE_APP_SITE_ASSOCIATION_BODY).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['427LTWF4US.com.razumly.mvp'],
            components: [
              {
                '/': '/*',
                comment: 'Match all routes on BracketIQ domains',
              },
            ],
          },
        ],
      },
    });
  });
});
