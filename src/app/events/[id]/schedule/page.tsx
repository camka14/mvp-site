'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Tabs, Stack, Table, UnstyledButton, Modal, Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { tournamentService } from '@/lib/tournamentService';
import { organizationService } from '@/lib/organizationService';
import { paymentService } from '@/lib/paymentService';
import { apiRequest } from '@/lib/apiClient';
import { normalizeApiEvent, normalizeApiMatch } from '@/lib/apiMappers';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { createClientId } from '@/lib/clientId';
import { createId } from '@/lib/id';
import { cloneEventAsTemplate, seedEventFromTemplate } from '@/lib/eventTemplates';
import { toEventPayload } from '@/types';
import type { Event, EventState, Field, FieldSurfaceType, Match, Team, TournamentBracket, Organization, Sport, PaymentIntent, TimeSlot } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueCalendarView from './components/LeagueCalendarView';
import TournamentBracketView from './components/TournamentBracketView';
import MatchEditModal from './components/MatchEditModal';
import EventForm, { EventFormHandle } from './components/EventForm';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import ScoreUpdateModal from './components/ScoreUpdateModal';
import PaymentModal, { PaymentEventSummary } from '@/components/ui/PaymentModal';

const cloneValue = <T,>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const structuredCloneFn = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
  if (structuredCloneFn) {
    return structuredCloneFn(value);
  }

  // Fallback handles circular references by walking the graph manually
  const seen = new WeakMap<object, any>();
  const cloneRecursive = (input: any): any => {
    if (input === null || typeof input !== 'object') {
      return input;
    }

    if (seen.has(input)) {
      return seen.get(input);
    }

    if (Array.isArray(input)) {
      const arr: any[] = [];
      seen.set(input, arr);
      for (const item of input) {
        arr.push(cloneRecursive(item));
      }
      return arr;
    }

    if (input instanceof Date) {
      return new Date(input.getTime());
    }

    const cloned: Record<string, unknown> = {};
    seen.set(input, cloned);
    for (const key of Object.keys(input)) {
      cloned[key] = cloneRecursive(input[key]);
    }
    return cloned;
  };

  return cloneRecursive(value);
};

const formatLatLngLabel = (lat?: number, lng?: number): string => {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return '';
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};


type StandingsSortField = 'team' | 'wins' | 'losses' | 'draws' | 'points';

type StandingsRow = {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  matchesPlayed: number;
  points: number;
};

type RankedStandingsRow = StandingsRow & { rank: number };

type LocationDefaults = {
  location?: string;
  coordinates?: [number, number];
};

