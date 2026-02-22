'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Tabs, Stack, Table, UnstyledButton, Modal, Select, SimpleGrid, TextInput, Loader } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { eventService } from '@/lib/eventService';
import { fieldService } from '@/lib/fieldService';
import { leagueService } from '@/lib/leagueService';
import { tournamentService } from '@/lib/tournamentService';
import { organizationService } from '@/lib/organizationService';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { familyService } from '@/lib/familyService';
import { apiRequest } from '@/lib/apiClient';
import { normalizeApiEvent, normalizeApiMatch } from '@/lib/apiMappers';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { createClientId } from '@/lib/clientId';
import { createId } from '@/lib/id';
import { cloneEventAsTemplate, seedEventFromTemplate } from '@/lib/eventTemplates';
import { toEventPayload } from '@/types';
import type { Event, EventState, Field, Match, Team, TournamentBracket, Organization, Sport, PaymentIntent, TimeSlot } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueCalendarView from './components/LeagueCalendarView';
import TournamentBracketView from './components/TournamentBracketView';
import MatchEditModal from './components/MatchEditModal';
import EventForm, { EventFormHandle } from './components/EventForm';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import ScoreUpdateModal from './components/ScoreUpdateModal';
import PaymentModal, { PaymentEventSummary } from '@/components/ui/PaymentModal';
import TeamCard from '@/components/ui/TeamCard';

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

type DivisionOption = {
  value: string;
  label: string;
};

const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toDivisionKey = (divisionId: string | null | undefined): string | null => {
  const normalized = normalizeDivisionToken(divisionId);
  return normalized ? normalized.toLowerCase() : null;
};

const getDivisionId = (division: unknown): string | null => {
  if (typeof division === 'string') {
    return normalizeDivisionToken(division);
  }

  if (!division || typeof division !== 'object') {
    return null;
  }

  const divisionRecord = division as Record<string, unknown>;
  return (
    normalizeDivisionToken(divisionRecord.id) ??
    normalizeDivisionToken(divisionRecord.$id) ??
    normalizeDivisionToken(divisionRecord.key) ??
    normalizeDivisionToken(divisionRecord.name)
  );
};

const getDivisionLabel = (division: unknown): string | null => {
  if (typeof division === 'string') {
    return normalizeDivisionToken(division);
  }

  if (!division || typeof division !== 'object') {
    return null;
  }

  const divisionRecord = division as Record<string, unknown>;
  return (
    normalizeDivisionToken(divisionRecord.name) ??
    normalizeDivisionToken(divisionRecord.id) ??
    normalizeDivisionToken(divisionRecord.$id) ??
    normalizeDivisionToken(divisionRecord.key)
  );
};

const getTeamDivision = (team: Match['team1'] | Match['team2']): unknown => {
  if (!team) {
    return null;
  }

  return team.division;
};

const getMatchDivisionId = (match: Match): string | null =>
  getDivisionId(match.division) ??
  getDivisionId(getTeamDivision(match.team1)) ??
  getDivisionId(getTeamDivision(match.team2));

const getMatchDivisionLabel = (match: Match): string | null =>
  getDivisionLabel(match.division) ??
  getDivisionLabel(getTeamDivision(match.team1)) ??
  getDivisionLabel(getTeamDivision(match.team2));

const pickPreferredRootMatch = (matches: Match[]): Match | null => {
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce<Match>((best, current) => {
    const bestMatchId = Number.isFinite(best.matchId) ? Number(best.matchId) : Number.NEGATIVE_INFINITY;
    const currentMatchId = Number.isFinite(current.matchId) ? Number(current.matchId) : Number.NEGATIVE_INFINITY;

    if (currentMatchId > bestMatchId) {
      return current;
    }
    if (currentMatchId < bestMatchId) {
      return best;
    }
    return current.$id.localeCompare(best.$id) < 0 ? current : best;
  }, matches[0]);
};

const collectConnectedMatchIds = (matches: Record<string, Match>, rootMatchId: string): Set<string> => {
  if (!matches[rootMatchId]) {
    return new Set<string>();
  }

  const adjacency = new Map<string, Set<string>>();
  const ensureNode = (id: string) => {
    if (!adjacency.has(id)) {
      adjacency.set(id, new Set<string>());
    }
  };
  const connectNodes = (firstId?: string | null, secondId?: string | null) => {
    if (!firstId || !secondId || !matches[firstId] || !matches[secondId]) {
      return;
    }
    ensureNode(firstId);
    ensureNode(secondId);
    adjacency.get(firstId)?.add(secondId);
    adjacency.get(secondId)?.add(firstId);
  };

  Object.keys(matches).forEach(ensureNode);
  Object.values(matches).forEach((match) => {
    connectNodes(match.$id, match.previousLeftId);
    connectNodes(match.$id, match.previousRightId);
    connectNodes(match.$id, match.winnerNextMatchId);
    connectNodes(match.$id, match.loserNextMatchId);
  });

  const visited = new Set<string>();
  const stack: string[] = [rootMatchId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId) || !matches[currentId]) {
      continue;
    }

    visited.add(currentId);
    const neighbors = adjacency.get(currentId);
    if (!neighbors) {
      continue;
    }

    neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        stack.push(neighborId);
      }
    });
  }

  return visited;
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

