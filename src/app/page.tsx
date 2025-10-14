'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from './providers';
import Loading from '@/components/ui/Loading';

export default function HomePage() {
  const { user, loading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push('/discover');
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return <Loading fullScreen text="Loading..." />;
}
