import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { isPrismaSchemaContractError, requirePrismaSchemaContract } from '@/lib/prismaSchemaContract';
import { buildRefundCreateParamsForPaymentIntent } from '@/lib/stripeConnectAccounts';
import { sanitizeOrganizationEventAssignments } from '@/lib/organizationEventAccess';
import {
  clearRemovedEventOfficialMatchAssignments,
  deleteMatchesByEvent,
  isLeaguePlayoffTeamCountValidationError,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  reserveRentalBookingSlotsForEvent,
  saveEventSchedule,
  saveMatches,
  syncEventParticipantRegistrationsFromCompatibilityIds,
  syncEventDivisions,
  isRentalBookingReservationError,
} from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { parseDateInput, stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';
import { parseDateInputInTimeZone, resolveTimeZone } from '@/server/timeZones';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext, type LeagueDivisionConfig } from '@/server/scheduler/types';
import { canManageEvent } from '@/server/accessControl';
import { assertEventContentAllowed, EventContentFilterError } from '@/server/contentFilter';
import {
  buildEventDivisionId,
  cleanDivisionDisplayName,
  deriveDivisionTypeDisplayName,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
  normalizeDivisionTypeIds,
} from '@/lib/divisionTypes';
import { canonicalizeTimeSlots, normalizeTimeSlotFieldIds } from '@/server/timeSlotCanonical';
import { normalizeEventTaxHandling, normalizeOrganizerManualTaxRateBps } from '@/lib/taxPolicy';
import {
  normalizeManualPaymentInstructions,
  normalizeManualPaymentLinks,
  normalizeRegistrationPaymentMode,
} from '@/lib/manualRegistrationPayments';
import {
  buildEventOfficialPositionsFromTemplates,
  filterEventOfficialsByUserIds,
  normalizeEventOfficials,
  normalizeEventOfficialPositions,
  normalizeOfficialSchedulingMode,
  normalizeSportOfficialPositionTemplates,
} from '@/server/officials/config';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';
import {
  generatedPoolsForBracket,
  isTournamentPoolValidationError,
  isTournamentPoolPlayEnabled,
} from '@/server/events/tournamentPools';
import { getEventTagsForEventIds, syncEventTags, syncEventTypeTagsForEvent } from '@/server/eventTags';
import { deleteOrArchiveEvent, toDeleteOrArchiveResponse } from '@/server/deletion/archivePolicy';
import { refreshBroadcastPresentationForEvent } from '@/server/broadcast/presentation';

export const dynamic = 'force-dynamic';
const RESTRICTED_EVENT_STATES = new Set(['TEMPLATE', 'UNPUBLISHED', 'DRAFT']);
const EVENT_FIELDS_REQUIRED_MESSAGE = 'Select or create at least one field for this event.';

const EVENT_UPDATE_FIELDS = new Set([
  'name',
  'start',
  'end',
  'timeZone',
  'description',
  'affiliateUrl',
  'registrationPaymentMode',
  'manualPaymentLinks',
  'manualPaymentInstructions',
  'divisions',
  'winnerSetCount',
  'loserSetCount',
  'doubleElimination',
  'location',
  'address',
  'rating',
  'teamSizeLimit',
  'maxParticipants',
  'minAge',
  'maxAge',
  'hostId',
  'assistantHostIds',
  'noFixedEndDateTime',
  'price',
  'taxHandling',
  'organizerManualTaxRateBps',
  'singleDivision',
  'registrationByDivisionType',
  'cancellationRefundHours',
  'teamSignup',
  'prize',
  'registrationCutoffHours',
  'seedColor',
  'imageId',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'coordinates',
  'gamesPerOpponent',
  'includePlayoffs',
  'playoffTeamCount',
  'usesSets',
  'matchDurationMinutes',
  'setDurationMinutes',
  'setsPerMatch',
  'restTimeMinutes',
  'state',
  'pointsToVictory',
  'sportId',
  'timeSlotIds',
  'fieldIds',
  'leagueScoringConfigId',
  'organizationId',
  'parentEvent',
  'autoCancellation',
  'eventType',
  'officialSchedulingMode',
  'doTeamsOfficiate',
  'teamOfficialsMaySwap',
  'teamCheckInMode',
  'teamCheckInOpenMinutesBefore',
  'allowMatchRosterEdits',
  'allowTemporaryMatchPlayers',
  'matchRulesOverride',
  'autoCreatePointMatchIncidents',
  'officialPositions',
  'allowPaymentPlans',
  'installmentCount',
  'installmentDueDates',
  'installmentDueRelativeDays',
  'installmentAmounts',
  'allowTeamSplitDefault',
  'splitLeaguePlayoffDivisions',
  'requiredTemplateIds',
  'tags',
]);

const LEAGUE_SCORING_BOOLEAN_FIELDS: readonly string[] = [];

const LEAGUE_SCORING_NUMBER_FIELDS = [
  'pointsForWin',
  'pointsForDraw',
  'pointsForLoss',
  'pointsPerGoalScored',
  'pointsPerGoalConceded',
] as const;

const EVENT_PATCH_ALLOWED_FIELDS = new Set<string>([
  ...EVENT_UPDATE_FIELDS,
  'teamIds',
  'userIds',
  'waitListIds',
  'freeAgentIds',
  'fields',
  'timeSlots',
  'divisionFieldIds',
  'divisionDetails',
  'playoffDivisionDetails',
  'leagueScoringConfig',
  'eventOfficials',
  'fieldCount',
  'status',
  'leagueConfig',
  'includePlayoffsOrPools',
  'refType',
]);
const EVENT_PATCH_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const EVENT_PATCH_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'organizationId',
  'parentEvent',
]);

const updateEventWithSchemaContract = async (
  tx: any,
  eventId: string,
  updateData: Record<string, unknown>,
): Promise<any> => requirePrismaSchemaContract<any>('Events', () => tx.events.update({
  where: { id: eventId },
  data: updateData as any,
}));

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (!Array.isArray((legacy as any).divisions)) {
    (legacy as any).divisions = Array.isArray((legacy as any).divisionDetails)
      ? (legacy as any).divisionDetails
          .map((detail: any) => (typeof detail?.id === 'string' ? detail.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : [];
  }
  if (!Array.isArray(legacy.waitListIds)) {
    (legacy as any).waitListIds = [];
  }
  if (!Array.isArray(legacy.freeAgentIds)) {
    (legacy as any).freeAgentIds = [];
  }
  if (!Array.isArray(legacy.officialIds)) {
    (legacy as any).officialIds = [];
  }
  if (!Array.isArray((legacy as any).officialPositions)) {
    (legacy as any).officialPositions = [];
  }
  if (!Array.isArray((legacy as any).eventOfficials)) {
    (legacy as any).eventOfficials = [];
  }
  if (typeof (legacy as any).officialSchedulingMode !== 'string') {
    (legacy as any).officialSchedulingMode = 'SCHEDULE';
  }
  if ((legacy as any).officialSchedulingMode === 'TEAM_STAFFING') {
    (legacy as any).doTeamsOfficiate = true;
  }
  if (!Array.isArray((legacy as any).assistantHostIds)) {
    (legacy as any).assistantHostIds = [];
  }
  if (!Array.isArray(legacy.requiredTemplateIds)) {
    (legacy as any).requiredTemplateIds = [];
  }
  (legacy as any).registrationPaymentMode = normalizeRegistrationPaymentMode((legacy as any).registrationPaymentMode);
  (legacy as any).manualPaymentLinks = normalizeManualPaymentLinks((legacy as any).manualPaymentLinks);
  (legacy as any).manualPaymentInstructions = normalizeManualPaymentInstructions(
    (legacy as any).manualPaymentInstructions,
  );
  if (typeof (legacy as any).noFixedEndDateTime !== 'boolean') {
    (legacy as any).noFixedEndDateTime = false;
  }
  if ((legacy as any).doTeamsOfficiate !== true) {
    (legacy as any).teamOfficialsMaySwap = false;
  } else if (typeof (legacy as any).teamOfficialsMaySwap !== 'boolean') {
    (legacy as any).teamOfficialsMaySwap = false;
  }
  const legacyTeamCheckInMode = typeof (legacy as any).teamCheckInMode === 'string'
    ? (legacy as any).teamCheckInMode.trim().toUpperCase()
    : 'OFF';
  (legacy as any).teamCheckInMode =
    (legacy as any).teamSignup === true && ['OFF', 'EVENT', 'MATCH'].includes(legacyTeamCheckInMode)
      ? legacyTeamCheckInMode
      : 'OFF';
  const legacyOpenMinutes = Number((legacy as any).teamCheckInOpenMinutesBefore);
  (legacy as any).teamCheckInOpenMinutesBefore = Number.isFinite(legacyOpenMinutes)
    ? Math.max(0, Math.trunc(legacyOpenMinutes))
    : 60;
  (legacy as any).allowMatchRosterEdits =
    (legacy as any).teamSignup === true && typeof (legacy as any).allowMatchRosterEdits === 'boolean'
      ? Boolean((legacy as any).allowMatchRosterEdits)
      : false;
  (legacy as any).allowTemporaryMatchPlayers =
    (legacy as any).allowMatchRosterEdits === true && typeof (legacy as any).allowTemporaryMatchPlayers === 'boolean'
      ? Boolean((legacy as any).allowTemporaryMatchPlayers)
      : false;
  return legacy;
};

const getEventTagsForResponse = async (eventId: string) => {
  try {
    const tagsByEventId = await getEventTagsForEventIds([eventId]);
    return tagsByEventId.get(eventId) ?? [];
  } catch (error) {
    console.warn('Failed to load event tags for event response', { eventId, error });
    return [];
  }
};

const buildEventOfficialResponse = async (event: any) => {
  const [eventOfficialRows, sportRow] = await Promise.all([
    typeof (prisma as any).eventOfficials?.findMany === 'function'
      ? (prisma as any).eventOfficials.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } })
      : Promise.resolve([]),
    event.sportId && typeof (prisma as any).sports?.findUnique === 'function'
      ? (prisma as any).sports.findUnique({
          where: { id: event.sportId },
          select: { officialPositionTemplates: true } as any,
        })
      : Promise.resolve(null),
  ]);
  const templatePositions = buildEventOfficialPositionsFromTemplates(
    event.id,
    normalizeSportOfficialPositionTemplates((sportRow as any)?.officialPositionTemplates),
  );
  let officialPositions = (() => {
    const explicit = normalizeEventOfficialPositions((event as any).officialPositions, event.id);
    if (explicit.length) {
      return explicit;
    }
    return templatePositions;
  })();
  if (!officialPositions.length && eventOfficialRows.length) {
    officialPositions = buildEventOfficialPositionsFromTemplates(event.id, [{ name: 'Official', count: 1 }]);
  }
  const eventOfficials = eventOfficialRows.length
    ? (eventOfficialRows as any[])
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          positionIds: normalizeFieldIds(row.positionIds).filter((positionId: string) => (
            officialPositions.some((position) => position.id === positionId)
          )),
          fieldIds: normalizeFieldIds(row.fieldIds).filter((fieldId: string) => (
            normalizeFieldIds(event.fieldIds).includes(fieldId)
          )),
          isActive: row.isActive !== false,
        }))
        .filter((row) => row.positionIds.length > 0)
    : [];
  return {
    officialSchedulingMode: normalizeOfficialSchedulingMode((event as any).officialSchedulingMode),
    officialPositions,
    eventOfficials,
    officialIds: eventOfficials.map((official: { userId: string }) => official.userId),
  };
};

const isSchedulableEventType = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'LEAGUE' || normalized === 'TOURNAMENT';
};

const supportsScheduleSlots = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return isSchedulableEventType(normalized) || normalized === 'TRYOUT';
};

const buildContext = (): SchedulerContext => {
  const debug = process.env.SCHEDULER_DEBUG === 'true';
  return {
    log: (message) => {
      if (debug) console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
  };
};

const ORDER_SENSITIVE_ARRAYS = new Set([
  'pointsToVictory',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
]);

const normalizeStringArray = (value: unknown, key?: string): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const mapped = value.map((item) => String(item)).filter(Boolean);
  if (key && ORDER_SENSITIVE_ARRAYS.has(key)) {
    return mapped;
  }
  return mapped.sort();
};

const arraysEqual = (left: string[] | null, right: string[] | null): boolean => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const DEFAULT_DIVISION_KEY = 'open';

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionKind = (value: unknown, fallback: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE'): 'LEAGUE' | 'PLAYOFF' => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PLAYOFF') {
    return 'PLAYOFF';
  }
  return 'LEAGUE';
};

