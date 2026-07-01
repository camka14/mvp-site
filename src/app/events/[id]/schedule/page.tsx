'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Text, Group, Button, Paper, Alert, Tabs, Stack, UnstyledButton, Modal, Select, SimpleGrid, TextInput, Loader, Checkbox, Badge, Textarea, Popover, type SelectProps } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import type { View } from 'react-big-calendar';

import Navigation from '@/components/layout/Navigation';
import { TermsConsentModal } from '@/components/moderation/TermsConsentModal';
import Loading from '@/components/ui/Loading';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import { useApp } from '@/app/providers';
import { useAgentContext } from '@/context/AgentContext';
import type { AgentClientAction, AgentClientActionResult } from '@/lib/agent/types';
import { useLocation } from '@/app/hooks/useLocation';
import { chatService, type ChatTermsConsentState } from '@/lib/chatService';
import {
  eventService,
  type EventDetailBootstrapResponse,
  type EventParticipantDivisionWarning,
} from '@/lib/eventService';
import { getHomePathForUser } from '@/lib/homePage';
import { leagueService } from '@/lib/leagueService';
import { tournamentService, type LeagueStandingsDivisionResponse } from '@/lib/tournamentService';
import { organizationService } from '@/lib/organizationService';
import { sportsService } from '@/lib/sportsService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import { familyService } from '@/lib/familyService';
import { apiRequest } from '@/lib/apiClient';
import { hasStaffMemberType } from '@/lib/staff';
import { normalizeApiEvent, normalizeApiMatch } from '@/lib/apiMappers';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { buildLeaguePlayoffPlaceholderAssignmentsForMatches } from '@/lib/bracketEntrantPlaceholders';
import { createClientId } from '@/lib/clientId';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import {
  collectViewerDivisionHighlightKeys,
  collectViewerTeamIds,
  isViewerDivisionHighlighted,
} from '@/lib/viewerTeamHighlights';
import {
  shouldUseServerStandingsRows,
  teamBelongsToSelectedStandingsDivision,
} from '@/lib/standingsRows';
import { deriveStandingsMatchResult } from '@/lib/standingsMatchScoring';
import {
  buildBracketDivisionOptions,
  collectConnectedBracketMatchIds as collectConnectedMatchIds,
  getBracketDivisionId as getDivisionId,
  getBracketDivisionLabel as getDivisionLabel,
  getBracketMatchDivisionId as getMatchDivisionId,
  getBracketMatchDivisionLabel as getMatchDivisionLabel,
  getBracketRootMatches,
  pickPreferredBracketRootMatch as pickPreferredRootMatch,
  toBracketDivisionKey as toDivisionKey,
} from '@/lib/bracketViewCore';
import { toEventPayload } from '@/types';
import type {
  Event,
  Field,
  LeagueConfig,
  Match,
  MatchIncidentOperation,
  MatchLifecycleOperation,
  MatchOfficialCheckInOperation,
  MatchSegment,
  MatchSegmentOperation,
  Team,
  TournamentBracket,
  Organization,
  Sport,
  TimeSlot,
  UserData,
} from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import type {
  EventTeamComplianceResponse,
  EventUserComplianceResponse,
  TeamComplianceSummary,
  TeamComplianceUserSummary,
} from '@/lib/eventTeamCompliance';
import { validateAndNormalizeBracketGraph } from '@/server/matches/bracketGraph';
import type { EventFormHandle } from './components/EventForm';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import DivisionTeamComplianceCard from './components/DivisionTeamComplianceCard';
import BracketTabPanel from './schedulePage/BracketTabPanel';
import CreateEventScheduleView from './schedulePage/CreateEventScheduleView';
import DetailsTabPanel from './schedulePage/DetailsTabPanel';
import {
  CreateBillModal,
  RefundTeamModal,
} from './schedulePage/EventBillingModals';
import EventComplianceModal from './schedulePage/EventComplianceModal';
import {
  AddParticipantModal,
  AddTeamModal,
  ParticipantTeamDetailModal,
} from './schedulePage/EventParticipantModals';
import EventMatchModals from './schedulePage/EventMatchModals';
import EventScheduleHeader from './schedulePage/EventScheduleHeader';
import FinanceTabPanel from './schedulePage/FinanceTabPanel';
import MatchRosterModal from './schedulePage/MatchRosterModal';
import ParticipantsPanel from './schedulePage/ParticipantsPanel';
import RentalCheckoutModals from './schedulePage/RentalCheckoutModals';
import ScheduleTabPanel from './schedulePage/ScheduleTabPanel';
import StandingsTabPanel from './schedulePage/StandingsTabPanel';
import {
  buildScheduleLocationDefaults,
  getUserLocationCoordinates,
  getUserLocationLabel,
} from './schedulePage/locationDefaults';
import {
  CLIENT_MATCH_PREFIX,
  DEFAULT_NOTIFICATION_AUDIENCE,
  DEFAULT_SPORT,
  EVENT_SCHEDULE_TABS,
  HIDDEN_EVENT_STATES,
  VIEWER_WEEKLY_REGISTRATION_STATUSES,
  asBulkMatchRef,
  buildComplianceSnapshotKey,
  buildBracketNodes,
  buildWeeklyOccurrenceOptionsInRange,
  buildWeeklyOccurrenceRegistrationKey,
  cloneValue,
  collectRentalSelectionFieldIds,
  collectMatchAssignmentUserIds,
  divisionReferencesBracket,
  formatActionErrorMessage,
  getClientIdFromMatchId,
  getDivisionKind,
  getDivisionPlacementDivisionIds,
  getDivisionTeamIds,
  getEventLifecycleStatus,
  getLifecycleStatusLabel,
  getRentalSelectionRange,
  getTeamWarningLabel,
  getWeeklyScheduleCalendarRange,
  isClientMatchId,
  isDivisionStandingsConfirmed,
  isLocalPlaceholderId,
  isTournamentPoolPlayViewEnabled,
  normalizeDraftBracketGraph,
  normalizeDivisionToken,
  normalizeIdToken,
  parseIdListQueryParam,
  parseDateValue,
  parseRentalSelectionsQueryParam,
  parseStableIdListKey,
  resolveSelectedWeeklyOccurrenceOption,
  shouldResetBracketMatchForRebuild,
  startOfDay,
  toClearedBracketMatchUpdate,
  toLocalIsoDate,
  toStoredEventLifecycleState,
  type DivisionOption,
  type EventLifecycleStatus,
  type NotificationAudienceKey,
  type NotificationAudienceState,
  type PendingSaveChangeItem,
  type RankedStandingsRow,
  type StandingsRow,
  type StandingsSortField,
  type ViewerWeeklyRegistrationRow,
  type WeeklyOccurrenceOption,
  type WeeklyOccurrenceSelection,
} from './schedulePage/helpers';
import useEventBilling from './schedulePage/useEventBilling';
import {
  useCreateEventFlow,
  useRentalCheckoutFlow,
} from './schedulePage/useCreateEventFlow';
import useEventParticipants from './schedulePage/useEventParticipants';
import useEventMatchOperations from './schedulePage/useEventMatchOperations';
import useEventMatchRealtime from './schedulePage/useEventMatchRealtime';
import useMatchConflictAlerts from './schedulePage/useMatchConflictAlerts';


