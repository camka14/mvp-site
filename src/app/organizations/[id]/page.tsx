"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationVerificationBadge from '@/components/ui/OrganizationVerificationBadge';
import { Badge, Checkbox, Container, Group, Title, Text, Button, Paper, SegmentedControl, SimpleGrid, Stack, TextInput, Select, NumberInput, Modal, Textarea, Switch, FileInput, Table, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import EventCard from '@/components/ui/EventCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import { useApp } from '@/app/providers';
import type { BillingAddress, Event, Organization, Product, ProductType, Team, UserData, PaymentIntent, StaffMemberType, TemplateDocument } from '@/types';
import { formatPrice } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { eventService } from '@/lib/eventService';
import { createId } from '@/lib/id';
import { buildOrganizationEventCreateUrl } from '@/lib/eventCreateNavigation';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import TeamDetailModal from '@/components/ui/TeamDetailModal';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import CentsInput from '@/components/ui/CentsInput';
import { paymentService } from '@/lib/paymentService';
import { userService } from '@/lib/userService';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { hasStaffMemberType } from '@/lib/staff';
import { productService } from '@/lib/productService';
import { boldsignService } from '@/lib/boldsignService';
import PaymentModal from '@/components/ui/PaymentModal';
import FieldsTabContent from './FieldsTabContent';
import RoleRosterManager, { type RoleInviteRow, type RoleRosterEntry } from './RoleRosterManager';
import { formatDisplayDateTime } from '@/lib/dateUtils';
import { useLocation } from '@/app/hooks/useLocation';
import { useDebounce } from '@/app/hooks/useDebounce';
import { useSports } from '@/app/hooks/useSports';
import EventsTabContent from '@/app/discover/components/EventsTabContent';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import {
  getRequiredSignerTypeLabel,
  normalizeRequiredSignerType,
} from '@/lib/templateSignerTypes';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import {
  defaultProductTypeForPeriod,
  deriveProductTypeFromTaxCategory,
  getProductTypeOptionsForPeriod,
} from '@/lib/productTypes';
import { normalizePriceCents } from '@/lib/priceUtils';
import {
  canOrganizationUsePaidBilling,
  organizationVerificationStatusLabel,
  resolveOrganizationVerificationStatus,
} from '@/lib/organizationVerification';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import { buildOrganizationTabs, type OrganizationTab } from './organizationTabs';
import { buildOrganizationUsersSubtitle } from './organizationUsersCopy';
import OrganizationPublicSettingsPanel from './OrganizationPublicSettingsPanel';

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization..." />}>
      <OrganizationDetailContent />
    </Suspense>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORG_EVENTS_LIMIT = 18;
const ORG_EVENTS_DEFAULT_MAX_DISTANCE = 50;
const ORG_HOSTED_EVENT_TYPE_OPTIONS = ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'] as const;
const ORG_EVENT_TYPE_OPTIONS = [...ORG_HOSTED_EVENT_TYPE_OPTIONS, 'RENTAL'] as const;
const PRODUCT_PERIOD_OPTIONS: Array<{ label: string; value: Product['period'] }> = [
  { label: 'Single purchase', value: 'single' },
  { label: 'Month', value: 'month' },
  { label: 'Week', value: 'week' },
  { label: 'Year', value: 'year' },
];
type OrganizationEventTypeFilter = (typeof ORG_EVENT_TYPE_OPTIONS)[number];

const isSinglePurchasePeriod = (period: Product['period'] | string | null | undefined): boolean =>
  String(period ?? '').trim().toLowerCase() === 'single';

const resolveProductEditorPeriod = (period: Product['period'] | string | null | undefined): Product['period'] => {
  const normalized = String(period ?? '').trim().toLowerCase();
  if (
    normalized === 'single'
    || normalized === 'week'
    || normalized === 'month'
    || normalized === 'year'
  ) {
    return normalized as Product['period'];
  }
  return 'month';
};

const resolveProductEditorType = (
  productType: ProductType | null | undefined,
  taxCategory: Product['taxCategory'] | null | undefined,
  period: Product['period'],
): ProductType => {
  if (productType) {
    return productType;
  }
  return deriveProductTypeFromTaxCategory(taxCategory, period);
};

const maybeCarryDefaultProductType = (
  currentProductType: ProductType,
  previousPeriod: Product['period'],
  nextPeriod: Product['period'],
): ProductType => (
  currentProductType === defaultProductTypeForPeriod(previousPeriod)
    ? defaultProductTypeForPeriod(nextPeriod)
    : currentProductType
);

const formatProductPeriodLabel = (period: Product['period'] | string | null | undefined): string => {
  const normalized = resolveProductEditorPeriod(period);
  if (normalized === 'single') return 'Single purchase';
  if (normalized === 'week') return 'Weekly';
  if (normalized === 'year') return 'Yearly';
  return 'Monthly';
};

const formatProductRecurringSuffix = (period: Product['period'] | string | null | undefined): string => {
  const normalized = resolveProductEditorPeriod(period);
  if (normalized === 'week') return 'week';
  if (normalized === 'year') return 'year';
  return 'month';
};

const formatProductPriceLabel = (product: Product): string => (
  isSinglePurchasePeriod(product.period)
    ? formatPrice(product.priceCents)
    : `${formatPrice(product.priceCents)} / ${formatProductRecurringSuffix(product.period)}`
);

const resolveProductCheckoutLabel = (product: Product, isOwner: boolean): string => {
  if (isSinglePurchasePeriod(product.period)) {
    return isOwner ? 'Preview purchase' : 'Buy now';
  }
  return isOwner ? 'Preview subscription' : 'Subscribe';
};

const isProductTypeTaxable = (productType: ProductType | null | undefined): boolean =>
  productType !== 'NON_TAXABLE_ITEM';

const normalizeTemplateType = (value: unknown): TemplateDocument['type'] => {
  if (typeof value === 'string' && value.toUpperCase() === 'TEXT') {
    return 'TEXT';
  }
  return 'PDF';
};

const mapTemplateRow = (row: Record<string, any>): TemplateDocument => {
  const roleIndexRaw = row?.roleIndex;
  const roleIndex = typeof roleIndexRaw === 'number' ? roleIndexRaw : Number(roleIndexRaw);
  const roleIndexesRaw = Array.isArray(row?.roleIndexes) ? row.roleIndexes : undefined;
  const roleIndexes = roleIndexesRaw
    ? roleIndexesRaw
        .map((entry: unknown) => Number(entry))
        .filter((value: number) => Number.isFinite(value))
    : undefined;
  const signerRolesRaw = Array.isArray(row?.signerRoles) ? row.signerRoles : undefined;
  const signerRoles = signerRolesRaw
    ? signerRolesRaw
        .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry: string) => entry.trim())
    : undefined;
  const signOnceRaw = row?.signOnce;
  const requiredSignerType = normalizeRequiredSignerType(row?.requiredSignerType);

  return {
    $id: String(row?.$id ?? ''),
    templateId: row?.templateId ?? undefined,
    organizationId: row?.organizationId ?? '',
    title: row?.title ?? 'Untitled Template',
    description: row?.description ?? undefined,
    signOnce: typeof signOnceRaw === 'boolean' ? signOnceRaw : signOnceRaw == null ? true : Boolean(signOnceRaw),
    status: row?.status ?? undefined,
    roleIndex: Number.isFinite(roleIndex) ? roleIndex : undefined,
    roleIndexes: roleIndexes && roleIndexes.length ? roleIndexes : undefined,
    signerRoles: signerRoles && signerRoles.length ? signerRoles : undefined,
    requiredSignerType,
    type: normalizeTemplateType(row?.type),
    content: row?.content ?? undefined,
    $createdAt: row?.$createdAt ?? undefined,
  };
};

type PendingTemplateCreateCard = {
  localId: string;
  operationId: string;
  templateId?: string;
  templateDocumentId?: string;
  title: string;
  description?: string;
  signOnce: boolean;
  requiredSignerType: 'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD';
  status: string;
  error?: string;
};

type OrganizationUserEventSummary = {
  eventId: string;
  eventName: string;
  start?: string;
  end?: string;
  status?: string;
};

type OrganizationUserDocumentSummary = {
  signedDocumentRecordId: string;
  documentId: string;
  templateId: string;
  eventId?: string;
  eventName?: string;
  title: string;
  type: 'PDF' | 'TEXT';
  status?: string;
  signedAt?: string;
  viewUrl?: string;
  content?: string;
};

type OrganizationUserSummary = {
  userId: string;
  fullName: string;
  userName?: string;
  events: OrganizationUserEventSummary[];
  documents: OrganizationUserDocumentSummary[];
};

const mapOrganizationUserRow = (row: Record<string, any>): OrganizationUserSummary => {
  const eventsRaw = Array.isArray(row?.events) ? row.events : [];
  const documentsRaw = Array.isArray(row?.documents) ? row.documents : [];

  const events = eventsRaw
    .map((eventRow: Record<string, any>): OrganizationUserEventSummary => ({
      eventId: String(eventRow?.eventId ?? ''),
      eventName: String(eventRow?.eventName ?? 'Untitled Event').trim() || 'Untitled Event',
      start: typeof eventRow?.start === 'string' ? eventRow.start : undefined,
      end: typeof eventRow?.end === 'string' ? eventRow.end : undefined,
      status: typeof eventRow?.status === 'string' ? eventRow.status : undefined,
    }))
    .filter((eventRow) => Boolean(eventRow.eventId));

  const documents = documentsRaw
    .map((documentRow: Record<string, any>): OrganizationUserDocumentSummary => ({
      signedDocumentRecordId: String(documentRow?.signedDocumentRecordId ?? ''),
      documentId: String(documentRow?.documentId ?? ''),
      templateId: String(documentRow?.templateId ?? ''),
      eventId: typeof documentRow?.eventId === 'string' ? documentRow.eventId : undefined,
      eventName: typeof documentRow?.eventName === 'string' ? documentRow.eventName : undefined,
      title: typeof documentRow?.title === 'string' && documentRow.title.trim()
        ? documentRow.title.trim()
        : 'Signed Document',
      type: documentRow?.type === 'TEXT' ? 'TEXT' : 'PDF',
      status: typeof documentRow?.status === 'string' ? documentRow.status : undefined,
      signedAt: typeof documentRow?.signedAt === 'string' ? documentRow.signedAt : undefined,
      viewUrl: typeof documentRow?.viewUrl === 'string' ? documentRow.viewUrl : undefined,
      content: typeof documentRow?.content === 'string' ? documentRow.content : undefined,
    }))
    .filter((documentRow) => Boolean(documentRow.signedDocumentRecordId));

  return {
    userId: String(row?.userId ?? ''),
    fullName: typeof row?.fullName === 'string' && row.fullName.trim() ? row.fullName.trim() : 'Unknown User',
    userName: typeof row?.userName === 'string' ? row.userName : undefined,
    events,
    documents,
  };
};

const formatSummaryDateTime = (value?: string): string => {
  if (!value) {
    return 'Unknown date';
  }
  const formatted = formatDisplayDateTime(value);
  return formatted || 'Unknown date';
};

function OrganizationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authUser, loading: authLoading, isAuthenticated, updateUser } = useApp();
  const { location, requestLocation } = useLocation();
  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrganizationTab>('overview');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showTeamDetailModal, setShowTeamDetailModal] = useState(false);
  const [showEditOrganizationModal, setShowEditOrganizationModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventDetailSheet, setShowEventDetailSheet] = useState(false);
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const sportOptions = useMemo(() => sports.map((sport) => sport.name), [sports]);
  const [eventSearchTerm, setEventSearchTerm] = useState('');
  const debouncedEventSearch = useDebounce(eventSearchTerm, 500);
  const [selectedEventTypes, setSelectedEventTypes] =
    useState<OrganizationEventTypeFilter[]>([...ORG_EVENT_TYPE_OPTIONS]);
  const selectedHostedEventTypes = useMemo(
    () => selectedEventTypes.filter((value): value is (typeof ORG_HOSTED_EVENT_TYPE_OPTIONS)[number] => value !== 'RENTAL'),
    [selectedEventTypes],
  );
  const includeRentalEventType = selectedEventTypes.includes('RENTAL');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [hideWeeklyChildEvents, setHideWeeklyChildEvents] = useState(false);
  const [eventsTabMaxDistance, setEventsTabMaxDistance] = useState<number | null>(null);
  const [eventsTabSelectedStartDate, setEventsTabSelectedStartDate] = useState<Date | null>(null);
  const [eventsTabSelectedEndDate, setEventsTabSelectedEndDate] = useState<Date | null>(null);
  const [eventsTabEvents, setEventsTabEvents] = useState<Event[]>([]);
  const [eventsTabLoadingInitial, setEventsTabLoadingInitial] = useState(true);
  const [eventsTabLoadingMore, setEventsTabLoadingMore] = useState(false);
  const [eventsTabHasMoreEvents, setEventsTabHasMoreEvents] = useState(true);
  const [eventsTabOffset, setEventsTabOffset] = useState(0);
  const [eventsTabError, setEventsTabError] = useState<string | null>(null);
  const eventsTabSentinelRef = useRef<HTMLDivElement | null>(null);
  const locationRequestAttemptedRef = useRef(false);
  const handledStripeStateRef = useRef<string | null>(null);
  const [updatingEventHostId, setUpdatingEventHostId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffResults, setStaffResults] = useState<UserData[]>([]);
  const [staffSearchLoading, setStaffSearchLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [existingStaffInviteTypes, setExistingStaffInviteTypes] = useState<StaffMemberType[]>(['HOST']);
  const [staffInvites, setStaffInvites] = useState<RoleInviteRow[]>([
    { firstName: '', lastName: '', email: '', types: ['HOST'] },
  ]);
  const [staffInviteError, setStaffInviteError] = useState<string | null>(null);
  const [invitingStaff, setInvitingStaff] = useState(false);
  const organizationVerificationStatus = resolveOrganizationVerificationStatus(org);
  const organizationHasStripeAccount = canOrganizationUsePaidBilling(org);
  const requiresStripeVerificationEmail =
    organizationVerificationStatus === 'UNVERIFIED'
    || organizationVerificationStatus === 'LEGACY_CONNECTED';
  const stripePrimaryActionLabel =
    organizationVerificationStatus === 'VERIFIED'
      ? 'Manage Stripe Account'
      : organizationVerificationStatus === 'ACTION_REQUIRED'
        ? 'Resolve verification issues'
        : organizationVerificationStatus === 'PENDING'
          ? 'Continue verification'
          : organizationVerificationStatus === 'LEGACY_CONNECTED'
            ? 'Complete verification'
            : 'Connect Stripe Account';
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [managingStripe, setManagingStripe] = useState(false);
  const [syncingOrganizationVerification, setSyncingOrganizationVerification] = useState(false);
  const [stripeEmail, setStripeEmail] = useState('');
  const [stripeEmailError, setStripeEmailError] = useState<string | null>(null);
  const [updatingHomePagePreference, setUpdatingHomePagePreference] = useState(false);
  const viewerCanManageOrganization = Boolean(org?.viewerCanManageOrganization);
  const isOwner = Boolean(
    viewerCanManageOrganization
      || (
        user
          && org
          && (
            user.$id === org.ownerId
            || (org.staffMembers ?? []).some((staffMember) => (
              staffMember.userId === user.$id
                && !staffMember.invite
                && hasStaffMemberType(staffMember, ['HOST', 'STAFF'])
            ))
          )
      ),
  );
  const isOrganizationRoleMember = Boolean(
    viewerCanManageOrganization
      || (
        user
          && org
          && (
            user.$id === org.ownerId
            || (org.staffMembers ?? []).some((staffMember) => staffMember.userId === user.$id && !staffMember.invite)
          )
      ),
  );
  const isCurrentOrganizationHomePage = Boolean(
    user?.homePageOrganizationId
      && org
      && user.homePageOrganizationId === org.$id,
  );
  const canToggleHomePagePreference = Boolean(isOrganizationRoleMember || isCurrentOrganizationHomePage);
  const hasVisibleTeams = useMemo(
    () => Array.isArray(org?.teams) && org.teams.length > 0,
    [org?.teams],
  );
  const hasVisibleProducts = useMemo(
    () => Array.isArray(org?.products) && org.products.length > 0,
    [org?.products],
  );
  const hasVisibleRentals = useMemo(() => {
    const fields = Array.isArray(org?.fields) ? org.fields : [];
    if (!fields.length) {
      return false;
    }

    const referenceDate = new Date();
    return fields.some((field) => (
      Array.isArray(field.rentalSlots)
        && field.rentalSlots.some((slot) => Boolean(getNextRentalOccurrence(slot, referenceDate)))
    ));
  }, [org?.fields]);
  const availableTabs = useMemo(
    () => buildOrganizationTabs({
      viewerCanAccessUsers: org?.viewerCanAccessUsers,
      isOwner,
      isOrganizationRoleMember,
      hasTeams: hasVisibleTeams,
      hasRentals: hasVisibleRentals,
      hasProducts: hasVisibleProducts,
    }),
    [
      hasVisibleProducts,
      hasVisibleRentals,
      hasVisibleTeams,
      isOrganizationRoleMember,
      isOwner,
      org?.viewerCanAccessUsers,
    ],
  );
  const stripeEmailValid = useMemo(
    () => Boolean(stripeEmail && EMAIL_REGEX.test(stripeEmail.trim())),
    [stripeEmail],
  );

  useEffect(() => {
    if (!requiresStripeVerificationEmail || stripeEmail.trim().length > 0) {
      return;
    }
    const fallbackEmail =
      typeof authUser?.email === 'string' && authUser.email.trim().length > 0
        ? authUser.email.trim()
        : '';
    if (fallbackEmail) {
      setStripeEmail(fallbackEmail);
    }
  }, [authUser?.email, requiresStripeVerificationEmail, stripeEmail]);

  const overviewRecentEvents = useMemo(() => {
    const sourceEvents = Array.isArray(org?.events) ? org.events : [];
    return sourceEvents.filter((event) => {
      const normalizedEventType = typeof event.eventType === 'string' ? event.eventType.toUpperCase() : '';
      const isWeeklyEventType = normalizedEventType === 'WEEKLY_EVENT' || normalizedEventType === 'WEEKLY_EVENTS';
      const isWeeklyChildEvent = typeof event.parentEvent === 'string' && event.parentEvent.trim().length > 0;
      return !(isWeeklyEventType && isWeeklyChildEvent);
    });
  }, [org?.events]);

  const currentHostIds = useMemo(
    () => (Array.isArray(org?.hostIds) ? org.hostIds.filter((id): id is string => typeof id === 'string') : []),
    [org?.hostIds],
  );
  const currentHosts = useMemo(() => org?.hosts ?? [], [org?.hosts]);
  const ownerHost = useMemo(() => {
    if (org?.owner?.$id) {
      return org.owner;
    }
    if (org?.ownerId && user?.$id === org.ownerId) {
      return user;
    }
    return null;
  }, [org?.owner, org?.ownerId, user]);
  const currentOfficials = useMemo(() => org?.officials ?? [], [org?.officials]);
  const userDisplayName = useCallback((candidate: Partial<UserData> | undefined, fallbackId: string): string => {
    const firstName = typeof candidate?.firstName === 'string' ? candidate.firstName.trim() : '';
    const lastName = typeof candidate?.lastName === 'string' ? candidate.lastName.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) {
      return fullName;
    }
    if (typeof candidate?.userName === 'string' && candidate.userName.trim().length > 0) {
      return candidate.userName.trim();
    }
    return fallbackId;
  }, []);
  const staffRosterEntries = useMemo<RoleRosterEntry[]>(() => {
    const entries: RoleRosterEntry[] = [];
    const seen = new Set<string>();
    const staffMembers = Array.isArray(org?.staffMembers) ? org.staffMembers : [];
    const organizationStaffInvites = Array.isArray(org?.staffInvites) ? org.staffInvites : [];

    if (ownerHost?.$id) {
      entries.push({
        id: ownerHost.$id,
        userId: ownerHost.$id,
        fullName: userDisplayName(ownerHost, ownerHost.$id),
        userName: ownerHost.userName || null,
        email: org?.staffEmailsByUserId?.[ownerHost.$id] ?? null,
        user: ownerHost,
        status: 'active',
        subtitle: 'Owner',
        types: ['HOST'],
        canRemove: false,
        locked: true,
      });
      seen.add(ownerHost.$id);
    } else if (org?.ownerId) {
      entries.push({
        id: org.ownerId,
        userId: org.ownerId,
        fullName: org.ownerId,
        userName: null,
        email: org?.staffEmailsByUserId?.[org.ownerId] ?? null,
        user: null,
        status: 'active',
        subtitle: 'Owner',
        types: ['HOST'],
        canRemove: false,
        locked: true,
      });
      seen.add(org.ownerId);
    }

    staffMembers.forEach((staffMember) => {
      const userEntry = staffMember.user;
      if (!staffMember.userId || seen.has(staffMember.userId) || staffMember.userId === org?.ownerId) {
        return;
      }
      seen.add(staffMember.userId);
      entries.push({
        id: staffMember.$id,
        userId: staffMember.userId,
        fullName: userDisplayName(userEntry, staffMember.userId),
        userName: userEntry?.userName || null,
        email: org?.staffEmailsByUserId?.[staffMember.userId] ?? staffMember.invite?.email ?? null,
        user: userEntry ?? null,
        status: staffMember.invite?.status === 'DECLINED' ? 'declined' : staffMember.invite ? 'pending' : 'active',
        subtitle: undefined,
        types: staffMember.types,
        canRemove: true,
      });
    });

    organizationStaffInvites.forEach((invite) => {
      if (!invite.userId || seen.has(invite.userId) || invite.userId === org?.ownerId) {
        return;
      }
      entries.push({
        id: invite.$id,
        userId: invite.userId,
        fullName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email || invite.userId,
        userName: null,
        email: invite.email ?? null,
        user: null,
        status: invite.status === 'DECLINED' ? 'declined' : 'pending',
        subtitle: undefined,
        types: invite.staffTypes ?? ['HOST'],
        canRemove: true,
      });
      seen.add(invite.userId);
    });

    return entries;
  }, [org?.ownerId, org?.staffEmailsByUserId, org?.staffInvites, org?.staffMembers, ownerHost, userDisplayName]);
  const eventHostOptions = useMemo(() => {
    const ids = new Set<string>();
    if (typeof org?.ownerId === 'string' && org.ownerId.length > 0) {
      ids.add(org.ownerId);
    }
    currentHostIds.forEach((hostId) => ids.add(hostId));

    const labelById = new Map<string, string>();
    if (org?.owner?.$id) {
      labelById.set(org.owner.$id, `${userDisplayName(org.owner, org.owner.$id)} (Owner)`);
    } else if (org?.ownerId) {
      labelById.set(org.ownerId, `${org.ownerId} (Owner)`);
    }

    currentHosts.forEach((host) => {
      if (!host?.$id) return;
      labelById.set(host.$id, userDisplayName(host, host.$id));
    });

    if (user?.$id && !labelById.has(user.$id)) {
      labelById.set(user.$id, userDisplayName(user, user.$id));
    }

    return Array.from(ids)
      .map((hostId) => ({
        value: hostId,
        label: labelById.get(hostId) ?? hostId,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [currentHostIds, currentHosts, org?.owner, org?.ownerId, user, userDisplayName]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPeriod, setProductPeriod] = useState<Product['period']>('month');
  const [productType, setProductType] = useState<ProductType>('MEMBERSHIP');
  const [productPriceCents, setProductPriceCents] = useState(0);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null);
  const [purchasePaymentData, setPurchasePaymentData] = useState<PaymentIntent | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [startingProductCheckoutId, setStartingProductCheckoutId] = useState<string | null>(null);
  const startingProductCheckoutRef = useRef<string | null>(null);
  const [, setSubscribing] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductDescription, setEditProductDescription] = useState('');
  const [editProductPeriod, setEditProductPeriod] = useState<Product['period']>('month');
  const [editProductType, setEditProductType] = useState<ProductType>('MEMBERSHIP');
  const [editProductPriceCents, setEditProductPriceCents] = useState(0);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const canCreateProduct = productName.trim().length > 0 && normalizePriceCents(productPriceCents) > 0;
  const canUpdateProduct = editProductName.trim().length > 0 && normalizePriceCents(editProductPriceCents) > 0;
  const [templateDocuments, setTemplateDocuments] = useState<TemplateDocument[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [eventTemplates, setEventTemplates] = useState<Event[]>([]);
  const [eventTemplatesLoading, setEventTemplatesLoading] = useState(false);
  const [eventTemplatesError, setEventTemplatesError] = useState<string | null>(null);
  const [eventTemplateCreateModalOpen, setEventTemplateCreateModalOpen] = useState(false);
  const [selectedCreateEventTemplateId, setSelectedCreateEventTemplateId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateType, setTemplateType] = useState<'PDF' | 'TEXT'>('PDF');
  const [templateContent, setTemplateContent] = useState('');
  const [templatePdfFile, setTemplatePdfFile] = useState<File | null>(null);
  const [templateSignOnce, setTemplateSignOnce] = useState(true);
  const [templateRequiredSignerType, setTemplateRequiredSignerType] = useState<
    'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD'
  >('PARTICIPANT');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateEmbedUrl, setTemplateEmbedUrl] = useState<string | null>(null);
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [pendingTemplateCreates, setPendingTemplateCreates] = useState<PendingTemplateCreateCard[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDocument | null>(null);
  const [previewMode, setPreviewMode] = useState<'read' | 'sign'>('read');
  const [previewAccepted, setPreviewAccepted] = useState(false);
  const [previewSignComplete, setPreviewSignComplete] = useState(false);
  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUserSummary[]>([]);
  const [organizationUsersLoading, setOrganizationUsersLoading] = useState(false);
  const [organizationUsersError, setOrganizationUsersError] = useState<string | null>(null);
  const [expandedOrganizationUserIds, setExpandedOrganizationUserIds] = useState<string[]>([]);
  const [previewSignedTextDocument, setPreviewSignedTextDocument] = useState<OrganizationUserDocumentSummary | null>(null);

  const closeTemplateBuilder = useCallback(() => {
    setTemplateBuilderOpen(false);
    setTemplateEmbedUrl(null);
  }, []);

  const pollBoldSignOperation = useCallback(async (operationId: string) => {
    const intervalMs = 1_500;
    const timeoutMs = 90_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const operation = await boldsignService.getOperationStatus(operationId);
      const status = String(operation.status ?? '').toUpperCase();
      if (status === 'CONFIRMED') {
        return operation;
      }
      if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
        throw new Error(operation.error || `Synchronization ${status.toLowerCase().replace('_', ' ')}.`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }

    throw new Error('Synchronization is delayed. Please refresh in a moment.');
  }, []);

  const openTemplatePreview = useCallback((template: TemplateDocument) => {
    setPreviewTemplate(template);
    setPreviewMode(template.type === 'TEXT' ? 'sign' : 'read');
    setPreviewAccepted(false);
    setPreviewSignComplete(false);
  }, []);

  const loadOrg = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await organizationService.getOrganizationById(orgId, true);
      if (data) setOrg(data);
    } catch (e) {
      console.error('Failed to load organization', e);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const syncOrganizationVerification = useCallback(async (orgId: string) => {
    setSyncingOrganizationVerification(true);
    try {
      await apiRequest(`/api/organizations/${orgId}/verification/sync`, {
        method: 'POST',
      });
      organizationService.invalidateCachedOrganization(orgId);
      const latest = await organizationService.getOrganizationById(orgId, true);
      if (latest) {
        setOrg(latest);
      }
      return latest ?? null;
    } finally {
      setSyncingOrganizationVerification(false);
    }
  }, []);

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) => current.filter((sport) => sportOptions.includes(sport)));
  }, [sportOptions, sportsLoading]);

  const kmBetween = useCallback((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const c = 2 * Math.asin(
      Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
    );
    return R * c;
  }, []);

  const buildEventFilters = useCallback(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const normalizedQuery = debouncedEventSearch.trim();
    const normalizedStartDate =
      eventsTabSelectedStartDate instanceof Date && !Number.isNaN(eventsTabSelectedStartDate.getTime())
        ? eventsTabSelectedStartDate
        : null;
    const normalizedEndDate =
      eventsTabSelectedEndDate instanceof Date && !Number.isNaN(eventsTabSelectedEndDate.getTime())
        ? eventsTabSelectedEndDate
        : null;
    const effectiveDate = normalizedStartDate
      ? normalizedStartDate
      : normalizedEndDate && normalizedEndDate < startOfToday
        ? normalizedEndDate
        : startOfToday;
    const dateFrom = new Date(
      effectiveDate.getFullYear(),
      effectiveDate.getMonth(),
      effectiveDate.getDate(),
      0,
      0,
      0,
      0,
    ).toISOString();
    const dateTo = normalizedEndDate
      ? new Date(
          normalizedEndDate.getFullYear(),
          normalizedEndDate.getMonth(),
          normalizedEndDate.getDate(),
          23,
          59,
          59,
          999,
        ).toISOString()
      : undefined;
    const normalizedOrganizationId = typeof id === 'string' ? id.trim() : '';
    const hostedEventTypes = selectedHostedEventTypes.length === ORG_HOSTED_EVENT_TYPE_OPTIONS.length
      ? undefined
      : selectedHostedEventTypes;

    return {
      organizationId: normalizedOrganizationId || undefined,
      includeWeeklyChildren: true,
      eventTypes: hostedEventTypes,
      sports: selectedSports.length > 0 ? selectedSports : undefined,
      userLocation: location || undefined,
      maxDistance: location && typeof eventsTabMaxDistance === 'number' ? eventsTabMaxDistance : undefined,
      dateFrom,
      dateTo,
      query: normalizedQuery || undefined,
    };
  }, [
    debouncedEventSearch,
    eventsTabMaxDistance,
    eventsTabSelectedEndDate,
    eventsTabSelectedStartDate,
    id,
    location,
    selectedHostedEventTypes,
    selectedSports,
  ]);

  const loadRentalEventsForOrganization = useCallback(async (
    organizationId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<Event[]> => {
    const fieldIdsFromHydratedFields = Array.isArray(org?.fields)
      ? org.fields
        .map((field) => (typeof field?.$id === 'string' ? field.$id.trim() : ''))
        .filter((value): value is string => value.length > 0)
      : [];
    const organizationFieldIds = Array.from(new Set(fieldIdsFromHydratedFields));
    if (!organizationFieldIds.length) {
      return [];
    }

    const rangeStart = dateFrom ?? new Date().toISOString();
    const settled = await Promise.allSettled(
      organizationFieldIds.map((fieldId) => eventService.getEventsForFieldInRange(fieldId, rangeStart, dateTo ?? null)),
    );
    const mergedEvents = new Map<string, Event>();
    settled.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('Failed to load field events for organization rentals', result.reason);
        return;
      }
      result.value.forEach((event) => {
        const eventId = typeof event.$id === 'string' ? event.$id.trim() : '';
        if (!eventId) {
          return;
        }
        const eventOrganizationId = typeof event.organizationId === 'string' ? event.organizationId.trim() : '';
        if (eventOrganizationId === organizationId) {
          return;
        }
        mergedEvents.set(eventId, event);
      });
    });
    return Array.from(mergedEvents.values());
  }, [org?.fields]);

  const filterRentalEventsForTab = useCallback((events: Event[], query: string): Event[] => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedSportSet = new Set(
      selectedSports.map((sport) => sport.trim().toLowerCase()).filter((sport) => sport.length > 0),
    );

    return events.filter((event) => {
      if (normalizedQuery.length > 0) {
        const haystacks = [
          event.name,
          event.description,
          event.location,
        ].map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''));
        const hasMatch = haystacks.some((value) => value.includes(normalizedQuery));
        if (!hasMatch) {
          return false;
        }
      }

      if (selectedSportSet.size > 0) {
        const eventSport = typeof event.sport?.name === 'string' ? event.sport.name.trim().toLowerCase() : '';
        if (!selectedSportSet.has(eventSport)) {
          return false;
        }
      }

      if (location && typeof eventsTabMaxDistance === 'number') {
        const coordinates = Array.isArray(event.coordinates) ? event.coordinates : null;
        if (coordinates && coordinates.length >= 2) {
          const [lng, lat] = coordinates;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            if (kmBetween(location, { lat, lng }) > eventsTabMaxDistance) {
              return false;
            }
          }
        }
      }

      return true;
    });
  }, [eventsTabMaxDistance, kmBetween, location, selectedSports]);

  const loadFirstPageOfOrganizationEvents = useCallback(async () => {
    const normalizedOrganizationId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedOrganizationId) {
      setEventsTabEvents([]);
      setEventsTabOffset(0);
      setEventsTabHasMoreEvents(false);
      setEventsTabLoadingInitial(false);
      return;
    }

    setEventsTabLoadingInitial(true);
    setEventsTabLoadingMore(false);
    setEventsTabError(null);
    setEventsTabOffset(0);
    setEventsTabHasMoreEvents(true);
    try {
      const filters = buildEventFilters();
      const shouldLoadHostedEvents = selectedHostedEventTypes.length > 0;
      const hostedEventsPromise = shouldLoadHostedEvents
        ? eventService.getEventsPaginated(filters, ORG_EVENTS_LIMIT, 0)
        : Promise.resolve<Event[]>([]);
      const rentalEventsPromise = includeRentalEventType
        ? loadRentalEventsForOrganization(normalizedOrganizationId, filters.dateFrom, filters.dateTo)
          .then((events) => filterRentalEventsForTab(events, filters.query ?? ''))
        : Promise.resolve<Event[]>([]);

      const [hostedEvents, rentalEvents] = await Promise.all([hostedEventsPromise, rentalEventsPromise]);
      const hiddenEventIds = new Set(user?.hiddenEventIds ?? []);
      const mergedEvents = [...hostedEvents, ...rentalEvents];
      const dedupedEvents = mergedEvents.filter((event, index, all) => (
        all.findIndex((candidate) => candidate.$id === event.$id) === index
      ));

      setEventsTabEvents(dedupedEvents.filter((event) => !hiddenEventIds.has(event.$id)));
      setEventsTabOffset(hostedEvents.length);
      setEventsTabHasMoreEvents(shouldLoadHostedEvents && hostedEvents.length === ORG_EVENTS_LIMIT);
    } catch (error) {
      console.error('Failed to load organization events:', error);
      setEventsTabError('Failed to load events. Please try again.');
    } finally {
      setEventsTabLoadingInitial(false);
    }
  }, [
    buildEventFilters,
    filterRentalEventsForTab,
    id,
    includeRentalEventType,
    loadRentalEventsForOrganization,
    selectedHostedEventTypes.length,
    user?.hiddenEventIds,
  ]);

  const loadMoreOrganizationEvents = useCallback(async () => {
    if (eventsTabLoadingInitial || eventsTabLoadingMore || !eventsTabHasMoreEvents) return;
    if (selectedHostedEventTypes.length === 0) return;
    setEventsTabLoadingMore(true);
    setEventsTabError(null);
    try {
      const filters = buildEventFilters();
      const page = await eventService.getEventsPaginated(filters, ORG_EVENTS_LIMIT, eventsTabOffset);
      const hiddenEventIds = new Set(user?.hiddenEventIds ?? []);
      setEventsTabEvents((previous) => {
        const merged = [...previous, ...page.filter((event) => !hiddenEventIds.has(event.$id))];
        const seen = new Set<string>();
        return merged.filter((event) => {
          if (seen.has(event.$id)) return false;
          seen.add(event.$id);
          return true;
        });
      });
      setEventsTabOffset((previous) => previous + page.length);
      setEventsTabHasMoreEvents(page.length === ORG_EVENTS_LIMIT);
    } catch (error) {
      console.error('Failed to load more organization events:', error);
      setEventsTabError('Failed to load more events. Please try again.');
    } finally {
      setEventsTabLoadingMore(false);
    }
  }, [
    buildEventFilters,
    eventsTabHasMoreEvents,
    eventsTabLoadingInitial,
    eventsTabLoadingMore,
    eventsTabOffset,
    selectedHostedEventTypes.length,
    user?.hiddenEventIds,
  ]);

  useEffect(() => {
    const hiddenEventIds = new Set(user?.hiddenEventIds ?? []);
    if (hiddenEventIds.size === 0) {
      return;
    }
    setEventsTabEvents((previous) => previous.filter((event) => !hiddenEventIds.has(event.$id)));
  }, [user?.hiddenEventIds]);

  const handleSetHomePage = useCallback(async (checked: boolean) => {
    if (!user?.$id || !org || !canToggleHomePagePreference) {
      return;
    }

    setUpdatingHomePagePreference(true);
    try {
      const updated = await updateUser({
        homePageOrganizationId: checked ? org.$id : null,
      });
      if (!updated) {
        throw new Error('Failed to update home page preference.');
      }
      notifications.show({
        color: 'green',
        message: checked
          ? `${org.name} is now your home page.`
          : 'Home page preference cleared.',
      });
    } catch (error) {
      console.error('Failed to update home page preference', error);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to update home page preference.',
      });
    } finally {
      setUpdatingHomePagePreference(false);
    }
  }, [canToggleHomePagePreference, org, updateUser, user?.$id]);

  const loadTemplates = useCallback(async (
    orgId: string,
    options?: { silent?: boolean },
  ): Promise<TemplateDocument[]> => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setTemplatesLoading(true);
    }
    try {
      if (!user?.$id) {
        return [];
      }
      const response = await fetch(`/api/organizations/${orgId}/templates`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load templates');
      }
      const rows = Array.isArray(payload?.templates) ? payload.templates : [];
      const mappedRows = rows.map((row: any) => mapTemplateRow(row));
      setTemplateDocuments(mappedRows);
      if (!silent) {
        setTemplatesError(null);
      }
      return mappedRows;
    } catch (error) {
      console.error('Failed to load templates', error);
      setTemplateDocuments([]);
      setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
      return [];
    } finally {
      if (!silent) {
        setTemplatesLoading(false);
      }
    }
  }, [user?.$id]);

  const monitorTemplateCreateOperation = useCallback((params: {
    organizationId: string;
    operationId: string;
    templateId?: string;
  }) => {
    void (async () => {
      try {
        const operation = await pollBoldSignOperation(params.operationId);
        const expectedTemplateId = operation.templateId ?? params.templateId;
        const expectedTemplateDocumentId = operation.templateDocumentId ?? undefined;

        setPendingTemplateCreates((current) => current.map((entry) => (
          entry.operationId === params.operationId
            ? {
              ...entry,
              status: String(operation.status ?? 'CONFIRMED'),
              templateId: expectedTemplateId ?? entry.templateId,
              templateDocumentId: expectedTemplateDocumentId ?? entry.templateDocumentId,
              error: undefined,
            }
            : entry
        )));

        const projectionTimeoutMs = 90_000;
        const intervalMs = 1_500;
        const startedAt = Date.now();
        let projected = false;

        while (Date.now() - startedAt < projectionTimeoutMs) {
          const templates = await loadTemplates(params.organizationId, { silent: true });
          projected = templates.some((template) => (
            (expectedTemplateDocumentId && template.$id === expectedTemplateDocumentId)
            || (expectedTemplateId && template.templateId === expectedTemplateId)
          ));

          if (projected) {
            setPendingTemplateCreates((current) => current.filter((entry) => entry.operationId !== params.operationId));
            notifications.show({ color: 'green', message: 'Template synced.' });
            return;
          }

          await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
        }

        throw new Error('Template creation is still syncing. Please refresh in a moment.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Template sync failed.';
        setPendingTemplateCreates((current) => current.map((entry) => (
          entry.operationId === params.operationId
            ? {
              ...entry,
              status: 'FAILED',
              error: message,
            }
            : entry
        )));
        setTemplatesError(message);
      }
    })();
  }, [loadTemplates, pollBoldSignOperation]);

  const loadEventTemplates = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setEventTemplatesLoading(true);
    }
    try {
      if (!user?.$id) {
        return;
      }
      const params = new URLSearchParams();
      params.set('state', 'TEMPLATE');
      params.set('organizationId', orgId);
      params.set('limit', '200');
      const response = await apiRequest<{ events?: any[] }>(`/api/events?${params.toString()}`);
      const rows = Array.isArray(response?.events) ? response.events : [];
      const mapped = await Promise.all(
        rows.map((row) => eventService.mapRowFromDatabase(row, false)),
      );
      setEventTemplates(mapped.filter((row): row is Event => Boolean(row?.$id)));
      if (!silent) {
        setEventTemplatesError(null);
      }
    } catch (error) {
      console.error('Failed to load event templates', error);
      setEventTemplates([]);
      setEventTemplatesError(error instanceof Error ? error.message : 'Failed to load event templates.');
    } finally {
      if (!silent) {
        setEventTemplatesLoading(false);
      }
    }
  }, [user?.$id]);

  const loadOrganizationUsers = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setOrganizationUsersLoading(true);
    }
    try {
      if (!user?.$id) {
        return;
      }
      const response = await fetch(`/api/organizations/${orgId}/users`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load organization users.');
      }
      const rows = Array.isArray(payload?.users) ? payload.users : [];
      setOrganizationUsers(rows.map((row: Record<string, any>) => mapOrganizationUserRow(row)));
      if (!silent) {
        setOrganizationUsersError(null);
      }
    } catch (error) {
      console.error('Failed to load organization users', error);
      setOrganizationUsers([]);
      setOrganizationUsersError(error instanceof Error ? error.message : 'Failed to load organization users.');
    } finally {
      if (!silent) {
        setOrganizationUsersLoading(false);
      }
    }
  }, [user?.$id]);

  useEffect(() => {
    if (!templateBuilderOpen) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
        return;
      }
      const payload = event.data;
      const eventName = typeof payload === 'string'
        ? payload
        : payload?.event || payload?.eventName || payload?.type || payload?.name || '';
      const normalized = eventName.toString().toLowerCase();
      if (!normalized.includes('template')) {
        return;
      }
      if (!normalized.includes('created') && !normalized.includes('saved') && !normalized.includes('publish')) {
        return;
      }

      closeTemplateBuilder();
      notifications.show({
        color: 'green',
        message: 'Template saved successfully.',
      });
      if (org?.$id) {
        void loadTemplates(org.$id, { silent: true });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [templateBuilderOpen, closeTemplateBuilder, org?.$id, loadTemplates]);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      if (id) loadOrg(id);
    }
  }, [authLoading, isAuthenticated, user, router, id, loadOrg]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user || !id) {
      return;
    }

    const stripeState = searchParams?.get('stripe');
    if (!stripeState) {
      handledStripeStateRef.current = null;
      return;
    }

    const handledKey = `${id}:${stripeState}`;
    if (handledStripeStateRef.current === handledKey) {
      return;
    }
    handledStripeStateRef.current = handledKey;

    if (stripeState === 'return') {
      void (async () => {
        try {
          const latest = await syncOrganizationVerification(id);
          const latestStatus = resolveOrganizationVerificationStatus(latest);
          notifications.show({
            color: latestStatus === 'VERIFIED' ? 'green' : latestStatus === 'ACTION_REQUIRED' ? 'yellow' : 'blue',
            message: latestStatus === 'VERIFIED'
              ? 'Organization verification is complete.'
              : latestStatus === 'ACTION_REQUIRED'
                ? 'Stripe still needs more information to verify this organization.'
                : 'Stripe onboarding was updated. Verification is still in progress.',
          });
        } catch (error) {
          console.error('Failed to sync organization verification after Stripe return', error);
          notifications.show({
            color: 'red',
            message: error instanceof Error ? error.message : 'Failed to refresh organization verification status.',
          });
        }
      })();
      return;
    }

    if (stripeState === 'refresh') {
      notifications.show({
        color: 'yellow',
        message: 'Stripe asked to reopen onboarding. Continue verification to finish setup.',
      });
    }
  }, [authLoading, id, isAuthenticated, searchParams, syncOrganizationVerification, user]);

  useEffect(() => {
    if (location) {
      return;
    }
    if (locationRequestAttemptedRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    locationRequestAttemptedRef.current = true;
    requestLocation().catch(() => {});
  }, [location, requestLocation]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated || !user) {
      return;
    }
    if (activeTab !== 'events') {
      return;
    }
    if (!id) {
      return;
    }
    void loadFirstPageOfOrganizationEvents();
  }, [activeTab, authLoading, id, isAuthenticated, loadFirstPageOfOrganizationEvents, user]);

  useEffect(() => {
    if (activeTab !== 'events') {
      return;
    }
    if (!eventsTabSentinelRef.current) return;
    const el = eventsTabSentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          void loadMoreOrganizationEvents();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, loadMoreOrganizationEvents]);

  useEffect(() => {
    if (!org || !user) return;
    if (stripeEmail) return;
    const fallbackEmail = (org as any)?.email || authUser?.email || '';
    if (fallbackEmail) {
      setStripeEmail(fallbackEmail);
    }
  }, [org, user, authUser, stripeEmail]);

  useEffect(() => {
    if (org?.products) {
      setProducts(org.products);
    }
  }, [org?.products]);

  useEffect(() => {
    if (!org || !isOwner || !user) {
      setTemplateDocuments([]);
      setPendingTemplateCreates([]);
      return;
    }
    loadTemplates(org.$id);
  }, [org, isOwner, user, loadTemplates]);

  useEffect(() => {
    if (pendingTemplateCreates.length === 0 || templateDocuments.length === 0) {
      return;
    }

    setPendingTemplateCreates((current) => current.filter((entry) => {
      return !templateDocuments.some((template) => (
        (entry.templateDocumentId && template.$id === entry.templateDocumentId)
        || (entry.templateId && template.templateId === entry.templateId)
      ));
    }));
  }, [pendingTemplateCreates.length, templateDocuments]);

  useEffect(() => {
    if (!org || !isOwner || !user) {
      setEventTemplates([]);
      return;
    }
    void loadEventTemplates(org.$id);
  }, [org, isOwner, user, loadEventTemplates]);

  useEffect(() => {
    if (!org || !user || !org.viewerCanAccessUsers) {
      setOrganizationUsers([]);
      setExpandedOrganizationUserIds([]);
      return;
    }
    if (activeTab !== 'users') {
      return;
    }
    void loadOrganizationUsers(org.$id);
  }, [activeTab, org, user, loadOrganizationUsers]);

  useEffect(() => {
    setExpandedOrganizationUserIds((previous) => previous.filter((userId) => organizationUsers.some((row) => row.userId === userId)));
  }, [organizationUsers]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.value === activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0].value);
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!eventTemplateCreateModalOpen || selectedCreateEventTemplateId || eventTemplates.length === 0) {
      return;
    }
    setSelectedCreateEventTemplateId(eventTemplates[0].$id);
  }, [eventTemplateCreateModalOpen, eventTemplates, selectedCreateEventTemplateId]);

  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam && availableTabs.some((tab) => tab.value === tabParam)) {
      setActiveTab(tabParam as typeof activeTab);
    }
  }, [availableTabs, searchParams]);

  const eventTemplateOptions = useMemo(
    () => eventTemplates
      .filter((template) => typeof template.$id === 'string' && template.$id.length > 0)
      .map((template) => ({
        value: template.$id,
        label: template.name?.trim() || 'Untitled Template',
      })),
    [eventTemplates],
  );

  const navigateToEventCreate = useCallback((templateId?: string | null) => {
    const newId = createId();
    const normalizedTemplateId = templateId?.trim();
    router.push(
      buildOrganizationEventCreateUrl({
        eventId: newId,
        organizationId: id ?? '',
        templateId: normalizedTemplateId || undefined,
        skipTemplatePrompt: !normalizedTemplateId,
      }),
    );
  }, [id, router]);

  const handleCreateEvent = useCallback(() => {
    if (!isOwner) {
      return;
    }
    setSelectedCreateEventTemplateId((previous) => {
      if (previous && eventTemplates.some((template) => template.$id === previous)) {
        return previous;
      }
      return eventTemplates[0]?.$id ?? null;
    });
    setEventTemplateCreateModalOpen(true);
    if (org?.$id && !eventTemplatesLoading && eventTemplates.length === 0) {
      void loadEventTemplates(org.$id);
    }
  }, [eventTemplates, eventTemplatesLoading, isOwner, loadEventTemplates, org?.$id]);

  const handleCreateEventWithoutTemplate = useCallback(() => {
    setEventTemplateCreateModalOpen(false);
    navigateToEventCreate();
  }, [navigateToEventCreate]);

  const handleCreateEventWithTemplate = useCallback(() => {
    if (!selectedCreateEventTemplateId) {
      return;
    }
    setEventTemplateCreateModalOpen(false);
    navigateToEventCreate(selectedCreateEventTemplateId);
  }, [navigateToEventCreate, selectedCreateEventTemplateId]);

  const handleCreateTemplate = useCallback(async () => {
    if (!org || !user) return;
    const trimmedTitle = templateTitle.trim();
    if (!trimmedTitle) {
      setTemplatesError('Template title is required.');
      return;
    }
    if (templateType === 'PDF' && !templatePdfFile) {
      setTemplatesError('Upload a PDF file to create a PDF template.');
      return;
    }
    const trimmedContent = templateContent.trim();
    if (templateType === 'TEXT' && !trimmedContent) {
      setTemplatesError('Template text is required.');
      return;
    }
    try {
      setCreatingTemplate(true);
      setTemplatesError(null);
      const createdTemplateType = templateType;
      const result = await boldsignService.createTemplate({
        organizationId: org.$id,
        userId: user.$id,
        title: trimmedTitle,
        description: templateDescription.trim() || undefined,
        signOnce: templateSignOnce,
        requiredSignerType: templateRequiredSignerType,
        type: templateType,
        content: templateType === 'TEXT' ? trimmedContent : undefined,
        file: templateType === 'PDF' ? templatePdfFile ?? undefined : undefined,
      });
      setTemplateEmbedUrl(result.createUrl ?? null);
      setTemplateBuilderOpen(Boolean(result.createUrl));
      setTemplateModalOpen(false);
      setTemplateTitle('');
      setTemplateDescription('');
      setTemplateType('PDF');
      setTemplateContent('');
      setTemplatePdfFile(null);
      setTemplateSignOnce(true);
      setTemplateRequiredSignerType('PARTICIPANT');

      if (createdTemplateType === 'PDF') {
        if (!result.operationId) {
          throw new Error('Template creation response is missing operation id.');
        }
        const operationId = result.operationId;
        setPendingTemplateCreates((current) => [
          {
            localId: `pending-template:${operationId}`,
            operationId,
            templateId: result.templateId,
            title: trimmedTitle,
            description: templateDescription.trim() || undefined,
            signOnce: templateSignOnce,
            requiredSignerType: templateRequiredSignerType,
            status: String(result.syncStatus ?? 'PENDING_WEBHOOK'),
          },
          ...current.filter((entry) => entry.operationId !== operationId),
        ]);
        notifications.show({ color: 'blue', message: 'Template creation submitted. Syncing\u2026' });
        monitorTemplateCreateOperation({
          organizationId: org.$id,
          operationId,
          templateId: result.templateId,
        });
      } else {
        await loadTemplates(org.$id, { silent: true });
        notifications.show({ color: 'green', message: 'Template synced.' });
      }
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Failed to create template.',
      );
    } finally {
      setCreatingTemplate(false);
    }
  }, [
    org,
    user,
    templateTitle,
    templateDescription,
    templateSignOnce,
    templateRequiredSignerType,
    templateType,
    templateContent,
    templatePdfFile,
    loadTemplates,
    monitorTemplateCreateOperation,
  ]);

  const handleEditPdfTemplate = useCallback(async (template: TemplateDocument) => {
    if (!org) return;
    if ((template.type ?? 'PDF') !== 'PDF') {
      return;
    }
    try {
      setEditingTemplateId(template.$id);
      setTemplatesError(null);
      const editUrl = await boldsignService.getTemplateEditUrl({
        organizationId: org.$id,
        templateDocumentId: template.$id,
      });
      setTemplateEmbedUrl(editUrl);
      setTemplateBuilderOpen(true);
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Failed to open template editor.',
      );
    } finally {
      setEditingTemplateId(null);
    }
  }, [org]);

  const handleDeleteTemplate = useCallback(async (template: TemplateDocument) => {
    if (!org) return;

    const templateTitle = template.title?.trim() || 'Untitled Template';
    const confirmed = window.confirm(`Delete "${templateTitle}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingTemplateId(template.$id);
      setTemplatesError(null);
      const result = await boldsignService.deleteTemplate({
        organizationId: org.$id,
        templateDocumentId: template.$id,
      });
      if (result.operationId) {
        notifications.show({ color: 'blue', message: 'Template delete submitted. Syncing\u2026' });
        await pollBoldSignOperation(result.operationId);
      }
      if (previewTemplate?.$id === template.$id) {
        setPreviewTemplate(null);
        setPreviewAccepted(false);
        setPreviewSignComplete(false);
      }
      await loadTemplates(org.$id, { silent: true });
      notifications.show({ color: 'green', message: 'Template deleted.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template.';
      setTemplatesError(message);
      notifications.show({ color: 'red', message });
    } finally {
      setDeletingTemplateId(null);
    }
  }, [loadTemplates, org, pollBoldSignOperation, previewTemplate?.$id]);

  const toggleOrganizationUserExpanded = useCallback((userId: string) => {
    setExpandedOrganizationUserIds((previous) => (
      previous.includes(userId)
        ? previous.filter((entry) => entry !== userId)
        : [...previous, userId]
    ));
  }, []);

  const openOrganizationEvent = useCallback((eventId: string) => {
    const params = new URLSearchParams({ tab: 'details' });
    if (isOwner) {
      params.set('mode', 'edit');
    }
    router.push(`/events/${eventId}?${params.toString()}`);
  }, [isOwner, router]);

  const handleOrganizationEventClick = useCallback((event: Event) => {
    if (isOwner) {
      openOrganizationEvent(event.$id);
      return;
    }
    setSelectedEvent(event);
    setShowEventDetailSheet(true);
  }, [isOwner, openOrganizationEvent]);

  const openSignedDocumentPreview = useCallback((document: OrganizationUserDocumentSummary) => {
    if (document.type === 'PDF') {
      if (!document.viewUrl) {
        notifications.show({
          color: 'red',
          message: 'This signed PDF is missing a preview link.',
        });
        return;
      }
      window.open(document.viewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPreviewSignedTextDocument(document);
  }, []);

  const handleConnectStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    const trimmedEmail = stripeEmail.trim();
    const isValidEmail = EMAIL_REGEX.test(trimmedEmail);
    if (requiresStripeVerificationEmail && !isValidEmail) {
      setStripeEmailError('Enter a valid email to start Stripe onboarding.');
      return;
    }
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe onboarding is only available in the browser.' });
      return;
    }
    try {
      setStripeEmailError(null);
      setConnectingStripe(true);
      const origin = resolveClientPublicOrigin();
      if (!origin) {
        notifications.show({ color: 'red', message: 'Unable to determine public URL for Stripe onboarding.' });
        return;
      }
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.connectStripeAccount({
        organization: org,
        organizationEmail: requiresStripeVerificationEmail ? trimmedEmail : undefined,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe onboarding did not return a link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to connect Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to start Stripe onboarding right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setConnectingStripe(false);
    }
  }, [org, isOwner, requiresStripeVerificationEmail, stripeEmail]);

  const handleManageStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe management is only available in the browser.' });
      return;
    }
    try {
      setManagingStripe(true);
      const origin = resolveClientPublicOrigin();
      if (!origin) {
        notifications.show({ color: 'red', message: 'Unable to determine public URL for Stripe management.' });
        return;
      }
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.manageStripeAccount({
        organization: org,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe did not return a management link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to manage Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to open Stripe management right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setManagingStripe(false);
    }
  }, [org, isOwner]);

  const refreshOrganizationProducts = useCallback(
    async (orgId: string) => {
      organizationService.invalidateCachedOrganization(orgId);
      const latest = await organizationService.getOrganizationById(orgId, true);
      if (latest) {
        setOrg(latest);
        setProducts(latest.products ?? []);
      }
    },
    [],
  );

  const handleCreateProduct = useCallback(async () => {
    if (!org || !user || !isOwner) return;
    const priceCents = normalizePriceCents(productPriceCents);
    if (!productName.trim()) {
      notifications.show({ color: 'red', message: 'Product name is required.' });
      return;
    }
    if (!priceCents || priceCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a valid price greater than zero.' });
      return;
    }
    try {
      setCreatingProduct(true);
      const created = await productService.createProduct({
        user,
        organizationId: org.$id,
        name: productName.trim(),
        description: productDescription.trim() || undefined,
        priceCents,
        period: productPeriod,
        productType,
      });
      notifications.show({ color: 'green', message: `Created product "${created.name}".` });
      setProductName('');
      setProductDescription('');
      setProductPriceCents(0);
      setProductPeriod('month');
      setProductType(defaultProductTypeForPeriod('month'));
      await refreshOrganizationProducts(org.$id);
    } catch (error) {
      console.error('Failed to create product', error);
      notifications.show({
        color: 'red',
        message: isApiRequestError(error) ? error.message : 'Failed to create product. Try again.',
      });
    } finally {
      setCreatingProduct(false);
    }
  }, [isOwner, org, productDescription, productName, productPeriod, productPriceCents, productType, refreshOrganizationProducts, user]);

  const openProductModal = useCallback((product: Product) => {
    setSelectedProduct(product);
    setEditProductName(product.name);
    setEditProductDescription(product.description ?? '');
    const normalizedPeriod = resolveProductEditorPeriod(product.period);
    setEditProductPeriod(normalizedPeriod);
    setEditProductType(resolveProductEditorType(product.productType, product.taxCategory, normalizedPeriod));
    setEditProductPriceCents(normalizePriceCents(product.priceCents));
    setProductModalOpen(true);
  }, []);

  const closeProductModal = useCallback(() => {
    setProductModalOpen(false);
    setSelectedProduct(null);
    setEditProductName('');
    setEditProductDescription('');
    setEditProductPeriod('month');
    setEditProductType(defaultProductTypeForPeriod('month'));
    setEditProductPriceCents(0);
  }, []);

  const handleProductPeriodChange = useCallback((value: string | null) => {
    const nextPeriod = resolveProductEditorPeriod(value);
    setProductType((currentProductType) => (
      maybeCarryDefaultProductType(currentProductType, productPeriod, nextPeriod)
    ));
    setProductPeriod(nextPeriod);
  }, [productPeriod]);

  const handleEditProductPeriodChange = useCallback((value: string | null) => {
    const nextPeriod = resolveProductEditorPeriod(value);
    setEditProductType((currentProductType) => (
      maybeCarryDefaultProductType(currentProductType, editProductPeriod, nextPeriod)
    ));
    setEditProductPeriod(nextPeriod);
  }, [editProductPeriod]);

  const handleUpdateProduct = useCallback(async () => {
    if (!org || !selectedProduct || !isOwner) return;
    const priceCents = normalizePriceCents(editProductPriceCents);
    if (!editProductName.trim()) {
      notifications.show({ color: 'red', message: 'Product name is required.' });
      return;
    }
    if (!priceCents || priceCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a valid price greater than zero.' });
      return;
    }
    try {
      setUpdatingProduct(true);
      await productService.updateProduct(selectedProduct.$id, {
        name: editProductName.trim(),
        description: editProductDescription.trim() || undefined,
        priceCents,
        period: editProductPeriod,
        productType: editProductType,
      });
      notifications.show({ color: 'green', message: 'Product updated.' });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to update product', error);
      notifications.show({
        color: 'red',
        message: isApiRequestError(error) ? error.message : 'Failed to update product. Try again.',
      });
    } finally {
      setUpdatingProduct(false);
    }
  }, [closeProductModal, editProductDescription, editProductName, editProductPeriod, editProductPriceCents, editProductType, isOwner, org, refreshOrganizationProducts, selectedProduct]);

  const handleDeleteProduct = useCallback(async () => {
    if (!org || !selectedProduct || !isOwner) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete product "${selectedProduct.name}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }
    try {
      setDeletingProduct(true);
      await productService.deleteProduct(selectedProduct.$id);
      notifications.show({ color: 'green', message: 'Product deleted.' });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to delete product', error);
      notifications.show({ color: 'red', message: 'Failed to delete product. Try again.' });
    } finally {
      setDeletingProduct(false);
    }
  }, [closeProductModal, isOwner, org, refreshOrganizationProducts, selectedProduct]);

  const startProductCheckout = useCallback(
    async (product: Product, billingAddress?: BillingAddress) => {
      if (!org || !user) {
        throw new Error('You must be signed in to purchase.');
      }
      try {
        setPurchaseProduct(product);
        setPurchasePaymentData(null);
        const intent = isSinglePurchasePeriod(product.period)
          ? await paymentService.createProductPaymentIntent(user, product, org, billingAddress)
          : await productService.createSubscriptionCheckout({
              productId: product.$id,
              billingAddress,
            });
        setPurchasePaymentData(intent);
        setShowPurchaseModal(true);
        setShowBillingAddressModal(false);
      } catch (error) {
        if (
          isApiRequestError(error)
          && error.data
          && typeof error.data === 'object'
          && 'billingAddressRequired' in error.data
          && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
        ) {
          setShowBillingAddressModal(true);
          return;
        }
        throw error;
      }
    },
    [org, user],
  );

  const handlePurchaseProduct = useCallback(
    async (product: Product) => {
      if (!org || !user) {
        notifications.show({ color: 'red', message: 'You must be signed in to purchase.' });
        return;
      }
      if (startingProductCheckoutRef.current) {
        return;
      }
      try {
        startingProductCheckoutRef.current = product.$id;
        setStartingProductCheckoutId(product.$id);
        await startProductCheckout(product);
      } catch (error) {
        console.error('Failed to start purchase', error);
        notifications.show({ color: 'red', message: 'Unable to start checkout. Please try again.' });
      } finally {
        if (startingProductCheckoutRef.current === product.$id) {
          startingProductCheckoutRef.current = null;
        }
        setStartingProductCheckoutId((current) => (current === product.$id ? null : current));
      }
    },
    [org, startProductCheckout, user],
  );

  const handleProductPaymentSuccess = useCallback(async () => {
    if (!purchaseProduct) return;
    try {
      setSubscribing(true);
      notifications.show({
        color: 'green',
        message: isSinglePurchasePeriod(purchaseProduct.period)
          ? `Purchase completed for ${purchaseProduct.name}.`
          : `Subscription started for ${purchaseProduct.name}.`,
      });
      if (org?.$id) {
        await refreshOrganizationProducts(org.$id);
      }
    } catch (error) {
      console.error('Failed to refresh product state after payment', error);
      notifications.show({ color: 'red', message: 'Payment succeeded, but product state failed to refresh.' });
    } finally {
      setSubscribing(false);
      setShowPurchaseModal(false);
      setPurchasePaymentData(null);
      setPurchaseProduct(null);
    }
  }, [org?.$id, purchaseProduct, refreshOrganizationProducts]);

  const handleSearchStaff = useCallback(
    async (query: string) => {
      setStaffSearch(query);
      setStaffError(null);
      if (query.trim().length < 2) {
        setStaffResults([]);
        return;
      }
      try {
        setStaffSearchLoading(true);
        const results = await userService.searchUsers(query.trim());
        const selectedUserIds = new Set((org?.staffMembers ?? []).map((staffMember) => staffMember.userId));
        const filtered = results.filter((candidate) => !selectedUserIds.has(candidate.$id));
        setStaffResults(filtered);
      } catch (error) {
        console.error('Failed to search staff:', error);
        setStaffError('Failed to search staff. Try again.');
      } finally {
        setStaffSearchLoading(false);
      }
    },
    [org?.staffMembers],
  );

  const handleInviteExistingStaff = useCallback(
    async (candidate: UserData, types: StaffMemberType[]) => {
      if (!org || !isOwner) return;
      try {
        await organizationService.inviteExistingStaff(org.$id, candidate.$id, types);
        await loadOrg(org.$id, { silent: true });
        setStaffResults((prev) => prev.filter((entry) => entry.$id !== candidate.$id));
        notifications.show({
          color: 'green',
          message: `${candidate.firstName || candidate.userName || 'Staff member'} invited.`,
        });
      } catch (error) {
        console.error('Failed to invite existing staff member:', error);
        notifications.show({ color: 'red', message: error instanceof Error ? error.message : 'Failed to invite staff member.' });
      }
    },
    [isOwner, loadOrg, org],
  );

  const handleInviteStaffEmails = useCallback(async () => {
    if (!org || !isOwner || !user) return;

    const sanitized = staffInvites.map((invite) => ({
      firstName: invite.firstName.trim(),
      lastName: invite.lastName.trim(),
      email: invite.email.trim(),
      types: invite.types,
    }));

    for (const invite of sanitized) {
      if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email) || invite.types.length === 0) {
        setStaffInviteError('Enter first name, last name, email, and at least one staff type for every invite.');
        return;
      }
    }

    setStaffInviteError(null);
    setInvitingStaff(true);
    try {
      await userService.inviteUsersByEmail(
        user.$id,
        sanitized.map((invite) => ({
          ...invite,
          type: 'STAFF',
          organizationId: org.$id,
          staffTypes: invite.types,
        })),
      );
      await loadOrg(org.$id, { silent: true });
      notifications.show({
        color: 'green',
        message: 'Staff invites sent.',
      });
      setStaffInvites([{ firstName: '', lastName: '', email: '', types: ['HOST'] }]);
    } catch (error) {
      setStaffInviteError(error instanceof Error ? error.message : 'Failed to invite staff.');
    } finally {
      setInvitingStaff(false);
    }
  }, [isOwner, loadOrg, org, staffInvites, user]);

  const handleRemoveStaffMember = useCallback(
    async (userIdToRemove: string) => {
      if (!org || !isOwner) return;
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm('Remove this staff member from the organization?');
        if (!confirmed) {
          return;
        }
      }
      try {
        await organizationService.removeStaffMember(org.$id, userIdToRemove);
        await loadOrg(org.$id, { silent: true });
      } catch (error) {
        console.error('Failed to remove staff member:', error);
        notifications.show({ color: 'red', message: 'Failed to remove staff member.' });
      }
    },
    [isOwner, loadOrg, org],
  );

  const handleUpdateStaffTypes = useCallback(
    async (userIdToUpdate: string, nextTypes: StaffMemberType[]) => {
      if (!org || !isOwner || nextTypes.length === 0) return;
      try {
        await organizationService.updateStaffMemberTypes(org.$id, userIdToUpdate, nextTypes);
        await loadOrg(org.$id, { silent: true });
      } catch (error) {
        console.error('Failed to update staff member types:', error);
        notifications.show({ color: 'red', message: 'Failed to update staff member types.' });
      }
    },
    [isOwner, loadOrg, org],
  );

  const handleUpdateEventHost = useCallback(async (eventId: string, hostId: string) => {
    if (!org || !isOwner || !eventId || !hostId) return;
    try {
      setUpdatingEventHostId(eventId);
      await apiRequest(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: { event: { hostId } },
      });
      setOrg((prev) => {
        if (!prev) return prev;
        const nextEvents = (prev.events ?? []).map((event) => (
          event.$id === eventId
            ? { ...event, hostId }
            : event
        ));
        return { ...prev, events: nextEvents };
      });
      notifications.show({ color: 'green', message: 'Event host updated.' });
    } catch (error) {
      console.error('Failed to update event host', error);
      notifications.show({ color: 'red', message: 'Failed to update event host.' });
    } finally {
      setUpdatingEventHostId(null);
    }
  }, [isOwner, org]);

  if (authLoading) return <Loading fullScreen text="Loading organization..." />;
  if (!isAuthenticated || !user) return null;

  const logoUrl = org?.logoId
    ? `/api/files/${org.logoId}/preview?w=64&h=64&fit=cover`
    : org?.name
      ? `/api/avatars/initials?name=${encodeURIComponent(org.name)}&size=64`
      : '';

  return (
    <>
      <Navigation />
      <Container fluid py="xl" className="discover-shell org-page-shell">
        {loading || !org ? (
          <Loading fullScreen={false} text="Loading organization..." />
        ) : (
          <>
            {/* Header */}
            <Group justify="space-between" align="center" mb="lg">
              <Group gap="md">
                {logoUrl && (
                  <Image
                    src={logoUrl}
                    alt={org.name}
                    width={64}
                    height={64}
                    unoptimized
                    style={{ width: 64, height: 64, borderRadius: '9999px', border: '1px solid var(--mvp-border)' }}
                  />
                )}
                <div>
                  <Group gap="md" align="center" mb={2}>
                    <Title order={2} className="discover-title">{org.name}</Title>
                    <OrganizationVerificationBadge organization={org} />
                    {canToggleHomePagePreference && (
                      <Checkbox
                        label="Set as home page"
                        checked={isCurrentOrganizationHomePage}
                        disabled={updatingHomePagePreference}
                        onChange={(event) => { void handleSetHomePage(event.currentTarget.checked); }}
                      />
                    )}
                  </Group>
                  <Group gap="md">
                    {org.website && (
                      <a href={org.website} target="_blank" rel="noreferrer"><Text c="blue">{org.website}</Text></a>
                    )}
                    {org.location && (
                      <Text size="sm" c="dimmed">{org.location}</Text>
                    )}
                  </Group>
                </div>
              </Group>
            </Group>

            {/* Tabs */}
            <SegmentedControl
              value={activeTab}
              onChange={(v: any) => setActiveTab(v)}
              data={availableTabs}
              className="org-tab-segmented"
              radius="xl"
              mb="lg"
            />

            <div className="org-tab-content">
            {activeTab === 'overview' && (
              <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
                <div style={{ gridColumn: 'span 2' }}>
                  <Paper withBorder p="md" radius="md" mb="md">
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Title order={5}>About</Title>
                      {isOwner && (
                        <Button variant="light" size="xs" onClick={() => setShowEditOrganizationModal(true)}>
                          Edit Organization
                        </Button>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{org.description || 'No description'}</Text>
                  </Paper>
                  <Paper withBorder p="md" radius="md">
                    <Title order={5} mb="md">Recent Events</Title>
                    {overviewRecentEvents.length > 0 ? (
                      <ResponsiveCardGrid>
                        {overviewRecentEvents.slice(0, 4).map((e) => (
                          <EventCard
                            key={e.$id}
                            event={e}
                            onClick={() => handleOrganizationEventClick(e)}
                            hostOptions={isOwner ? eventHostOptions : undefined}
                            selectedHostId={e.hostId}
                            hostChangeDisabled={updatingEventHostId === e.$id}
                            onHostChange={isOwner ? (hostId) => {
                              void handleUpdateEventHost(e.$id, hostId);
                            } : undefined}
                          />
                        ))}
                      </ResponsiveCardGrid>
                    ) : (
                      <Text size="sm" c="dimmed">No events yet.</Text>
                    )}
                  </Paper>
                </div>
                <div>
                  {isOwner && (
                    <Paper withBorder p="md" radius="md" mb="md">
                      <Title order={5} mb="sm">Payments</Title>
                      <Text size="sm" c="dimmed" mb="sm">
                        {organizationVerificationStatus === 'VERIFIED'
                          ? 'Stripe onboarding is complete. This organization can accept payouts and display the verified badge.'
                          : organizationVerificationStatus === 'LEGACY_CONNECTED'
                            ? 'Stripe is connected through the legacy flow. Reconnect through the new verification flow to earn the verified badge.'
                            : organizationVerificationStatus === 'ACTION_REQUIRED'
                              ? 'Stripe still needs more information before this organization can be verified.'
                              : organizationVerificationStatus === 'PENDING'
                                ? 'Stripe onboarding has started. Finish the remaining steps to complete verification.'
                                : 'Connect a Stripe account to verify this organization and accept payouts.'}
                      </Text>
                      <Group gap="xs" mb="sm">
                        <Badge
                          color={
                            organizationVerificationStatus === 'VERIFIED'
                              ? 'teal'
                              : organizationVerificationStatus === 'ACTION_REQUIRED'
                                ? 'yellow'
                                : organizationVerificationStatus === 'LEGACY_CONNECTED'
                                  ? 'blue'
                                  : 'gray'
                          }
                          variant="light"
                        >
                          {organizationVerificationStatusLabel(organizationVerificationStatus)}
                        </Badge>
                        {syncingOrganizationVerification && <Text size="xs" c="dimmed">Refreshing verification…</Text>}
                      </Group>
                      <Stack gap="xs">
                        {requiresStripeVerificationEmail && (
                          <TextInput
                            label="Stripe payout email"
                            type="email"
                            placeholder="billing@example.com"
                            value={stripeEmail}
                            error={stripeEmailError ?? undefined}
                            onChange={(e) => {
                              const next = e.currentTarget.value;
                              setStripeEmail(next);
                              if (stripeEmailError && EMAIL_REGEX.test(next.trim())) {
                                setStripeEmailError(null);
                              }
                            }}
                            disabled={connectingStripe}
                            required
                          />
                        )}
                        <Button
                          size="sm"
                          loading={organizationVerificationStatus === 'VERIFIED' ? managingStripe : connectingStripe}
                          disabled={requiresStripeVerificationEmail && !stripeEmailValid}
                          onClick={organizationVerificationStatus === 'VERIFIED' ? handleManageStripeAccount : handleConnectStripeAccount}
                        >
                          {stripePrimaryActionLabel}
                        </Button>
                        {organizationVerificationStatus !== 'VERIFIED' && (
                          <Text size="xs" c="dimmed">
                            The verified badge appears only after Stripe finishes all required checks for this organization.
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  )}
                  <Paper withBorder p="md" radius="md">
                    <Title order={5} mb="md">Teams</Title>
                    {org.teams && org.teams.length > 0 ? (
                      <div className="space-y-3">
                        {org.teams.slice(0, 3).map((t) => (
                          <TeamCard key={t.$id} team={t} showStats={false} />
                        ))}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">No teams yet.</Text>
                    )}
                  </Paper>
                  {isOwner && (
                    <Paper withBorder p="md" radius="md" mt="md">
                      <Title order={5} mb="md">Officials</Title>
                      {currentOfficials.length > 0 ? (
                        <div className="space-y-3">
                          {currentOfficials.slice(0, 4).map((ref) => (
                            <UserCard key={ref.$id} user={ref} className="!p-0 !shadow-none" />
                          ))}
                        </div>
                      ) : (
                        <Text size="sm" c="dimmed">No officials yet.</Text>
                      )}
                    </Paper>
                  )}
                </div>
              </SimpleGrid>
            )}

            {activeTab === 'events' && (
              <EventsTabContent
                location={location}
                searchTerm={eventSearchTerm}
                setSearchTerm={setEventSearchTerm}
                selectedEventTypes={selectedEventTypes}
                setSelectedEventTypes={setSelectedEventTypes}
                eventTypeOptions={ORG_EVENT_TYPE_OPTIONS}
                selectedSports={selectedSports}
                setSelectedSports={setSelectedSports}
                maxDistance={eventsTabMaxDistance}
                setMaxDistance={setEventsTabMaxDistance}
                selectedStartDate={eventsTabSelectedStartDate}
                setSelectedStartDate={setEventsTabSelectedStartDate}
                selectedEndDate={eventsTabSelectedEndDate}
                setSelectedEndDate={setEventsTabSelectedEndDate}
                sports={sportOptions}
                sportsLoading={sportsLoading}
                sportsError={sportsError?.message ?? null}
                defaultMaxDistance={ORG_EVENTS_DEFAULT_MAX_DISTANCE}
                kmBetween={kmBetween}
                events={eventsTabEvents}
                isLoadingInitial={eventsTabLoadingInitial}
                isLoadingMore={eventsTabLoadingMore}
                hasMoreEvents={eventsTabHasMoreEvents}
                sentinelRef={eventsTabSentinelRef}
                eventsError={eventsTabError}
                onEventClick={handleOrganizationEventClick}
                onCreateEvent={handleCreateEvent}
                showCreateEventButton={isOwner}
                hideWeeklyChildren={hideWeeklyChildEvents}
                setHideWeeklyChildren={setHideWeeklyChildEvents}
              />
            )}

            {isOwner && activeTab === 'eventTemplates' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Event Templates</Title>
                  <Group>
                    <Button
                      variant="default"
                      onClick={() => org && loadEventTemplates(org.$id)}
                      loading={eventTemplatesLoading}
                    >
                      Refresh
                    </Button>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                  Organization-scoped templates for creating new events.
                </Text>
                {eventTemplatesError && (
                  <Text size="sm" c="red" mb="md">
                    {eventTemplatesError}
                  </Text>
                )}
                {eventTemplatesLoading ? (
                  <Text size="sm" c="dimmed">Loading event templates...</Text>
                ) : eventTemplates.length > 0 ? (
                  <ResponsiveCardGrid>
                    {eventTemplates.map((eventTemplate) => (
                      <EventCard
                        key={eventTemplate.$id}
                        event={eventTemplate}
                        onClick={() => openOrganizationEvent(eventTemplate.$id)}
                      />
                    ))}
                  </ResponsiveCardGrid>
                ) : (
                  <Text size="sm" c="dimmed">No event templates yet.</Text>
                )}
              </Paper>
            )}

            {activeTab === 'teams' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Teams</Title>
                  {isOwner && <Button onClick={() => setShowCreateTeamModal(true)}>Create Team</Button>}
                </Group>
                {org.teams && org.teams.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                    {org.teams.map((t) => (
                      <TeamCard
                        key={t.$id}
                        team={t}
                        onClick={() => {
                          setSelectedTeam(t);
                          setShowTeamDetailModal(true);
                        }}
                      />
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No teams yet.</Text>
                )}
              </Paper>
            )}

            {activeTab === 'users' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" align="flex-start" mb="md">
                  <Stack gap={2}>
                    <Title order={5}>Users</Title>
                    <Text size="sm" c="dimmed">
                      {buildOrganizationUsersSubtitle(org?.name)}
                    </Text>
                  </Stack>
                  <Button
                    variant="default"
                    onClick={() => org && loadOrganizationUsers(org.$id)}
                    loading={organizationUsersLoading}
                  >
                    Refresh
                  </Button>
                </Group>

                {organizationUsersError && (
                  <Text size="sm" c="red" mb="md">
                    {organizationUsersError}
                  </Text>
                )}

                {organizationUsersLoading ? (
                  <Text size="sm" c="dimmed">Loading users...</Text>
                ) : organizationUsers.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <Table withTableBorder withColumnBorders highlightOnHover miw={760}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>User</Table.Th>
                          <Table.Th>Events</Table.Th>
                          <Table.Th>Documents</Table.Th>
                          <Table.Th style={{ width: 120 }}>Details</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {organizationUsers.map((summary) => {
                          const expanded = expandedOrganizationUserIds.includes(summary.userId);
                          const condensedEvents = summary.events.slice(0, 2);
                          const condensedDocuments = summary.documents.slice(0, 2);

                          return (
                            <Fragment key={summary.userId}>
                              <Table.Tr>
                                <Table.Td>
                                  <Text fw={600}>{summary.fullName}</Text>
                                  {summary.userName && (
                                    <Text size="xs" c="dimmed">@{summary.userName}</Text>
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  {condensedEvents.length > 0 ? (
                                    <Stack gap={4}>
                                      {condensedEvents.map((eventSummary) => (
                                        <Button
                                          key={eventSummary.eventId}
                                          size="xs"
                                          variant="subtle"
                                          styles={{ inner: { justifyContent: 'flex-start' }, label: { textAlign: 'left' } }}
                                          onClick={() => openOrganizationEvent(eventSummary.eventId)}
                                        >
                                          {eventSummary.eventName}
                                        </Button>
                                      ))}
                                      {summary.events.length > condensedEvents.length && (
                                        <Text size="xs" c="dimmed">
                                          +{summary.events.length - condensedEvents.length} more
                                        </Text>
                                      )}
                                    </Stack>
                                  ) : (
                                    <Text size="xs" c="dimmed">No events</Text>
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  {condensedDocuments.length > 0 ? (
                                    <Stack gap={4}>
                                      {condensedDocuments.map((documentSummary) => (
                                        <Button
                                          key={documentSummary.signedDocumentRecordId}
                                          size="xs"
                                          variant="subtle"
                                          onClick={() => openSignedDocumentPreview(documentSummary)}
                                        >
                                          {documentSummary.title}
                                        </Button>
                                      ))}
                                      {summary.documents.length > condensedDocuments.length && (
                                        <Text size="xs" c="dimmed">
                                          +{summary.documents.length - condensedDocuments.length} more
                                        </Text>
                                      )}
                                    </Stack>
                                  ) : (
                                    <Text size="xs" c="dimmed">No signed documents</Text>
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => toggleOrganizationUserExpanded(summary.userId)}
                                  >
                                    {expanded ? 'Collapse' : 'Expand'}
                                  </Button>
                                </Table.Td>
                              </Table.Tr>
                              {expanded && (
                                <Table.Tr>
                                  <Table.Td colSpan={4}>
                                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                      <Paper withBorder p="sm" radius="md">
                                        <Text fw={600} mb="xs">All events</Text>
                                        {summary.events.length > 0 ? (
                                          <Stack gap={6}>
                                            {summary.events.map((eventSummary) => (
                                              <Group key={`${summary.userId}-${eventSummary.eventId}`} justify="space-between" align="center" wrap="wrap">
                                                <Stack gap={0}>
                                                  <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    styles={{ inner: { justifyContent: 'flex-start' }, label: { textAlign: 'left' } }}
                                                    onClick={() => openOrganizationEvent(eventSummary.eventId)}
                                                  >
                                                    {eventSummary.eventName}
                                                  </Button>
                                                  <Text size="xs" c="dimmed">
                                                    {formatSummaryDateTime(eventSummary.start)}
                                                    {eventSummary.status ? ` \u2022 ${eventSummary.status}` : ''}
                                                  </Text>
                                                </Stack>
                                              </Group>
                                            ))}
                                          </Stack>
                                        ) : (
                                          <Text size="xs" c="dimmed">No events.</Text>
                                        )}
                                      </Paper>
                                      <Paper withBorder p="sm" radius="md">
                                        <Text fw={600} mb="xs">Signed documents</Text>
                                        {summary.documents.length > 0 ? (
                                          <Stack gap={6}>
                                            {summary.documents.map((documentSummary) => (
                                              <Group key={documentSummary.signedDocumentRecordId} justify="space-between" align="center" wrap="wrap">
                                                <Stack gap={0}>
                                                  <Text size="sm">{documentSummary.title}</Text>
                                                  <Text size="xs" c="dimmed">
                                                    {documentSummary.type}
                                                    {documentSummary.status ? ` \u2022 ${documentSummary.status}` : ''}
                                                    {documentSummary.signedAt ? ` \u2022 ${formatSummaryDateTime(documentSummary.signedAt)}` : ''}
                                                  </Text>
                                                  {documentSummary.eventName && (
                                                    <Text size="xs" c="dimmed">
                                                      Event: {documentSummary.eventName}
                                                    </Text>
                                                  )}
                                                </Stack>
                                                <Button
                                                  size="xs"
                                                  variant="light"
                                                  onClick={() => openSignedDocumentPreview(documentSummary)}
                                                >
                                                  {documentSummary.type === 'PDF' ? 'View PDF' : 'Preview'}
                                                </Button>
                                              </Group>
                                            ))}
                                          </Stack>
                                        ) : (
                                          <Text size="xs" c="dimmed">No documents.</Text>
                                        )}
                                      </Paper>
                                    </SimpleGrid>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </div>
                ) : (
                  <Text size="sm" c="dimmed">No signed-up users found yet.</Text>
                )}
              </Paper>
            )}

            {isOwner && activeTab === 'templates' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Document Templates</Title>
                  <Group>
                    <Button
                      variant="default"
                      onClick={() => org && loadTemplates(org.$id)}
                      loading={templatesLoading}
                    >
                      Refresh
                    </Button>
                    <Button onClick={() => setTemplateModalOpen(true)}>
                      Create Document Template
                    </Button>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                  Create reusable documents for participants to sign during event registration.
                </Text>
                {templatesError && (
                  <Text size="sm" c="red" mb="md">
                    {templatesError}
                  </Text>
                )}

                {templatesLoading ? (
                  <Text size="sm" c="dimmed">Loading templates...</Text>
                ) : (pendingTemplateCreates.length > 0 || templateDocuments.length > 0) ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                    {pendingTemplateCreates.map((pendingTemplate) => (
                      <Paper key={pendingTemplate.localId} withBorder p="sm" radius="md">
                        <Text fw={600}>{pendingTemplate.title || 'Untitled Template'}</Text>
                        <Text size="sm" c="dimmed">
                          {pendingTemplate.signOnce ? 'Sign once per participant' : 'Sign for every event'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Required signer: {getRequiredSignerTypeLabel(pendingTemplate.requiredSignerType)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Type: PDF
                        </Text>
                        <Text size="xs" c={pendingTemplate.error ? 'red' : 'blue'}>
                          Status: {pendingTemplate.error ? pendingTemplate.error : `Syncing (${pendingTemplate.status})`}
                        </Text>
                        {!pendingTemplate.error && (
                          <Group gap="xs" mt="xs">
                            <Loader size="xs" />
                            <Text size="xs" c="dimmed">
                              Creating template and waiting for projection\u2026
                            </Text>
                          </Group>
                        )}
                      </Paper>
                    ))}
                    {templateDocuments.map((template) => (
                      <Paper key={template.$id} withBorder p="sm" radius="md">
                        <Text fw={600}>{template.title || 'Untitled Template'}</Text>
                        <Text size="sm" c="dimmed">
                          {template.signOnce ? 'Sign once per participant' : 'Sign for every event'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Required signer: {getRequiredSignerTypeLabel(template.requiredSignerType)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Type: {template.type ?? 'PDF'}
                        </Text>
                        {template.status && (
                          <Text size="xs" c="dimmed">
                            Status: {template.status}
                          </Text>
                        )}
                        <Group justify="flex-end" mt="sm">
                          {template.type === 'TEXT' && (
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => openTemplatePreview(template)}
                              disabled={deletingTemplateId === template.$id}
                            >
                              Preview
                            </Button>
                          )}
                          {(template.type ?? 'PDF') === 'PDF' && (
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => void handleEditPdfTemplate(template)}
                              loading={editingTemplateId === template.$id}
                              disabled={deletingTemplateId === template.$id}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={() => void handleDeleteTemplate(template)}
                            loading={deletingTemplateId === template.$id}
                            disabled={editingTemplateId === template.$id}
                          >
                            Delete
                          </Button>
                        </Group>
                      </Paper>
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No templates yet.</Text>
                )}
              </Paper>
            )}

            {isOwner && activeTab === 'staff' && (
              <RoleRosterManager
                rosterEntries={staffRosterEntries}
                searchValue={staffSearch}
                onSearchChange={(value) => { void handleSearchStaff(value); }}
                searchResults={staffResults}
                searchLoading={staffSearchLoading}
                searchError={staffError}
                existingInviteTypes={existingStaffInviteTypes}
                onExistingInviteTypesChange={setExistingStaffInviteTypes}
                onAddExisting={(candidate, types) => { void handleInviteExistingStaff(candidate, types); }}
                inviteRows={staffInvites}
                onInviteRowsChange={(rows) => setStaffInvites(rows)}
                inviteError={staffInviteError}
                inviting={invitingStaff}
                onSendInvites={() => { void handleInviteStaffEmails(); }}
                onRemoveFromRoster={(entryUserId) => { void handleRemoveStaffMember(entryUserId); }}
                onTypesChange={(entryUserId, nextTypes) => { void handleUpdateStaffTypes(entryUserId, nextTypes); }}
              />
            )}

            {isOwner && activeTab === 'refunds' && org && (
              <RefundRequestsList organizationId={org.$id} />
            )}

            {isOwner && activeTab === 'publicPage' && org && (
              <OrganizationPublicSettingsPanel
                organization={org}
                onUpdated={async (updatedOrg) => {
                  setOrg(updatedOrg);
                  if (id) {
                    await loadOrg(id);
                  }
                }}
              />
            )}

            {activeTab === 'store' && org && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" align="center" mb="md">
                  <Title order={5}>Store</Title>
                  {!organizationHasStripeAccount && (
                    <Text size="sm" c="red">
                      Connect Stripe to accept payments for products.
                    </Text>
                  )}
                </Group>

                  {isOwner && (
                    <Paper withBorder radius="md" p="md" mb="lg">
                    <Title order={6} mb="xs">Add product</Title>
                    <Text size="sm" c="dimmed" mb="md">
                      Create a recurring or one-time product that users can purchase.
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <TextInput
                        label="Name"
                        placeholder="Product"
                        value={productName}
                        onChange={(e) => setProductName(e.currentTarget.value)}
                        required
                      />
                      <div>
                        <CentsInput
                          label="Price (USD)"
                          value={productPriceCents}
                          onChange={setProductPriceCents}
                          required
                        />
                        <PriceWithFeesPreview
                          amountCents={organizationHasStripeAccount ? productPriceCents : 0}
                          helperText={isProductTypeTaxable(productType) ? 'Tax is calculated at checkout.' : null}
                          taxable={organizationHasStripeAccount && isProductTypeTaxable(productType)}
                        />
                      </div>
                      <Select
                        label="Billing period"
                        data={PRODUCT_PERIOD_OPTIONS}
                        value={productPeriod}
                        onChange={handleProductPeriodChange}
                      />
                      <Select
                        label="Product type"
                        data={getProductTypeOptionsForPeriod(productPeriod)}
                        value={productType}
                        onChange={(value) => setProductType((value as ProductType) ?? defaultProductTypeForPeriod(productPeriod))}
                      />
                      <TextInput
                        label="Description"
                        placeholder="Optional description"
                        value={productDescription}
                        onChange={(e) => setProductDescription(e.currentTarget.value)}
                      />
                    </SimpleGrid>
                    <Group justify="flex-end" mt="md">
                      <Button
                        onClick={handleCreateProduct}
                        loading={creatingProduct}
                        disabled={!organizationHasStripeAccount || !canCreateProduct}
                      >
                        Add Product
                      </Button>
                    </Group>
                  </Paper>
                )}

                <Title order={6} mb="sm">Products</Title>
                {products.length === 0 ? (
                  <Text size="sm" c="dimmed">No products yet.</Text>
                ) : (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                    {products.map((product) => (
                      <Paper
                        key={product.$id}
                        withBorder
                        radius="md"
                        p="md"
                        onClick={() => {
                          if (isOwner) {
                            openProductModal(product);
                          }
                        }}
                        style={{ cursor: isOwner ? 'pointer' : 'default' }}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div>
                            <Text fw={600}>{product.name}</Text>
                            {product.description && <Text size="sm" c="dimmed">{product.description}</Text>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <Text size="sm" c="dimmed">{formatProductPeriodLabel(product.period)}</Text>
                            {isOwner && (
                              <Text size="xs" c="dimmed">Click card to edit</Text>
                            )}
                          </div>
                        </Group>
                        <Text fw={700} mb="xs">{formatProductPriceLabel(product)}</Text>
                        {product.isActive === false && (
                          <Text size="xs" c="red" mb="xs">Inactive</Text>
                        )}
                        <Button
                          fullWidth
                          variant={isOwner ? 'outline' : 'filled'}
                          loading={startingProductCheckoutId === product.$id}
                          disabled={
                            product.isActive === false
                            || (!organizationHasStripeAccount && !isOwner)
                            || startingProductCheckoutId !== null
                          }
                          onClick={(event) => {
                            if (isOwner) {
                              event.stopPropagation();
                            }
                            handlePurchaseProduct(product);
                          }}
                        >
                          {resolveProductCheckoutLabel(product, isOwner)}
                        </Button>
                      </Paper>
                    ))}
                  </SimpleGrid>
                )}
              </Paper>
            )}

            {activeTab === 'fields' && org && (
              <FieldsTabContent organization={org} organizationId={id ?? ''} currentUser={user ?? null} />
            )}
            </div>
          </>
        )}
      </Container>

      {/* Modals */}
      {showEventDetailSheet && selectedEvent ? (
        <EventDetailSheet
          event={selectedEvent}
          isOpen={showEventDetailSheet}
          onClose={() => { setShowEventDetailSheet(false); }}
        />
      ) : null}
      <CreateTeamModal
        isOpen={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        currentUser={user}
        organizationId={org?.$id}
        onTeamCreated={async (team) => {
          setShowCreateTeamModal(false);
          if (!team) {
            if (id) await loadOrg(id);
            return;
          }

          const nextTeamIds = Array.from(new Set([...(org?.teamIds ?? []), team.$id]));

          setOrg((prev) => {
            if (!prev) return prev;
            return { ...prev, teamIds: nextTeamIds, teams: [...(prev.teams ?? []), team] };
          });

          if (id) {
            try {
              await organizationService.updateOrganization(id, { teamIds: nextTeamIds });
            } catch (e) {
              console.error('Failed to attach team to organization', e);
            }
            await loadOrg(id);
          }
        }}
      />
      {selectedTeam && (
        <TeamDetailModal
          currentTeam={selectedTeam}
          isOpen={showTeamDetailModal}
          onClose={() => {
            setShowTeamDetailModal(false);
            setSelectedTeam(null);
          }}
          canManage={isOwner}
          canChargeRegistration={Boolean(org?.hasStripeAccount)}
          onTeamUpdated={(updatedTeam) => {
            setSelectedTeam(updatedTeam);
            setOrg((prev) => {
              if (!prev) return prev;
              const teams = (prev.teams ?? []).map((team) => (
                team.$id === updatedTeam.$id ? updatedTeam : team
              ));
              return { ...prev, teams };
            });
          }}
          onTeamDeleted={(teamId) => {
            setOrg((prev) => {
              if (!prev) return prev;
              const nextTeamIds = (prev.teamIds ?? []).filter((candidateId) => candidateId !== teamId);
              const nextTeams = (prev.teams ?? []).filter((team) => team.$id !== teamId);
              return { ...prev, teamIds: nextTeamIds, teams: nextTeams };
            });
            setShowTeamDetailModal(false);
            setSelectedTeam(null);
          }}
        />
      )}
      <CreateOrganizationModal
        isOpen={showEditOrganizationModal}
        onClose={() => setShowEditOrganizationModal(false)}
        currentUser={user!}
        organization={org}
        onUpdated={async (updatedOrg) => {
          setOrg(updatedOrg);
          if (id) {
            await loadOrg(id);
          }
        }}
      />
      <Modal
        opened={eventTemplateCreateModalOpen}
        onClose={() => setEventTemplateCreateModalOpen(false)}
        title="Create event"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Choose a template to prefill the new event or start with a blank event.
          </Text>
          <Select
            label="Event template"
            placeholder={eventTemplatesLoading ? 'Loading templates...' : 'Select a template'}
            data={eventTemplateOptions}
            value={selectedCreateEventTemplateId}
            onChange={setSelectedCreateEventTemplateId}
            searchable
            clearable
            disabled={eventTemplatesLoading || eventTemplateOptions.length === 0}
            nothingFoundMessage="No templates found"
          />
          {eventTemplatesError && (
            <Text size="sm" c="red">
              {eventTemplatesError}
            </Text>
          )}
          {!eventTemplatesLoading && eventTemplateOptions.length === 0 && (
            <Text size="sm" c="dimmed">
              No event templates yet. You can still create a blank event.
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEventTemplateCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleCreateEventWithoutTemplate}>
              Start blank
            </Button>
            <Button onClick={handleCreateEventWithTemplate} disabled={!selectedCreateEventTemplateId}>
              Use template
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={templateBuilderOpen && Boolean(templateEmbedUrl)}
        onClose={closeTemplateBuilder}
        centered
        size="75vw"
        title="BoldSign Template Builder"
        styles={{
          content: {
            width: '75vw',
            maxWidth: '75vw',
            height: '90vh',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          },
          body: {
            flex: 1,
            minHeight: 0,
            padding: 0,
          },
        }}
      >
        {templateEmbedUrl ? (
          <div style={{ height: '100%', minHeight: 0 }}>
            <iframe
              src={templateEmbedUrl}
              title="BoldSign Template Builder"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        ) : (
          <Text size="sm" c="dimmed" p="md">Preparing builder...</Text>
        )}
      </Modal>
      <Modal
        opened={Boolean(previewTemplate)}
        onClose={() => setPreviewTemplate(null)}
        centered
        size="lg"
        title={previewTemplate ? `Preview: ${previewTemplate.title || 'Untitled Template'}` : 'Preview template'}
      >
        {previewTemplate ? (
          <Stack gap="sm">
            <Group justify="space-between" align="center" gap="sm">
              <Stack gap={2} style={{ flex: 1 }}>
                <Text size="sm" c="dimmed">
                  Preview only. This will not record a signature.
                </Text>
                <Text size="xs" c="dimmed">
                  {previewTemplate.signOnce ? 'Sign once per participant' : 'Sign for every event'}
                </Text>
                <Text size="xs" c="dimmed">
                  Required signer: {getRequiredSignerTypeLabel(previewTemplate.requiredSignerType)}
                </Text>
              </Stack>
              {previewTemplate.type === 'TEXT' && (
                <SegmentedControl
                  value={previewMode}
                  onChange={(value) => {
                    setPreviewMode(value as 'read' | 'sign');
                    setPreviewAccepted(false);
                    setPreviewSignComplete(false);
                  }}
                  data={[
                    { label: 'Signing', value: 'sign' },
                    { label: 'Read', value: 'read' },
                  ]}
                />
              )}
            </Group>

            {previewTemplate.type !== 'TEXT' || previewMode === 'read' ? (
              <Paper
                withBorder
                p="md"
                radius="md"
                style={{ maxHeight: '65vh', overflowY: 'auto' }}
              >
                <Text style={{ whiteSpace: 'pre-wrap' }}>
                  {previewTemplate.content || 'No waiver text provided.'}
                </Text>
              </Paper>
            ) : previewSignComplete ? (
              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Text fw={600}>Preview complete</Text>
                  <Text size="sm" c="dimmed">
                    In the real flow, we would now record the signature and continue to the next required document.
                  </Text>
                  <Group justify="flex-end" gap="xs">
                    <Button
                      variant="default"
                      onClick={() => {
                        setPreviewAccepted(false);
                        setPreviewSignComplete(false);
                      }}
                    >
                      Start over
                    </Button>
                    <Button onClick={() => setPreviewTemplate(null)}>
                      Close
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            ) : (
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Document 1 of 1{previewTemplate.title ? ` \u2022 ${previewTemplate.title}` : ''}
                </Text>
                <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>
                    {previewTemplate.content || 'No waiver text provided.'}
                  </Text>
                </Paper>
                <Checkbox
                  label="I agree to the waiver above."
                  checked={previewAccepted}
                  onChange={(event) => setPreviewAccepted(event.currentTarget.checked)}
                />
                <Group justify="flex-end">
                  <Button
                    onClick={() => setPreviewSignComplete(true)}
                    disabled={!previewAccepted}
                  >
                    Accept and continue
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        ) : null}
      </Modal>
      <Modal
        opened={Boolean(previewSignedTextDocument)}
        onClose={() => setPreviewSignedTextDocument(null)}
        centered
        size="lg"
        title={previewSignedTextDocument ? `Signed text: ${previewSignedTextDocument.title}` : 'Signed text'}
      >
        {previewSignedTextDocument ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {previewSignedTextDocument.signedAt
                ? `Signed at ${formatSummaryDateTime(previewSignedTextDocument.signedAt)}`
                : 'Signed time unavailable.'}
            </Text>
            {previewSignedTextDocument.eventName && (
              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm" c="dimmed">Event: {previewSignedTextDocument.eventName}</Text>
                {previewSignedTextDocument.eventId && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => openOrganizationEvent(previewSignedTextDocument.eventId as string)}
                  >
                    View event
                  </Button>
                )}
              </Group>
            )}
            <Paper withBorder p="md" radius="md" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {previewSignedTextDocument.content || 'No text content is available for this signed record.'}
              </Text>
            </Paper>
          </Stack>
        ) : null}
      </Modal>
      <Modal
        opened={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Create template"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Template title"
            value={templateTitle}
            onChange={(e) => setTemplateTitle(e.currentTarget.value)}
            required
          />
          <SegmentedControl
            value={templateType}
            onChange={(value) => setTemplateType(value as 'PDF' | 'TEXT')}
            data={[
              { label: 'PDF (BoldSign)', value: 'PDF' },
              { label: 'Text waiver', value: 'TEXT' },
            ]}
          />
          <Textarea
            label="Description"
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.currentTarget.value)}
            minRows={3}
          />
          {templateType === 'PDF' && (
            <FileInput
              label="PDF file"
              placeholder="Upload a PDF template"
              accept="application/pdf,.pdf"
              value={templatePdfFile}
              onChange={setTemplatePdfFile}
              clearable
              required
            />
          )}
          {templateType === 'TEXT' && (
            <Textarea
              label="Waiver text"
              value={templateContent}
              onChange={(e) => setTemplateContent(e.currentTarget.value)}
              minRows={6}
              required
            />
          )}
          <Select
            label="Required signer"
            value={templateRequiredSignerType}
            onChange={(value) => {
              setTemplateRequiredSignerType(
                normalizeRequiredSignerType(value) as
                  'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD',
              );
            }}
            data={[
              { label: 'Participant', value: 'PARTICIPANT' },
              { label: 'Parent/Guardian', value: 'PARENT_GUARDIAN' },
              { label: 'Child', value: 'CHILD' },
              { label: 'Parent/Guardian + Child', value: 'PARENT_GUARDIAN_CHILD' },
            ]}
            allowDeselect={false}
            required
          />
          <Switch
            label="Sign once per participant"
            checked={templateSignOnce}
            onChange={(e) => setTemplateSignOnce(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setTemplateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              loading={creatingTemplate}
              disabled={!templateTitle.trim() || (templateType === 'PDF' && !templatePdfFile)}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={productModalOpen && Boolean(selectedProduct)}
        onClose={closeProductModal}
        title="Edit product"
        centered
      >
        {selectedProduct && (
          <Stack gap="sm">
            <TextInput
              label="Name"
              value={editProductName}
              onChange={(e) => setEditProductName(e.currentTarget.value)}
              required
            />
            <div>
              <CentsInput
                label="Price (USD)"
                value={editProductPriceCents}
                onChange={setEditProductPriceCents}
                required
              />
              <PriceWithFeesPreview
                amountCents={organizationHasStripeAccount ? editProductPriceCents : 0}
                helperText={isProductTypeTaxable(editProductType) ? 'Tax is calculated at checkout.' : null}
                taxable={organizationHasStripeAccount && isProductTypeTaxable(editProductType)}
              />
            </div>
            <Select
              label="Billing period"
              data={PRODUCT_PERIOD_OPTIONS}
              value={editProductPeriod}
              onChange={handleEditProductPeriodChange}
            />
            <Select
              label="Product type"
              data={getProductTypeOptionsForPeriod(editProductPeriod)}
              value={editProductType}
              onChange={(value) => setEditProductType((value as ProductType) ?? defaultProductTypeForPeriod(editProductPeriod))}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              value={editProductDescription}
              onChange={(e) => setEditProductDescription(e.currentTarget.value)}
              minRows={2}
            />
            <Group justify="space-between" mt="md">
              <Button
                variant="light"
                color="red"
                onClick={handleDeleteProduct}
                loading={deletingProduct}
              >
                Delete product
              </Button>
              <Group gap="xs">
                <Button variant="default" onClick={closeProductModal}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateProduct} loading={updatingProduct} disabled={!canUpdateProduct}>
                  Save changes
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => {
          setShowBillingAddressModal(false);
          setPurchaseProduct(null);
        }}
        onSaved={async (billingAddress) => {
          if (!purchaseProduct) {
            setShowBillingAddressModal(false);
            return;
          }
          await startProductCheckout(purchaseProduct, billingAddress);
        }}
        title="Billing address required"
        description="Enter your billing address so tax can be calculated before checkout."
      />
      <PaymentModal
        isOpen={showPurchaseModal && Boolean(purchaseProduct && purchasePaymentData)}
        onClose={() => {
          setShowPurchaseModal(false);
          setPurchasePaymentData(null);
          setPurchaseProduct(null);
        }}
        event={{
          name: purchaseProduct?.name ?? 'Product',
          location: org?.name ?? '',
          eventType: 'EVENT',
          price: purchaseProduct?.priceCents ?? 0,
        } as any}
        paymentData={purchasePaymentData}
        onPaymentSuccess={handleProductPaymentSuccess}
      />
    </>
  );
}

