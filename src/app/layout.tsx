import { Inter } from 'next/font/google';
import './globals.css';
import { ReactNode } from 'react';
import { Providers } from './providers';
import { ChatDrawer } from '@/components/chat/ChatDrawer';
import { ChatProvider } from '@/context/ChatContext';
import { ChatUIProvider } from '@/context/ChatUIContext';
import { ChatComponents } from '@/components/chat/ChatComponents';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'MVP - Volleyball Event Platform',
  description: 'Find and join exciting volleyball events in your area',
  keywords: 'volleyball, sports, events, tournaments, pickup games',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <ChatProvider>
            <ChatUIProvider>
              {children}
              <ChatComponents />
            </ChatUIProvider>
          </ChatProvider>
        </Providers>
      </body>
    </html>
  );
}
