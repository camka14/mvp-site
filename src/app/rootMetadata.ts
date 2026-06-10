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
    icon: [{ url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
