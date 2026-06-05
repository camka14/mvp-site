import fs from 'node:fs';
import path from 'node:path';
import { metadata } from '../rootMetadata';

describe('root metadata', () => {
  it('uses stable favicon and PNG icon assets for crawlers', () => {
    expect(metadata.icons).toEqual(expect.objectContaining({
      icon: expect.arrayContaining([
        expect.objectContaining({ url: '/favicon.ico', sizes: 'any' }),
        expect.objectContaining({ url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' }),
        expect.objectContaining({ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ url: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
      ]),
      shortcut: expect.arrayContaining([
        expect.objectContaining({ url: '/favicon.ico' }),
      ]),
      apple: expect.arrayContaining([
        expect.objectContaining({ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }),
      ]),
    }));

    for (const iconPath of [
      'favicon.ico',
      'favicon-48x48.png',
      'icon-192.png',
      'icon-512.png',
      'apple-touch-icon.png',
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), 'public', iconPath))).toBe(true);
    }
  });
});
