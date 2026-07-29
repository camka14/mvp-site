'use client';

import { Suspense } from 'react';

import Loading from '@/components/ui/Loading';

import OrganizationClaimWizard from './OrganizationClaimWizard';

export default function OrganizationClaimPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization claim..." />}>
      <OrganizationClaimWizard />
    </Suspense>
  );
}
