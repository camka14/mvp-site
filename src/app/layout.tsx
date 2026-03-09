import type { Metadata } from 'next';
import { Roboto_Flex } from 'next/font/google';
import './globals.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { ReactNode } from 'react';
import { Providers } from './providers';
import { createTheme, MantineColorsTuple, MantineProvider } from '@mantine/core';
import { ChatProvider } from '@/context/ChatContext';
import { ChatUIProvider } from '@/context/ChatUIContext';
import { ChatComponents } from '@/components/chat/ChatComponents';
import MobileAppPrompt from '@/components/layout/MobileAppPrompt';
import { MOBILE_APP_MANTINE_PRIMARY_SCALE } from './theme/mobilePalette';

const robotoFlex = Roboto_Flex({
  subsets: ['latin'],
  display: 'swap',
});
const mvpPrimary = [...MOBILE_APP_MANTINE_PRIMARY_SCALE] as MantineColorsTuple;
const theme = createTheme({
  primaryColor: 'mvpPrimary',
  colors: {
    mvpPrimary,
  },
  fontFamily: robotoFlex.style.fontFamily,
  headings: {
    fontFamily: robotoFlex.style.fontFamily,
  },
  defaultRadius: 'md',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://mvp.razumly.com'),
  title: 'BracketIQ | Sports Event Platform',
  description: 'Find, organize, and join pickup games, leagues, and tournaments across any sport.',
  keywords: ['sports', 'events', 'tournaments', 'leagues', 'pickup games', 'teams'],
  icons: {
    icon: [
      { url: '/bracketiq-shield.svg', type: 'image/svg+xml' },
    ],
    shortcut: [
      { url: '/bracketiq-shield.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/bracketiq-shield.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: 'BracketIQ | Sports Event Platform',
    description: 'Find, organize, and join pickup games, leagues, and tournaments across any sport.',
    url: 'https://mvp.razumly.com',
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
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const disableChat = process.env.NEXT_PUBLIC_DISABLE_CHAT === '1';

  return (
    <html lang="en" className={robotoFlex.className}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <MantineProvider theme={theme} defaultColorScheme="light">
          <Providers>
            {disableChat ? (
              children
            ) : (
              <ChatProvider>
                <ChatUIProvider>
                  {children}
                  <ChatComponents />
                </ChatUIProvider>
              </ChatProvider>
            )}
            <MobileAppPrompt />
          </Providers>
        </MantineProvider>
      </body>
    </html>
  );
}
