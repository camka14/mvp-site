"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationVerificationBadge from '@/components/ui/OrganizationVerificationBadge';
import { Avatar, Badge, Checkbox, Chip, Container, Group, Title, Text, Button, Paper, ScrollArea, SegmentedControl, SimpleGrid, Stack, TextInput, Select, NumberInput, Modal, Textarea, Switch, FileInput, Table, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import EventCard from '@/components/ui/EventCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import { useApp } from '@/app/providers';
import type { BillingAddress, BillDiscountSummary, Event, Organization, OrganizationRole, Product, ProductType, Team, UserData, PaymentIntent, StaffMemberType, TemplateDocument } from '@/types';
import { formatPrice, getEventImageFallbackUrl, getEventImageUrl } from '@/types';
import { formatBillPaidProgress } from '@/lib/billDisplay';
import { organizationService } from '@/lib/organizationService';
import { eventService } from '@/lib/eventService';
import { getStaffMemberTypesForOrganizationRole } from '@/lib/staff';
import { createId } from '@/lib/id';
import { buildOrganizationEventCreateUrl } from '@/lib/eventCreateNavigation';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import HostPriceInput from '@/components/ui/HostPriceInput';
import { isStripeConnectMfaRequiredError, paymentService } from '@/lib/paymentService';
import { userService } from '@/lib/userService';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { productService } from '@/lib/productService';
import { boldsignService } from '@/lib/boldsignService';
import PaymentModal from '@/components/ui/PaymentModal';
import FieldsTabContent from './FieldsTabContent';
import RentalReservationCheckout from '@/components/rentals/RentalReservationCheckout';
import OrganizationFinancePanel from './OrganizationFinancePanel';
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
import {
  buildOrganizationCustomerPath,
  buildOrganizationTabPath,
  buildOrganizationTabs,
  resolveOrganizationRouteTab,
  type OrganizationCustomerRouteType,
  type OrganizationTab,
} from './organizationTabs';
import { buildOrganizationUsersSubtitle } from './organizationUsersCopy';
import OrganizationPublicSettingsPanel from './OrganizationPublicSettingsPanel';
import { ORG_PERMISSIONS, type OrganizationPermission } from '@/lib/organizationPermissions';
import { buildTeamManagementPath } from '@/app/teams/teamRoutes';
import DiscountManager from '@/components/discounts/DiscountManager';
import { describeDeleteOutcome } from '@/lib/deleteOutcome';
import { resolveOrganizationEventCreationState } from './organizationEventCreation';

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization..." />}>
      <OrganizationDetailContent />
    </Suspense>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORG_EVENTS_LIMIT = 18;
const CUSTOMER_PAGE_SIZE = 25;
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
  imageId?: string | null;
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
  teamId?: string;
  title: string;
  type: 'PDF' | 'TEXT';
  status?: string;
  signedAt?: string;
  viewUrl?: string;
  content?: string;
};

type OrganizationTeamMembershipSummary = {
  teamId: string;
  teamName: string;
  division?: string;
  sport?: string;
  status?: string;
  rosterRole?: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain: boolean;
};

type OrganizationUserSummary = {
  userId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  events: OrganizationUserEventSummary[];
  documents: OrganizationUserDocumentSummary[];
  bills: OrganizationBillSummary[];
  teams: OrganizationTeamMembershipSummary[];
};

type OrganizationCustomerTypeFilter = 'users' | 'teams';

type OrganizationTeamRegistrationSummary = OrganizationUserEventSummary & {
  eventTeamId: string;
  eventTeamName: string;
  division?: string;
  sport?: string;
  memberCount: number;
  billIds: string[];
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents: number;
  discountAmountCents: number;
  discountedAmountCents: number;
};

type OrganizationBillPaymentSummary = {
  paymentId: string;
  billId: string;
  sequence: number;
  dueDate?: string;
  amountCents: number;
  status?: string;
  paidAt?: string;
  paymentIntentId?: string | null;
  payerUserId?: string | null;
  refundedAmountCents: number;
  refundableAmountCents: number;
  isRefundable: boolean;
};

type OrganizationBillSummary = {
  billId: string;
  ownerType: 'USER' | 'TEAM';
  ownerId: string;
  ownerName: string;
  eventId?: string | null;
  eventName?: string;
  parentBillId?: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents: number;
  discountAmountCents: number;
  discountedAmountCents: number;
  discounts: BillDiscountSummary[];
  refundedAmountCents: number;
  refundableAmountCents: number;
  status?: string;
  allowSplit?: boolean | null;
  paymentPlanEnabled?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
  payments: OrganizationBillPaymentSummary[];
};

type OrganizationTeamMemberSummary = {
  userId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  status?: string;
  rosterRole?: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain: boolean;
  bills: OrganizationBillSummary[];
  documents: OrganizationUserDocumentSummary[];
};

type OrganizationTeamStaffSummary = {
  userId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  role: 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';
  status?: string;
};

type OrganizationTeamCustomerSummary = {
  canonicalTeamId: string;
  name: string;
  division?: string;
  sport?: string;
  profileImageId?: string | null;
  memberCount: number;
  teamSize?: number;
  captainId?: string;
  manager?: OrganizationTeamStaffSummary | null;
  headCoach?: OrganizationTeamStaffSummary | null;
  assistantCoaches: OrganizationTeamStaffSummary[];
  members: OrganizationTeamMemberSummary[];
  registrations: OrganizationTeamRegistrationSummary[];
  documents: OrganizationUserDocumentSummary[];
  bills: OrganizationBillSummary[];
  totals: {
    totalAmountCents: number;
    paidAmountCents: number;
    refundedAmountCents: number;
    refundableAmountCents: number;
  };
};

type OrganizationCustomerRow = {
  key: string;
  type: OrganizationCustomerTypeFilter;
  id: string;
  name: string;
  subtitle?: string;
  profileImageId?: string | null;
  events: OrganizationUserEventSummary[];
  user?: OrganizationUserSummary;
  team?: OrganizationTeamCustomerSummary;
};

