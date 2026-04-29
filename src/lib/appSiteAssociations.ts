export const APPLE_APP_SITE_ASSOCIATION_BODY = {
  applinks: {
    details: [
      {
        appIDs: [
          '427LTWF4US.com.razumly.mvp',
        ],
        components: [
          {
            '/': '/?*',
            comment: 'Match non-root routes on BracketIQ domains',
          },
        ],
      },
    ],
  },
};

export const ANDROID_ASSET_LINKS_BODY = [
  {
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: 'com.razumly.mvp',
      sha256_cert_fingerprints: [
        // Android Studio debug keystore (development installs).
        'CA:1A:4C:69:AE:C1:0D:C7:9C:13:9C:30:97:97:52:AD:21:DE:BC:52:23:5E:90:21:BC:F0:E5:2E:A5:D3:E0:52',
        // Release/app-signing fingerprints.
        '35:36:FA:A7:DA:49:D8:2F:B9:D3:F5:3F:EC:BD:D6:18:4C:2C:AF:2B:A7:6A:CE:9F:05:78:47:44:83:7B:95:13',
        'B4:68:A7:4F:90:0D:4F:38:06:62:CF:B2:89:4A:E8:6B:C3:7E:CB:28:17:04:BD:96:E9:40:AA:F2:94:EC:8A:E6',
      ],
    },
  },
];