const normalizeStandingsOverrides = (value: unknown): Record<string, number> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const rows = Object.entries(value as Record<string, unknown>)
    .map(([teamId, points]) => {
      const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';
      const normalizedPoints = typeof points === 'number' ? points : Number(points);
      if (!normalizedTeamId || !Number.isFinite(normalizedPoints)) {
        return null;
      }
      return [normalizedTeamId, normalizedPoints] as const;
    })
    .filter((row): row is readonly [string, number] => row !== null);
  if (!rows.length) {
    return null;
  }
  return Object.fromEntries(rows);
};

type PlayoffDivisionConfig = {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  prize: string;
  fieldCount: number;
  restTimeMinutes: number;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
};

const PLAYOFF_CONFIG_KEYS: ReadonlyArray<keyof PlayoffDivisionConfig> = [
  'doubleElimination',
  'winnerSetCount',
  'loserSetCount',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'prize',
  'fieldCount',
  'restTimeMinutes',
  'matchDurationMinutes',
  'setDurationMinutes',
];

const normalizePlayoffDivisionConfig = (value: unknown): PlayoffDivisionConfig | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = PLAYOFF_CONFIG_KEYS.some(
    (key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined,
  );
  if (!hasConfigValue) {
    return null;
  }

  const normalizeNumber = (input: unknown, fallback: number, min: number = 0): number => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.trunc(parsed));
  };
  const normalizeOptionalDuration = (input: unknown): number | undefined => {
    if (input === null || input === undefined || input === '') {
      return undefined;
    }
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(0, Math.trunc(parsed));
  };

  const normalizePoints = (input: unknown, expectedLength: number): number[] => {
    const values = Array.isArray(input)
      ? input
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.max(1, Math.trunc(entry)))
      : [];
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const winnerSetCount = normalizeNumber(row.winnerSetCount, 1, 1);
  const doubleElimination = Boolean(row.doubleElimination);
  const loserSetCount = normalizeNumber(row.loserSetCount, 1, 1);
  const normalizedLoserSetCount = doubleElimination ? loserSetCount : 1;

  return {
    doubleElimination,
    winnerSetCount,
    loserSetCount: normalizedLoserSetCount,
    winnerBracketPointsToVictory: normalizePoints(row.winnerBracketPointsToVictory, winnerSetCount),
    loserBracketPointsToVictory: normalizePoints(row.loserBracketPointsToVictory, normalizedLoserSetCount),
    prize: typeof row.prize === 'string' ? row.prize : '',
    fieldCount: normalizeNumber(row.fieldCount, 1, 1),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0, 0),
    matchDurationMinutes: normalizeOptionalDuration(row.matchDurationMinutes),
    setDurationMinutes: normalizeOptionalDuration(row.setDurationMinutes),
  };
};

const normalizeDivisionPlayoffConfigFields = (value: unknown): PlayoffDivisionConfig | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return normalizePlayoffDivisionConfig({
    doubleElimination: row.playoffDoubleElimination,
    winnerSetCount: row.playoffWinnerSetCount,
    loserSetCount: row.playoffLoserSetCount,
    winnerBracketPointsToVictory: row.playoffWinnerBracketPointsToVictory,
    loserBracketPointsToVictory: row.playoffLoserBracketPointsToVictory,
    prize: row.playoffPrize,
    fieldCount: row.playoffFieldCount,
    restTimeMinutes: row.playoffRestTimeMinutes,
    matchDurationMinutes: row.playoffMatchDurationMinutes,
    setDurationMinutes: row.playoffSetDurationMinutes,
  });
};

type LeagueDivisionConfigPayload = LeagueDivisionConfig;

const LEAGUE_CONFIG_KEYS: ReadonlyArray<keyof LeagueDivisionConfigPayload> = [
  'gamesPerOpponent',
  'usesSets',
  'matchDurationMinutes',
  'setDurationMinutes',
  'setsPerMatch',
  'pointsToVictory',
  'restTimeMinutes',
];

const normalizeLeagueDivisionConfig = (value: unknown): LeagueDivisionConfigPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = LEAGUE_CONFIG_KEYS.some(
    (key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined,
  );
  if (!hasConfigValue) {
    return null;
  }

  const normalizeNumber = (input: unknown, min: number): number | undefined => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(min, Math.trunc(parsed));
  };
  const normalizeSetCount = (input: unknown): number | undefined => {
    const parsed = normalizeNumber(input, 1);
    return parsed && [1, 3, 5].includes(parsed) ? parsed : undefined;
  };
  const normalizePoints = (input: unknown, expectedLength: number): number[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const values = input
      .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry))
      .map((entry) => Math.max(1, Math.trunc(entry)));
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const usesSets = typeof row.usesSets === 'boolean'
    ? row.usesSets
    : Object.prototype.hasOwnProperty.call(row, 'setsPerMatch')
      || Object.prototype.hasOwnProperty.call(row, 'setDurationMinutes')
      || Object.prototype.hasOwnProperty.call(row, 'pointsToVictory')
        ? true
        : undefined;
  const setsPerMatch = usesSets ? (normalizeSetCount(row.setsPerMatch) ?? 1) : undefined;
  const config: LeagueDivisionConfigPayload = {
    gamesPerOpponent: normalizeNumber(row.gamesPerOpponent, 1),
    usesSets,
    matchDurationMinutes: normalizeNumber(row.matchDurationMinutes, 0),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0),
    setDurationMinutes: usesSets ? normalizeNumber(row.setDurationMinutes, 0) : undefined,
    setsPerMatch,
    pointsToVictory: usesSets ? normalizePoints(row.pointsToVictory, setsPerMatch ?? 1) : undefined,
  };

  return Object.fromEntries(
    Object.entries(config).filter(([, entry]) => entry !== undefined),
  ) as LeagueDivisionConfigPayload;
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const keys = value
    .map((entry) => normalizeDivisionKey(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(keys));
};

const normalizeDivisionSortOrder = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const compareDivisionRowsByStoredOrder = <T extends {
  id?: string | null;
  name?: string | null;
  sortOrder?: number | null;
}>(left: T, right: T): number => {
  const leftOrder = normalizeDivisionSortOrder(left.sortOrder);
  const rightOrder = normalizeDivisionSortOrder(right.sortOrder);
  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  const nameCompare = String(left.name ?? '').localeCompare(String(right.name ?? ''));
  return nameCompare || String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const normalizeDivisionIds = (value: unknown, eventId: string): string[] => {
  const keys = normalizeDivisionKeys(value);
  return keys.map((entry) => (
    entry.includes('__division__') || entry.startsWith('division_')
      ? entry
      : buildEventDivisionId(eventId, entry)
  ));
};

const normalizePlacementDivisionIds = (value: unknown, eventId: string): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const normalized = normalizeDivisionKey(entry);
    if (!normalized) {
      return '';
    }
    return normalized.includes('__division__') || normalized.startsWith('division_')
      ? normalized
      : buildEventDivisionId(eventId, normalized);
  });
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry)).filter(Boolean)));
};

const normalizeTeamIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return value;
};

const normalizeOptionalBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const normalizeTeamCheckInMode = (value: unknown): 'OFF' | 'EVENT' | 'MATCH' | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'OFF' || normalized === 'EVENT' || normalized === 'MATCH') {
    return normalized;
  }
  return null;
};

const normalizeOpenMinutesBefore = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.trunc(parsed));
};

const normalizeInstallmentAmountList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.round(entry)));
};

const normalizeInstallmentDateList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => parseDateInput(entry))
    .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
    .map((entry) => entry.toISOString());
};

const parseEventPatchDateInput = (value: unknown, timeZone: string): Date | null => (
  parseDateInputInTimeZone(value, timeZone) ?? parseDateInput(value)
);

const normalizeInstallmentRelativeDayList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
};

const normalizeInputNullableNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeInputOptionalBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const parsed = normalizeOptionalBoolean(value);
  return parsed;
};

const normalizeLeagueScoringConfigUpdate = (
  value: unknown,
): { id?: string; data: Record<string, number | boolean | null> } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const configuredId = typeof row.id === 'string' && row.id.trim().length > 0
    ? row.id.trim()
    : undefined;
  const data: Record<string, number | boolean | null> = {};

  for (const key of LEAGUE_SCORING_NUMBER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const rawValue = row[key];
    const normalized = normalizeNullableNumber(rawValue);
    if (normalized !== null || rawValue === null || rawValue === '') {
      data[key] = normalized;
    }
  }

  for (const key of LEAGUE_SCORING_BOOLEAN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const rawValue = row[key];
    const normalized = normalizeOptionalBoolean(rawValue);
    if (normalized !== null || rawValue === null) {
      data[key] = normalized;
    }
  }

  return { id: configuredId, data };
};

const coerceDivisionFieldMap = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [rawKey, rawFieldIds] of Object.entries(value as Record<string, unknown>)) {
    const key = normalizeDivisionKey(rawKey);
    if (!key) continue;
    result[key] = normalizeFieldIds(rawFieldIds);
  }
  return result;
};

