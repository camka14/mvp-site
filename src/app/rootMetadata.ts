import type { Metadata, Viewport } from 'next';
import { getIosAppStoreId } from '@/lib/mobileAppLinks';
import { SITE_URL } from '@/lib/siteUrl';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'BracketIQ | Sports Event Platform',
  description: 'Find, organize, and join pickup games, leagues, and tournaments across any sport.',
  keywords: ['sports', 'events', 'tournaments', 'leagues', 'pickup games', 'teams'],
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/BIQ_drawing.svg', type: 'image/svg+xml' },
    ],
    shortcut: [
      { url: '/favicon.ico' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'BracketIQ | Sports Event Platform',
    description: 'Find, organize, and join pickup games, leagues, and tournaments across any sport.',
    url: SITE_URL,
    siteName: 'BracketIQ',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Preview of the BracketIQ multi-sport event platform.',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BracketIQ | Sports Event Platform',
    description: 'Find, organize, and join pickup games, leagues, and tournaments across any sport.',
    images: ['/opengraph-image'],
  },
  itunes: {
    appId: getIosAppStoreId(),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};
