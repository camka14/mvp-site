import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getSetScoreState } from '@/lib/matchSetScoring';
import { resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG, parseBroadcastOverlayConfig, parseMatchPresentationState } from './schemas';
import type {
  BroadcastOverlayActionType,
  BroadcastOverlayConfigV1,
  MatchPresentationStateV1,
  PresentationSet,
  PresentationTeam,
} from './types';

type BroadcastPrismaClient = any;

const BEACH_FALLBACK_SET_TARGETS = [21, 21, 15];
const SAFE_TEAM_COLORS = ['#15558D', '#C4512D'] as const;
const COMPLETE_SEGMENT_STATUSES = new Set(['COMPLETE', 'COMPLETED', 'FINAL', 'FINISHED']);
const LIVE_MATCH_STATUSES = new Set(['LIVE', 'IN_PROGRESS', 'STARTED', 'ACTIVE']);

const normalizeText = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
};

const nonNegativeInt = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
};

const positiveIntList = (value: unknown): number[] => (
  Array.isArray(value)
    ? value.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0)
    : []
);

const jsonRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const imagePreviewUrl = (fileId: string | null | undefined, size = 160): string | null => {
  const id = normalizeText(fileId);
  return id ? `/api/files/${encodeURIComponent(id)}/preview?w=${size}&h=${size}&fit=cover` : null;
};

const isSafeHexColor = (value: unknown): value is string => (
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
);

const contrastForeground = (hex: string): string => {
  const normalized = hex.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
  return luminance > 0.62 ? '#101820' : '#FFFFFF';
};

const configForOverlay = (overlay: { draftConfig: unknown; publishedConfig?: unknown | null }): BroadcastOverlayConfigV1 => {
  try {
    return parseBroadcastOverlayConfig(overlay.publishedConfig ?? overlay.draftConfig);
  } catch {
    return DEFAULT_BROADCAST_OVERLAY_CONFIG;
  }
};

const blankTeam = (label: string, color: string): PresentationTeam => ({
  id: '',
  displayName: label,
  shortName: label,
  abbreviation: label.slice(0, 3).toUpperCase(),
  playerNames: [],
  logoUrl: null,
  accentColor: color,
  foregroundColor: contrastForeground(color),
  seed: null,
});

export const createEmptyMatchPresentationState = (input: {
  eventId: string;
  eventName?: string | null;
  organizerName?: string | null;
  venue?: string | null;
  revision?: number;
  scoringMode?: 'AUTOMATIC' | 'MANUAL_OVERRIDE';
}): MatchPresentationStateV1 => ({
  version: 1,
  revision: input.revision ?? 0,
  status: 'NO_MATCH',
  event: {
    id: input.eventId,
    name: normalizeText(input.eventName, 'Untitled event'),
    logoUrl: null,
    organizerName: normalizeText(input.organizerName) || null,
    organizerLogoUrl: null,
    venue: normalizeText(input.venue) || null,
    court: null,
  },
  competition: {
    sport: 'Beach Volleyball',
    format: 'Best of 3 sets',
    roundLabel: null,
    bestOf: 3,
    setTargets: [...BEACH_FALLBACK_SET_TARGETS],
    winBy: 2,
  },
  teams: [blankTeam('Team 1', SAFE_TEAM_COLORS[0]), blankTeam('Team 2', SAFE_TEAM_COLORS[1])],
  score: {
    currentSet: 0,
    points: [0, 0],
    setsWon: [0, 0],
    sets: [],
    servingTeamId: null,
    timeoutsRemaining: {},
  },
  clock: {
    mode: 'STOPPED',
    startedAt: null,
    pausedAt: null,
    elapsedBeforePauseMs: 0,
  },
  presentation: {
    scoreboardVisible: true,
    activeStinger: null,
    replayState: 'UNAVAILABLE',
  },
  scoringMode: input.scoringMode ?? 'AUTOMATIC',
});

const resolveSetTargets = (match: any, event: any, sport: any): number[] => {
  const sources = [
    jsonRecord(match?.matchRulesSnapshot).setPointTargets,
    jsonRecord(event?.matchRulesOverride).setPointTargets,
    jsonRecord(sport?.matchRulesTemplate).setPointTargets,
    event?.pointsToVictory,
  ];
  for (const source of sources) {
    const targets = positiveIntList(source);
    if (targets.length) {
      return targets;
    }
  }
  return [...BEACH_FALLBACK_SET_TARGETS];
};