type EventLifecycleStatus = 'DRAFT' | 'PUBLISHED';

const EVENT_LIFECYCLE_OPTIONS: Array<{ value: EventLifecycleStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

const getEventLifecycleStatus = (eventInput: Pick<Event, 'state'> | null | undefined): EventLifecycleStatus => {
  if (!eventInput) {
    return 'DRAFT';
  }

  const normalizedState = typeof eventInput.state === 'string' ? eventInput.state.toUpperCase() : 'PUBLISHED';
  if (normalizedState === 'UNPUBLISHED' || normalizedState === 'DRAFT') {
    return 'DRAFT';
  }

  return 'PUBLISHED';
};

const DEFAULT_SPORT: Sport = {
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
  const rentalLocationParam = searchParams?.get('rentalLocation') || undefined;
  const rentalLatParam = searchParams?.get('rentalLat') || undefined;
  const rentalLngParam = searchParams?.get('rentalLng') || undefined;
  const rentalPriceParam = searchParams?.get('rentalPriceCents') || undefined;
  const rentalRequiredTemplateIdsParam = searchParams?.get('rentalRequiredTemplateIds') || undefined;
  const rentalRequiredTemplateIds = useMemo(
    () => (
      rentalRequiredTemplateIdsParam
        ? Array.from(
          new Set(
            rentalRequiredTemplateIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
          ),
        )
        : []
    ),
    [rentalRequiredTemplateIdsParam],
  );
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
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [reschedulingMatches, setReschedulingMatches] = useState(false);
  const [selectedLifecycleStatus, setSelectedLifecycleStatus] = useState<EventLifecycleStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('details');
  const [selectedScheduleDivision, setSelectedScheduleDivision] = useState<string>('all');
  const [selectedBracketDivision, setSelectedBracketDivision] = useState<string | null>(null);
  const [participantTeams, setParticipantTeams] = useState<Team[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantsUpdatingTeamId, setParticipantsUpdatingTeamId] = useState<string | null>(null);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [organizationTeamsForPicker, setOrganizationTeamsForPicker] = useState<Team[]>([]);
  const [organizationTeamsLoading, setOrganizationTeamsLoading] = useState(false);
  const [searchTeamPool, setSearchTeamPool] = useState<Team[]>([]);
  const [searchTeamsLoading, setSearchTeamsLoading] = useState(false);
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
  const [childUserIds, setChildUserIds] = useState<string[]>([]);
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
      return {
        $id: rentalFieldIdParam,
        name: rentalFieldNameParam?.trim() || `Field ${fallbackFieldNumber}`,
        fieldNumber: fallbackFieldNumber,
        location: rentalLocationParam ?? '',
        lat: rentalCoordinates?.[1] ?? 0,
        long: rentalCoordinates?.[0] ?? 0,
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
    }
    if (rentalRequiredTemplateIds.length > 0) {
      defaults.requiredTemplateIds = rentalRequiredTemplateIds;
    }

    return defaults;
  }, [
    isCreateMode,
    rentalRequiredTemplateIds,
    rentalOrganization,
    rentalCoordinates,
    rentalEndParam,
    rentalFieldIdParam,
    rentalFieldNameParam,
    rentalFieldNumberParam,
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
  const isTemplateEvent = (activeEvent?.state ?? '').toUpperCase() === 'TEMPLATE';
  const isUnpublished = (activeEvent?.state ?? 'PUBLISHED') === 'UNPUBLISHED' || activeEvent?.state === 'DRAFT';
  const isEditingEvent = isTemplateEvent || isPreview || isEditParam || isUnpublished;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
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
  }, [activeEvent?.divisionDetails, activeEvent?.divisions]);

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

  useEffect(() => {
    if (selectedScheduleDivision === 'all') {
      return;
    }

    if (!scheduleDivisionOptions.some((option) => option.value === selectedScheduleDivision)) {
      setSelectedScheduleDivision('all');
    }
  }, [scheduleDivisionOptions, selectedScheduleDivision]);

  const scheduleMatches = useMemo(() => {
    if (selectedScheduleDivision === 'all') {
      return activeMatches;
    }

    return activeMatches.filter((match) => toDivisionKey(getMatchDivisionId(match)) === selectedScheduleDivision);
  }, [activeMatches, selectedScheduleDivision]);

  const eventTypeForView = activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT';
  const isTournament = eventTypeForView === 'TOURNAMENT';
  const isLeague = eventTypeForView === 'LEAGUE';
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
  const isPrimaryHost = activeEvent?.hostId === user?.$id;
  const isAssistantHost = Boolean(user?.$id && assistantHostIds.includes(user.$id));
  const isOrganizationManager = Boolean(
    user?.$id
      && activeOrganization
      && (
        activeOrganization.ownerId === user.$id
        || (Array.isArray(activeOrganization.hostIds) && activeOrganization.hostIds.includes(user.$id))
      ),
  );
  const canManageEvent = Boolean(isPrimaryHost || isAssistantHost || isOrganizationManager);
  const entityLabel = isTemplateEvent
    ? 'Template'
    : isTournament
      ? 'Tournament'
      : isLeague
        ? 'League'
        : 'Event';
  const activeLifecycleStatus = getEventLifecycleStatus(activeEvent);
  const canEditMatches = Boolean(canManageEvent && isEditingEvent);
  const shouldShowCreationSheet = Boolean(
    isCreateMode
    || (isEditingEvent && canManageEvent && user)
    || (isTemplateEvent && user),
  );
  const createFormId = 'create-event-form';
  const templateSelectData = useMemo(
    () => templateSummaries.map((template) => ({ value: template.id, label: template.name })),
    [templateSummaries],
  );
  const defaultSport = DEFAULT_SPORT;

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

  const participantTeamIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.teamIds)) {
      activeEvent.teamIds
        .map((teamId) => normalizeIdToken(teamId))
        .filter((teamId): teamId is string => Boolean(teamId))
        .forEach((teamId) => ids.add(teamId));
    }

    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach((teamEntry) => {
        const teamId = normalizeIdToken(teamEntry?.$id);
        if (teamId) {
          ids.add(teamId);
        }
      });
    }

    return Array.from(ids);
  }, [activeEvent?.teamIds, activeEvent?.teams]);

  const participantTeamIdSet = useMemo(() => new Set(participantTeamIds), [participantTeamIds]);

  const organizationIdForParticipants = useMemo(() => {
    const organizationId = normalizeIdToken(activeEvent?.organizationId);
    if (organizationId) {
      return organizationId;
    }

    if (typeof activeEvent?.organization === 'string') {
      return normalizeIdToken(activeEvent.organization);
    }

    if (activeEvent?.organization && typeof activeEvent.organization === 'object') {
      const objectId = normalizeIdToken((activeEvent.organization as Partial<Organization>).$id);
      if (objectId) {
        return objectId;
      }
    }

    return null;
  }, [activeEvent?.organization, activeEvent?.organizationId]);

  const normalizedTeamSearchQuery = teamSearchQuery.trim().toLowerCase();

  const availableOrganizationTeams = useMemo(
    () => organizationTeamsForPicker.filter((team) => Boolean(team?.$id) && !participantTeamIdSet.has(team.$id)),
    [organizationTeamsForPicker, participantTeamIdSet],
  );

  const availableOrganizationTeamIdSet = useMemo(
    () => new Set(availableOrganizationTeams.map((team) => team.$id)),
    [availableOrganizationTeams],
  );

  const searchResultTeams = useMemo(() => {
    const source = searchTeamPool.filter((team) => {
      if (!team?.$id || participantTeamIdSet.has(team.$id)) {
        return false;
      }

      if (organizationIdForParticipants && availableOrganizationTeamIdSet.has(team.$id)) {
        return false;
      }

      return true;
    });

    const filtered = normalizedTeamSearchQuery
      ? source.filter((team) => {
        const teamName = (team.name ?? '').toLowerCase();
        const sportName = (team.sport ?? '').toLowerCase();
        const divisionName = (
          typeof team.division === 'string'
            ? team.division
            : team.division?.name ?? team.division?.id ?? ''
        ).toLowerCase();
        return (
          teamName.includes(normalizedTeamSearchQuery) ||
          sportName.includes(normalizedTeamSearchQuery) ||
          divisionName.includes(normalizedTeamSearchQuery)
        );
      })
      : source;

    return filtered.slice(0, 24);
  }, [
    availableOrganizationTeamIdSet,
    normalizedTeamSearchQuery,
    organizationIdForParticipants,
    participantTeamIdSet,
    searchTeamPool,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantTeams = async () => {
      if (participantTeamIds.length === 0) {
        setParticipantTeams([]);
        setParticipantsError(null);
        setParticipantsLoading(false);
        return;
      }

      setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        const hydratedTeams = await teamService.getTeamsByIds(participantTeamIds, true);
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedTeams.map((team) => [team.$id, team]));
        const orderedTeams = participantTeamIds
          .map((teamId) => hydratedById.get(teamId))
          .filter((team): team is Team => Boolean(team));
        setParticipantTeams(orderedTeams);
      } catch (participantError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load participant teams:', participantError);
        setParticipantsError(participantError instanceof Error ? participantError.message : 'Failed to load teams.');
      } finally {
        if (!cancelled) {
          setParticipantsLoading(false);
        }
      }
    };

    void loadParticipantTeams();

    return () => {
      cancelled = true;
    };
  }, [participantTeamIds]);

  useEffect(() => {
    if (!isAddTeamModalOpen) {
      return;
    }

    let cancelled = false;

    const loadOrganizationTeams = async () => {
      if (!organizationIdForParticipants) {
        setOrganizationTeamsForPicker([]);
        setOrganizationTeamsLoading(false);
        return;
      }

      setOrganizationTeamsLoading(true);
      try {
        const eventOrganization = activeEvent?.organization;
        if (eventOrganization && typeof eventOrganization === 'object') {
          const org = eventOrganization as Organization;
          if (org.$id === organizationIdForParticipants && Array.isArray(org.teams)) {
            if (!cancelled) {
              setOrganizationTeamsForPicker(org.teams);
            }
            return;
          }
        }

        const organization = await organizationService.getOrganizationById(organizationIdForParticipants, true);
        if (cancelled) {
          return;
        }
        setOrganizationTeamsForPicker(Array.isArray(organization?.teams) ? organization.teams : []);
      } catch (organizationError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load organization teams:', organizationError);
        setParticipantsError(organizationError instanceof Error ? organizationError.message : 'Failed to load organization teams.');
      } finally {
        if (!cancelled) {
          setOrganizationTeamsLoading(false);
        }
      }
    };

    const loadSearchPool = async () => {
      setSearchTeamsLoading(true);
      try {
        const response = await apiRequest<{ teams?: Array<Record<string, unknown>> }>('/api/teams?limit=200');
        const rawRows = Array.isArray(response?.teams) ? response.teams : [];
        const allTeamIds = Array.from(
          new Set(
            rawRows
              .map((row) => normalizeIdToken((row.$id ?? row.id) as unknown))
              .filter((teamId): teamId is string => Boolean(teamId)),
          ),
        );
        const hydrated = allTeamIds.length > 0 ? await teamService.getTeamsByIds(allTeamIds, true) : [];
        if (!cancelled) {
          setSearchTeamPool(hydrated);
        }
      } catch (searchError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load team search results:', searchError);
        setParticipantsError(searchError instanceof Error ? searchError.message : 'Failed to load teams for search.');
      } finally {
        if (!cancelled) {
          setSearchTeamsLoading(false);
        }
      }
    };

    void Promise.all([loadOrganizationTeams(), loadSearchPool()]);

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.organization, isAddTeamModalOpen, organizationIdForParticipants]);

  const syncParticipantTeams = useCallback(
    async (nextTeamIds: string[], successMessage: string) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        return;
      }

      const normalizedTeamIds = Array.from(
        new Set(
          nextTeamIds
            .map((teamId) => normalizeIdToken(teamId))
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      );
      const normalizedUserIds = Array.isArray(activeEvent?.userIds)
        ? Array.from(new Set(activeEvent.userIds.map((userId) => String(userId)).filter(Boolean)))
        : [];

      setParticipantsError(null);
      setActionError(null);
      try {
        await eventService.updateEventParticipants(targetEventId, {
          userIds: normalizedUserIds,
          teamIds: normalizedTeamIds,
        });

        const hydratedTeams = normalizedTeamIds.length > 0
          ? await teamService.getTeamsByIds(normalizedTeamIds, true)
          : [];
        const hydratedById = new Map(hydratedTeams.map((team) => [team.$id, team]));
        const orderedTeams = normalizedTeamIds
          .map((teamId) => hydratedById.get(teamId))
          .filter((team): team is Team => Boolean(team));

        setParticipantTeams(orderedTeams);
        setEvent((prev) => (prev ? { ...prev, teamIds: normalizedTeamIds, teams: orderedTeams } : prev));
        setChangesEvent((prev) => (prev ? { ...prev, teamIds: normalizedTeamIds, teams: orderedTeams } : prev));
        setInfoMessage(successMessage);
      } catch (updateError) {
        console.error('Failed to update event participants:', updateError);
        setParticipantsError(updateError instanceof Error ? updateError.message : 'Failed to update participants.');
      }
    },
    [activeEvent?.$id, activeEvent?.userIds, eventId],
  );

  const handleAddTeamToParticipants = useCallback(
    async (team: Team) => {
      if (participantsUpdatingTeamId || !team?.$id || participantTeamIdSet.has(team.$id)) {
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await syncParticipantTeams(
        [...participantTeamIds, team.$id],
        `${team.name || 'Team'} added to participants.`,
      );
      setParticipantsUpdatingTeamId(null);
    },
    [participantTeamIdSet, participantTeamIds, participantsUpdatingTeamId, syncParticipantTeams],
  );

  const handleRemoveTeamFromParticipants = useCallback(
    async (team: Team) => {
      if (participantsUpdatingTeamId || !team?.$id || !participantTeamIdSet.has(team.$id)) {
        return;
      }

      const shouldRemove = typeof window === 'undefined'
        ? true
        : window.confirm(`Remove ${team.name || 'this team'} from participants?`);
      if (!shouldRemove) {
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await syncParticipantTeams(
        participantTeamIds.filter((teamId) => teamId !== team.$id),
        `${team.name || 'Team'} removed from participants.`,
      );
      setParticipantsUpdatingTeamId(null);
    },
    [participantTeamIdSet, participantTeamIds, participantsUpdatingTeamId, syncParticipantTeams],
  );

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
        assistantHostIds: [],
      } as Event;
    });
  }, [createLocationDefaults, defaultSport, eventId, isCreateMode, rentalImmutableDefaults, user]);

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
        if (resolvedHostOrgId) {
          qs.set('organizationId', resolvedHostOrgId);
        } else {
          qs.set('hostId', user.$id);
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

  const createButtonLabel = 'Create Event';
  const cancelButtonLabel = (() => {
    if (isCreateMode) return 'Discard';
    if (isUnpublished) return `Delete ${entityLabel}`;
    if (isPreview) return `Cancel ${entityLabel} Preview`;
    if (isEditingEvent) return `Discard ${entityLabel} Changes`;
    return `Cancel ${entityLabel}`;
  })();

  const handleEnterEditMode = useCallback(() => {
    if (!pathname) return;
    setSelectedLifecycleStatus(null);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('mode', 'edit');
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleLifecycleStatusChange = useCallback((value: string | null) => {
    if (!value) return;

    const nextStatus = value as EventLifecycleStatus;
    setSelectedLifecycleStatus(nextStatus);
    setChangesEvent((prev) => {
      const base = prev ?? activeEvent;
      if (!base) return prev;

      const nextState: EventState = nextStatus === 'DRAFT' ? 'UNPUBLISHED' : 'PUBLISHED';

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
    setWarningMessage(null);

    try {
      const response = await apiRequest<any>(`/api/events/${eventId}`);
      const responseEvent = response?.event ?? response;
      const fetchedEvent = normalizeApiEvent(responseEvent ?? null);

      if (!fetchedEvent) {
        setError('League not found.');
        return;
      }

      if (fetchedEvent.eventType === 'LEAGUE') {
        const leagueConfigId = typeof fetchedEvent.leagueScoringConfigId === 'string'
          && fetchedEvent.leagueScoringConfigId.trim().length > 0
          ? fetchedEvent.leagueScoringConfigId.trim()
          : null;
        if (
          leagueConfigId
          && (!fetchedEvent.leagueScoringConfig || typeof fetchedEvent.leagueScoringConfig !== 'object')
        ) {
          try {
            const leagueConfigResponse = await apiRequest<any>(`/api/league-scoring-configs/${leagueConfigId}`);
            const leagueConfig = leagueConfigResponse?.leagueScoringConfig ?? leagueConfigResponse;
            if (leagueConfig && typeof leagueConfig === 'object') {
              const normalizedLeagueConfig = {
                ...leagueConfig,
                $id: typeof leagueConfig.$id === 'string'
                  ? leagueConfig.$id
                  : typeof leagueConfig.id === 'string'
                    ? leagueConfig.id
                    : undefined,
              };
              fetchedEvent.leagueScoringConfig = normalizedLeagueConfig;
            }
          } catch (leagueConfigError) {
            console.error('Failed to load league scoring config for event:', leagueConfigError);
          }
        }
      }

      if (Array.isArray(response?.matches)) {
        fetchedEvent.matches = response.matches.map((match: Match) => normalizeApiMatch(match));
      }
      // `GET /api/events/:id` returns the raw event row and does not include matches.
      // Matches are stored separately and must be fetched by `eventId`.
      if (!Array.isArray(fetchedEvent.matches) || fetchedEvent.matches.length === 0) {
        try {
          const matchesResponse = await apiRequest<any>(`/api/events/${eventId}/matches`);
          if (Array.isArray(matchesResponse?.matches)) {
            fetchedEvent.matches = matchesResponse.matches.map((match: Match) => normalizeApiMatch(match));
          }
        } catch (matchesError) {
          console.error('Failed to load matches for event:', matchesError);
        }
      }

      if (
        (!Array.isArray(fetchedEvent.fields) || fetchedEvent.fields.length === 0)
        && Array.isArray(fetchedEvent.fieldIds)
        && fetchedEvent.fieldIds.length > 0
      ) {
        try {
          const fieldIds = Array.from(
            new Set(
              fetchedEvent.fieldIds
                .map((fieldId) => String(fieldId).trim())
                .filter((fieldId) => fieldId.length > 0),
            ),
          );
          if (fieldIds.length > 0) {
            fetchedEvent.fields = await fieldService.listFields({ fieldIds });
          }
        } catch (fieldsError) {
          console.error('Failed to load fields for event:', fieldsError);
        }
      }

      if (Array.isArray(fetchedEvent.matches) && Array.isArray(fetchedEvent.fields) && fetchedEvent.fields.length > 0) {
        const fieldsById = new Map<string, Field>(
          fetchedEvent.fields
            .filter((field): field is Field => Boolean(field?.$id))
            .map((field) => [field.$id, field]),
        );

        fetchedEvent.matches = fetchedEvent.matches.map((match) => {
          const normalizedMatch = normalizeApiMatch(match);
          if (normalizedMatch.field && typeof normalizedMatch.field === 'object') {
            return normalizedMatch;
          }

          const fieldId =
            typeof normalizedMatch.fieldId === 'string' && normalizedMatch.fieldId.trim().length > 0
              ? normalizedMatch.fieldId.trim()
              : null;
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

      const organizationId = normalizeIdToken(
        fetchedEvent.organizationId
        || (typeof fetchedEvent.organization === 'string' ? fetchedEvent.organization : (fetchedEvent.organization as Organization | undefined)?.$id),
      );
      if (organizationId && (!fetchedEvent.organization || typeof fetchedEvent.organization === 'string')) {
        try {
          const resolvedOrganization = await organizationService.getOrganizationById(organizationId, true);
          if (resolvedOrganization) {
            fetchedEvent.organization = resolvedOrganization;
          }
        } catch (organizationError) {
          console.error('Failed to load event organization:', organizationError);
        }
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

    return Object.values(playoffMatchesMap).filter(
      (match) => !match.winnerNextMatchId || !playoffMatchesMap[match.winnerNextMatchId],
    );
  }, [playoffMatchesMap]);

  const bracketDivisionOptions = useMemo<DivisionOption[]>(() => {
    const labels = new Map<string, string>();

    playoffRootMatches.forEach((match) => {
      const divisionId = getMatchDivisionId(match);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey || labels.has(divisionKey)) {
        return;
      }

      labels.set(divisionKey, divisionLabelsByKey.get(divisionKey) ?? getMatchDivisionLabel(match) ?? divisionId);
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [divisionLabelsByKey, playoffRootMatches]);

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
      isHost: canManageEvent,
      canManage: !isPreview && canManageEvent,
    };
  }, [activeEvent, bracketMatchesMap, canManageEvent, isPreview]);

  const scheduleDivisionSelectData = useMemo<DivisionOption[]>(
    () => [{ value: 'all', label: 'All divisions' }, ...scheduleDivisionOptions],
    [scheduleDivisionOptions],
  );
  const shouldShowScheduleDivisionFilter = scheduleDivisionOptions.length > 1;
  const shouldShowBracketDivisionFilter = bracketDivisionOptions.length > 1;

  const showScheduleTab = isLeague;
  const showStandingsTab = isLeague;
  const showParticipantsTab = !isTemplateEvent
    && Boolean(activeEvent?.teamSignup || isLeague || isTournament || participantTeamIds.length > 0);
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
    if (showParticipantsTab) {
      allowed.add('participants');
    }
    if (showScheduleTab) {
      allowed.add('schedule');
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
    }

    const desired = request && allowed.has(request) ? request : defaultTab;
    setActiveTab(desired);
  }, [searchParams, shouldShowBracketTab, showParticipantsTab, showScheduleTab, defaultTab]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    const allowed = new Set<string>(['details']);
    if (showParticipantsTab) {
      allowed.add('participants');
    }
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
        setSubmitError('Please fix the highlighted fields before submitting.');
        return null;
      }

      return formApi.getDraft();
    },
    [activeEvent, activeTab, setSubmitError],
  );

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
      setWarningMessage(null);

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
      setWarningMessage(null);

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

  const saveExistingEvent = useCallback(
    async ({ rescheduleAfterSave = false }: { rescheduleAfterSave?: boolean } = {}) => {
      if (!activeEvent) return;
      if (!event) {
        setError(`Unable to save ${entityLabel.toLowerCase()} changes without the original event context.`);
        return;
      }

      const draft = await getDraftFromForm({ allowCurrentEventFallback: rescheduleAfterSave });
      if (!draft) {
        return;
      }

      const mergedDraft = { ...activeEvent, ...(draft as Event) } as Event;
      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);
      if (rescheduleAfterSave) {
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

        const lifecycleStatus = selectedLifecycleStatus ?? getEventLifecycleStatus(nextEvent);
        nextEvent.state = lifecycleStatus === 'DRAFT' ? 'UNPUBLISHED' : 'PUBLISHED';

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent);
        }

        if (updatedEvent.$id && !rescheduleAfterSave && nextMatches.length > 0) {
          const updatedMatches = await tournamentService.updateMatchesBulk(updatedEvent.$id, nextMatches);
          if (updatedMatches.length > 0) {
            updatedEvent.matches = updatedMatches;
          }
        }

        let rescheduleWarningText: string | null = null;
        if (rescheduleAfterSave && updatedEvent.$id) {
          const schedulePayload = toEventPayload(updatedEvent) as unknown as Record<string, unknown>;
          const scheduled = await eventService.scheduleEvent(schedulePayload, { eventId: updatedEvent.$id });
          if (!scheduled?.event) {
            throw new Error('Failed to reschedule matches.');
          }
          if (Array.isArray(scheduled.warnings) && scheduled.warnings.length) {
            rescheduleWarningText = scheduled.warnings
              .map((warning) => warning.message)
              .filter((message) => typeof message === 'string' && message.trim().length > 0)
              .join(' ');
          }
          updatedEvent = scheduled.event;
        }

        if (!Array.isArray(updatedEvent.matches) || updatedEvent.matches.length === 0) {
          updatedEvent.matches = nextMatches;
        }

        hydrateEvent(updatedEvent);
        setHasUnsavedChanges(false);
        setSelectedLifecycleStatus(null);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('preview');
          params.set('mode', 'edit');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        await loadSchedule();
        if (rescheduleAfterSave) {
          setInfoMessage(`${entityLabel} settings saved and matches rescheduled.`);
          if (rescheduleWarningText) {
            setWarningMessage(rescheduleWarningText);
          }
        } else {
          setInfoMessage(`${entityLabel} changes saved.`);
        }
      } catch (err) {
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        setError(
          rescheduleAfterSave
            ? `Failed to save ${entityLabel.toLowerCase()} and reschedule matches.`
            : `Failed to save ${entityLabel.toLowerCase()} changes.`,
        );
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
      hydrateEvent,
      loadSchedule,
      pathname,
      router,
      selectedLifecycleStatus,
      searchParams,
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
    await saveExistingEvent({ rescheduleAfterSave: true });
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
      handleEnterEditMode();
      return;
    }

    if (isEditingEvent) {
      await saveExistingEvent();
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
      setSelectedLifecycleStatus(null);
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
    setSelectedLifecycleStatus(null);
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

  const handleToggleLockAllMatches = useCallback((locked: boolean, matchIds: string[]) => {
    if (!canEditMatches || matchIds.length === 0) return;
    const matchIdSet = new Set(matchIds);
    const lockLabel = locked ? 'Locked' : 'Unlocked';

    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      return base.map((match) => (
        matchIdSet.has(match.$id)
          ? ({ ...match, locked } as Match)
          : match
      ));
    });

    setInfoMessage(`${lockLabel} ${matchIdSet.size} match${matchIdSet.size === 1 ? '' : 'es'}.`);
  }, [canEditMatches, matches]);

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
                {!publishing && !reschedulingMatches && (
                  <Button
                    color="green"
                    onClick={handlePublish}
                  >
                    {createButtonLabel}
                  </Button>
                )}
                {!cancelling && (
                  <Button
                    variant="default"
                    onClick={handleCancel}
                  >
                    {cancelButtonLabel}
                  </Button>
                )}
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
                  valueFormat="MM/DD/YYYY"
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
  const isSavingOrRescheduling = publishing || reschedulingMatches;
  const showEditActionButton = !isTemplateEvent && !isEditingEvent && !isSavingOrRescheduling && !cancelling;
  const showSaveActionButton = isEditingEvent && !publishing && !reschedulingMatches;
  const showRescheduleActionButton = isEditingEvent && (isLeague || isTournament) && !publishing && !reschedulingMatches;
  const showCancelActionButton = !isTemplateEvent && !cancelling;
  const showCreateTemplateButton = !creatingTemplate && !publishing && !reschedulingMatches && !cancelling && !isTemplateEvent;
  const showClearChangesButton = isEditingEvent && canClearChanges;
  const showLifecycleStatusSelect = isEditingEvent && !isSavingOrRescheduling && !cancelling && !isTemplateEvent;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Container size="xl" pt="xl" pb={0}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Title order={2} mb="xs">{activeEvent.name}</Title>

            {canManageEvent && (
              <Group gap="sm" wrap="wrap">
                {showEditActionButton && (
                  <Button onClick={handleEnterEditMode}>
                    Edit {entityLabel}
                  </Button>
                )}
                {isEditingEvent && (
                  <>
                    {showLifecycleStatusSelect && (
                      <Select
                        data={EVENT_LIFECYCLE_OPTIONS}
                        value={selectedLifecycleStatus ?? activeLifecycleStatus}
                        onChange={handleLifecycleStatusChange}
                        allowDeselect={false}
                        w={160}
                      />
                    )}
                    {showSaveActionButton && (
                      <Button
                        color="green"
                        onClick={isCreateMode ? handlePublish : handleSaveEvent}
                      >
                        {isCreateMode ? createButtonLabel : `Save ${entityLabel}`}
                      </Button>
                    )}
                    {showRescheduleActionButton && (
                      <Button
                        variant="light"
                        onClick={handleRescheduleMatches}
                      >
                        Reschedule Matches
                      </Button>
                    )}
                  </>
                )}
                {showCancelActionButton && (
                  <Button
                    color="red"
                    variant="light"
                    onClick={handleCancel}
                  >
                    {cancelButtonLabel}
                  </Button>
                )}
                {showCreateTemplateButton && (
                  <Button
                    variant="light"
                    onClick={handleCreateTemplateFromEvent}
                  >
                    Create Template
                  </Button>
                )}
                {showClearChangesButton && (
                  <Button
                    variant="default"
                    onClick={handleClearChanges}
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

          {warningMessage && (
            <Alert color="yellow" radius="md" onClose={() => setWarningMessage(null)} withCloseButton>
              {warningMessage}
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
              {showParticipantsTab && <Tabs.Tab value="participants">Participants</Tabs.Tab>}
              {showScheduleTab && <Tabs.Tab value="schedule">Schedule</Tabs.Tab>}
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              {showStandingsTab && <Tabs.Tab value="standings">Standings</Tabs.Tab>}
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

            {showParticipantsTab && (
              <Tabs.Panel value="participants" pt="md">
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">
                      {participantTeamIds.length === 1
                        ? '1 team is currently participating.'
                        : `${participantTeamIds.length} teams are currently participating.`}
                    </Text>
                    {canManageEvent && (
                      <Button
                        variant="light"
                        onClick={() => {
                          setParticipantsError(null);
                          setTeamSearchQuery('');
                          setIsAddTeamModalOpen(true);
                        }}
                      >
                        Add Team
                      </Button>
                    )}
                  </Group>

                  {participantsError && (
                    <Alert color="red" radius="md">
                      {participantsError}
                    </Alert>
                  )}

                  {participantsLoading ? (
                    <Paper withBorder radius="md" p="xl">
                      <Group justify="center" gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading participants...</Text>
                      </Group>
                    </Paper>
                  ) : participantTeams.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No teams have been added yet.</Text>
                    </Paper>
                  ) : (
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                      {participantTeams.map((team) => (
                        <TeamCard
                          key={team.$id}
                          team={team}
                          actions={
                            canManageEvent
                              ? (
                                participantsUpdatingTeamId
                                  ? <Text size="xs" c="dimmed">Updating...</Text>
                                  : (
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="red"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleRemoveTeamFromParticipants(team);
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  )
                              )
                              : undefined
                          }
                        />
                      ))}
                    </SimpleGrid>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {showScheduleTab && (
              <Tabs.Panel value="schedule" pt="md">
                <Stack gap="sm">
                  {shouldShowScheduleDivisionFilter && (
                    <Group justify="flex-end">
                      <Select
                        label="Division"
                        data={scheduleDivisionSelectData}
                        value={selectedScheduleDivision}
                        onChange={(value) => setSelectedScheduleDivision(value ?? 'all')}
                        allowDeselect={false}
                        w={220}
                      />
                    </Group>
                  )}

                  {activeMatches.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No matches generated yet.</Text>
                    </Paper>
                  ) : scheduleMatches.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No matches found for the selected division.</Text>
                    </Paper>
                  ) : (
                    <LeagueCalendarView
                      matches={scheduleMatches}
                      fields={Array.isArray(activeEvent.fields) ? activeEvent.fields : []}
                      eventStart={activeEvent.start}
                      eventEnd={activeEvent.end}
                      onMatchClick={handleMatchClick}
                      canManage={canEditMatches}
                      currentUser={user}
                      childUserIds={childUserIds}
                      onToggleLockAllMatches={handleToggleLockAllMatches}
                    />
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {shouldShowBracketTab && (
              <Tabs.Panel value="bracket" pt="md" pb={0}>
                <Stack gap="sm">
                  {shouldShowBracketDivisionFilter && (
                    <Group justify="flex-end">
                      <Select
                        label="Division"
                        data={bracketDivisionOptions}
                        value={selectedBracketDivision ?? bracketDivisionOptions[0]?.value ?? null}
                        onChange={(value) => setSelectedBracketDivision(value ?? bracketDivisionOptions[0]?.value ?? null)}
                        allowDeselect={false}
                        w={220}
                      />
                    </Group>
                  )}

                  {bracketData ? (
                    <TournamentBracketView
                      bracket={bracketData}
                      currentUser={user ?? undefined}
                      isPreview={isPreview}
                      onMatchClick={handleMatchClick}
                      canEditMatches={canEditMatches}
                      showDateOnMatches={showDateOnMatches}
                    />
                  ) : (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>
                        {playoffMatches.length > 0
                          ? 'No playoff bracket generated for the selected division.'
                          : 'No playoff bracket generated yet.'}
                      </Text>
                    </Paper>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {showStandingsTab && (
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
      <Modal
        opened={isAddTeamModalOpen}
        onClose={() => {
          setIsAddTeamModalOpen(false);
          setTeamSearchQuery('');
        }}
        title="Add Team"
        size="xl"
        centered
        fullScreen={Boolean(isMobile)}
      >
        <Stack gap="md">
          <TextInput
            label="Search teams"
            placeholder="Search by team name, sport, or division"
            value={teamSearchQuery}
            onChange={(event) => setTeamSearchQuery(event.currentTarget.value)}
          />

          {organizationIdForParticipants && (
            <Stack gap="sm">
              <Text fw={600} size="sm">Organization Teams</Text>
              {organizationTeamsLoading ? (
                <Paper withBorder radius="md" p="md">
                  <Group justify="center" gap="sm">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">Loading organization teams...</Text>
                  </Group>
                </Paper>
              ) : availableOrganizationTeams.length === 0 ? (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" c="dimmed" ta="center">
                    No organization teams available to add.
                  </Text>
                </Paper>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                  {availableOrganizationTeams.map((team) => (
                    <TeamCard
                      key={`org-team-${team.$id}`}
                      team={team}
                      actions={
                        participantsUpdatingTeamId
                          ? <Text size="xs" c="dimmed">Adding...</Text>
                          : (
                            <Button
                              size="xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleAddTeamToParticipants(team);
                              }}
                            >
                              Add
                            </Button>
                          )
                      }
                    />
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          )}

          <Stack gap="sm">
            <Text fw={600} size="sm">Search Results</Text>
            {searchTeamsLoading ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="center" gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Loading searchable teams...</Text>
                </Group>
              </Paper>
            ) : searchResultTeams.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed" ta="center">
                  No teams match your search.
                </Text>
              </Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                {searchResultTeams.map((team) => (
                  <TeamCard
                    key={`search-team-${team.$id}`}
                    team={team}
                    actions={
                      participantsUpdatingTeamId
                        ? <Text size="xs" c="dimmed">Adding...</Text>
                        : (
                          <Button
                            size="xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleAddTeamToParticipants(team);
                            }}
                          >
                            Add
                          </Button>
                        )
                    }
                  />
                ))}
              </SimpleGrid>
            )}
          </Stack>
        </Stack>
      </Modal>
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
