import { Archivo, IBM_Plex_Mono, Roboto_Flex } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { ReactNode, Suspense } from 'react';
import { Providers } from './providers';
import { createTheme, MantineColorsTuple, MantineProvider } from '@mantine/core';
import { ChatProvider } from '@/context/ChatContext';
import { ChatUIProvider } from '@/context/ChatUIContext';
import { AgentProvider } from '@/context/AgentContext';
import { ChatComponents } from '@/components/chat/ChatComponents';
import { AIAssistantDrawer } from '@/components/agent/AIAssistantDrawer';
import ProfileCompletionGate from '@/components/auth/ProfileCompletionGate';
import PostHogIdentity from '@/components/analytics/PostHogIdentity';
import MobileAppPrompt from '@/components/layout/MobileAppPrompt';
import SiteFooter from '@/components/layout/SiteFooter';
import { MOBILE_APP_MANTINE_PRIMARY_SCALE } from './theme/mobilePalette';
export { metadata, viewport } from './rootMetadata';

const GOOGLE_ANALYTICS_ID = 'G-PXFLC9SY0D';

const robotoFlex = Roboto_Flex({
  subsets: ['latin'],
  display: 'swap',
});
const landingHeading = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-landing-heading',
});
const landingMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-landing-mono',
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

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const disableChat = process.env.NEXT_PUBLIC_DISABLE_CHAT === '1';
  const disableAgent = ['0', 'false', 'off', 'disabled'].includes(
    (process.env.OPENAI_AGENT_ENABLED ?? '').trim().toLowerCase(),
  );

  return (
    <html lang="en" className={`${robotoFlex.className} ${landingHeading.variable} ${landingMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground">
        <MantineProvider theme={theme} defaultColorScheme="light">
          <Providers>
            <Suspense fallback={null}>
              <ProfileCompletionGate />
            </Suspense>
            <PostHogIdentity />
            <div className="flex min-h-screen flex-col">
              <div className="flex-1">
                <AgentProvider>
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
                  <AIAssistantDrawer enabled={!disableAgent} />
                </AgentProvider>
              </div>
              <SiteFooter />
            </div>
            <MobileAppPrompt />
          </Providers>
        </MantineProvider>
      </body>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ANALYTICS_ID}');
        `}
      </Script>
    </html>
  );
}