// Main schedule page component that protects access and renders league schedule/bracket content.
function EventScheduleContent() {
  const { user, authUser, loading: authLoading, isAuthenticated, isGuest, setUser } = useApp();
  const { setActivePageContext, registerRefreshHandler, registerClientActionHandler } = useAgentContext();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const homePath = getHomePathForUser(user);
  const eventId = params?.id as string | undefined;
  const isPreview = searchParams?.get('preview') === '1';
  const isEditParam = searchParams?.get('mode') === 'edit';
  const isCreateMode = searchParams?.get('create') === '1';
  const orgIdParam = searchParams?.get('orgId') || undefined;
  const hostOrgIdParam = searchParams?.get('hostOrgId') || undefined;
  const templateIdParam = searchParams?.get('templateId')?.trim() || undefined;
  const skipTemplatePromptParam = searchParams?.get('skipTemplatePrompt') === '1';
  const rentalOrgIdParam = searchParams?.get('rentalOrgId') || undefined;
  const rentalStartParam = searchParams?.get('rentalStart') || undefined;
  const rentalEndParam = searchParams?.get('rentalEnd') || undefined;
  const rentalFieldIdParam = searchParams?.get('rentalFieldId') || undefined;
  const rentalFieldNameParam = searchParams?.get('rentalFieldName') || undefined;
  const rentalFacilityIdParam = searchParams?.get('rentalFacilityId') || undefined;
  const rentalFacilityNameParam = searchParams?.get('rentalFacilityName') || undefined;
  const rentalFacilityLocationParam = searchParams?.get('rentalFacilityLocation') || undefined;
  const rentalFacilityAddressParam = searchParams?.get('rentalFacilityAddress') || undefined;
  const rentalLocationParam = searchParams?.get('rentalLocation') || undefined;
  const rentalLatParam = searchParams?.get('rentalLat') || undefined;
  const rentalLngParam = searchParams?.get('rentalLng') || undefined;
  const rentalPriceParam = searchParams?.get('rentalPriceCents') || undefined;
  const rentalRequiredTemplateIdsParam = searchParams?.get('rentalRequiredTemplateIds') || undefined;
  const rentalHostRequiredTemplateIdsParam = searchParams?.get('rentalHostRequiredTemplateIds') || undefined;
  const rentalSelectionsParam = searchParams?.get('rentalSelections') || undefined;
  const rentalBookingIdParam = searchParams?.get('rentalBookingId')?.trim() || undefined;
  const rentalRequiredTemplateIds = useMemo(
    () => parseIdListQueryParam(rentalRequiredTemplateIdsParam),
    [rentalRequiredTemplateIdsParam],
  );
  const rentalHostRequiredTemplateIds = useMemo(
    () => parseIdListQueryParam(rentalHostRequiredTemplateIdsParam),
    [rentalHostRequiredTemplateIdsParam],
  );
  const rentalSelections = useMemo(
    () => parseRentalSelectionsQueryParam(rentalSelectionsParam),
    [rentalSelectionsParam],
  );
  const rentalRangeFromSelections = useMemo(() => {
    return getRentalSelectionRange(rentalSelections);
  }, [rentalSelections]);
  const normalizedRentalStart = useMemo(
    () => formatLocalDateTime(rentalStartParam) || rentalRangeFromSelections.start,
    [rentalRangeFromSelections.start, rentalStartParam],
  );
  const normalizedRentalEnd = useMemo(
    () => formatLocalDateTime(rentalEndParam) || rentalRangeFromSelections.end,
    [rentalEndParam, rentalRangeFromSelections.end],
  );
  const rentalFieldIdsFromSelections = useMemo(
    () => collectRentalSelectionFieldIds(rentalSelections),
    [rentalSelections],
  );
  const isRentalFlow = Boolean((normalizedRentalStart && normalizedRentalEnd) || rentalSelections.length > 0);
  const resolvedHostOrgId = hostOrgIdParam ?? (!isRentalFlow ? orgIdParam : undefined);
  const resolvedRentalOrgId = rentalOrgIdParam ?? (isRentalFlow ? orgIdParam : undefined);
  const defaultSport = DEFAULT_SPORT;

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [changesEvent, setChangesEvent] = useState<Event | null>(null);
  const [changesMatches, setChangesMatches] = useState<Match[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [formHasUnsavedChanges, setFormHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [contentTermsState, setContentTermsState] = useState<ChatTermsConsentState | null>(null);
  const [contentTermsLoading, setContentTermsLoading] = useState(false);
  const [contentTermsModalOpen, setContentTermsModalOpen] = useState(false);
  const [isRazumlyAdmin, setIsRazumlyAdmin] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reportingEvent, setReportingEvent] = useState(false);
  const [reschedulingMatches, setReschedulingMatches] = useState(false);
  const [pendingScheduleAction, setPendingScheduleAction] = useState<'reschedule' | 'rebuild' | 'rebuildNoPlaceholders' | null>(null);
  const [selectedLifecycleStatus, setSelectedLifecycleStatus] = useState<EventLifecycleStatus | null>(null);
  const [isPendingChangesPopoverOpen, setIsPendingChangesPopoverOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    const requestedTab = searchParams?.get('tab');
    return requestedTab && EVENT_SCHEDULE_TABS.has(requestedTab) ? requestedTab : 'details';
  });
  const [selectedScheduleDivision, setSelectedScheduleDivision] = useState<string>('all');
  const [selectedSchedulePool, setSelectedSchedulePool] = useState<string>('all');
  const [selectedBracketDivision, setSelectedBracketDivision] = useState<string | null>(null);
  const [selectedStandingsDivision, setSelectedStandingsDivision] = useState<string | null>(null);
  const [selectedStandingsPool, setSelectedStandingsPool] = useState<string | null>(null);
  const loadedTeamComplianceKeyRef = useRef<string | null>(null);
  const loadedUserComplianceKeyRef = useRef<string | null>(null);
  const [teamComplianceById, setTeamComplianceById] = useState<Record<string, TeamComplianceSummary>>({});
  const [teamComplianceLoading, setTeamComplianceLoading] = useState(false);
  const [teamComplianceError, setTeamComplianceError] = useState<string | null>(null);
  const [eventTeamCheckInsById, setEventTeamCheckInsById] = useState<Record<string, boolean>>({});
  const [rosterModalMatch, setRosterModalMatch] = useState<Match | null>(null);
  const [rosterModalTeam, setRosterModalTeam] = useState<Team | null>(null);
  const eventCheckInPromptedRef = useRef<Set<string>>(new Set());
  const matchCheckInPromptedRef = useRef<Set<string>>(new Set());
  const [userComplianceById, setUserComplianceById] = useState<Record<string, TeamComplianceUserSummary>>({});
  const [userComplianceLoading, setUserComplianceLoading] = useState(false);
  const [userComplianceError, setUserComplianceError] = useState<string | null>(null);
  const [teamComplianceRefreshKey, setTeamComplianceRefreshKey] = useState(0);
  const teamComplianceRefreshKeyRef = useRef(teamComplianceRefreshKey);
  const [selectedComplianceTeamId, setSelectedComplianceTeamId] = useState<string | null>(null);
  const [standingsSort, setStandingsSort] = useState<{ field: StandingsSortField; direction: 'asc' | 'desc' }>({
    field: 'points',
    direction: 'desc',
  });
  const [standingsDivisionData, setStandingsDivisionData] = useState<LeagueStandingsDivisionResponse | null>(null);
  const [standingsDraftOverrides, setStandingsDraftOverrides] = useState<Record<string, number>>({});
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [savingStandings, setSavingStandings] = useState(false);
  const [confirmingStandings, setConfirmingStandings] = useState(false);
  const [applyStandingsReassignment, setApplyStandingsReassignment] = useState(true);
  const [standingsActionError, setStandingsActionError] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [eventFormResetVersion, setEventFormResetVersion] = useState(0);
  const [childUserIds, setChildUserIds] = useState<string[]>([]);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationAudience, setNotificationAudience] = useState<NotificationAudienceState>({ ...DEFAULT_NOTIFICATION_AUDIENCE });
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [isQrCodeModalOpen, setIsQrCodeModalOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 36em)');
  const eventFormRef = useRef<EventFormHandle>(null);
  const { location: userLocation, locationInfo: userLocationInfo } = useLocation();
  const rentalCoordinates = useMemo<[number, number] | undefined>(() => {
    const lat = rentalLatParam ? Number(rentalLatParam) : undefined;
    const lng = rentalLngParam ? Number(rentalLngParam) : undefined;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng as number, lat as number];
    }
    return undefined;
  }, [rentalLatParam, rentalLngParam]);

  const userLocationLabel = useMemo(
    () => getUserLocationLabel(userLocation, userLocationInfo),
    [userLocation, userLocationInfo],
  );

  const userCoordinates = useMemo(
    () => getUserLocationCoordinates(userLocation),
    [userLocation],
  );

  const usingChangeCopies = Boolean(changesEvent);
  const activeEvent = usingChangeCopies ? changesEvent : event;
  const activeEventAffiliateUrl = typeof activeEvent?.affiliateUrl === 'string' ? activeEvent.affiliateUrl.trim() : '';
  const isWeeklyParentEvent = Boolean(
    activeEventAffiliateUrl.length === 0
      && activeEvent?.eventType === 'WEEKLY_EVENT'
      && !normalizeIdToken(activeEvent?.parentEvent),
  );
  const selectedOccurrenceSlotId = normalizeIdToken(searchParams?.get('slotId'));
  const selectedOccurrenceDate = normalizeIdToken(searchParams?.get('occurrenceDate'));
  const selectedOccurrence = useMemo<WeeklyOccurrenceSelection | null>(
    () => (
      selectedOccurrenceSlotId && selectedOccurrenceDate
        ? {
          slotId: selectedOccurrenceSlotId,
          occurrenceDate: selectedOccurrenceDate,
        }
        : null
    ),
    [selectedOccurrenceDate, selectedOccurrenceSlotId],
  );
  const [viewerWeeklyOccurrenceKeys, setViewerWeeklyOccurrenceKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);

    if (!isWeeklyParentEvent || !targetEventId || !user?.$id) {
      setViewerWeeklyOccurrenceKeys(new Set());
      return () => {
        cancelled = true;
      };
    }

    const loadViewerWeeklyRegistrations = async () => {
      try {
        const response = await apiRequest<{ registrations?: ViewerWeeklyRegistrationRow[] }>(
          `/api/profile/registrations?eventId=${encodeURIComponent(targetEventId)}`,
        );
        if (cancelled) {
          return;
        }

        const registeredOccurrenceKeys = new Set<string>();
        (Array.isArray(response?.registrations) ? response.registrations : []).forEach((registration) => {
          const status = String(registration.status ?? '').trim().toUpperCase();
          const rosterRole = String(registration.rosterRole ?? '').trim().toUpperCase();
          if (rosterRole !== 'PARTICIPANT' || !VIEWER_WEEKLY_REGISTRATION_STATUSES.has(status)) {
            return;
          }
          const occurrenceKey = buildWeeklyOccurrenceRegistrationKey(
            registration.slotId,
            registration.occurrenceDate,
          );
          if (occurrenceKey) {
            registeredOccurrenceKeys.add(occurrenceKey);
          }
        });
        setViewerWeeklyOccurrenceKeys(registeredOccurrenceKeys);
      } catch (registrationError) {
        if (cancelled) {
          return;
        }
        console.warn('Failed to load viewer weekly registrations:', registrationError);
        setViewerWeeklyOccurrenceKeys(new Set());
      }
    };

    void loadViewerWeeklyRegistrations();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, eventId, isWeeklyParentEvent, user?.$id]);
  const initialWeeklyScheduleDate = useMemo(() => {
    const selectedDate = parseDateValue(selectedOccurrence?.occurrenceDate ?? null);
    return selectedDate ?? parseDateValue(activeEvent?.start ?? null) ?? new Date();
  }, [activeEvent?.start, selectedOccurrence?.occurrenceDate]);
  const [weeklyScheduleCalendarView, setWeeklyScheduleCalendarView] = useState<View>('month');
  const [weeklyScheduleCalendarDate, setWeeklyScheduleCalendarDate] = useState<Date>(initialWeeklyScheduleDate);
  useEffect(() => {
    setWeeklyScheduleCalendarDate(initialWeeklyScheduleDate);
  }, [activeEvent?.$id, initialWeeklyScheduleDate]);
  const weeklyScheduleCalendarRange = useMemo(
    () => getWeeklyScheduleCalendarRange(weeklyScheduleCalendarDate, weeklyScheduleCalendarView),
    [weeklyScheduleCalendarDate, weeklyScheduleCalendarView],
  );
  const weeklyScheduleOccurrenceOptions = useMemo(
    () => buildWeeklyOccurrenceOptionsInRange(
      activeEvent ?? null,
      weeklyScheduleCalendarRange.start,
      weeklyScheduleCalendarRange.end,
    ),
    [activeEvent, weeklyScheduleCalendarRange.end, weeklyScheduleCalendarRange.start],
  );
  const selectedWeeklyOccurrenceOption = useMemo(
    () => resolveSelectedWeeklyOccurrenceOption(activeEvent ?? null, selectedOccurrence),
    [activeEvent, selectedOccurrence],
  );
  const weeklyParticipantSelectionRequired = isWeeklyParentEvent && !selectedOccurrence;
  const hasPendingUnsavedChanges = hasUnsavedChanges || formHasUnsavedChanges;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
  const {
    organizationForCreate,
    rentalOrganization,
    formSeedEvent,
    createLocationDefaults,
    rentalImmutableDefaults,
    rentalPurchaseContext,
    rentalPurchaseTimeSlot,
    templateSelectData,
    templatePromptOpen,
    closeTemplatePrompt,
    applyingTemplate,
    templatesError,
    templatesLoading,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplateStartDate,
    setSelectedTemplateStartDate,
    templateSeedKey,
    templateRentalResourcePrompt,
    dismissTemplateRentalResourcePrompt,
    handleApplyTemplate,
  } = useCreateEventFlow({
    isCreateMode,
    eventId,
    user,
    isGuest,
    changesEvent,
    activeEvent,
    activeMatches,
    hasPendingUnsavedChanges,
    eventFormRef,
    templateIdParam,
    skipTemplatePromptParam,
    resolvedHostOrgId,
    resolvedRentalOrgId,
    isRentalFlow,
    normalizedRentalStart,
    normalizedRentalEnd,
    rentalSelections,
    rentalFieldIdsFromSelections,
    rentalRequiredTemplateIds,
    rentalHostRequiredTemplateIds,
    rentalBookingIdParam,
    rentalFieldIdParam,
    rentalFieldNameParam,
    rentalFacilityIdParam,
    rentalFacilityNameParam,
    rentalFacilityLocationParam,
    rentalFacilityAddressParam,
    rentalLocationParam,
    rentalCoordinates,
    rentalPriceParam,
    defaultSport,
    userLocationLabel,
    userCoordinates,
    setChangesEvent,
    setHasUnsavedChanges,
    setFormHasUnsavedChanges,
    setActionError,
  });
  const [dismissedDirectTemplatePromptId, setDismissedDirectTemplatePromptId] = useState<string | null>(null);
  useEffect(() => {
    setDismissedDirectTemplatePromptId((current) => (
      current && current !== templateIdParam ? null : current
    ));
  }, [templateIdParam]);
  useEffect(() => {
    if (isCreateMode && templateIdParam && !selectedTemplateId) {
      setSelectedTemplateId(templateIdParam);
    }
  }, [isCreateMode, selectedTemplateId, setSelectedTemplateId, templateIdParam]);
  const effectiveTemplatePromptOpen = templatePromptOpen || Boolean(
    isCreateMode
    && templateIdParam
    && dismissedDirectTemplatePromptId !== templateIdParam
  );
  const handleCloseTemplatePrompt = useCallback(() => {
    if (templateIdParam) {
      setDismissedDirectTemplatePromptId(templateIdParam);
    }
    closeTemplatePrompt();
  }, [closeTemplatePrompt, templateIdParam]);
  const handleApplyTemplateWithPromptState = useCallback(async () => {
    const applied = await handleApplyTemplate();
    if (applied && templateIdParam) {
      setDismissedDirectTemplatePromptId(templateIdParam);
    }
  }, [handleApplyTemplate, templateIdParam]);
  const isTemplateEvent = (activeEvent?.state ?? '').toUpperCase() === 'TEMPLATE';
  const isHiddenEvent = HIDDEN_EVENT_STATES.has(String(activeEvent?.state ?? 'PUBLISHED').toUpperCase());
  const activeOrganization = useMemo(() => {
    if (activeEvent && typeof activeEvent.organization === 'object') {
      return activeEvent.organization as Organization;
    }
    return organizationForCreate;
  }, [activeEvent, organizationForCreate]);
  const assistantHostIds = useMemo(
    () =>
      Array.isArray(activeEvent?.assistantHostIds)
        ? activeEvent.assistantHostIds.map((id) => String(id)).filter((id) => id.length > 0)
        : [],
    [activeEvent?.assistantHostIds],
  );
  const eventOfficialIds = useMemo(() => {
    const activeEventOfficialIds = Array.isArray(activeEvent?.eventOfficials)
      ? activeEvent.eventOfficials
          .filter((officialEntry) => officialEntry?.isActive !== false)
          .map((officialEntry) => normalizeIdToken(officialEntry?.userId))
          .filter((officialId): officialId is string => Boolean(officialId))
      : [];

    if (activeEventOfficialIds.length > 0) {
      return activeEventOfficialIds;
    }

    return Array.isArray(activeEvent?.officialIds)
      ? activeEvent.officialIds
          .map((officialId) => normalizeIdToken(officialId))
          .filter((officialId): officialId is string => Boolean(officialId))
      : [];
  }, [activeEvent?.eventOfficials, activeEvent?.officialIds]);
  const isPrimaryHost = activeEvent?.hostId === user?.$id;
  const isAssistantHost = Boolean(user?.$id && assistantHostIds.includes(user.$id));
  const isEventOfficial = Boolean(
    user?.$id && eventOfficialIds.includes(user.$id),
  );
  const isOrganizationManager = Boolean(
    activeOrganization?.viewerCanManageOrganization
      || (
        user?.$id
          && activeOrganization
          && (
            activeOrganization.ownerId === user.$id
            || (activeOrganization.staffMembers ?? []).some((staffMember) => (
              staffMember.userId === user.$id
                && !staffMember.invite
                && hasStaffMemberType(staffMember, ['HOST', 'STAFF'])
            ))
          )
      ),
  );
  const canManageEvent = Boolean(isPrimaryHost || isAssistantHost || isOrganizationManager || isRazumlyAdmin);
  const isEditingEvent = isTemplateEvent || ((isPreview || isEditParam) && canManageEvent);
  const canEditMatches = Boolean(canManageEvent && isEditingEvent);
  const {
    clearMatchConflictDraftAlerts,
    dismissMatchConflictMessage,
    matchConflictPairs,
    matchConflictsById,
    showCurrentMatchConflictOverride,
    visibleMatchConflictMessage,
  } = useMatchConflictAlerts({ matches: activeMatches });
  const {
    applyMatchUpdate,
    closeScoreModal,
    handleAddBracketMatch,
    handleAddScheduleMatch,
    handleMatchCalendarMove,
    handleMatchDelete,
    handleMatchEditClose,
    handleMatchEditRequest,
    handleMatchEditSave,
    handleScoreChange,
    handleScoreSubmit,
    handleSetComplete,
    handleToggleLockAllMatches,
    isMatchEditorOpen,
    isScoreModalOpen,
    matchBeingEdited,
    matchEditorContext,
    openScoreModalForMatch,
    resetMatchEditorState,
    resetStagedMatchDrafts,
    scoreUpdateMatch,
    setMatchBeingEdited,
    setScoreUpdateMatch,
    stagedMatchCreates,
    stagedMatchDeletes,
  } = useEventMatchOperations({
    activeEvent,
    activeMatches,
    canEditMatches,
    changesMatches,
    eventId,
    matches,
    onDraftMatchChanged: clearMatchConflictDraftAlerts,
    setChangesEvent,
    setChangesMatches,
    setError,
    setEvent,
    setHasUnsavedChanges,
    setInfoMessage,
    setMatches,
  });
  const activeMatchesById = useMemo<Record<string, Match>>(() => {
    const map: Record<string, Match> = {};
    activeMatches.forEach((match) => {
      const matchId = normalizeIdToken(match.$id);
      if (matchId) {
        map[matchId] = match;
      }
    });
    return map;
  }, [activeMatches]);
  const divisionLabelsByKey = useMemo(() => {
    const labels = new Map<string, string>();
    if (Array.isArray(activeEvent?.divisionDetails)) {
      activeEvent.divisionDetails.forEach((division) => {
        const divisionId = getDivisionId(division);
        const divisionKey = toDivisionKey(divisionId);
        if (!divisionId || !divisionKey || labels.has(divisionKey)) {
          return;
        }
        labels.set(divisionKey, getDivisionLabel(division) ?? divisionId);
      });
    }
    if (Array.isArray(activeEvent?.playoffDivisionDetails)) {
      activeEvent.playoffDivisionDetails.forEach((division) => {
        const divisionId = getDivisionId(division);
        const divisionKey = toDivisionKey(divisionId);
        if (!divisionId || !divisionKey || labels.has(divisionKey)) {
          return;
        }
        labels.set(divisionKey, getDivisionLabel(division) ?? divisionId);
      });
    }
    if (!Array.isArray(activeEvent?.divisions)) {
      return labels;
    }

    activeEvent.divisions.forEach((division) => {
      const divisionId = getDivisionId(division);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey || labels.has(divisionKey)) {
        return;
      }

      labels.set(divisionKey, getDivisionLabel(division) ?? divisionId);
    });

    return labels;
  }, [activeEvent?.divisionDetails, activeEvent?.divisions, activeEvent?.playoffDivisionDetails]);

  const weeklyOccurrenceMatches = useMemo<Match[]>(() => {
    if (!isWeeklyParentEvent) {
      return [];
    }

    const fieldLookup = new Map<string, Field>();
    if (Array.isArray(activeEvent?.fields)) {
      activeEvent.fields.forEach((field) => {
        if (field?.$id) {
          fieldLookup.set(field.$id, field);
        }
      });
    }

    return weeklyScheduleOccurrenceOptions.map((occurrence, index) => {
      const primaryFieldId = occurrence.fieldIds[0] ?? null;
      const primaryField = primaryFieldId ? fieldLookup.get(primaryFieldId) : undefined;
      const divisionLabel = occurrence.divisionIds
        .map((divisionId) => {
          const divisionKey = toDivisionKey(divisionId);
          return (divisionKey ? divisionLabelsByKey.get(divisionKey) : null) ?? divisionId;
        })
        .filter((label, labelIndex, labels) => label.trim().length > 0 && labels.indexOf(label) === labelIndex)
        .join(' • ');
      const isSelected = selectedOccurrence?.slotId === occurrence.slotId
        && selectedOccurrence?.occurrenceDate === occurrence.occurrenceDate;
      const occurrenceRegistrationKey = buildWeeklyOccurrenceRegistrationKey(
        occurrence.slotId,
        occurrence.occurrenceDate,
      );
      const isViewerRegistered = Boolean(
        occurrenceRegistrationKey && viewerWeeklyOccurrenceKeys.has(occurrenceRegistrationKey),
      );

      return {
        $id: `weekly-occurrence:${occurrence.slotId}:${occurrence.occurrenceDate}`,
        matchId: index + 1,
        eventId: activeEvent?.$id,
        fieldId: primaryFieldId,
        field: primaryField,
        start: occurrence.start,
        end: occurrence.end,
        locked: isSelected,
        team1Points: [],
        team2Points: [],
        setResults: [],
        division: occurrence.divisionIds[0] ?? null,
        weeklyOccurrenceMeta: {
          slotId: occurrence.slotId,
          occurrenceDate: occurrence.occurrenceDate,
          label: occurrence.label,
          divisionLabel: divisionLabel || null,
          divisionKeys: occurrence.divisionIds
            .map((divisionId) => toDivisionKey(divisionId))
            .filter((divisionKey): divisionKey is string => Boolean(divisionKey)),
          isSelected,
          isViewerRegistered,
        },
      } as Match;
    });
  }, [activeEvent?.$id, activeEvent?.fields, divisionLabelsByKey, isWeeklyParentEvent, selectedOccurrence, viewerWeeklyOccurrenceKeys, weeklyScheduleOccurrenceOptions]);

  const eventTypeForView = activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT';
  const affiliateUrlForView = typeof (activeEvent?.affiliateUrl ?? changesEvent?.affiliateUrl) === 'string'
    ? String(activeEvent?.affiliateUrl ?? changesEvent?.affiliateUrl).trim()
    : '';
  const isAffiliateEventForView = affiliateUrlForView.length > 0;
  const isTournament = !isAffiliateEventForView && eventTypeForView === 'TOURNAMENT';
  const isLeague = !isAffiliateEventForView && eventTypeForView === 'LEAGUE';
  const tournamentPoolPlayEnabled = !isAffiliateEventForView && isTournamentPoolPlayViewEnabled(activeEvent ?? changesEvent);

  const scheduleDivisionOptions = useMemo<DivisionOption[]>(() => {
    const labels = new Map<string, string>(divisionLabelsByKey);

    activeMatches.forEach((match) => {
      const divisionId = getMatchDivisionId(match);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey) {
        return;
      }

      if (!labels.has(divisionKey)) {
        labels.set(divisionKey, getMatchDivisionLabel(match) ?? divisionId);
      }
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeMatches, divisionLabelsByKey]);

  const tournamentPoolSourceDivisions = useMemo<unknown[]>(() => {
    if (!tournamentPoolPlayEnabled) {
      return [];
    }
    const sourceDivisions = Array.isArray(activeEvent?.divisionDetails)
      ? activeEvent.divisionDetails
      : Array.isArray(activeEvent?.divisions)
        ? activeEvent.divisions
        : [];
    return sourceDivisions.filter((division) => (
      getDivisionKind(division) !== 'PLAYOFF'
        && getDivisionPlacementDivisionIds(division).length > 0
    ));
  }, [activeEvent?.divisionDetails, activeEvent?.divisions, tournamentPoolPlayEnabled]);

  const tournamentBracketDivisionOptions = useMemo<DivisionOption[]>(() => {
    if (!tournamentPoolPlayEnabled) {
      return [];
    }

    const labels = new Map<string, string>();
    const addBracketDivision = (division: unknown) => {
      const divisionId = getDivisionId(division);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey || labels.has(divisionKey)) {
        return;
      }
      labels.set(divisionKey, getDivisionLabel(division) ?? divisionLabelsByKey.get(divisionKey) ?? divisionId);
    };

    if (Array.isArray(activeEvent?.playoffDivisionDetails)) {
      activeEvent.playoffDivisionDetails.forEach(addBracketDivision);
    }
    if (Array.isArray(activeEvent?.divisionDetails)) {
      activeEvent.divisionDetails
        .filter((division) => getDivisionKind(division) === 'PLAYOFF')
        .forEach(addBracketDivision);
    }
    if (Array.isArray(activeEvent?.divisions)) {
      activeEvent.divisions
        .filter((division) => getDivisionKind(division) === 'PLAYOFF')
        .forEach(addBracketDivision);
    }

    tournamentPoolSourceDivisions.forEach((poolDivision) => {
      getDivisionPlacementDivisionIds(poolDivision).forEach((bracketDivisionId) => {
        const bracketDivisionKey = toDivisionKey(bracketDivisionId);
        if (!bracketDivisionKey || labels.has(bracketDivisionKey)) {
          return;
        }
        labels.set(bracketDivisionKey, divisionLabelsByKey.get(bracketDivisionKey) ?? bracketDivisionId);
      });
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [
    activeEvent?.divisionDetails,
    activeEvent?.divisions,
    activeEvent?.playoffDivisionDetails,
    divisionLabelsByKey,
    tournamentPoolPlayEnabled,
    tournamentPoolSourceDivisions,
  ]);

  const effectiveScheduleDivisionOptions = useMemo<DivisionOption[]>(
    () => (
      tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.length > 0
        ? tournamentBracketDivisionOptions
        : scheduleDivisionOptions
    ),
    [scheduleDivisionOptions, tournamentBracketDivisionOptions, tournamentPoolPlayEnabled],
  );

  const schedulePoolOptions = useMemo<DivisionOption[]>(() => {
    if (!tournamentPoolPlayEnabled) {
      return [];
    }
    const selectedBracketKey = selectedScheduleDivision === 'all'
      ? null
      : toDivisionKey(selectedScheduleDivision);
    return tournamentPoolSourceDivisions
      .filter((division) => (
        !selectedBracketKey || divisionReferencesBracket(division, selectedBracketKey)
      ))
      .map((division) => {
        const divisionId = getDivisionId(division);
        const divisionKey = toDivisionKey(divisionId);
        if (!divisionId || !divisionKey) {
          return null;
        }
        return {
          value: divisionKey,
          label: getDivisionLabel(division) ?? divisionLabelsByKey.get(divisionKey) ?? divisionId,
        };
      })
      .filter((option): option is DivisionOption => Boolean(option))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [
    divisionLabelsByKey,
    selectedScheduleDivision,
    tournamentPoolPlayEnabled,
    tournamentPoolSourceDivisions,
  ]);

  const leagueDivisionOptions = useMemo<DivisionOption[]>(() => {
    const optionsByValue = new Map<string, string>();
    const addDivisionOption = (division: unknown) => {
      const divisionId = getDivisionId(division);
      if (!divisionId) {
        return;
      }
      if (getDivisionKind(division) === 'PLAYOFF') {
        return;
      }
      if (!optionsByValue.has(divisionId)) {
        optionsByValue.set(divisionId, getDivisionLabel(division) ?? divisionId);
      }
    };

    if (Array.isArray(activeEvent?.divisionDetails)) {
      activeEvent.divisionDetails.forEach(addDivisionOption);
    } else if (Array.isArray(activeEvent?.divisions)) {
      activeEvent.divisions.forEach(addDivisionOption);
    }

    return Array.from(optionsByValue.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeEvent?.divisionDetails, activeEvent?.divisions]);

  const effectiveStandingsDivisionOptions = useMemo<DivisionOption[]>(
    () => (
      tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.length > 0
        ? tournamentBracketDivisionOptions
        : leagueDivisionOptions
    ),
    [leagueDivisionOptions, tournamentBracketDivisionOptions, tournamentPoolPlayEnabled],
  );

  const standingsPoolOptions = useMemo<DivisionOption[]>(() => {
    if (!tournamentPoolPlayEnabled) {
      return [];
    }
    const selectedBracketKey = selectedStandingsDivision
      ? toDivisionKey(selectedStandingsDivision)
      : null;
    return tournamentPoolSourceDivisions
      .filter((division) => (
        !selectedBracketKey || divisionReferencesBracket(division, selectedBracketKey)
      ))
      .map((division) => {
        const divisionId = getDivisionId(division);
        const divisionKey = toDivisionKey(divisionId);
        if (!divisionId || !divisionKey) {
          return null;
        }
        return {
          value: divisionKey,
          label: getDivisionLabel(division) ?? divisionLabelsByKey.get(divisionKey) ?? divisionId,
        };
      })
      .filter((option): option is DivisionOption => Boolean(option))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [
    divisionLabelsByKey,
    selectedStandingsDivision,
    tournamentPoolPlayEnabled,
    tournamentPoolSourceDivisions,
  ]);

  const selectedStandingsDataDivision = useMemo(() => {
    if (!tournamentPoolPlayEnabled) {
      return selectedStandingsDivision;
    }
    if (
      selectedStandingsPool
      && standingsPoolOptions.some((option) => option.value === selectedStandingsPool)
    ) {
      return selectedStandingsPool;
    }
    return standingsPoolOptions[0]?.value ?? null;
  }, [
    selectedStandingsDivision,
    selectedStandingsPool,
    standingsPoolOptions,
    tournamentPoolPlayEnabled,
  ]);

  const participantDivisionColumns = useMemo<Array<{ id: string; label: string; teamIds: string[] }>>(() => {
    if (isTournamentPoolPlayViewEnabled(activeEvent)) {
      const poolDivisions = Array.isArray(activeEvent?.divisionDetails)
        ? activeEvent.divisionDetails
        : [];
      const bracketDivisions = Array.isArray(activeEvent?.playoffDivisionDetails)
        ? activeEvent.playoffDivisionDetails
        : [];
      const columns: Array<{ id: string; label: string; teamIds: string[] }> = [];
      const bracketTargets = bracketDivisions
        .map((division) => {
          const divisionId = getDivisionId(division);
          return divisionId
            ? {
                id: divisionId,
                label: getDivisionLabel(division) ?? divisionLabelsByKey.get(toDivisionKey(divisionId) ?? '') ?? divisionId,
              }
            : null;
        })
        .filter((target): target is { id: string; label: string } => Boolean(target));
      const effectiveBracketTargets = bracketTargets.length > 0
        ? bracketTargets
        : tournamentBracketDivisionOptions.map((option) => ({
            id: option.value,
            label: option.label,
          }));

      effectiveBracketTargets.forEach((division) => {
        const divisionId = division.id;

        const teamIds = new Set<string>(getDivisionTeamIds(division));
        poolDivisions.forEach((poolDivision) => {
          if (!divisionReferencesBracket(poolDivision, divisionId)) {
            return;
          }
          getDivisionTeamIds(poolDivision).forEach((teamId) => teamIds.add(teamId));
        });

        columns.push({
          id: divisionId,
          label: division.label,
          teamIds: Array.from(teamIds),
        });
      });

      if (columns.length > 0) {
        return columns;
      }
    }

    const sourceDivisions = Array.isArray(activeEvent?.divisionDetails)
      ? activeEvent.divisionDetails
      : Array.isArray(activeEvent?.divisions)
        ? activeEvent.divisions
        : [];
    const columns: Array<{ id: string; label: string; teamIds: string[] }> = [];
    sourceDivisions.forEach((division) => {
      if (getDivisionKind(division) === 'PLAYOFF') {
        return;
      }
      const divisionId = getDivisionId(division);
      if (!divisionId) {
        return;
      }
      columns.push({
        id: divisionId,
        label: getDivisionLabel(division) ?? divisionId,
        teamIds: getDivisionTeamIds(division),
      });
    });
    return columns;
  }, [activeEvent, divisionLabelsByKey, tournamentBracketDivisionOptions]);

  const participantDivisionSelectData = useMemo(
    () => participantDivisionColumns.map((column) => ({ value: column.id, label: column.label })),
    [participantDivisionColumns],
  );

  const isSplitDivisionEvent = !isAffiliateEventForView && Boolean(
    (activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT') === 'LEAGUE'
      || (activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT') === 'TOURNAMENT',
  ) && !activeEvent?.singleDivision && participantDivisionColumns.length > 0;

  const eventParticipants = useEventParticipants({
    activeEvent,
    eventId,
    activeMatches,
    isCreateMode,
    weeklyParticipantSelectionRequired,
    selectedOccurrence,
    participantDivisionColumns,
    participantDivisionSelectData,
    isSplitDivisionEvent,
    isLeague,
    isTournament,
    canManageEvent,
    user,
    setEvent,
    setChangesEvent,
    setInfoMessage,
    setWarningMessage,
    setActionError,
  });
  const {
    participantTeams,
    participantUsers,
    participantOfficials,
    participantsLoading,
    participantsError,
    setParticipantsError,
    participantDivisionWarnings,
    participantsUpdatingTeamId,
    participantTeamIds,
    participantTeamIdsKey,
    participantUserIds,
    participantUserIdsKey,
    participantTeamIdSet,
    participantUserIdSet,
    participantOfficialIds,
    participantOfficialIdsKey,
    participantTeamsById,
    filledParticipantTeams,
    unassignedParticipantTeams,
    unassignedFilledParticipantTeams,
    hasSplitDivisionUnassignedTeams,
    isPlaceholderParticipantTeam,
    organizationIdForParticipants,
    availableOrganizationParticipantTeams,
    displayedOrganizationTeams,
    hasTeamSearchInput,
    teamSearchMeetsMinimum,
    searchTeamsLoading,
    searchResultTeams,
    isAddTeamModalOpen,
    setIsAddTeamModalOpen,
    isAddParticipantModalOpen,
    participantInviteMode,
    setParticipantInviteMode,
    participantSearchValue,
    participantSearchResults,
    participantSearchLoading,
    participantSearchError,
    participantInviteRows,
    setParticipantInviteRows,
    participantInviteError,
    setParticipantInviteError,
    invitingParticipants,
    selectedParticipantTeam,
    setSelectedParticipantTeam,
    selectedAddTeamDivisionId,
    setSelectedAddTeamDivisionId,
    teamSearchQuery,
    setTeamSearchQuery,
    organizationTeamsLoading,
    applyParticipantSnapshot,
    refreshParticipantTeamsFromServer,
    openAddParticipantsModal,
    openAddTeamModal,
    closeAddParticipantModal,
    handleSearchParticipants,
    handleAddExistingParticipant,
    handleInviteParticipantsByEmail,
    handleAddTeamRosterParticipants,
    handleAddTeamToParticipants,
    handleMoveTeamDivision,
    handleRemoveTeamFromParticipants,
    handleRemoveUserFromParticipants,
  } = eventParticipants;

  const participantDivisionWarningsByDivisionId = useMemo(() => {
    const warningsByDivisionId = new Map<string, EventParticipantDivisionWarning[]>();
    participantDivisionWarnings.forEach((warning) => {
      const divisionId = normalizeIdToken(warning.divisionId)?.toLowerCase();
      if (!divisionId) {
        return;
      }
      warningsByDivisionId.set(divisionId, [
        ...(warningsByDivisionId.get(divisionId) ?? []),
        warning,
      ]);
    });
    return warningsByDivisionId;
  }, [participantDivisionWarnings]);

  useEffect(() => {
    if (selectedScheduleDivision === 'all') {
      return;
    }

    if (!effectiveScheduleDivisionOptions.some((option) => option.value === selectedScheduleDivision)) {
      setSelectedScheduleDivision('all');
    }
  }, [effectiveScheduleDivisionOptions, selectedScheduleDivision]);

  useEffect(() => {
    if (selectedScheduleDivision === 'all') {
      if (selectedSchedulePool !== 'all') {
        setSelectedSchedulePool('all');
      }
      return;
    }

    if (selectedSchedulePool === 'all') {
      return;
    }

    if (!schedulePoolOptions.some((option) => option.value === selectedSchedulePool)) {
      setSelectedSchedulePool('all');
    }
  }, [schedulePoolOptions, selectedScheduleDivision, selectedSchedulePool]);

  const scheduleMatches = useMemo(() => {
    if (tournamentPoolPlayEnabled && selectedScheduleDivision !== 'all' && selectedSchedulePool !== 'all') {
      return activeMatches.filter((match) => toDivisionKey(getMatchDivisionId(match)) === selectedSchedulePool);
    }

    if (selectedScheduleDivision === 'all') {
      return activeMatches;
    }

    if (tournamentPoolPlayEnabled) {
      const poolDivisionKeysForBracket = new Set(schedulePoolOptions.map((option) => option.value));
      return activeMatches.filter((match) => {
        const matchDivisionKey = toDivisionKey(getMatchDivisionId(match));
        return matchDivisionKey === selectedScheduleDivision
          || Boolean(matchDivisionKey && poolDivisionKeysForBracket.has(matchDivisionKey));
      });
    }

    return activeMatches.filter((match) => toDivisionKey(getMatchDivisionId(match)) === selectedScheduleDivision);
  }, [
    activeMatches,
    schedulePoolOptions,
    selectedScheduleDivision,
    selectedSchedulePool,
    tournamentPoolPlayEnabled,
  ]);

  const scheduleBracketPlaceholderAssignments = useMemo<Record<string, string>>(() => {
    if (!activeEvent) {
      return {};
    }
    return buildLeaguePlayoffPlaceholderAssignmentsForMatches({
      tournament: activeEvent,
      matchesById: activeMatchesById,
    });
  }, [activeEvent, activeMatchesById]);

  const scheduleMatchesForDisplay = useMemo<Match[]>(() => {
    const resolveLinkedMatch = (idValue: unknown, relationValue: unknown): Match | undefined => {
      const linkedId = normalizeIdToken(idValue);
      if (linkedId && activeMatchesById[linkedId]) {
        return activeMatchesById[linkedId];
      }
      if (idValue === null || (typeof idValue === 'string' && idValue.trim().length === 0)) {
        return undefined;
      }
      const relationId = normalizeIdToken((relationValue as { $id?: unknown; id?: unknown } | null | undefined)?.$id)
        ?? normalizeIdToken((relationValue as { id?: unknown } | null | undefined)?.id);
      if (relationId && activeMatchesById[relationId]) {
        return activeMatchesById[relationId];
      }
      return relationValue && typeof relationValue === 'object'
        ? relationValue as Match
        : undefined;
    };

    return scheduleMatches.map((match) => ({
      ...match,
      previousLeftMatch: resolveLinkedMatch(match.previousLeftId, match.previousLeftMatch),
      previousRightMatch: resolveLinkedMatch(match.previousRightId, match.previousRightMatch),
      winnerNextMatch: resolveLinkedMatch(match.winnerNextMatchId, match.winnerNextMatch),
      loserNextMatch: resolveLinkedMatch(match.loserNextMatchId, match.loserNextMatch),
    }));
  }, [activeMatchesById, scheduleMatches]);

  const preferredStandingsDivisionId = useMemo(() => {
    if (tournamentPoolPlayEnabled) {
      return effectiveStandingsDivisionOptions[0]?.value ?? null;
    }

    const validOptionIds = new Set(effectiveStandingsDivisionOptions.map((option) => option.value));
    const sourceDivisions = Array.isArray(activeEvent?.divisionDetails)
      ? activeEvent.divisionDetails
      : Array.isArray(activeEvent?.divisions)
        ? activeEvent.divisions
        : [];

    for (const division of sourceDivisions) {
      if (getDivisionKind(division) === 'PLAYOFF') {
        continue;
      }
      const divisionId = getDivisionId(division);
      if (!divisionId || !validOptionIds.has(divisionId)) {
        continue;
      }
      if (!isDivisionStandingsConfirmed(division)) {
        return divisionId;
      }
    }

    return effectiveStandingsDivisionOptions[0]?.value ?? null;
  }, [
    activeEvent?.divisionDetails,
    activeEvent?.divisions,
    effectiveStandingsDivisionOptions,
    tournamentPoolPlayEnabled,
  ]);

  const standingsEventEnabled = isLeague || tournamentPoolPlayEnabled;

  useEffect(() => {
    if (!standingsEventEnabled || effectiveStandingsDivisionOptions.length === 0) {
      if (selectedStandingsDivision !== null) {
        setSelectedStandingsDivision(null);
      }
      if (selectedStandingsPool !== null) {
        setSelectedStandingsPool(null);
      }
      setStandingsDivisionData(null);
      setStandingsDraftOverrides({});
      return;
    }

    if (
      selectedStandingsDivision
      && effectiveStandingsDivisionOptions.some((option) => option.value === selectedStandingsDivision)
    ) {
      return;
    }

    setSelectedStandingsDivision(preferredStandingsDivisionId ?? effectiveStandingsDivisionOptions[0].value);
  }, [
    effectiveStandingsDivisionOptions,
    preferredStandingsDivisionId,
    selectedStandingsDivision,
    selectedStandingsPool,
    standingsEventEnabled,
  ]);

  useEffect(() => {
    if (!tournamentPoolPlayEnabled) {
      if (selectedStandingsPool !== null) {
        setSelectedStandingsPool(null);
      }
      return;
    }

    if (standingsPoolOptions.length === 0) {
      if (selectedStandingsPool !== null) {
        setSelectedStandingsPool(null);
      }
      return;
    }

    if (
      !selectedStandingsPool
      || !standingsPoolOptions.some((option) => option.value === selectedStandingsPool)
    ) {
      setSelectedStandingsPool(standingsPoolOptions[0].value);
    }
  }, [selectedStandingsPool, standingsPoolOptions, tournamentPoolPlayEnabled]);

  const activeEventId = activeEvent?.$id ?? null;
  const activeEventType = activeEvent?.eventType ?? null;

  useEffect(() => {
    if (isCreateMode || !activeEventId || !standingsEventEnabled || !selectedStandingsDataDivision) {
      setStandingsDivisionData(null);
      setStandingsDraftOverrides({});
      setStandingsLoading(false);
      return;
    }

    let cancelled = false;
    setStandingsLoading(true);
    setStandingsActionError(null);

    tournamentService
      .getLeagueDivisionStandings(activeEventId, selectedStandingsDataDivision)
      .then((division) => {
        if (cancelled) {
          return;
        }
        setStandingsDivisionData(division);
        setStandingsDraftOverrides(division.standingsOverrides ? { ...division.standingsOverrides } : {});
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load division standings:', loadError);
        setStandingsDivisionData(null);
        setStandingsDraftOverrides({});
        setStandingsActionError(loadError instanceof Error ? loadError.message : 'Failed to load division standings.');
      })
      .finally(() => {
        if (!cancelled) {
          setStandingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEventId, activeEventType, isCreateMode, selectedStandingsDataDivision, standingsEventEnabled]);

  const canUseTeamCompliance = Boolean(isEditingEvent && canManageEvent && activeEvent?.teamSignup);
  const canUseUserCompliance = Boolean(isEditingEvent && canManageEvent && activeEvent?.teamSignup === false);
  const canManageStandings = Boolean(canManageEvent && !isPreview && !isCreateMode);
  useEffect(() => {
    teamComplianceRefreshKeyRef.current = teamComplianceRefreshKey;
  }, [teamComplianceRefreshKey]);
  const entityLabel = isTemplateEvent
    ? 'Template'
    : isTournament
      ? 'Tournament'
      : isLeague
        ? 'League'
        : 'Event';
  const activeLifecycleStatus = getEventLifecycleStatus(activeEvent);
  const pendingSaveChanges = useMemo<PendingSaveChangeItem[]>(() => {
    const items: PendingSaveChangeItem[] = [];
    const normalizedStagedDeletes = Array.from(
      new Set(
        stagedMatchDeletes
          .map((value) => normalizeIdToken(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const stagedDeleteSet = new Set(normalizedStagedDeletes);
    const baselineMatchesById = new Map<string, Match>();
    const draftMatchesById = new Map<string, Match>();

    matches.forEach((match) => {
      const matchId = normalizeIdToken(match.$id);
      if (matchId) {
        baselineMatchesById.set(matchId, match);
      }
    });
    activeMatches.forEach((match) => {
      const matchId = normalizeIdToken(match.$id);
      if (matchId) {
        draftMatchesById.set(matchId, match);
      }
    });

    const formatMatchLabel = (match: Match | undefined, matchId: string): string => {
      if (match && typeof match.matchId === 'number' && Number.isFinite(match.matchId)) {
        return `Match #${Math.trunc(match.matchId)}`;
      }
      if (isClientMatchId(matchId)) {
        return 'New match';
      }
      return `Match ${matchId.slice(0, 8)}`;
    };

    const summarizeChangedMatchFields = (before: Match, after: Match): string[] => {
      const changedFields: string[] = [];
      const idChanged = (first: string | null | undefined, second: string | null | undefined): boolean => (
        normalizeIdToken(first) !== normalizeIdToken(second)
      );
      const valueChanged = (first: unknown, second: unknown): boolean => (
        (first ?? null) !== (second ?? null)
      );
      const arrayChanged = (first: unknown[] | null | undefined, second: unknown[] | null | undefined): boolean => (
        JSON.stringify(first ?? []) !== JSON.stringify(second ?? [])
      );
      const startBefore = typeof before.start === 'string' && before.start.trim().length > 0 ? before.start : null;
      const startAfter = typeof after.start === 'string' && after.start.trim().length > 0 ? after.start : null;
      const endBefore = typeof before.end === 'string' && before.end.trim().length > 0 ? before.end : null;
      const endAfter = typeof after.end === 'string' && after.end.trim().length > 0 ? after.end : null;
      const divisionBefore = normalizeDivisionToken(getDivisionId(before.division));
      const divisionAfter = normalizeDivisionToken(getDivisionId(after.division));

      if (idChanged(before.team1Id, after.team1Id)) changedFields.push('team 1');
      if (idChanged(before.team2Id, after.team2Id)) changedFields.push('team 2');
      if (idChanged(before.officialId, after.officialId)) changedFields.push('official');
      if (idChanged(before.teamOfficialId, after.teamOfficialId)) changedFields.push('team official');
      if (idChanged(before.fieldId, after.fieldId)) changedFields.push('field');
      if (valueChanged(startBefore, startAfter)) changedFields.push('start time');
      if (valueChanged(endBefore, endAfter)) changedFields.push('end time');
      if (valueChanged(divisionBefore, divisionAfter)) changedFields.push('division');
      if (idChanged(before.previousLeftId, after.previousLeftId)) changedFields.push('previous left');
      if (idChanged(before.previousRightId, after.previousRightId)) changedFields.push('previous right');
      if (idChanged(before.winnerNextMatchId, after.winnerNextMatchId)) changedFields.push('winner next');
      if (idChanged(before.loserNextMatchId, after.loserNextMatchId)) changedFields.push('loser next');
      if (valueChanged(before.side, after.side)) changedFields.push('side');
      if (Boolean(before.losersBracket) !== Boolean(after.losersBracket)) changedFields.push('winner/loser bracket');
      if (Boolean(before.locked) !== Boolean(after.locked)) changedFields.push('lock status');
      if (Boolean(before.officialCheckedIn ?? before.officialCheckedIn) !== Boolean(after.officialCheckedIn ?? after.officialCheckedIn)) {
        changedFields.push('official check-in');
      }
      if (
        arrayChanged(before.team1Points, after.team1Points)
        || arrayChanged(before.team2Points, after.team2Points)
        || arrayChanged(before.setResults, after.setResults)
      ) {
        changedFields.push('score values');
      }

      return changedFields;
    };

    if (selectedLifecycleStatus && selectedLifecycleStatus !== activeLifecycleStatus) {
      items.push({
        id: 'event-lifecycle-status',
        category: 'event',
        label: `Event status: ${getLifecycleStatusLabel(activeLifecycleStatus)} -> ${getLifecycleStatusLabel(selectedLifecycleStatus)}`,
        detail: 'Lifecycle status will update on save.',
        sortOrder: 0,
      });
    }

    if (formHasUnsavedChanges) {
      items.push({
        id: 'event-form-updates',
        category: 'event',
        label: 'Event details updated',
        detail: 'Unsaved form changes will be applied on save.',
        sortOrder: 1,
      });
    }

    draftMatchesById.forEach((match, matchId) => {
      if (stagedDeleteSet.has(matchId)) {
        return;
      }

      const baselineMatch = baselineMatchesById.get(matchId);
      if (!baselineMatch || isClientMatchId(matchId)) {
        const createMeta = stagedMatchCreates[matchId];
        items.push({
          id: `match-create-${matchId}`,
          category: 'match',
          label: `Add ${formatMatchLabel(match, matchId)}`,
          detail: createMeta
            ? `Added from ${createMeta.creationContext === 'schedule' ? 'schedule' : 'bracket'} view.`
            : 'New staged match.',
          sortOrder: 20,
        });
        return;
      }

      const changedFields = summarizeChangedMatchFields(baselineMatch, match);
      if (changedFields.length > 0) {
        const maxFieldsToShow = 4;
        const visibleFields = changedFields.slice(0, maxFieldsToShow);
        const hiddenCount = changedFields.length - visibleFields.length;
        items.push({
          id: `match-update-${matchId}`,
          category: 'match',
          label: `Update ${formatMatchLabel(match, matchId)}`,
          detail: hiddenCount > 0
            ? `${visibleFields.join(', ')} (+${hiddenCount} more)`
            : visibleFields.join(', '),
          sortOrder: 30,
        });
      }
    });

    baselineMatchesById.forEach((match, matchId) => {
      if (stagedDeleteSet.has(matchId) || !draftMatchesById.has(matchId)) {
        items.push({
          id: `match-delete-${matchId}`,
          category: 'match',
          label: `Delete ${formatMatchLabel(match, matchId)}`,
          detail: 'Match will be removed on save.',
          sortOrder: 40,
        });
      }
    });

    if (hasPendingUnsavedChanges && items.length === 0) {
      items.push({
        id: 'unspecified-unsaved-changes',
        category: 'event',
        label: 'Unsaved changes pending',
        detail: 'Save to apply the latest updates.',
        sortOrder: 99,
      });
    }

    return items.sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }
      return first.label.localeCompare(second.label);
    });
  }, [
    activeLifecycleStatus,
    activeMatches,
    formHasUnsavedChanges,
    hasPendingUnsavedChanges,
    matches,
    selectedLifecycleStatus,
    stagedMatchCreates,
    stagedMatchDeletes,
  ]);
  const pendingSaveChangeCount = pendingSaveChanges.length;
  const showEventOfficialNames = Boolean(canEditMatches || isEventOfficial);
  const shouldShowCreationSheet = Boolean(
    isCreateMode
    || (isEditingEvent && canManageEvent && user),
  );
  const createFormId = 'create-event-form';
  const hasSelectedNotificationAudience = useMemo(
    () => Object.values(notificationAudience).some(Boolean),
    [notificationAudience],
  );

  const resetNotificationComposer = useCallback(() => {
    setNotificationTitle('');
    setNotificationMessage('');
    setNotificationAudience({ ...DEFAULT_NOTIFICATION_AUDIENCE });
    setNotificationError(null);
  }, []);

  const handleOpenNotificationModal = useCallback(() => {
    resetNotificationComposer();
    setIsNotificationModalOpen(true);
  }, [resetNotificationComposer]);

  const handleCloseNotificationModal = useCallback(() => {
    if (sendingNotification) {
      return;
    }
    setIsNotificationModalOpen(false);
  }, [sendingNotification]);

  const handleReportEvent = useCallback(async () => {
    if (!activeEvent?.$id || !user || reportingEvent) {
      return;
    }

    const notes = window.prompt(
      `Report "${activeEvent.name}". Add details for moderation, or leave the field blank to submit without extra notes.`,
      '',
    );
    if (notes === null) {
      return;
    }

    setReportingEvent(true);
    try {
      const result = await eventService.reportEvent(activeEvent.$id, {
        notes: notes.trim() || undefined,
      });
      setUser({
        ...user,
        hiddenEventIds: result.hiddenEventIds,
      });
      window.alert('Event reported. It has been hidden from your event results.');
      router.push('/discover');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to report event.';
      window.alert(message);
    } finally {
      setReportingEvent(false);
    }
  }, [activeEvent, reportingEvent, router, setUser, user]);

  const handleNotificationAudienceToggle = useCallback((key: NotificationAudienceKey, checked: boolean) => {
    setNotificationAudience((prev) => ({
      ...prev,
      [key]: checked,
    }));
  }, []);

  const handleSendNotification = useCallback(async () => {
    if (!activeEvent?.$id || sendingNotification) {
      return;
    }

    const normalizedTitle = notificationTitle.trim();
    const normalizedMessage = notificationMessage.trim();
    if (!normalizedTitle || !normalizedMessage) {
      setNotificationError('Title and message are required.');
      return;
    }
    if (!hasSelectedNotificationAudience) {
      setNotificationError('Select at least one audience group.');
      return;
    }

    setSendingNotification(true);
    setNotificationError(null);
    try {
      const response = await apiRequest<{
        recipients?: {
          selectedCount?: number;
          pushRecipients?: number;
          emailFallbackRecipients?: number;
          noChannelRecipients?: number;
        };
        delivery?: {
          push?: {
            attempted?: boolean;
            reason?: string;
            recipientCount?: number;
            tokenCount?: number;
            successCount?: number;
            failureCount?: number;
            prunedTokenCount?: number;
          };
          emailSentCount?: number;
          emailFailedCount?: number;
          emailTimedOutCount?: number;
          emailDisabledRecipientCount?: number;
        };
      }>(`/api/events/${encodeURIComponent(activeEvent.$id)}/notifications`, {
        method: 'POST',
        timeoutMs: 60_000,
        body: {
          title: normalizedTitle,
          message: normalizedMessage,
          audience: notificationAudience,
        },
      });

      const selectedCount = response.recipients?.selectedCount ?? 0;
      const pushRecipients = response.recipients?.pushRecipients ?? 0;
      const pushDeliveredCount = response.delivery?.push?.successCount ?? 0;
      const pushFailedCountFromProvider = response.delivery?.push?.failureCount ?? 0;
      const pushWasAttempted = response.delivery?.push?.attempted ?? false;
      const pushFailedCount = (!pushWasAttempted && pushRecipients > 0)
        ? Math.max(pushFailedCountFromProvider, pushRecipients)
        : pushFailedCountFromProvider;
      const emailSentCount = response.delivery?.emailSentCount ?? 0;
      const emailTimedOutCount = response.delivery?.emailTimedOutCount ?? 0;
      const noChannelRecipients = response.recipients?.noChannelRecipients ?? 0;
      const emailDisabledRecipients = response.delivery?.emailDisabledRecipientCount ?? 0;
      const emailFailedCount = response.delivery?.emailFailedCount ?? 0;

      const skippedCount = noChannelRecipients
        + emailDisabledRecipients
        + emailFailedCount
        + emailTimedOutCount
        + pushFailedCount;
      const summaryParts = [
        `${selectedCount} selected`,
        `${pushDeliveredCount} push delivered`,
        `${emailSentCount} email`,
      ];
      if (skippedCount > 0) {
        summaryParts.push(`${skippedCount} skipped`);
      }
      setInfoMessage(`Notification sent (${summaryParts.join(', ')}).`);
      setIsNotificationModalOpen(false);
      resetNotificationComposer();
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Failed to send notification.');
    } finally {
      setSendingNotification(false);
    }
  }, [
    activeEvent?.$id,
    hasSelectedNotificationAudience,
    notificationAudience,
    notificationMessage,
    notificationTitle,
    resetNotificationComposer,
    sendingNotification,
  ]);

  useEffect(() => {
    if (!isCreateMode && !isEditingEvent) {
      setFormHasUnsavedChanges(false);
    }
  }, [isCreateMode, isEditingEvent]);

  useEffect(() => {
    let cancelled = false;

    if (!user?.$id) {
      setChildUserIds([]);
      return () => {
        cancelled = true;
      };
    }

    familyService
      .listChildren()
      .then((children) => {
        if (cancelled) return;
        const ids = Array.from(
          new Set(
            (children ?? [])
              .filter((child) => (child.linkStatus ?? 'active').toLowerCase() === 'active')
              .map((child) => child.userId?.trim())
              .filter((id): id is string => Boolean(id && id.length > 0)),
          ),
        );
        setChildUserIds(ids);
      })
      .catch(() => {
        if (!cancelled) {
          setChildUserIds([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.$id]);

  const handleCreateTemplateFromEvent = useCallback(async () => {
    if (!activeEvent || !user?.$id) {
      return;
    }
    if (!canManageEvent) {
      setActionError('Only an event host can create templates from this event.');
      return;
    }
    if (activeEvent.state === 'TEMPLATE') {
      setActionError('This event is already a template.');
      return;
    }
    if (creatingTemplate) {
      return;
    }

    setCreatingTemplate(true);
    setActionError(null);
    setInfoMessage(null);
    setWarningMessage(null);

    try {
      const response = await apiRequest<{ template?: { name?: string } }>('/api/event-templates', {
        method: 'POST',
        body: {
          sourceEventId: activeEvent.$id,
        },
      });
      setInfoMessage(`Template created: ${response.template?.name ?? activeEvent.name}`);
    } catch (error) {
      console.error('Failed to create event template:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to create template.');
    } finally {
      setCreatingTemplate(false);
    }
  }, [activeEvent, canManageEvent, creatingTemplate, user?.$id]);

  const showDateOnMatches = useMemo(() => {
    if (!activeEvent?.start || !activeEvent?.end) return false;
    const start = new Date(activeEvent.start);
    const end = new Date(activeEvent.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
  }, [activeEvent?.start, activeEvent?.end]);

  const teamsById = useMemo(() => {
    const map = new Map<string, Team>();
    if (Array.isArray(activeEvent?.teams)) {
      (activeEvent.teams as Team[]).forEach((team) => {
        if (team?.$id) {
          map.set(team.$id, team);
        }
      });
    }
    return map;
  }, [activeEvent?.teams]);

  const viewerHighlightTeams = useMemo(
    () => Array.from(participantTeamsById.values()),
    [participantTeamsById],
  );
  const eventDivisionHighlightSources = useMemo<unknown[]>(() => {
    const sources: unknown[] = [];
    if (Array.isArray(activeEvent?.divisionDetails)) {
      sources.push(...activeEvent.divisionDetails);
    }
    if (Array.isArray(activeEvent?.playoffDivisionDetails)) {
      sources.push(...activeEvent.playoffDivisionDetails);
    }
    if (Array.isArray(activeEvent?.divisions)) {
      sources.push(...activeEvent.divisions);
    }
    return sources;
  }, [activeEvent?.divisionDetails, activeEvent?.divisions, activeEvent?.playoffDivisionDetails]);
  const viewerTeamIds = useMemo(
    () => collectViewerTeamIds({
      currentUser: user,
      childUserIds,
      teams: viewerHighlightTeams,
    }),
    [childUserIds, user, viewerHighlightTeams],
  );
  const viewerDivisionHighlightKeys = useMemo(
    () => collectViewerDivisionHighlightKeys({
      currentUser: user,
      childUserIds,
      teams: viewerHighlightTeams,
      divisions: eventDivisionHighlightSources,
      matches: activeMatches,
    }),
    [activeMatches, childUserIds, eventDivisionHighlightSources, user, viewerHighlightTeams],
  );
  const renderViewerHighlightedDivisionOption = useCallback<NonNullable<SelectProps['renderOption']>>(
    ({ option }) => {
      const highlighted = isViewerDivisionHighlighted(viewerDivisionHighlightKeys, option.value);
      return (
        <Group justify="space-between" gap="xs" wrap="nowrap" w="100%">
          <Text
            span
            size="sm"
            fw={highlighted ? 700 : 400}
            c={highlighted ? 'green.8' : undefined}
            truncate
          >
            {option.label}
          </Text>
          {highlighted ? (
            <Badge size="xs" color="green" variant="light">
              Your team
            </Badge>
          ) : null}
        </Group>
      );
    },
    [viewerDivisionHighlightKeys],
  );
  const getViewerHighlightedSelectStyles = useCallback(
    (value: string | null | undefined): SelectProps['styles'] | undefined => (
      isViewerDivisionHighlighted(viewerDivisionHighlightKeys, value)
        ? {
            input: {
              backgroundColor: 'var(--mantine-color-green-0)',
              borderColor: 'var(--mantine-color-green-4)',
              color: 'var(--mantine-color-green-9)',
              fontWeight: 700,
            },
          }
        : undefined
    ),
    [viewerDivisionHighlightKeys],
  );

  useEffect(() => {
    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    if (!targetEventId || !canManageEvent || activeEvent?.teamCheckInMode !== 'EVENT') {
      setEventTeamCheckInsById({});
      return;
    }

    let cancelled = false;
    apiRequest<{ checkIns?: Array<{ eventTeamId?: string | null; status?: string | null }> }>(
      `/api/events/${encodeURIComponent(targetEventId)}/team-check-ins`,
    )
      .then((response) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        (response.checkIns ?? []).forEach((row) => {
          const teamId = normalizeIdToken(row.eventTeamId);
          if (teamId && String(row.status ?? '').toUpperCase() === 'CHECKED_IN') {
            next[teamId] = true;
          }
        });
        setEventTeamCheckInsById(next);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Failed to load event team check-ins', error);
          setEventTeamCheckInsById({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamCheckInMode, canManageEvent, eventId]);

  useEffect(() => {
    if (!canUseTeamCompliance) {
      setTeamComplianceError(null);
      setTeamComplianceLoading(false);
      if (!canManageEvent || activeEvent?.teamSignup !== true) {
        loadedTeamComplianceKeyRef.current = null;
        setTeamComplianceById({});
        setSelectedComplianceTeamId(null);
      }
      return;
    }

    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    const teamIds = parseStableIdListKey(participantTeamIdsKey);
    if (!targetEventId || teamIds.length === 0) {
      loadedTeamComplianceKeyRef.current = null;
      setTeamComplianceById({});
      setTeamComplianceError(null);
      setTeamComplianceLoading(false);
      return;
    }

    const complianceKey = buildComplianceSnapshotKey(
      targetEventId,
      participantTeamIdsKey,
      selectedOccurrence,
      teamComplianceRefreshKey,
    );
    if (complianceKey && loadedTeamComplianceKeyRef.current === complianceKey) {
      return;
    }
    loadedTeamComplianceKeyRef.current = complianceKey;

    let cancelled = false;
    setTeamComplianceLoading(true);
    setTeamComplianceError(null);

    const complianceParams = new URLSearchParams();
    if (selectedOccurrence?.slotId) {
      complianceParams.set('slotId', selectedOccurrence.slotId);
    }
    if (selectedOccurrence?.occurrenceDate) {
      complianceParams.set('occurrenceDate', selectedOccurrence.occurrenceDate);
    }
    const complianceQuery = complianceParams.toString();

    void apiRequest<EventTeamComplianceResponse>(
      `/api/events/${targetEventId}/teams/compliance${complianceQuery ? `?${complianceQuery}` : ''}`,
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const byId: Record<string, TeamComplianceSummary> = {};
        (payload?.teams ?? []).forEach((teamSummary) => {
          if (teamSummary?.teamId) {
            byId[teamSummary.teamId] = teamSummary;
          }
        });
        setTeamComplianceById(byId);
      })
      .catch((complianceError) => {
        if (cancelled) {
          return;
        }
        if (loadedTeamComplianceKeyRef.current === complianceKey) {
          loadedTeamComplianceKeyRef.current = null;
        }
        console.error('Failed to load team compliance summaries:', complianceError);
        setTeamComplianceById({});
        setTeamComplianceError(
          complianceError instanceof Error
            ? complianceError.message
            : 'Failed to load team payment and document status.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setTeamComplianceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamSignup, canManageEvent, canUseTeamCompliance, eventId, participantTeamIdsKey, selectedOccurrence, teamComplianceRefreshKey]);

  useEffect(() => {
    if (!canUseUserCompliance) {
      setUserComplianceError(null);
      setUserComplianceLoading(false);
      if (!canManageEvent || activeEvent?.teamSignup !== false) {
        loadedUserComplianceKeyRef.current = null;
        setUserComplianceById({});
      }
      return;
    }

    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    const userIds = parseStableIdListKey(participantUserIdsKey);
    if (!targetEventId || userIds.length === 0) {
      loadedUserComplianceKeyRef.current = null;
      setUserComplianceById({});
      setUserComplianceError(null);
      setUserComplianceLoading(false);
      return;
    }

    const complianceKey = buildComplianceSnapshotKey(
      targetEventId,
      participantUserIdsKey,
      selectedOccurrence,
      teamComplianceRefreshKey,
    );
    if (complianceKey && loadedUserComplianceKeyRef.current === complianceKey) {
      return;
    }
    loadedUserComplianceKeyRef.current = complianceKey;

    let cancelled = false;
    setUserComplianceLoading(true);
    setUserComplianceError(null);

    const complianceParams = new URLSearchParams();
    if (selectedOccurrence?.slotId) {
      complianceParams.set('slotId', selectedOccurrence.slotId);
    }
    if (selectedOccurrence?.occurrenceDate) {
      complianceParams.set('occurrenceDate', selectedOccurrence.occurrenceDate);
    }
    const complianceQuery = complianceParams.toString();

    void apiRequest<EventUserComplianceResponse>(
      `/api/events/${targetEventId}/users/compliance${complianceQuery ? `?${complianceQuery}` : ''}`,
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const byId: Record<string, TeamComplianceUserSummary> = {};
        (payload?.users ?? []).forEach((userSummary) => {
          if (userSummary?.userId) {
            byId[userSummary.userId] = userSummary;
          }
        });
        setUserComplianceById(byId);
      })
      .catch((complianceError) => {
        if (cancelled) {
          return;
        }
        if (loadedUserComplianceKeyRef.current === complianceKey) {
          loadedUserComplianceKeyRef.current = null;
        }
        console.error('Failed to load participant user compliance summaries:', complianceError);
        setUserComplianceById({});
        setUserComplianceError(
          complianceError instanceof Error
            ? complianceError.message
            : 'Failed to load participant payment and document status.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setUserComplianceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamSignup, canManageEvent, canUseUserCompliance, eventId, participantUserIdsKey, selectedOccurrence, teamComplianceRefreshKey]);

  useEffect(() => {
    if (!selectedComplianceTeamId) {
      return;
    }
    const stillVisible = participantTeamIdSet.has(selectedComplianceTeamId);
    if (!stillVisible) {
      setSelectedComplianceTeamId(null);
    }
  }, [participantTeamIdSet, selectedComplianceTeamId]);

  const refreshTeamCompliance = useCallback(() => {
    setTeamComplianceRefreshKey((current) => current + 1);
  }, []);

  const appendSelectedOccurrenceQuery = useCallback((path: string): string => {
    const params = new URLSearchParams();
    if (selectedOccurrence?.slotId) {
      params.set('slotId', selectedOccurrence.slotId);
    }
    if (selectedOccurrence?.occurrenceDate) {
      params.set('occurrenceDate', selectedOccurrence.occurrenceDate);
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }, [selectedOccurrence?.occurrenceDate, selectedOccurrence?.slotId]);

  const eventBilling = useEventBilling({
    activeEventId: activeEvent?.$id,
    fallbackEventId: eventId,
    eventType: activeEvent?.eventType,
    teamSignup: activeEvent?.teamSignup,
    appendSelectedOccurrenceQuery,
    refreshTeamCompliance,
    setInfoMessage,
  });
  const {
    selectedRefundTeam,
    refundSnapshot,
    refundLoading,
    refundError,
    refundAmountDraftByPaymentId,
    manualProofAmountDraftById,
    refundingPaymentId,
    cancellingPendingBillPaymentId,
    reviewingManualProofId,
    closeRefundModal,
    openRefundModal,
    handleRefundAmountDraftChange,
    handleManualProofAmountDraftChange,
    submitRefund,
    cancelPendingBillPayment,
    reviewManualPaymentProof,
    createBillTeam,
    createBillError,
    creatingBill,
    createBillOwnerType,
    createBillOwnerId,
    createBillAmountDollars,
    createBillTaxDollars,
    createBillAllowSplit,
    createBillLabel,
    createBillUserOptions,
    createBillIsUserOnly,
    createBillPreviewLineItems,
    createBillTotalCents,
    closeCreateBillModal,
    openCreateBillModal,
    setCreateBillOwnerType,
    setCreateBillOwnerId,
    setCreateBillAmountDollars,
    setCreateBillTaxDollars,
    setCreateBillAllowSplit,
    setCreateBillLabel,
    submitCreateBill,
  } = eventBilling;

  const renderEditBillingActions = useCallback((team: Team) => {
    if (!isEditingEvent || !canManageEvent) {
      return null;
    }
    return (
      <Group gap={6} wrap="nowrap">
        <Button
          size="xs"
          variant="light"
          color="blue"
          onClick={(event) => {
            event.stopPropagation();
            void openRefundModal(team);
          }}
        >
          Refund
        </Button>
        <Button
          size="xs"
          variant="light"
          color="grape"
          onClick={(event) => {
            event.stopPropagation();
            openCreateBillModal(team);
          }}
        >
          Send Bill
        </Button>
      </Group>
    );
  }, [canManageEvent, isEditingEvent, openCreateBillModal, openRefundModal]);

  const resolveTeam = useCallback(
    (value: Match['team1'] | string | null | undefined): Team | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        return participantTeamsById.get(value) ?? teamsById.get(value) ?? null;
      }
      if (typeof value === 'object') {
        const team = value as Team & { id?: string };
        const teamId = normalizeIdToken(team.$id ?? team.id);
        if (teamId) {
          return participantTeamsById.get(teamId) ?? teamsById.get(teamId) ?? team;
        }
        return team;
      }
      return null;
    },
    [participantTeamsById, teamsById],
  );

  const userOnTeam = useCallback(
    (team: Team | null | undefined) => {
      if (!team || !user?.$id) return false;
      const memberIds = new Set<string>();
      if (Array.isArray(team.playerIds)) {
        team.playerIds.forEach((id) => {
          if (typeof id === 'string') {
            memberIds.add(id);
          }
        });
      }
      if (Array.isArray(team.players)) {
        team.players.forEach((player) => {
          if (player?.$id) {
            memberIds.add(player.$id);
          }
        });
      }
      if (team.captainId) {
        memberIds.add(team.captainId);
      }
      if (team.captain && typeof team.captain === 'object' && '$id' in team.captain && (team.captain as any).$id) {
        memberIds.add((team.captain as any).$id as string);
      }
      return memberIds.has(user.$id);
    },
    [user?.$id],
  );

  const userEventTeamIdFromProfile = useMemo(() => {
    if (!Array.isArray(user?.teamIds) || user.teamIds.length === 0) {
      return null;
    }
    for (const teamIdRaw of user.teamIds) {
      const teamId = normalizeIdToken(teamIdRaw);
      if (teamId && participantTeamIdSet.has(teamId)) {
        return teamId;
      }
    }
    return null;
  }, [participantTeamIdSet, user?.teamIds]);

  const findUserEventTeam = useCallback(() => {
    if (!user?.$id) return null;
    for (const team of participantTeamsById.values()) {
      if (team && userOnTeam(team)) {
        return team;
      }
    }
    return null;
  }, [participantTeamsById, user?.$id, userOnTeam]);

  const userCanManageRosterTeam = useCallback(
    (team: Team | null | undefined) => {
      if (!team || !user?.$id) return false;
      const managerOrCoachIds = new Set<string>();
      const addId = (value: unknown) => {
        const normalized = normalizeIdToken(value);
        if (normalized) {
          managerOrCoachIds.add(normalized);
        }
      };
      addId(team.managerId);
      addId(team.headCoachId);
      if (Array.isArray(team.assistantCoachIds)) {
        team.assistantCoachIds.forEach(addId);
      }
      if (Array.isArray(team.coachIds)) {
        team.coachIds.forEach(addId);
      }
      const teamRelations = team as Team & {
        manager?: UserData | null;
        headCoach?: UserData | null;
        assistantCoaches?: UserData[] | null;
        coaches?: UserData[] | null;
        eventTeamStaffAssignments?: Array<{
          userId?: string | null;
          role?: string | null;
          status?: string | null;
        }> | null;
      };
      addId(teamRelations.manager?.$id);
      addId(teamRelations.headCoach?.$id);
      if (Array.isArray(teamRelations.assistantCoaches)) {
        teamRelations.assistantCoaches.forEach((coach) => addId(coach?.$id));
      }
      if (Array.isArray(teamRelations.coaches)) {
        teamRelations.coaches.forEach((coach) => addId(coach?.$id));
      }
      if (Array.isArray(teamRelations.eventTeamStaffAssignments)) {
        teamRelations.eventTeamStaffAssignments.forEach((assignment) => {
          const role = String(assignment?.role ?? '').toUpperCase();
          const status = String(assignment?.status ?? 'ACTIVE').toUpperCase();
          if (status === 'ACTIVE' && ['MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH'].includes(role)) {
            addId(assignment.userId);
          }
        });
      }
      return managerOrCoachIds.has(user.$id);
    },
    [user?.$id],
  );

  const findUserManagedEventTeam = useCallback(() => {
    for (const team of participantTeamsById.values()) {
      if (userCanManageRosterTeam(team)) {
        return team;
      }
    }
    return null;
  }, [participantTeamsById, userCanManageRosterTeam]);

  const findUserManagedMatchTeam = useCallback(
    (match: Match | null | undefined) => {
      if (!match) return null;
      const team1 = resolveTeam(match.team1 ?? match.team1Id);
      if (userCanManageRosterTeam(team1)) {
        return team1;
      }
      const team2 = resolveTeam(match.team2 ?? match.team2Id);
      if (userCanManageRosterTeam(team2)) {
        return team2;
      }
      return null;
    },
    [resolveTeam, userCanManageRosterTeam],
  );

  const isTeamCheckInOpen = useCallback(
    (start: string | Date | null | undefined) => {
      if (!start) return true;
      const startDate = start instanceof Date ? start : new Date(start);
      if (Number.isNaN(startDate.getTime())) return true;
      const minutes = Number.isFinite(Number(activeEvent?.teamCheckInOpenMinutesBefore))
        ? Math.max(0, Math.trunc(Number(activeEvent?.teamCheckInOpenMinutesBefore)))
        : 60;
      return Date.now() >= startDate.getTime() - minutes * 60_000;
    },
    [activeEvent?.teamCheckInOpenMinutesBefore],
  );

  const performTeamCheckIn = useCallback(
    async (scope: 'EVENT' | 'MATCH', team: Team, match?: Match | null) => {
      const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
      const eventTeamId = normalizeIdToken(team.$id);
      if (!targetEventId || !eventTeamId) {
        return false;
      }
      const endpoint = scope === 'MATCH'
        ? (
            match?.$id
              ? `/api/events/${encodeURIComponent(targetEventId)}/matches/${encodeURIComponent(match.$id)}/team-check-ins`
              : null
          )
        : `/api/events/${encodeURIComponent(targetEventId)}/team-check-ins`;
      if (!endpoint) {
        return false;
      }
      try {
        await apiRequest(endpoint, {
          method: 'POST',
          body: { eventTeamId },
        });
        if (scope === 'EVENT') {
          setEventTeamCheckInsById((current) => ({ ...current, [eventTeamId]: true }));
        }
        return true;
      } catch (checkInError) {
        console.error('Failed to check in team', checkInError);
        setError(checkInError instanceof Error ? checkInError.message : 'Failed to check in team.');
        return false;
      }
    },
    [activeEvent?.$id, eventId],
  );

  const openRosterForMatch = useCallback(
    (match: Match) => {
      const managedTeam = findUserManagedMatchTeam(match);
      if (!managedTeam) {
        return;
      }
      closeScoreModal();
      setRosterModalMatch(match);
      setRosterModalTeam(managedTeam);
    },
    [closeScoreModal, findUserManagedMatchTeam],
  );

  const canUserEditMatchRoster = useCallback(
    (match: Match) => Boolean(
      activeEvent?.teamSignup === true
        && activeEvent?.allowMatchRosterEdits === true
        && findUserManagedMatchTeam(match)
    ),
    [activeEvent?.allowMatchRosterEdits, activeEvent?.teamSignup, findUserManagedMatchTeam],
  );

  useEffect(() => {
    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    if (
      !targetEventId
      || activeEvent?.teamSignup !== true
      || activeEvent?.teamCheckInMode !== 'EVENT'
      || !isTeamCheckInOpen(activeEvent?.start)
    ) {
      return;
    }
    const managedTeam = findUserManagedEventTeam();
    const eventTeamId = normalizeIdToken(managedTeam?.$id);
    if (!managedTeam || !eventTeamId || eventTeamCheckInsById[eventTeamId]) {
      return;
    }
    const promptKey = `${targetEventId}:${eventTeamId}`;
    if (eventCheckInPromptedRef.current.has(promptKey)) {
      return;
    }
    eventCheckInPromptedRef.current.add(promptKey);
    if (window.confirm(`Check in ${managedTeam.name} for this event?`)) {
      void performTeamCheckIn('EVENT', managedTeam);
    }
  }, [
    activeEvent?.$id,
    activeEvent?.start,
    activeEvent?.teamCheckInMode,
    activeEvent?.teamSignup,
    eventId,
    eventTeamCheckInsById,
    findUserManagedEventTeam,
    isTeamCheckInOpen,
    performTeamCheckIn,
  ]);

  const hasUnsavedChangesRef = useRef(hasPendingUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasPendingUnsavedChanges;
  }, [hasPendingUnsavedChanges]);

  useEventMatchRealtime({
    hasUnsavedChangesRef,
    isBlockedForLocalEdits: Boolean(
      (canManageEvent && isEditingEvent) ||
        (isScoreModalOpen && scoreUpdateMatch) ||
        (isMatchEditorOpen && matchBeingEdited),
    ),
    isCreateMode,
    setChangesEvent,
    setChangesMatches,
    setEvent,
    setMatchBeingEdited,
    setMatches,
    setScoreUpdateMatch,
    targetEventId: activeEvent?.$id ?? eventId,
  });

  useEffect(() => {
    if (pendingSaveChangeCount === 0) {
      setIsPendingChangesPopoverOpen(false);
    }
  }, [pendingSaveChangeCount]);

  useEffect(() => {
    if (!isCreateMode || !user?.$id || isGuest) {
      setContentTermsState(null);
      setContentTermsLoading(false);
      setContentTermsModalOpen(false);
      return;
    }

    let cancelled = false;
    setContentTermsLoading(true);

    void chatService.getChatTermsConsent()
      .then((state) => {
        if (cancelled) {
          return;
        }
        setContentTermsState(state);
        setContentTermsModalOpen(!state.accepted);
      })
      .catch((loadError) => {
        console.error('Failed to load Terms and EULA consent state for event creation:', loadError);
        if (cancelled) {
          return;
        }
        setContentTermsState(null);
        setContentTermsModalOpen(true);
      })
      .finally(() => {
        if (!cancelled) {
          setContentTermsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCreateMode, isGuest, user?.$id]);

  const hydrateEvent = useCallback((loadedEvent: Event) => {
    const eventClone = cloneValue(loadedEvent) as Event;
    setEvent(eventClone);
    resetStagedMatchDrafts();

    const normalizedMatches = Array.isArray(eventClone.matches)
      ? (cloneValue(eventClone.matches) as Match[])
      : [];

    setMatches(normalizedMatches);

    setChangesEvent((prev) => {
      if (hasUnsavedChangesRef.current && prev) {
        return prev;
      }
      return cloneValue(eventClone) as Event;
    });

    setChangesMatches((prev) => {
      if (hasUnsavedChangesRef.current && prev.length) {
        return prev;
      }
      return cloneValue(normalizedMatches) as Match[];
    });
  }, []);

  const applyEventDetailBootstrap = useCallback((
    bootstrap: EventDetailBootstrapResponse,
    targetEventId: string,
    normalizedEvent: Event,
  ) => {
    applyParticipantSnapshot(
      targetEventId,
      bootstrap.participantSnapshot,
      selectedOccurrence,
      bootstrap.participantSnapshot.event ?? normalizedEvent,
    );

    const teamIdsKey = (bootstrap.participantSnapshot.participants.teamIds ?? [])
      .map((teamId) => normalizeIdToken(teamId))
      .filter((teamId): teamId is string => Boolean(teamId))
      .join('|');
    const userIdsKey = (bootstrap.participantSnapshot.participants.userIds ?? [])
      .map((userId) => normalizeIdToken(userId))
      .filter((userId): userId is string => Boolean(userId))
      .join('|');
    const currentComplianceRefreshKey = teamComplianceRefreshKeyRef.current;

    if (bootstrap.teamCompliance) {
      const byId: Record<string, TeamComplianceSummary> = {};
      (bootstrap.teamCompliance.teams ?? []).forEach((teamSummary) => {
        if (teamSummary?.teamId) {
          byId[teamSummary.teamId] = teamSummary;
        }
      });
      setTeamComplianceById(byId);
      setTeamComplianceError(null);
      setTeamComplianceLoading(false);
      loadedTeamComplianceKeyRef.current = buildComplianceSnapshotKey(
        targetEventId,
        teamIdsKey,
        selectedOccurrence,
        currentComplianceRefreshKey,
      );
    }

    if (bootstrap.userCompliance) {
      const byId: Record<string, TeamComplianceUserSummary> = {};
      (bootstrap.userCompliance.users ?? []).forEach((userSummary) => {
        if (userSummary?.userId) {
          byId[userSummary.userId] = userSummary;
        }
      });
      setUserComplianceById(byId);
      setUserComplianceError(null);
      setUserComplianceLoading(false);
      loadedUserComplianceKeyRef.current = buildComplianceSnapshotKey(
        targetEventId,
        userIdsKey,
        selectedOccurrence,
        currentComplianceRefreshKey,
      );
    }
  }, [applyParticipantSnapshot, selectedOccurrence]);

  const createButtonLabel = 'Create Event';
  const cancelButtonLabel = (() => {
    if (isCreateMode) return 'Cancel';
    if (isEditingEvent) return 'Cancel Manage';
    return `Cancel ${entityLabel}`;
  })();

  const handleAcceptContentTerms = useCallback(async () => {
    setContentTermsLoading(true);
    try {
      const state = await chatService.acceptChatTermsConsent();
      setContentTermsState(state);
      setContentTermsModalOpen(!state.accepted);

      if (user) {
        setUser({
          ...user,
          chatTermsAcceptedAt: state.acceptedAt,
          chatTermsVersion: state.version,
        });
      }
    } catch (acceptError) {
      console.error('Failed to save Terms and EULA consent for event creation:', acceptError);
      setSubmitError('Failed to record Terms and EULA consent.');
      setContentTermsModalOpen(true);
    } finally {
      setContentTermsLoading(false);
    }
  }, [setUser, user]);

  const contentTermsModal = isCreateMode ? (
    <TermsConsentModal
      open={contentTermsModalOpen}
      state={contentTermsState}
      loading={contentTermsLoading}
      onAccept={() => { void handleAcceptContentTerms(); }}
      allowClose={false}
      intro="Creating an event in BracketIQ requires agreement to the Terms and EULA."
    />
  ) : null;

  const handleEnterEditMode = useCallback(() => {
    if (!pathname) return;
    if (!canManageEvent) {
      setWarningMessage('You do not have permission to manage this event.');
      return;
    }
    setSelectedLifecycleStatus(null);
    setFormHasUnsavedChanges(false);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('mode', 'edit');
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [canManageEvent, pathname, router, searchParams]);

  const handleLifecycleStatusChange = useCallback((value: string | null) => {
    if (!value) return;

    const nextStatus = value as EventLifecycleStatus;
    setSelectedLifecycleStatus(nextStatus);
    setChangesEvent((prev) => {
      const base = prev ?? activeEvent;
      if (!base) return prev;

      const nextState = toStoredEventLifecycleState(nextStatus, base.state);

      return {
        ...base,
        state: nextState,
      } as Event;
    });
    setHasUnsavedChanges(true);
    setSubmitError(null);
    setInfoMessage(null);
    setWarningMessage(null);
  }, [activeEvent]);

  const hydrateEventFormDependencies = useCallback(async (inputEvent: Event): Promise<Event> => {
    const hydratedEvent = cloneValue(inputEvent) as Event;
    const targetEventId = normalizeIdToken(hydratedEvent.$id) ?? normalizeIdToken(eventId);

    if (
      targetEventId
      && (!Array.isArray(hydratedEvent.matches) || hydratedEvent.matches.length === 0)
    ) {
      try {
        const matchesResponse = await apiRequest<any>(`/api/events/${targetEventId}/matches`);
        if (Array.isArray(matchesResponse?.matches)) {
          hydratedEvent.matches = matchesResponse.matches.map((match: Match) => normalizeApiMatch(match));
        }
      } catch (matchesError) {
        console.error('Failed to hydrate matches for event form:', matchesError);
      }
    }

    if (
      hydratedEvent.eventType === 'LEAGUE'
      && typeof hydratedEvent.leagueScoringConfigId === 'string'
      && hydratedEvent.leagueScoringConfigId.trim().length > 0
      && (!hydratedEvent.leagueScoringConfig || typeof hydratedEvent.leagueScoringConfig !== 'object')
    ) {
      try {
        const leagueConfigResponse = await apiRequest<any>(`/api/league-scoring-configs/${hydratedEvent.leagueScoringConfigId}`);
        const leagueConfig = leagueConfigResponse?.leagueScoringConfig ?? leagueConfigResponse;
        if (leagueConfig && typeof leagueConfig === 'object') {
          hydratedEvent.leagueScoringConfig = {
            ...leagueConfig,
            $id: typeof leagueConfig.$id === 'string'
              ? leagueConfig.$id
              : typeof leagueConfig.id === 'string'
                ? leagueConfig.id
                : undefined,
          };
        }
      } catch (leagueConfigError) {
        console.error('Failed to hydrate league scoring config for event form:', leagueConfigError);
      }
    }

    const timeSlotIds = Array.isArray(hydratedEvent.timeSlotIds)
      ? Array.from(
        new Set(
          hydratedEvent.timeSlotIds
            .map((slotId) => String(slotId).trim())
            .filter((slotId) => slotId.length > 0),
        ),
      )
      : [];
    if (
      (!Array.isArray(hydratedEvent.timeSlots) || hydratedEvent.timeSlots.length === 0)
      && timeSlotIds.length > 0
    ) {
      try {
        const timeSlotsResponse = await apiRequest<{ timeSlots?: Array<Record<string, unknown>> }>(
          `/api/time-slots?ids=${timeSlotIds.join(',')}`,
        );
        if (Array.isArray(timeSlotsResponse?.timeSlots)) {
          hydratedEvent.timeSlots = timeSlotsResponse.timeSlots.map((row) => {
            const slot = row as Record<string, unknown>;
            const slotId = normalizeIdToken(slot.$id ?? slot.id) ?? createClientId();
            const rawFieldIds = Array.isArray(slot.scheduledFieldIds)
              ? slot.scheduledFieldIds
              : typeof slot.scheduledFieldId === 'string'
                ? [slot.scheduledFieldId]
                : [];
            const scheduledFieldIds = Array.from(
              new Set(
                rawFieldIds
                  .map((fieldId) => String(fieldId).trim())
                  .filter((fieldId) => fieldId.length > 0),
              ),
            );
            const rawDays = Array.isArray(slot.daysOfWeek)
              ? slot.daysOfWeek
              : typeof slot.dayOfWeek === 'number'
                ? [slot.dayOfWeek]
                : [];
            const daysOfWeek = Array.from(
              new Set(
                rawDays
                  .map((day) => Number(day))
                  .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
              ),
            ) as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;

            return {
              ...(slot as unknown as TimeSlot),
              $id: slotId,
              dayOfWeek: daysOfWeek[0] ?? (typeof slot.dayOfWeek === 'number' ? slot.dayOfWeek as TimeSlot['dayOfWeek'] : undefined),
              daysOfWeek,
              scheduledFieldId:
                scheduledFieldIds[0]
                ?? (typeof slot.scheduledFieldId === 'string' ? slot.scheduledFieldId : undefined),
              scheduledFieldIds,
              divisions: Array.isArray(slot.divisions)
                ? Array.from(
                  new Set(
                    slot.divisions
                      .map((division) => String(division).trim().toLowerCase())
                      .filter((division) => division.length > 0),
                  ),
                )
                : [],
              repeating: slot.repeating === undefined ? true : Boolean(slot.repeating),
            } as TimeSlot;
          });
        }
      } catch (timeSlotsError) {
        console.error('Failed to hydrate time slots for event form:', timeSlotsError);
      }
    }

    const fieldIdsFromEvent = Array.isArray(hydratedEvent.fieldIds)
      ? hydratedEvent.fieldIds.map((fieldId) => String(fieldId).trim()).filter((fieldId) => fieldId.length > 0)
      : [];
    const fieldIdsFromSlots = Array.isArray(hydratedEvent.timeSlots)
      ? hydratedEvent.timeSlots.flatMap((slot) => {
        const fromList = Array.isArray(slot.scheduledFieldIds)
          ? slot.scheduledFieldIds
          : [];
        if (fromList.length > 0) {
          return fromList.map((fieldId) => String(fieldId).trim()).filter((fieldId) => fieldId.length > 0);
        }
        return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.trim().length > 0
          ? [slot.scheduledFieldId.trim()]
          : [];
      })
      : [];
    const fieldIdsToHydrate = Array.from(new Set([...fieldIdsFromEvent, ...fieldIdsFromSlots]));
    if (
      (!Array.isArray(hydratedEvent.fields) || hydratedEvent.fields.length === 0)
      && fieldIdsToHydrate.length > 0
    ) {
      try {
        const fieldsResponse = await apiRequest<{ fields?: Array<Record<string, unknown>> }>(
          `/api/fields?ids=${fieldIdsToHydrate.join(',')}`,
        );
        if (Array.isArray(fieldsResponse?.fields)) {
          hydratedEvent.fields = fieldsResponse.fields as unknown as Field[];
        }
      } catch (fieldsError) {
        console.error('Failed to hydrate fields for event form:', fieldsError);
      }
    }

    if (Array.isArray(hydratedEvent.matches) && Array.isArray(hydratedEvent.fields) && hydratedEvent.fields.length > 0) {
      const fieldsById = new Map<string, Field>(
        hydratedEvent.fields
          .filter((field): field is Field => Boolean(field?.$id))
          .map((field) => [field.$id, field]),
      );
      hydratedEvent.matches = hydratedEvent.matches.map((match) => {
        const normalizedMatch = normalizeApiMatch(match);
        if (normalizedMatch.field && typeof normalizedMatch.field === 'object') {
          return normalizedMatch;
        }
        const fieldId = normalizeIdToken(normalizedMatch.fieldId);
        if (!fieldId) {
          return normalizedMatch;
        }
        const field = fieldsById.get(fieldId);
        if (!field) {
          return normalizedMatch;
        }
        return {
          ...normalizedMatch,
          field,
        };
      });
    }

    let sports: Sport[] = [];
    try {
      sports = await sportsService.getAll();
    } catch (sportsError) {
      console.error('Failed to pre-load sports for event form:', sportsError);
    }

    const sportsById = new Map<string, Sport>(
      sports
        .filter((sport): sport is Sport => Boolean(sport?.$id))
        .map((sport) => [sport.$id, sport]),
    );

    const resolvedSportId = normalizeIdToken(
      hydratedEvent.sportId
      || (typeof hydratedEvent.sport === 'string' ? hydratedEvent.sport : (hydratedEvent.sport as Sport | undefined)?.$id),
    );
    const resolvedSport = resolvedSportId ? sportsById.get(resolvedSportId) ?? null : null;
    if (resolvedSport) {
      hydratedEvent.sport = resolvedSport;
      hydratedEvent.sportId = resolvedSport.$id;
    }

    const hydrateAssignedUsers = async (
      ids: unknown,
      existingUsers: unknown,
    ): Promise<{ ids: string[]; users: UserData[] }> => {
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(ids) ? ids : [])
            .map((value) => normalizeIdToken(value))
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const usersById = new Map<string, UserData>();
      if (Array.isArray(existingUsers)) {
        existingUsers.forEach((candidate) => {
          if (candidate && typeof candidate === 'object' && '$id' in candidate) {
            const candidateId = normalizeIdToken((candidate as UserData).$id);
            if (candidateId) {
              usersById.set(candidateId, candidate as UserData);
            }
          }
        });
      }

      const missingIds = normalizedIds.filter((id) => !usersById.has(id));
      if (missingIds.length > 0) {
        try {
          const fetchedUsers = await userService.getUsersByIds(missingIds);
          fetchedUsers.forEach((candidate) => {
            const candidateId = normalizeIdToken(candidate?.$id);
            if (candidateId) {
              usersById.set(candidateId, candidate);
            }
          });
        } catch (usersError) {
          console.error('Failed to hydrate assigned users for event form:', usersError);
        }
      }

      return {
        ids: normalizedIds,
        users: normalizedIds
          .map((id) => usersById.get(id))
          .filter((candidate): candidate is UserData => Boolean(candidate)),
      };
    };

    const normalizedOfficials = await hydrateAssignedUsers(hydratedEvent.officialIds, hydratedEvent.officials);
    hydratedEvent.officialIds = normalizedOfficials.ids;
    hydratedEvent.officials = normalizedOfficials.users;

    const normalizedAssistantHosts = await hydrateAssignedUsers(hydratedEvent.assistantHostIds, hydratedEvent.assistantHosts);
    hydratedEvent.assistantHostIds = normalizedAssistantHosts.ids;
    hydratedEvent.assistantHosts = normalizedAssistantHosts.users;

    if (hydratedEvent.eventType === 'LEAGUE') {
      const allowedSetCounts = [1, 3, 5];
      const source = hydratedEvent.leagueConfig ?? hydratedEvent;
      const matchDurationMinutes = Number.isFinite(Number(source.matchDurationMinutes))
        ? Math.max(1, Math.trunc(Number(source.matchDurationMinutes)))
        : 60;
      const restTimeMinutes = Number.isFinite(Number(source.restTimeMinutes))
        ? Math.max(0, Math.trunc(Number(source.restTimeMinutes)))
        : 0;
      const usesSets = Boolean(resolvedSport?.usePointsPerSetWin);

      let setsPerMatch: number | undefined;
      let setDurationMinutes: number | undefined;
      let pointsToVictory: number[] | undefined;

      if (usesSets) {
        const rawSetsPerMatch = Number(source.setsPerMatch);
        setsPerMatch = allowedSetCounts.includes(rawSetsPerMatch) ? rawSetsPerMatch : 1;
        setDurationMinutes = Number.isFinite(Number(source.setDurationMinutes))
          ? Math.max(1, Math.trunc(Number(source.setDurationMinutes)))
          : 20;
        const seedPoints = Array.isArray(source.pointsToVictory)
          ? source.pointsToVictory
          : [];
        const normalizedPoints = seedPoints
          .slice(0, setsPerMatch)
          .map((value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 21;
          });
        while (normalizedPoints.length < setsPerMatch) {
          normalizedPoints.push(21);
        }
        pointsToVictory = normalizedPoints;
      }

      const normalizedLeagueConfig: LeagueConfig = {
        gamesPerOpponent: Number.isFinite(Number(source.gamesPerOpponent))
          ? Math.max(1, Math.trunc(Number(source.gamesPerOpponent)))
          : 1,
        includePlayoffs: Boolean(source.includePlayoffs),
        playoffTeamCount: Number.isFinite(Number(source.playoffTeamCount))
          ? Math.max(2, Math.trunc(Number(source.playoffTeamCount)))
          : undefined,
        usesSets,
        matchDurationMinutes,
        restTimeMinutes,
        setDurationMinutes,
        setsPerMatch,
        pointsToVictory,
      };

      hydratedEvent.leagueConfig = normalizedLeagueConfig;
      hydratedEvent.usesSets = normalizedLeagueConfig.usesSets;
      hydratedEvent.matchDurationMinutes = normalizedLeagueConfig.matchDurationMinutes;
      hydratedEvent.restTimeMinutes = normalizedLeagueConfig.restTimeMinutes;
      hydratedEvent.setDurationMinutes = normalizedLeagueConfig.setDurationMinutes;
      hydratedEvent.setsPerMatch = normalizedLeagueConfig.setsPerMatch;
      hydratedEvent.pointsToVictory = normalizedLeagueConfig.pointsToVictory;
    }

    const organizationId = normalizeIdToken(
      hydratedEvent.organizationId
      || (typeof hydratedEvent.organization === 'string'
        ? hydratedEvent.organization
        : (hydratedEvent.organization as Organization | undefined)?.$id),
    );
    if (organizationId) {
      try {
        const resolvedOrganization = await (
          organizationService.getOrganizationByIdForEventForm
            ? organizationService.getOrganizationByIdForEventForm(organizationId)
            : organizationService.getOrganizationById(organizationId, true)
        );
        if (resolvedOrganization) {
          hydratedEvent.organization = resolvedOrganization;
        }
      } catch (organizationError) {
        console.error('Failed to hydrate event organization for event form:', organizationError);
      }
    }

    return hydratedEvent;
  }, [eventId, resetStagedMatchDrafts]);

  // Kick off schedule loading once auth state is resolved or redirect unauthenticated users.
  // Hydrate event + match data from the API and sync local component state.
  const loadSchedule = useCallback(async ({
    showPageLoader = true,
    clearMessages = true,
  }: {
    showPageLoader?: boolean;
    clearMessages?: boolean;
  } = {}) => {
    if (!eventId) return;
    if (isCreateMode) {
      setLoading(false);
      setError(null);
      return;
    }

    if (showPageLoader) {
      setLoading(true);
    }
    setError(null);
    if (clearMessages) {
      setInfoMessage(null);
      setWarningMessage(null);
    }

    try {
      const bootstrap = await eventService.getEventDetailBootstrap(eventId, selectedOccurrence ?? undefined, {
        manage: user?.$id ? 'auto' : false,
      });
      let fetchedEvent = bootstrap?.event ?? await eventService.getEventWithRelations(eventId);
      if (!fetchedEvent) {
        const response = await apiRequest<any>(`/api/events/${eventId}`);
        const responseEvent = response?.event ?? response;
        fetchedEvent = normalizeApiEvent(responseEvent ?? null) ?? undefined;
      }
      if (!fetchedEvent) {
        setError('League not found.');
        return;
      }
      const normalizedEvent = await hydrateEventFormDependencies(fetchedEvent);
      hydrateEvent(normalizedEvent);
      if (bootstrap) {
        applyEventDetailBootstrap(bootstrap, eventId, normalizedEvent);
      }
      if (!hasUnsavedChangesRef.current) {
        setHasUnsavedChanges(false);
        setFormHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      setError(formatActionErrorMessage('Failed to load league schedule. Please try again.', err));
    } finally {
      if (showPageLoader) {
        setLoading(false);
      }
    }
  }, [
    applyEventDetailBootstrap,
    eventId,
    hydrateEvent,
    hydrateEventFormDependencies,
    isCreateMode,
    selectedOccurrence,
    user?.$id,
  ]);

  const agentDraftScheduleContext = useMemo(() => {
    const fieldsById = new Map<string, Field>();
    if (Array.isArray(activeEvent?.fields)) {
      activeEvent.fields.forEach((field) => {
        const fieldId = normalizeIdToken(field?.$id);
        if (fieldId) {
          fieldsById.set(fieldId, field);
        }
      });
    }

    const resolveFieldName = (fieldId: string | null | undefined, relation: Field | undefined): string | null => {
      const normalizedFieldId = normalizeIdToken(relation?.$id) ?? normalizeIdToken(fieldId);
      const field = relation ?? (normalizedFieldId ? fieldsById.get(normalizedFieldId) : undefined);
      return field ? getFieldDisplayName(field, '') || field.name || null : null;
    };
    const resolveTeamName = (teamId: string | null | undefined, relation: Team | undefined): string | null => {
      if (relation?.name) {
        return relation.name;
      }
      const normalizedTeamId = normalizeIdToken(teamId);
      if (!normalizedTeamId) {
        return null;
      }
      return participantTeamsById.get(normalizedTeamId)?.name ?? teamsById.get(normalizedTeamId)?.name ?? null;
    };
    const pendingSummary = pendingSaveChanges
      .slice(0, 12)
      .map((item) => `${item.label}${item.detail ? `: ${item.detail}` : ''}`);

    return {
      pendingChanges: {
        hasChanges: hasPendingUnsavedChanges,
        count: pendingSaveChanges.length,
        summary: pendingSummary,
      },
      draftSchedule: {
        source: usingChangeCopies ? 'draft' as const : 'saved' as const,
        totalMatches: activeMatches.length,
        truncated: activeMatches.length > 120,
        matches: activeMatches.slice(0, 120).map((match) => {
          const fieldId = normalizeIdToken(match.field?.$id) ?? normalizeIdToken(match.fieldId);
          const team1Id = normalizeIdToken(match.team1?.$id) ?? normalizeIdToken(match.team1Id);
          const team2Id = normalizeIdToken(match.team2?.$id) ?? normalizeIdToken(match.team2Id);
          return {
            id: match.$id,
            displayNumber: typeof match.matchId === 'number' ? match.matchId : null,
            start: match.start ?? null,
            end: match.end ?? null,
            fieldId,
            fieldName: resolveFieldName(fieldId, match.field),
            team1Id,
            team1Name: resolveTeamName(team1Id, match.team1),
            team2Id,
            team2Name: resolveTeamName(team2Id, match.team2),
            officialId: normalizeIdToken(match.official?.$id) ?? normalizeIdToken(match.officialId),
            locked: Boolean(match.locked),
            division: normalizeIdToken(getDivisionId(match.division)) ?? (typeof match.division === 'string' ? match.division : null),
          };
        }),
      },
    };
  }, [
    activeEvent?.fields,
    activeMatches,
    hasPendingUnsavedChanges,
    participantTeamsById,
    pendingSaveChanges,
    teamsById,
    usingChangeCopies,
  ]);

  useEffect(() => {
    const contextEventId = activeEventId ?? eventId ?? null;
    if (!contextEventId) {
      setActivePageContext(null);
      return;
    }

    setActivePageContext({
      kind: 'event_schedule',
      title: 'Event schedule',
      eventId: contextEventId,
      eventName: activeEvent?.name ?? null,
      eventType: activeEvent?.eventType ?? null,
      activeTab,
      selectedOccurrence,
      canManageEvent,
      canEditMatches,
      hasUnsavedChanges: hasPendingUnsavedChanges,
      matchCount: activeMatches.length,
      participantCount: participantUsers.length,
      teamCount: participantTeams.length,
      pendingChanges: agentDraftScheduleContext.pendingChanges,
      draftSchedule: agentDraftScheduleContext.draftSchedule,
    });

    return () => {
      setActivePageContext(null);
    };
  }, [
    activeEvent?.eventType,
    activeEvent?.name,
    activeEventId,
    activeMatches.length,
    activeTab,
    agentDraftScheduleContext,
    canEditMatches,
    canManageEvent,
    eventId,
    hasPendingUnsavedChanges,
    participantTeams.length,
    participantUsers.length,
    selectedOccurrence,
    setActivePageContext,
  ]);

  useEffect(() => {
    registerRefreshHandler(async () => {
      await loadSchedule({ showPageLoader: false, clearMessages: false });
      const contextEventId = activeEventId ?? eventId;
      if (contextEventId) {
        await refreshParticipantTeamsFromServer(contextEventId, selectedOccurrence ?? undefined).catch((refreshError) => {
          console.warn('Failed to refresh participants after AI action:', refreshError);
        });
      }
    });

    return () => {
      registerRefreshHandler(null);
    };
  }, [
    activeEventId,
    eventId,
    loadSchedule,
    refreshParticipantTeamsFromServer,
    registerRefreshHandler,
    selectedOccurrence,
  ]);

  useEffect(() => {
    if (!eventId || authLoading) {
      return;
    }

    if (!isAuthenticated && !isGuest) {
      router.push('/login');
      return;
    }

    loadSchedule();
  }, [authLoading, eventId, isAuthenticated, isGuest, isPreview, loadSchedule, router]);

  useEffect(() => {
    let cancelled = false;
    const sessionUserId = authUser?.$id ?? user?.$id ?? null;

    const checkRazumlyAdminAccess = async () => {
      if (!isAuthenticated || isGuest || !sessionUserId) {
        if (!cancelled) {
          setIsRazumlyAdmin(false);
        }
        return;
      }

      try {
        const response = await apiRequest<{ allowed?: boolean }>('/api/admin/access');
        if (!cancelled) {
          setIsRazumlyAdmin(Boolean(response?.allowed));
        }
      } catch {
        if (!cancelled) {
          setIsRazumlyAdmin(false);
        }
      }
    };

    void checkRazumlyAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [authUser?.$id, isAuthenticated, isGuest, user?.$id]);

  const playoffMatches = useMemo(
    () =>
      activeMatches.filter((match) =>
        Boolean(
          match.previousLeftId ||
          match.previousRightId ||
          match.winnerNextMatchId ||
          match.loserNextMatchId,
        ),
      ),
    [activeMatches],
  );

  const playoffMatchesMap = useMemo<Record<string, Match> | null>(() => {
    if (!playoffMatches.length) {
      return null;
    }

    const map = playoffMatches.reduce<Record<string, Match>>((acc, match) => {
      acc[match.$id] = { ...match };
      return acc;
    }, {});

    Object.values(map).forEach((match) => {
      if (match.winnerNextMatchId && map[match.winnerNextMatchId]) {
        match.winnerNextMatch = map[match.winnerNextMatchId];
      }
      if (match.loserNextMatchId && map[match.loserNextMatchId]) {
        match.loserNextMatch = map[match.loserNextMatchId];
      }
      if (match.previousLeftId && map[match.previousLeftId]) {
        match.previousLeftMatch = map[match.previousLeftId];
      }
      if (match.previousRightId && map[match.previousRightId]) {
        match.previousRightMatch = map[match.previousRightId];
      }
    });

    return map;
  }, [playoffMatches]);

  const playoffRootMatches = useMemo<Match[]>(() => {
    if (!playoffMatchesMap) {
      return [];
    }

    return getBracketRootMatches(playoffMatchesMap);
  }, [playoffMatchesMap]);

  const bracketDivisionOptions = useMemo<DivisionOption[]>(() => {
    if (tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.length > 0) {
      return tournamentBracketDivisionOptions;
    }

    const matchDivisionOptions = playoffMatchesMap
      ? buildBracketDivisionOptions(playoffMatchesMap, {
          labelByDivisionKey: divisionLabelsByKey,
          resolveLabel: (match, divisionId) => getMatchDivisionLabel(match) ?? divisionId,
        })
      : [];

    return matchDivisionOptions;
  }, [
    divisionLabelsByKey,
    playoffMatchesMap,
    tournamentBracketDivisionOptions,
    tournamentPoolPlayEnabled,
  ]);

  useEffect(() => {
    if (bracketDivisionOptions.length === 0) {
      if (selectedBracketDivision !== null) {
        setSelectedBracketDivision(null);
      }
      return;
    }

    if (
      selectedBracketDivision &&
      bracketDivisionOptions.some((option) => option.value === selectedBracketDivision)
    ) {
      return;
    }

    setSelectedBracketDivision(bracketDivisionOptions[0].value);
  }, [bracketDivisionOptions, selectedBracketDivision]);

  const selectedBracketRootMatch = useMemo(() => {
    if (playoffRootMatches.length === 0) {
      return null;
    }

    const rootsForDivision = selectedBracketDivision
      ? playoffRootMatches.filter(
          (match) => toDivisionKey(getMatchDivisionId(match)) === selectedBracketDivision,
        )
      : playoffRootMatches;

    return pickPreferredRootMatch(rootsForDivision);
  }, [playoffRootMatches, selectedBracketDivision]);

  const bracketMatchesMap = useMemo<Record<string, Match> | null>(() => {
    if (!playoffMatchesMap || !selectedBracketRootMatch) {
      return null;
    }

    const connectedMatchIds = collectConnectedMatchIds(playoffMatchesMap, selectedBracketRootMatch.$id);
    if (connectedMatchIds.size === 0) {
      return null;
    }

    return Array.from(connectedMatchIds).reduce<Record<string, Match>>((acc, matchId) => {
      const match = playoffMatchesMap[matchId];
      if (match) {
        acc[matchId] = match;
      }
      return acc;
    }, {});
  }, [playoffMatchesMap, selectedBracketRootMatch]);

  const playoffMatchIds = useMemo(() => new Set(playoffMatches.map((match) => match.$id)), [playoffMatches]);

  const leagueScoring = useMemo(
    () =>
      createLeagueScoringConfig(
        activeEvent && typeof activeEvent.leagueScoringConfig === 'object'
          ? activeEvent.leagueScoringConfig
          : null,
      ),
    [activeEvent],
  );

  const baseStandings = useMemo<StandingsRow[]>(() => {
    if (!activeEvent) {
      return [];
    }

    const selectedDivisionKey = toDivisionKey(selectedStandingsDataDivision);
    const selectedDivisionTeamIds = new Set<string>();
    const divisionSources = Array.isArray(activeEvent.divisionDetails)
      ? activeEvent.divisionDetails
      : Array.isArray(activeEvent.divisions)
        ? activeEvent.divisions
        : [];
    if (selectedDivisionKey) {
      divisionSources.forEach((division) => {
        if (toDivisionKey(getDivisionId(division)) !== selectedDivisionKey) {
          return;
        }
        getDivisionTeamIds(division).forEach((teamId) => selectedDivisionTeamIds.add(teamId));
      });
    }

    const teamsArray = Array.isArray(activeEvent.teams) ? (activeEvent.teams as Team[]) : [];
    const teamsById = new Map<string, Team>();
    teamsArray.forEach((team) => {
      if (team?.$id) {
        const teamDivisionId = getDivisionId(team.division);
        if (!teamBelongsToSelectedStandingsDivision({
          selectedDivisionId: selectedStandingsDataDivision,
          selectedDivisionTeamIds,
          teamId: team.$id,
          teamDivisionId,
        })) {
          return;
        }
        teamsById.set(team.$id, team);
      }
    });

    const rows = new Map<string, StandingsRow>();
    const ensureRow = (teamId: string, team?: Team | null): StandingsRow | null => {
      if (!teamId) {
        return null;
      }
      if (team && !teamsById.has(teamId)) {
        teamsById.set(teamId, team);
      }
      if (!rows.has(teamId)) {
        const resolved = team ?? teamsById.get(teamId) ?? null;
        rows.set(teamId, {
          teamId,
          teamName: resolved?.name || `Team ${teamId.slice(0, 6)}`,
          wins: 0,
          losses: 0,
          draws: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          matchesPlayed: 0,
          points: 0,
        });
      }
      return rows.get(teamId) ?? null;
    };

    teamsById.forEach((team, teamId) => {
      ensureRow(teamId, team);
    });

    activeMatches.forEach((match) => {
      if (playoffMatchIds.has(match.$id)) {
        return;
      }
      if (selectedDivisionKey && toDivisionKey(getMatchDivisionId(match)) !== selectedDivisionKey) {
        return;
      }

      const team1Id =
        (match.team1 && typeof match.team1 === 'object' && '$id' in match.team1
          ? match.team1.$id
          : undefined) ?? (typeof match.team1Id === 'string' ? match.team1Id : null);
      const team2Id =
        (match.team2 && typeof match.team2 === 'object' && '$id' in match.team2
          ? match.team2.$id
          : undefined) ?? (typeof match.team2Id === 'string' ? match.team2Id : null);

      if (!team1Id || !team2Id) {
        return;
      }

      const team1 = (match.team1 as Team | undefined) ?? teamsById.get(team1Id) ?? null;
      const team2 = (match.team2 as Team | undefined) ?? teamsById.get(team2Id) ?? null;

      const row1 = ensureRow(team1Id, team1);
      const row2 = ensureRow(team2Id, team2);
      if (!row1 || !row2) {
        return;
      }

      const result = deriveStandingsMatchResult(match);
      if (!result.outcome) {
        return;
      }

      row1.goalsFor += result.team1Total;
      row1.goalsAgainst += result.team2Total;
      row2.goalsFor += result.team2Total;
      row2.goalsAgainst += result.team1Total;
      row1.matchesPlayed += 1;
      row2.matchesPlayed += 1;

      if (result.outcome === 'team1') {
        row1.wins += 1;
        row2.losses += 1;
        row1.points += leagueScoring.pointsForWin;
        row2.points += leagueScoring.pointsForLoss;
      } else if (result.outcome === 'team2') {
        row2.wins += 1;
        row1.losses += 1;
        row2.points += leagueScoring.pointsForWin;
        row1.points += leagueScoring.pointsForLoss;
      } else {
        row1.draws += 1;
        row2.draws += 1;
        row1.points += leagueScoring.pointsForDraw;
        row2.points += leagueScoring.pointsForDraw;
      }
    });

    rows.forEach((row) => {
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      row.basePoints = row.points;
      row.finalPoints = row.points;
      row.pointsDelta = 0;
    });

    const localRows = Array.from(rows.values()).map((row) => ({ ...row }));
    const serverRows = standingsDivisionData?.standings.map((row) => ({
      teamId: row.teamId,
      teamName: row.teamName,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      matchesPlayed: row.matchesPlayed,
      points: row.finalPoints,
      basePoints: row.basePoints,
      finalPoints: row.finalPoints,
      pointsDelta: row.pointsDelta,
    })) ?? [];

    if (shouldUseServerStandingsRows({
      selectedDivisionId: selectedStandingsDataDivision,
      loadedDivisionId: standingsDivisionData?.divisionId ?? null,
      localRowCount: localRows.length,
      serverRowCount: serverRows.length,
    })) {
      return serverRows;
    }

    return localRows;
  }, [
    activeEvent,
    activeMatches,
    leagueScoring,
    playoffMatchIds,
    selectedStandingsDataDivision,
    standingsDivisionData,
  ]);

  const getDraftStandingsPoints = useCallback(
    (row: StandingsRow): { basePoints: number; finalPoints: number; pointsDelta: number } => {
      const basePoints = typeof row.basePoints === 'number' ? row.basePoints : row.points;
      const hasDraftOverride = Object.prototype.hasOwnProperty.call(standingsDraftOverrides, row.teamId);
      const draftOverride = hasDraftOverride ? standingsDraftOverrides[row.teamId] : undefined;
      const finalPoints = typeof draftOverride === 'number' && Number.isFinite(draftOverride)
        ? draftOverride
        : (typeof row.finalPoints === 'number' ? row.finalPoints : row.points);
      return {
        basePoints,
        finalPoints,
        pointsDelta: finalPoints - basePoints,
      };
    },
    [standingsDraftOverrides],
  );

  const standings = useMemo<RankedStandingsRow[]>(() => {
    if (baseStandings.length === 0) {
      return [];
    }

    const sorted = baseStandings.map((row) => {
      const points = getDraftStandingsPoints(row);
      return {
        ...row,
        points: points.finalPoints,
        basePoints: points.basePoints,
        finalPoints: points.finalPoints,
        pointsDelta: points.pointsDelta,
      };
    });
    const modifier = standingsSort.direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let comparison: number;
      switch (standingsSort.field) {
        case 'team':
          comparison = a.teamName.localeCompare(b.teamName);
          break;
        case 'wins':
          comparison = a.wins - b.wins;
          break;
        case 'losses':
          comparison = a.losses - b.losses;
          break;
        case 'draws':
          comparison = a.draws - b.draws;
          break;
        case 'points':
        default:
          comparison = a.points - b.points;
          break;
      }

      if (comparison !== 0) {
        return comparison * modifier;
      }

      const tieBreakers = [
        (x: StandingsRow, y: StandingsRow) => y.points - x.points,
        (x: StandingsRow, y: StandingsRow) => y.goalDifference - x.goalDifference,
        (x: StandingsRow, y: StandingsRow) => y.goalsFor - x.goalsFor,
        (x: StandingsRow, y: StandingsRow) => x.teamName.localeCompare(y.teamName),
      ];

      for (const tie of tieBreakers) {
        const result = tie(a, b);
        if (result !== 0) {
          return result;
        }
      }

      return 0;
    });

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [baseStandings, getDraftStandingsPoints, standingsSort]);

  const hasRecordedMatches = standings.some((row) => row.matchesPlayed > 0);
  const resolvedMatchTeams = useMemo(() => {
    const teamsById = new Map<string, Team>();
    const addTeam = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const teamCandidate = candidate as Team & { id?: string };
      const teamId = normalizeIdToken(teamCandidate.$id ?? teamCandidate.id);
      if (!teamId || teamsById.has(teamId)) {
        return;
      }
      teamsById.set(teamId, {
        ...teamCandidate,
        $id: teamId,
      } as Team);
    };

    participantTeams.forEach(addTeam);
    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach(addTeam);
    }
    activeMatches.forEach((match) => {
      addTeam(match.team1);
      addTeam(match.team2);
      addTeam(match.teamOfficial);
    });

    return Array.from(teamsById.values());
  }, [participantTeams, activeEvent?.teams, activeMatches]);

  const bracketOfficials = useMemo<UserData[]>(() => {
    const officialsById = new Map<string, UserData>();
    const addOfficial = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const officialCandidate = candidate as UserData & { id?: string };
      const officialId = normalizeIdToken(officialCandidate.$id ?? officialCandidate.id);
      if (!officialId || officialsById.has(officialId)) {
        return;
      }
      officialsById.set(officialId, {
        ...officialCandidate,
        $id: officialId,
      } as UserData);
    };

    if (Array.isArray(activeEvent?.officials)) {
      activeEvent.officials.forEach(addOfficial);
    }
    participantOfficials.forEach(addOfficial);
    activeMatches.forEach((match) => addOfficial(match.official));

    return Array.from(officialsById.values());
  }, [activeEvent?.officials, participantOfficials, activeMatches]);

  const bracketData = useMemo<TournamentBracket | null>(() => {
    if (!activeEvent || !bracketMatchesMap) {
      return null;
    }

    return {
      tournament: {
        ...activeEvent,
        officials: bracketOfficials,
      },
      matches: bracketMatchesMap,
      teams: resolvedMatchTeams,
      isHost: canManageEvent,
      canManage: !isPreview && canManageEvent,
    };
  }, [activeEvent, bracketMatchesMap, resolvedMatchTeams, canManageEvent, isPreview, bracketOfficials]);

  const scheduleDivisionSelectData = useMemo<DivisionOption[]>(
    () => [{ value: 'all', label: 'All divisions' }, ...effectiveScheduleDivisionOptions],
    [effectiveScheduleDivisionOptions],
  );
  const schedulePoolSelectData = useMemo<DivisionOption[]>(
    () => [{ value: 'all', label: 'All pools' }, ...schedulePoolOptions],
    [schedulePoolOptions],
  );
  const shouldShowScheduleDivisionFilter = !isWeeklyParentEvent && effectiveScheduleDivisionOptions.length > 1;
  const shouldShowSchedulePoolFilter = !isWeeklyParentEvent
    && tournamentPoolPlayEnabled
    && selectedScheduleDivision !== 'all'
    && schedulePoolOptions.length > 0;
  const shouldShowStandingsPoolFilter = !isWeeklyParentEvent && tournamentPoolPlayEnabled && standingsPoolOptions.length > 0;
  const shouldShowBracketDivisionFilter = bracketDivisionOptions.length > 1;

  const showScheduleTab = isLeague || isTournament || isWeeklyParentEvent;
  const showStandingsTab = standingsEventEnabled;
  const showParticipantsTab = !isTemplateEvent
    && Boolean(
      isWeeklyParentEvent
      || activeEvent?.teamSignup === true
      || isLeague
      || isTournament
      || (!isCreateMode && activeEvent?.eventType === 'EVENT' && activeEvent?.teamSignup === false)
      || participantTeamIds.length > 0
      || participantUserIds.length > 0,
    );
  const financeOrganizationId = normalizeIdToken(activeEvent?.organizationId) ?? normalizeIdToken(activeOrganization?.$id);
  const showFinanceTab = Boolean(!isCreateMode && !isTemplateEvent && canManageEvent && financeOrganizationId);
  const selectedComplianceSummary = selectedComplianceTeamId
    ? teamComplianceById[selectedComplianceTeamId] ?? null
    : null;
  const selectedComplianceTeam = useMemo(() => {
    if (!selectedComplianceTeamId) {
      return null;
    }
    return participantTeamsById.get(selectedComplianceTeamId)
      ?? (Array.isArray(activeEvent?.teams)
        ? activeEvent.teams.find((team) => team?.$id === selectedComplianceTeamId) ?? null
        : null);
  }, [activeEvent?.teams, participantTeamsById, selectedComplianceTeamId]);

  const renderParticipantTeamCard = ({
    cardKey,
    team,
    actions,
    className = '',
    showComplianceDetails = canUseTeamCompliance,
    showTeamMetadata = false,
    enableDetailsView = true,
    fullWidth = false,
  }: {
    cardKey: string;
    team: Team;
    actions?: React.ReactNode;
    className?: string;
    showComplianceDetails?: boolean;
    showTeamMetadata?: boolean;
    enableDetailsView?: boolean;
    fullWidth?: boolean;
  }) => {
    const eventTeamId = normalizeIdToken(team.$id ?? (team as any).id);
    const checkInBadge = activeEvent?.teamCheckInMode === 'EVENT' && eventTeamId
      ? (
        <Badge
          color={eventTeamCheckInsById[eventTeamId] ? 'green' : 'gray'}
          variant="light"
        >
          {eventTeamCheckInsById[eventTeamId] ? 'Checked in' : 'Not checked in'}
        </Badge>
      )
      : null;
    const mergedActions = checkInBadge || actions
      ? (
        <Group gap="xs" wrap="wrap">
          {checkInBadge}
          {actions}
        </Group>
      )
      : undefined;
    if (isEditingEvent) {
      return (
        <DivisionTeamComplianceCard
          key={cardKey}
          team={team}
          summary={showComplianceDetails ? teamComplianceById[team.$id] : undefined}
          loading={showComplianceDetails ? teamComplianceLoading : false}
          showComplianceDetails={showComplianceDetails}
          showTeamMetadata={showTeamMetadata}
          className={className}
          fullWidth={fullWidth}
          onClick={showComplianceDetails ? () => {
            setSelectedComplianceTeamId(team.$id);
          } : undefined}
          actions={mergedActions}
        />
      );
    }

    const teamCardActions = mergedActions
      ? (
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {mergedActions}
        </div>
      )
      : undefined;

    return (
      <TeamCard
        key={cardKey}
        team={team}
        className={className}
        showTeamMetadata={showTeamMetadata}
        actions={teamCardActions}
        actionsPlacement="below"
        onClick={enableDetailsView
          ? () => {
            setSelectedParticipantTeam(team);
          }
          : undefined}
      />
    );
  };

  const toParticipantDisplayName = useCallback((participant: UserData): string => (
    participant.fullName
    || `${participant.firstName ?? ''} ${participant.lastName ?? ''}`.trim()
    || participant.userName
    || participant.$id
  ), []);

  const toUserParticipantPseudoTeam = useCallback((participant: UserData): Team => ({
    $id: participant.$id,
    name: toParticipantDisplayName(participant),
    division: 'Participant',
    sport: typeof activeEvent?.sport === 'object' ? activeEvent.sport.name : '',
    playerIds: [participant.$id],
    captainId: participant.$id,
    pending: [],
    teamSize: 1,
    currentSize: 1,
    isFull: true,
    avatarUrl: '',
  }), [activeEvent?.sport, toParticipantDisplayName]);

  const renderParticipantUserCard = ({
    cardKey,
    participant,
    actions,
    className = '',
    fullWidth = false,
  }: {
    cardKey: string;
    participant: UserData;
    actions?: React.ReactNode;
    className?: string;
    fullWidth?: boolean;
  }) => {
    const pseudoTeam = toUserParticipantPseudoTeam(participant);
    const userSummary = userComplianceById[participant.$id];
    const summaryForCard: TeamComplianceSummary | undefined = userSummary
      ? {
          teamId: participant.$id,
          teamName: toParticipantDisplayName(participant),
          payment: userSummary.payment,
          documents: userSummary.documents,
          users: [userSummary],
        }
      : undefined;

    if (isEditingEvent) {
      return (
        <DivisionTeamComplianceCard
          key={cardKey}
          team={pseudoTeam}
          summary={canUseUserCompliance ? summaryForCard : undefined}
          loading={canUseUserCompliance ? userComplianceLoading : false}
          showComplianceDetails={canUseUserCompliance}
          cardKind="participant"
          className={className}
          fullWidth={fullWidth}
          actions={actions}
        />
      );
    }

    return (
      <UserCard
        key={cardKey}
        user={participant}
        className={className}
        actions={actions}
      />
    );
  };

  const defaultTab = isLeague ? 'schedule' : 'details';
  const eventIncludesPlayoffBracket = isTournament
    || (isLeague && Boolean(activeEvent?.includePlayoffs ?? changesEvent?.includePlayoffs));
  const shouldShowBracketTab = Boolean(bracketData) || isPreview || (!isTemplateEvent && eventIncludesPlayoffBracket);

  // Keep bracket-capable events on a valid tab; the bracket panel owns the empty-data state.
  useEffect(() => {
    if (!shouldShowBracketTab && activeTab === 'bracket') {
      setActiveTab(defaultTab);
    }
  }, [shouldShowBracketTab, activeTab, defaultTab]);

  useEffect(() => {
    const request = searchParams?.get('tab');
    if (!activeEvent?.$id && request && EVENT_SCHEDULE_TABS.has(request)) {
      setActiveTab(request);
      return;
    }

    const allowed = new Set<string>(['details']);
    if (showParticipantsTab) {
      allowed.add('participants');
    }
    if (showScheduleTab) {
      allowed.add('schedule');
    }
    if (showStandingsTab) {
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
    }
    if (showFinanceTab) {
      allowed.add('finance');
    }

    const desired = request && allowed.has(request) ? request : defaultTab;
    setActiveTab(desired);
  }, [activeEvent?.$id, searchParams, shouldShowBracketTab, showFinanceTab, showParticipantsTab, showScheduleTab, showStandingsTab, defaultTab]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    const allowed = new Set<string>(['details']);
    if (showParticipantsTab) {
      allowed.add('participants');
    }
    if (showScheduleTab) {
      allowed.add('schedule');
    }
    if (showStandingsTab) {
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
    }
    if (showFinanceTab) {
      allowed.add('finance');
    }

    if (!allowed.has(value)) {
      setActiveTab(defaultTab);
      return;
    }

    setActiveTab(value);

    if (!pathname) return;

    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value === defaultTab) {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }

    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  const updateWeeklyOccurrenceSelection = useCallback((occurrence: { slotId: string; occurrenceDate: string } | null) => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (occurrence) {
      params.set('slotId', occurrence.slotId);
      params.set('occurrenceDate', occurrence.occurrenceDate);
    } else {
      params.delete('slotId');
      params.delete('occurrenceDate');
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleDetailsClose = useCallback(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleEventFormDirtyStateChange = useCallback((hasChanges: boolean) => {
    setFormHasUnsavedChanges(hasChanges);
  }, []);

  const getDraftFromForm = useCallback(
    async ({ allowCurrentEventFallback = false }: { allowCurrentEventFallback?: boolean } = {}): Promise<Partial<Event> | null> => {
      if (allowCurrentEventFallback && activeTab !== 'details' && activeEvent) {
        return cloneValue(activeEvent) as Event;
      }

      const formApi = eventFormRef.current;
      if (!formApi) {
        if (allowCurrentEventFallback && activeEvent) {
          return cloneValue(activeEvent) as Event;
        }
        setSubmitError('Form is not ready to submit.');
        return null;
      }

      const isValid = await formApi.validate();
      if (!isValid) {
        const validationMessages = Array.from(
          new Set(
            (formApi.getValidationErrors?.() ?? [])
              .map((issue) => issue.message.trim())
              .filter((message): message is string => message.length > 0),
          ),
        );
        const validationSummary = validationMessages.slice(0, 3).join(' ');
        setSubmitError(
          validationSummary.length > 0
            ? `Please fix the highlighted fields before submitting. ${validationSummary}`
            : 'Please fix the highlighted fields before submitting.',
        );
        return null;
      }
      try {
        await formApi.validatePendingStaffAssignments();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please fix the staff assignments before submitting.';
        setSubmitError(message);
        return null;
      }

      return formApi.getDraft();
    },
    [activeEvent, activeTab, setSubmitError],
  );

  const syncPendingEventFormInvites = useCallback(
    async (savedEvent: Event): Promise<Event> => {
      const formApi = eventFormRef.current;
      const savedEventId = savedEvent.$id;
      if (!formApi || !savedEventId) {
        return savedEvent;
      }

      const beforeDraft = formApi.getDraft();
      try {
        await formApi.submitPendingStaffInvites(savedEventId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reconcile staff invitations.';
        setSubmitError(message);
        throw error;
      }

      const afterDraft = formApi.getDraft();
      const beforeOfficialIds = JSON.stringify(Array.isArray(beforeDraft.officialIds) ? beforeDraft.officialIds : []);
      const afterOfficialIds = JSON.stringify(Array.isArray(afterDraft.officialIds) ? afterDraft.officialIds : []);
      const beforeAssistantHostIds = JSON.stringify(Array.isArray(beforeDraft.assistantHostIds) ? beforeDraft.assistantHostIds : []);
      const afterAssistantHostIds = JSON.stringify(Array.isArray(afterDraft.assistantHostIds) ? afterDraft.assistantHostIds : []);
      let latestEvent = savedEvent;
      if (beforeOfficialIds !== afterOfficialIds || beforeAssistantHostIds !== afterAssistantHostIds) {
        const invitedEventDraft = { ...savedEvent, ...(afterDraft as Event), $id: savedEventId } as Event;
        latestEvent = await eventService.updateEvent(savedEventId, invitedEventDraft);
      }

      const refreshedEvent = await eventService.getEventWithRelations(savedEventId);
      if (!refreshedEvent) {
        return latestEvent;
      }
      return refreshedEvent;
    },
    [setSubmitError],
  );

  const saveEventRegistrationQuestions = useCallback(async (savedEventId?: string | null) => {
    const eventId = typeof savedEventId === 'string' ? savedEventId.trim() : '';
    const formApi = eventFormRef.current;
    if (!eventId || !formApi) {
      return;
    }
    await teamService.saveRegistrationQuestions('EVENT', eventId, formApi.getRegistrationQuestionDrafts());
  }, []);

  const handlePreviewEventUpdate = useCallback((preview: Event) => {
    const normalizedPreview = normalizeApiEvent(preview) ?? preview;
    const previewClone = cloneValue(normalizedPreview) as Event;
    const nextMatches = Array.isArray(previewClone.matches)
      ? (cloneValue(previewClone.matches) as Match[])
      : [];
    hasUnsavedChangesRef.current = false;
    setEvent(previewClone);
    setMatches(nextMatches);
    setChangesEvent(previewClone);
    setChangesMatches(nextMatches);
    setHasUnsavedChanges(false);
    setFormHasUnsavedChanges(false);
  }, []);

  const buildSchedulePayload = useCallback(
    (draft: Partial<Event>): Record<string, unknown> => {
      const resolvedId = eventId ?? createClientId();
      const normalizedDraft = { ...draft, id: resolvedId } as Event;
      if (isRentalFlow && !resolvedHostOrgId) {
        normalizedDraft.organization = undefined;
        normalizedDraft.organizationId = null;
      }
      return toEventPayload(normalizedDraft) as Record<string, unknown>;
    },
    [eventId, isRentalFlow, resolvedHostOrgId],
  );

  const validateDraftMatchGraph = useCallback((draftMatches: Match[]): { ok: true } | { ok: false; message: string } => {
    const graphValidation = validateAndNormalizeBracketGraph(buildBracketNodes(draftMatches));
    if (!graphValidation.ok) {
      return {
        ok: false,
        message: graphValidation.errors[0]?.message ?? 'Invalid bracket graph.',
      };
    }

    const isTournamentEvent = String(activeEvent?.eventType ?? '').toUpperCase() === 'TOURNAMENT';
    if (!isTournamentEvent) {
      return { ok: true };
    }

    for (const match of draftMatches) {
      const matchId = normalizeIdToken(match.$id);
      if (!matchId || !isClientMatchId(matchId)) {
        continue;
      }
      const createMeta = stagedMatchCreates[matchId];
      if (!createMeta) {
        continue;
      }
      if (createMeta.creationContext === 'schedule') {
        const fieldId = normalizeIdToken(match.fieldId);
        const start = parseLocalDateTime(match.start ?? null);
        const end = parseLocalDateTime(match.end ?? null);
        if (!fieldId || !start || !end) {
          return {
            ok: false,
            message: `Schedule match ${match.matchId ?? matchId} requires field, start, and end.`,
          };
        }
        if (end.getTime() <= start.getTime()) {
          return {
            ok: false,
            message: `Schedule match ${match.matchId ?? matchId} requires end after start.`,
          };
        }
      }

      const normalizedNode = graphValidation.normalizedById[matchId];
      const hasAnyLink = Boolean(
        asBulkMatchRef(match.winnerNextMatchId) ||
        asBulkMatchRef(match.loserNextMatchId) ||
        normalizedNode?.previousLeftId ||
        normalizedNode?.previousRightId,
      );
      if (!hasAnyLink) {
        return {
          ok: false,
          message: `Tournament match ${match.matchId ?? matchId} must include at least one link.`,
        };
      }
    }

    return { ok: true };
  }, [activeEvent?.eventType, stagedMatchCreates]);

  const toBulkMatchUpdatePayload = useCallback((match: Match): Record<string, unknown> => {
    const normalizeRelationId = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
      }
      if (value && typeof value === 'object' && '$id' in (value as Record<string, unknown>)) {
        const relationId = (value as Record<string, unknown>).$id;
        if (typeof relationId === 'string' && relationId.trim().length > 0) {
          return relationId.trim();
        }
      }
      return null;
    };

    const resolvePersistableTeamId = (explicitId: string | null | undefined, relation: unknown): string | null => {
      const candidate = normalizeRelationId(explicitId) ?? normalizeRelationId(relation);
      if (!candidate || isLocalPlaceholderId(candidate)) {
        return null;
      }
      return candidate;
    };

    const payload: Record<string, unknown> = {
      id: match.$id,
      matchId: match.matchId ?? null,
      locked: Boolean(match.locked),
      status: match.status ?? null,
      resultStatus: match.resultStatus ?? null,
      resultType: match.resultType ?? null,
      actualStart: match.actualStart ?? null,
      actualEnd: match.actualEnd ?? null,
      statusReason: match.statusReason ?? null,
      winnerEventTeamId: match.winnerEventTeamId ?? null,
      segments: Array.isArray(match.segments) ? match.segments : [],
      team1Points: Array.isArray(match.team1Points) ? match.team1Points : [],
      team2Points: Array.isArray(match.team2Points) ? match.team2Points : [],
      setResults: Array.isArray(match.setResults) ? match.setResults : [],
      team1Id: resolvePersistableTeamId(match.team1Id, match.team1),
      team2Id: resolvePersistableTeamId(match.team2Id, match.team2),
      officialId: normalizeRelationId(match.officialId) ?? normalizeRelationId(match.official),
      officialIds: Array.isArray(match.officialIds) ? match.officialIds : [],
      teamOfficialId: resolvePersistableTeamId(match.teamOfficialId, match.teamOfficial),
      fieldId: normalizeRelationId(match.fieldId) ?? normalizeRelationId(match.field),
      previousLeftId: asBulkMatchRef(match.previousLeftId),
      previousRightId: asBulkMatchRef(match.previousRightId),
      winnerNextMatchId: asBulkMatchRef(match.winnerNextMatchId),
      loserNextMatchId: asBulkMatchRef(match.loserNextMatchId),
      side: match.side ?? null,
      officialCheckedIn: Boolean(match.officialCheckedIn),
      start: match.start ?? null,
      end: match.end ?? null,
      division: normalizeIdToken(getDivisionId(match.division) ?? null),
      losersBracket: Boolean(match.losersBracket),
    };
    if (match.matchRulesSnapshot) {
      payload.matchRulesSnapshot = match.matchRulesSnapshot;
    }
    return payload;
  }, []);

  const schedulePreview = useCallback(
    async (draft: Partial<Event>) => {
      if (!draft) {
        return;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);

      try {
        const payload = buildSchedulePayload(draft);
        const scheduleEventId = !isCreateMode ? eventId : undefined;
        const result = await eventService.scheduleEvent(payload, { eventId: scheduleEventId });
        if (!result?.event) {
          throw new Error('Failed to apply schedule changes.');
        }
        await saveEventRegistrationQuestions(result.event.$id);

        handlePreviewEventUpdate(result.event);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('create');
          params.delete('preview');
          params.set('mode', 'edit');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }
      } catch (err) {
        console.error('Failed to apply schedule changes:', err);
        setError(formatActionErrorMessage('Failed to apply schedule changes.', err));
      } finally {
        setPublishing(false);
      }
    },
    [buildSchedulePayload, eventId, handlePreviewEventUpdate, isCreateMode, pathname, router, saveEventRegistrationQuestions, searchParams],
  );

  const scheduleRegularEvent = useCallback(
    async (draft: Partial<Event>) => {
      if (!draft) {
        return null;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);

      try {
        const payload = buildSchedulePayload(draft);
        const result = await eventService.scheduleEvent(payload);
        if (!result?.event) {
          throw new Error('Failed to create event.');
        }
        await saveEventRegistrationQuestions(result.event.$id);

        handlePreviewEventUpdate(result.event);

        const nextId = result.event.$id ?? eventId;
        if (nextId && pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('create');
          params.delete('mode');
          params.delete('preview');
          const query = params.toString();
          router.replace(
            `/events/${nextId}/schedule${query ? `?${query}` : ''}`,
            { scroll: false },
          );
        }
        return result.event;
      } catch (err) {
        console.error('Failed to create event:', err);
        setError(formatActionErrorMessage('Failed to create event.', err));
        return null;
      } finally {
        setPublishing(false);
      }
    },
    [buildSchedulePayload, eventId, handlePreviewEventUpdate, pathname, router, saveEventRegistrationQuestions, searchParams],
  );

  const {
    rentalCheckout,
    startRentalCheckoutFlow,
  } = useRentalCheckoutFlow({
    eventId,
    user,
    authEmail: authUser?.email ?? null,
    activeEvent,
    changesEvent,
    event,
    rentalOrganization,
    rentalHostRequiredTemplateIds,
    rentalPurchaseContext,
    eventFormRef,
    setPublishing,
    setSubmitError,
    scheduleRegularEvent,
    syncPendingEventFormInvites,
    handlePreviewEventUpdate,
  });

  const saveExistingEvent = useCallback(
    async ({
      postSaveAction = 'none',
    }: {
      postSaveAction?: 'none' | 'reschedule' | 'buildBrackets' | 'rebuildWithoutPlaceholders';
    } = {}) => {
      if (!activeEvent) return;
      if (!event) {
        setError(`Unable to save ${entityLabel.toLowerCase()} changes without the original event context.`);
        return;
      }

      const isRescheduleAction = postSaveAction === 'reschedule';
      const isBuildBracketAction = postSaveAction === 'buildBrackets';
      const isRebuildWithoutPlaceholdersAction = postSaveAction === 'rebuildWithoutPlaceholders';
      const hasSchedulingAction = isRescheduleAction || isBuildBracketAction || isRebuildWithoutPlaceholdersAction;

      const draft = await getDraftFromForm({
        allowCurrentEventFallback: hasSchedulingAction,
      });
      if (!draft) {
        return;
      }

      const mergedDraft = { ...activeEvent, ...(draft as Event) } as Event;
      if (matchConflictPairs.length > 0 && !isRescheduleAction) {
        showCurrentMatchConflictOverride();
      }

      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);
      setActionError(null);
      if (hasSchedulingAction) {
        setReschedulingMatches(true);
      } else {
        setPublishing(true);
      }

      try {
        const nextEvent = cloneValue(mergedDraft) as Event;
        const nextMatches = cloneValue(activeMatches) as Match[];
        nextEvent.matches = nextMatches;

        if (Array.isArray(nextEvent.fields)) {
          nextEvent.fields = nextEvent.fields.map((field) => {
            const sanitized = { ...field };
            delete sanitized.rentalSlotIds;
            return sanitized;
          });
        }

        if ('attendees' in nextEvent) {
          delete (nextEvent as Partial<Event>).attendees;
        }

        const isTemplateDraft = typeof nextEvent.state === 'string'
          && nextEvent.state.toUpperCase() === 'TEMPLATE';
        if (isTemplateDraft) {
          nextEvent.state = 'TEMPLATE';
        } else {
          const lifecycleStatus = selectedLifecycleStatus ?? getEventLifecycleStatus(nextEvent);
          nextEvent.state = toStoredEventLifecycleState(lifecycleStatus, nextEvent.state);
        }

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent, {
            fields: Array.isArray(nextEvent.fields) ? nextEvent.fields : undefined,
            timeSlots: Array.isArray(nextEvent.timeSlots) ? nextEvent.timeSlots : undefined,
            leagueScoringConfig: Object.prototype.hasOwnProperty.call(nextEvent, 'leagueScoringConfig')
              ? nextEvent.leagueScoringConfig ?? null
              : undefined,
          });
        }

        const shouldPersistDraftMatches = !isBuildBracketAction && !isRebuildWithoutPlaceholdersAction;
        if (updatedEvent.$id && shouldPersistDraftMatches && nextMatches.length > 0) {
          const validation = validateDraftMatchGraph(nextMatches);
          if (!validation.ok) {
            throw new Error(validation.message);
          }

          const updatePayload = nextMatches
            .filter((match) => !isClientMatchId(match.$id))
            .map((match) => toBulkMatchUpdatePayload(match));
          const createPayload = nextMatches
            .filter((match) => isClientMatchId(match.$id))
            .map((match) => {
              const matchId = match.$id;
              const createMeta = stagedMatchCreates[matchId];
              const base = toBulkMatchUpdatePayload(match);
              const { id: _ignored, ...rest } = base;
              return {
                clientId: createMeta?.clientId ?? getClientIdFromMatchId(matchId),
                creationContext: createMeta?.creationContext ?? 'bracket',
                autoPlaceholderTeam: createMeta?.autoPlaceholderTeam ?? (String(updatedEvent.eventType ?? '').toUpperCase() === 'TOURNAMENT'),
                ...rest,
              };
            });
          const deletePayload = Array.from(
            new Set(
              stagedMatchDeletes
                .map((value) => normalizeIdToken(value))
                .filter((value): value is string => Boolean(value))
                .filter((value) => !isClientMatchId(value)),
            ),
          );

          if (updatePayload.length > 0 || createPayload.length > 0 || deletePayload.length > 0) {
            const matchResponse = await apiRequest<{ matches?: Match[]; created?: Record<string, string>; deleted?: string[] }>(
              `/api/events/${updatedEvent.$id}/matches`,
              {
                method: 'PATCH',
                body: {
                  ...(updatePayload.length > 0 ? { matches: updatePayload } : {}),
                  ...(createPayload.length > 0 ? { creates: createPayload } : {}),
                  ...(deletePayload.length > 0 ? { deletes: deletePayload } : {}),
                },
              },
            );
            const resolvePersistedMatchRef = (value: string | null | undefined): string | undefined => {
              const normalized = normalizeIdToken(value);
              if (!normalized) {
                return undefined;
              }
              if (!isClientMatchId(normalized)) {
                return normalized;
              }
              const clientId = getClientIdFromMatchId(normalized);
              const persisted = matchResponse?.created?.[clientId];
              return normalizeIdToken(persisted) ?? normalized;
            };
            const updatedMatches = Array.isArray(matchResponse?.matches)
              ? matchResponse.matches.map((match) => normalizeApiMatch(match))
              : [];
            const normalizedDraftMatches = nextMatches.map((match) => (
              normalizeApiMatch({
                ...match,
                $id: resolvePersistedMatchRef(match.$id) ?? match.$id,
                previousLeftId: resolvePersistedMatchRef(match.previousLeftId),
                previousRightId: resolvePersistedMatchRef(match.previousRightId),
                winnerNextMatchId: resolvePersistedMatchRef(match.winnerNextMatchId),
                loserNextMatchId: resolvePersistedMatchRef(match.loserNextMatchId),
              })
            ));
            const mergedMatchesById = new Map<string, Match>();
            normalizedDraftMatches.forEach((match) => {
              if (normalizeIdToken(match.$id)) {
                mergedMatchesById.set(match.$id, match);
              }
            });
            updatedMatches.forEach((match) => {
              if (normalizeIdToken(match.$id)) {
                mergedMatchesById.set(match.$id, match);
              }
            });
            const deletedIds = Array.isArray(matchResponse?.deleted)
              ? matchResponse.deleted
                .map((value) => normalizeIdToken(value))
                .filter((value): value is string => Boolean(value))
              : deletePayload;
            deletedIds.forEach((matchId) => {
              mergedMatchesById.delete(matchId);
            });
            updatedEvent.matches = Array.from(mergedMatchesById.values());
            resetStagedMatchDrafts();
          }
        }

        let scheduleWarningText: string | null = null;
        if (hasSchedulingAction && updatedEvent.$id) {
          const scheduleEventId = updatedEvent.$id;
          if (isBuildBracketAction || isRebuildWithoutPlaceholdersAction) {
            await leagueService.deleteMatchesByEvent(scheduleEventId);
          }

          const schedulePayload = toEventPayload(updatedEvent) as unknown as Record<string, unknown>;
          const scheduleOptions: {
            eventId: string;
            participantCount?: number;
            includePlaceholderTeams?: boolean;
          } = { eventId: scheduleEventId };
          if (isBuildBracketAction) {
            const participantCount = typeof updatedEvent.maxParticipants === 'number'
              ? Math.max(2, Math.trunc(updatedEvent.maxParticipants))
              : undefined;
            if (participantCount) {
              scheduleOptions.participantCount = participantCount;
            }
          }
          if (isRebuildWithoutPlaceholdersAction) {
            scheduleOptions.includePlaceholderTeams = false;
          }
          const scheduled = await eventService.scheduleEvent(schedulePayload, scheduleOptions);
          if (!scheduled?.event) {
            throw new Error(
              isRebuildWithoutPlaceholdersAction
                ? 'Failed to rebuild without placeholder teams.'
                : isBuildBracketAction
                  ? 'Failed to rebuild bracket(s).'
                  : 'Failed to reschedule matches.',
            );
          }
          if (Array.isArray(scheduled.warnings) && scheduled.warnings.length) {
            scheduleWarningText = scheduled.warnings
              .map((warning) => warning.message)
              .filter((message) => typeof message === 'string' && message.trim().length > 0)
              .join(' ');
          }
          updatedEvent = scheduled.event;

          if (isBuildBracketAction && Array.isArray(updatedEvent.matches) && updatedEvent.matches.length > 0) {
            const bracketMatchesToClear = updatedEvent.matches
              .filter((match) => shouldResetBracketMatchForRebuild(updatedEvent, match))
              .map((match) => toClearedBracketMatchUpdate(match));
            if (bracketMatchesToClear.length > 0) {
              const clearedMatches = await tournamentService.updateMatchesBulk(scheduleEventId, bracketMatchesToClear);
              if (clearedMatches.length > 0) {
                const clearedById = new Map(clearedMatches.map((match) => [match.$id, match]));
                updatedEvent.matches = updatedEvent.matches.map((match) => clearedById.get(match.$id) ?? match);
              }
            }
          }
        }

        if (!Array.isArray(updatedEvent.matches) || updatedEvent.matches.length === 0) {
          updatedEvent.matches = nextMatches;
        }

        await saveEventRegistrationQuestions(updatedEvent.$id);
        updatedEvent = await syncPendingEventFormInvites(updatedEvent);

        hasUnsavedChangesRef.current = false;
        eventFormRef.current?.commitDirtyBaseline();
        setHasUnsavedChanges(false);
        setFormHasUnsavedChanges(false);
        setSelectedLifecycleStatus(null);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('preview');
          params.set('mode', 'edit');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        await loadSchedule({ showPageLoader: false, clearMessages: false });
        if (isRescheduleAction) {
          setInfoMessage(`${entityLabel} settings saved and matches rescheduled.`);
          if (scheduleWarningText) {
            setWarningMessage(scheduleWarningText);
          }
        } else if (isBuildBracketAction) {
          setInfoMessage('Bracket(s) rebuilt and playoff/tournament results reset.');
          if (scheduleWarningText) {
            setWarningMessage(scheduleWarningText);
          }
        } else if (isRebuildWithoutPlaceholdersAction) {
          setInfoMessage('Schedule rebuilt without placeholder teams.');
          if (scheduleWarningText) {
            setWarningMessage(scheduleWarningText);
          }
        } else {
          setInfoMessage(`${entityLabel} changes saved.`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : null;
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        const baseMessage = isRebuildWithoutPlaceholdersAction
          ? 'Failed to rebuild without placeholder teams.'
          : isBuildBracketAction
          ? 'Failed to rebuild bracket(s).'
          : (
            isRescheduleAction
              ? `Failed to save ${entityLabel.toLowerCase()} and reschedule matches.`
              : `Failed to save ${entityLabel.toLowerCase()} changes.`
          );
        setError(errorMessage ? `${baseMessage} ${errorMessage}` : baseMessage);
      } finally {
        setPublishing(false);
        setReschedulingMatches(false);
      }
    },
    [
      activeEvent,
      activeMatches,
      entityLabel,
      event,
      getDraftFromForm,
      loadSchedule,
      matchConflictPairs,
      pathname,
      router,
      saveEventRegistrationQuestions,
      selectedLifecycleStatus,
      searchParams,
      showCurrentMatchConflictOverride,
      resetStagedMatchDrafts,
      stagedMatchCreates,
      toBulkMatchUpdatePayload,
      stagedMatchDeletes,
      syncPendingEventFormInvites,
      validateDraftMatchGraph,
    ],
  );

  const handleSaveEvent = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    setSubmitError(null);
    await saveExistingEvent();
  }, [publishing, reschedulingMatches, saveExistingEvent]);

  const handleRescheduleMatches = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    setSubmitError(null);
    setPendingScheduleAction('reschedule');
    try {
      await saveExistingEvent({ postSaveAction: 'reschedule' });
    } finally {
      setPendingScheduleAction((current) => (current === 'reschedule' ? null : current));
    }
  }, [publishing, reschedulingMatches, saveExistingEvent]);

  const handleBuildBrackets = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    if (!activeEvent) return;
    const entityNoun = activeEvent.eventType === 'TOURNAMENT' ? 'tournament' : 'playoff';
    const confirmed = window.confirm(
      `Build bracket(s)? This will reset the bracket and any match results in the ${entityNoun}.`,
    );
    if (!confirmed) {
      return;
    }
    setSubmitError(null);
    setPendingScheduleAction('rebuild');
    try {
      await saveExistingEvent({ postSaveAction: 'buildBrackets' });
    } finally {
      setPendingScheduleAction((current) => (current === 'rebuild' ? null : current));
    }
  }, [activeEvent, publishing, reschedulingMatches, saveExistingEvent]);

  const handleRebuildWithoutPlaceholders = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    const confirmed = window.confirm(
      'Rebuild without placeholder teams? This removes empty placeholder teams and rebuilds matches from registered teams only.',
    );
    if (!confirmed) {
      return;
    }
    setSubmitError(null);
    setPendingScheduleAction('rebuildNoPlaceholders');
    try {
      await saveExistingEvent({ postSaveAction: 'rebuildWithoutPlaceholders' });
    } finally {
      setPendingScheduleAction((current) => (current === 'rebuildNoPlaceholders' ? null : current));
    }
  }, [publishing, reschedulingMatches, saveExistingEvent]);

  const handlePublish = async () => {
    if (publishing || reschedulingMatches) return;
    setSubmitError(null);

    // Create mode: invoke createEvent with current draft and redirect to the new event.
    if (isCreateMode) {
      const draft = await getDraftFromForm();
      if (!draft) {
        return;
      }

      const normalizedDraft = draft.$id ? draft : { ...draft, $id: draft.$id ?? eventId };
      const completeCreateDraft = {
        ...(cloneValue(changesEvent ?? {}) as Partial<Event>),
        ...(normalizedDraft as Partial<Event>),
      } as Event;
      setChangesEvent((prev) => {
        const base = prev ?? ({} as Event);
        return { ...base, ...completeCreateDraft };
      });

      const normalizedAffiliateUrl = typeof completeCreateDraft.affiliateUrl === 'string'
        ? completeCreateDraft.affiliateUrl.trim()
        : '';
      if (normalizedAffiliateUrl.length === 0 && completeCreateDraft.eventType !== 'EVENT') {
        await schedulePreview(completeCreateDraft);
        return;
      }

      const draftToSave: Partial<Event> = {
        ...completeCreateDraft,
        state: 'UNPUBLISHED',
      };

      if (rentalPurchaseTimeSlot) {
        const rentalPriceCents = typeof rentalPurchaseTimeSlot.price === 'number'
          ? rentalPurchaseTimeSlot.price
          : undefined;
        const requiresPayment = typeof rentalPriceCents === 'number' && rentalPriceCents > 0;
        const requiresSignature = rentalHostRequiredTemplateIds.length > 0;

        if (requiresSignature || requiresPayment) {
          await startRentalCheckoutFlow({
            eventDraft: completeCreateDraft,
            draftToSave,
            rentalSlot: rentalPurchaseTimeSlot,
            requiresPayment,
          });
          return;
        }
      }

      const scheduledEvent = await scheduleRegularEvent(draftToSave);
      if (scheduledEvent?.$id) {
        const syncedEvent = await syncPendingEventFormInvites(scheduledEvent);
        eventFormRef.current?.commitDirtyBaseline();
        if (syncedEvent !== scheduledEvent) {
          handlePreviewEventUpdate(syncedEvent);
        }
      }
      return;
    }

    if (!activeEvent) return;

    if (!isPreview && !isEditingEvent && !isHiddenEvent) {
      handleEnterEditMode();
      return;
    }

    if (isEditingEvent) {
      await saveExistingEvent();
    }
  };

  const handleDeleteTemplate = useCallback(async () => {
    if (cancelling) return;
    const templateEvent = activeEvent ?? event;
    if (!templateEvent?.$id) return;

    if (!window.confirm('Delete this template? If it has history, it will be archived instead of permanently deleted.')) {
      return;
    }

    setCancelling(true);
    setError(null);
    setInfoMessage(null);
    setWarningMessage(null);
    setActionError(null);

    try {
      await leagueService.deleteMatchesByEvent(templateEvent.$id);
      await leagueService.deleteWeeklySchedulesForEvent(templateEvent.$id);
      await eventService.deleteEventResult(templateEvent);
      router.push(homePath);
    } catch (err) {
      console.error('Failed to delete template:', err);
      setError('Failed to delete template.');
    } finally {
      setCancelling(false);
    }
  }, [activeEvent, cancelling, event, homePath, router]);

  const handleDeleteEvent = useCallback(async () => {
    if (cancelling) return;
    const eventToDelete = activeEvent ?? event;
    if (!eventToDelete?.$id) return;

    const eventStart = parseLocalDateTime(eventToDelete.start);
    if (!eventStart || eventStart.getTime() <= Date.now()) {
      setActionError('Events can only be deleted before they start.');
      return;
    }

    if (!window.confirm('Delete this event? If it has registrations, billing, or schedule history, it will be archived instead.')) {
      return;
    }

    setCancelling(true);
    setError(null);
    setInfoMessage(null);
    setWarningMessage(null);
    setActionError(null);

    try {
      await leagueService.deleteMatchesByEvent(eventToDelete.$id);
      await leagueService.deleteWeeklySchedulesForEvent(eventToDelete.$id);
      await eventService.deleteEventResult(eventToDelete);
      router.push(homePath);
    } catch (err) {
      console.error('Failed to delete event:', err);
      setError('Failed to delete event.');
      setCancelling(false);
    }
  }, [activeEvent, cancelling, event, homePath, router]);

  const handleDiscardChanges = useCallback(() => {
    if (!hasPendingUnsavedChanges) {
      return;
    }

    if (typeof window !== 'undefined' && !window.confirm('Discard all unsaved changes?')) {
      return;
    }

    const baselineEvent = event ?? formSeedEvent ?? activeEvent ?? changesEvent;
    const baselineEventClone = baselineEvent ? (cloneValue(baselineEvent) as Event) : null;
    const baselineMatches = cloneValue(matches) as Match[];

    setChangesEvent(baselineEventClone);
    setChangesMatches(baselineMatches);
    resetStagedMatchDrafts();
    resetMatchEditorState();
    setSelectedLifecycleStatus(null);
    setHasUnsavedChanges(false);
    setFormHasUnsavedChanges(false);
    setSubmitError(null);
    setActionError(null);
    clearMatchConflictDraftAlerts();
    setWarningMessage(null);
    setIsPendingChangesPopoverOpen(false);
    hasUnsavedChangesRef.current = false;
    setEventFormResetVersion((current) => current + 1);
    setInfoMessage('Unsaved changes discarded.');
  }, [
    activeEvent,
    changesEvent,
    event,
    formSeedEvent,
    hasPendingUnsavedChanges,
    matches,
    clearMatchConflictDraftAlerts,
    resetMatchEditorState,
    resetStagedMatchDrafts,
  ]);

  const handleCancel = async () => {
    if (isCreateMode) {
      if (cancelling) return;
      setCancelling(true);
      try {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push('/events');
        }
      } finally {
        setCancelling(false);
      }
      return;
    }

    if (!event || cancelling) return;

    if (isPreview) {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push('/events');
      }
      return;
    }

    if (isEditingEvent) {
      if (!pathname) return;
      setInfoMessage(`${entityLabel} edit cancelled.`);
      setSelectedLifecycleStatus(null);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('mode');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (!window.confirm(`Cancel this ${entityLabel.toLowerCase()}? If it has registrations, billing, or schedule history, it will be archived instead.`)) return;
    setCancelling(true);
    setError(null);
    try {
      await leagueService.deleteMatchesByEvent(event.$id);
      await leagueService.deleteWeeklySchedulesForEvent(event.$id);
      await eventService.deleteEventResult(event);
      router.push(homePath);
    } catch (err) {
      console.error(`Failed to cancel ${entityLabel.toLowerCase()}:`, err);
      setError(`Failed to cancel ${entityLabel.toLowerCase()}.`);
      setCancelling(false);
    }
  };

  const matchEditorTeams = resolvedMatchTeams;

  const matchEditorOfficials = useMemo(() => {
    const officialsById = new Map<string, UserData>();
    const addOfficial = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const officialCandidate = candidate as UserData & { id?: string };
      const officialId = normalizeIdToken(officialCandidate.$id ?? officialCandidate.id);
      if (!officialId || officialsById.has(officialId)) {
        return;
      }
      officialsById.set(officialId, {
        ...officialCandidate,
        $id: officialId,
      } as UserData);
    };

    participantOfficials.forEach(addOfficial);
    if (Array.isArray(activeEvent?.officials)) {
      activeEvent.officials.forEach(addOfficial);
    }
    activeMatches.forEach((match) => addOfficial(match.official));

    return Array.from(officialsById.values());
  }, [participantOfficials, activeEvent?.officials, activeMatches]);

  const applyAgentClientActions = useCallback((actions: AgentClientAction[]): AgentClientActionResult => {
    const errors: string[] = [];
    if (!canEditMatches) {
      return {
        applied: 0,
        errors: ['Open Manage/Edit mode before asking the assistant to stage match edits.'],
      };
    }

    const targetEventId = activeEventId ?? eventId ?? activeEvent?.$id ?? null;
    if (!targetEventId) {
      return { applied: 0, errors: ['No active event schedule is available for assistant draft edits.'] };
    }

    const fieldsById = new Map<string, Field>();
    if (Array.isArray(activeEvent?.fields)) {
      activeEvent.fields.forEach((field) => {
        const fieldId = normalizeIdToken(field?.$id);
        if (fieldId) {
          fieldsById.set(fieldId, field);
        }
      });
    }

    const updateHas = (updates: Record<string, unknown>, key: string): boolean => (
      Object.prototype.hasOwnProperty.call(updates, key)
    );
    const normalizeDraftDateTime = (value: unknown, label: string): string | null | undefined => {
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string') {
        return undefined;
      }
      const parsed = parseLocalDateTime(value);
      if (!parsed) {
        errors.push(`${label} is not a valid date/time.`);
        return undefined;
      }
      return formatLocalDateTime(parsed);
    };
    const normalizeOptionalId = (value: unknown): string | null => (
      value === null ? null : normalizeIdToken(value)
    );

    let applied = 0;
    const base = (changesMatches.length ? changesMatches : (cloneValue(matches) as Match[]))
      .map((item) => cloneValue(item) as Match);
    const nextMatches = base.map((item) => cloneValue(item) as Match);

    actions.forEach((action) => {
      if (action.type !== 'schedule.match.update') {
        errors.push('Unsupported assistant draft action.');
        return;
      }
      if (action.eventId !== targetEventId) {
        errors.push('The assistant proposed a change for a different event.');
        return;
      }

      const targetMatchId = normalizeIdToken(action.matchId);
      if (!targetMatchId) {
        errors.push('The assistant proposed a match change without a valid match.');
        return;
      }
      const matchIndex = nextMatches.findIndex((match) => normalizeIdToken(match.$id) === targetMatchId);
      if (matchIndex < 0) {
        errors.push('The assistant proposed a change for a match that is not visible in this draft.');
        return;
      }

      const updates = action.updates as Record<string, unknown>;
      const current = nextMatches[matchIndex];
      const updated = { ...current } as Match;

      if (updateHas(updates, 'start')) {
        const start = normalizeDraftDateTime(updates.start, 'Start time');
        if (start !== undefined) {
          updated.start = start;
        }
      }
      if (updateHas(updates, 'end')) {
        const end = normalizeDraftDateTime(updates.end, 'End time');
        if (end !== undefined) {
          updated.end = end;
        }
      }
      if (updateHas(updates, 'fieldId')) {
        const fieldId = normalizeOptionalId(updates.fieldId);
        updated.fieldId = fieldId;
        updated.field = fieldId ? fieldsById.get(fieldId) : undefined;
      }
      if (updateHas(updates, 'team1Id')) {
        const team1Id = normalizeOptionalId(updates.team1Id);
        updated.team1Id = team1Id;
        updated.team1 = team1Id ? resolveTeam(team1Id) ?? undefined : undefined;
      }
      if (updateHas(updates, 'team2Id')) {
        const team2Id = normalizeOptionalId(updates.team2Id);
        updated.team2Id = team2Id;
        updated.team2 = team2Id ? resolveTeam(team2Id) ?? undefined : undefined;
      }
      if (updateHas(updates, 'officialId')) {
        updated.officialId = normalizeOptionalId(updates.officialId);
        updated.official = undefined;
      }
      if (updateHas(updates, 'officialIds')) {
        updated.officialIds = Array.isArray(updates.officialIds) ? updates.officialIds as Match['officialIds'] : [];
      }
      if (updateHas(updates, 'teamOfficialId')) {
        const teamOfficialId = normalizeOptionalId(updates.teamOfficialId);
        updated.teamOfficialId = teamOfficialId;
        updated.teamOfficial = teamOfficialId ? resolveTeam(teamOfficialId) ?? undefined : undefined;
      }
      if (updateHas(updates, 'locked')) {
        updated.locked = Boolean(updates.locked);
      }
      if (updateHas(updates, 'officialCheckedIn')) {
        updated.officialCheckedIn = Boolean(updates.officialCheckedIn);
      }
      if (updateHas(updates, 'matchId')) {
        updated.matchId = typeof updates.matchId === 'number' && Number.isFinite(updates.matchId)
          ? Math.trunc(updates.matchId)
          : undefined;
      }
      if (updateHas(updates, 'division')) {
        updated.division = typeof updates.division === 'string' && updates.division.trim().length > 0
          ? updates.division.trim()
          : null;
      }
      if (updateHas(updates, 'losersBracket')) {
        updated.losersBracket = Boolean(updates.losersBracket);
      }

      nextMatches[matchIndex] = updated;
      applied += 1;
    });

    if (applied > 0) {
      setChangesMatches(normalizeDraftBracketGraph(nextMatches));
    }

    if (applied > 0) {
      clearMatchConflictDraftAlerts();
      setHasUnsavedChanges(true);
      setInfoMessage(`Applied ${applied} assistant draft change${applied === 1 ? '' : 's'}. Review, then save or discard changes.`);
    }

    return {
      applied,
      errors,
      message: applied > 0
        ? `Applied ${applied} assistant draft change${applied === 1 ? '' : 's'} on the schedule page. Review, then use Save Changes to persist them or Discard Changes to revert them.`
        : undefined,
    };
  }, [
    activeEvent?.$id,
    activeEvent?.fields,
    activeEventId,
    canEditMatches,
    clearMatchConflictDraftAlerts,
    changesMatches,
    eventId,
    matches,
    normalizeDraftBracketGraph,
    resolveTeam,
  ]);

  useEffect(() => {
    registerClientActionHandler(applyAgentClientActions);
    return () => {
      registerClientActionHandler(null);
    };
  }, [applyAgentClientActions, registerClientActionHandler]);

  const isOfficialCheckedIn = useCallback(
    (match: Match) => Boolean(match.officialCheckedIn || match.officialCheckedIn),
    [],
  );

  const canUserManageScore = useCallback(
    (match: Match) => {
      if (!user?.$id || !isOfficialCheckedIn(match)) return false;
      if (collectMatchAssignmentUserIds(match).includes(user.$id)) {
        return true;
      }
      const teamOfficial = resolveTeam(match.teamOfficial ?? match.teamOfficialId);
      return userOnTeam(teamOfficial);
    },
    [isOfficialCheckedIn, resolveTeam, user?.$id, userOnTeam],
  );

  const updateMatchOfficialState = useCallback(
    async (match: Match, updates: Partial<Match>, failureMessage: string) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        return match;
      }

      try {
        const updated = await tournamentService.updateMatch(targetEventId, match.$id, updates);
        applyMatchUpdate(updated as Match);
        return updated as Match;
      } catch (err) {
        console.error(failureMessage, err);
        setError(failureMessage);
        return match;
      }
    },
    [activeEvent?.$id, applyMatchUpdate, eventId],
  );

  const handleMatchClick = useCallback(
    async (match: Match) => {
      if (canEditMatches) {
        handleMatchEditRequest(match);
        return;
      }

      let modalMatch = activeMatches.find((candidate) => candidate.$id === match.$id) ?? match;

      if (user?.$id) {
        const assignedTeamOfficial = resolveTeam(modalMatch.teamOfficial ?? modalMatch.teamOfficialId);
        const assignedTeamOfficialId = normalizeIdToken(modalMatch.teamOfficialId ?? modalMatch.teamOfficial?.$id);
        const currentUserEventTeam = findUserEventTeam();
        const currentUserEventTeamId = normalizeIdToken(currentUserEventTeam?.$id) ?? userEventTeamIdFromProfile;
        const isAssignedUserOfficial = collectMatchAssignmentUserIds(modalMatch).includes(user.$id);
        const isAssignedTeamOfficial =
          userOnTeam(assignedTeamOfficial) ||
          Boolean(currentUserEventTeamId && assignedTeamOfficialId && currentUserEventTeamId === assignedTeamOfficialId);
        const userIsCurrentOfficial = isAssignedUserOfficial || isAssignedTeamOfficial;
        const checkedIn = isOfficialCheckedIn(modalMatch);

        if (!checkedIn && userIsCurrentOfficial) {
          const confirmCheckIn = window.confirm('Would you like to check in as official?');
          if (confirmCheckIn) {
            modalMatch = await updateMatchOfficialState(
              modalMatch,
              { officialCheckedIn: true },
              'Failed to check in as official. Please try again.',
            );
          }
        } else {
          const canSwapIntoRef =
            !checkedIn &&
            Boolean(activeEvent?.doTeamsOfficiate) &&
            Boolean(activeEvent?.teamOfficialsMaySwap) &&
            Boolean(currentUserEventTeamId) &&
            assignedTeamOfficialId !== currentUserEventTeamId;

          if (canSwapIntoRef && currentUserEventTeamId) {
            const confirmSwap = window.confirm(
              'The official has not checked in yet. Do you want your team to official this match?',
            );
            if (confirmSwap) {
              modalMatch = await updateMatchOfficialState(
                modalMatch,
                {
                  teamOfficialId: currentUserEventTeamId,
                  officialCheckedIn: false,
                },
                'Failed to swap official for this match. Please try again.',
              );
              const confirmCheckIn = window.confirm('Would you like to check in as official?');
              if (confirmCheckIn) {
                modalMatch = await updateMatchOfficialState(
                  modalMatch,
                  { officialCheckedIn: true },
                  'Failed to check in as official. Please try again.',
                );
              }
            }
          }
        }
      }

      if (
        activeEvent?.teamSignup === true
        && activeEvent?.teamCheckInMode === 'MATCH'
        && isTeamCheckInOpen(modalMatch.start)
      ) {
        let openedRosterAfterCheckIn = false;
        const managedMatchTeam = findUserManagedMatchTeam(modalMatch);
        const managedMatchTeamId = normalizeIdToken(managedMatchTeam?.$id);
        const matchId = normalizeIdToken(modalMatch.$id);
        if (managedMatchTeam && managedMatchTeamId && matchId) {
          const promptKey = `${matchId}:${managedMatchTeamId}`;
          if (!matchCheckInPromptedRef.current.has(promptKey)) {
            matchCheckInPromptedRef.current.add(promptKey);
            if (window.confirm(`Check in ${managedMatchTeam.name} for this match?`)) {
              const checkedIn = await performTeamCheckIn('MATCH', managedMatchTeam, modalMatch);
              if (checkedIn && activeEvent.allowMatchRosterEdits === true) {
                setRosterModalMatch(modalMatch);
                setRosterModalTeam(managedMatchTeam);
                openedRosterAfterCheckIn = true;
              }
            }
          }
        }
        if (openedRosterAfterCheckIn) {
          return;
        }
      }

      openScoreModalForMatch(modalMatch);
    },
    [
      activeEvent?.doTeamsOfficiate,
      activeEvent?.allowMatchRosterEdits,
      activeEvent?.teamCheckInMode,
      activeEvent?.teamSignup,
      activeEvent?.teamOfficialsMaySwap,
      activeMatches,
      canEditMatches,
      findUserManagedMatchTeam,
      findUserEventTeam,
      handleMatchEditRequest,
      isOfficialCheckedIn,
      isTeamCheckInOpen,
      openScoreModalForMatch,
      performTeamCheckIn,
      resolveTeam,
      updateMatchOfficialState,
      user,
      userEventTeamIdFromProfile,
      userOnTeam,
    ],
  );

  const activeLocationDefaults = useMemo(
    () => buildScheduleLocationDefaults({
      organization: activeOrganization,
      userLocationLabel,
      userCoordinates,
    }),
    [activeOrganization, userCoordinates, userLocationLabel],
  );

  const handleStandingsOverrideChange = useCallback((teamId: string, value: string | number) => {
    setStandingsDraftOverrides((prev) => {
      const next = { ...prev };
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        delete next[teamId];
      } else {
        next[teamId] = numeric;
      }
      return next;
    });
    setStandingsActionError(null);
  }, []);

  const standingsActionDivisionId = useMemo(() => {
    const loadedDivisionId = normalizeIdToken(standingsDivisionData?.divisionId ?? null);
    if (loadedDivisionId) {
      return loadedDivisionId;
    }
    return normalizeIdToken(selectedStandingsDataDivision);
  }, [selectedStandingsDataDivision, standingsDivisionData?.divisionId]);

  const handleSaveStandingsAdjustments = useCallback(async () => {
    if (!activeEvent?.$id || !standingsActionDivisionId || !standingsDivisionData) {
      return;
    }

    const existingOverrides = standingsDivisionData.standingsOverrides ?? {};
    const updates = standingsDivisionData.standings.reduce<Array<{ teamId: string; points: number | null }>>((acc, row) => {
      const existing = existingOverrides[row.teamId];
      const desired = standingsDraftOverrides[row.teamId];
      const basePoints = Number.isFinite(row.basePoints) ? Number(row.basePoints) : 0;
      const hasExisting = typeof existing === 'number' && Number.isFinite(existing);
      const hasDesired = typeof desired === 'number' && Number.isFinite(desired);

      if (hasDesired) {
        if (desired === basePoints) {
          if (hasExisting) {
            acc.push({ teamId: row.teamId, points: null });
          }
          return acc;
        }
        if (!hasExisting || desired !== existing) {
          acc.push({ teamId: row.teamId, points: desired });
        }
        return acc;
      }

      if (hasExisting) {
        acc.push({ teamId: row.teamId, points: null });
      }
      return acc;
    }, []);

    if (!updates.length) {
      setInfoMessage('No standings adjustments to save.');
      return;
    }

    setSavingStandings(true);
    setStandingsActionError(null);
    setInfoMessage(null);
    setWarningMessage(null);

    try {
      const updatedDivision = await tournamentService.updateLeagueStandingsOverrides(
        activeEvent.$id,
        standingsActionDivisionId,
        updates,
      );
      setStandingsDivisionData(updatedDivision);
      setStandingsDraftOverrides(updatedDivision.standingsOverrides ? { ...updatedDivision.standingsOverrides } : {});
      setInfoMessage('Standings adjustments saved.');
    } catch (saveError) {
      console.error('Failed to save standings adjustments:', saveError);
      setStandingsActionError(saveError instanceof Error ? saveError.message : 'Failed to save standings adjustments.');
    } finally {
      setSavingStandings(false);
    }
  }, [activeEvent?.$id, standingsActionDivisionId, standingsDivisionData, standingsDraftOverrides]);

  const handleConfirmStandings = useCallback(async () => {
    if (!activeEvent?.$id || !standingsActionDivisionId) {
      return;
    }

    setConfirmingStandings(true);
    setStandingsActionError(null);
    setInfoMessage(null);
    setWarningMessage(null);

    try {
      const result = await tournamentService.confirmLeagueStandings(
        activeEvent.$id,
        standingsActionDivisionId,
        applyStandingsReassignment,
      );
      const seededTeamCount = Array.isArray(result.seededTeamIds)
        ? new Set(
          result.seededTeamIds
            .map((teamId) => normalizeIdToken(teamId))
            .filter((teamId): teamId is string => Boolean(teamId)),
        ).size
        : 0;
      setStandingsDivisionData(result.division);
      setStandingsDraftOverrides(result.division.standingsOverrides ? { ...result.division.standingsOverrides } : {});
      if (applyStandingsReassignment) {
        await loadSchedule();
        if (result.reassignedPlayoffDivisionIds.length > 0) {
          setInfoMessage(
            seededTeamCount > 0
              ? `Standings confirmed and seeded ${seededTeamCount} playoff team(s) across ${result.reassignedPlayoffDivisionIds.length} division(s).`
              : `Standings confirmed and playoff assignments refreshed for ${result.reassignedPlayoffDivisionIds.length} division(s). No teams were seeded yet.`,
          );
        } else {
          setInfoMessage('Standings confirmed. No mapped playoff divisions were updated.');
        }
      } else {
        setInfoMessage('Standings confirmed without playoff reassignment.');
      }
    } catch (confirmError) {
      console.error('Failed to confirm standings:', confirmError);
      setStandingsActionError(confirmError instanceof Error ? confirmError.message : 'Failed to confirm standings.');
    } finally {
      setConfirmingStandings(false);
    }
  }, [activeEvent?.$id, applyStandingsReassignment, loadSchedule, standingsActionDivisionId]);

  const standingsValidationMessages = useMemo(() => {
    if (!standingsDivisionData?.validation) {
      return [];
    }
    return [
      ...(standingsDivisionData.validation.mappingErrors ?? []),
      ...(standingsDivisionData.validation.capacityErrors ?? []),
    ];
  }, [standingsDivisionData]);

  const handleStandingsSortChange = useCallback((field: StandingsSortField) => {
    setStandingsSort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        field,
        direction: field === 'team' ? 'asc' : 'desc',
      };
    });
  }, []);

  if (authLoading || !eventId) {
    return <Loading fullScreen text="Opening event..." />;
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <Loading fullScreen belowNavigation text="Loading schedule..." />
        {contentTermsModal}
      </>
    );
  }

  if (isCreateMode && !activeEvent) {
    return (
      <CreateEventScheduleView
        termsModal={contentTermsModal}
        pendingChangesOpen={isPendingChangesPopoverOpen}
        pendingSaveChanges={pendingSaveChanges}
        onPendingChangesOpenChange={setIsPendingChangesPopoverOpen}
        hasPendingUnsavedChanges={hasPendingUnsavedChanges}
        onDiscardChanges={handleDiscardChanges}
        publishing={publishing}
        reschedulingMatches={reschedulingMatches}
        cancelling={cancelling}
        createButtonLabel={createButtonLabel}
        cancelButtonLabel={cancelButtonLabel}
        onPublish={handlePublish}
        onCancel={handleCancel}
        submitError={submitError}
        error={error}
        warningMessage={warningMessage}
        infoMessage={infoMessage}
        templateRentalResourcePrompt={templateRentalResourcePrompt}
        onSubmitErrorClose={() => setSubmitError(null)}
        onErrorClose={() => setError(null)}
        onWarningMessageClose={() => setWarningMessage(null)}
        onInfoMessageClose={() => setInfoMessage(null)}
        onTemplateRentalResourcePromptClose={dismissTemplateRentalResourcePrompt}
        templatePromptOpen={effectiveTemplatePromptOpen}
        onCloseTemplatePrompt={handleCloseTemplatePrompt}
        isMobile={Boolean(isMobile)}
        applyingTemplate={applyingTemplate}
        templatesError={templatesError}
        actionError={actionError}
        templatesLoading={templatesLoading}
        templateSelectData={templateSelectData}
        selectedTemplateId={selectedTemplateId}
        selectedTemplateStartDate={selectedTemplateStartDate}
        onSelectedTemplateIdChange={setSelectedTemplateId}
        onSelectedTemplateStartDateChange={setSelectedTemplateStartDate}
        onApplyTemplate={handleApplyTemplateWithPromptState}
        user={user}
        event={changesEvent}
        templateSeedKey={templateSeedKey}
        eventFormRef={eventFormRef}
        onEventFormClose={() => router.push('/events')}
        onDirtyStateChange={handleEventFormDirtyStateChange}
        organization={organizationForCreate}
        defaultLocation={createLocationDefaults}
        immutableDefaults={rentalImmutableDefaults}
        rentalPurchase={rentalPurchaseContext}
        templateOrganizationId={resolvedRentalOrgId ?? organizationForCreate?.$id ?? undefined}
        formId={createFormId}
        rentalCheckout={rentalCheckout}
      />
    );
  }

  if (error && !activeEvent) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">Something went wrong.</Text>
              <Button variant="default" onClick={() => loadSchedule()}>Try Again</Button>
              <Text size="sm" c="red" ta="center" role="alert" aria-live="assertive">{error}</Text>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  if (!activeEvent) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">League not found.</Text>
              <Button variant="default" onClick={() => router.push('/events')}>Back to Events</Button>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  const leagueConfig = activeEvent.leagueConfig;
  const hasNetworkActionInFlight = publishing || reschedulingMatches || cancelling || creatingTemplate;
  const showEditActionButton = canManageEvent && !isCreateMode && !isTemplateEvent && !isEditingEvent;
  const showSaveActionButton = isCreateMode || isEditingEvent;
  const showRescheduleActionButton = isEditingEvent && (isLeague || isTournament);
  const showBuildBracketsActionButton = isEditingEvent && (
    isTournament || (isLeague && Boolean(activeEvent.includePlayoffs))
  );
  const showRebuildWithoutPlaceholdersActionButton = isEditingEvent && (isLeague || isTournament);
  const showDeleteTemplateActionButton = isTemplateEvent;
  const showCancelActionButton = (isEditingEvent || isCreateMode) && !isTemplateEvent;
  const showCreateTemplateButton = isEditingEvent && !isCreateMode && !isTemplateEvent;
  const activeEventStart = activeEvent?.start ? parseLocalDateTime(activeEvent.start) : null;
  const showDeleteEventActionButton = Boolean(
    canManageEvent
    && !isCreateMode
    && !isTemplateEvent
    && activeEvent?.$id
    && activeEventStart
    && activeEventStart.getTime() > Date.now(),
  );
  const showQrCodeActionButton = Boolean(canManageEvent && !isCreateMode && !isTemplateEvent && !isEditingEvent && activeEvent?.$id);
  const showMoreActionsMenu = showRescheduleActionButton
    || showBuildBracketsActionButton
    || showRebuildWithoutPlaceholdersActionButton
    || showCancelActionButton
    || showDeleteTemplateActionButton
    || showDeleteEventActionButton
    || showCreateTemplateButton;
  const isRescheduleActionInFlight = reschedulingMatches && pendingScheduleAction === 'reschedule';
  const isRebuildActionInFlight = reschedulingMatches && pendingScheduleAction === 'rebuild';
  const isRebuildWithoutPlaceholdersActionInFlight = reschedulingMatches && pendingScheduleAction === 'rebuildNoPlaceholders';
  const showLifecycleStatusSelect = isEditingEvent && !isTemplateEvent;
  const showDiscardChangesButton = (isEditingEvent || isCreateMode) && hasPendingUnsavedChanges;
  const eventFormRenderKey = isCreateMode
    ? `create:${activeEvent?.$id ?? eventId ?? 'event'}:${templateSeedKey}:${eventFormResetVersion}`
    : `event:${activeEvent?.$id ?? eventId ?? 'event'}:${eventFormResetVersion}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      {contentTermsModal}
      <Container fluid pt="xl" pb={0}>
        <Stack gap="lg">
          <EventScheduleHeader
            eventId={activeEvent.$id}
            eventName={activeEvent.name}
            organizationLogoId={activeOrganization?.logoId ?? null}
            selectedOccurrenceLabel={selectedWeeklyOccurrenceOption?.label ?? null}
            onClearSelectedOccurrence={() => updateWeeklyOccurrenceSelection(null)}
            showNotificationAction={canManageEvent && !isCreateMode}
            onOpenNotification={handleOpenNotificationModal}
            showReportAction={!canManageEvent && !isCreateMode && Boolean(user)}
            reportingEvent={reportingEvent}
            onReportEvent={handleReportEvent}
            showEditAction={showEditActionButton}
            onEnterEditMode={handleEnterEditMode}
            showQrCodeAction={showQrCodeActionButton}
            qrCodeOpen={isQrCodeModalOpen}
            onOpenQrCode={() => setIsQrCodeModalOpen(true)}
            onCloseQrCode={() => setIsQrCodeModalOpen(false)}
            showEditingActions={isEditingEvent || isCreateMode}
            pendingChangesOpen={isPendingChangesPopoverOpen}
            pendingSaveChanges={pendingSaveChanges}
            onPendingChangesOpenChange={setIsPendingChangesPopoverOpen}
            showDiscardChanges={showDiscardChangesButton}
            onDiscardChanges={handleDiscardChanges}
            showLifecycleStatusSelect={showLifecycleStatusSelect}
            selectedLifecycleStatus={selectedLifecycleStatus}
            activeLifecycleStatus={activeLifecycleStatus}
            onLifecycleStatusChange={handleLifecycleStatusChange}
            showSaveAction={showSaveActionButton}
            createButtonLabel={createButtonLabel}
            isCreateMode={isCreateMode}
            onSave={isCreateMode ? handlePublish : handleSaveEvent}
            publishing={publishing}
            hasNetworkActionInFlight={hasNetworkActionInFlight}
            hasPendingUnsavedChanges={hasPendingUnsavedChanges}
            hasSplitDivisionUnassignedTeams={hasSplitDivisionUnassignedTeams}
            showMoreActions={showMoreActionsMenu}
            showRescheduleAction={showRescheduleActionButton}
            isRescheduleActionInFlight={isRescheduleActionInFlight}
            onRescheduleMatches={handleRescheduleMatches}
            showBuildBracketsAction={showBuildBracketsActionButton}
            isRebuildActionInFlight={isRebuildActionInFlight}
            onBuildBrackets={handleBuildBrackets}
            showRebuildWithoutPlaceholdersAction={showRebuildWithoutPlaceholdersActionButton}
            isRebuildWithoutPlaceholdersActionInFlight={isRebuildWithoutPlaceholdersActionInFlight}
            onRebuildWithoutPlaceholders={handleRebuildWithoutPlaceholders}
            showCancelAction={showCancelActionButton}
            cancelling={cancelling}
            cancelButtonLabel={cancelButtonLabel}
            onCancel={handleCancel}
            showDeleteTemplateAction={showDeleteTemplateActionButton}
            onDeleteTemplate={handleDeleteTemplate}
            showDeleteEventAction={showDeleteEventActionButton}
            onDeleteEvent={handleDeleteEvent}
            showCreateTemplateAction={showCreateTemplateButton}
            creatingTemplate={creatingTemplate}
            onCreateTemplate={handleCreateTemplateFromEvent}
            infoMessage={infoMessage}
            onInfoMessageClose={() => setInfoMessage(null)}
            submitError={submitError}
            onSubmitErrorClose={() => setSubmitError(null)}
            error={error}
            onErrorClose={() => setError(null)}
            visibleMatchConflictMessage={visibleMatchConflictMessage}
            onMatchConflictMessageClose={dismissMatchConflictMessage}
            warningMessage={warningMessage}
            onWarningMessageClose={() => setWarningMessage(null)}
            templateRentalResourcePrompt={templateRentalResourcePrompt}
            onTemplateRentalResourcePromptClose={dismissTemplateRentalResourcePrompt}
            showSplitDivisionWarning={canManageEvent && hasSplitDivisionUnassignedTeams}
            unassignedTeamLabels={unassignedFilledParticipantTeams.map(getTeamWarningLabel)}
            actionError={actionError}
            onActionErrorClose={() => setActionError(null)}
          />

          {isCreateMode && templateIdParam && dismissedDirectTemplatePromptId !== templateIdParam && (
            <Alert color="blue" radius="md" title="Start from template">
              <Stack gap="sm">
                <Text size="sm">
                  Choose the new event start date before applying this template.
                </Text>
                <Group align="end" gap="sm" wrap="wrap">
                  <Select
                    label="Template"
                    placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'}
                    data={templateSelectData.length > 0 ? templateSelectData : [{ value: templateIdParam, label: 'Selected template' }]}
                    value={selectedTemplateId ?? templateIdParam}
                    onChange={setSelectedTemplateId}
                    searchable
                    disabled={templatesLoading || applyingTemplate}
                    nothingFoundMessage="No templates found"
                    style={{ minWidth: 240 }}
                  />
                  <DatePickerInput
                    label="New event start date"
                    valueFormat="MM/DD/YYYY"
                    value={selectedTemplateStartDate}
                    onChange={(value) => setSelectedTemplateStartDate(parseLocalDateTime(value))}
                    minDate={new Date()}
                    disabled={applyingTemplate}
                    style={{ minWidth: 220 }}
                  />
                  <Button
                    onClick={handleApplyTemplateWithPromptState}
                    loading={applyingTemplate}
                    disabled={!(selectedTemplateId ?? templateIdParam) || !selectedTemplateStartDate}
                  >
                    Use Template
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleCloseTemplatePrompt}
                    disabled={applyingTemplate}
                  >
                    Start Blank
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}

          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="details">Details</Tabs.Tab>
              {showParticipantsTab && <Tabs.Tab value="participants">{isSplitDivisionEvent ? 'Divisions' : 'Participants'}</Tabs.Tab>}
              {showScheduleTab && <Tabs.Tab value="schedule">Schedule</Tabs.Tab>}
              {showStandingsTab && <Tabs.Tab value="standings">Standings</Tabs.Tab>}
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              {showFinanceTab && <Tabs.Tab value="finance">Finance</Tabs.Tab>}
            </Tabs.List>

            <DetailsTabPanel
              shouldShowCreationSheet={shouldShowCreationSheet}
              user={user}
              eventFormRenderKey={eventFormRenderKey}
              eventFormRef={eventFormRef}
              isActive={activeTab === 'details'}
              onClose={handleDetailsClose}
              onDirtyStateChange={handleEventFormDirtyStateChange}
              event={activeEvent}
              organization={activeOrganization}
              defaultLocation={activeLocationDefaults}
              isCreateMode={isCreateMode}
              immutableDefaults={rentalImmutableDefaults}
              rentalPurchase={rentalPurchaseContext}
              templateOrganizationId={resolvedRentalOrgId ?? activeOrganization?.$id ?? undefined}
              selectedOccurrence={selectedOccurrence}
              onWeeklyOccurrenceChange={updateWeeklyOccurrenceSelection}
            />

            {showParticipantsTab && (
              <Tabs.Panel value="participants" pt="md">
                <ParticipantsPanel
                  teamSignup={activeEvent?.teamSignup}
                  weeklyParticipantSelectionRequired={weeklyParticipantSelectionRequired}
                  participantUsers={participantUsers}
                  participantTeams={participantTeams}
                  filledParticipantTeams={filledParticipantTeams}
                  canManageEvent={canManageEvent}
                  participantsError={participantsError}
                  canUseTeamCompliance={canUseTeamCompliance}
                  teamComplianceError={teamComplianceError}
                  canUseUserCompliance={canUseUserCompliance}
                  userComplianceError={userComplianceError}
                  participantsLoading={participantsLoading}
                  isSplitDivisionEvent={isSplitDivisionEvent}
                  participantDivisionColumns={participantDivisionColumns}
                  participantTeamsById={participantTeamsById}
                  participantDivisionWarningsByDivisionId={participantDivisionWarningsByDivisionId}
                  participantDivisionSelectData={participantDivisionSelectData}
                  participantsUpdatingTeamId={participantsUpdatingTeamId}
                  isEditingEvent={isEditingEvent}
                  unassignedParticipantTeams={unassignedParticipantTeams}
                  unassignedFilledParticipantTeams={unassignedFilledParticipantTeams}
                  isPlaceholderParticipantTeam={isPlaceholderParticipantTeam}
                  toUserParticipantPseudoTeam={toUserParticipantPseudoTeam}
                  renderEditBillingActions={renderEditBillingActions}
                  renderParticipantTeamCard={renderParticipantTeamCard}
                  renderParticipantUserCard={renderParticipantUserCard}
                  onOpenAddParticipants={openAddParticipantsModal}
                  onOpenAddTeam={openAddTeamModal}
                  onMoveTeamDivision={handleMoveTeamDivision}
                  onRemoveTeamFromParticipants={handleRemoveTeamFromParticipants}
                  onRemoveUserFromParticipants={handleRemoveUserFromParticipants}
                />
              </Tabs.Panel>
            )}

            <ScheduleTabPanel
              show={showScheduleTab}
              isWeeklyParentEvent={isWeeklyParentEvent}
              activeEvent={activeEvent}
              user={user}
              childUserIds={childUserIds}
              viewerTeamIds={viewerTeamIds}
              viewerDivisionHighlightKeys={viewerDivisionHighlightKeys}
              selectedWeeklyOccurrenceOption={selectedWeeklyOccurrenceOption}
              weeklyScheduleOccurrenceOptions={weeklyScheduleOccurrenceOptions}
              weeklyOccurrenceMatches={weeklyOccurrenceMatches}
              weeklyScheduleCalendarDate={weeklyScheduleCalendarDate}
              weeklyScheduleCalendarView={weeklyScheduleCalendarView}
              onWeeklyScheduleCalendarDateChange={setWeeklyScheduleCalendarDate}
              onWeeklyScheduleCalendarViewChange={setWeeklyScheduleCalendarView}
              onWeeklyOccurrenceSelectionChange={updateWeeklyOccurrenceSelection}
              shouldShowScheduleDivisionFilter={shouldShowScheduleDivisionFilter}
              shouldShowSchedulePoolFilter={shouldShowSchedulePoolFilter}
              scheduleDivisionSelectData={scheduleDivisionSelectData}
              schedulePoolSelectData={schedulePoolSelectData}
              selectedScheduleDivision={selectedScheduleDivision}
              selectedSchedulePool={selectedSchedulePool}
              onScheduleDivisionChange={(value) => {
                setSelectedScheduleDivision(value);
                setSelectedSchedulePool('all');
              }}
              onSchedulePoolChange={setSelectedSchedulePool}
              renderViewerHighlightedDivisionOption={renderViewerHighlightedDivisionOption}
              getViewerHighlightedSelectStyles={getViewerHighlightedSelectStyles}
              canEditMatches={canEditMatches}
              activeMatches={activeMatches}
              scheduleMatches={scheduleMatches}
              scheduleMatchesForDisplay={scheduleMatchesForDisplay}
              participantTeams={participantTeams}
              showEventOfficialNames={showEventOfficialNames}
              matchConflictsById={matchConflictsById}
              scheduleBracketPlaceholderAssignments={scheduleBracketPlaceholderAssignments}
              onAddScheduleMatch={handleAddScheduleMatch}
              onMatchEditRequest={handleMatchEditRequest}
              onMatchClick={handleMatchClick}
              onMatchCalendarMove={handleMatchCalendarMove}
              onToggleLockAllMatches={handleToggleLockAllMatches}
            />

            <BracketTabPanel
              show={shouldShowBracketTab}
              shouldShowBracketDivisionFilter={shouldShowBracketDivisionFilter}
              bracketDivisionOptions={bracketDivisionOptions}
              selectedBracketDivision={selectedBracketDivision}
              renderViewerHighlightedDivisionOption={renderViewerHighlightedDivisionOption}
              getViewerHighlightedSelectStyles={getViewerHighlightedSelectStyles}
              canEditMatches={canEditMatches}
              bracketData={bracketData}
              user={user}
              childUserIds={childUserIds}
              viewerTeamIds={viewerTeamIds}
              viewerDivisionHighlightKeys={viewerDivisionHighlightKeys}
              isPreview={isPreview}
              showEventOfficialNames={showEventOfficialNames}
              eventTimeZone={activeEvent?.timeZone}
              showDateOnMatches={showDateOnMatches}
              matchConflictsById={matchConflictsById}
              playoffMatchCount={playoffMatches.length}
              onBracketDivisionChange={setSelectedBracketDivision}
              onAddBracketMatch={handleAddBracketMatch}
              onMatchClick={handleMatchClick}
            />

            <StandingsTabPanel
              show={showStandingsTab}
              effectiveStandingsDivisionOptions={effectiveStandingsDivisionOptions}
              selectedStandingsDivision={selectedStandingsDivision}
              renderViewerHighlightedDivisionOption={renderViewerHighlightedDivisionOption}
              getViewerHighlightedSelectStyles={getViewerHighlightedSelectStyles}
              shouldShowStandingsPoolFilter={shouldShowStandingsPoolFilter}
              standingsPoolOptions={standingsPoolOptions}
              selectedStandingsDataDivision={selectedStandingsDataDivision}
              standingsLoading={standingsLoading}
              canManageStandings={canManageStandings}
              applyStandingsReassignment={applyStandingsReassignment}
              savingStandings={savingStandings}
              confirmingStandings={confirmingStandings}
              standingsDivisionData={standingsDivisionData}
              standingsActionError={standingsActionError}
              standingsValidationMessages={standingsValidationMessages}
              standings={standings}
              hasRecordedMatches={hasRecordedMatches}
              standingsSort={standingsSort}
              viewerTeamIds={viewerTeamIds}
              getDraftStandingsPoints={getDraftStandingsPoints}
              onStandingsDivisionChange={setSelectedStandingsDivision}
              onStandingsPoolChange={setSelectedStandingsPool}
              onApplyStandingsReassignmentChange={setApplyStandingsReassignment}
              onSaveStandingsAdjustments={handleSaveStandingsAdjustments}
              onConfirmStandings={handleConfirmStandings}
              onStandingsSortChange={handleStandingsSortChange}
              onStandingsOverrideChange={handleStandingsOverrideChange}
            />

            <FinanceTabPanel
              show={showFinanceTab}
              eventId={activeEvent?.$id ?? eventId}
              organizationId={financeOrganizationId}
              isActive={activeTab === 'finance'}
              canManage={canManageEvent}
            />
          </Tabs>
        </Stack>
      </Container>
      <Modal
        opened={isNotificationModalOpen}
        onClose={handleCloseNotificationModal}
        title="Send notification"
        size="lg"
        centered
        fullScreen={Boolean(isMobile)}
        closeOnClickOutside={!sendingNotification}
        closeOnEscape={!sendingNotification}
        withCloseButton={!sendingNotification}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="Notification title"
            value={notificationTitle}
            onChange={(event) => setNotificationTitle(event.currentTarget.value)}
            maxLength={160}
            required
            disabled={sendingNotification}
          />
          <Textarea
            label="Message"
            placeholder="Write your message"
            value={notificationMessage}
            onChange={(event) => setNotificationMessage(event.currentTarget.value)}
            minRows={4}
            autosize
            maxLength={2000}
            required
            disabled={sendingNotification}
          />
          <Stack gap={6}>
            <Text size="sm" fw={500}>Send to</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              <Checkbox
                label="Managers"
                checked={notificationAudience.managers}
                onChange={(event) => handleNotificationAudienceToggle('managers', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Players"
                checked={notificationAudience.players}
                onChange={(event) => handleNotificationAudienceToggle('players', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Parents (of players)"
                checked={notificationAudience.parents}
                onChange={(event) => handleNotificationAudienceToggle('parents', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Officials"
                checked={notificationAudience.officials}
                onChange={(event) => handleNotificationAudienceToggle('officials', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Hosts"
                checked={notificationAudience.hosts}
                onChange={(event) => handleNotificationAudienceToggle('hosts', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
            </SimpleGrid>
          </Stack>

          {notificationError && (
            <Alert color="red" radius="md">
              {notificationError}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={handleCloseNotificationModal}
              disabled={sendingNotification}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleSendNotification();
              }}
              loading={sendingNotification}
              disabled={!notificationTitle.trim() || !notificationMessage.trim() || !hasSelectedNotificationAudience}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
      <AddParticipantModal
        opened={isAddParticipantModalOpen}
        fullScreen={Boolean(isMobile)}
        inviteMode={participantInviteMode}
        participantSearchValue={participantSearchValue}
        participantSearchError={participantSearchError}
        participantSearchLoading={participantSearchLoading}
        participantSearchResults={participantSearchResults}
        participantsUpdatingTeamId={participantsUpdatingTeamId}
        inviteRows={participantInviteRows}
        inviteError={participantInviteError}
        invitingParticipants={invitingParticipants}
        organizationIdForParticipants={organizationIdForParticipants}
        organizationTeamsLoading={organizationTeamsLoading}
        availableOrganizationParticipantTeams={availableOrganizationParticipantTeams}
        participantUserIdSet={participantUserIdSet}
        onClose={closeAddParticipantModal}
        onInviteModeChange={(mode) => {
          setParticipantInviteMode(mode);
          setParticipantInviteError(null);
        }}
        onSearchParticipants={(query) => { void handleSearchParticipants(query); }}
        onAddExistingParticipant={(participant) => { void handleAddExistingParticipant(participant); }}
        onInviteRowsChange={setParticipantInviteRows}
        onInviteParticipantsByEmail={() => { void handleInviteParticipantsByEmail(); }}
        onAddTeamRosterParticipants={(team) => { void handleAddTeamRosterParticipants(team); }}
        renderParticipantTeamCard={renderParticipantTeamCard}
      />
      <AddTeamModal
        opened={isAddTeamModalOpen}
        fullScreen={Boolean(isMobile)}
        teamSearchQuery={teamSearchQuery}
        isSplitDivisionEvent={isSplitDivisionEvent}
        participantDivisionSelectData={participantDivisionSelectData}
        selectedAddTeamDivisionId={selectedAddTeamDivisionId}
        organizationIdForParticipants={organizationIdForParticipants}
        organizationTeamsLoading={organizationTeamsLoading}
        displayedOrganizationTeams={displayedOrganizationTeams}
        hasTeamSearchInput={hasTeamSearchInput}
        teamSearchMeetsMinimum={teamSearchMeetsMinimum}
        searchTeamsLoading={searchTeamsLoading}
        searchResultTeams={searchResultTeams}
        participantsUpdatingTeamId={participantsUpdatingTeamId}
        onOpenedChange={setIsAddTeamModalOpen}
        onTeamSearchQueryChange={setTeamSearchQuery}
        onSelectedAddTeamDivisionIdChange={setSelectedAddTeamDivisionId}
        onAddTeamToParticipants={(team) => { void handleAddTeamToParticipants(team); }}
        renderParticipantTeamCard={renderParticipantTeamCard}
      />
      <ParticipantTeamDetailModal
        team={selectedParticipantTeam}
        onClose={() => {
          setSelectedParticipantTeam(null);
        }}
      />
      <RefundTeamModal
        team={selectedRefundTeam}
        fullScreen={Boolean(isMobile)}
        error={refundError}
        loading={refundLoading}
        snapshot={refundSnapshot}
        refundAmountDraftByPaymentId={refundAmountDraftByPaymentId}
        manualProofAmountDraftById={manualProofAmountDraftById}
        refundingPaymentId={refundingPaymentId}
        cancellingPendingBillPaymentId={cancellingPendingBillPaymentId}
        reviewingManualProofId={reviewingManualProofId}
        onClose={closeRefundModal}
        onRefundAmountDraftChange={handleRefundAmountDraftChange}
        onManualProofAmountDraftChange={handleManualProofAmountDraftChange}
        onSubmitRefund={(paymentId) => { void submitRefund(paymentId); }}
        onCancelPendingPayment={(billId, paymentId) => { void cancelPendingBillPayment(billId, paymentId); }}
        onReviewManualProof={(billId, paymentId, proofId, decision) => { void reviewManualPaymentProof(billId, paymentId, proofId, decision); }}
      />
      <CreateBillModal
        team={createBillTeam}
        error={createBillError}
        ownerType={createBillOwnerType}
        ownerId={createBillOwnerId}
        amountDollars={createBillAmountDollars}
        taxDollars={createBillTaxDollars}
        label={createBillLabel}
        allowSplit={createBillAllowSplit}
        isUserOnly={createBillIsUserOnly}
        userOptions={createBillUserOptions}
        previewLineItems={createBillPreviewLineItems}
        totalCents={createBillTotalCents}
        creating={creatingBill}
        onClose={closeCreateBillModal}
        onOwnerTypeChange={setCreateBillOwnerType}
        onOwnerIdChange={setCreateBillOwnerId}
        onAmountDollarsChange={setCreateBillAmountDollars}
        onTaxDollarsChange={setCreateBillTaxDollars}
        onLabelChange={setCreateBillLabel}
        onAllowSplitChange={setCreateBillAllowSplit}
        onSubmit={() => { void submitCreateBill(); }}
      />
      <EventComplianceModal
        opened={Boolean(selectedComplianceTeamId)}
        fullScreen={Boolean(isMobile)}
        teamName={selectedComplianceTeam?.name}
        summary={selectedComplianceSummary}
        loading={teamComplianceLoading}
        onClose={() => {
          setSelectedComplianceTeamId(null);
        }}
      />
      <EventMatchModals
        activeEvent={activeEvent}
        activeMatches={activeMatches}
        participantTeams={participantTeams}
        scoreUpdateMatch={scoreUpdateMatch}
        isScoreModalOpen={isScoreModalOpen}
        canManageScore={canUserManageScore}
        canEditRoster={canUserEditMatchRoster}
        onOpenRoster={openRosterForMatch}
        onScoreChange={handleScoreChange}
        onSetComplete={handleSetComplete}
        onScoreSubmit={handleScoreSubmit}
        onScoreModalClose={closeScoreModal}
        isMatchEditorOpen={isMatchEditorOpen}
        matchBeingEdited={matchBeingEdited}
        matchEditorTeams={matchEditorTeams}
        matchEditorOfficials={matchEditorOfficials}
        canEditMatches={canEditMatches}
        matchEditorContext={matchEditorContext}
        scheduleBracketPlaceholderAssignments={scheduleBracketPlaceholderAssignments}
        onMatchEditClose={handleMatchEditClose}
        onMatchEditSave={handleMatchEditSave}
        onMatchDelete={handleMatchDelete}
      />
      <MatchRosterModal
        opened={Boolean(rosterModalMatch && rosterModalTeam)}
        eventId={normalizeIdToken(activeEvent?.$id ?? eventId)}
        match={rosterModalMatch}
        team={rosterModalTeam}
        onClose={() => {
          setRosterModalMatch(null);
          setRosterModalTeam(null);
        }}
      />
      <RentalCheckoutModals {...rentalCheckout} />
    </div>
  );
}

export default function EventSchedulePage() {
  return (
    <Suspense fallback={<Loading text="Opening event..." />}>
      <EventScheduleContent />
    </Suspense>
  );
}
