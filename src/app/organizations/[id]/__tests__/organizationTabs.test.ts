import { buildOrganizationTabs } from '../organizationTabs';

describe('buildOrganizationTabs', () => {
  it('hides empty teams, rentals, and store tabs for non-members', () => {
    expect(buildOrganizationTabs({
      isOrganizationRoleMember: false,
      hasTeams: false,
      hasRentals: false,
      hasProducts: false,
    })).toEqual([
      { label: 'Overview', value: 'overview' },
      { label: 'Events', value: 'events' },
    ]);
  });

  it('shows populated public tabs for non-members', () => {
    expect(buildOrganizationTabs({
      isOrganizationRoleMember: false,
      hasTeams: true,
      hasRentals: true,
      hasProducts: true,
    })).toEqual([
      { label: 'Overview', value: 'overview' },
      { label: 'Events', value: 'events' },
      { label: 'Teams', value: 'teams' },
      { label: 'Fields', value: 'fields' },
      { label: 'Store', value: 'store' },
    ]);
  });

  it('keeps management tabs visible for organization members even when empty', () => {
    expect(buildOrganizationTabs({
      viewerCanAccessUsers: true,
      isOwner: true,
      isOrganizationRoleMember: true,
      hasTeams: false,
      hasRentals: false,
      hasProducts: false,
    })).toEqual([
      { label: 'Overview', value: 'overview' },
      { label: 'Events', value: 'events' },
      { label: 'Teams', value: 'teams' },
      { label: 'Users', value: 'users' },
      { label: 'Event Templates', value: 'eventTemplates' },
      { label: 'Document Templates', value: 'templates' },
      { label: 'Staff', value: 'staff' },
      { label: 'Refunds', value: 'refunds' },
      { label: 'Public Page', value: 'publicPage' },
      { label: 'Fields', value: 'fields' },
      { label: 'Store', value: 'store' },
    ]);
  });
});
