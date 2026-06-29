'use client';

import posthog from 'posthog-js';

export const analyticsEventNames = [
  'user signed up',
  'user logged in',
  'organization created',
  'event created',
  'event registration started',
  'event registration completed',
  'team created',
  'checkout started',
  'payment completed',
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
export type AnalyticsPropertyValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

function hasBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getProjectToken(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ?? '';
}

function normalizeProperties(properties: AnalyticsProperties = {}): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string | number | boolean | null] => {
      return entry[1] !== undefined;
    }),
  );
}

export function isPostHogEnabled(): boolean {
  return hasBrowser() && getProjectToken().length > 0;
}

export function capture(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  if (!isPostHogEnabled()) return;

  posthog.capture(eventName, normalizeProperties(properties));
}

export function identifyUser(userId: string, properties: AnalyticsProperties = {}): void {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || !isPostHogEnabled()) return;

  posthog.identify(normalizedUserId, normalizeProperties(properties));
}

export function resetAnalytics(): void {
  if (!isPostHogEnabled()) return;

  posthog.reset();
}