const matchStatus = (match: any): MatchPresentationStateV1['status'] => {
  const status = normalizeText(match?.status).toUpperCase();
  const resultStatus = normalizeText(match?.resultStatus).toUpperCase();
  if (['FINAL', 'COMPLETE', 'COMPLETED', 'FINISHED'].includes(status) || ['FINAL', 'COMPLETE'].includes(resultStatus)) {
    return 'FINAL';
  }
  if (LIVE_MATCH_STATUSES.has(status)) {
    return 'LIVE';
  }
  if (status || match?.start) {
    return 'SCHEDULED';
  }
  return 'UNKNOWN';
};

const isCompleteSegment = (segment: any, target: number, team1Id: string | null, team2Id: string | null): boolean => {
  if (segment?.winnerEventTeamId || COMPLETE_SEGMENT_STATUSES.has(normalizeText(segment?.status).toUpperCase())) {
    return true;
  }
  const scores = jsonRecord(segment?.scores);
  return getSetScoreState(scores[team1Id ?? ''], scores[team2Id ?? ''], target).isValidFinalScore;
};

const displayNameForUser = (user: any): string | null => {
  if (!user || isMinorAtUtcDate(user.dateOfBirth)) {
    return null;
  }
  const name = [normalizeText(user.firstName), normalizeText(user.lastName)].filter(Boolean).join(' ');
  return name || normalizeText(user.userName) || null;
};

const buildPresentationTeam = (input: {
  team: any | null;
  fallback: string;
  color: string;
  seed: number | null;
  config: BroadcastOverlayConfigV1;
  playerRows: any[];
}): PresentationTeam => {
  const teamId = normalizeText(input.team?.id);
  const override = teamId ? input.config.teamOverrides[teamId] : undefined;
  const baseName = normalizeText(input.team?.name, input.fallback);
  const displayName = normalizeText(override?.displayName, baseName);
  const shortName = normalizeText(override?.shortName, displayName);
  const abbreviation = normalizeText(override?.abbreviation, shortName.slice(0, 4).toUpperCase()).slice(0, 8);
  const accentColor = isSafeHexColor(override?.color) ? override.color : input.color;
  const playerIds = Array.isArray(input.team?.playerIds) ? input.team.playerIds : [];
  const playerNames = input.config.display.showPlayerNames
    ? playerIds
      .map((id: string) => input.playerRows.find((row) => row.id === id))
      .map(displayNameForUser)
      .filter((name: string | null): name is string => Boolean(name))
      .slice(0, 2)
    : [];
  return {
    id: teamId,
    displayName,
    shortName,
    abbreviation,
    playerNames,
    logoUrl: input.config.display.showTeamLogos ? imagePreviewUrl(input.team?.profileImageId) : null,
    accentColor,
    foregroundColor: contrastForeground(accentColor),
    seed: input.seed,
  };
};

const parseStoredState = (value: unknown, fallback: MatchPresentationStateV1): MatchPresentationStateV1 => {
  try {
    return parseMatchPresentationState(value);
  } catch {
    return fallback;
  }
};

