'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/app/providers';
import { identifyUser, resetAnalytics } from '@/lib/analytics/posthogClient';

export default function PostHogIdentity() {
  const { authUser, isGuest, loading } = useApp();
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    const userId = !isGuest ? authUser?.$id?.trim() : '';
    if (userId) {
      if (identifiedUserIdRef.current === userId) return;

      identifyUser(userId, {
        platform: 'web',
        is_admin: authUser?.isAdmin === true,
        email_verified: authUser?.emailVerified === true || Boolean(authUser?.emailVerifiedAt),
      });
      identifiedUserIdRef.current = userId;
      return;
    }

    if (identifiedUserIdRef.current !== null) {
      resetAnalytics();
      identifiedUserIdRef.current = null;
    }
  }, [authUser?.$id, authUser?.emailVerified, authUser?.emailVerifiedAt, authUser?.isAdmin, isGuest, loading]);

  return null;
}
