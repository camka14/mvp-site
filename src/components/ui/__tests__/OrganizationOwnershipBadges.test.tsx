import { screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import type { Organization } from '@/types';

import OrganizationClaimCallout, {
  OrganizationClaimButton,
} from '../OrganizationClaimCallout';
import OrganizationOwnershipBadges from '../OrganizationOwnershipBadges';

const organization = {
  $id: 'org-1',
  name: 'River City Sports Club',
  originType: 'AFFILIATE_IMPORTED',
  ownershipStatus: 'CLAIMED',
  claimVerificationLevel: 'SITE_CONTROL',
} satisfies Pick<
  Organization,
  '$id' | 'name' | 'originType' | 'ownershipStatus' | 'claimVerificationLevel'
>;

describe('organization ownership presentation', () => {
  it('shows claimed and website-verified badges separately', () => {
    renderWithMantine(<OrganizationOwnershipBadges organization={organization} />);

    expect(screen.getByText('Claimed profile')).toBeInTheDocument();
    expect(screen.getByText('Website verified')).toBeInTheDocument();
  });

  it('shows an unclaimed badge and a claim action', () => {
    const unclaimed = {
      ...organization,
      ownershipStatus: 'UNCLAIMED' as const,
      claimVerificationLevel: 'NONE' as const,
    };
    renderWithMantine(
      <>
        <OrganizationOwnershipBadges organization={unclaimed} />
        <OrganizationClaimButton organization={unclaimed} />
      </>,
    );

    expect(screen.getByText('Unclaimed profile')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Claim this profile' })).toHaveAttribute(
      'href',
      '/organizations/org-1/claim',
    );
  });

  it('does not show the profile-header claim action after the profile is claimed', () => {
    renderWithMantine(<OrganizationClaimButton organization={organization} />);

    expect(screen.queryByRole('link', { name: 'Claim this profile' })).not.toBeInTheDocument();
  });

  it('offers a dispute for a claimed profile without offering staff access', () => {
    renderWithMantine(<OrganizationClaimCallout organization={organization} />);

    expect(screen.getByRole('link', { name: 'Report an ownership issue' })).toHaveAttribute(
      'href',
      '/organizations/org-1/claim?requestType=OWNERSHIP_DISPUTE',
    );
    expect(screen.queryByText(/staff access/i)).not.toBeInTheDocument();
  });
});
