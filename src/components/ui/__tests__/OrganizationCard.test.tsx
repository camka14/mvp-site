import { screen } from '@testing-library/react';

import type { Organization } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import OrganizationCard from '../OrganizationCard';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ unoptimized: _unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
    unoptimized?: boolean;
  }) => <img {...props} alt={props.alt ?? ''} />,
}));

describe('OrganizationCard ownership presentation', () => {
  it('shows organization details without ownership or verification badges', () => {
    const organization = {
      $id: 'org-1',
      name: 'River City Sports Club',
      website: 'https://rivercitysports.example',
      location: 'Portland, OR',
      ownershipStatus: 'CLAIMED',
      claimVerificationLevel: 'SITE_CONTROL',
      verificationStatus: 'VERIFIED',
    } as Organization;

    renderWithMantine(<OrganizationCard organization={organization} />);

    expect(screen.getByText('River City Sports Club')).toBeInTheDocument();
    expect(screen.getByText('Portland, OR')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-card-badges')).not.toBeInTheDocument();
    expect(screen.queryByText('Claimed profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Website verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });
});
