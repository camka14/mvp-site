'use client';

import { Badge } from '@mantine/core';
import type { Organization } from '@/types';
import {
  organizationVerificationStatusLabel,
  resolveOrganizationVerificationStatus,
} from '@/lib/organizationVerification';

type OrganizationVerificationBadgeProps = {
  organization?: Pick<Organization, 'verificationStatus' | 'hasStripeAccount'> | null;
};

export default function OrganizationVerificationBadge({
  organization,
}: OrganizationVerificationBadgeProps) {
  const status = resolveOrganizationVerificationStatus(organization);
  if (status !== 'VERIFIED') {
    return null;
  }

  return (
    <Badge color="teal" variant="light">
      {organizationVerificationStatusLabel(status)}
    </Badge>
  );
}
