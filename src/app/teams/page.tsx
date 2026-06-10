'use client';

import { Suspense } from 'react';
import Loading from '@/components/ui/Loading';
import ManageTeams from './components/ManageTeams';

export default function TeamsPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading teams..." />}>
      <ManageTeams />
    </Suspense>
  );
}
