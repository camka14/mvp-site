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

  it('shows enabled organization capabilities as compact badges', () => {
    const organization = {
      $id: 'org-2',
      name: 'Summit United',
      enabledFeatures: ['CLUB_TEAMS', 'FACILITIES_RENTALS', 'EVENT_MANAGEMENT'],
    } as Organization;

    renderWithMantine(<OrganizationCard organization={organization} />);

    expect(screen.getByTestId('organization-card-badges')).toBeInTheDocument();
    expect(screen.getByText('Club & Teams')).toBeInTheDocument();
    expect(screen.getByText('Rentals')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('only shows badges for enabled capabilities', () => {
    const organization = {
      $id: 'org-3',
      name: 'River City Events',
      enabledFeatures: ['EVENT_MANAGEMENT'],
    } as Organization;

    renderWithMantine(<OrganizationCard organization={organization} />);

    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.queryByText('Club & Teams')).not.toBeInTheDocument();
    expect(screen.queryByText('Rentals')).not.toBeInTheDocument();
  });
});