export const buildMatchPresentationState = async (input: {
  overlay: { draftConfig: unknown; publishedConfig?: unknown | null };
  state: { revision: number; scoringMode: string; presentationState: unknown; activeMatchId?: string | null };
  eventId: string;
  matchId: string | null;
  client?: BroadcastPrismaClient;
}): Promise<MatchPresentationStateV1> => {
  const client = input.client ?? prisma;
  const event = await client.events.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      organizerName: true,
      imageId: true,
      organizationId: true,
      sportId: true,
      eventType: true,
      pointsToVictory: true,
      matchRulesOverride: true,
      archivedAt: true,
    },
  });
  if (!event || event.archivedAt) {
    throw new Error('Event not found');
  }

  const stateFallback = createEmptyMatchPresentationState({
    eventId: event.id,
    eventName: event.name,
    organizerName: event.organizerName,
    venue: event.location || event.address,
    revision: input.state.revision,
    scoringMode: input.state.scoringMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTOMATIC',
  });
  if (!input.matchId) {
    const previous = parseStoredState(input.state.presentationState, stateFallback);
    return {
      ...stateFallback,
      presentation: previous.presentation,
      scoringMode: stateFallback.scoringMode,
    };
  }

  const match = await client.matches.findFirst({
    where: { id: input.matchId, eventId: event.id },
  });
  if (!match) {
    throw new Error('Match not found for this event');
  }

  const [segments, teams, field, organization, sport, divisions] = await Promise.all([
    client.matchSegments.findMany({ where: { matchId: match.id }, orderBy: { sequence: 'asc' } }),
    client.teams.findMany({ where: { id: { in: [match.team1Id ?? '', match.team2Id ?? ''].filter(Boolean) } } }),
    match.fieldId ? client.fields.findUnique({ where: { id: match.fieldId }, select: { id: true, name: true, location: true } }) : null,
    event.organizationId
      ? client.organizations.findUnique({ where: { id: event.organizationId }, select: { id: true, name: true, logoId: true } })
      : null,
    event.sportId ? client.sports.findUnique({ where: { id: event.sportId }, select: { id: true, name: true, matchRulesTemplate: true } }) : null,
    client.divisions.findMany({
      where: { eventId: event.id },
      select: { id: true, key: true, name: true, kind: true, playoffPlacementDivisionIds: true },
    }),
  ]);
  const playerIds = Array.from(new Set(teams.flatMap((team: any) => Array.isArray(team.playerIds) ? team.playerIds : [])));
  const playerRows = playerIds.length
    ? await client.userData.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, firstName: true, lastName: true, userName: true, dateOfBirth: true },
    })
    : [];
  const config = configForOverlay(input.overlay);
  const team1 = teams.find((team: any) => team.id === match.team1Id) ?? null;
  const team2 = teams.find((team: any) => team.id === match.team2Id) ?? null;
  const team1Id = team1?.id ?? match.team1Id ?? null;
  const team2Id = team2?.id ?? match.team2Id ?? null;
  const setTargets = resolveSetTargets(match, event, sport);
  const presentationSets: PresentationSet[] = segments.map((segment: any, index: number) => {
    const target = setTargets[index] ?? setTargets[setTargets.length - 1] ?? 21;
    const scores = jsonRecord(segment.scores);
    return {
      sequence: segment.sequence,
      team1Points: nonNegativeInt(scores[team1Id ?? '']),
      team2Points: nonNegativeInt(scores[team2Id ?? '']),
      target,
      complete: isCompleteSegment(segment, target, team1Id, team2Id),
      winnerTeamId: normalizeText(segment.winnerEventTeamId) || null,
    };
  });
  const currentSetIndex = presentationSets.findIndex((set) => !set.complete);
  const currentSet = currentSetIndex >= 0 ? currentSetIndex + 1 : presentationSets.length;
  const currentScores = presentationSets[currentSetIndex >= 0 ? currentSetIndex : Math.max(0, presentationSets.length - 1)]
    ?? { team1Points: 0, team2Points: 0 };
  const setsWon: [number, number] = [
    presentationSets.filter((set) => set.winnerTeamId && set.winnerTeamId === team1Id).length,
    presentationSets.filter((set) => set.winnerTeamId && set.winnerTeamId === team2Id).length,
  ];
  const previous = parseStoredState(input.state.presentationState, stateFallback);
  const resolvedStatus = matchStatus(match);
  const startedAt = match.actualStart?.toISOString?.() ?? null;
  const endedAt = match.actualEnd?.toISOString?.() ?? null;
  const elapsedBeforePauseMs = startedAt && endedAt
    ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
    : 0;

  return {
    version: 1,
    revision: input.state.revision,
    status: resolvedStatus,
    event: {
      id: event.id,
      name: event.name,
      logoUrl: imagePreviewUrl(event.imageId, 240),
      organizerName: organization?.name ?? event.organizerName ?? null,
      organizerLogoUrl: imagePreviewUrl(organization?.logoId, 160),
      venue: event.location || event.address || null,
      court: field?.name ?? field?.location ?? null,
    },
    competition: {
      sport: sport?.name ?? 'Beach Volleyball',
      format: `Best of ${setTargets.length} sets`,
      roundLabel: resolveDivisionDisplayName({
        division: normalizeText(match.division) || null,
        divisionDetails: divisions,
        sportInput: sport?.name ?? 'Beach Volleyball',
      }),
      bestOf: setTargets.length,
      setTargets,
      winBy: 2,
    },
    teams: [
      buildPresentationTeam({
        team: team1,
        fallback: 'Team 1',
        color: SAFE_TEAM_COLORS[0],
        seed: match.team1Seed ?? null,
        config,
        playerRows,
      }),
      buildPresentationTeam({
        team: team2,
        fallback: 'Team 2',
        color: SAFE_TEAM_COLORS[1],
        seed: match.team2Seed ?? null,
        config,
        playerRows,
      }),
    ],
    score: {
      currentSet,
      points: [currentScores.team1Points, currentScores.team2Points],
      setsWon,
      sets: presentationSets,
      servingTeamId: previous.score.servingTeamId && [team1Id, team2Id].includes(previous.score.servingTeamId)
        ? previous.score.servingTeamId
        : null,
      timeoutsRemaining: previous.score.timeoutsRemaining,
    },
    clock: {
      mode: resolvedStatus === 'LIVE' && startedAt ? 'RUNNING' : resolvedStatus === 'FINAL' ? 'STOPPED' : 'STOPPED',
      startedAt,
      pausedAt: resolvedStatus === 'FINAL' ? endedAt : null,
      elapsedBeforePauseMs,
    },
    presentation: previous.presentation,
    scoringMode: input.state.scoringMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTOMATIC',
  };
};