const normalizeDivisionDetailsInput = (
  value: unknown,
  eventId: string,
  sportId?: string | null,
  eventStart?: Date | null,
  defaultKind: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE',
): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const details: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const rawIdentifier = normalizeDivisionKey(row.id)
      ?? normalizeDivisionKey(row.key)
      ?? normalizeDivisionKey(row.name)
      ?? 'c_skill_open';
    const inferred = inferDivisionDetails({
      identifier: rawIdentifier,
      sportInput: typeof row.sportId === 'string' ? row.sportId : sportId ?? undefined,
      fallbackName: typeof row.name === 'string' ? row.name : undefined,
    });
    const parsedPrice = normalizeInputNullableNumber(row.price);
    const parsedMaxParticipants = normalizeInputNullableNumber(row.maxParticipants);
    const parsedPlayoffTeamCount = normalizeInputNullableNumber(row.playoffTeamCount);
    const parsedPoolCount = normalizeInputNullableNumber(row.poolCount);
    const parsedPoolTeamCount = normalizeInputNullableNumber(row.poolTeamCount);
    const parsedKind = normalizeDivisionKind(row.kind, defaultKind);
    const hasPlacementDivisionIdsInput = Object.prototype.hasOwnProperty.call(row, 'playoffPlacementDivisionIds');
    const parsedPlacementDivisionIds = hasPlacementDivisionIdsInput
      ? normalizePlacementDivisionIds(row.playoffPlacementDivisionIds, eventId)
      : undefined;
    const parsedStandingsOverrides = normalizeStandingsOverrides(row.standingsOverrides);
    const parsedStandingsConfirmedAt = (() => {
      const parsed = parseDateInput(row.standingsConfirmedAt);
      return parsed ? parsed.toISOString() : null;
    })();
    const parsedStandingsConfirmedBy = typeof row.standingsConfirmedBy === 'string'
      ? row.standingsConfirmedBy.trim() || null
      : null;
    const explicitPlayoffConfig = normalizePlayoffDivisionConfig(row.playoffConfig);
    const parsedPlayoffConfig = parsedKind === 'PLAYOFF'
      ? (
          explicitPlayoffConfig
          ?? normalizePlayoffDivisionConfig(row)
        )
      : explicitPlayoffConfig;
    const parsedLeagueConfig = parsedKind === 'LEAGUE'
      ? normalizeLeagueDivisionConfig(row)
      : null;
    const parsedAllowPaymentPlans = normalizeInputOptionalBoolean(row.allowPaymentPlans);
    const parsedInstallmentCount = normalizeInputNullableNumber(row.installmentCount);
    const parsedInstallmentDueDates = Object.prototype.hasOwnProperty.call(row, 'installmentDueDates')
      ? normalizeInstallmentDateList(row.installmentDueDates)
      : undefined;
    const parsedInstallmentDueRelativeDays = Object.prototype.hasOwnProperty.call(row, 'installmentDueRelativeDays')
      ? normalizeInstallmentRelativeDayList(row.installmentDueRelativeDays)
      : undefined;
    const parsedInstallmentAmounts = Object.prototype.hasOwnProperty.call(row, 'installmentAmounts')
      ? normalizeInstallmentAmountList(row.installmentAmounts)
      : undefined;
    const hasTeamIdsInput = Object.prototype.hasOwnProperty.call(row, 'teamIds');
    const id = normalizeDivisionKey(row.id)
      ?? buildEventDivisionId(eventId, inferred.token);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const divisionTypeId = normalizeDivisionKey(row.divisionTypeId) ?? inferred.divisionTypeId;
    const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
    const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
    const normalizedTypeIds = normalizeDivisionTypeIds({
      divisionTypeId,
      skillDivisionTypeId: normalizeDivisionKey(row.skillDivisionTypeId),
      ageDivisionTypeId: normalizeDivisionKey(row.ageDivisionTypeId),
      ratingType,
    });
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId: normalizedTypeIds.ageDivisionTypeId,
      sportInput: typeof row.sportId === 'string' ? row.sportId : sportId ?? undefined,
      referenceDate: eventStart ?? null,
    });
    const divisionTypeName = deriveDivisionTypeDisplayName({
      sportInput: typeof row.sportId === 'string' ? row.sportId : sportId ?? undefined,
      gender,
      ratingType,
      divisionTypeId: normalizedTypeIds.divisionTypeId,
    });
    details.push({
      id,
      sourceDivisionId: normalizeDivisionKey(row.sourceDivisionId),
      key: normalizeDivisionKey(row.key) ?? inferred.token,
      name: cleanDivisionDisplayName(row.name, inferred.defaultName),
      kind: parsedKind,
      divisionTypeId: normalizedTypeIds.divisionTypeId,
      skillDivisionTypeId: normalizedTypeIds.skillDivisionTypeId,
      ageDivisionTypeId: normalizedTypeIds.ageDivisionTypeId,
      divisionTypeName,
      ratingType,
      gender,
      sportId: typeof row.sportId === 'string' ? row.sportId : sportId ?? null,
      price: typeof parsedPrice === 'number'
        ? Math.max(0, Math.round(parsedPrice))
        : parsedPrice,
      maxParticipants: typeof parsedMaxParticipants === 'number'
        ? Math.max(0, Math.trunc(parsedMaxParticipants))
        : parsedMaxParticipants,
      playoffTeamCount: typeof parsedPlayoffTeamCount === 'number'
        ? Math.max(0, Math.trunc(parsedPlayoffTeamCount))
        : parsedPlayoffTeamCount,
      poolCount: typeof parsedPoolCount === 'number'
        ? Math.max(0, Math.trunc(parsedPoolCount))
        : parsedPoolCount,
      poolTeamCount: typeof parsedPoolTeamCount === 'number'
        ? Math.max(0, Math.trunc(parsedPoolTeamCount))
        : parsedPoolTeamCount,
      ...(parsedKind === 'PLAYOFF'
        ? { playoffPlacementDivisionIds: [] }
        : parsedPlacementDivisionIds !== undefined
          ? { playoffPlacementDivisionIds: parsedPlacementDivisionIds }
          : {}),
      standingsOverrides: parsedKind === 'PLAYOFF' ? null : parsedStandingsOverrides,
      standingsConfirmedAt: parsedKind === 'PLAYOFF' ? null : parsedStandingsConfirmedAt,
      standingsConfirmedBy: parsedKind === 'PLAYOFF' ? null : parsedStandingsConfirmedBy,
      playoffConfig: parsedPlayoffConfig,
      gamesPerOpponent: parsedLeagueConfig?.gamesPerOpponent ?? null,
      restTimeMinutes: parsedLeagueConfig?.restTimeMinutes ?? null,
      usesSets: parsedLeagueConfig?.usesSets ?? null,
      matchDurationMinutes: parsedLeagueConfig?.matchDurationMinutes ?? null,
      setDurationMinutes: parsedLeagueConfig?.setDurationMinutes ?? null,
      setsPerMatch: parsedLeagueConfig?.setsPerMatch ?? null,
      pointsToVictory: parsedLeagueConfig?.pointsToVictory ?? [],
      allowPaymentPlans: parsedAllowPaymentPlans,
      installmentCount: (() => {
        if (typeof parsedInstallmentCount === 'number') {
          return Math.max(0, Math.trunc(parsedInstallmentCount));
        }
        return parsedInstallmentCount;
      })(),
      installmentDueDates: parsedInstallmentDueDates,
      installmentDueRelativeDays: parsedInstallmentDueRelativeDays,
      installmentAmounts: parsedInstallmentAmounts,
      ageCutoffDate: ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null,
      ageCutoffLabel: ageEligibility.message ?? null,
      ageCutoffSource: ageEligibility.applies ? ageEligibility.cutoffRule.source : null,
      fieldIds: normalizeFieldIds(row.fieldIds),
      ...(parsedKind === 'PLAYOFF'
        ? { teamIds: [] }
        : hasTeamIdsInput
          ? { teamIds: normalizeTeamIds(row.teamIds) }
          : {}),
    });
  }
  return details;
};

const validateUniqueDivisionTeamAssignments = (
  divisionDetails: Array<Record<string, unknown>>,
  singleDivision: boolean,
) => {
  if (singleDivision) {
    return;
  }
  const assignmentMap = new Map<string, string>();
  for (const detail of divisionDetails) {
    const kind = normalizeDivisionKind(detail.kind, 'LEAGUE');
    if (kind === 'PLAYOFF') {
      continue;
    }
    const divisionId = normalizeDivisionKey(detail.id)
      ?? normalizeDivisionKey(detail.key)
      ?? '';
    if (!divisionId) {
      continue;
    }
    const teamIds = normalizeTeamIds(detail.teamIds);
    for (const teamId of teamIds) {
      const assignedDivisionId = assignmentMap.get(teamId);
      if (assignedDivisionId && assignedDivisionId !== divisionId) {
        throw new Response(
          `Team ${teamId} is assigned to multiple divisions. Each team can only belong to one division.`,
          { status: 400 },
        );
      }
      assignmentMap.set(teamId, divisionId);
    }
  }
};

const buildDivisionFieldMap = (
  divisionKeys: string[],
  fieldIds: string[],
  ...maps: Array<Record<string, string[]>>
): Record<string, string[]> => {
  const normalizedDivisionKeys = divisionKeys.length ? divisionKeys : [DEFAULT_DIVISION_KEY];
  const allowedFieldIds = new Set(fieldIds);
  const merged = new Map<string, Set<string>>();
  const aliasToCanonical = new Map<string, string>();

  for (const divisionKey of normalizedDivisionKeys) {
    merged.set(divisionKey, new Set<string>());
    const aliases = new Set<string>([
      divisionKey,
      extractDivisionTokenFromId(divisionKey) ?? '',
    ]);
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeDivisionKey(alias);
      if (!normalizedAlias) return;
      aliasToCanonical.set(normalizedAlias, divisionKey);
    });
  }

  for (const map of maps) {
    for (const [key, ids] of Object.entries(map)) {
      const aliases = new Set<string>([
        key,
        extractDivisionTokenFromId(key) ?? '',
      ]);
      aliases.forEach((alias) => {
        const normalizedAlias = normalizeDivisionKey(alias);
        if (!normalizedAlias) return;
        const canonicalKey = aliasToCanonical.get(normalizedAlias) ?? normalizedAlias;
        const bucket = merged.get(canonicalKey) ?? new Set<string>();
        for (const id of ids) {
          if (!allowedFieldIds.size || allowedFieldIds.has(id)) {
            bucket.add(id);
          }
        }
        merged.set(canonicalKey, bucket);
      });
    }
  }

  const result: Record<string, string[]> = {};
  for (const divisionKey of normalizedDivisionKeys) {
    const ids = Array.from(merged.get(divisionKey) ?? []);
    result[divisionKey] = ids.length ? ids : [];
  }

  return result;
};

const mapDivisionRowsToFieldMap = (
  rows: Array<{ id: string; key: string | null; fieldIds: string[] | null }>,
  divisionKeys: string[],
): Record<string, string[]> => {
  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const rowId = normalizeDivisionKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeDivisionKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  const result: Record<string, string[]> = {};
  for (const divisionKey of divisionKeys) {
    const row = rowsById.get(divisionKey)
      ?? rowsByKey.get(divisionKey)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionKey) ?? '');
    result[divisionKey] = normalizeFieldIds(row?.fieldIds ?? []);
  }
  return result;
};

const divisionFieldMapsEqual = (
  left: Record<string, string[]>,
  right: Record<string, string[]>,
): boolean => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  for (const key of keys) {
    const leftValues = normalizeFieldIds(left[key]).sort();
    const rightValues = normalizeFieldIds(right[key]).sort();
    if (leftValues.length !== rightValues.length) {
      return false;
    }
    for (let index = 0; index < leftValues.length; index += 1) {
      if (leftValues[index] !== rightValues[index]) {
        return false;
      }
    }
  }
  return true;
};

const getDivisionFieldMapForEvent = async (
  eventId: string,
  divisionKeys: string[],
): Promise<Record<string, string[]>> => {
  if (!divisionKeys.length) {
    return {};
  }
  const normalizedKeys = normalizeDivisionKeys(divisionKeys);
  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId,
      OR: [
        { id: { in: normalizedKeys } },
        { key: { in: normalizedKeys } },
      ],
    },
    select: {
      id: true,
      key: true,
      fieldIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return mapDivisionRowsToFieldMap(rows, normalizedKeys);
};

const getDivisionDetailsForEvent = async (
  eventId: string,
  divisionKeys: string[],
  eventStart?: Date | null,
  eventDefaults?: {
    price?: number | null;
    maxParticipants?: number | null;
    playoffTeamCount?: number | null;
    allowPaymentPlans?: boolean | null;
    installmentCount?: number | null;
    installmentDueDates?: unknown;
    installmentDueRelativeDays?: unknown;
    installmentAmounts?: unknown;
  },
): Promise<Array<Record<string, unknown>>> => {
  void eventDefaults;
  if (!divisionKeys.length) {
    return [];
  }
  const normalizedKeys = normalizeDivisionKeys(divisionKeys);
  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId,
      OR: [
        { id: { in: normalizedKeys } },
        { key: { in: normalizedKeys } },
      ],
    },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      playoffTeamCount: true,
      playoffPlacementDivisionIds: true,
      standingsOverrides: true,
      gamesPerOpponent: true,
      restTimeMinutes: true,
      usesSets: true,
      matchDurationMinutes: true,
      setDurationMinutes: true,
      setsPerMatch: true,
      pointsToVictory: true,
      playoffDoubleElimination: true,
      playoffWinnerSetCount: true,
      playoffLoserSetCount: true,
      playoffWinnerBracketPointsToVictory: true,
      playoffLoserBracketPointsToVictory: true,
      playoffPrize: true,
      playoffFieldCount: true,
      playoffRestTimeMinutes: true,
      playoffMatchDurationMinutes: true,
      playoffSetDurationMinutes: true,
      standingsConfirmedAt: true,
      standingsConfirmedBy: true,
      allowPaymentPlans: true,
      installmentCount: true,
      installmentDueDates: true,
      installmentDueRelativeDays: true,
      installmentAmounts: true,
      divisionTypeId: true,
      ratingType: true,
      gender: true,
      ageCutoffDate: true,
      ageCutoffLabel: true,
      ageCutoffSource: true,
      fieldIds: true,
      teamIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const allPoolRows = await prisma.divisions.findMany({
    where: {
      eventId,
      kind: 'LEAGUE',
    },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      maxParticipants: true,
      playoffTeamCount: true,
      playoffPlacementDivisionIds: true,
      teamIds: true,
    },
  });
  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const rowId = normalizeDivisionKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeDivisionKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  return normalizedKeys.map((divisionId) => {
    const row = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
      ?? null;
    const inferred = inferDivisionDetails({
      identifier: row?.key ?? row?.id ?? divisionId,
      sportInput: row?.sportId ?? undefined,
      fallbackName: row?.name ?? undefined,
    });
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId: inferred.divisionTypeId,
      sportInput: row?.sportId ?? undefined,
      referenceDate: eventStart ?? null,
    });
    const ageCutoffDate = (() => {
      if (row?.ageCutoffDate instanceof Date && !Number.isNaN(row.ageCutoffDate.getTime())) {
        return row.ageCutoffDate.toISOString();
      }
      return ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null;
    })();
    const kind = normalizeDivisionKind((row as any)?.kind, 'LEAGUE');
    const standingsConfirmedAt = (() => {
      const parsed = parseDateInput((row as any)?.standingsConfirmedAt);
      return parsed ? parsed.toISOString() : null;
    })();
    const standingsConfirmedBy = typeof (row as any)?.standingsConfirmedBy === 'string'
      ? (row as any).standingsConfirmedBy.trim() || null
      : null;
    const standingsOverrides = normalizeStandingsOverrides((row as any)?.standingsOverrides);
    const playoffConfig = kind === 'PLAYOFF'
        ? (
            normalizePlayoffDivisionConfig((row as any)?.standingsOverrides)
            ?? normalizePlayoffDivisionConfig(row)
          )
        : normalizeDivisionPlayoffConfigFields(row);
    const leagueConfig = normalizeLeagueDivisionConfig(row);
    const generatedPools = kind === 'PLAYOFF'
      ? generatedPoolsForBracket(allPoolRows, row?.id ?? divisionId)
      : [];
    const poolCount = generatedPools.length || null;
    const poolTeamCounts = Array.from(
      new Set(
        generatedPools
          .map((pool) => typeof pool.maxParticipants === 'number' ? pool.maxParticipants : null)
          .filter((value): value is number => typeof value === 'number'),
      ),
    );
    const poolTeamCount = poolTeamCounts.length === 1 ? poolTeamCounts[0] : null;
    const divisionTypeId = row?.divisionTypeId ?? inferred.divisionTypeId;
    const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
    const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
    const divisionTypeName = deriveDivisionTypeDisplayName({
      sportInput: row?.sportId ?? undefined,
      gender,
      ratingType,
      divisionTypeId,
    });
    return {
      id: row?.id ?? divisionId,
      key: row?.key ?? inferred.token,
      name: cleanDivisionDisplayName(row?.name, inferred.defaultName),
      kind,
      divisionTypeId,
      divisionTypeName,
      ratingType,
      gender,
      sportId: row?.sportId ?? null,
      price: typeof row?.price === 'number'
        ? row.price
        : null,
      maxParticipants: typeof row?.maxParticipants === 'number'
        ? row.maxParticipants
        : null,
      playoffTeamCount: typeof row?.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : null,
      poolCount,
      poolTeamCount,
      playoffPlacementDivisionIds: kind === 'PLAYOFF' ? [] : normalizePlacementDivisionIds((row as any)?.playoffPlacementDivisionIds, eventId),
      standingsOverrides: kind === 'PLAYOFF' ? null : standingsOverrides,
      standingsConfirmedAt: kind === 'PLAYOFF' ? null : standingsConfirmedAt,
      standingsConfirmedBy: kind === 'PLAYOFF' ? null : standingsConfirmedBy,
      playoffConfig,
      gamesPerOpponent: leagueConfig?.gamesPerOpponent ?? null,
      restTimeMinutes: leagueConfig?.restTimeMinutes ?? null,
      usesSets: leagueConfig?.usesSets ?? null,
      matchDurationMinutes: leagueConfig?.matchDurationMinutes ?? null,
      setDurationMinutes: leagueConfig?.setDurationMinutes ?? null,
      setsPerMatch: leagueConfig?.setsPerMatch ?? null,
      pointsToVictory: leagueConfig?.pointsToVictory ?? [],
      allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
        ? row.allowPaymentPlans
        : null,
      installmentCount: typeof row?.installmentCount === 'number'
        ? row.installmentCount
        : null,
      installmentDueDates: Array.isArray(row?.installmentDueDates)
        ? row.installmentDueDates
          .map((entry) => parseDateInput(entry))
          .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
          .map((entry) => entry.toISOString())
        : [],
      installmentDueRelativeDays: Array.isArray((row as any)?.installmentDueRelativeDays)
        ? normalizeInstallmentRelativeDayList((row as any).installmentDueRelativeDays)
        : [],
      installmentAmounts: Array.isArray(row?.installmentAmounts)
        ? normalizeInstallmentAmountList(row.installmentAmounts)
        : [],
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
      fieldIds: normalizeFieldIds(row?.fieldIds ?? []),
      teamIds: kind === 'PLAYOFF' ? [] : normalizeTeamIds((row as any)?.teamIds),
    };
  });
};

