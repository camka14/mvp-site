export type OrganizationTab =
  | 'overview'
  | 'events'
  | 'eventTemplates'
  | 'teams'
  | 'users'
  | 'fields'
  | 'staff'
  | 'refunds'
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
  hasTeams?: boolean;
  hasRentals?: boolean;
  hasProducts?: boolean;
};

export const buildOrganizationTabs = ({
  viewerCanAccessUsers = false,
  isOwner = false,
  isOrganizationRoleMember = false,
  hasTeams = false,
  hasRentals = false,
  hasProducts = false,
}: BuildOrganizationTabsParams): OrganizationTabOption[] => {
  const tabs: OrganizationTabOption[] = [
    { label: 'Overview', value: 'overview' },
    { label: 'Events', value: 'events' },
  ];

  if (isOrganizationRoleMember || hasTeams) {
    tabs.push({ label: 'Teams', value: 'teams' });
  }

  if (viewerCanAccessUsers) {
    tabs.push({ label: 'Users', value: 'users' });
  }

  if (isOwner) {
    tabs.push({ label: 'Event Templates', value: 'eventTemplates' });
    tabs.push({ label: 'Document Templates', value: 'templates' });
    tabs.push({ label: 'Staff', value: 'staff' });
    tabs.push({ label: 'Refunds', value: 'refunds' });
  }

  if (isOrganizationRoleMember || hasRentals) {
    tabs.push({ label: 'Fields', value: 'fields' });
  }

  if (isOrganizationRoleMember || hasProducts) {
    tabs.push({ label: 'Store', value: 'store' });
  }

  return tabs;
};
