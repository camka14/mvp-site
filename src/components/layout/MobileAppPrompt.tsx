'use client';

import { Button, Group, Paper, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';

type MobilePlatform = 'ios' | 'android' | 'other';

const DISMISSED_UNTIL_KEY = 'mvp_mobile_app_prompt_dismissed_until';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const IOS_STORE_URL_DEFAULT = 'https://apps.apple.com/us/search?term=Razumly%20MVP';
const ANDROID_STORE_URL_DEFAULT = 'https://play.google.com/store/apps/details?id=com.razumly.mvp';

const IOS_DEEP_LINK_DEFAULT = 'mvp://discover';
const ANDROID_DEEP_LINK_DEFAULT = 'razumly://mvp';

const detectMobilePlatform = (ua: string, maxTouchPoints: number): MobilePlatform => {
  const userAgent = ua.toLowerCase();
  if (userAgent.includes('android')) return 'android';
  if (userAgent.includes('iphone') || userAgent.includes('ipod') || userAgent.includes('ipad')) return 'ios';
  if (userAgent.includes('macintosh') && maxTouchPoints > 1) return 'ios';
  return 'other';
};

const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || navigatorStandalone;
};

export default function MobileAppPrompt() {
  const [platform, setPlatform] = useState<MobilePlatform>('other');
  const [visible, setVisible] = useState(false);

  const iosStoreUrl = process.env.NEXT_PUBLIC_MVP_IOS_APP_STORE_URL || IOS_STORE_URL_DEFAULT;
  const androidStoreUrl = process.env.NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL || ANDROID_STORE_URL_DEFAULT;
  const iosDeepLink = process.env.NEXT_PUBLIC_MVP_IOS_DEEP_LINK || IOS_DEEP_LINK_DEFAULT;
  const androidDeepLink = process.env.NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK || ANDROID_DEEP_LINK_DEFAULT;

  const storeUrl = useMemo(() => {
    if (platform === 'ios') return iosStoreUrl;
    if (platform === 'android') return androidStoreUrl;
    return '';
  }, [androidStoreUrl, iosStoreUrl, platform]);

  const deepLink = useMemo(() => {
    if (platform === 'ios') return iosDeepLink;
    if (platform === 'android') return androidDeepLink;
    return '';
  }, [androidDeepLink, iosDeepLink, platform]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SHOW_APP_PROMPT === '0') return;
    if (typeof window === 'undefined') return;

    const detected = detectMobilePlatform(window.navigator.userAgent || '', window.navigator.maxTouchPoints || 0);
    if (detected === 'other') return;
    if (isStandaloneDisplayMode()) return;

    const dismissedUntil = Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) || '0');
    if (Number.isFinite(dismissedUntil) && dismissedUntil > Date.now()) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPlatform(detected);
      setVisible(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (!visible || platform === 'other') return null;

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS));
    }
    setVisible(false);
  };

  const openApp = () => {
    if (typeof window === 'undefined' || !deepLink) return;
    const fallbackUrl = storeUrl;
    const start = Date.now();

    window.location.href = deepLink;
    if (!fallbackUrl) return;

    window.setTimeout(() => {
      // If app switch did not occur, send user to store.
      if (Date.now() - start < 1800) {
        window.location.href = fallbackUrl;
      }
    }, 1200);
  };

  return (
    <Paper
      withBorder
      shadow="sm"
      p="sm"
      radius="md"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1200,
        margin: '0 auto',
        maxWidth: 520,
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <div>
          <Text fw={600} size="sm">Use the Razumly app</Text>
          <Text size="xs" c="dimmed">Open this page in the mobile app for a better experience.</Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="default" onClick={dismiss}>Not now</Button>
          <Button size="xs" variant="light" onClick={() => { if (storeUrl) window.location.href = storeUrl; }}>
            Get App
          </Button>
          <Button size="xs" onClick={openApp}>Open App</Button>
        </Group>
      </Group>
    </Paper>
  );
}