const getDivisionKeysForEventKind = async (
  eventId: string,
  kind: 'LEAGUE' | 'PLAYOFF',
  client: any = prisma,
): Promise<string[]> => {
  const rows = await client.divisions.findMany({
    where: {
      eventId,
      ...(kind === 'LEAGUE'
        ? { OR: [{ kind: 'LEAGUE' }, { kind: null }] }
        : { kind }),
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: {
      id: true,
      name: true,
      sortOrder: true,
    },
  });
  return [...rows]
    .sort(compareDivisionRowsByStoredOrder)
    .map((row) => normalizeDivisionKey(row.id))
    .filter((value): value is string => Boolean(value));
};

const getTournamentPoolDivisionKeysForEvent = async (eventId: string): Promise<string[]> => {
  const rows = await prisma.divisions.findMany({
    where: { eventId },
    select: {
      id: true,
      kind: true,
      playoffPlacementDivisionIds: true,
    },
  });

  return rows
    .filter((row) => normalizeDivisionKind(row.kind, 'LEAGUE') !== 'PLAYOFF')
    .filter((row) => normalizePlacementDivisionIds(row.playoffPlacementDivisionIds, eventId).length > 0)
    .map((row) => normalizeDivisionKey(row.id))
    .filter((value): value is string => Boolean(value));
};

const getVisibleDivisionKeysForEventResponse = async (
  eventId: string,
  event: { eventType?: unknown; includePlayoffs?: unknown },
): Promise<string[]> => {
  const legacyDivisionKeys = normalizeDivisionKeys((event as any).divisions);
  const baseDivisionKeys = legacyDivisionKeys.length
    ? legacyDivisionKeys
    : await getDivisionKeysForEventKind(eventId, 'LEAGUE');
  const isTournamentPoolPlay = String(event.eventType ?? '').toUpperCase() === 'TOURNAMENT'
    && Boolean(event.includePlayoffs);
  if (!isTournamentPoolPlay) {
    return baseDivisionKeys;
  }

  const poolDivisionKeys = await getTournamentPoolDivisionKeysForEvent(eventId);
  return poolDivisionKeys.length ? poolDivisionKeys : baseDivisionKeys;
};

const isMissingTimeSlotDivisionsColumnError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('timeslots')
    && normalized.includes('divisions')
    && normalized.includes('does not exist');
};

const persistTimeSlotDivisions = async (
  client: any,
  slotId: string,
  divisions: string[],
  updatedAt: Date,
): Promise<void> => {
  if (typeof client?.$executeRaw !== 'function') {
    return;
  }
  try {
    await client.$executeRaw`
      UPDATE "TimeSlots"
      SET "divisions" = ${divisions}::TEXT[],
          "updatedAt" = ${updatedAt}
      WHERE "id" = ${slotId}
    `;
  } catch (error) {
    if (isMissingTimeSlotDivisionsColumnError(error)) {
      return;
    }
    throw error;
  }
};

const hasScheduleImpact = (existing: any, payload: Record<string, any>): boolean => {
  const scheduleFields = [
    'eventType',
    'start',
    'end',
    'noFixedEndDateTime',
    'divisions',
    'fieldIds',
    'timeSlotIds',
    'gamesPerOpponent',
    'includePlayoffs',
    'playoffTeamCount',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
    'setsPerMatch',
    'restTimeMinutes',
    'pointsToVictory',
    'winnerSetCount',
    'loserSetCount',
    'doubleElimination',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'teamIds',
    'userIds',
    'maxParticipants',
    'teamSizeLimit',
    'singleDivision',
  ];

  return scheduleFields.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      return false;
    }

    const nextValue = payload[key];
    const prevValue = (existing as Record<string, any>)[key];

    if (key === 'start' || key === 'end') {
      const nextTime = nextValue instanceof Date ? nextValue.getTime() : parseDateInput(nextValue)?.getTime();
      const prevTime = prevValue instanceof Date ? prevValue.getTime() : parseDateInput(prevValue)?.getTime();
      return nextTime !== prevTime;
    }

    if (Array.isArray(nextValue) || Array.isArray(prevValue)) {
      return !arraysEqual(normalizeStringArray(nextValue, key), normalizeStringArray(prevValue, key));
    }

    if (key === 'eventType') {
      const nextType = typeof nextValue === 'string' ? nextValue.toUpperCase() : nextValue;
      const prevType = typeof prevValue === 'string' ? prevValue.toUpperCase() : prevValue;
      return nextType !== prevType;
    }

    return nextValue !== prevValue;
  });
};

const isDivisionAssignmentValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('assigned to more than one division')
    || normalized.includes('assigned to multiple divisions');
};

const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeEntityIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeEntityId(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);

const isRentalBackedTimeSlot = (slot: {
  rentalLocked?: unknown;
  rentalBookingId?: unknown;
  rentalBookingItemId?: unknown;
  sourceType?: unknown;
}): boolean => (
  slot.rentalLocked === true
  || normalizeEntityId(slot.rentalBookingId) !== null
  || normalizeEntityId(slot.rentalBookingItemId) !== null
  || slot.sourceType === 'RENTAL_BOOKING'
);

const isPlaceholderTeamName = (value: unknown): boolean => (
  typeof value === 'string' && value.trim().toLowerCase().startsWith('place holder')
);

const normalizeStripeSecretKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === 'undefined' || normalizedLower === 'null') {
    return null;
  }
  return normalized;
};

const removeEntityIdFromList = (values: unknown, targetId: string): string[] => {
  const normalizedTargetId = normalizeEntityId(targetId);
  if (!normalizedTargetId) {
    return normalizeEntityIdList(values);
  }
  return normalizeEntityIdList(values).filter((value) => value !== normalizedTargetId);
};

const isAlreadyRefundedStripeError = (error: unknown): boolean => {
  const normalizedCode = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code.toLowerCase()
    : '';
  if (normalizedCode === 'charge_already_refunded') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already refunded');
};

const isCancellablePaymentIntentStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized === 'requires_payment_method'
    || normalized === 'requires_confirmation'
    || normalized === 'requires_action'
    || normalized === 'requires_capture'
    || normalized === 'processing';
};

const collectEventBillIds = async (
  eventId: string,
  client: any = prisma,
): Promise<string[]> => {
  const rootRows = await client.bills.findMany({
    where: { eventId },
    select: { id: true },
  });
  const collected = new Set<string>(normalizeEntityIdList(rootRows.map((row: { id: string }) => row.id)));
  let frontier = Array.from(collected);

  while (frontier.length > 0) {
    const childRows = await client.bills.findMany({
      where: { parentBillId: { in: frontier } },
      select: { id: true },
    });
    const nextFrontier: string[] = [];
    childRows.forEach((row: { id: string }) => {
      const normalizedId = normalizeEntityId(row.id);
      if (!normalizedId || collected.has(normalizedId)) {
        return;
      }
      collected.add(normalizedId);
      nextFrontier.push(normalizedId);
    });
    frontier = nextFrontier;
  }

  return Array.from(collected);
};

