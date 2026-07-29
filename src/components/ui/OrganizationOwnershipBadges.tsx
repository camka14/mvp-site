'use client';

import { Badge, Group } from '@mantine/core';
import { Check, Diamond, ShieldAlert } from 'lucide-react';

import { getOrganizationOwnershipPresentation } from '@/lib/organizationOwnership';
import type { Organization } from '@/types';

type OrganizationOwnershipBadgesProps = {
  organization?: Pick<
    Organization,
    '$id' | 'originType' | 'ownershipStatus' | 'claimVerificationLevel'
  > | null;
  compact?: boolean;
};

export default function OrganizationOwnershipBadges({
  organization,
  compact = false,
}: OrganizationOwnershipBadgesProps) {
  if (!organization) return null;
  const presentation = getOrganizationOwnershipPresentation(organization);
  const badgeSize = compact ? 'xs' : 'sm';

  if (presentation.ownershipStatus === 'UNCLAIMED') {
    return (
      <Badge color="gray" variant="light" size={badgeSize}>
        Unclaimed profile
      </Badge>
    );
  }

  if (presentation.ownershipStatus === 'CLAIM_PENDING') {
    return (
      <Badge color="yellow" variant="light" size={badgeSize} leftSection={<ShieldAlert size={12} />}>
        Claim pending
      </Badge>
    );
  }

  if (presentation.ownershipStatus === 'DISPUTED' || presentation.ownershipStatus === 'REVIEW_REQUIRED') {
    return (
      <Badge color="yellow" variant="light" size={badgeSize} leftSection={<ShieldAlert size={12} />}>
        Ownership under review
      </Badge>
    );
  }

  if (presentation.ownershipStatus === 'SUSPENDED') {
    return (
      <Badge color="red" variant="light" size={badgeSize} leftSection={<ShieldAlert size={12} />}>
        Ownership restricted
      </Badge>
    );
  }

  return (
    <Group gap={6} wrap="wrap">
      <Badge color="blue" variant="light" size={badgeSize} leftSection={<Check size={12} />}>
        Claimed profile
      </Badge>
      {presentation.claimVerificationLevel === 'SITE_CONTROL' ? (
        <Badge color="teal" variant="light" size={badgeSize} leftSection={<Diamond size={10} />}>
          Website verified
        </Badge>
      ) : null}
    </Group>
  );
}
