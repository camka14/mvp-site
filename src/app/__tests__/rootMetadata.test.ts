import fs from 'node:fs';
import path from 'node:path';
import { metadata } from '../rootMetadata';

describe('root metadata', () => {
  it('uses a single stable favicon asset for crawlers', () => {
    expect(metadata.icons).toEqual(expect.objectContaining({
      icon: [{ url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' }],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    }));

    for (const iconPath of ['favicon-48x48.png', 'apple-touch-icon.png']) {
      expect(fs.existsSync(path.join(process.cwd(), 'public', iconPath))).toBe(true);
    }
  });
});
