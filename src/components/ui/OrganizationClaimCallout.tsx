'use client';

import Link from 'next/link';
import { Button, Text } from '@mantine/core';

import { getOrganizationOwnershipPresentation } from '@/lib/organizationOwnership';
import type { Organization } from '@/types';

type OrganizationClaimCalloutProps = {
  organization: Pick<
    Organization,
    '$id' | 'name' | 'originType' | 'ownershipStatus' | 'claimVerificationLevel'
  >;
  compact?: boolean;
};

type OrganizationClaimButtonProps = Pick<OrganizationClaimCalloutProps, 'organization'>;

export function OrganizationClaimButton({
  organization,
}: OrganizationClaimButtonProps) {
  const presentation = getOrganizationOwnershipPresentation(organization);

  if (presentation.ownershipStatus !== 'UNCLAIMED') {
    return null;
  }

  return (
    <Button
      component={Link}
      href={presentation.claimUrl}
      size="sm"
      variant="filled"
      className="shrink-0"
    >
      Claim this profile
    </Button>
  );
}

export default function OrganizationClaimCallout({
  organization,
  compact = false,
}: OrganizationClaimCalloutProps) {
  const presentation = getOrganizationOwnershipPresentation(organization);

  if (presentation.ownershipStatus === 'UNCLAIMED') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text size={compact ? 'xs' : 'sm'} fw={700} c="blue.9">
            Do you represent {organization.name}?
          </Text>
          <Text size="xs" c="blue.8">
            Claim this profile to manage its details, enable reviews, and build trust.
          </Text>
        </div>
        <Button
          component={Link}
          href={presentation.claimUrl}
          size="xs"
          variant="filled"
          className="shrink-0"
        >
          Claim this profile
        </Button>
      </div>
    );
  }

  if (presentation.ownershipStatus === 'CLAIMED') {
    return (
      <div className="flex items-center justify-between gap-3">
        <Text size="xs" c="dimmed">Is this profile claimed by the wrong person?</Text>
        <Button
          component={Link}
          href={`${presentation.claimUrl}?requestType=OWNERSHIP_DISPUTE`}
          size="compact-xs"
          variant="subtle"
        >
          Report an ownership issue
        </Button>
      </div>
    );
  }

  return null;
}