const withoutRevision = (state: MatchPresentationStateV1): Record<string, unknown> => {
  const { revision: _revision, ...rest } = state;
  return rest;
};

const statesEqual = (left: MatchPresentationStateV1, right: MatchPresentationStateV1): boolean => (
  JSON.stringify(withoutRevision(left)) === JSON.stringify(withoutRevision(right))
);

const refreshActionType = (previous: MatchPresentationStateV1, next: MatchPresentationStateV1): BroadcastOverlayActionType => {
  if (previous.teams[0].id !== next.teams[0].id || previous.teams[1].id !== next.teams[1].id) {
    return 'MATCH_CHANGED';
  }
  if (previous.score.sets.filter((set) => set.complete).length !== next.score.sets.filter((set) => set.complete).length) {
    return 'SET_COMPLETED';
  }
  if (previous.score.points[0] !== next.score.points[0] || previous.score.points[1] !== next.score.points[1]) {
    return 'POINT_AWARDED';
  }
  return 'SNAPSHOT_REFRESH';
};

const refreshPayload = (previous: MatchPresentationStateV1, next: MatchPresentationStateV1) => ({
  beforePoints: previous.score.points,
  afterPoints: next.score.points,
  beforeSetsWon: previous.score.setsWon,
  afterSetsWon: next.score.setsWon,
});

const isMissingActiveMatchError = (error: unknown): boolean => (
  error instanceof Error && error.message === 'Match not found for this event'
);

/**
 * Called only after a committed official match or schedule mutation. It
 * reloads the narrow projection rather than serializing an internal mutation
 * payload, preventing raw roster and audit data from entering the program
 * stream.
 */
