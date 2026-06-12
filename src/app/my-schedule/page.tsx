'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import ScheduleCalendarPanel from '@/components/schedule/ScheduleCalendarPanel';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';

export default function MySchedulePage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading your schedule..." />}>
      <MySchedulePageContent />
    </Suspense>
  );
}

function MySchedulePageContent() {
  const { user, isAuthenticated, loading: authLoading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router, user]);

  if (authLoading) {
    return <Loading fullScreen text="Loading your schedule..." />;
  }
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <>
      <Navigation />
      <Container fluid py="xl">
        <ScheduleCalendarPanel
          endpoint="/api/profile/schedule?limit=300"
          title="My Schedule"
          description="Events and matches you or your teams are part of."
          loadingText="Loading your schedule..."
          errorText="Failed to load your schedule. Please try again."
        />
      </Container>
    </>
  );
}
