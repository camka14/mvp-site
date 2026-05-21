export type OrganizationTab =
  | 'overview'
  | 'events'
  | 'eventTemplates'
  | 'teams'
  | 'users'
  | 'fields'
  | 'staff'
  | 'refunds'
  | 'publicPage'
  | 'store'
  | 'templates';

export type OrganizationTabOption = {
  label: string;
  value: OrganizationTab;
};

type BuildOrganizationTabsParams = {
  viewerCanAccessUsers?: boolean;
  isOwner?: boolean;
  isOrganizationRoleMember?: boolean;
  canManageStaff?: boolean;
  canManageTemplates?: boolean;
  canManageRefunds?: boolean;
  canManagePublicPage?: boolean;
  canManageTeams?: boolean;
  canManageFields?: boolean;
  canManageProducts?: boolean;
  hasTeams?: boolean;
  hasRentals?: boolean;
  hasProducts?: boolean;
};

export const buildOrganizationTabs = ({
  viewerCanAccessUsers = false,
  isOwner = false,
  isOrganizationRoleMember = false,
  canManageStaff = false,
  canManageTemplates = false,
  canManageRefunds = false,
  canManagePublicPage = false,
  canManageTeams = false,
  canManageFields = false,
  canManageProducts = false,
  hasTeams = false,
  hasRentals = false,
  hasProducts = false,
}: BuildOrganizationTabsParams): OrganizationTabOption[] => {
  const tabs: OrganizationTabOption[] = [
    { label: 'Overview', value: 'overview' },
    { label: 'Events', value: 'events' },
  ];

  if (isOrganizationRoleMember || canManageTeams || hasTeams) {
    tabs.push({ label: 'Teams', value: 'teams' });
  }

  if (viewerCanAccessUsers) {
    tabs.push({ label: 'Customers', value: 'users' });
  }

  if (isOwner || canManageTemplates) {
    tabs.push({ label: 'Event Templates', value: 'eventTemplates' });
    tabs.push({ label: 'Document Templates', value: 'templates' });
  }

  if (isOwner || canManageStaff) {
    tabs.push({ label: 'Staff', value: 'staff' });
  }

  if (isOwner || canManageRefunds) {
    tabs.push({ label: 'Refunds', value: 'refunds' });
  }

  if (isOwner || canManagePublicPage) {
    tabs.push({ label: 'Public Page', value: 'publicPage' });
  }

  if (isOrganizationRoleMember || canManageFields || hasRentals) {
    tabs.push({ label: 'Fields', value: 'fields' });
  }

  if (isOrganizationRoleMember || canManageProducts || hasProducts) {
    tabs.push({ label: 'Store', value: 'store' });
  }

  return tabs;
};
