export type OrganizationTab =
  | 'overview'
  | 'events'
  | 'eventTemplates'
  | 'teams'
  | 'users'
  | 'fields'
  | 'staff'
  | 'discounts'
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
  fields: 'facilities',
  staff: 'staff',
  discounts: 'discounts',
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
  facilities: 'fields',
  resources: 'fields',
  staff: 'staff',
  discounts: 'discounts',
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

const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const getOrganizationPathSegments = (pathname?: string | null): string[] => (
  String(pathname ?? '')
    .split(/[?#]/, 1)[0]
    .split('/')
    .filter(Boolean)
    .map(decodePathSegment)
);

export const resolveOrganizationRouteTab = ({
  pathname,
  organizationId,
  queryTab,
}: {
  pathname?: string | null;
  organizationId?: string | null;
  queryTab?: string | null;
}): OrganizationTab | null => {
  const queryTabValue = organizationTabFromPathSegment(queryTab);
  const segments = getOrganizationPathSegments(pathname);
  if (segments[0] !== 'organizations') {
    return queryTabValue;
  }
  if (organizationId && segments[1] !== organizationId) {
    return queryTabValue;
  }

  const pathTab = organizationTabFromPathSegment(segments[2]);
  if (pathTab) {
    return pathTab;
  }
  if (queryTabValue) {
    return queryTabValue;
  }

  return segments.length === 2 ? 'overview' : null;
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
  canManageDiscounts?: boolean;
  hasTeams?: boolean;
  hasRentals?: boolean;
  hasResources?: boolean;
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
  canManageDiscounts = false,
  hasTeams = false,
  hasRentals = false,
  hasResources = false,
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

  if (isOwner || canManageDiscounts) {
    tabs.push({ label: 'Discounts', value: 'discounts' });
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

  if (isOrganizationRoleMember || canManageFields || hasRentals || hasResources) {
    tabs.push({ label: 'Facilities', value: 'fields' });
  }

  if (isOrganizationRoleMember || canManageProducts || hasProducts) {
    tabs.push({ label: 'Store', value: 'store' });
  }

  return tabs;
};
