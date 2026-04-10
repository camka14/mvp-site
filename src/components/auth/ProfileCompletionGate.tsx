'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { getHomePathForUser } from '@/lib/homePage';

const safeNextPath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const next = value.trim();
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (/[\r\n\t]/.test(next)) return null;
  if (next.startsWith('/login')) return null;
  if (next.startsWith('/complete-profile')) return null;
  return next;
};

export default function ProfileCompletionGate() {
  const {
    user,
    loading,
    isGuest,
    isAuthenticated,
    requiresProfileCompletion,
  } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPath = useMemo(() => {
    if (!pathname) return null;
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (loading || isGuest || !isAuthenticated || !pathname) {
      return;
    }

    if (requiresProfileCompletion) {
      if (pathname === '/complete-profile') {
        return;
      }

      const next = safeNextPath(currentPath);
      router.replace(next ? `/complete-profile?next=${encodeURIComponent(next)}` : '/complete-profile');
      return;
    }

    if (pathname === '/complete-profile') {
      const next = safeNextPath(searchParams.get('next'));
      const fallback = user ? getHomePathForUser(user) : '/discover';
      router.replace(next ?? fallback);
    }
  }, [
    currentPath,
    isAuthenticated,
    isGuest,
    loading,
    pathname,
    requiresProfileCompletion,
    router,
    searchParams,
    user,
  ]);

  return null;
}