const settleEventBillingBeforeDelete = async (params: {
  eventId: string;
  billIds: string[];
  client?: any;
}): Promise<{ refundedPaymentIntentIds: string[]; cancelledPaymentIntentIds: string[] }> => {
  if (!params.billIds.length) {
    return {
      refundedPaymentIntentIds: [],
      cancelledPaymentIntentIds: [],
    };
  }

  const client = params.client ?? prisma;
  const paymentRows = await client.billPayments.findMany({
    where: {
      billId: { in: params.billIds },
      paymentIntentId: { not: null },
    },
    select: {
      id: true,
      paymentIntentId: true,
      status: true,
    },
  });

  const byIntentId = new Map<string, { hasPaid: boolean; hasPending: boolean }>();
  paymentRows.forEach((row: { paymentIntentId: string | null; status: string | null }) => {
    const intentId = normalizeEntityId(row.paymentIntentId);
    if (!intentId) {
      return;
    }
    const existing = byIntentId.get(intentId) ?? { hasPaid: false, hasPending: false };
    const normalizedStatus = typeof row.status === 'string' ? row.status.toUpperCase() : '';
    if (normalizedStatus === 'PAID') {
      existing.hasPaid = true;
    } else if (normalizedStatus === '' || normalizedStatus === 'PENDING') {
      existing.hasPending = true;
    }
    byIntentId.set(intentId, existing);
  });

  const paidIntentIds = Array.from(byIntentId.entries())
    .filter(([, state]) => state.hasPaid)
    .map(([intentId]) => intentId);
  const stripeSecretKey = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

  if (paidIntentIds.length > 0 && !stripe) {
    throw new Error('Cannot refund paid bills because Stripe is not configured.');
  }

  const refundedPaymentIntentIds: string[] = [];
  const cancelledPaymentIntentIds: string[] = [];

  for (const [intentId, state] of byIntentId.entries()) {
    if (state.hasPaid) {
      try {
        await stripe!.refunds.create(await buildRefundCreateParamsForPaymentIntent({
          stripe: stripe!,
          paymentIntentId: intentId,
          reason: 'requested_by_customer',
          metadata: {
            event_id: params.eventId,
            source: 'event_delete',
          },
        }));
        refundedPaymentIntentIds.push(intentId);
      } catch (error) {
        if (isAlreadyRefundedStripeError(error)) {
          refundedPaymentIntentIds.push(intentId);
          continue;
        }
        throw error;
      }
      continue;
    }

    if (!state.hasPending || !stripe) {
      continue;
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      if (!isCancellablePaymentIntentStatus(intent.status)) {
        continue;
      }
      await stripe.paymentIntents.cancel(intentId);
      cancelledPaymentIntentIds.push(intentId);
    } catch (error) {
      console.warn(`Failed to cancel pending PaymentIntent ${intentId} before event delete.`, error);
    }
  }

  return {
    refundedPaymentIntentIds,
    cancelledPaymentIntentIds,
  };
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (RESTRICTED_EVENT_STATES.has(String(event.state ?? '').toUpperCase())) {
    const session = await requireSession(_req);
    if (!(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const [divisionKeys, playoffDivisionKeys] = await Promise.all([
    getVisibleDivisionKeysForEventResponse(eventId, event),
    getDivisionKeysForEventKind(eventId, 'PLAYOFF'),
  ]);
  const [divisionFieldIds, divisionDetails, playoffDivisionDetails, staffInvites, participantIds, tags] = await Promise.all([
    getDivisionFieldMapForEvent(eventId, divisionKeys),
    getDivisionDetailsForEvent(eventId, divisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentDueRelativeDays: (event as any).installmentDueRelativeDays,
      installmentAmounts: event.installmentAmounts,
    }),
    getDivisionDetailsForEvent(eventId, playoffDivisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentDueRelativeDays: (event as any).installmentDueRelativeDays,
      installmentAmounts: event.installmentAmounts,
    }),
    prisma.invites.findMany({
      where: { eventId, type: 'STAFF' },
      orderBy: { createdAt: 'desc' },
    }),
    getEventParticipantIdsForEvent(eventId),
    getEventTagsForResponse(eventId),
  ]);
  const officialResponse = await buildEventOfficialResponse(event);
  return NextResponse.json(
    withLegacyEvent({
      ...event,
      includePlayoffsOrPools: Boolean(event.includePlayoffs),
      ...participantIds,
      ...officialResponse,
      divisionFieldIds,
      divisionDetails,
      playoffDivisionDetails,
      tags,
      staffInvites: staffInvites.map((invite) => withLegacyFields(invite)),
    }),
    { status: 200 },
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'event',
    allowedTopLevelKeys: ['reschedule'],
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }
  const rescheduleValue = parsed.topLevel.reschedule;
  if (rescheduleValue !== undefined && typeof rescheduleValue !== 'boolean') {
    return NextResponse.json({ error: 'Invalid input: "reschedule" must be a boolean.' }, { status: 400 });
  }
  const rescheduleRequested = rescheduleValue === true;

  const { eventId } = await params;

  try {
    const context = buildContext();
    const patchResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.events.findUnique({ where: { id: eventId } });
      if (!existing) {
        throw new Response('Not found', { status: 404 });
      }
      if (!(await canManageEvent(session, existing, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const rawPayload = parsed.payload as Record<string, any>;
      const hardImmutableKeys = findPresentKeys(rawPayload, EVENT_PATCH_HARD_IMMUTABLE_FIELDS);
      if (hardImmutableKeys.length) {
        throw NextResponse.json(
          { error: 'Immutable event fields cannot be updated.', fields: hardImmutableKeys },
          { status: 403 },
        );
      }
      const adminOverridableKeys = findPresentKeys(rawPayload, EVENT_PATCH_ADMIN_OVERRIDABLE_FIELDS);
      if (adminOverridableKeys.length && !session.isAdmin) {
        throw NextResponse.json(
          { error: 'Immutable event fields cannot be updated.', fields: adminOverridableKeys },
          { status: 403 },
        );
      }
      const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;
      const unknownPayloadKeys = findUnknownKeys(payload, [
        ...EVENT_PATCH_ALLOWED_FIELDS,
        ...EVENT_PATCH_ADMIN_OVERRIDABLE_FIELDS,
      ]);
      if (unknownPayloadKeys.length) {
        throw NextResponse.json(
          { error: 'Unknown event patch fields.', unknownKeys: unknownPayloadKeys },
          { status: 400 },
        );
      }

      // Never allow callers to override the URL id or server-managed timestamps.
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;

      const incomingTimeSlots = Array.isArray(payload.timeSlots)
        ? payload.timeSlots.filter((slot): slot is Record<string, any> => Boolean(slot) && typeof slot === 'object')
        : null;
      const incomingFields = Array.isArray(payload.fields)
        ? payload.fields.filter((field): field is Record<string, any> => Boolean(field) && typeof field === 'object')
        : [];
      const hasDivisionFieldMapInput = Object.prototype.hasOwnProperty.call(payload, 'divisionFieldIds');
      const hasDivisionDetailsInput = Object.prototype.hasOwnProperty.call(payload, 'divisionDetails');
      const hasPlayoffDivisionDetailsInput = Object.prototype.hasOwnProperty.call(payload, 'playoffDivisionDetails');
      const incomingDivisionFieldMap = hasDivisionFieldMapInput
        ? coerceDivisionFieldMap(payload.divisionFieldIds)
        : {};
      const patchTimeZone = resolveTimeZone(payload.timeZone, (existing as any).timeZone ?? 'UTC');
      const nextStartForNormalization = Object.prototype.hasOwnProperty.call(payload, 'start')
        ? parseEventPatchDateInput(payload.start, patchTimeZone)
        : existing.start;
      const incomingDivisionDetails = hasDivisionDetailsInput
        ? normalizeDivisionDetailsInput(
          payload.divisionDetails,
          eventId,
          (payload.sportId ?? existing.sportId ?? null) as string | null,
          nextStartForNormalization ?? existing.start,
          'LEAGUE',
        )
        : [];
      const incomingPlayoffDivisionDetails = hasPlayoffDivisionDetailsInput
        ? normalizeDivisionDetailsInput(
            payload.playoffDivisionDetails,
            eventId,
            (payload.sportId ?? existing.sportId ?? null) as string | null,
            nextStartForNormalization ?? existing.start,
            'PLAYOFF',
          )
        : [];
      if (Object.prototype.hasOwnProperty.call(payload, 'divisions')) {
        const normalized = hasDivisionDetailsInput
          ? normalizeDivisionIds(payload.divisions, eventId)
          : normalizeDivisionKeys(payload.divisions);
        payload.divisions = normalized.length
          ? normalized
          : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY];
      } else if (incomingDivisionDetails.length) {
        payload.divisions = incomingDivisionDetails
          .map((detail) => normalizeDivisionKey(detail.id))
          .filter((id): id is string => Boolean(id));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'fieldIds')) {
        payload.fieldIds = normalizeFieldIds(payload.fieldIds);
      }

      // Drop relationship objects that Prisma doesn't accept on `events.update`.
      const incomingTags = Object.prototype.hasOwnProperty.call(payload, 'tags') ? payload.tags : undefined;
      delete payload.players;
      delete payload.officials;
      delete payload.assistantHosts;
      delete payload.teams;
      delete payload.fields;
      delete payload.matches;
      delete payload.timeSlots;
      delete payload.divisionFieldIds;
      delete payload.divisionDetails;
      delete payload.playoffDivisionDetails;
      delete payload.leagueConfig;
      delete payload.tags;
      const incomingLeagueScoringConfig = payload.leagueScoringConfig;
      delete payload.leagueScoringConfig;

      if (payload.installmentDueDates) {
        payload.installmentDueDates = Array.isArray(payload.installmentDueDates)
          ? payload.installmentDueDates.map((value: unknown) => parseDateInput(value)).filter(Boolean)
          : payload.installmentDueDates;
      }

      if (payload.start) {
        const parsedStart = parseEventPatchDateInput(payload.start, patchTimeZone);
        if (parsedStart) payload.start = parsedStart;
      }

      if (payload.end) {
        const parsedEnd = parseEventPatchDateInput(payload.end, patchTimeZone);
        if (parsedEnd) payload.end = parsedEnd;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'noFixedEndDateTime')) {
        const normalizedNoFixedEndDateTime = normalizeOptionalBoolean(payload.noFixedEndDateTime);
        if (normalizedNoFixedEndDateTime !== null) {
          payload.noFixedEndDateTime = normalizedNoFixedEndDateTime;
        } else {
          delete payload.noFixedEndDateTime;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'teamOfficialsMaySwap')) {
        const normalizedTeamOfficialsMaySwap = normalizeOptionalBoolean(payload.teamOfficialsMaySwap);
        if (normalizedTeamOfficialsMaySwap !== null) {
          payload.teamOfficialsMaySwap = normalizedTeamOfficialsMaySwap;
        } else {
          delete payload.teamOfficialsMaySwap;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'teamCheckInMode')) {
        const normalizedTeamCheckInMode = normalizeTeamCheckInMode(payload.teamCheckInMode);
        if (normalizedTeamCheckInMode !== null) {
          payload.teamCheckInMode = normalizedTeamCheckInMode;
        } else {
          delete payload.teamCheckInMode;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'teamCheckInOpenMinutesBefore')) {
        const normalizedOpenMinutesBefore = normalizeOpenMinutesBefore(payload.teamCheckInOpenMinutesBefore);
        if (normalizedOpenMinutesBefore !== null) {
          payload.teamCheckInOpenMinutesBefore = normalizedOpenMinutesBefore;
        } else {
          delete payload.teamCheckInOpenMinutesBefore;
        }
      }
      for (const booleanField of ['allowMatchRosterEdits', 'allowTemporaryMatchPlayers'] as const) {
        if (!Object.prototype.hasOwnProperty.call(payload, booleanField)) continue;
        const normalized = normalizeOptionalBoolean(payload[booleanField]);
        if (normalized !== null) {
          payload[booleanField] = normalized;
        } else {
          delete payload[booleanField];
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'includePlayoffsOrPools')) {
        payload.includePlayoffs = Boolean(payload.includePlayoffsOrPools);
        delete payload.includePlayoffsOrPools;
      }

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!EVENT_UPDATE_FIELDS.has(key)) continue;
        data[key] = value;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'taxHandling')) {
        data.taxHandling = normalizeEventTaxHandling(data.taxHandling);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'organizerManualTaxRateBps')) {
        data.organizerManualTaxRateBps = normalizeOrganizerManualTaxRateBps(data.organizerManualTaxRateBps);
      }
      const targetRegistrationPaymentMode = Object.prototype.hasOwnProperty.call(data, 'registrationPaymentMode')
        ? normalizeRegistrationPaymentMode(data.registrationPaymentMode)
        : normalizeRegistrationPaymentMode((existing as any).registrationPaymentMode);
      if (Object.prototype.hasOwnProperty.call(data, 'registrationPaymentMode')) {
        data.registrationPaymentMode = targetRegistrationPaymentMode;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'manualPaymentLinks')) {
        data.manualPaymentLinks = normalizeManualPaymentLinks(data.manualPaymentLinks);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'manualPaymentInstructions')) {
        data.manualPaymentInstructions = normalizeManualPaymentInstructions(data.manualPaymentInstructions);
      }
      if (
        targetRegistrationPaymentMode !== 'MANUAL'
        && (
          Object.prototype.hasOwnProperty.call(data, 'registrationPaymentMode')
          || Object.prototype.hasOwnProperty.call(data, 'manualPaymentLinks')
          || Object.prototype.hasOwnProperty.call(data, 'manualPaymentInstructions')
        )
      ) {
        data.manualPaymentLinks = [];
        data.manualPaymentInstructions = null;
      }
      const hasLegacyTeamIdsInput = Object.prototype.hasOwnProperty.call(payload, 'teamIds');
      const hasLegacyUserIdsInput = Object.prototype.hasOwnProperty.call(payload, 'userIds');
      const hasLegacyWaitListIdsInput = Object.prototype.hasOwnProperty.call(payload, 'waitListIds');
      const hasLegacyFreeAgentIdsInput = Object.prototype.hasOwnProperty.call(payload, 'freeAgentIds');
      assertEventContentAllowed({
        name: Object.prototype.hasOwnProperty.call(data, 'name') ? data.name : existing.name,
        description: Object.prototype.hasOwnProperty.call(data, 'description') ? data.description : existing.description,
      });

      const targetEventTypeRaw = (data.eventType ?? existing.eventType ?? null) as string | null;
      const targetEventType = typeof targetEventTypeRaw === 'string'
        ? targetEventTypeRaw.toUpperCase()
        : targetEventTypeRaw;
      if (targetEventType === 'TRYOUT') {
        const organizationId = normalizeEntityId(data.organizationId ?? existing.organizationId);
        if (!organizationId) {
          throw new Response('Tryout events must belong to an organization.', { status: 400 });
        }
        const organization = await tx.organizations.findUnique({
          where: { id: organizationId },
          select: { enabledFeatures: true },
        });
        if (!organization?.enabledFeatures.includes('CLUB_TEAMS')) {
          throw new Response('Enable club and team features before creating tryout events.', { status: 400 });
        }
        const tryoutDivisions = hasDivisionDetailsInput
          ? incomingDivisionDetails
          : await tx.divisions.findMany({
              where: { eventId, scope: 'EVENT', status: { not: 'ARCHIVED' } },
              select: { sourceDivisionId: true },
            });
        const sourceDivisionIds = Array.from(new Set(
          tryoutDivisions
            .map((division) => normalizeEntityId(division.sourceDivisionId))
            .filter((divisionId): divisionId is string => Boolean(divisionId)),
        ));
        if (!tryoutDivisions.length || sourceDivisionIds.length !== tryoutDivisions.length) {
          throw new Response('Select at least one club division for this tryout.', { status: 400 });
        }
        const sourceDivisions = await tx.divisions.findMany({
          where: {
            id: { in: sourceDivisionIds },
            organizationId,
            scope: 'ORGANIZATION',
            status: { not: 'ARCHIVED' },
          },
          select: { id: true },
        });
        if (sourceDivisions.length !== sourceDivisionIds.length) {
          throw new Response('One or more selected club divisions are unavailable.', { status: 400 });
        }
        data.teamSignup = false;
        data.singleDivision = false;
        data.noFixedEndDateTime = true;
        data.doTeamsOfficiate = false;
        data.teamOfficialsMaySwap = false;
        data.teamCheckInMode = 'OFF';
        data.allowMatchRosterEdits = false;
        data.allowTemporaryMatchPlayers = false;
      }
      const targetParentEvent = normalizeEntityId(data.parentEvent ?? existing.parentEvent ?? null);
      const targetIsWeeklyParent = targetEventType === 'WEEKLY_EVENT' && !targetParentEvent;
      if (Object.prototype.hasOwnProperty.call(payload, 'installmentDueRelativeDays')) {
        data.installmentDueRelativeDays = targetIsWeeklyParent
          ? normalizeInstallmentRelativeDayList(payload.installmentDueRelativeDays)
          : [];
      } else if (!targetIsWeeklyParent && existing.eventType === 'WEEKLY_EVENT') {
        data.installmentDueRelativeDays = [];
      }
      if (targetIsWeeklyParent && Object.prototype.hasOwnProperty.call(data, 'installmentDueDates')) {
        data.installmentDueDates = [];
      }
      const targetIncludePlayoffsOrPools = Boolean(data.includePlayoffs ?? existing.includePlayoffs);
      if (targetEventType !== 'LEAGUE') {
        data.splitLeaguePlayoffDivisions = targetEventType === 'TOURNAMENT' && targetIncludePlayoffsOrPools;
      } else if (Object.prototype.hasOwnProperty.call(payload, 'splitLeaguePlayoffDivisions')) {
        data.splitLeaguePlayoffDivisions = Boolean(payload.splitLeaguePlayoffDivisions);
      } else if (!Object.prototype.hasOwnProperty.call(data, 'splitLeaguePlayoffDivisions')) {
        data.splitLeaguePlayoffDivisions = Boolean(existing.splitLeaguePlayoffDivisions);
      }
      const targetOfficialSchedulingMode = normalizeOfficialSchedulingMode(
        data.officialSchedulingMode ?? (existing as any).officialSchedulingMode,
      );
      data.officialSchedulingMode = targetOfficialSchedulingMode;
      if (targetOfficialSchedulingMode === 'TEAM_STAFFING') {
        data.doTeamsOfficiate = true;
      }
      if (data.doTeamsOfficiate !== true) {
        data.teamOfficialsMaySwap = false;
      } else if (Object.prototype.hasOwnProperty.call(payload, 'teamOfficialsMaySwap')) {
        data.teamOfficialsMaySwap = Boolean(payload.teamOfficialsMaySwap);
      } else if (!Object.prototype.hasOwnProperty.call(data, 'teamOfficialsMaySwap')) {
        data.teamOfficialsMaySwap = Boolean((existing as any).teamOfficialsMaySwap);
      }
      const targetTeamSignup = Object.prototype.hasOwnProperty.call(data, 'teamSignup')
        ? Boolean(data.teamSignup)
        : Boolean((existing as any).teamSignup);
      if (!targetTeamSignup) {
        data.teamCheckInMode = 'OFF';
        data.allowMatchRosterEdits = false;
        data.allowTemporaryMatchPlayers = false;
      } else {
        data.teamCheckInMode = Object.prototype.hasOwnProperty.call(data, 'teamCheckInMode')
          ? data.teamCheckInMode
          : ((existing as any).teamCheckInMode ?? 'OFF');
        data.teamCheckInOpenMinutesBefore = Object.prototype.hasOwnProperty.call(data, 'teamCheckInOpenMinutesBefore')
          ? data.teamCheckInOpenMinutesBefore
          : ((existing as any).teamCheckInOpenMinutesBefore ?? 60);
        data.allowMatchRosterEdits = Object.prototype.hasOwnProperty.call(data, 'allowMatchRosterEdits')
          ? Boolean(data.allowMatchRosterEdits)
          : Boolean((existing as any).allowMatchRosterEdits);
        data.allowTemporaryMatchPlayers = data.allowMatchRosterEdits
          ? (
            Object.prototype.hasOwnProperty.call(data, 'allowTemporaryMatchPlayers')
              ? Boolean(data.allowTemporaryMatchPlayers)
              : Boolean((existing as any).allowTemporaryMatchPlayers)
          )
          : false;
      }
      const nextOrganizationId = normalizeEntityId(data.organizationId ?? existing.organizationId ?? null);
      const requestedEventOfficialIds = Array.isArray(payload.eventOfficials)
        ? Array.from(new Set(
            payload.eventOfficials
              .map((entry: unknown) => (
                entry && typeof entry === 'object'
                  ? normalizeEntityId((entry as Record<string, unknown>).userId)
                  : null
              ))
              .filter((userId: string | null): userId is string => Boolean(userId)),
          ))
        : [];
      let allowedEventOfficialInputUserIds: string[] | null = null;
      if (nextOrganizationId) {
        const [organizationAccess, staffMembers, staffInvites] = await Promise.all([
          tx.organizations.findUnique({
            where: { id: nextOrganizationId },
            select: {
              ownerId: true,
            },
          }),
          tx.staffMembers?.findMany
            ? tx.staffMembers.findMany({
              where: { organizationId: nextOrganizationId },
              select: {
                organizationId: true,
                userId: true,
                types: true,
              },
            })
            : Promise.resolve([]),
          tx.invites?.findMany
            ? tx.invites.findMany({
              where: { organizationId: nextOrganizationId, type: 'STAFF' },
              select: {
                organizationId: true,
                userId: true,
                type: true,
                status: true,
              },
            })
            : Promise.resolve([]),
        ]);
        if (!organizationAccess) {
          throw new Response('Organization not found', { status: 400 });
        }
        const sanitizedAssignments = sanitizeOrganizationEventAssignments(
          {
            hostId: data.hostId ?? existing.hostId,
            assistantHostIds: (
              Object.prototype.hasOwnProperty.call(data, 'assistantHostIds')
                ? data.assistantHostIds
                : existing.assistantHostIds
            ) as string[] | null | undefined,
            officialIds: [],
          },
          { ...organizationAccess, staffMembers, staffInvites },
        );
        allowedEventOfficialInputUserIds = sanitizeOrganizationEventAssignments(
          {
            hostId: data.hostId ?? existing.hostId,
            assistantHostIds: [],
            officialIds: requestedEventOfficialIds,
          },
          { ...organizationAccess, staffMembers, staffInvites },
        ).officialIds;
        data.hostId = sanitizedAssignments.hostId ?? normalizeEntityId(existing.hostId) ?? '';
        data.assistantHostIds = sanitizedAssignments.assistantHostIds;
      }
      if (targetEventType === 'LEAGUE') {
        const normalizedLeagueConfig = normalizeLeagueScoringConfigUpdate(incomingLeagueScoringConfig);
        const payloadLeagueConfigId = typeof payload.leagueScoringConfigId === 'string'
          && payload.leagueScoringConfigId.trim().length > 0
          ? payload.leagueScoringConfigId.trim()
          : null;
        const existingLeagueConfigId = typeof existing.leagueScoringConfigId === 'string'
          && existing.leagueScoringConfigId.trim().length > 0
          ? existing.leagueScoringConfigId.trim()
          : null;
        const leagueScoringConfigId = normalizedLeagueConfig?.id
          ?? payloadLeagueConfigId
          ?? existingLeagueConfigId
          ?? crypto.randomUUID();
        const leagueScoringData = normalizedLeagueConfig?.data ?? {};
        const now = new Date();
        await tx.leagueScoringConfigs.upsert({
          where: { id: leagueScoringConfigId },
          create: {
            id: leagueScoringConfigId,
            ...leagueScoringData,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            ...leagueScoringData,
            updatedAt: now,
          },
        });
        data.leagueScoringConfigId = leagueScoringConfigId;
      }

      const legacyExistingDivisionKeys = normalizeDivisionKeys((existing as any).divisions);
      const existingDivisionKeys = legacyExistingDivisionKeys.length
        ? legacyExistingDivisionKeys
        : await getDivisionKeysForEventKind(eventId, 'LEAGUE', tx);
      const existingFieldIds = normalizeFieldIds(existing.fieldIds);
      const payloadFieldIds = incomingFields
        .map((field) => {
          if (typeof field.id === 'string' && field.id.length > 0) {
            return field.id;
          }
          return null;
        })
        .filter((id): id is string => Boolean(id));
      const hasTimeSlotPayload = incomingTimeSlots !== null;
      const slotDerivedFieldIds = hasTimeSlotPayload
        ? normalizeFieldIds(
          incomingTimeSlots.flatMap((slot) => normalizeTimeSlotFieldIds(slot)),
        )
        : [];
      const nextFieldIds = (() => {
        if (slotDerivedFieldIds.length) {
          return slotDerivedFieldIds;
        }
        if (Array.isArray(data.fieldIds)) {
          return normalizeFieldIds(data.fieldIds);
        }
        if (payloadFieldIds.length) {
          return normalizeFieldIds(payloadFieldIds);
        }
        return existingFieldIds;
      })();
      if (
        nextFieldIds.length === 0
        && (
          hasTimeSlotPayload
          || Object.prototype.hasOwnProperty.call(payload, 'fieldIds')
          || incomingFields.length > 0
        )
      ) {
        throw new Response(EVENT_FIELDS_REQUIRED_MESSAGE, { status: 400 });
      }
      if (
        hasTimeSlotPayload
        || Object.prototype.hasOwnProperty.call(payload, 'fieldIds')
        || incomingFields.length > 0
      ) {
        data.fieldIds = nextFieldIds;
      }
      const nextSportId = normalizeEntityId(data.sportId ?? existing.sportId ?? null);
      const [existingEventOfficialRows, sportRow] = await Promise.all([
        typeof (tx as any).eventOfficials?.findMany === 'function'
          ? (tx as any).eventOfficials.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } })
          : Promise.resolve([]),
        nextSportId && typeof (tx as any).sports?.findUnique === 'function'
          ? (tx as any).sports.findUnique({
              where: { id: nextSportId },
              select: { officialPositionTemplates: true } as any,
            })
          : Promise.resolve(null),
      ]);
      const templateOfficialPositions = buildEventOfficialPositionsFromTemplates(
        eventId,
        normalizeSportOfficialPositionTemplates((sportRow as any)?.officialPositionTemplates),
      );
      const hasOfficialPositionsInput = Object.prototype.hasOwnProperty.call(payload, 'officialPositions');
      let nextOfficialPositions = hasOfficialPositionsInput
        ? normalizeEventOfficialPositions(payload.officialPositions, eventId)
        : normalizeEventOfficialPositions((existing as any).officialPositions, eventId);
      if (!nextOfficialPositions.length) {
        nextOfficialPositions = templateOfficialPositions;
      }
      const existingEventOfficialIds = Array.from(new Set(
        (existingEventOfficialRows as any[])
          .map((row) => normalizeEntityId(row.userId))
          .filter((userId: string | null): userId is string => Boolean(userId)),
      ));
      if (!nextOfficialPositions.length && existingEventOfficialIds.length) {
        nextOfficialPositions = buildEventOfficialPositionsFromTemplates(eventId, [{ name: 'Official', count: 1 }]);
      }
      data.officialPositions = nextOfficialPositions;
      data.officialSchedulingMode = normalizeOfficialSchedulingMode(
        data.officialSchedulingMode ?? (existing as any).officialSchedulingMode,
      );
      const validPositionIdSet = new Set(nextOfficialPositions.map((position) => position.id));
      const validFieldIdSet = new Set(nextFieldIds);
      const sanitizedExistingEventOfficials = (existingEventOfficialRows as any[])
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          positionIds: normalizeEntityIdList(row.positionIds).filter((positionId: string) => validPositionIdSet.has(positionId)),
          fieldIds: normalizeEntityIdList(row.fieldIds).filter((fieldId: string) => validFieldIdSet.has(fieldId)),
          isActive: row.isActive !== false,
        }))
        .filter((row) => row.positionIds.length > 0);
      const hasEventOfficialsInput = Object.prototype.hasOwnProperty.call(payload, 'eventOfficials');
      const allowedEventOfficialUserIds = hasEventOfficialsInput
        ? (allowedEventOfficialInputUserIds ?? requestedEventOfficialIds)
        : sanitizedExistingEventOfficials.map((row) => row.userId);
      const eventOfficialsInput = hasEventOfficialsInput
        ? filterEventOfficialsByUserIds(payload.eventOfficials, allowedEventOfficialUserIds)
        : payload.eventOfficials;
      const nextEventOfficials = hasEventOfficialsInput
        ? normalizeEventOfficials(eventOfficialsInput, {
            eventId,
            positionIds: nextOfficialPositions.map((position) => position.id),
            fieldIds: nextFieldIds,
          })
        : sanitizedExistingEventOfficials.length
          ? sanitizedExistingEventOfficials
          : [];
      const nextDivisionKeys = (() => {
        if (Array.isArray(data.divisions)) {
          const normalized = hasDivisionDetailsInput
            ? normalizeDivisionIds(data.divisions, eventId)
            : normalizeDivisionKeys(data.divisions);
          return normalized.length
            ? normalized
            : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY];
        }
        return existingDivisionKeys.length
          ? existingDivisionKeys
          : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY];
      })();
      delete data.divisions;
      const nextSingleDivision = typeof data.singleDivision === 'boolean'
        ? data.singleDivision
        : Boolean(existing.singleDivision);
      if (incomingDivisionDetails.length > 0) {
        validateUniqueDivisionTeamAssignments(incomingDivisionDetails, nextSingleDivision);
      }
      const nextEventTypeRaw = (data.eventType ?? existing.eventType ?? null) as string | null;
      const nextEventType = typeof nextEventTypeRaw === 'string'
        ? nextEventTypeRaw.toUpperCase()
        : nextEventTypeRaw;
      const nextStart = (data.start ?? existing.start ?? null) as Date | null;
      const nextEnd = (data.end ?? existing.end ?? null) as Date | null;
      const existingNoFixedEndDateTime = typeof (existing as any).noFixedEndDateTime === 'boolean'
        ? Boolean((existing as any).noFixedEndDateTime)
        : false;
      const nextNoFixedEndDateTime = typeof data.noFixedEndDateTime === 'boolean'
        ? data.noFixedEndDateTime
        : existingNoFixedEndDateTime;
      if (supportsScheduleSlots(nextEventType) && nextNoFixedEndDateTime && data.end == null) {
        const preservedComputedEnd = existing.end instanceof Date
          ? existing.end
          : parseDateInput(existing.end);
        if (preservedComputedEnd) {
          data.end = preservedComputedEnd;
        }
      }
      if (supportsScheduleSlots(nextEventType) && !nextNoFixedEndDateTime) {
        if (!(nextStart instanceof Date) || !(nextEnd instanceof Date)) {
          throw new Response('Start and end date/time are required when no fixed end datetime scheduling is disabled.', { status: 400 });
        }
        if (nextEnd.getTime() <= nextStart.getTime()) {
          throw new Response('End date/time must be after start date/time when no fixed end datetime scheduling is disabled.', { status: 400 });
        }
      }
      const existingSlotIds = Array.isArray(existing.timeSlotIds)
        ? existing.timeSlotIds.map((value: unknown) => String(value))
        : [];
      const shouldSyncDivisions = hasDivisionFieldMapInput
        || hasDivisionDetailsInput
        || hasPlayoffDivisionDetailsInput
        || incomingFields.length > 0
        || hasTimeSlotPayload
        || Object.prototype.hasOwnProperty.call(payload, 'divisions')
        || Object.prototype.hasOwnProperty.call(payload, 'fieldIds')
        || Object.prototype.hasOwnProperty.call(payload, 'sportId')
        || Object.prototype.hasOwnProperty.call(payload, 'organizationId');

      let currentDivisionFieldMap: Record<string, string[]> = {};
      let nextDivisionFieldMap: Record<string, string[]> = {};
      let divisionFieldMapChanged = false;
      if (shouldSyncDivisions && nextDivisionKeys.length) {
        const persistedDivisionRows = await tx.divisions.findMany({
          where: {
            eventId,
            OR: [
              { id: { in: nextDivisionKeys } },
              { key: { in: nextDivisionKeys } },
            ],
          },
          select: {
            id: true,
            key: true,
            fieldIds: true,
          },
        });
        currentDivisionFieldMap = mapDivisionRowsToFieldMap(persistedDivisionRows, nextDivisionKeys);
        nextDivisionFieldMap = buildDivisionFieldMap(
          nextDivisionKeys,
          nextFieldIds,
          currentDivisionFieldMap,
          incomingDivisionFieldMap,
        );
        divisionFieldMapChanged = !divisionFieldMapsEqual(currentDivisionFieldMap, nextDivisionFieldMap);
      }

      let canonicalTimeSlots: ReturnType<typeof canonicalizeTimeSlots> | null = null;
      if (incomingTimeSlots !== null) {
        const shouldEnforceAllTimeSlotDivisions = nextSingleDivision && !isTournamentPoolPlayEnabled({
          eventType: data.eventType ?? existing.eventType,
          includePlayoffs: data.includePlayoffs ?? existing.includePlayoffs,
          includePlayoffsOrPools: data.includePlayoffs ?? existing.includePlayoffs,
        });
        canonicalTimeSlots = canonicalizeTimeSlots({
          eventId,
          slots: incomingTimeSlots,
          fallbackStartDate: existing.start,
          timeZone: data.timeZone ?? existing.timeZone,
          fallbackDivisionKeys: nextDivisionKeys,
          enforceAllDivisions: shouldEnforceAllTimeSlotDivisions,
          normalizeDivisions: (value) => (
            hasDivisionDetailsInput
              ? normalizeDivisionIds(value, eventId)
              : normalizeDivisionKeys(value)
          ),
        });
        data.timeSlotIds = Array.from(new Set(canonicalTimeSlots.map((slot) => slot.id)));
      }

      // Keep plain PATCH saves metadata-only; clients must explicitly opt-in to a rebuild.
      const scheduleChanged = hasScheduleImpact(existing, { ...payload, ...data }) || divisionFieldMapChanged || hasTimeSlotPayload;
      const shouldSchedule = rescheduleRequested && scheduleChanged;

      if (canonicalTimeSlots !== null) {
        const nextSlotIds = Array.from(new Set(canonicalTimeSlots.map((slot) => slot.id)));
        const nextSlotIdSet = new Set(nextSlotIds);
        const staleSlotIds = existingSlotIds.filter((slotId) => !nextSlotIdSet.has(slotId));
        const existingRentalLockedSlots = nextSlotIds.length
          ? await tx.timeSlots.findMany({
              where: {
                id: { in: nextSlotIds },
                OR: [
                  { rentalLocked: true },
                  { rentalBookingId: { not: null } },
                  { rentalBookingItemId: { not: null } },
                  { sourceType: 'RENTAL_BOOKING' },
                ],
              } as any,
              select: {
                id: true,
                startDate: true,
                endDate: true,
                scheduledFieldId: true,
                scheduledFieldIds: true,
                sourceType: true,
                rentalBookingId: true,
                rentalBookingItemId: true,
                rentalLocked: true,
              } as any,
            })
          : [];
        const existingRentalLockedSlotById = new Map(existingRentalLockedSlots.map((slot: any) => [String(slot.id), slot]));

        await reserveRentalBookingSlotsForEvent(tx, eventId, canonicalTimeSlots, new Date());

        for (const slot of canonicalTimeSlots) {
          const now = new Date();
          const existingRentalLockedSlot = existingRentalLockedSlotById.get(slot.id);
          if (existingRentalLockedSlot) {
            if (isRentalBackedTimeSlot(slot)) {
              const existingFieldIds = normalizeFieldIds(
                Array.isArray(existingRentalLockedSlot.scheduledFieldIds) && existingRentalLockedSlot.scheduledFieldIds.length
                  ? existingRentalLockedSlot.scheduledFieldIds
                  : [existingRentalLockedSlot.scheduledFieldId],
              );
              const nextFieldIds = normalizeFieldIds(slot.scheduledFieldIds);
              const fieldsChanged = existingFieldIds.join('|') !== nextFieldIds.join('|');
              const startChanged = new Date(existingRentalLockedSlot.startDate).getTime() !== slot.startDate.getTime();
              const existingEndTime = existingRentalLockedSlot.endDate ? new Date(existingRentalLockedSlot.endDate).getTime() : null;
              const nextEndTime = slot.endDate ? slot.endDate.getTime() : null;
              const endChanged = existingEndTime !== nextEndTime;
              const bookingChanged = normalizeFieldIds([existingRentalLockedSlot.rentalBookingId])[0] !== (slot.rentalBookingId ?? undefined);
              if (fieldsChanged || startChanged || endChanged || bookingChanged) {
                throw NextResponse.json(
                  { error: 'Rental-backed time slots cannot be edited. Remove the rental from the event or ask the facility owner to change the reservation.' },
                  { status: 409 },
                );
              }
            } else if (typeof tx.rentalBookingItems?.updateMany === 'function') {
              await tx.rentalBookingItems.updateMany({
                where: {
                  eventId,
                  eventTimeSlotId: slot.id,
                } as any,
                data: {
                  eventId: null,
                  eventTimeSlotId: null,
                  updatedAt: now,
                } as any,
              });
            }
          }
          const upsertData = {
            dayOfWeek: slot.dayOfWeek,
            daysOfWeek: slot.daysOfWeek,
            startTimeMinutes: slot.startTimeMinutes,
            endTimeMinutes: slot.endTimeMinutes,
            startDate: slot.startDate,
            endDate: slot.endDate,
            timeZone: slot.timeZone,
            repeating: slot.repeating,
            scheduledFieldId: slot.scheduledFieldId,
            scheduledFieldIds: slot.scheduledFieldIds,
            price: slot.price,
            taxHandling: slot.taxHandling,
            requiredTemplateIds: slot.requiredTemplateIds,
            hostRequiredTemplateIds: slot.hostRequiredTemplateIds,
            sourceType: slot.sourceType,
            rentalBookingId: slot.rentalBookingId,
            rentalBookingItemId: slot.rentalBookingItemId,
            rentalLocked: slot.rentalLocked,
            updatedAt: now,
          };

          await tx.timeSlots.upsert({
            where: { id: slot.id },
            create: {
              id: slot.id,
              ...upsertData,
              createdAt: now,
            } as any,
            update: upsertData as any,
          });
          await persistTimeSlotDivisions(tx, slot.id, slot.divisions, now);
        }

        if (staleSlotIds.length) {
          if (typeof tx.rentalBookingItems?.updateMany === 'function') {
            await tx.rentalBookingItems.updateMany({
              where: {
                eventId,
                eventTimeSlotId: { in: staleSlotIds },
              } as any,
              data: {
                eventId: null,
                eventTimeSlotId: null,
                updatedAt: new Date(),
              } as any,
            });
          }
          await tx.timeSlots.deleteMany({
            where: { id: { in: staleSlotIds } },
          });
        }
      } else if (nextSingleDivision && nextDivisionKeys.length && existingSlotIds.length) {
        const now = new Date();
        for (const slotId of existingSlotIds) {
          await persistTimeSlotDivisions(tx, slotId, nextDivisionKeys, now);
        }
      }

      const nextFieldIdSet = new Set(nextFieldIds);
      const incomingFieldsById = new Map<string, Record<string, any>>();
      for (const field of incomingFields) {
        const fieldId = typeof field.id === 'string' && field.id.length > 0
            ? field.id
            : null;
        if (!fieldId) continue;
        incomingFieldsById.set(fieldId, field);
      }
      const existingFieldOwnershipById = new Map<string, { organizationId: string | null; createdBy: string | null }>();
      const incomingFieldIds = Array.from(incomingFieldsById.keys());
      if (incomingFieldIds.length && typeof (tx as any).fields?.findMany === 'function') {
        const existingIncomingFields = await (tx as any).fields.findMany({
          where: { id: { in: incomingFieldIds } },
          select: { id: true, organizationId: true, createdBy: true },
        });
        for (const row of existingIncomingFields as Array<{ id: string; organizationId?: string | null; createdBy?: string | null }>) {
          existingFieldOwnershipById.set(
            row.id,
            {
              organizationId: normalizeNullableString(row.organizationId) ?? null,
              createdBy: normalizeNullableString(row.createdBy) ?? null,
            },
          );
        }
      }

      const shouldPersistLocalFields = incomingFieldsById.size > 0;
      if (shouldPersistLocalFields && typeof (tx as any).fields?.upsert === 'function') {
        for (const fieldId of nextFieldIds) {
          const field = incomingFieldsById.get(fieldId);
          if (!field) continue;
          const now = new Date();
          const existingFieldOwnership = existingFieldOwnershipById.get(fieldId);
          const incomingFieldOrganizationId = normalizeNullableString(field.organizationId);
          const persistedFieldOrganizationId = existingFieldOwnership?.organizationId ?? null;
          const persistedFieldCreatedBy = existingFieldOwnership?.createdBy ?? null;
          const createFieldOrganizationId = null;
          if (
            Boolean(existingFieldOwnership)
            && incomingFieldOrganizationId !== null
            && persistedFieldOrganizationId !== incomingFieldOrganizationId
          ) {
            console.warn(
              `[events] Ignoring attempted field ownership change during PATCH for field ${fieldId}: ` +
                `${persistedFieldOrganizationId ?? 'null'} -> ${incomingFieldOrganizationId}`,
            );
          }
          const updateFieldOwnershipUpdate = existingFieldOwnership
            ? {
                organizationId: persistedFieldOrganizationId ?? null,
                createdBy: persistedFieldCreatedBy ?? null,
              }
            : {};
          const fieldData = {
            lat: normalizeNullableNumber(field.lat),
            long: normalizeNullableNumber(field.long),
            heading: normalizeNullableNumber(field.heading),
            inUse: typeof field.inUse === 'boolean' ? field.inUse : null,
            name: normalizeNullableString(field.name),
            rentalSlotIds: normalizeFieldIds(field.rentalSlotIds),
            location: normalizeNullableString(field.location),
            updatedAt: now,
          };

          await (tx as any).fields.upsert({
            where: { id: fieldId },
            create: {
              id: fieldId,
              ...fieldData,
              organizationId: createFieldOrganizationId ?? null,
              createdBy: persistedFieldCreatedBy ?? session.userId,
              createdAt: now,
            },
            update: {
              ...fieldData,
              ...updateFieldOwnershipUpdate,
            },
          });
        }
      }

      const removedFieldIds = existingFieldIds.filter((fieldId) => !nextFieldIdSet.has(fieldId));
      if (removedFieldIds.length) {
        if (typeof (tx as any).matches?.deleteMany === 'function') {
          await (tx as any).matches.deleteMany({
            where: {
              eventId,
              fieldId: { in: removedFieldIds },
            },
          });
        }
        if (typeof (tx as any).fields?.deleteMany === 'function') {
          await (tx as any).fields.deleteMany({
            where: {
              id: { in: removedFieldIds },
              organizationId: null,
            },
          });
        }
      }

      const updatedEvent = await updateEventWithSchemaContract(
        tx,
        eventId,
        {
          ...data,
          updatedAt: new Date(),
        },
      );
      if (incomingTags !== undefined) {
        await syncEventTags(eventId, incomingTags, tx, { eventType: data.eventType });
      } else if (Object.prototype.hasOwnProperty.call(data, 'eventType')) {
        await syncEventTypeTagsForEvent(eventId, data.eventType, tx);
      }
      const shouldPersistEventOfficials = (
        typeof (tx as any).eventOfficials?.deleteMany === 'function'
        && (
          hasEventOfficialsInput
          || hasOfficialPositionsInput
          || Object.prototype.hasOwnProperty.call(payload, 'sportId')
          || existingEventOfficialRows.length === 0
        )
      );
      if (shouldPersistEventOfficials) {
        await (tx as any).eventOfficials.deleteMany({ where: { eventId } });
        for (const official of nextEventOfficials) {
          await (tx as any).eventOfficials.create({
            data: {
              id: official.id,
              eventId,
              userId: official.userId,
              positionIds: official.positionIds,
              fieldIds: official.fieldIds,
              isActive: official.isActive,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
        await clearRemovedEventOfficialMatchAssignments(tx, eventId, nextEventOfficials);
      }

      await syncEventParticipantRegistrationsFromCompatibilityIds(tx, {
        eventId,
        createdBy: session.userId,
        teamIds: normalizeEntityIdList(payload.teamIds),
        userIds: normalizeEntityIdList(payload.userIds),
        waitListIds: normalizeEntityIdList(payload.waitListIds),
        freeAgentIds: normalizeEntityIdList(payload.freeAgentIds),
        syncTeams: hasLegacyTeamIdsInput,
        syncUsers: hasLegacyUserIdsInput,
        syncWaitList: hasLegacyWaitListIdsInput,
        syncFreeAgents: hasLegacyFreeAgentIdsInput,
      });

      const defaultDivisionPrice = (() => {
        const parsed = normalizeNullableNumber(data.price ?? existing.price);
        if (typeof parsed === 'number') {
          return Math.max(0, Math.round(parsed));
        }
        return parsed;
      })();
      const defaultDivisionMaxParticipants = (() => {
        const parsed = normalizeNullableNumber(data.maxParticipants ?? existing.maxParticipants);
        if (typeof parsed === 'number') {
          return Math.max(0, Math.trunc(parsed));
        }
        return parsed;
      })();
      const defaultDivisionPlayoffTeamCount = (() => {
        const parsed = normalizeNullableNumber(data.playoffTeamCount ?? existing.playoffTeamCount);
        if (typeof parsed === 'number') {
          return Math.max(0, Math.trunc(parsed));
        }
        return parsed;
      })();
      const defaultDivisionAllowPaymentPlans = normalizeOptionalBoolean(
        Object.prototype.hasOwnProperty.call(data, 'allowPaymentPlans')
          ? data.allowPaymentPlans
          : existing.allowPaymentPlans,
      );
      const defaultDivisionInstallmentCount = (() => {
        const parsed = normalizeNullableNumber(
          Object.prototype.hasOwnProperty.call(data, 'installmentCount')
            ? data.installmentCount
            : existing.installmentCount,
        );
        if (typeof parsed === 'number') {
          return Math.max(0, Math.trunc(parsed));
        }
        return parsed;
      })();
      const defaultDivisionInstallmentDueDates = normalizeInstallmentDateList(
        targetIsWeeklyParent
          ? []
          : Object.prototype.hasOwnProperty.call(data, 'installmentDueDates')
            ? data.installmentDueDates
            : existing.installmentDueDates,
      );
      const defaultDivisionInstallmentDueRelativeDays = targetIsWeeklyParent
        ? normalizeInstallmentRelativeDayList(
          Object.prototype.hasOwnProperty.call(data, 'installmentDueRelativeDays')
            ? data.installmentDueRelativeDays
            : (existing as any).installmentDueRelativeDays,
        )
        : [];
      const defaultDivisionInstallmentAmounts = normalizeInstallmentAmountList(
        Object.prototype.hasOwnProperty.call(data, 'installmentAmounts')
          ? data.installmentAmounts
          : existing.installmentAmounts,
      );

      if (shouldSyncDivisions) {
        const syncedDivisionIds = await syncEventDivisions({
          eventId,
          divisionIds: nextDivisionKeys,
          fieldIds: nextFieldIds,
          includePlayoffs: Boolean(data.includePlayoffs ?? existing.includePlayoffs),
          singleDivision: nextSingleDivision,
          sportId: (data.sportId ?? existing.sportId ?? null) as string | null,
          referenceDate: (data.start ?? existing.start ?? null) as Date | null,
          organizationId: (data.organizationId ?? existing.organizationId ?? null) as string | null,
          divisionFieldMap: nextDivisionFieldMap,
          divisionDetails: incomingDivisionDetails,
          playoffDivisionDetails: incomingPlayoffDivisionDetails,
          defaultPrice: defaultDivisionPrice,
          defaultMaxParticipants: defaultDivisionMaxParticipants,
          defaultPlayoffTeamCount: defaultDivisionPlayoffTeamCount,
          defaultAllowPaymentPlans: defaultDivisionAllowPaymentPlans,
          defaultInstallmentCount: defaultDivisionInstallmentCount,
          defaultInstallmentDueDates: defaultDivisionInstallmentDueDates,
          defaultInstallmentDueRelativeDays: defaultDivisionInstallmentDueRelativeDays,
          defaultInstallmentAmounts: defaultDivisionInstallmentAmounts,
          eventType: nextEventTypeRaw,
        }, tx as any);
        void syncedDivisionIds;
      }

      const nextEventTypeForSchedule = (data.eventType ?? existing.eventType ?? updatedEvent.eventType) as string | null;
      let didRebuildSchedule = false;
      if (shouldSchedule && isSchedulableEventType(nextEventTypeForSchedule)) {
        await acquireEventLock(tx, eventId);
        const loaded = await loadEventWithRelations(eventId, tx);
        if (isSchedulableEventType(loaded.eventType)) {
          const scheduled = scheduleEvent({ event: loaded }, context);
          await persistScheduledRosterTeams({ eventId, scheduled: scheduled.event }, tx);
          await deleteMatchesByEvent(eventId, tx);
          await saveMatches(eventId, scheduled.matches, tx);
          await saveEventSchedule(scheduled.event, tx);
          didRebuildSchedule = true;
        }
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to update event');
      }
      return { event: fresh, didRebuildSchedule };
    });
    const { event: updated, didRebuildSchedule } = patchResult;
    if (didRebuildSchedule) {
      await refreshBroadcastPresentationForEvent({
        eventId,
        reason: 'SCHEDULE_CHANGE',
      }).catch((error) => {
        console.error('[broadcast-overlay] Presentation refresh failed after event reschedule', {
          eventId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }
    const [divisionKeys, playoffDivisionKeys] = await Promise.all([
      getVisibleDivisionKeysForEventResponse(eventId, updated),
      getDivisionKeysForEventKind(eventId, 'PLAYOFF'),
    ]);
    const [divisionFieldIds, divisionDetails, playoffDivisionDetails, participantIds] = await Promise.all([
      getDivisionFieldMapForEvent(eventId, divisionKeys),
      getDivisionDetailsForEvent(eventId, divisionKeys, updated.start, {
        price: updated.price,
        maxParticipants: updated.maxParticipants,
        playoffTeamCount: updated.playoffTeamCount,
        allowPaymentPlans: updated.allowPaymentPlans,
        installmentCount: updated.installmentCount,
        installmentDueDates: updated.installmentDueDates,
        installmentDueRelativeDays: (updated as any).installmentDueRelativeDays,
        installmentAmounts: updated.installmentAmounts,
      }),
      getDivisionDetailsForEvent(eventId, playoffDivisionKeys, updated.start, {
        price: updated.price,
        maxParticipants: updated.maxParticipants,
        playoffTeamCount: updated.playoffTeamCount,
        allowPaymentPlans: updated.allowPaymentPlans,
        installmentCount: updated.installmentCount,
        installmentDueDates: updated.installmentDueDates,
        installmentDueRelativeDays: (updated as any).installmentDueRelativeDays,
        installmentAmounts: updated.installmentAmounts,
      }),
      getEventParticipantIdsForEvent(eventId),
    ]);
    const officialResponse = await buildEventOfficialResponse(updated);
    return NextResponse.json(
      withLegacyEvent({
        ...updated,
        includePlayoffsOrPools: Boolean(updated.includePlayoffs),
        ...participantIds,
        ...officialResponse,
        divisionFieldIds,
        divisionDetails,
        playoffDivisionDetails,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (isPrismaSchemaContractError(error)) {
      return NextResponse.json(
        { error: error.message, code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH', field: error.field },
        { status: 503 },
      );
    }
    if (isRentalBookingReservationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EventContentFilterError) {
      return NextResponse.json(
        {
          error: error.message,
          matches: error.matches,
        },
        { status: 400 },
      );
    }
    if (isDivisionAssignmentValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid division team assignments';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isLeaguePlayoffTeamCountValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid playoff team count';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isTournamentPoolValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid tournament pool configuration';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('Update event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      fieldIds: true,
      timeSlotIds: true,
      state: true,
      leagueScoringConfigId: true,
      archivedAt: true,
      archivedByUserId: true,
      archiveReason: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await deleteOrArchiveEvent({
    client: prisma,
    event,
    actorUserId: session.userId,
    reason: 'delete_requested',
  });

  return NextResponse.json(toDeleteOrArchiveResponse(result), { status: 200 });
}