const mapOrganizationUserRow = (row: Record<string, any>): OrganizationUserSummary => {
  const eventsRaw = Array.isArray(row?.events) ? row.events : [];
  const documentsRaw = Array.isArray(row?.documents) ? row.documents : [];
  const billsRaw = Array.isArray(row?.bills) ? row.bills : [];
  const teamsRaw = Array.isArray(row?.teams) ? row.teams : [];

  const events = eventsRaw
    .map((eventRow: Record<string, any>): OrganizationUserEventSummary => ({
      eventId: String(eventRow?.eventId ?? ''),
      eventName: String(eventRow?.eventName ?? 'Untitled Event').trim() || 'Untitled Event',
      imageId: typeof eventRow?.imageId === 'string' && eventRow.imageId.trim() ? eventRow.imageId.trim() : null,
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
      teamId: typeof documentRow?.teamId === 'string' ? documentRow.teamId : undefined,
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
    firstName: typeof row?.firstName === 'string' ? row.firstName : undefined,
    lastName: typeof row?.lastName === 'string' ? row.lastName : undefined,
    fullName: typeof row?.fullName === 'string' && row.fullName.trim() ? row.fullName.trim() : 'Unknown User',
    userName: typeof row?.userName === 'string' ? row.userName : undefined,
    profileImageId: typeof row?.profileImageId === 'string' ? row.profileImageId : null,
    events,
    documents,
    bills: billsRaw
      .map((billRow: Record<string, any>) => mapOrganizationBillRow(billRow))
      .filter((bill) => Boolean(bill.billId)),
    teams: teamsRaw
      .map((teamRow: Record<string, any>): OrganizationTeamMembershipSummary => ({
        teamId: String(teamRow?.teamId ?? ''),
        teamName: typeof teamRow?.teamName === 'string' && teamRow.teamName.trim() ? teamRow.teamName.trim() : 'Unnamed Team',
        division: typeof teamRow?.division === 'string' ? teamRow.division : undefined,
        sport: typeof teamRow?.sport === 'string' ? teamRow.sport : undefined,
        status: typeof teamRow?.status === 'string' ? teamRow.status : undefined,
        rosterRole: typeof teamRow?.rosterRole === 'string' ? teamRow.rosterRole : undefined,
        jerseyNumber: typeof teamRow?.jerseyNumber === 'string' ? teamRow.jerseyNumber : null,
        position: typeof teamRow?.position === 'string' ? teamRow.position : null,
        isCaptain: Boolean(teamRow?.isCaptain),
      }))
      .filter((team) => Boolean(team.teamId)),
  };
};

const mapOrganizationTeamStaffRow = (row: Record<string, any>): OrganizationTeamStaffSummary => ({
  userId: String(row?.userId ?? ''),
  firstName: typeof row?.firstName === 'string' ? row.firstName : undefined,
  lastName: typeof row?.lastName === 'string' ? row.lastName : undefined,
  fullName: typeof row?.fullName === 'string' && row.fullName.trim() ? row.fullName.trim() : String(row?.userId ?? 'Unknown User'),
  userName: typeof row?.userName === 'string' ? row.userName : undefined,
  profileImageId: typeof row?.profileImageId === 'string' ? row.profileImageId : null,
  role: row?.role === 'HEAD_COACH'
    ? 'HEAD_COACH'
    : row?.role === 'ASSISTANT_COACH'
      ? 'ASSISTANT_COACH'
      : 'MANAGER',
  status: typeof row?.status === 'string' ? row.status : undefined,
});

const mapOrganizationTeamMemberRow = (row: Record<string, any>): OrganizationTeamMemberSummary => ({
  userId: String(row?.userId ?? ''),
  firstName: typeof row?.firstName === 'string' ? row.firstName : undefined,
  lastName: typeof row?.lastName === 'string' ? row.lastName : undefined,
  fullName: typeof row?.fullName === 'string' && row.fullName.trim() ? row.fullName.trim() : String(row?.userId ?? 'Unknown User'),
  userName: typeof row?.userName === 'string' ? row.userName : undefined,
  profileImageId: typeof row?.profileImageId === 'string' ? row.profileImageId : null,
  status: typeof row?.status === 'string' ? row.status : undefined,
  rosterRole: typeof row?.rosterRole === 'string' ? row.rosterRole : undefined,
  jerseyNumber: typeof row?.jerseyNumber === 'string' ? row.jerseyNumber : null,
  position: typeof row?.position === 'string' ? row.position : null,
  isCaptain: Boolean(row?.isCaptain),
  bills: Array.isArray(row?.bills)
    ? row.bills.map((billRow: Record<string, any>) => mapOrganizationBillRow(billRow)).filter((bill) => Boolean(bill.billId))
    : [],
  documents: Array.isArray(row?.documents)
    ? row.documents
      .map((documentRow: Record<string, any>): OrganizationUserDocumentSummary => ({
        signedDocumentRecordId: String(documentRow?.signedDocumentRecordId ?? ''),
        documentId: String(documentRow?.documentId ?? ''),
        templateId: String(documentRow?.templateId ?? ''),
        eventId: typeof documentRow?.eventId === 'string' ? documentRow.eventId : undefined,
        eventName: typeof documentRow?.eventName === 'string' ? documentRow.eventName : undefined,
        teamId: typeof documentRow?.teamId === 'string' ? documentRow.teamId : undefined,
        title: typeof documentRow?.title === 'string' && documentRow.title.trim() ? documentRow.title.trim() : 'Signed Document',
        type: documentRow?.type === 'TEXT' ? 'TEXT' : 'PDF',
        status: typeof documentRow?.status === 'string' ? documentRow.status : undefined,
        signedAt: typeof documentRow?.signedAt === 'string' ? documentRow.signedAt : undefined,
        viewUrl: typeof documentRow?.viewUrl === 'string' ? documentRow.viewUrl : undefined,
        content: typeof documentRow?.content === 'string' ? documentRow.content : undefined,
      }))
      .filter((document) => Boolean(document.signedDocumentRecordId))
    : [],
});

const mapOrganizationBillRow = (row: Record<string, any>): OrganizationBillSummary => {
  const paymentsRaw = Array.isArray(row?.payments) ? row.payments : [];
  const payments = paymentsRaw
    .map((paymentRow: Record<string, any>): OrganizationBillPaymentSummary => ({
      paymentId: String(paymentRow?.paymentId ?? paymentRow?.id ?? ''),
      billId: String(paymentRow?.billId ?? row?.billId ?? ''),
      sequence: Number.isFinite(Number(paymentRow?.sequence)) ? Number(paymentRow.sequence) : 0,
      dueDate: typeof paymentRow?.dueDate === 'string' ? paymentRow.dueDate : undefined,
      amountCents: Number.isFinite(Number(paymentRow?.amountCents)) ? Math.max(0, Math.round(Number(paymentRow.amountCents))) : 0,
      status: typeof paymentRow?.status === 'string' ? paymentRow.status : undefined,
      paidAt: typeof paymentRow?.paidAt === 'string' ? paymentRow.paidAt : undefined,
      paymentIntentId: typeof paymentRow?.paymentIntentId === 'string' ? paymentRow.paymentIntentId : null,
      payerUserId: typeof paymentRow?.payerUserId === 'string' ? paymentRow.payerUserId : null,
      refundedAmountCents: Number.isFinite(Number(paymentRow?.refundedAmountCents)) ? Math.max(0, Math.round(Number(paymentRow.refundedAmountCents))) : 0,
      refundableAmountCents: Number.isFinite(Number(paymentRow?.refundableAmountCents)) ? Math.max(0, Math.round(Number(paymentRow.refundableAmountCents))) : 0,
      isRefundable: Boolean(paymentRow?.isRefundable),
    }))
    .filter((payment) => Boolean(payment.paymentId));
  const discountsRaw = Array.isArray(row?.discounts) ? row.discounts : [];
  const discounts = discountsRaw
    .filter((discountRow: Record<string, any>) => discountRow && typeof discountRow === 'object')
    .map((discountRow: Record<string, any>): BillDiscountSummary => ({
      id: String(discountRow?.id ?? ''),
      discountId: String(discountRow?.discountId ?? ''),
      discountCodeId: String(discountRow?.discountCodeId ?? ''),
      code: String(discountRow?.code ?? ''),
      name: typeof discountRow?.name === 'string' ? discountRow.name : null,
      originalAmountCents: Number.isFinite(Number(discountRow?.originalAmountCents)) ? Math.max(0, Math.round(Number(discountRow.originalAmountCents))) : 0,
      discountedAmountCents: Number.isFinite(Number(discountRow?.discountedAmountCents)) ? Math.max(0, Math.round(Number(discountRow.discountedAmountCents))) : 0,
      discountAmountCents: Number.isFinite(Number(discountRow?.discountAmountCents)) ? Math.max(0, Math.round(Number(discountRow.discountAmountCents))) : 0,
      paymentIntentId: typeof discountRow?.paymentIntentId === 'string' ? discountRow.paymentIntentId : null,
      registrationId: typeof discountRow?.registrationId === 'string' ? discountRow.registrationId : null,
    }))
    .filter((discount) => Boolean(discount.id));
  const totalAmountCents = Number.isFinite(Number(row?.totalAmountCents)) ? Math.max(0, Math.round(Number(row.totalAmountCents))) : 0;
  const originalAmountCents = Number.isFinite(Number(row?.originalAmountCents)) ? Math.max(0, Math.round(Number(row.originalAmountCents))) : totalAmountCents;
  const discountAmountCents = Number.isFinite(Number(row?.discountAmountCents)) ? Math.max(0, Math.round(Number(row.discountAmountCents))) : 0;

  return {
    billId: String(row?.billId ?? row?.id ?? ''),
    ownerType: row?.ownerType === 'USER' ? 'USER' : 'TEAM',
    ownerId: String(row?.ownerId ?? ''),
    ownerName: typeof row?.ownerName === 'string' && row.ownerName.trim() ? row.ownerName.trim() : String(row?.ownerId ?? ''),
    eventId: typeof row?.eventId === 'string' ? row.eventId : null,
    eventName: typeof row?.eventName === 'string' ? row.eventName : undefined,
    parentBillId: typeof row?.parentBillId === 'string' ? row.parentBillId : null,
    totalAmountCents,
    paidAmountCents: Number.isFinite(Number(row?.paidAmountCents)) ? Math.max(0, Math.round(Number(row.paidAmountCents))) : 0,
    originalAmountCents,
    discountAmountCents,
    discountedAmountCents: Number.isFinite(Number(row?.discountedAmountCents)) ? Math.max(0, Math.round(Number(row.discountedAmountCents))) : Math.max(0, originalAmountCents - discountAmountCents),
    discounts,
    refundedAmountCents: Number.isFinite(Number(row?.refundedAmountCents)) ? Math.max(0, Math.round(Number(row.refundedAmountCents))) : 0,
    refundableAmountCents: Number.isFinite(Number(row?.refundableAmountCents)) ? Math.max(0, Math.round(Number(row.refundableAmountCents))) : 0,
    status: typeof row?.status === 'string' ? row.status : undefined,
    allowSplit: typeof row?.allowSplit === 'boolean' ? row.allowSplit : null,
    paymentPlanEnabled: typeof row?.paymentPlanEnabled === 'boolean' ? row.paymentPlanEnabled : null,
    createdAt: typeof row?.createdAt === 'string' ? row.createdAt : undefined,
    updatedAt: typeof row?.updatedAt === 'string' ? row.updatedAt : undefined,
    payments,
  };
};

const mapOrganizationTeamCustomerRow = (row: Record<string, any>): OrganizationTeamCustomerSummary => {
  const registrationsRaw = Array.isArray(row?.registrations) ? row.registrations : [];
  const documentsRaw = Array.isArray(row?.documents) ? row.documents : [];
  const billsRaw = Array.isArray(row?.bills) ? row.bills : [];
  const totalsRaw = row?.totals && typeof row.totals === 'object' ? row.totals : {};

  const registrations = registrationsRaw
    .map((registrationRow: Record<string, any>): OrganizationTeamRegistrationSummary => ({
      eventId: String(registrationRow?.eventId ?? ''),
      eventName: String(registrationRow?.eventName ?? 'Untitled Event').trim() || 'Untitled Event',
      imageId: typeof registrationRow?.imageId === 'string' && registrationRow.imageId.trim() ? registrationRow.imageId.trim() : null,
      eventTeamId: String(registrationRow?.eventTeamId ?? ''),
      eventTeamName: String(registrationRow?.eventTeamName ?? registrationRow?.eventTeamId ?? 'Event Team').trim() || 'Event Team',
      start: typeof registrationRow?.start === 'string' ? registrationRow.start : undefined,
      end: typeof registrationRow?.end === 'string' ? registrationRow.end : undefined,
      status: typeof registrationRow?.status === 'string' ? registrationRow.status : undefined,
      division: typeof registrationRow?.division === 'string' ? registrationRow.division : undefined,
      sport: typeof registrationRow?.sport === 'string' ? registrationRow.sport : undefined,
      memberCount: Number.isFinite(Number(registrationRow?.memberCount)) ? Math.max(0, Math.round(Number(registrationRow.memberCount))) : 0,
      billIds: Array.isArray(registrationRow?.billIds)
        ? registrationRow.billIds.filter((value: unknown): value is string => typeof value === 'string')
        : [],
      totalAmountCents: Number.isFinite(Number(registrationRow?.totalAmountCents)) ? Math.max(0, Math.round(Number(registrationRow.totalAmountCents))) : 0,
      paidAmountCents: Number.isFinite(Number(registrationRow?.paidAmountCents)) ? Math.max(0, Math.round(Number(registrationRow.paidAmountCents))) : 0,
      originalAmountCents: Number.isFinite(Number(registrationRow?.originalAmountCents)) ? Math.max(0, Math.round(Number(registrationRow.originalAmountCents))) : 0,
      discountAmountCents: Number.isFinite(Number(registrationRow?.discountAmountCents)) ? Math.max(0, Math.round(Number(registrationRow.discountAmountCents))) : 0,
      discountedAmountCents: Number.isFinite(Number(registrationRow?.discountedAmountCents)) ? Math.max(0, Math.round(Number(registrationRow.discountedAmountCents))) : 0,
    }))
    .filter((registration) => Boolean(registration.eventTeamId));

  const documents = documentsRaw
    .map((documentRow: Record<string, any>): OrganizationUserDocumentSummary => ({
      signedDocumentRecordId: String(documentRow?.signedDocumentRecordId ?? ''),
      documentId: String(documentRow?.documentId ?? ''),
      templateId: String(documentRow?.templateId ?? ''),
      eventId: typeof documentRow?.eventId === 'string' ? documentRow.eventId : undefined,
      eventName: typeof documentRow?.eventName === 'string' ? documentRow.eventName : undefined,
      teamId: typeof documentRow?.teamId === 'string' ? documentRow.teamId : undefined,
      title: typeof documentRow?.title === 'string' && documentRow.title.trim() ? documentRow.title.trim() : 'Signed Document',
      type: documentRow?.type === 'TEXT' ? 'TEXT' : 'PDF',
      status: typeof documentRow?.status === 'string' ? documentRow.status : undefined,
      signedAt: typeof documentRow?.signedAt === 'string' ? documentRow.signedAt : undefined,
      viewUrl: typeof documentRow?.viewUrl === 'string' ? documentRow.viewUrl : undefined,
      content: typeof documentRow?.content === 'string' ? documentRow.content : undefined,
    }))
    .filter((document) => Boolean(document.signedDocumentRecordId));
  const bills = billsRaw
    .map((billRow: Record<string, any>) => mapOrganizationBillRow(billRow))
    .filter((bill) => Boolean(bill.billId));

  return {
    canonicalTeamId: String(row?.canonicalTeamId ?? ''),
    name: typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : 'Unnamed Team',
    division: typeof row?.division === 'string' ? row.division : undefined,
    sport: typeof row?.sport === 'string' ? row.sport : undefined,
    profileImageId: typeof row?.profileImageId === 'string' ? row.profileImageId : null,
    memberCount: Number.isFinite(Number(row?.memberCount)) ? Math.max(0, Math.round(Number(row.memberCount))) : 0,
    teamSize: Number.isFinite(Number(row?.teamSize)) ? Math.max(0, Math.round(Number(row.teamSize))) : undefined,
    captainId: typeof row?.captainId === 'string' ? row.captainId : undefined,
    manager: row?.manager && typeof row.manager === 'object' ? mapOrganizationTeamStaffRow(row.manager) : null,
    headCoach: row?.headCoach && typeof row.headCoach === 'object' ? mapOrganizationTeamStaffRow(row.headCoach) : null,
    assistantCoaches: Array.isArray(row?.assistantCoaches)
      ? row.assistantCoaches
        .map((staffRow: Record<string, any>) => mapOrganizationTeamStaffRow(staffRow))
        .filter((staff) => Boolean(staff.userId))
      : [],
    members: Array.isArray(row?.members)
      ? row.members
        .map((memberRow: Record<string, any>) => mapOrganizationTeamMemberRow(memberRow))
        .filter((member) => Boolean(member.userId))
      : [],
    registrations,
    documents,
    bills,
    totals: {
      totalAmountCents: Number.isFinite(Number(totalsRaw?.totalAmountCents)) ? Math.max(0, Math.round(Number(totalsRaw.totalAmountCents))) : 0,
      paidAmountCents: Number.isFinite(Number(totalsRaw?.paidAmountCents)) ? Math.max(0, Math.round(Number(totalsRaw.paidAmountCents))) : 0,
      refundedAmountCents: Number.isFinite(Number(totalsRaw?.refundedAmountCents)) ? Math.max(0, Math.round(Number(totalsRaw.refundedAmountCents))) : 0,
      refundableAmountCents: Number.isFinite(Number(totalsRaw?.refundableAmountCents)) ? Math.max(0, Math.round(Number(totalsRaw.refundableAmountCents))) : 0,
    },
  };
};

const formatSummaryDateTime = (value?: string): string => {
  if (!value) {
    return 'Unknown date';
  }
  const formatted = formatDisplayDateTime(value);
  return formatted || 'Unknown date';
};

const formatSummaryDate = (value?: string): string => {
  if (!value) {
    return 'Unknown date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const normalizeCustomerSearchValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const matchesCustomerSearch = (query: string, values: unknown[]): boolean => {
  if (!query) {
    return true;
  }
  return values.some((value) => normalizeCustomerSearchValue(value).includes(query));
};

const getProfilePreviewUrl = (profileImageId?: string | null, size = 48): string | undefined => (
  profileImageId ? `/api/files/${profileImageId}/preview?w=${size}&h=${size}&fit=cover` : undefined
);

const getCustomerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
};

const formatCustomerMetaToken = (value?: string | null): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const getStaffRoleLabel = (role: OrganizationTeamStaffSummary['role']): string => {
  if (role === 'HEAD_COACH') {
    return 'Head Coach';
  }
  if (role === 'ASSISTANT_COACH') {
    return 'Assistant Coach';
  }
  return 'Manager';
};

function OrganizationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, authUser, loading: authLoading, isAuthenticated, updateUser } = useApp();
  const { location, requestLocation } = useLocation();
  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const routeCustomerType = Array.isArray(params?.customerType)
    ? params?.customerType[0]
    : (params?.customerType as string | undefined);
  const routeCustomerId = Array.isArray(params?.customerId)
    ? params?.customerId[0]
    : (params?.customerId as string | undefined);
  const requestedTab = resolveOrganizationRouteTab({
    pathname,
    organizationId: id,
    queryTab: searchParams?.get('tab'),
  });
  const requestedCustomerType: OrganizationCustomerRouteType | null = routeCustomerType === 'users' || routeCustomerType === 'teams'
    ? routeCustomerType
    : null;
  const requestedCustomerId = typeof routeCustomerId === 'string' && routeCustomerId.trim()
    ? routeCustomerId.trim()
    : null;
  const requestedCustomerKey = requestedCustomerType && requestedCustomerId
    ? `${requestedCustomerType}:${requestedCustomerId}`
    : null;
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrganizationTab>(() => requestedTab ?? 'overview');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showEditOrganizationModal, setShowEditOrganizationModal] = useState(false);
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
  const handledQuickBooksStateRef = useRef<string | null>(null);
  const [updatingEventHostId, setUpdatingEventHostId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffResults, setStaffResults] = useState<UserData[]>([]);
  const [staffSearchLoading, setStaffSearchLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffInvites, setStaffInvites] = useState<RoleInviteRow[]>([
    { firstName: '', lastName: '', email: '', types: ['STAFF'], roleId: null },
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
  const viewerPermissions = useMemo(
    () => (Array.isArray(org?.viewerPermissions) ? org.viewerPermissions : []),
    [org?.viewerPermissions],
  );
  const viewerHasPermission = useCallback(
    (permission: OrganizationPermission): boolean => (
      viewerCanManageOrganization || viewerPermissions.includes(permission)
    ),
    [viewerCanManageOrganization, viewerPermissions],
  );
  const canManageEvents = viewerHasPermission(ORG_PERMISSIONS.EVENTS_MANAGE);
  const canManageFields = viewerHasPermission(ORG_PERMISSIONS.FIELDS_MANAGE);
  const canManageTeams = viewerHasPermission(ORG_PERMISSIONS.TEAMS_MANAGE);
  const canManageProducts = viewerHasPermission(ORG_PERMISSIONS.PRODUCTS_MANAGE);
  const canManageStaff = viewerHasPermission(ORG_PERMISSIONS.STAFF_MANAGE);
  const canManageRoles = viewerHasPermission(ORG_PERMISSIONS.ROLES_MANAGE);
  const canManageStaffSurface = canManageStaff || canManageRoles;
  const canManageStaffCompensation = canManageStaff && viewerHasPermission(ORG_PERMISSIONS.BILLING_MANAGE);
  const canManageFinance = viewerHasPermission(ORG_PERMISSIONS.BILLING_MANAGE)
    || viewerHasPermission(ORG_PERMISSIONS.PAYMENTS_MANAGE);
  const canManageDiscounts = canManageEvents || canManageProducts || canManageTeams || canManageFinance;
  const canManageTemplates = viewerHasPermission(ORG_PERMISSIONS.TEMPLATES_MANAGE);
  const canManageRefunds = viewerHasPermission(ORG_PERMISSIONS.REFUNDS_MANAGE);
  const canManagePublicPage = viewerHasPermission(ORG_PERMISSIONS.ORGANIZATION_MANAGE);
  const isOwner = Boolean(
    viewerCanManageOrganization
      || (
        user
        && org
        && user.$id === org.ownerId
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
  const organizationFieldCount = useMemo(
    () => (
      Array.isArray(org?.fields)
        ? org.fields.filter((field) => typeof field?.$id === 'string' && field.$id.trim().length > 0).length
        : 0
    ),
    [org?.fields],
  );
  const {
    canCreateOrganizationEvents,
    createEventHelperText,
  } = resolveOrganizationEventCreationState({
    canManageEvents,
    organizationFieldCount,
  });
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
      canManageStaff: canManageStaffSurface,
      canManageTemplates,
      canManageRefunds,
      canManageFinance,
      canManagePublicPage,
      canManageTeams,
      canManageFields,
      canManageProducts,
      canManageDiscounts,
      hasTeams: hasVisibleTeams,
      hasRentals: hasVisibleRentals,
      hasResources: organizationFieldCount > 0,
      hasProducts: hasVisibleProducts,
    }),
    [
      hasVisibleProducts,
      hasVisibleRentals,
      hasVisibleTeams,
      organizationFieldCount,
      canManageFields,
      canManageProducts,
      canManageDiscounts,
      canManagePublicPage,
      canManageRefunds,
      canManageFinance,
      canManageStaffSurface,
      canManageTeams,
      canManageTemplates,
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
    () => (Array.isArray(org?.hosts)
      ? org.hosts
        .map((host) => host?.$id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []),
    [org?.hosts],
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
        roleId: null,
        roleName: 'Owner',
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
        roleId: null,
        roleName: 'Owner',
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
        staffMemberId: staffMember.$id,
        userId: staffMember.userId,
        fullName: userDisplayName(userEntry, staffMember.userId),
        userName: userEntry?.userName || null,
        email: org?.staffEmailsByUserId?.[staffMember.userId] ?? staffMember.invite?.email ?? null,
        user: userEntry ?? null,
        status: staffMember.invite?.status === 'DECLINED' ? 'declined' : staffMember.invite ? 'pending' : 'active',
        subtitle: undefined,
        types: staffMember.types,
        roleId: staffMember.roleId ?? null,
        roleName: staffMember.role?.name ?? org?.staffRoles?.find((role) => role.$id === staffMember.roleId)?.name ?? null,
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
        roleId: null,
        roleName: 'Pending',
        canRemove: true,
      });
      seen.add(invite.userId);
    });

    return entries;
  }, [org?.ownerId, org?.staffEmailsByUserId, org?.staffInvites, org?.staffMembers, org?.staffRoles, ownerHost, userDisplayName]);
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
  const [purchaseDiscountCode, setPurchaseDiscountCode] = useState('');
  const [productDiscountCodes, setProductDiscountCodes] = useState<Record<string, string>>({});
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
  const [eventTemplates, setEventTemplates] = useState<Array<{
    id: string;
    name: string;
    eventType?: string | null;
    sportId?: string | null;
  }>>([]);
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
  const [organizationTeamCustomers, setOrganizationTeamCustomers] = useState<OrganizationTeamCustomerSummary[]>([]);
  const [organizationUsersLoading, setOrganizationUsersLoading] = useState(false);
  const [organizationUsersError, setOrganizationUsersError] = useState<string | null>(null);
  const [customerTypeFilters, setCustomerTypeFilters] = useState<OrganizationCustomerTypeFilter[]>(['users', 'teams']);
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebounce(customerSearch, 250);
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(CUSTOMER_PAGE_SIZE);
  const customerSentinelRef = useRef<HTMLDivElement | null>(null);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [customerRefundAmountDraftByPaymentId, setCustomerRefundAmountDraftByPaymentId] = useState<Record<string, number>>({});
  const [refundingCustomerPaymentId, setRefundingCustomerPaymentId] = useState<string | null>(null);
  const [cancellingCustomerPaymentId, setCancellingCustomerPaymentId] = useState<string | null>(null);
  const [cancellingCustomerPlanBillId, setCancellingCustomerPlanBillId] = useState<string | null>(null);
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
      params.set('organizationId', orgId);
      params.set('limit', '200');
      const response = await apiRequest<{ templates?: any[] }>(`/api/event-templates?${params.toString()}`);
      const rows = Array.isArray(response?.templates) ? response.templates : [];
      setEventTemplates(
        rows
          .map((row) => ({
            id: String(row?.id ?? ''),
            name: String(row?.name ?? 'Untitled Template'),
            eventType: typeof row?.eventType === 'string' ? row.eventType : null,
            sportId: typeof row?.sportId === 'string' ? row.sportId : null,
          }))
          .filter((row) => row.id.length > 0),
      );
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
        throw new Error(payload?.error || 'Failed to load organization customers.');
      }
      const rows = Array.isArray(payload?.users) ? payload.users : [];
      const teamRows = Array.isArray(payload?.teams) ? payload.teams : [];
      setOrganizationUsers(rows.map((row: Record<string, any>) => mapOrganizationUserRow(row)));
      setOrganizationTeamCustomers(teamRows.map((row: Record<string, any>) => mapOrganizationTeamCustomerRow(row)));
      if (!silent) {
        setOrganizationUsersError(null);
      }
    } catch (error) {
      console.error('Failed to load organization customers', error);
      setOrganizationUsers([]);
      setOrganizationTeamCustomers([]);
      setOrganizationUsersError(error instanceof Error ? error.message : 'Failed to load organization customers.');
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
    if (authLoading || !isAuthenticated || !user || !id) {
      return;
    }

    const quickBooksState = searchParams?.get('quickbooks');
    if (!quickBooksState) {
      handledQuickBooksStateRef.current = null;
      return;
    }

    const reason = searchParams?.get('reason') ?? '';
    const handledKey = `${id}:${quickBooksState}:${reason}`;
    if (handledQuickBooksStateRef.current === handledKey) {
      return;
    }
    handledQuickBooksStateRef.current = handledKey;

    if (quickBooksState === 'return') {
      notifications.show({
        color: 'green',
        message: 'QuickBooks connected.',
      });
      return;
    }

    if (quickBooksState !== 'error') {
      return;
    }

    const message = reason === 'expired_state'
      ? 'QuickBooks authorization expired. Start the QuickBooks connection again.'
      : reason === 'invalid_state'
        ? 'QuickBooks connection could not be verified. Start the QuickBooks connection again.'
        : reason === 'missing_realm'
          ? 'QuickBooks did not return a company id. Choose a QuickBooks company and try again.'
          : reason === 'token_exchange_failed'
            ? 'QuickBooks approved access, but BracketIQ could not finish the token exchange.'
            : 'QuickBooks connection failed. Start the QuickBooks connection again.';

    notifications.show({
      color: reason === 'expired_state' ? 'yellow' : 'red',
      message,
    });
  }, [authLoading, id, isAuthenticated, searchParams, user]);

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
    if (!org || !canManageTemplates || !user) {
      setTemplateDocuments([]);
      setPendingTemplateCreates([]);
      return;
    }
    loadTemplates(org.$id);
  }, [org, canManageTemplates, user, loadTemplates]);

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
    if (!org || !canManageTemplates || !user) {
      setEventTemplates([]);
      return;
    }
    void loadEventTemplates(org.$id);
  }, [org, canManageTemplates, user, loadEventTemplates]);

  useEffect(() => {
    if (!org || !user || !org.viewerCanAccessUsers) {
      setOrganizationUsers([]);
      setOrganizationTeamCustomers([]);
      setSelectedCustomerKey(null);
      return;
    }
    if (activeTab !== 'users') {
      return;
    }
    void loadOrganizationUsers(org.$id);
  }, [activeTab, org, user, loadOrganizationUsers]);

  useEffect(() => {
    if (!requestedCustomerKey || !requestedCustomerType) {
      return;
    }
    setActiveTab('users');
    setCustomerSearch('');
    setCustomerTypeFilters((current) => (
      current.includes(requestedCustomerType)
        ? current
        : [...current, requestedCustomerType]
    ));
    setSelectedCustomerKey(requestedCustomerKey);
  }, [requestedCustomerKey, requestedCustomerType]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.value === activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0].value);
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!eventTemplateCreateModalOpen || selectedCreateEventTemplateId || eventTemplates.length === 0) {
      return;
    }
    setSelectedCreateEventTemplateId(eventTemplates[0].id);
  }, [eventTemplateCreateModalOpen, eventTemplates, selectedCreateEventTemplateId]);

  useEffect(() => {
    if (requestedTab && availableTabs.some((tab) => tab.value === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [availableTabs, requestedTab]);

  useEffect(() => {
    const teamIdParam = searchParams?.get('teamId')?.trim();
    if (!teamIdParam) {
      return;
    }
    router.replace(buildTeamManagementPath(teamIdParam));
  }, [router, searchParams]);

  const eventTemplateOptions = useMemo(
    () => eventTemplates
      .filter((template) => typeof template.id === 'string' && template.id.length > 0)
      .map((template) => ({
        value: template.id,
        label: template.name?.trim() || 'Untitled Template',
      })),
    [eventTemplates],
  );

  const navigateToEventCreate = useCallback((templateId?: string | null) => {
    if (!canCreateOrganizationEvents) {
      return;
    }
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
  }, [canCreateOrganizationEvents, id, router]);

  const handleCreateEvent = useCallback(() => {
    if (!canCreateOrganizationEvents) {
      return;
    }
    setSelectedCreateEventTemplateId((previous) => {
      if (previous && eventTemplates.some((template) => template.id === previous)) {
        return previous;
      }
      return eventTemplates[0]?.id ?? null;
    });
    setEventTemplateCreateModalOpen(true);
    if (org?.$id && !eventTemplatesLoading && eventTemplates.length === 0) {
      void loadEventTemplates(org.$id);
    }
  }, [canCreateOrganizationEvents, eventTemplates, eventTemplatesLoading, loadEventTemplates, org?.$id]);

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

  const toggleCustomerTypeFilter = useCallback((filter: OrganizationCustomerTypeFilter, checked: boolean) => {
    setCustomerTypeFilters((previous) => {
      if (checked) {
        return previous.includes(filter) ? previous : [...previous, filter];
      }
      return previous.filter((entry) => entry !== filter);
    });
  }, []);

  const resetCustomerFilters = useCallback(() => {
    setCustomerTypeFilters(['users', 'teams']);
    setCustomerSearch('');
  }, []);

  const handleOrganizationTabChange = useCallback((value: string) => {
    const nextTab = value as OrganizationTab;
    setActiveTab(nextTab);
    if (id) {
      window.history.pushState(null, '', buildOrganizationTabPath(id, nextTab));
    }
  }, [id]);

  const openOrganizationCustomer = useCallback((row: OrganizationCustomerRow) => {
    setSelectedCustomerKey(row.key);
    if (id) {
      router.push(buildOrganizationCustomerPath(id, row.type, row.id));
    }
  }, [id, router]);

  const openOrganizationEvent = useCallback((eventId: string) => {
    const params = new URLSearchParams({ tab: 'details' });
    if (canManageEvents) {
      params.set('mode', 'edit');
    }
    router.push(`/events/${eventId}?${params.toString()}`);
  }, [canManageEvents, router]);

  const handleOrganizationEventClick = useCallback((event: Event) => {
    openOrganizationEvent(event.$id);
  }, [openOrganizationEvent]);

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
      if (isStripeConnectMfaRequiredError(error)) {
        notifications.show({
          color: 'yellow',
          message: 'Set up an authenticator app, then return to connect Stripe.',
        });
        router.push(error.mfaSetupPath);
        return;
      }

      console.error('Failed to connect Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to start Stripe onboarding right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setConnectingStripe(false);
    }
  }, [org, isOwner, requiresStripeVerificationEmail, router, stripeEmail]);

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
    if (!org || !user || !canManageProducts) return;
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
  }, [canManageProducts, org, productDescription, productName, productPeriod, productPriceCents, productType, refreshOrganizationProducts, user]);

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
    if (!org || !selectedProduct || !canManageProducts) return;
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
  }, [canManageProducts, closeProductModal, editProductDescription, editProductName, editProductPeriod, editProductPriceCents, editProductType, org, refreshOrganizationProducts, selectedProduct]);

  const handleDeleteProduct = useCallback(async () => {
    if (!org || !selectedProduct || !canManageProducts) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete product "${selectedProduct.name}"? If it has subscriptions or purchase history, it will be deactivated instead.`);
      if (!confirmed) {
        return;
      }
    }
    try {
      setDeletingProduct(true);
      const outcome = await productService.deleteProductResult(selectedProduct.$id);
      notifications.show({
        color: 'green',
        message: describeDeleteOutcome(outcome, {
          deleted: 'Product deleted.',
          deactivated: 'Product deactivated because it has billing history.',
          fallback: 'Product removed from active listings.',
        }),
      });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to delete product', error);
      notifications.show({ color: 'red', message: 'Failed to delete product. Try again.' });
    } finally {
      setDeletingProduct(false);
    }
  }, [canManageProducts, closeProductModal, org, refreshOrganizationProducts, selectedProduct]);

  const startProductCheckout = useCallback(
    async (product: Product, billingAddress?: BillingAddress, discountCode?: string | null) => {
      if (!org || !user) {
        throw new Error('You must be signed in to purchase.');
      }
      try {
        setPurchaseProduct(product);
        setPurchasePaymentData(null);
        const resolvedDiscountCode = (discountCode ?? productDiscountCodes[product.$id] ?? '').trim();
        setPurchaseDiscountCode(resolvedDiscountCode);
        const intent = isSinglePurchasePeriod(product.period)
          ? await paymentService.createProductPaymentIntent(user, product, org, billingAddress, resolvedDiscountCode || null)
          : await productService.createSubscriptionCheckout({
              productId: product.$id,
              billingAddress,
              discountCode: resolvedDiscountCode || null,
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
    [org, productDiscountCodes, user],
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
        if (org?.ownerId) {
          selectedUserIds.add(org.ownerId);
        }
        const filtered = results.filter((candidate) => !selectedUserIds.has(candidate.$id));
        setStaffResults(filtered);
      } catch (error) {
        console.error('Failed to search staff:', error);
        setStaffError('Failed to search staff. Try again.');
      } finally {
        setStaffSearchLoading(false);
      }
    },
    [org?.ownerId, org?.staffMembers],
  );

  const resolveStaffAssignmentRole = useCallback(
    (roleId?: string | null): OrganizationRole | null => {
      const roles = Array.isArray(org?.staffRoles) ? org.staffRoles : [];
      if (roleId) {
        const selectedRole = roles.find((role) => role.$id === roleId);
        if (selectedRole) {
          return selectedRole;
        }
      }
      return roles.find((role) => getStaffMemberTypesForOrganizationRole(role).includes('STAFF'))
        ?? roles[0]
        ?? null;
    },
    [org?.staffRoles],
  );

  const handleInviteExistingStaff = useCallback(
    async (candidate: UserData, roleId: string, types: StaffMemberType[]) => {
      if (!org || !canManageStaff) return;
      try {
        await organizationService.inviteExistingStaff(org.$id, candidate.$id, types, roleId);
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
    [canManageStaff, loadOrg, org],
  );

  const handleInviteStaffEmails = useCallback(async () => {
    if (!org || !canManageStaff || !user) return;

    const sanitized = staffInvites.map((invite) => {
      const role = resolveStaffAssignmentRole(invite.roleId);
      return {
        firstName: invite.firstName.trim(),
        lastName: invite.lastName.trim(),
        email: invite.email.trim(),
        roleId: role?.$id ?? null,
        types: getStaffMemberTypesForOrganizationRole(role),
      };
    });

    for (const invite of sanitized) {
      if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email) || !invite.roleId || invite.types.length === 0) {
        setStaffInviteError('Enter first name, last name, email, and a role for every invite.');
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
          roleId: invite.roleId,
          replaceStaffTypes: true,
        })),
      );
      await loadOrg(org.$id, { silent: true });
      notifications.show({
        color: 'green',
        message: 'Staff invites sent.',
      });
      setStaffInvites([{ firstName: '', lastName: '', email: '', types: ['STAFF'], roleId: null }]);
    } catch (error) {
      setStaffInviteError(error instanceof Error ? error.message : 'Failed to invite staff.');
    } finally {
      setInvitingStaff(false);
    }
  }, [canManageStaff, loadOrg, org, resolveStaffAssignmentRole, staffInvites, user]);

  const handleRemoveStaffMember = useCallback(
    async (userIdToRemove: string) => {
      if (!org || !canManageStaff) return;
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
    [canManageStaff, loadOrg, org],
  );

  const handleUpdateStaffRole = useCallback(
    async (userIdToUpdate: string, roleId: string) => {
      if (!org || !canManageStaff || !roleId) return;
      const role = (org.staffRoles ?? []).find((entry) => entry.$id === roleId);
      if (!role) {
        const error = new Error('Select a valid staff role.');
        notifications.show({ color: 'red', message: error.message });
        throw error;
      }
      try {
        await organizationService.updateStaffMemberTypes(
          org.$id,
          userIdToUpdate,
          getStaffMemberTypesForOrganizationRole(role),
          roleId,
        );
        await loadOrg(org.$id, { silent: true });
      } catch (error) {
        console.error('Failed to update staff member role:', error);
        notifications.show({ color: 'red', message: 'Failed to update staff member role.' });
        throw error;
      }
    },
    [canManageStaff, loadOrg, org],
  );

  const applyStaffRoleUpdate = useCallback((role: OrganizationRole) => {
    setOrg((prev) => {
      if (!prev) return prev;
      const existingRoles = Array.isArray(prev.staffRoles) ? prev.staffRoles : [];
      const hasRole = existingRoles.some((entry) => entry.$id === role.$id);
      const nextRoles = hasRole
        ? existingRoles.map((entry) => (entry.$id === role.$id ? role : entry))
        : [...existingRoles, role];
      const nextStaffMembers = Array.isArray(prev.staffMembers)
        ? prev.staffMembers.map((staffMember) => (
          staffMember.roleId === role.$id
            ? { ...staffMember, role }
            : staffMember
        ))
        : prev.staffMembers;
      return {
        ...prev,
        staffRoles: nextRoles,
        staffMembers: nextStaffMembers,
      };
    });
  }, []);

  const handleCreateStaffRole = useCallback(
    async (name: string, permissions: string[]) => {
      if (!org || !canManageRoles) return;
      const role = await organizationService.createStaffRole(org.$id, { name, permissions });
      applyStaffRoleUpdate(role);
    },
    [applyStaffRoleUpdate, canManageRoles, org],
  );

  const handleUpdateStaffRoleDefinition = useCallback(
    async (roleId: string, data: { name?: string; permissions?: string[] }) => {
      if (!org || !canManageRoles) return;
      const role = await organizationService.updateStaffRole(org.$id, roleId, data);
      applyStaffRoleUpdate(role);
    },
    [applyStaffRoleUpdate, canManageRoles, org],
  );

  const handleUpdateEventHost = useCallback(async (eventId: string, hostId: string) => {
    if (!org || !canManageEvents || !eventId || !hostId) return;
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
	  }, [canManageEvents, org]);

  const showUserCustomers = customerTypeFilters.includes('users');
  const showTeamCustomers = customerTypeFilters.includes('teams');
  const normalizedCustomerSearch = normalizeCustomerSearchValue(debouncedCustomerSearch);
  const filteredOrganizationUsers = useMemo(() => (
    organizationUsers.filter((summary) => matchesCustomerSearch(normalizedCustomerSearch, [
      summary.fullName,
      summary.firstName,
      summary.lastName,
      summary.userName,
      ...summary.teams.flatMap((team) => [
        team.teamName,
        team.division,
        team.sport,
        team.status,
        team.rosterRole,
      ]),
      ...summary.events.flatMap((eventSummary) => [
        eventSummary.eventName,
        eventSummary.status,
      ]),
      ...summary.documents.flatMap((documentSummary) => [
        documentSummary.title,
        documentSummary.status,
        documentSummary.eventName,
      ]),
      ...summary.bills.flatMap((bill) => [
        bill.eventName,
        bill.ownerName,
        bill.status,
      ]),
    ]))
  ), [normalizedCustomerSearch, organizationUsers]);
  const filteredOrganizationTeamCustomers = useMemo(() => (
    organizationTeamCustomers.filter((summary) => matchesCustomerSearch(normalizedCustomerSearch, [
      summary.name,
      summary.division,
      summary.sport,
      summary.manager?.fullName,
      summary.headCoach?.fullName,
      ...summary.assistantCoaches.map((coach) => coach.fullName),
      ...summary.members.flatMap((member) => [
        member.fullName,
        member.userName,
        member.status,
        member.rosterRole,
        member.position,
      ]),
      ...summary.registrations.flatMap((registration) => [
        registration.eventName,
        registration.eventTeamName,
        registration.status,
        registration.division,
        registration.sport,
      ]),
      ...summary.bills.flatMap((bill) => [
        bill.eventName,
        bill.ownerName,
        bill.status,
      ]),
      ...summary.documents.flatMap((documentSummary) => [
        documentSummary.title,
        documentSummary.status,
        documentSummary.eventName,
      ]),
    ]))
  ), [normalizedCustomerSearch, organizationTeamCustomers]);
  const organizationCustomerRows = useMemo<OrganizationCustomerRow[]>(() => {
    const rows: OrganizationCustomerRow[] = [];
    if (showUserCustomers) {
      rows.push(...filteredOrganizationUsers.map((summary) => ({
        key: `users:${summary.userId}`,
        type: 'users' as const,
        id: summary.userId,
        name: summary.fullName,
        subtitle: summary.userName ? `@${summary.userName}` : undefined,
        profileImageId: summary.profileImageId,
        events: summary.events,
        user: summary,
      })));
    }
    if (showTeamCustomers) {
      rows.push(...filteredOrganizationTeamCustomers.map((summary) => ({
        key: `teams:${summary.canonicalTeamId}`,
        type: 'teams' as const,
        id: summary.canonicalTeamId,
        name: summary.name,
        subtitle: [summary.division, summary.sport].filter(Boolean).join(' • ') || undefined,
        profileImageId: summary.profileImageId,
        events: summary.registrations,
        team: summary,
      })));
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [filteredOrganizationTeamCustomers, filteredOrganizationUsers, showTeamCustomers, showUserCustomers]);
  const visibleOrganizationCustomerRows = organizationCustomerRows.slice(0, visibleCustomerCount);
  const hasMoreVisibleCustomers = visibleOrganizationCustomerRows.length < organizationCustomerRows.length;
  const hasVisibleCustomerResults = organizationCustomerRows.length > 0;
  const customerFilterIsDefault = (
    customerTypeFilters.length === 2
    && showUserCustomers
    && showTeamCustomers
    && customerSearch.trim().length === 0
  );
  const selectedOrganizationCustomer = organizationCustomerRows.find((row) => row.key === selectedCustomerKey) ?? null;

  useEffect(() => {
    setVisibleCustomerCount(CUSTOMER_PAGE_SIZE);
  }, [normalizedCustomerSearch, organizationUsers.length, organizationTeamCustomers.length, showUserCustomers, showTeamCustomers]);

  useEffect(() => {
    if (activeTab !== 'users' || !hasMoreVisibleCustomers) {
      return;
    }
    const el = customerSentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setVisibleCustomerCount((current) => Math.min(
            current + CUSTOMER_PAGE_SIZE,
            organizationCustomerRows.length,
          ));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, hasMoreVisibleCustomers, organizationCustomerRows.length]);

  useEffect(() => {
    if (activeTab !== 'users') {
      return;
    }
    if (!organizationCustomerRows.length) {
      if (!requestedCustomerKey) {
        setSelectedCustomerKey(null);
      }
      return;
    }
    setSelectedCustomerKey((current) => (
      current && organizationCustomerRows.some((row) => row.key === current)
        ? current
        : requestedCustomerKey && organizationCustomerRows.some((row) => row.key === requestedCustomerKey)
          ? requestedCustomerKey
        : organizationCustomerRows[0].key
    ));
  }, [activeTab, organizationCustomerRows, requestedCustomerKey]);

  useEffect(() => {
    if (activeTab !== 'users' || !selectedCustomerKey) {
      return;
    }
    const selectedIndex = organizationCustomerRows.findIndex((row) => row.key === selectedCustomerKey);
    if (selectedIndex >= visibleCustomerCount) {
      setVisibleCustomerCount(selectedIndex + 1);
    }
  }, [activeTab, organizationCustomerRows, selectedCustomerKey, visibleCustomerCount]);

  const refreshOrganizationCustomers = useCallback(async () => {
    if (!org?.$id) {
      return;
    }
    await loadOrganizationUsers(org.$id, { silent: true });
  }, [loadOrganizationUsers, org?.$id]);

  const handleRefundCustomerBillPayment = useCallback(async (
    bill: OrganizationBillSummary,
    payment: OrganizationBillPaymentSummary,
  ) => {
    const draftDollars = customerRefundAmountDraftByPaymentId[payment.paymentId] ?? (payment.refundableAmountCents / 100);
    const amountCents = Math.round(Number(draftDollars) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a refund amount greater than zero.' });
      return;
    }
    if (amountCents > payment.refundableAmountCents) {
      notifications.show({ color: 'red', message: 'Refund amount exceeds the refundable balance.' });
      return;
    }
    const confirmed = window.confirm(`Refund ${formatPrice(amountCents)} for this bill payment?`);
    if (!confirmed) {
      return;
    }

    setRefundingCustomerPaymentId(payment.paymentId);
    try {
      await apiRequest(`/api/billing/bills/${encodeURIComponent(bill.billId)}/payments/${encodeURIComponent(payment.paymentId)}/refund`, {
        method: 'POST',
        body: { amountCents },
      });
      notifications.show({ color: 'green', message: 'Bill payment refunded.' });
      setCustomerRefundAmountDraftByPaymentId((current) => {
        const next = { ...current };
        delete next[payment.paymentId];
        return next;
      });
      await refreshOrganizationCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refund bill payment.';
      notifications.show({ color: 'red', message });
    } finally {
      setRefundingCustomerPaymentId(null);
    }
  }, [customerRefundAmountDraftByPaymentId, refreshOrganizationCustomers]);

  const handleCancelCustomerPendingBillPayment = useCallback(async (
    bill: OrganizationBillSummary,
    payment: OrganizationBillPaymentSummary,
  ) => {
    const confirmed = window.confirm('Cancel this pending Stripe payment? The customer can retry payment afterward when the bill remains open.');
    if (!confirmed) {
      return;
    }

    setCancellingCustomerPaymentId(payment.paymentId);
    try {
      await apiRequest(`/api/billing/bills/${encodeURIComponent(bill.billId)}/payments/${encodeURIComponent(payment.paymentId)}/cancel`, {
        method: 'POST',
      });
      notifications.show({ color: 'green', message: 'Pending bill payment cancelled.' });
      await refreshOrganizationCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel pending payment.';
      notifications.show({ color: 'red', message });
    } finally {
      setCancellingCustomerPaymentId(null);
    }
  }, [refreshOrganizationCustomers]);

  const handleCancelCustomerPaymentPlan = useCallback(async (bill: OrganizationBillSummary) => {
    const confirmed = window.confirm('Cancel this bill payment plan and void its unpaid installments? Paid installments will stay recorded.');
    if (!confirmed) {
      return;
    }

    setCancellingCustomerPlanBillId(bill.billId);
    try {
      await apiRequest(`/api/billing/bills/${encodeURIComponent(bill.billId)}/payment-plan/cancel`, {
        method: 'POST',
      });
      notifications.show({ color: 'green', message: 'Bill payment plan cancelled.' });
      await refreshOrganizationCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel payment plan.';
      notifications.show({ color: 'red', message });
    } finally {
      setCancellingCustomerPlanBillId(null);
    }
  }, [refreshOrganizationCustomers]);

  const buildCustomerTeamCardTeam = (
    team: OrganizationTeamMembershipSummary | OrganizationTeamCustomerSummary,
  ): Team => {
    const teamId = 'canonicalTeamId' in team ? team.canonicalTeamId : team.teamId;
    const teamName = 'name' in team ? team.name : team.teamName;
    const memberCount = 'memberCount' in team ? team.memberCount : 0;
    const teamSize = 'teamSize' in team && typeof team.teamSize === 'number' ? team.teamSize : 0;
    const captainId = 'captainId' in team && team.captainId ? team.captainId : '';
    return {
      $id: teamId,
      name: teamName,
      division: team.division ?? 'Division',
      sport: team.sport ?? '',
      playerIds: [],
      captainId,
      pending: [],
      teamSize,
      profileImageId: 'profileImageId' in team ? team.profileImageId ?? undefined : undefined,
      organizationId: id,
      currentSize: memberCount,
      isFull: teamSize > 0 && memberCount >= teamSize,
      avatarUrl: '',
    };
  };

  const renderCustomerDetailSection = (title: string, children: ReactNode) => (
    <Stack gap="xs" className="org-customer-detail-section">
      <Text fw={700}>{title}</Text>
      {children}
    </Stack>
  );

  const renderCustomerTeamCards = (
    teams: Array<OrganizationTeamMembershipSummary | OrganizationTeamCustomerSummary>,
    emptyText = 'No organization team registrations.',
  ) => (
    teams.length > 0 ? (
      <Stack gap={8}>
        {teams.map((team) => {
          const teamId = 'canonicalTeamId' in team ? team.canonicalTeamId : team.teamId;
          return (
            <TeamCard
              key={teamId}
              team={buildCustomerTeamCardTeam(team)}
              className="org-customer-detail-item org-customer-team-card"
            />
          );
        })}
      </Stack>
    ) : (
      <Text size="xs" c="dimmed">{emptyText}</Text>
    )
  );

  const renderCustomerEvents = (
    events: OrganizationUserEventSummary[],
    emptyText = 'No organization events.',
  ) => (
    events.length > 0 ? (
      <Stack gap={8}>
        {events.map((eventSummary) => (
          <Paper
            key={eventSummary.eventId}
            withBorder
            radius="md"
            p="xs"
            className="org-customer-detail-item org-customer-event-card"
            onClick={() => openOrganizationEvent(eventSummary.eventId)}
          >
            <Group gap="sm" wrap="nowrap" align="center">
              <Avatar
                src={getEventImageUrl({
                  imageId: eventSummary.imageId,
                  width: 96,
                  height: 96,
                  placeholderUrl: getEventImageFallbackUrl({
                    hostLabel: eventSummary.eventName,
                    width: 96,
                    height: 96,
                  }),
                })}
                alt={eventSummary.eventName}
                radius="md"
                size={48}
                className="org-customer-event-card__avatar"
              >
                {getCustomerInitials(eventSummary.eventName)}
              </Avatar>
              <Stack gap={2} className="min-w-0">
                <Text size="sm" fw={700} lineClamp={2}>{eventSummary.eventName}</Text>
                <Text size="xs" c="dimmed">
                  {formatSummaryDateTime(eventSummary.start)}
                  {eventSummary.status ? ` • ${formatCustomerMetaToken(eventSummary.status) ?? eventSummary.status}` : ''}
                </Text>
              </Stack>
            </Group>
          </Paper>
        ))}
      </Stack>
    ) : (
      <Text size="xs" c="dimmed">{emptyText}</Text>
    )
  );

  const renderCustomerBills = (bills: OrganizationBillSummary[], emptyText = 'No bills.') => (
    bills.length > 0 ? (
      <Stack gap="sm">
        {bills.map((bill) => {
          const payments = bill.payments.slice().sort((a, b) => a.sequence - b.sequence);
          const billMeta = [
            bill.ownerName,
            bill.ownerType,
            formatCustomerMetaToken(bill.status) ?? 'Open',
            bill.paymentPlanEnabled ? 'Payment plan' : null,
          ].filter(Boolean);
          const paymentSummary = formatBillPaidProgress(bill);
          const paymentLine = [
            paymentSummary,
            bill.refundedAmountCents > 0 ? `${formatPrice(bill.refundedAmountCents)} refunded` : null,
            bill.refundableAmountCents > 0 ? `${formatPrice(bill.refundableAmountCents)} refundable` : null,
          ].filter(Boolean);
          const hasUnpaidPlanPayments = payments.some((payment) => (
            payment.status !== 'PAID' && payment.status !== 'VOID'
          ));
          const canCancelPaymentPlan = Boolean(
            isOwner
              && bill.paymentPlanEnabled
              && bill.status !== 'CANCELLED'
              && hasUnpaidPlanPayments,
          );

          return (
            <Paper
              key={bill.billId}
              withBorder
              radius="md"
              p="sm"
              className="org-customer-detail-item org-customer-bill-card"
            >
              <Group justify="space-between" align="flex-start" gap="xs" wrap="wrap">
                <Stack gap={0} className="min-w-0">
                  <Text size="sm" fw={500}>{bill.eventName ?? 'Event bill'}</Text>
                  <Text size="xs" c="dimmed">{billMeta.join(' • ')}</Text>
                  {paymentLine.length > 0 && (
                    <Text size="xs" c="dimmed">{paymentLine.join(' • ')}</Text>
                  )}
                </Stack>
                {canCancelPaymentPlan && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="red"
                    loading={cancellingCustomerPlanBillId === bill.billId}
                    onClick={() => {
                      void handleCancelCustomerPaymentPlan(bill);
                    }}
                  >
                    Cancel plan
                  </Button>
                )}
              </Group>

              {payments.length > 0 && (
                <Stack gap={6}>
                  {payments.map((payment) => {
                    const statusLabel = formatCustomerMetaToken(payment.status) ?? 'Pending';
                    const canRefundPayment = Boolean(
                      isOwner
                        && payment.isRefundable
                        && payment.paymentIntentId
                        && payment.refundableAmountCents > 0,
                    );
                    const canCancelPendingPayment = Boolean(isOwner && payment.status === 'PROCESSING');
                    const maxRefundDollars = payment.refundableAmountCents / 100;
                    const draftRefundDollars = customerRefundAmountDraftByPaymentId[payment.paymentId] ?? maxRefundDollars;
                    return (
                      <Stack
                        key={payment.paymentId}
                        gap={6}
                        className="rounded-md bg-slate-50 px-3 py-2"
                      >
                        <Group justify="space-between" gap="xs" wrap="wrap">
                          <Group gap={6}>
                            <Text size="xs" fw={600}>Payment #{payment.sequence || 1}</Text>
                            <Badge size="xs" variant="light" color={payment.status === 'PAID' ? 'green' : payment.status === 'PROCESSING' ? 'yellow' : 'gray'}>
                              {statusLabel}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {formatPrice(payment.amountCents)}
                            {payment.refundedAmountCents > 0 ? ` • ${formatPrice(payment.refundedAmountCents)} refunded` : ''}
                          </Text>
                        </Group>

                        {(canRefundPayment || canCancelPendingPayment) && (
                          <Group gap="xs" align="flex-end" wrap="wrap">
                            {canRefundPayment && (
                              <>
                                <NumberInput
                                  aria-label={`Refund amount for payment ${payment.sequence || 1}`}
                                  min={0}
                                  max={maxRefundDollars}
                                  decimalScale={2}
                                  fixedDecimalScale
                                  prefix="$"
                                  value={draftRefundDollars}
                                  onChange={(value) => {
                                    const numeric = typeof value === 'number' ? value : Number(value);
                                    setCustomerRefundAmountDraftByPaymentId((current) => ({
                                      ...current,
                                      [payment.paymentId]: Number.isFinite(numeric)
                                        ? Math.min(maxRefundDollars, Math.max(0, numeric))
                                        : 0,
                                    }));
                                  }}
                                  w={132}
                                  size="xs"
                                />
                                <Button
                                  size="compact-xs"
                                  loading={refundingCustomerPaymentId === payment.paymentId}
                                  disabled={Boolean(refundingCustomerPaymentId && refundingCustomerPaymentId !== payment.paymentId)}
                                  onClick={() => {
                                    void handleRefundCustomerBillPayment(bill, payment);
                                  }}
                                >
                                  Refund
                                </Button>
                              </>
                            )}
                            {canCancelPendingPayment && (
                              <Button
                                size="compact-xs"
                                variant="light"
                                color="red"
                                loading={cancellingCustomerPaymentId === payment.paymentId}
                                disabled={Boolean(cancellingCustomerPaymentId && cancellingCustomerPaymentId !== payment.paymentId)}
                                onClick={() => {
                                  void handleCancelCustomerPendingBillPayment(bill, payment);
                                }}
                              >
                                Cancel pending
                              </Button>
                            )}
                          </Group>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    ) : (
      <Text size="xs" c="dimmed">{emptyText}</Text>
    )
  );

  const renderCustomerDocuments = (documents: OrganizationUserDocumentSummary[], emptyText = 'No documents.') => (
    documents.length > 0 ? (
      <Stack gap={8}>
        {documents.map((documentSummary) => (
          <Paper
            key={documentSummary.signedDocumentRecordId}
            withBorder
            radius="md"
            p="sm"
            className="org-customer-detail-item org-customer-document-card"
            onClick={() => openSignedDocumentPreview(documentSummary)}
          >
            <Stack gap={0} className="min-w-0">
              <Text size="sm" fw={700}>{documentSummary.title}</Text>
              <Text size="xs" c="dimmed">
                Signed {formatSummaryDate(documentSummary.signedAt)}
              </Text>
            </Stack>
          </Paper>
        ))}
      </Stack>
    ) : (
      <Text size="xs" c="dimmed">{emptyText}</Text>
    )
  );

  const renderCustomerAvatar = (
    name: string,
    profileImageId?: string | null,
    type: OrganizationCustomerTypeFilter = 'users',
    size = 40,
  ) => (
    <Avatar
      src={getProfilePreviewUrl(profileImageId, size)}
      radius="xl"
      size={size}
      color={type === 'teams' ? 'blue' : 'gray'}
    >
      {getCustomerInitials(name)}
    </Avatar>
  );

  const renderPersonSummary = (
    person: Pick<OrganizationTeamMemberSummary, 'fullName' | 'userName' | 'profileImageId'>,
    type: OrganizationCustomerTypeFilter = 'users',
  ) => (
    <Group gap="sm" align="center" className="min-w-0">
      {renderCustomerAvatar(person.fullName, person.profileImageId, type, 34)}
      <Stack gap={0} className="min-w-0">
        <Text size="sm" fw={600} truncate>{person.fullName}</Text>
        {person.userName && <Text size="xs" c="dimmed" truncate>@{person.userName}</Text>}
      </Stack>
    </Group>
  );

  const renderSelectedCustomerDetail = () => {
    if (!selectedOrganizationCustomer) {
      return (
        <Stack gap="xs">
          <Title order={5}>Customer details</Title>
          <Text size="sm" c="dimmed">Select a customer row to view roster, billing, document, and event details.</Text>
        </Stack>
      );
    }

    if (selectedOrganizationCustomer.user) {
      const summary = selectedOrganizationCustomer.user;
      return (
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Group gap="sm" align="center">
              {renderCustomerAvatar(summary.fullName, summary.profileImageId, 'users', 46)}
              <Stack gap={2}>
                <Group gap={6} align="center">
                  <Title order={5}>{summary.fullName}</Title>
                  <Badge size="sm" variant="light">User</Badge>
                </Group>
                {summary.userName && <Text size="sm" c="dimmed">@{summary.userName}</Text>}
              </Stack>
            </Group>
            <Group gap={6}>
              <Badge variant="light" color="blue">{summary.events.length} events</Badge>
              <Badge variant="light" color="gray">{summary.teams.length} org teams</Badge>
              <Badge variant="light" color="green">{summary.bills.length} bills</Badge>
              <Badge variant="light" color="grape">{summary.documents.length} documents</Badge>
            </Group>
          </Group>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            {renderCustomerDetailSection('Org teams', renderCustomerTeamCards(summary.teams))}
            {renderCustomerDetailSection('Events', renderCustomerEvents(summary.events))}
            {renderCustomerDetailSection('Bills', renderCustomerBills(summary.bills))}
            {renderCustomerDetailSection('Signed documents', renderCustomerDocuments(summary.documents))}
          </SimpleGrid>
        </Stack>
      );
    }

    const summary = selectedOrganizationCustomer.team;
    if (!summary) {
      return null;
    }
    const staffRows = [
      summary.manager ? { ...summary.manager, label: getStaffRoleLabel(summary.manager.role) } : null,
      summary.headCoach ? { ...summary.headCoach, label: getStaffRoleLabel(summary.headCoach.role) } : null,
      ...summary.assistantCoaches.map((coach) => ({ ...coach, label: getStaffRoleLabel(coach.role) })),
    ].filter((entry): entry is OrganizationTeamStaffSummary & { label: string } => Boolean(entry));
    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Group gap="sm" align="center">
            {renderCustomerAvatar(summary.name, summary.profileImageId, 'teams', 46)}
            <Stack gap={2}>
              <Group gap={6} align="center">
                <Title order={5}>{summary.name}</Title>
                <Badge size="sm" variant="light" color="blue">Team</Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {[summary.division, summary.sport, `${summary.memberCount}${summary.teamSize ? `/${summary.teamSize}` : ''} members`].filter(Boolean).join(' • ')}
              </Text>
            </Stack>
          </Group>
          <Group gap={6}>
            <Badge variant="light" color="blue">{summary.registrations.length} events</Badge>
            <Badge variant="light" color="green">{summary.bills.length} bills</Badge>
            <Badge variant="light" color="grape">{summary.documents.length} documents</Badge>
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {renderCustomerDetailSection('Team staff', (
            staffRows.length > 0 ? (
              <Stack gap={8}>
                {staffRows.map((staff) => (
                  <Paper key={`${staff.role}-${staff.userId}`} withBorder p="sm" radius="md" className="org-customer-detail-item">
                    <Group justify="space-between" gap="sm">
                      {renderPersonSummary(staff)}
                      <Badge size="xs" variant="light" color="gray">{staff.label}</Badge>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed">No manager or coach assignments.</Text>
            )
          ))}
          {renderCustomerDetailSection('Events', renderCustomerEvents(summary.registrations, 'No organization event registrations.'))}
        </SimpleGrid>
        {renderCustomerDetailSection('Players', (
          summary.members.length > 0 ? (
            <Stack gap="sm">
              {summary.members.map((member) => {
                const meta = [
                  member.isCaptain ? 'Captain' : null,
                  formatCustomerMetaToken(member.status),
                  formatCustomerMetaToken(member.rosterRole),
                  member.position,
                  member.jerseyNumber ? `#${member.jerseyNumber}` : null,
                ].filter(Boolean);
                return (
                  <Paper key={member.userId} withBorder p="sm" radius="md" className="org-customer-detail-item">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" wrap="wrap">
                        {renderPersonSummary(member)}
                        {meta.length > 0 && (
                          <Group gap={6}>
                            {meta.map((item) => (
                              <Badge key={item} size="xs" variant="light" color={item === 'Captain' ? 'blue' : 'gray'}>
                                {item}
                              </Badge>
                            ))}
                          </Group>
                        )}
                      </Group>
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                        <div className="org-customer-detail-subgroup">
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Bills</Text>
                          {renderCustomerBills(member.bills, 'No player bills.')}
                        </div>
                        <div className="org-customer-detail-subgroup">
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Documents</Text>
                          {renderCustomerDocuments(member.documents, 'No player documents.')}
                        </div>
                      </SimpleGrid>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">No players found for this team.</Text>
          )
        ))}
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {renderCustomerDetailSection('Team bills', renderCustomerBills(summary.bills))}
          {renderCustomerDetailSection('Team documents', renderCustomerDocuments(summary.documents))}
        </SimpleGrid>
      </Stack>
    );
  };

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
              onChange={handleOrganizationTabChange}
              data={availableTabs}
              className="org-tab-segmented"
              radius="xl"
              mb="lg"
            />

            <div className="org-tab-content">
            {activeTab === 'overview' && (
              <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
                <div style={{ gridColumn: 'span 2' }}>
                  <Paper withBorder p="md" radius="md" mb="md" className="org-tab-surface">
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
                  <Paper withBorder p="md" radius="md" className="org-tab-surface">
                    <Title order={5} mb="md">Recent Events</Title>
                    {overviewRecentEvents.length > 0 ? (
                      <ResponsiveCardGrid>
                        {overviewRecentEvents.slice(0, 4).map((e) => (
                          <EventCard
                            key={e.$id}
                            event={e}
                            onClick={() => handleOrganizationEventClick(e)}
                            hostOptions={canManageEvents ? eventHostOptions : undefined}
                            selectedHostId={e.hostId ?? undefined}
                            hostChangeDisabled={updatingEventHostId === e.$id}
                            onHostChange={canManageEvents ? (hostId) => {
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
                    <Paper withBorder p="md" radius="md" mb="md" className="org-tab-surface">
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
                  <Paper withBorder p="md" radius="md" className="org-tab-surface org-tab-surface--grouped">
                    <Title order={5} mb="md">Teams</Title>
                    {org.teams && org.teams.length > 0 ? (
                      <div className="space-y-3">
                        {org.teams.slice(0, 3).map((t) => (
                          <TeamCard key={t.$id} team={t} className="org-tab-item" />
                        ))}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">No teams yet.</Text>
                    )}
                  </Paper>
                  {isOwner && (
                    <Paper withBorder p="md" radius="md" mt="md" className="org-tab-surface org-tab-surface--grouped">
                      <Title order={5} mb="md">Officials</Title>
                      {currentOfficials.length > 0 ? (
                        <div className="space-y-3">
                          {currentOfficials.slice(0, 4).map((ref) => (
                            <UserCard key={ref.$id} user={ref} className="org-tab-item !shadow-none" />
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
                totalEvents={eventsTabEvents.length}
                isLoadingInitial={eventsTabLoadingInitial}
                isLoadingMore={eventsTabLoadingMore}
                hasMoreEvents={eventsTabHasMoreEvents}
                sentinelRef={eventsTabSentinelRef}
                eventsError={eventsTabError}
                onEventClick={handleOrganizationEventClick}
                onCreateEvent={handleCreateEvent}
                showCreateEventButton={canManageEvents}
                createEventDisabled={!canCreateOrganizationEvents}
                createEventHelperText={createEventHelperText}
                hideWeeklyChildren={hideWeeklyChildEvents}
                setHideWeeklyChildren={setHideWeeklyChildEvents}
              />
            )}

            {canManageTemplates && activeTab === 'eventTemplates' && (
              <Paper withBorder p="md" radius="md" className="org-tab-surface">
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
                      <Paper
                        key={eventTemplate.id}
                        withBorder
                        radius="md"
                        p="md"
                        className="org-tab-item"
                      >
                        <Stack gap="sm">
                          <Badge variant="light" color="blue" radius="xl">
                            Event template
                          </Badge>
                          <div>
                            <Text fw={700}>{eventTemplate.name}</Text>
                            {eventTemplate.eventType && (
                              <Text size="xs" c="dimmed" mt={4}>
                                {eventTemplate.eventType}
                              </Text>
                            )}
                          </div>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => navigateToEventCreate(eventTemplate.id)}
                          >
                            Create event
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                  </ResponsiveCardGrid>
                ) : (
                  <Text size="sm" c="dimmed">No event templates yet.</Text>
                )}
              </Paper>
            )}

            {activeTab === 'teams' && (
              <Paper withBorder p="md" radius="md" className="org-tab-surface">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Teams</Title>
                  {canManageTeams && <Button onClick={() => setShowCreateTeamModal(true)}>Create Team</Button>}
                </Group>
                {org.teams && org.teams.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                    {org.teams.map((t) => (
                      <TeamCard
                        key={t.$id}
                        team={t}
                        className="org-tab-item"
                        onClick={() => router.push(buildTeamManagementPath(t.$id))}
                      />
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No teams yet.</Text>
                )}
              </Paper>
            )}

            {activeTab === 'users' && (
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Title order={5}>Customers</Title>
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
                  <Text size="sm" c="red">
                    {organizationUsersError}
                  </Text>
                )}

                {organizationUsersLoading ? (
                  <Text size="sm" c="dimmed">Loading customers...</Text>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
                    <aside className="lg:sticky lg:top-24 lg:self-start">
                      <Paper withBorder p={0} radius="lg" className="overflow-hidden">
                        <div className="discover-filter-panel p-4">
                          <Group justify="space-between" align="center" mb="md">
                            <Text fw={700} size="sm">
                              Filters
                            </Text>
                            <Button
                              variant="subtle"
                              size="compact-sm"
                              onClick={resetCustomerFilters}
                              disabled={customerFilterIsDefault}
                            >
                              Reset
                            </Button>
                          </Group>
                          <Stack gap="lg">
                            <div>
                              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
                                Customer Type
                              </Text>
                              <Group gap="xs">
                                <Chip
                                  radius="xl"
                                  checked={showUserCustomers && showTeamCustomers}
                                  onChange={(checked) => setCustomerTypeFilters(checked ? ['users', 'teams'] : [])}
                                >
                                  All
                                </Chip>
                                <Chip
                                  radius="xl"
                                  checked={showUserCustomers}
                                  onChange={(checked) => toggleCustomerTypeFilter('users', checked)}
                                >
                                  Users
                                </Chip>
                                <Chip
                                  radius="xl"
                                  checked={showTeamCustomers}
                                  onChange={(checked) => toggleCustomerTypeFilter('teams', checked)}
                                >
                                  Teams
                                </Chip>
                              </Group>
                            </div>
                            <div>
                              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
                                Customer
                              </Text>
                              <TextInput
                                placeholder="Search customers..."
                                value={customerSearch}
                                onChange={(event) => setCustomerSearch(event.currentTarget.value)}
                              />
                            </div>
                          </Stack>
                        </div>
                      </Paper>
                    </aside>

                    <div className="min-w-0 grid gap-4 xl:grid-cols-[minmax(24rem,0.9fr)_minmax(32rem,1.35fr)]">
                      <Paper withBorder p={0} radius="md" className="org-customer-table-card overflow-hidden">
                        <div style={{ overflowX: 'auto' }}>
                          <Table withColumnBorders highlightOnHover style={{ minWidth: '100%', tableLayout: 'fixed' }}>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th style={{ width: '42%' }}>Customer</Table.Th>
                                <Table.Th style={{ width: '58%' }}>Events</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {hasVisibleCustomerResults ? (
                                visibleOrganizationCustomerRows.map((row) => {
                                  const selected = selectedOrganizationCustomer?.key === row.key;
                                  const condensedEvents = row.events.slice(0, 3);
                                  return (
                                    <Table.Tr
                                      key={row.key}
                                      className="org-customer-list-row"
                                      data-selected={selected ? 'true' : undefined}
                                      onClick={() => openOrganizationCustomer(row)}
                                    >
                                      <Table.Td>
                                        <Group gap="sm" align="center" className="min-w-0">
                                          {renderCustomerAvatar(row.name, row.profileImageId, row.type)}
                                          <Stack gap={2} className="min-w-0">
                                            <Group gap={6}>
                                              <Text fw={600} truncate>{row.name}</Text>
                                              <Badge size="xs" variant="light" color={row.type === 'teams' ? 'blue' : 'gray'}>
                                                {row.type === 'teams' ? 'Team' : 'User'}
                                              </Badge>
                                            </Group>
                                            {row.subtitle && <Text size="xs" c="dimmed" truncate>{row.subtitle}</Text>}
                                          </Stack>
                                        </Group>
                                      </Table.Td>
                                      <Table.Td>
                                        {condensedEvents.length > 0 ? (
                                          <Stack gap={4}>
                                            {condensedEvents.map((eventSummary) => (
                                              <Stack key={`${row.key}-${eventSummary.eventId}`} gap={0}>
                                                <Text size="sm" fw={500} lineClamp={2}>
                                                  {eventSummary.eventName}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                  {formatSummaryDateTime(eventSummary.start)}
                                                </Text>
                                              </Stack>
                                            ))}
                                            {row.events.length > condensedEvents.length && (
                                              <Text size="xs" c="dimmed">
                                                +{row.events.length - condensedEvents.length} more
                                              </Text>
                                            )}
                                          </Stack>
                                        ) : (
                                          <Text size="xs" c="dimmed">No events</Text>
                                        )}
                                      </Table.Td>
                                    </Table.Tr>
                                  );
                                })
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={2}>
                                    <Text size="sm" c="dimmed">No customers found for the selected filters.</Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Table.Tbody>
                          </Table>
                        </div>
                        {hasMoreVisibleCustomers && (
                          <Group ref={customerSentinelRef} justify="center" py="sm">
                            <Text size="xs" c="dimmed">Scroll for more customers.</Text>
                          </Group>
                        )}
                      </Paper>

                      <Paper withBorder p="md" radius="md" className="org-customer-detail-panel min-w-0 xl:sticky xl:top-24 xl:self-start">
                        <ScrollArea.Autosize mah={720} type="auto">
                          {renderSelectedCustomerDetail()}
                        </ScrollArea.Autosize>
                      </Paper>
                    </div>
                  </div>
                )}
              </Stack>
            )}

            {canManageTemplates && activeTab === 'templates' && (
              <Paper withBorder p="md" radius="md" className="org-tab-surface">
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
                      <Paper key={pendingTemplate.localId} withBorder p="sm" radius="md" className="org-tab-item">
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
                      <Paper key={template.$id} withBorder p="sm" radius="md" className="org-tab-item">
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

            {canManageStaffSurface && activeTab === 'staff' && (
              <RoleRosterManager
                rosterEntries={staffRosterEntries}
                searchValue={staffSearch}
                onSearchChange={(value) => { void handleSearchStaff(value); }}
                searchResults={staffResults}
                searchLoading={staffSearchLoading}
                searchError={staffError}
                onAddExisting={(candidate, roleId, types) => { void handleInviteExistingStaff(candidate, roleId, types); }}
                inviteRows={staffInvites}
                onInviteRowsChange={(rows) => setStaffInvites(rows)}
                inviteError={staffInviteError}
                inviting={invitingStaff}
                staffRoles={org.staffRoles ?? []}
                onSendInvites={() => { void handleInviteStaffEmails(); }}
                onRemoveFromRoster={(entryUserId) => { void handleRemoveStaffMember(entryUserId); }}
                onRoleChange={(entryUserId, roleId) => handleUpdateStaffRole(entryUserId, roleId)}
                onCreateRole={(name, permissions) => handleCreateStaffRole(name, permissions)}
                onUpdateRole={(roleId, data) => handleUpdateStaffRoleDefinition(roleId, data)}
                organizationId={org.$id}
                canManageCompensation={canManageStaffCompensation}
              />
            )}

            {(isOwner || canManageDiscounts) && activeTab === 'discounts' && org && (
              <DiscountManager
                ownerType="ORGANIZATION"
                ownerId={org.$id}
                title={`${org.name} discounts`}
              />
            )}

            {(isOwner || canManageFinance) && activeTab === 'finance' && org && (
              <OrganizationFinancePanel
                organizationId={org.$id}
                isActive={activeTab === 'finance'}
                canManage={isOwner || canManageFinance}
              />
            )}

            {canManageRefunds && activeTab === 'refunds' && org && (
              <RefundRequestsList organizationId={org.$id} />
            )}

            {canManagePublicPage && activeTab === 'publicPage' && org && (
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
              <Paper withBorder p="md" radius="md" className="org-tab-surface">
                <Group justify="space-between" align="center" mb="md">
                  <Title order={5}>Store</Title>
                  {!organizationHasStripeAccount && (
                    <Text size="sm" c="red">
                      Connect Stripe to accept payments for products.
                    </Text>
                  )}
                </Group>

                  {canManageProducts && (
                    <Paper withBorder radius="md" p="md" mb="lg" className="org-tab-item">
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
	                      <HostPriceInput
	                        hostLabel="Host take-home"
	                        totalLabel="Product price"
	                        value={organizationHasStripeAccount ? productPriceCents : 0}
	                        onChange={setProductPriceCents}
	                        disabled={!organizationHasStripeAccount}
	                        required
	                      />
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
                        className="org-tab-item"
                        onClick={() => {
                          if (canManageProducts) {
                            openProductModal(product);
                          }
                        }}
                        style={{ cursor: canManageProducts ? 'pointer' : 'default' }}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div>
                            <Text fw={600}>{product.name}</Text>
                            {product.description && <Text size="sm" c="dimmed">{product.description}</Text>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <Text size="sm" c="dimmed">{formatProductPeriodLabel(product.period)}</Text>
                            {canManageProducts && (
                              <Text size="xs" c="dimmed">Click card to edit</Text>
                            )}
                          </div>
                        </Group>
                        <Text fw={700} mb="xs">{formatProductPriceLabel(product)}</Text>
                        {isSinglePurchasePeriod(product.period) ? (
                          <TextInput
                            label="Discount code"
                            placeholder="Enter code"
                            size="xs"
                            mb="xs"
                            value={productDiscountCodes[product.$id] ?? ''}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setProductDiscountCodes((current) => ({
                                ...current,
                                [product.$id]: value,
                              }));
                            }}
                            disabled={startingProductCheckoutId === product.$id}
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : null}
                        {product.isActive === false && (
                          <Text size="xs" c="red" mb="xs">Inactive</Text>
                        )}
                        <Button
                          fullWidth
                          variant={canManageProducts ? 'outline' : 'filled'}
                          loading={startingProductCheckoutId === product.$id}
                          disabled={
                            product.isActive === false
                            || (!organizationHasStripeAccount && !canManageProducts)
                            || startingProductCheckoutId !== null
                          }
                          onClick={(event) => {
                            if (canManageProducts) {
                              event.stopPropagation();
                            }
                            handlePurchaseProduct(product);
                          }}
                        >
                          {resolveProductCheckoutLabel(product, canManageProducts)}
                        </Button>
                      </Paper>
                    ))}
                  </SimpleGrid>
                )}
              </Paper>
            )}

            {activeTab === 'fields' && org && (
              <RentalReservationCheckout
                organization={org}
                currentUser={user ?? null}
                rentalOrderSlug={org.publicSlug}
              >
                {({ onRentalSelectionReady }) => (
                  <FieldsTabContent
                    organization={org}
                    organizationId={id ?? ''}
                    currentUser={user ?? null}
                    canManageFields={canManageFields}
                    showBackButton={!isOrganizationRoleMember}
                    onRentalSelectionReady={onRentalSelectionReady}
                  />
                )}
              </RentalReservationCheckout>
            )}
            </div>
          </>
        )}
      </Container>

      {/* Modals */}
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

          setOrg((prev) => {
            if (!prev) return prev;
            return { ...prev, teams: [...(prev.teams ?? []), team] };
          });

          if (id) {
            await loadOrg(id);
          }
        }}
      />
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
                  Document 1 of 1{previewTemplate.title ? ` • ${previewTemplate.title}` : ''}
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
	            <HostPriceInput
	              hostLabel="Host take-home"
	              totalLabel="Product price"
	              value={organizationHasStripeAccount ? editProductPriceCents : 0}
	              onChange={setEditProductPriceCents}
	              disabled={!organizationHasStripeAccount}
	              required
	            />
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
          await startProductCheckout(purchaseProduct, billingAddress, purchaseDiscountCode);
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

