import {
  buildOrganizationCustomerPath,
  buildOrganizationTabPath,
  buildOrganizationTabs,
  organizationTabFromPathSegment,
} from '../organizationTabs';

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
      { label: 'Customers', value: 'users' },
      { label: 'Event Templates', value: 'eventTemplates' },
      { label: 'Document Templates', value: 'templates' },
      { label: 'Staff', value: 'staff' },
      { label: 'Finance', value: 'finance' },
      { label: 'Refunds', value: 'refunds' },
      { label: 'Public Page', value: 'publicPage' },
      { label: 'Fields', value: 'fields' },
      { label: 'Store', value: 'store' },
    ]);
  });

  it('shows only permission-backed management tabs for custom staff roles', () => {
    expect(buildOrganizationTabs({
      isOrganizationRoleMember: true,
      canManageTeams: true,
      canManageFields: true,
      canManageStaff: true,
      hasTeams: false,
      hasRentals: false,
      hasProducts: false,
    })).toEqual([
      { label: 'Overview', value: 'overview' },
      { label: 'Events', value: 'events' },
      { label: 'Teams', value: 'teams' },
      { label: 'Staff', value: 'staff' },
      { label: 'Fields', value: 'fields' },
      { label: 'Store', value: 'store' },
    ]);
  });

  it('shows finance for staff with billing or payment management access', () => {
    expect(buildOrganizationTabs({
      isOrganizationRoleMember: true,
      canManageFinance: true,
      hasTeams: false,
      hasRentals: false,
      hasProducts: false,
    })).toEqual([
      { label: 'Overview', value: 'overview' },
      { label: 'Events', value: 'events' },
      { label: 'Teams', value: 'teams' },
      { label: 'Finance', value: 'finance' },
      { label: 'Fields', value: 'fields' },
      { label: 'Store', value: 'store' },
    ]);
  });

  it('maps organization tabs to shareable path segments', () => {
    expect(buildOrganizationTabPath('org_1', 'overview')).toBe('/organizations/org_1');
    expect(buildOrganizationTabPath('org_1', 'finance')).toBe('/organizations/org_1/finance');
    expect(buildOrganizationTabPath('org_1', 'users')).toBe('/organizations/org_1/customers');
    expect(buildOrganizationTabPath('org_1', 'publicPage')).toBe('/organizations/org_1/public-page');
    expect(organizationTabFromPathSegment('customers')).toBe('users');
    expect(organizationTabFromPathSegment('event-templates')).toBe('eventTemplates');
    expect(organizationTabFromPathSegment('unknown')).toBeNull();
  });

  it('builds selected customer paths under the customers tab', () => {
    expect(buildOrganizationCustomerPath('org_1', 'users', 'user_1')).toBe('/organizations/org_1/customers/users/user_1');
    expect(buildOrganizationCustomerPath('org_1', 'teams', 'team_1')).toBe('/organizations/org_1/customers/teams/team_1');
  });
});