export const refreshBroadcastPresentationForEvent = async (input: {
  eventId: string;
  changedMatchIds?: string[];
  reason: 'OFFICIAL_MATCH_CHANGE' | 'SCHEDULE_CHANGE' | 'MATCH_DELETE';
}): Promise<void> => {
  const states = await prisma.broadcastOverlayStates.findMany({ where: { eventId: input.eventId } });
  if (!states.length) return;
  const overlays = await prisma.broadcastOverlays.findMany({
    where: { id: { in: states.map((state) => state.overlayId) }, archivedAt: null },
  });
  const overlaysById = new Map(overlays.map((overlay) => [overlay.id, overlay]));
  const changedIds = new Set(input.changedMatchIds ?? []);
  const messages: Array<{ overlayId: string; revision: number; state: MatchPresentationStateV1; event: BroadcastOverlayActionType }> = [];

  for (const stateRow of states) {
    const overlay = overlaysById.get(stateRow.overlayId);
    if (!overlay) continue;
    if (changedIds.size && stateRow.activeMatchId && !changedIds.has(stateRow.activeMatchId)) continue;

    const existing = parseStoredState(
      stateRow.presentationState,
      createEmptyMatchPresentationState({ eventId: input.eventId, revision: stateRow.revision }),
    );
    let nextActiveMatchId = stateRow.activeMatchId;
    let automatic: MatchPresentationStateV1;
    try {
      automatic = await buildMatchPresentationState({
        overlay,
        state: stateRow,
        eventId: input.eventId,
        matchId: stateRow.activeMatchId,
      });
    } catch (error) {
      // Schedule rebuilds and match deletes can remove the match currently on
      // air. Clear the active selection only after the mutation commits, then
      // publish a safe no-match state rather than leaving a stale scorebug.
      if (!stateRow.activeMatchId
        || !isMissingActiveMatchError(error)
        || !['MATCH_DELETE', 'SCHEDULE_CHANGE'].includes(input.reason)) {
        throw error;
      }
      nextActiveMatchId = null;
      automatic = await buildMatchPresentationState({
        overlay,
        state: stateRow,
        eventId: input.eventId,
        matchId: null,
      });
      automatic = {
        ...automatic,
        presentation: {
          ...automatic.presentation,
          scoreboardVisible: false,
          activeStinger: null,
        },
      };
    }
    const manual = stateRow.scoringMode === 'MANUAL_OVERRIDE';
    const activeMatchWasRemoved = Boolean(stateRow.activeMatchId && !nextActiveMatchId);
    const automaticChanged = !statesEqual(
      parseStoredState(stateRow.automaticShadowState, existing),
      automatic,
    );
    const effectiveChanged = (!manual || activeMatchWasRemoved) && !statesEqual(existing, automatic);
    if (!automaticChanged && !effectiveChanged) continue;

    const nextRevision = stateRow.revision + 1;
    automatic = { ...automatic, revision: nextRevision };
    const effective = manual && !activeMatchWasRemoved
      ? { ...existing, revision: nextRevision, scoringMode: 'MANUAL_OVERRIDE' as const }
      : { ...automatic, scoringMode: manual ? 'MANUAL_OVERRIDE' as const : 'AUTOMATIC' as const };
    const actionType = refreshActionType(existing, automatic);
    const committed = await prisma.$transaction(async (tx) => {
      // A producer command may arrive while an official mutation is being
      // projected. Never overwrite that newer revision with this stale read;
      // the next committed match mutation will refresh again from source.
      const updated = await tx.broadcastOverlayStates.updateMany({
        where: { id: stateRow.id, revision: stateRow.revision },
        data: {
          activeMatchId: nextActiveMatchId,
          revision: nextRevision,
          automaticShadowState: automatic as any,
          presentationState: effective as any,
          updatedByUserId: null,
        },
      });
      if (updated.count !== 1) {
        return false;
      }
      await tx.broadcastOverlayActions.create({
        data: {
          id: randomUUID(),
          overlayId: overlay.id,
          organizationId: overlay.organizationId,
          eventId: overlay.eventId,
          matchId: stateRow.activeMatchId,
          actorKind: 'SYSTEM',
          actionType,
          baseRevision: stateRow.revision,
          presentationRevision: nextRevision,
          requestId: `refresh:${input.reason}:${stateRow.id}:${nextRevision}`,
          payload: refreshPayload(existing, automatic),
        },
      });
      return true;
    });
    if (!committed) continue;
    messages.push({ overlayId: overlay.id, revision: nextRevision, state: effective, event: actionType });
  }

  if (messages.length) {
    const { publishBroadcastOverlayState } = await import('@/server/realtime/broadcastOverlayRealtime');
    messages.forEach((message) => {
      publishBroadcastOverlayState({
        overlayId: message.overlayId,
        state: message.state,
        event: { type: message.event, animate: message.event !== 'SNAPSHOT_REFRESH' },
      });
    });
  }
};