// Main schedule page component that protects access and renders league schedule/bracket content.
function EventScheduleContent() {
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const eventId = params?.id as string | undefined;
  const isPreview = searchParams?.get('preview') === '1';
  const isEditParam = searchParams?.get('mode') === 'edit';
  const isCreateMode = searchParams?.get('create') === '1';
  const orgIdParam = searchParams?.get('orgId') || undefined;
  const hostOrgIdParam = searchParams?.get('hostOrgId') || undefined;
  const rentalOrgIdParam = searchParams?.get('rentalOrgId') || undefined;
  const rentalStartParam = searchParams?.get('rentalStart') || undefined;
  const rentalEndParam = searchParams?.get('rentalEnd') || undefined;
  const rentalFieldIdParam = searchParams?.get('rentalFieldId') || undefined;
  const rentalFieldNameParam = searchParams?.get('rentalFieldName') || undefined;
  const rentalFieldNumberParam = searchParams?.get('rentalFieldNumber') || undefined;
  const rentalFieldTypeParam = searchParams?.get('rentalFieldType') || undefined;
  const rentalLocationParam = searchParams?.get('rentalLocation') || undefined;
  const rentalLatParam = searchParams?.get('rentalLat') || undefined;
  const rentalLngParam = searchParams?.get('rentalLng') || undefined;
  const rentalPriceParam = searchParams?.get('rentalPriceCents') || undefined;
  const isRentalFlow = Boolean(rentalStartParam && rentalEndParam);
  const resolvedHostOrgId = hostOrgIdParam ?? (!isRentalFlow ? orgIdParam : undefined);
  const resolvedRentalOrgId = rentalOrgIdParam ?? (isRentalFlow ? orgIdParam : undefined);

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [changesEvent, setChangesEvent] = useState<Event | null>(null);
  const [changesMatches, setChangesMatches] = useState<Match[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('details');
  const [isMatchEditorOpen, setIsMatchEditorOpen] = useState(false);
  const [standingsSort, setStandingsSort] = useState<{ field: StandingsSortField; direction: 'asc' | 'desc' }>({
    field: 'points',
    direction: 'desc',
  });
  const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);
  const [scoreUpdateMatch, setScoreUpdateMatch] = useState<Match | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [organizationForCreate, setOrganizationForCreate] = useState<Organization | null>(null);
  const [rentalOrganization, setRentalOrganization] = useState<Organization | null>(null);
  const [formSeedEvent, setFormSeedEvent] = useState<Event | null>(null);
  const [rentalPaymentData, setRentalPaymentData] = useState<PaymentIntent | null>(null);
  const [showRentalPayment, setShowRentalPayment] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateSummaries, setTemplateSummaries] = useState<Array<{ id: string; name: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateStartDate, setSelectedTemplateStartDate] = useState<Date | null>(null);
  const [templateSeedKey, setTemplateSeedKey] = useState(0);
  const templatePromptResolvedRef = useRef(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
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

  const userLocationLabel = useMemo(() => {
    if (userLocationInfo) {
      const parts = [userLocationInfo.city, userLocationInfo.state]
        .filter((part): part is string => Boolean(part && part.trim().length > 0));
      if (parts.length) {
        return parts.join(', ');
      }
      if (userLocationInfo.zipCode && userLocationInfo.zipCode.trim().length > 0) {
        return userLocationInfo.zipCode;
      }
      if (userLocationInfo.country && userLocationInfo.country.trim().length > 0) {
        return userLocationInfo.country;
      }
      if (typeof userLocationInfo.lat === 'number' && typeof userLocationInfo.lng === 'number') {
        return formatLatLngLabel(userLocationInfo.lat, userLocationInfo.lng);
      }
    }
    if (userLocation) {
      return formatLatLngLabel(userLocation.lat, userLocation.lng);
    }
    return '';
  }, [userLocationInfo, userLocation]);

  const userCoordinates = useMemo<[number, number] | null>(() => {
    if (!userLocation) {
      return null;
    }
    if (
      typeof userLocation.lat !== 'number' ||
      typeof userLocation.lng !== 'number' ||
      !Number.isFinite(userLocation.lat) ||
      !Number.isFinite(userLocation.lng)
    ) {
      return null;
    }
    return [userLocation.lng, userLocation.lat];
  }, [userLocation]);

  const buildLocationDefaults = useCallback(
    (organizationInput?: Organization | null): LocationDefaults | undefined => {
      const orgLabel = organizationInput?.location?.trim() ?? '';
      const orgCoordinates =
        Array.isArray(organizationInput?.coordinates) &&
          typeof organizationInput.coordinates[0] === 'number' &&
          typeof organizationInput.coordinates[1] === 'number'
          ? (organizationInput.coordinates as [number, number])
          : undefined;

      if (organizationInput && (orgLabel || orgCoordinates)) {
        return {
          location: orgLabel || userLocationLabel,
          coordinates: orgCoordinates ?? userCoordinates ?? undefined,
        };
      }

      if (userLocationLabel || userCoordinates) {
        return {
          location: userLocationLabel,
          coordinates: userCoordinates ?? undefined,
        };
      }

      return undefined;
    },
    [userCoordinates, userLocationLabel],
  );

  const createLocationDefaults = useMemo(
    () => buildLocationDefaults(organizationForCreate),
    [buildLocationDefaults, organizationForCreate],
  );

  const rentalImmutableDefaults = useMemo<Partial<Event> | undefined>(() => {
    if (!isCreateMode || !rentalStartParam || !rentalEndParam) {
      return undefined;
    }

    const normalizedStart = formatLocalDateTime(rentalStartParam);
    const normalizedEnd = formatLocalDateTime(rentalEndParam);
    if (!normalizedStart || !normalizedEnd) {
      return undefined;
    }

    const rentalFieldFromOrg = rentalFieldIdParam
      ? (rentalOrganization?.fields || []).find((field) => field?.$id === rentalFieldIdParam)
      : undefined;

    const fallbackFieldNumber = (() => {
      if (typeof rentalFieldFromOrg?.fieldNumber === 'number') {
        return rentalFieldFromOrg.fieldNumber;
      }
      const parsed = rentalFieldNumberParam ? Number(rentalFieldNumberParam) : NaN;
      return Number.isFinite(parsed) ? parsed : 1;
    })();

    const rentalField: Field | undefined = (() => {
      if (rentalFieldFromOrg) {
        return rentalFieldFromOrg as Field;
      }
      if (!rentalFieldIdParam) {
        return undefined;
      }
      const fieldType = (rentalFieldTypeParam?.toUpperCase?.() || 'INDOOR') as FieldSurfaceType;
      return {
        $id: rentalFieldIdParam,
        name: rentalFieldNameParam?.trim() || `Field ${fallbackFieldNumber}`,
        fieldNumber: fallbackFieldNumber,
        location: rentalLocationParam ?? '',
        lat: rentalCoordinates?.[1] ?? 0,
        long: rentalCoordinates?.[0] ?? 0,
        type: fieldType,
      };
    })();

    const resolvedField = rentalFieldFromOrg ?? rentalField;
    const derivedLocation = rentalLocationParam ?? resolvedField?.location ?? rentalOrganization?.location ?? '';
    const derivedCoordinates =
      rentalCoordinates ??
      (resolvedField ? [resolvedField.long, resolvedField.lat] as [number, number] : undefined) ??
      (rentalOrganization?.coordinates as [number, number] | undefined);

    const defaults: Partial<Event> = {
      start: normalizedStart,
      end: normalizedEnd,
      location: derivedLocation,
    };

    if (derivedCoordinates) {
      defaults.coordinates = derivedCoordinates;
    }
    if (resolvedField) {
      defaults.fields = [resolvedField];
      defaults.fieldType = resolvedField.type;
    }

    return defaults;
  }, [
    isCreateMode,
    rentalOrganization,
    rentalCoordinates,
    rentalEndParam,
    rentalFieldIdParam,
    rentalFieldNameParam,
    rentalFieldNumberParam,
    rentalFieldTypeParam,
    rentalLocationParam,
    rentalStartParam,
  ]);

  const rentalPurchaseContext = useMemo(() => {
    if (!isCreateMode || !rentalStartParam || !rentalEndParam) {
      return undefined;
    }
    const normalizedStart = formatLocalDateTime(rentalStartParam);
    const normalizedEnd = formatLocalDateTime(rentalEndParam);
    if (!normalizedStart || !normalizedEnd) {
      return undefined;
    }
    const priceCents = rentalPriceParam ? Number(rentalPriceParam) : undefined;
    const normalizedPrice = Number.isFinite(priceCents) ? Number(priceCents) : undefined;
    return {
      start: normalizedStart,
      end: normalizedEnd,
      fieldId: rentalFieldIdParam ?? undefined,
      priceCents: normalizedPrice,
    };
  }, [isCreateMode, rentalEndParam, rentalFieldIdParam, rentalPriceParam, rentalStartParam]);

  const rentalPurchaseTimeSlot = useMemo<TimeSlot | null>(() => {
    if (!rentalPurchaseContext) {
      return null;
    }
    const startDate = parseLocalDateTime(rentalPurchaseContext.start);
    const endDate = parseLocalDateTime(rentalPurchaseContext.end);
    if (!startDate || !endDate) {
      return null;
    }

    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    const draftFields = Array.isArray(changesEvent?.fields)
      ? changesEvent?.fields
      : rentalImmutableDefaults?.fields;
    const fallbackFieldId = Array.isArray(draftFields) && draftFields.length > 0
      ? (draftFields[0] as Field).$id
      : undefined;
    const scheduledFieldId = rentalPurchaseContext.fieldId ?? fallbackFieldId;
    if (!scheduledFieldId) {
      return null;
    }

    const dayOfWeek = ((startDate.getDay() + 7) % 7) as TimeSlot['dayOfWeek'];
    const price = Number.isFinite(rentalPurchaseContext.priceCents) ? Number(rentalPurchaseContext.priceCents) : undefined;

    return {
      $id: createClientId(),
      dayOfWeek,
      startTimeMinutes: startMinutes,
      endTimeMinutes: endMinutes,
      startDate: formatLocalDateTime(startDate),
      endDate: formatLocalDateTime(endDate),
      repeating: false,
      scheduledFieldId,
      price,
    };
  }, [changesEvent?.fields, rentalImmutableDefaults?.fields, rentalPurchaseContext]);

  const usingChangeCopies = Boolean(changesEvent);
  const activeEvent = usingChangeCopies ? changesEvent : event;
  const isUnpublished = (activeEvent?.state ?? 'PUBLISHED') === 'UNPUBLISHED' || activeEvent?.state === 'DRAFT';
  const isEditingEvent = isPreview || isEditParam || isUnpublished;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
  const eventTypeForView = activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT';
  const isTournament = eventTypeForView === 'TOURNAMENT';
  const isLeague = eventTypeForView === 'LEAGUE';
  const isHost = activeEvent?.hostId === user?.$id;
  const entityLabel = isTournament ? 'Tournament' : isLeague ? 'League' : 'Event';
  const canEditMatches = Boolean(isHost && isEditingEvent);
  const shouldShowCreationSheet = Boolean(isCreateMode || (isEditingEvent && isHost && user));
  const createFormId = 'create-event-form';
  const templateSelectData = useMemo(
    () => templateSummaries.map((template) => ({ value: template.id, label: template.name })),
    [templateSummaries],
  );
  const defaultSport: Sport = {
    $id: '',
    name: '',
    usePointsForWin: false,
    usePointsForDraw: false,
    usePointsForLoss: false,
    usePointsForForfeitWin: false,
    usePointsForForfeitLoss: false,
    usePointsPerSetWin: false,
    usePointsPerSetLoss: false,
    usePointsPerGameWin: false,
    usePointsPerGameLoss: false,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
    useMaxGoalBonusPoints: false,
    useMinGoalBonusThreshold: false,
    usePointsForShutout: false,
    usePointsForCleanSheet: false,
    useApplyShutoutOnlyIfWin: false,
    usePointsPerGoalDifference: false,
    useMaxGoalDifferencePoints: false,
    usePointsPenaltyPerGoalDifference: false,
    usePointsForParticipation: false,
    usePointsForNoShow: false,
    usePointsForWinStreakBonus: false,
    useWinStreakThreshold: false,
    usePointsForOvertimeWin: false,
    usePointsForOvertimeLoss: false,
    useOvertimeEnabled: false,
    usePointsPerRedCard: false,
    usePointsPerYellowCard: false,
    usePointsPerPenalty: false,
    useMaxPenaltyDeductions: false,
    useMaxPointsPerMatch: false,
    useMinPointsPerMatch: false,
    useGoalDifferenceTiebreaker: false,
    useHeadToHeadTiebreaker: false,
    useTotalGoalsTiebreaker: false,
    useEnableBonusForComebackWin: false,
    useBonusPointsForComebackWin: false,
    useEnableBonusForHighScoringMatch: false,
    useHighScoringThreshold: false,
    useBonusPointsForHighScoringMatch: false,
    useEnablePenaltyUnsporting: false,
    usePenaltyPointsUnsporting: false,
    usePointPrecision: false,
    $createdAt: '',
    $updatedAt: '',
  };

  const closeTemplatePrompt = useCallback(() => {
    templatePromptResolvedRef.current = true;
    setTemplatePromptOpen(false);
  }, []);

  const handleApplyTemplate = useCallback(async () => {
    if (!isCreateMode || !user?.$id) {
      closeTemplatePrompt();
      return;
    }

    if (!selectedTemplateId) {
      setTemplatesError('Select a template to continue.');
      return;
    }
    if (!selectedTemplateStartDate) {
      setTemplatesError('Select a start date to continue.');
      return;
    }
    if (!eventId) {
      setTemplatesError('Missing event id for creation.');
      return;
    }

    setApplyingTemplate(true);
    setTemplatesError(null);
    setActionError(null);

    try {
      const template = await eventService.getEventWithRelations(selectedTemplateId);
      if (!template) {
        throw new Error('Template not found.');
      }

      const seeded = seedEventFromTemplate(template, {
        newEventId: eventId,
        newStartDate: selectedTemplateStartDate,
        hostId: user.$id,
        idFactory: createId,
      });

      setChangesEvent(seeded);
      setHasUnsavedChanges(false);
      setTemplateSeedKey((prev) => prev + 1);
      closeTemplatePrompt();
    } catch (error) {
      console.error('Failed to apply template:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to apply template.');
    } finally {
      setApplyingTemplate(false);
    }
  }, [closeTemplatePrompt, eventId, isCreateMode, selectedTemplateId, selectedTemplateStartDate, user?.$id]);

  const handleCreateTemplateFromEvent = useCallback(async () => {
    if (!activeEvent || !user?.$id) {
      return;
    }
    if (!isHost) {
      setActionError('Only the host can create templates from this event.');
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

    try {
      const full = await eventService.getEventWithRelations(activeEvent.$id);
      if (!full) {
        throw new Error('Unable to load event details for templating.');
      }

      const templateId = createId();
      const templateEvent = cloneEventAsTemplate(full, { templateId, idFactory: createId });
      const payload = toEventPayload(templateEvent);
      await apiRequest('/api/events', {
        method: 'POST',
        body: {
          id: templateId,
          event: { ...payload, id: templateId },
        },
      });

      setInfoMessage(`Template created: ${templateEvent.name}`);
    } catch (error) {
      console.error('Failed to create event template:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to create template.');
    } finally {
      setCreatingTemplate(false);
    }
  }, [activeEvent, creatingTemplate, isHost, user?.$id]);

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

  const resolveTeam = useCallback(
    (value: Match['team1'] | string | null | undefined): Team | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        return teamsById.get(value) ?? null;
      }
      if (typeof value === 'object') {
        return (value as Team) ?? null;
      }
      return null;
    },
    [teamsById],
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

  const findUserTeam = useCallback(
    (match?: Match | null) => {
      if (!user?.$id) return null;
      const candidates: (Match['team1'] | string | null | undefined)[] = [];
      if (match) {
        candidates.push(match.team1 ?? match.team1Id);
        candidates.push(match.team2 ?? match.team2Id);
        candidates.push(match.teamReferee ?? match.teamRefereeId);
      }
      for (const candidate of candidates) {
        const team = resolveTeam(candidate);
        if (team && userOnTeam(team)) {
          return team;
        }
      }
      for (const team of teamsById.values()) {
        if (userOnTeam(team)) {
          return team;
        }
      }
      return null;
    },
    [resolveTeam, teamsById, user?.$id, userOnTeam],
  );

  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const pendingRegularEventRef = useRef<Partial<Event> | null>(null);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!isCreateMode || !user) return;
    setChangesEvent((prev) => {
      if (prev) return prev;
      const start = rentalImmutableDefaults?.start ?? formatLocalDateTime(new Date());
      const end = rentalImmutableDefaults?.end ?? formatLocalDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
      const locationDefaults = createLocationDefaults;
      const rentalLocation = (rentalImmutableDefaults?.location ?? '').trim();
      const rentalCoordinates = rentalImmutableDefaults?.coordinates;
      return {
        $id: eventId || 'temp-id',
        name: '',
        description: '',
        location: rentalLocation || locationDefaults?.location || '',
        coordinates: rentalCoordinates ?? locationDefaults?.coordinates ?? [0, 0],
        start,
        end,
        eventType: 'EVENT',
        sportId: '',
        sport: defaultSport,
        fieldType: 'INDOOR',
        price: 0,
        maxParticipants: 10,
        teamSizeLimit: 2,
        teamSignup: false,
        singleDivision: false,
        divisions: [],
        cancellationRefundHours: 24,
        registrationCutoffHours: 2,
        hostId: user.$id,
        state: 'DRAFT' as EventState,
        requiredTemplateIds: [],
        $createdAt: '',
        $updatedAt: '',
        attendees: 0,
        imageId: '',
        seedColor: 0,
        waitListIds: [],
        freeAgentIds: [],
        players: [],
        teams: [],
        referees: [],
        refereeIds: [],
      } as Event;
    });
  }, [createLocationDefaults, eventId, isCreateMode, rentalImmutableDefaults, user]);

  // Create mode: if the host has event templates, prompt to start from one.
  useEffect(() => {
    if (!isCreateMode || !user?.$id || isGuest || isRentalFlow) {
      setTemplateSummaries([]);
      setTemplatePromptOpen(false);
      setTemplatesError(null);
      return;
    }
    if (templatePromptResolvedRef.current) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setTemplatesLoading(true);
        setTemplatesError(null);
        const qs = new URLSearchParams();
        qs.set('state', 'TEMPLATE');
        qs.set('hostId', user.$id);
        if (resolvedHostOrgId) {
          qs.set('organizationId', resolvedHostOrgId);
        }
        qs.set('limit', '50');
        const response = await apiRequest<{ events?: any[] }>(`/api/events?${qs.toString()}`);
        const rows = Array.isArray(response?.events) ? response.events : [];
        const summaries = rows
          .map((row) => ({
            id: String(row?.$id ?? row?.id ?? ''),
            name: String(row?.name ?? 'Untitled Template'),
          }))
          .filter((entry) => entry.id.length > 0);

        if (cancelled) return;
        setTemplateSummaries(summaries);

        if (summaries.length > 0 && !templatePromptResolvedRef.current) {
          setTemplatePromptOpen(true);
          setSelectedTemplateId((prev) => prev ?? null);
          setSelectedTemplateStartDate((prev) => {
            if (prev) return prev;
            const base = changesEvent?.start ? parseLocalDateTime(changesEvent.start) : null;
            const seed = base ?? new Date();
            const day = new Date(seed);
            day.setHours(0, 0, 0, 0);
            return day;
          });
        } else {
          setTemplatePromptOpen(false);
        }
      } catch (error) {
        if (cancelled) return;
        setTemplateSummaries([]);
        setTemplatePromptOpen(false);
        setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [changesEvent?.start, isCreateMode, isGuest, isRentalFlow, resolvedHostOrgId, user?.$id]);

  useEffect(() => {
    if (!isCreateMode) {
      setFormSeedEvent(null);
      return;
    }
    if (!changesEvent) {
      return;
    }
    if (!hasUnsavedChanges) {
      setFormSeedEvent(changesEvent);
    }
  }, [changesEvent, hasUnsavedChanges, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      setOrganizationForCreate(null);
      setRentalOrganization(null);
      return;
    }

    let cancelled = false;

    const loadOrganizationsForCreate = async () => {
      const hostOrgId = resolvedHostOrgId;
      const rentalOrgId = resolvedRentalOrgId;

      if (!hostOrgId && !rentalOrgId) {
        setOrganizationForCreate(null);
        setRentalOrganization(null);
        return;
      }

      try {
        const hostPromise = hostOrgId
          ? organizationService.getOrganizationById(hostOrgId, true)
          : Promise.resolve(null);
        const rentalPromise =
          rentalOrgId && rentalOrgId !== hostOrgId
            ? organizationService.getOrganizationById(rentalOrgId, true)
            : Promise.resolve(null);
        const [hostOrg, rentalOrg] = await Promise.all([hostPromise, rentalPromise]);

        if (cancelled) return;

        const resolvedHostOrg = hostOrg ? (hostOrg as Organization) : null;
        const resolvedRentalOrg = rentalOrgId === hostOrgId
          ? resolvedHostOrg
          : rentalOrg
            ? (rentalOrg as Organization)
            : null;

        setOrganizationForCreate(resolvedHostOrg);
        setRentalOrganization(resolvedRentalOrg);

        if (resolvedHostOrg) {
          setChangesEvent((prev) => {
            const base = prev ?? ({ $id: eventId, state: 'DRAFT' } as Event);
            const orgLocation = (resolvedHostOrg.location ?? '').trim();
            const orgCoordinates =
              Array.isArray(resolvedHostOrg.coordinates) &&
                typeof resolvedHostOrg.coordinates[0] === 'number' &&
                typeof resolvedHostOrg.coordinates[1] === 'number'
                ? (resolvedHostOrg.coordinates as [number, number])
                : undefined;
            return {
              ...base,
              organization: resolvedHostOrg,
              organizationId: resolvedHostOrg.$id,
              hostId: base.hostId ?? resolvedHostOrg.ownerId ?? base.hostId,
              fields: Array.isArray(resolvedHostOrg.fields) ? resolvedHostOrg.fields : base.fields,
              refereeIds: Array.isArray(resolvedHostOrg.refIds) ? resolvedHostOrg.refIds : base.refereeIds,
              referees: Array.isArray(resolvedHostOrg.referees) ? resolvedHostOrg.referees : base.referees,
              location: orgLocation || base.location || '',
              coordinates: orgCoordinates ?? base.coordinates ?? [0, 0],
            } as Event;
          });
        }
      } catch (error) {
        console.warn('Failed to load organizations for create:', error);
      }
    };

    loadOrganizationsForCreate();

    return () => {
      cancelled = true;
    };
  }, [eventId, isCreateMode, resolvedHostOrgId, resolvedRentalOrgId]);

  const hydrateEvent = useCallback((loadedEvent: Event) => {
    const eventClone = cloneValue(loadedEvent) as Event;
    setEvent(eventClone);

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

  const publishButtonLabel = (() => {
    if (isCreateMode) {
      return 'Create Event';
    }
    if (!activeEvent || isPreview || isUnpublished) return `Publish ${entityLabel}`;
    if (!isEditingEvent) return `Edit ${entityLabel}`;
    return `Save ${entityLabel} Changes`;
  })();
  const cancelButtonLabel = (() => {
    if (isCreateMode) return 'Discard';
    if (isUnpublished) return `Delete ${entityLabel}`;
    if (isPreview) return `Cancel ${entityLabel} Preview`;
    if (isEditingEvent) return `Discard ${entityLabel} Changes`;
    return `Cancel ${entityLabel}`;
  })();

  const rentalPaymentEventSummary: PaymentEventSummary = useMemo(() => {
    const source = changesEvent ?? activeEvent ?? event;
    return {
      name: source?.name || 'Rental Event',
      location: source?.location || '',
      eventType: source?.eventType ?? 'EVENT',
      price: rentalPurchaseContext?.priceCents ?? 0,
      imageId: source?.imageId,
    };
  }, [activeEvent, changesEvent, event, rentalPurchaseContext?.priceCents]);

  // Kick off schedule loading once auth state is resolved or redirect unauthenticated users.
  // Hydrate event + match data from the API and sync local component state.
  const loadSchedule = useCallback(async () => {
    if (!eventId) return;
    if (isCreateMode) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const response = await apiRequest<any>(`/api/events/${eventId}`);
      const responseEvent = response?.event ?? response;
      const fetchedEvent = normalizeApiEvent(responseEvent ?? null);

      if (!fetchedEvent) {
        setError('League not found.');
        return;
      }

      if (Array.isArray(response?.matches)) {
        fetchedEvent.matches = response.matches.map((match: Match) => normalizeApiMatch(match));
      }

      hydrateEvent(fetchedEvent);
      if (!hasUnsavedChangesRef.current) {
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      setError('Failed to load league schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [eventId, hydrateEvent, isCreateMode]);

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

  const bracketMatchesMap = useMemo<Record<string, Match> | null>(() => {
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

  const playoffMatchIds = useMemo(() => new Set(playoffMatches.map((match) => match.$id)), [playoffMatches]);

  const leagueScoring = useMemo(
    () =>
      createLeagueScoringConfig(
        activeEvent && typeof activeEvent.leagueScoringConfig === 'object'
          ? activeEvent.leagueScoringConfig
          : null,
      ),
    [activeEvent?.leagueScoringConfig],
  );

  const baseStandings = useMemo<StandingsRow[]>(() => {
    if (!activeEvent) {
      return [];
    }

    const teamsArray = Array.isArray(activeEvent.teams) ? (activeEvent.teams as Team[]) : [];
    const teamsById = new Map<string, Team>();
    teamsArray.forEach((team) => {
      if (team?.$id) {
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

    teamsArray.forEach((team) => {
      if (team?.$id) {
        ensureRow(team.$id, team);
      }
    });

    const sumPoints = (values: number[] | null | undefined): number =>
      Array.isArray(values)
        ? values.reduce((total, value) => (Number.isFinite(value) ? total + Number(value) : total), 0)
        : 0;

    activeMatches.forEach((match) => {
      if (playoffMatchIds.has(match.$id)) {
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

      const setResults = Array.isArray(match.setResults) ? match.setResults : [];
      const team1Wins = setResults.filter((result) => result === 1).length;
      const team2Wins = setResults.filter((result) => result === 2).length;
      const allSetsResolved = setResults.length > 0 && setResults.every((result) => result === 1 || result === 2);

      const team1Total = sumPoints(match.team1Points);
      const team2Total = sumPoints(match.team2Points);

      let outcome: 'team1' | 'team2' | 'draw' | null = null;
      if (team1Wins > team2Wins) {
        outcome = 'team1';
      } else if (team2Wins > team1Wins) {
        outcome = 'team2';
      } else if (allSetsResolved) {
        outcome = 'draw';
      } else if (team1Total > 0 || team2Total > 0) {
        if (team1Total > team2Total) {
          outcome = 'team1';
        } else if (team2Total > team1Total) {
          outcome = 'team2';
        } else {
          outcome = 'draw';
        }
      }

      if (!outcome) {
        return;
      }

      row1.goalsFor += team1Total;
      row1.goalsAgainst += team2Total;
      row2.goalsFor += team2Total;
      row2.goalsAgainst += team1Total;

      if (outcome === 'team1') {
        row1.wins += 1;
        row2.losses += 1;
      } else if (outcome === 'team2') {
        row2.wins += 1;
        row1.losses += 1;
      } else {
        row1.draws += 1;
        row2.draws += 1;
      }
    });

    const precision = Math.max(0, leagueScoring.pointPrecision ?? 0);
    const multiplier = precision > 0 ? 10 ** precision : 1;

    rows.forEach((row) => {
      row.matchesPlayed = row.wins + row.losses + row.draws;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      const basePoints =
        row.wins * leagueScoring.pointsForWin +
        row.draws * leagueScoring.pointsForDraw +
        row.losses * leagueScoring.pointsForLoss;
      const goalPoints =
        row.goalsFor * leagueScoring.pointsPerGoalScored +
        row.goalsAgainst * leagueScoring.pointsPerGoalConceded;
      const totalPoints = basePoints + goalPoints;
      row.points = precision > 0 ? Math.round(totalPoints * multiplier) / multiplier : totalPoints;
    });

    return Array.from(rows.values()).map((row) => ({ ...row }));
  }, [activeEvent, activeMatches, playoffMatchIds, leagueScoring]);

  const standings = useMemo<RankedStandingsRow[]>(() => {
    if (baseStandings.length === 0) {
      return [];
    }

    const sorted = [...baseStandings];
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
        (x: StandingsRow, y: StandingsRow) => y.wins - x.wins,
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
  }, [baseStandings, standingsSort]);

  const hasRecordedMatches = standings.some((row) => row.matchesPlayed > 0);
  const pointsDisplayPrecision = Math.max(0, leagueScoring.pointPrecision ?? 0);

  const bracketData = useMemo<TournamentBracket | null>(() => {
    if (!activeEvent || !bracketMatchesMap) {
      return null;
    }

    return {
      tournament: activeEvent,
      matches: bracketMatchesMap,
      teams: Array.isArray(activeEvent.teams) ? activeEvent.teams : [],
      isHost,
      canManage: !isPreview && isHost,
    };
  }, [activeEvent, bracketMatchesMap, isPreview, user?.$id]);

  const showScheduleTab = isLeague;
  const showStandingsTab = isLeague;
  const defaultTab = showScheduleTab ? 'schedule' : 'details';
  const shouldShowBracketTab = !!bracketData || isPreview;

  // Ensure the bracket tab is only active when playoff data exists or preview mode demands it.
  useEffect(() => {
    if (!shouldShowBracketTab && activeTab === 'bracket') {
      setActiveTab(defaultTab);
    }
  }, [shouldShowBracketTab, activeTab, defaultTab]);

  useEffect(() => {
    const request = searchParams?.get('tab');
    const allowed = new Set<string>(['details']);
    if (showScheduleTab) {
      allowed.add('schedule');
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
    }

    const desired = request && allowed.has(request) ? request : defaultTab;
    setActiveTab(desired);
  }, [searchParams, shouldShowBracketTab, showScheduleTab, defaultTab]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    const allowed = new Set<string>(['details']);
    if (showScheduleTab) {
      allowed.add('schedule');
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
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

  const handleDetailsClose = useCallback(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const getDraftFromForm = useCallback(async (): Promise<Partial<Event> | null> => {
    const formApi = eventFormRef.current;
    if (!formApi) {
      setSubmitError('Form is not ready to submit.');
      return null;
    }

    const isValid = await formApi.validate();
    if (!isValid) {
      setSubmitError('Please fix the highlighted fields before submitting.');
      return null;
    }

    return formApi.getDraft();
  }, [setSubmitError]);

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
  }, []);

  const buildSchedulePayload = useCallback(
    (draft: Partial<Event>): Record<string, unknown> => {
      const resolvedId = typeof draft.$id === 'string' && draft.$id.length > 0
        ? draft.$id
        : eventId ?? createClientId();
      const normalizedDraft = { ...draft, $id: resolvedId } as Event;
      return toEventPayload(normalizedDraft) as Record<string, unknown>;
    },
    [eventId],
  );

  const schedulePreview = useCallback(
    async (draft: Partial<Event>) => {
      if (!draft) {
        return;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);

      try {
        const payload = buildSchedulePayload(draft);
        const scheduleEventId = !isCreateMode ? eventId : undefined;
        const result = await eventService.scheduleEvent(payload, { eventId: scheduleEventId });
        if (!result?.event) {
          throw new Error('Failed to generate schedule preview.');
        }

        handlePreviewEventUpdate(result.event);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('create');
          params.delete('mode');
          params.set('preview', '1');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }
      } catch (err) {
        console.error('Failed to generate schedule preview:', err);
        setError('Failed to generate schedule preview.');
      } finally {
        setPublishing(false);
      }
    },
    [buildSchedulePayload, eventId, handlePreviewEventUpdate, isCreateMode, pathname, router, searchParams],
  );

  const scheduleRegularEvent = useCallback(
    async (draft: Partial<Event>) => {
      if (!draft) {
        return;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);

      try {
        const payload = buildSchedulePayload(draft);
        const result = await eventService.scheduleEvent(payload);
        if (!result?.event) {
          throw new Error('Failed to create event.');
        }

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
      } catch (err) {
        console.error('Failed to create event:', err);
        setError('Failed to create event.');
      } finally {
        setPublishing(false);
      }
    },
    [buildSchedulePayload, eventId, handlePreviewEventUpdate, pathname, router, searchParams],
  );

  const closeRentalPaymentModal = useCallback(() => {
    setShowRentalPayment(false);
    setRentalPaymentData(null);
    pendingRegularEventRef.current = null;
  }, []);

  const handleRentalPaymentSuccess = useCallback(async () => {
    const pendingDraft = pendingRegularEventRef.current;
    if (pendingDraft) {
      await scheduleRegularEvent(pendingDraft);
    }
    closeRentalPaymentModal();
  }, [closeRentalPaymentModal, scheduleRegularEvent]);

  // Publish the league by persisting the latest event state back through the event service.
  const handlePublish = async () => {
    if (publishing) return;
    setSubmitError(null);

    // Create mode: invoke createEvent with current draft and redirect to the new event.
    if (isCreateMode) {
      const draft = await getDraftFromForm();
      if (!draft) {
        return;
      }

      const normalizedDraft = draft.$id ? draft : { ...draft, $id: draft.$id ?? eventId };
      setChangesEvent((prev) => {
        const base = prev ?? ({} as Event);
        return { ...base, ...(normalizedDraft as Event) };
      });

      if (normalizedDraft.eventType !== 'EVENT') {
        await schedulePreview(normalizedDraft);
        return;
      }

      const draftToSave: Partial<Event> = {
        ...normalizedDraft,
        state: 'UNPUBLISHED',
      };
      pendingRegularEventRef.current = draftToSave;

      if (rentalPurchaseTimeSlot && user) {
        const rentalPriceCents = typeof rentalPurchaseTimeSlot.price === 'number'
          ? rentalPurchaseTimeSlot.price
          : undefined;
        const requiresPayment = typeof rentalPriceCents === 'number' && rentalPriceCents > 0;

        if (requiresPayment) {
          setPublishing(true);
          try {
            const paymentIntent = await paymentService.createPaymentIntent(
              user,
              normalizedDraft as Event,
              undefined,
              rentalPurchaseTimeSlot,
              rentalOrganization ?? undefined,
            );
            setRentalPaymentData(paymentIntent);
            setShowRentalPayment(true);
          } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Failed to start rental payment.');
          } finally {
            setPublishing(false);
          }
          return;
        }
      }

      await scheduleRegularEvent(draftToSave);
      return;
    }

    if (!activeEvent) return;

    if (!isPreview && !isEditingEvent && !isUnpublished) {
      if (!pathname) return;
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('mode', 'edit');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (isEditingEvent) {
      if (!event) {
        setError(`Unable to save ${entityLabel.toLowerCase()} changes without the original event context.`);
        return;
      }

      const draft = await getDraftFromForm();
      if (!draft) {
        return;
      }

      const mergedDraft = { ...activeEvent, ...(draft as Event) } as Event;

      if (mergedDraft.eventType !== 'EVENT' && !isPreview) {
        await schedulePreview(mergedDraft);
        return;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);

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
        if (isUnpublished) {
          nextEvent.state = 'PUBLISHED' as EventState;
        }

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent);
        }

        if (!Array.isArray(updatedEvent.matches) || updatedEvent.matches.length === 0) {
          updatedEvent.matches = nextMatches;
        }

        hydrateEvent(updatedEvent);
        setHasUnsavedChanges(false);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('mode');
          params.delete('preview');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        await loadSchedule();
        setInfoMessage(isUnpublished ? `${entityLabel} published.` : `${entityLabel} changes saved.`);
      } catch (err) {
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        setError(isUnpublished ? `Failed to publish ${entityLabel.toLowerCase()}.` : `Failed to save ${entityLabel.toLowerCase()} changes.`);
      } finally {
        setPublishing(false);
      }
      return;
    }
  };

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

    const isUnpublished = (event.state ?? 'PUBLISHED') === 'UNPUBLISHED';

    if (isUnpublished) {
      if (!window.confirm(`Cancel this ${entityLabel.toLowerCase()}? This will delete the event, schedule, and any associated fields.`)) return;
      setCancelling(true);
      setError(null);
      try {
        await eventService.deleteUnpublishedEvent(event);
        router.push('/events');
      } catch (err) {
        console.error(`Failed to cancel ${entityLabel.toLowerCase()}:`, err);
        setError(`Failed to cancel ${entityLabel.toLowerCase()}.`);
        setCancelling(false);
      }
      return;
    }

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
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('mode');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (!window.confirm(`Cancel this ${entityLabel.toLowerCase()}? This will delete the schedule and the event.`)) return;
    setCancelling(true);
    setError(null);
    try {
      await leagueService.deleteMatchesByEvent(event.$id);
      await leagueService.deleteWeeklySchedulesForEvent(event.$id);
      await eventService.deleteEvent(event);
      router.push('/events');
    } catch (err) {
      console.error(`Failed to cancel ${entityLabel.toLowerCase()}:`, err);
      setError(`Failed to cancel ${entityLabel.toLowerCase()}.`);
      setCancelling(false);
    }
  };

  const handleClearChanges = useCallback(() => {
    if (!event) return;

    setChangesEvent(cloneValue(event) as Event);
    setChangesMatches(cloneValue(matches) as Match[]);
    setHasUnsavedChanges(false);
    setError(null);
    setInfoMessage(`${entityLabel} changes cleared.`);
  }, [entityLabel, event, matches]);

  useEffect(() => {
    if (!canEditMatches && isMatchEditorOpen) {
      setIsMatchEditorOpen(false);
      setMatchBeingEdited(null);
    }
  }, [canEditMatches, isMatchEditorOpen]);

  const handleMatchEditRequest = useCallback((match: Match) => {
    if (!canEditMatches) return;
    const sourceMatch = activeMatches.find((candidate) => candidate.$id === match.$id);
    if (!sourceMatch) return;
    setMatchBeingEdited(cloneValue(sourceMatch) as Match);
    setIsMatchEditorOpen(true);
  }, [activeMatches, canEditMatches]);

  const handleMatchEditClose = useCallback(() => {
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, []);

  const handleMatchEditSave = useCallback((updated: Match) => {
    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      let replaced = false;
      const next = base.map((item) => {
        if (item.$id === updated.$id) {
          replaced = true;
          return cloneValue(updated) as Match;
        }
        return item;
      });
      if (!replaced) {
        next.push(cloneValue(updated) as Match);
      }
      return next;
    });
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [matches]);

  const applyMatchUpdate = useCallback((updated: Match) => {
    const cloned = cloneValue(updated) as Match;
    const replaceInList = (list?: Match[]) => {
      if (!Array.isArray(list)) return list;
      let found = false;
      const next = list.map((item) => {
        if (item.$id === cloned.$id) {
          found = true;
          return cloneValue(cloned) as Match;
        }
        return item;
      });
      if (!found) {
        next.push(cloneValue(cloned) as Match);
      }
      return next;
    };

    setMatches((prev) => replaceInList(prev) as Match[]);
    setChangesMatches((prev) => replaceInList(prev) as Match[]);
    setEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: replaceInList(prev.matches as Match[] | undefined) as Match[] };
    });
    setChangesEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: replaceInList(prev.matches as Match[] | undefined) as Match[] };
    });
  }, []);

  const canUserManageScore = useCallback(
    (match: Match) => {
      if (!user?.$id) return false;
      if (match.refereeId === user.$id || match.referee?.$id === user.$id) {
        return true;
      }
      const teamRef = resolveTeam(match.teamReferee ?? match.teamRefereeId);
      return userOnTeam(teamRef);
    },
    [resolveTeam, user?.$id, userOnTeam],
  );

  const handleScoreChange = useCallback(
    async ({ matchId, team1Points, team2Points, setResults }: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      try {
        await tournamentService.updateMatchScores(targetEventId, matchId, { team1Points, team2Points, setResults });
      } catch (err) {
        console.warn('Non-blocking score sync failed:', err);
      }
    },
    [activeEvent?.$id, eventId],
  );

  const handleSetComplete = useCallback(
    async ({ matchId, team1Points, team2Points, setResults }: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      const updated = await tournamentService.updateMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
      applyMatchUpdate(updated as Match);
    },
    [applyMatchUpdate, activeEvent?.$id, eventId],
  );

  const handleMatchComplete = useCallback(
    async ({
      matchId,
      team1Points,
      team2Points,
      setResults,
      eventId,
    }: {
      matchId: string;
      team1Points: number[];
      team2Points: number[];
      setResults: number[];
      eventId?: string;
    }) => {
      const targetEventId = eventId ?? activeEvent?.$id;
      if (!targetEventId || activeEvent?.eventType === 'EVENT') {
        return;
      }
      await tournamentService.completeMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
    },
    [activeEvent?.$id, activeEvent?.eventType],
  );

  const handleScoreSubmit = useCallback(
    async (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      try {
        const updated = await tournamentService.updateMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
        applyMatchUpdate(updated as Match);
        setScoreUpdateMatch(null);
        setIsScoreModalOpen(false);
      } catch (err) {
        console.error('Failed to update score:', err);
        setError('Failed to update score. Please try again.');
      }
    },
    [applyMatchUpdate, activeEvent?.$id, eventId],
  );

  const handleMakeUserTeamReferee = useCallback(
    async (match: Match) => {
      const userTeam = findUserTeam(match);
      if (!userTeam) {
        window.alert('You need to be on a team in this event to referee this match.');
        return null;
      }

      const confirm = window.confirm('No referee is assigned. Make your team the referee for this match?');
      if (!confirm) return null;

      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return null;

      try {
        const updated = await tournamentService.updateMatch(targetEventId, match.$id, { teamRefereeId: userTeam.$id });
        const withTeam = {
          ...(updated as Match),
          teamReferee: (updated as Match).teamReferee ?? userTeam,
        };
        applyMatchUpdate(withTeam as Match);
        return withTeam as Match;
      } catch (err) {
        console.error('Failed to assign team referee:', err);
        setError('Failed to assign a referee to this match. Please try again.');
        return null;
      }
    },
    [applyMatchUpdate, findUserTeam, activeEvent?.$id, eventId],
  );

  const handleMatchClick = useCallback(
    async (match: Match) => {
      if (canEditMatches) {
        handleMatchEditRequest(match);
        return;
      }

      if (!user) {
        return;
      }

      const isUserReferee = match.refereeId === user.$id || match.referee?.$id === user.$id;
      const teamRef = resolveTeam(match.teamReferee ?? match.teamRefereeId);
      const userIsTeamRef = userOnTeam(teamRef);

      if (isUserReferee || userIsTeamRef) {
        setScoreUpdateMatch(match);
        setIsScoreModalOpen(true);
        return;
      }

      if (!match.referee && !match.refereeId && teamRef) {
        const updated = await handleMakeUserTeamReferee(match);
        if (updated) {
          setScoreUpdateMatch(updated);
          setIsScoreModalOpen(true);
        }
      }
    },
    [canEditMatches, handleMakeUserTeamReferee, handleMatchEditRequest, resolveTeam, user, userOnTeam],
  );

  const canClearChanges = Boolean(event && changesEvent && hasUnsavedChanges);

  const activeOrganization: Organization | null = useMemo(() => {
    if (activeEvent && typeof activeEvent.organization === 'object') {
      return activeEvent.organization as Organization;
    }
    return organizationForCreate;
  }, [activeEvent, organizationForCreate]);

  const activeLocationDefaults = useMemo(
    () => buildLocationDefaults(activeOrganization),
    [activeOrganization, buildLocationDefaults],
  );

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

  const renderSortIndicator = (field: StandingsSortField) => {
    if (standingsSort.field !== field) {
      return <span className="ml-1 text-xs text-gray-400">↕</span>;
    }
    return (
      <span className="ml-1 text-xs font-semibold text-gray-700">
        {standingsSort.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const formatPoints = (value: number): string => {
    if (pointsDisplayPrecision > 0) {
      return value.toFixed(pointsDisplayPrecision);
    }
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  };

  if (authLoading || !eventId) {
    return <Loading fullScreen text="Loading schedule..." />;
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <Loading fullScreen text="Loading schedule..." />
      </>
    );
  }

  if (isCreateMode && !activeEvent) {
    return (
      <>
        <Navigation />
        <Container size="lg" py="xl">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={2}>Create Event</Title>
              <Group gap="sm">
                <Button
                  color="green"
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={publishing}
                >
                  {publishButtonLabel}
                </Button>
                <Button
                  variant="default"
                  onClick={handleCancel}
                  loading={cancelling}
                >
                  {cancelButtonLabel}
                </Button>
              </Group>
            </Group>
            <Modal
              opened={templatePromptOpen}
              onClose={closeTemplatePrompt}
              title="Start from a template?"
              centered
              size="lg"
              fullScreen={Boolean(isMobile)}
              closeOnClickOutside={!applyingTemplate}
              closeOnEscape={!applyingTemplate}
              withCloseButton={!applyingTemplate}
            >
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Pick a template to prefill this event. Teams and matches will not be copied.
                </Text>
                {templatesError && (
                  <Alert color="red" radius="md">
                    {templatesError}
                  </Alert>
                )}
                {actionError && (
                  <Alert color="red" radius="md">
                    {actionError}
                  </Alert>
                )}
                <Select
                  label="Template"
                  placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'}
                  data={templateSelectData}
                  value={selectedTemplateId}
                  onChange={(value) => setSelectedTemplateId(value)}
                  searchable
                  clearable
                  disabled={templatesLoading || applyingTemplate}
                  nothingFoundMessage="No templates found"
                />
                <DatePickerInput
                  label="New event start date"
                  value={selectedTemplateStartDate}
                  onChange={(value) => setSelectedTemplateStartDate(parseLocalDateTime(value))}
                  minDate={new Date()}
                  disabled={applyingTemplate}
                />
                <Group justify="space-between" mt="md">
                  <Button
                    variant="default"
                    onClick={closeTemplatePrompt}
                    disabled={applyingTemplate}
                  >
                    Start Blank
                  </Button>
                  <Button
                    onClick={handleApplyTemplate}
                    loading={applyingTemplate}
                    disabled={!selectedTemplateId || !selectedTemplateStartDate}
                  >
                    Use Template
                  </Button>
                </Group>
              </Stack>
            </Modal>
            {user && changesEvent ? (
              <EventForm
                key={`create-event-form-${templateSeedKey}`}
                ref={eventFormRef}
                isOpen
                onClose={() => router.push('/events')}
                currentUser={user}
                organization={organizationForCreate}
                defaultLocation={createLocationDefaults}
                immutableDefaults={rentalImmutableDefaults}
                rentalPurchase={rentalPurchaseContext}
                event={changesEvent}
                formId={createFormId}
                isCreateMode
              />
            ) : (
              <Loading text="Loading user..." />
            )}
          </Stack>
        </Container>
        <PaymentModal
          isOpen={showRentalPayment && Boolean(rentalPaymentData)}
          onClose={closeRentalPaymentModal}
          event={rentalPaymentEventSummary}
          paymentData={rentalPaymentData}
          onPaymentSuccess={handleRentalPaymentSuccess}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">{error}</Text>
              <Button variant="default" onClick={() => loadSchedule()}>Try Again</Button>
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Title order={2} mb="xs">{activeEvent.name}</Title>

            {isHost && (
              <Group gap="sm">
                <Button
                  color="green"
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={publishing}
                >
                  {publishButtonLabel}
                </Button>
                <Button
                  color="red"
                  variant="light"
                  onClick={handleCancel}
                  loading={cancelling}
                >
                  {cancelButtonLabel}
                </Button>
                <Button
                  variant="light"
                  onClick={handleCreateTemplateFromEvent}
                  loading={creatingTemplate}
                  disabled={creatingTemplate || publishing || cancelling || activeEvent.state === 'TEMPLATE'}
                >
                  Create Template
                </Button>
                {isEditingEvent && (
                  <Button
                    variant="default"
                    onClick={handleClearChanges}
                    disabled={!canClearChanges}
                  >
                    Clear Changes
                  </Button>
                )}
              </Group>
            )}
          </Group>

          {infoMessage && (
            <Alert color="green" radius="md" onClose={() => setInfoMessage(null)} withCloseButton>
              {infoMessage}
            </Alert>
          )}

          {actionError && (
            <Alert color="red" radius="md" onClose={() => setActionError(null)} withCloseButton>
              {actionError}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="details">Details</Tabs.Tab>
              {showScheduleTab && <Tabs.Tab value="schedule">Schedule</Tabs.Tab>}
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              {showScheduleTab && <Tabs.Tab value="standings">Standings</Tabs.Tab>}
            </Tabs.List>

            <Tabs.Panel value="details" pt="md">
              {shouldShowCreationSheet && user ? (
                <EventForm
                  ref={eventFormRef}
                  isOpen={activeTab === 'details'}
                  onClose={handleDetailsClose}
                  currentUser={user}
                  event={activeEvent ?? undefined}
                  organization={activeOrganization}
                  defaultLocation={activeLocationDefaults}
                  immutableDefaults={isCreateMode ? rentalImmutableDefaults : undefined}
                  rentalPurchase={isCreateMode ? rentalPurchaseContext : undefined}
                />
              ) : (
                <EventDetailSheet
                  event={activeEvent}
                  isOpen={activeTab === 'details'}
                  renderInline
                  onClose={handleDetailsClose}
                />
              )}
            </Tabs.Panel>

            {showScheduleTab && (
              <Tabs.Panel value="schedule" pt="md">
                {activeMatches.length === 0 ? (
                  <Paper withBorder radius="md" p="xl" ta="center">
                    <Text>No matches generated yet.</Text>
                  </Paper>
                ) : (
                  <LeagueCalendarView
                    matches={activeMatches}
                    eventStart={activeEvent.start}
                    eventEnd={activeEvent.end}
                    onMatchClick={handleMatchClick}
                    canManage={canEditMatches}
                    currentUser={user}
                  />
                )}
              </Tabs.Panel>
            )}

            {shouldShowBracketTab && (
              <Tabs.Panel value="bracket" pt="md">
                {bracketData ? (
                  <TournamentBracketView
                    bracket={bracketData}
                    currentUser={user ?? undefined}
                    isPreview={isPreview}
                    onMatchClick={canEditMatches ? handleMatchEditRequest : undefined}
                    canEditMatches={canEditMatches}
                    showDateOnMatches={showDateOnMatches}
                  />
                ) : (
                  <Paper withBorder radius="md" p="xl" ta="center">
                    <Text>No playoff bracket generated yet.</Text>
                  </Paper>
                )}
              </Tabs.Panel>
            )}

            {showScheduleTab && (
              <Tabs.Panel value="standings" pt="md">
                {standings.length === 0 ? (
                  <Paper withBorder radius="md" p="xl" ta="center">
                    <Text>No teams available yet.</Text>
                  </Paper>
                ) : (
                  <Paper withBorder radius="md" p={0}>
                    {!hasRecordedMatches && (
                      <div className="px-4 pt-4">
                        <Text size="sm" c="dimmed">
                          Standings will update automatically as match results are recorded.
                        </Text>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th className="w-12 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              #
                            </Table.Th>
                            <Table.Th className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <UnstyledButton
                                className="flex items-center gap-1 text-sm font-semibold text-gray-700"
                                onClick={() => handleStandingsSortChange('team')}
                              >
                                Team
                                {renderSortIndicator('team')}
                              </UnstyledButton>
                            </Table.Th>
                            <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <UnstyledButton
                                className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                                onClick={() => handleStandingsSortChange('wins')}
                              >
                                W
                                {renderSortIndicator('wins')}
                              </UnstyledButton>
                            </Table.Th>
                            <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <UnstyledButton
                                className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                                onClick={() => handleStandingsSortChange('losses')}
                              >
                                L
                                {renderSortIndicator('losses')}
                              </UnstyledButton>
                            </Table.Th>
                            <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <UnstyledButton
                                className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                                onClick={() => handleStandingsSortChange('draws')}
                              >
                                D
                                {renderSortIndicator('draws')}
                              </UnstyledButton>
                            </Table.Th>
                            <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <UnstyledButton
                                className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                                onClick={() => handleStandingsSortChange('points')}
                              >
                                P
                                {renderSortIndicator('points')}
                              </UnstyledButton>
                            </Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {standings.map((row) => (
                            <Table.Tr key={row.teamId}>
                              <Table.Td className="text-sm font-semibold text-gray-600">{row.rank}</Table.Td>
                              <Table.Td className="text-sm font-medium text-gray-700">{row.teamName}</Table.Td>
                              <Table.Td className="text-right text-sm text-gray-700">{row.wins}</Table.Td>
                              <Table.Td className="text-right text-sm text-gray-700">{row.losses}</Table.Td>
                              <Table.Td className="text-right text-sm text-gray-700">{row.draws}</Table.Td>
                              <Table.Td className="text-right text-sm font-semibold text-gray-900">
                                {formatPoints(row.points)}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </div>
                  </Paper>
                )}
              </Tabs.Panel>
            )}
          </Tabs>
        </Stack>
      </Container>
      {scoreUpdateMatch && activeEvent && (
        <ScoreUpdateModal
          match={scoreUpdateMatch}
          tournament={activeEvent}
          canManage={canUserManageScore(scoreUpdateMatch)}
          onScoreChange={handleScoreChange}
          onSetComplete={handleSetComplete}
          onMatchComplete={handleMatchComplete}
          onSubmit={handleScoreSubmit}
          onClose={() => {
            setIsScoreModalOpen(false);
            setScoreUpdateMatch(null);
          }}
          isOpen={isScoreModalOpen}
        />
      )}
      <MatchEditModal
        opened={isMatchEditorOpen}
        match={matchBeingEdited}
        fields={Array.isArray(activeEvent.fields) ? activeEvent.fields : []}
        teams={Array.isArray(activeEvent.teams) ? activeEvent.teams : []}
        referees={Array.isArray(activeEvent.referees) ? activeEvent.referees : []}
        doTeamsRef={Boolean(activeEvent.doTeamsRef)}
        onClose={handleMatchEditClose}
        onSave={handleMatchEditSave}
      />
      <PaymentModal
        isOpen={showRentalPayment && Boolean(rentalPaymentData)}
        onClose={closeRentalPaymentModal}
        event={rentalPaymentEventSummary}
        paymentData={rentalPaymentData}
        onPaymentSuccess={handleRentalPaymentSuccess}
      />
    </div>
  );
}

export default function EventSchedulePage() {
  return (
    <Suspense fallback={<Loading text="Loading schedule..." />}>
      <EventScheduleContent />
    </Suspense>
  );
}
