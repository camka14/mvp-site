import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreateOrganizationModal from '../CreateOrganizationModal';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const createOrganizationMock = jest.fn();
const updateOrganizationMock = jest.fn();
const findOrganizationMatchesMock = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
    updateOrganization: (...args: unknown[]) => updateOrganizationMock(...args),
    findOrganizationMatches: (...args: unknown[]) => findOrganizationMatchesMock(...args),
  },
}));

jest.mock('@mantine/notifications', () => ({
  notifications: {
    show: jest.fn(),
  },
  Notifications: () => null,
}));

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    location: { lat: 40.7128, lng: -74.006 },
    locationInfo: { city: 'New York', state: 'NY' },
  }),
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => ({
    sports: [{ name: 'Basketball' }, { name: 'Soccer' }],
    loading: false,
    error: null,
  }),
}));

jest.mock('@/components/location/LocationSelector', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ value, onChange }: any) =>
      React.createElement('input', {
        'aria-label': 'Location',
        value: value ?? '',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          onChange?.(event.target.value, 40.7128, -74.006, event.target.value);
        },
      }),
  };
});

jest.mock('../ImageUploader', () => ({
  ImageUploader: ({ placeholder }: { placeholder: string }) => (
    <div>{placeholder}</div>
  ),
}));

describe('CreateOrganizationModal', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    }) as unknown as typeof fetch;
    createOrganizationMock.mockReset();
    updateOrganizationMock.mockReset();
    findOrganizationMatchesMock.mockReset();
    findOrganizationMatchesMock.mockResolvedValue({
      matches: [],
      matchToken: 'match-token',
      expiresInSeconds: 600,
      acknowledgedMatchIds: [],
      canContinue: true,
    });
    createOrganizationMock.mockResolvedValue({
      $id: 'org_1',
      name: 'Downtown Sports',
    });
    updateOrganizationMock.mockResolvedValue({
      $id: 'org_1',
      name: 'Downtown Sports',
      status: 'UNLISTED',
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('submits tax setting checkbox values without relying on the event during state updates', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'Downtown Sports');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Tax settings');
    await user.click(screen.getByLabelText(/operates or rents out an athletic facility/i));
    await user.click(screen.getByLabelText(/responsible for determining taxability/i));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(createOrganizationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Downtown Sports',
          ownerId: 'user_1',
          status: 'LISTED',
          operatesAthleticFacility: true,
          defaultEventTaxHandling: 'STRIPE_TAX',
          defaultRentalTaxHandling: 'STRIPE_TAX',
          taxResponsibilityAgreementAccepted: true,
          organizationMatchToken: 'match-token',
        }),
      );
    });
  });

  it('submits an unlisted visibility selection when creating an organization', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'Private Training Lab');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Tax settings');
    fireEvent.mouseDown(screen.getByRole('textbox', { name: /visibility/i }));
    const unlistedOption = await screen.findByText('Unlisted', { selector: '[data-combobox-option] span' });
    await user.click(unlistedOption);
    await user.click(screen.getByLabelText(/responsible for determining taxability/i));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(createOrganizationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Private Training Lab',
          ownerId: 'user_1',
          status: 'UNLISTED',
        }),
      );
    });
  });

  it('submits visibility changes from the edit organization modal', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
        organization={{
          $id: 'org_1',
          name: 'Downtown Sports',
          status: 'LISTED',
          location: 'New York, NY',
          coordinates: [-74.006, 40.7128],
          taxResponsibilityAcceptedAt: '2026-05-12T00:00:00.000Z',
        } as any}
      />,
    );

    expect(await screen.findByRole('textbox', { name: /visibility/i })).toHaveValue('Listed');

    fireEvent.mouseDown(screen.getByRole('textbox', { name: /visibility/i }));
    const unlistedOption = await screen.findByText('Unlisted', { selector: '[data-combobox-option] span' });
    await user.click(unlistedOption);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateOrganizationMock).toHaveBeenCalledWith(
        'org_1',
        expect.objectContaining({
          name: 'Downtown Sports',
          status: 'UNLISTED',
        }),
      );
    });
  });

  it('applies club feature and tag presets to a newly created organization', async () => {
    const user = userEvent.setup();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tags: [{ $id: 'tag_club', name: 'Club', slug: 'club', isSystem: true }],
      }),
    }) as unknown as typeof fetch;

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
        initialFeatures={['CLUB_TEAMS', 'EVENT_MANAGEMENT']}
        initialTagSlugs={['club']}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'Northside Soccer Club');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Tax settings');
    expect(screen.getByLabelText(/club and team tools/i)).toBeChecked();
    expect(screen.getByLabelText(/event management tools/i)).toBeChecked();
    expect(await screen.findByText('Club')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/responsible for determining taxability/i));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(createOrganizationMock).toHaveBeenCalledWith(expect.objectContaining({
        enabledFeatures: ['CLUB_TEAMS', 'EVENT_MANAGEMENT'],
        tags: [expect.objectContaining({ $id: 'tag_club', slug: 'club' })],
      }));
    });
  });

  it('routes an exact unclaimed affiliate match into claiming instead of organization creation', async () => {
    const user = userEvent.setup();
    findOrganizationMatchesMock.mockResolvedValue({
      matches: [{
        organizationId: 'org_affiliate',
        name: 'River City Sports Club',
        logoUrl: null,
        approximateLocation: 'Portland, OR',
        profileUrl: '/organizations/org_affiliate',
        claimUrl: '/organizations/org_affiliate/claim',
        confidence: 'EXACT',
        reasonCodes: ['EXACT_OFFICIAL_URL'],
        originType: 'AFFILIATE_IMPORTED',
        ownershipStatus: 'UNCLAIMED',
        claimVerificationLevel: 'NONE',
        recommendedAction: 'CLAIM_PROFILE',
        availableActions: ['CLAIM_PROFILE', 'OPEN_PROFILE'],
        submittedWebsiteDomain: 'rivercitysports.com',
        blocksCreation: true,
      }],
      matchToken: 'blocked-match-token',
      expiresInSeconds: 600,
      acknowledgedMatchIds: [],
      canContinue: false,
    });

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'River City Sports Club');
    expect(await screen.findByRole('link', { name: 'Claim this profile' })).toHaveAttribute(
      'href',
      '/organizations/org_affiliate/claim',
    );
    expect(screen.getByText('Unclaimed profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it('offers owner transfer and dispute paths for a claimed match without staff-access requests', async () => {
    const user = userEvent.setup();
    findOrganizationMatchesMock.mockResolvedValue({
      matches: [{
        organizationId: 'org_claimed',
        name: 'River City Sports Club',
        logoUrl: null,
        approximateLocation: 'Portland, OR',
        profileUrl: '/organizations/org_claimed',
        claimUrl: '/organizations/org_claimed/claim',
        confidence: 'EXACT',
        reasonCodes: ['EXACT_OFFICIAL_URL'],
        originType: 'AFFILIATE_IMPORTED',
        ownershipStatus: 'CLAIMED',
        claimVerificationLevel: 'SITE_CONTROL',
        recommendedAction: 'OPEN_PROFILE',
        availableActions: [
          'OPEN_PROFILE',
          'REQUEST_OWNERSHIP_TRANSFER',
          'REPORT_OWNERSHIP_ISSUE',
        ],
        submittedWebsiteDomain: 'rivercitysports.com',
        blocksCreation: true,
      }],
      matchToken: 'blocked-match-token',
      expiresInSeconds: 600,
      acknowledgedMatchIds: [],
      canContinue: false,
    });

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'River City Sports Club');
    expect(await screen.findByRole('link', { name: 'Request ownership transfer' })).toHaveAttribute(
      'href',
      '/organizations/org_claimed/claim?requestType=OWNERSHIP_TRANSFER',
    );
    expect(screen.getByRole('link', { name: 'Report an ownership issue' })).toBeInTheDocument();
    expect(screen.queryByText(/staff access/i)).not.toBeInTheDocument();
  });
});
