export type OrganizationTab =
  | 'overview'
  | 'events'
  | 'eventTemplates'
  | 'teams'
  | 'users'
  | 'fields'
  | 'staff'
  | 'finance'
  | 'refunds'
  | 'publicPage'
  | 'store'
  | 'templates';

export type OrganizationTabOption = {
  label: string;
  value: OrganizationTab;
};

export type OrganizationCustomerRouteType = 'users' | 'teams';

const ORGANIZATION_TAB_TO_PATH_SEGMENT: Record<OrganizationTab, string> = {
  overview: '',
  events: 'events',
  eventTemplates: 'event-templates',
  teams: 'teams',
  users: 'customers',
  fields: 'fields',
  staff: 'staff',
  finance: 'finance',
  refunds: 'refunds',
  publicPage: 'public-page',
  store: 'store',
  templates: 'document-templates',
};

const ORGANIZATION_TAB_ALIASES: Record<string, OrganizationTab> = {
  overview: 'overview',
  events: 'events',
  eventTemplates: 'eventTemplates',
  'event-templates': 'eventTemplates',
  teams: 'teams',
  users: 'users',
  customers: 'users',
  fields: 'fields',
  staff: 'staff',
  finance: 'finance',
  refunds: 'refunds',
  publicPage: 'publicPage',
  'public-page': 'publicPage',
  store: 'store',
  templates: 'templates',
  'document-templates': 'templates',
};

export const organizationTabFromPathSegment = (segment?: string | null): OrganizationTab | null => {
  const normalized = String(segment ?? '').trim();
  return normalized ? ORGANIZATION_TAB_ALIASES[normalized] ?? null : null;
};

export const buildOrganizationTabPath = (organizationId: string, tab: OrganizationTab): string => {
  const encodedOrganizationId = encodeURIComponent(organizationId);
  const segment = ORGANIZATION_TAB_TO_PATH_SEGMENT[tab];
  return segment ? `/organizations/${encodedOrganizationId}/${segment}` : `/organizations/${encodedOrganizationId}`;
};

export const buildOrganizationCustomerPath = (
  organizationId: string,
  customerType: OrganizationCustomerRouteType,
  customerId: string,
): string => (
  `${buildOrganizationTabPath(organizationId, 'users')}/${customerType}/${encodeURIComponent(customerId)}`
);

type BuildOrganizationTabsParams = {
  viewerCanAccessUsers?: boolean;
  isOwner?: boolean;
  isOrganizationRoleMember?: boolean;
  canManageStaff?: boolean;
  canManageTemplates?: boolean;
  canManageRefunds?: boolean;
  canManageFinance?: boolean;
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
  canManageFinance = false,
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

  if (isOwner || canManageFinance) {
    tabs.push({ label: 'Finance', value: 'finance' });
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
