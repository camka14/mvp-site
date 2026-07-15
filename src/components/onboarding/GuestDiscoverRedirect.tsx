'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import Loading from '@/components/ui/Loading';

export default function GuestDiscoverRedirect() {
  const router = useRouter();
  const { startGuestSession } = useApp();

  useEffect(() => {
    let isActive = true;

    const continueAsGuest = async () => {
      await startGuestSession();
      if (isActive) {
        router.replace('/discover');
      }
    };

    void continueAsGuest();
    return () => {
      isActive = false;
    };
  }, [router, startGuestSession]);

  return <Loading fullScreen text="Opening Discover..." />;
}
