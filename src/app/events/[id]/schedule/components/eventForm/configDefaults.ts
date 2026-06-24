import type { Event, LeagueConfig, Sport, TournamentConfig } from '@/types';

import type { DivisionDetailForm } from './divisionForm';

// Converts mixed input values into numbers while respecting optional fallbacks for blank fields.
export const normalizeNumber = (value: unknown, fallback?: number): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

export const derivePoolTeamCount = (
    maxTeams: unknown,
    poolCount: unknown,
): number | undefined => {
    const normalizedMaxTeams = Number.isFinite(Number(maxTeams))
        ? Math.max(2, Math.trunc(Number(maxTeams)))
        : null;
    const normalizedPoolCount = Number.isFinite(Number(poolCount))
        ? Math.max(1, Math.trunc(Number(poolCount)))
        : null;
    if (!normalizedMaxTeams || !normalizedPoolCount || normalizedMaxTeams % normalizedPoolCount !== 0) {
        return undefined;
    }
    return normalizedMaxTeams / normalizedPoolCount;
};

export const normalizeLeagueConfigForSetMode = (
    source: Partial<LeagueConfig> | undefined,
    usesSets: boolean,
): LeagueConfig => {
    const sourceRecord = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    const hasValue = (key: keyof LeagueConfig): boolean => Object.prototype.hasOwnProperty.call(sourceRecord, key);
    const normalizeOptionalDuration = (value: unknown, fallback: number | undefined): number | undefined => {
        if (value === null || value === undefined || value === '') {
            return fallback;
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }
        return Math.max(0, Math.trunc(parsed));
    };
    const normalizedMatchDuration = normalizeOptionalDuration(
        source?.matchDurationMinutes,
        hasValue('matchDurationMinutes') ? undefined : 60,
    );
    const normalizedRestTime = Number.isFinite(Number(source?.restTimeMinutes))
        ? Math.max(0, Math.trunc(Number(source?.restTimeMinutes)))
        : 0;
    const normalizedGamesPerOpponent = Number.isFinite(Number(source?.gamesPerOpponent))
        ? Math.max(1, Math.trunc(Number(source?.gamesPerOpponent)))
        : 1;
    const normalizedIncludePlayoffs = Boolean(source?.includePlayoffs);
    const normalizedPlayoffTeamCount = Number.isFinite(Number(source?.playoffTeamCount))
        ? Math.max(2, Math.trunc(Number(source?.playoffTeamCount)))
        : undefined;

    if (usesSets) {
        const allowedSetCounts = [1, 3, 5];
        const normalizedSetsPerMatch = Number.isFinite(Number(source?.setsPerMatch))
            && allowedSetCounts.includes(Math.trunc(Number(source?.setsPerMatch)))
            ? Math.trunc(Number(source?.setsPerMatch))
            : 1;
        const normalizedSetDuration = normalizeOptionalDuration(
            source?.setDurationMinutes,
            hasValue('setDurationMinutes') ? undefined : 20,
        );
        const normalizedPoints = Array.isArray(source?.pointsToVictory)
            ? source.pointsToVictory
                .slice(0, normalizedSetsPerMatch)
                .map((value) => {
                    const parsed = Number(value);
                    return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 21;
                })
            : [];
        while (normalizedPoints.length < normalizedSetsPerMatch) {
            normalizedPoints.push(21);
        }
        return {
            gamesPerOpponent: normalizedGamesPerOpponent,
            includePlayoffs: normalizedIncludePlayoffs,
            playoffTeamCount: normalizedPlayoffTeamCount,
            usesSets: true,
            matchDurationMinutes: normalizedMatchDuration,
            restTimeMinutes: normalizedRestTime,
            setDurationMinutes: normalizedSetDuration,
            setsPerMatch: normalizedSetsPerMatch,
            pointsToVictory: normalizedPoints,
        };
    }

    return {
        gamesPerOpponent: normalizedGamesPerOpponent,
        includePlayoffs: normalizedIncludePlayoffs,
        playoffTeamCount: normalizedPlayoffTeamCount,
        usesSets: false,
        matchDurationMinutes: normalizedMatchDuration,
        restTimeMinutes: normalizedRestTime,
        setDurationMinutes: undefined,
        setsPerMatch: undefined,
        pointsToVictory: undefined,
    };
};

export const buildDivisionLeagueConfig = (
    detail: Partial<DivisionDetailForm> | undefined,
    fallback: LeagueConfig,
    usesSets: boolean,
): LeagueConfig => {
    const hasDetailValue = (key: keyof DivisionDetailForm): boolean => Boolean(
        detail && Object.prototype.hasOwnProperty.call(detail, key),
    );
    return normalizeLeagueConfigForSetMode({
        ...fallback,
        gamesPerOpponent: detail?.gamesPerOpponent ?? fallback.gamesPerOpponent,
        includePlayoffs: fallback.includePlayoffs,
        playoffTeamCount: fallback.playoffTeamCount,
        usesSets: detail?.usesSets ?? fallback.usesSets,
        matchDurationMinutes: hasDetailValue('matchDurationMinutes')
            ? detail?.matchDurationMinutes
            : fallback.matchDurationMinutes,
        restTimeMinutes: detail?.restTimeMinutes ?? fallback.restTimeMinutes,
        setDurationMinutes: hasDetailValue('setDurationMinutes')
            ? detail?.setDurationMinutes
            : fallback.setDurationMinutes,
        setsPerMatch: detail?.setsPerMatch ?? fallback.setsPerMatch,
        pointsToVictory: Array.isArray(detail?.pointsToVictory) && detail.pointsToVictory.length
            ? detail.pointsToVictory
            : fallback.pointsToVictory,
    }, usesSets);
};

export const leagueConfigToDivisionFields = (config: LeagueConfig): Pick<
    DivisionDetailForm,
    'gamesPerOpponent'
    | 'restTimeMinutes'
    | 'usesSets'
    | 'matchDurationMinutes'
    | 'setDurationMinutes'
    | 'setsPerMatch'
    | 'pointsToVictory'
> => ({
    gamesPerOpponent: config.gamesPerOpponent,
    restTimeMinutes: config.restTimeMinutes,
    usesSets: config.usesSets,
    matchDurationMinutes: config.matchDurationMinutes,
    setDurationMinutes: config.setDurationMinutes,
    setsPerMatch: config.setsPerMatch,
    pointsToVictory: Array.isArray(config.pointsToVictory) ? [...config.pointsToVictory] : undefined,
});

export const buildTournamentConfig = (source?: Partial<TournamentConfig>): TournamentConfig => {
    const normalizePoints = (points: number[] | undefined, len: number): number[] => {
        const next = Array.isArray(points) ? points.slice(0, len) : [];
        while (next.length < len) next.push(21);
        return next;
    };
    const normalizePositiveCount = (value: unknown): number => {
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : 1;
    };
    const normalizeOptionalDuration = (value: unknown): number | undefined => {
        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
            return undefined;
        }
        return Math.max(0, Math.trunc(parsed));
    };

    const doubleElimination = Boolean(source?.doubleElimination);
    const winnerSetCount = normalizePositiveCount(source?.winnerSetCount);
    const loserSetCount = normalizePositiveCount(source?.loserSetCount);

    return {
        doubleElimination,
        winnerSetCount,
        loserSetCount,
        winnerBracketPointsToVictory: normalizePoints(source?.winnerBracketPointsToVictory, winnerSetCount),
        loserBracketPointsToVictory: normalizePoints(
            source?.loserBracketPointsToVictory,
            doubleElimination ? loserSetCount : 1,
        ),
        prize: source?.prize ?? '',
        fieldCount: source?.fieldCount ?? 1,
        restTimeMinutes: source?.restTimeMinutes ?? 0,
        usesSets: Boolean(source?.usesSets),
        matchDurationMinutes: normalizeOptionalDuration(source?.matchDurationMinutes),
        setDurationMinutes: normalizeOptionalDuration(source?.setDurationMinutes),
    };
};

export const normalizeTournamentConfigForSetMode = (
    source: Partial<TournamentConfig> | undefined,
    usesSets: boolean,
): TournamentConfig => {
    const normalized = buildTournamentConfig(source);
    if (usesSets) {
        return {
            ...normalized,
            usesSets: true,
            matchDurationMinutes: normalizeNumber(normalized.matchDurationMinutes),
            setDurationMinutes: normalizeNumber(normalized.setDurationMinutes),
        };
    }

    const winnerTarget = Number.isFinite(Number(normalized.winnerBracketPointsToVictory?.[0]))
        ? Math.max(1, Math.trunc(Number(normalized.winnerBracketPointsToVictory?.[0])))
        : 21;
    const loserTarget = Number.isFinite(Number(normalized.loserBracketPointsToVictory?.[0]))
        ? Math.max(1, Math.trunc(Number(normalized.loserBracketPointsToVictory?.[0])))
        : 21;

    return {
        ...normalized,
        usesSets: false,
        matchDurationMinutes: normalizeNumber(normalized.matchDurationMinutes),
        setDurationMinutes: undefined,
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [winnerTarget],
        loserBracketPointsToVictory: [loserTarget],
    };
};

const TOURNAMENT_CONFIG_KEYS: (keyof TournamentConfig)[] = [
    'doubleElimination',
    'winnerSetCount',
    'loserSetCount',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'prize',
    'fieldCount',
    'restTimeMinutes',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
];

export const extractTournamentConfigFromEvent = (event?: Partial<Event> | null): TournamentConfig | null => {
    if (!event) {
        return null;
    }

    const legacyPlayoff = (event as { playoffConfig?: Partial<TournamentConfig> | null }).playoffConfig;
    if (legacyPlayoff) {
        return buildTournamentConfig(legacyPlayoff ?? undefined);
    }

    const partial: Partial<TournamentConfig> = {};
    let hasDefinedValue = false;
    for (const key of TOURNAMENT_CONFIG_KEYS) {
        const candidate = (event as Record<string, unknown>)[key as string];
        if (candidate !== undefined && candidate !== null) {
            hasDefinedValue = true;
            (partial as Record<string, unknown>)[key as string] = candidate;
        }
    }

    if (!hasDefinedValue) {
        return null;
    }

    return buildTournamentConfig(partial);
};

type DefaultLeagueConfigBase = {
    eventType: Event['eventType'];
    sportConfig?: Sport | null;
    sportId?: string | null;
};

type BuildDefaultLeagueDataOptions = {
    base: DefaultLeagueConfigBase;
    activeEditingEvent?: Event | null;
    defaultDivisionDetails: DivisionDetailForm[];
    sportsById: Map<string, Sport>;
};

export const buildDefaultLeagueData = ({
    base,
    activeEditingEvent,
    defaultDivisionDetails,
    sportsById,
}: BuildDefaultLeagueDataOptions): LeagueConfig => {
    const selectedSport = base.sportConfig
        ?? (base.sportId ? sportsById.get(base.sportId) : null);
    const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
    if (
        activeEditingEvent
        && (activeEditingEvent.eventType === 'LEAGUE' || activeEditingEvent.eventType === 'TOURNAMENT')
    ) {
        const divisionLeagueDetail = activeEditingEvent.eventType === 'LEAGUE' && Array.isArray(defaultDivisionDetails)
            ? defaultDivisionDetails.find((detail) => typeof detail?.gamesPerOpponent === 'number')
            : undefined;
        const eventLeagueFallback = normalizeLeagueConfigForSetMode({
            ...(activeEditingEvent.leagueConfig || activeEditingEvent),
            gamesPerOpponent: activeEditingEvent.leagueConfig?.gamesPerOpponent ?? activeEditingEvent.gamesPerOpponent ?? 1,
            includePlayoffs: Boolean(
                (activeEditingEvent as { includePlayoffsOrPools?: unknown })?.includePlayoffsOrPools
                ?? activeEditingEvent.leagueConfig?.includePlayoffs
                ?? activeEditingEvent.includePlayoffs,
            ),
            playoffTeamCount: activeEditingEvent.leagueConfig?.playoffTeamCount ?? activeEditingEvent.playoffTeamCount,
        }, requiresSets);
        const source = divisionLeagueDetail
            ? buildDivisionLeagueConfig(divisionLeagueDetail, eventLeagueFallback, requiresSets)
            : eventLeagueFallback;
        return normalizeLeagueConfigForSetMode({
            ...source,
            gamesPerOpponent: source?.gamesPerOpponent ?? 1,
            includePlayoffs: Boolean(
                (source as { includePlayoffsOrPools?: unknown })?.includePlayoffsOrPools
                ?? source?.includePlayoffs
                ?? (activeEditingEvent as { includePlayoffsOrPools?: unknown })?.includePlayoffsOrPools
                ?? activeEditingEvent.includePlayoffs,
            ),
            playoffTeamCount: source?.playoffTeamCount ?? activeEditingEvent.playoffTeamCount,
        }, requiresSets);
    }
    return normalizeLeagueConfigForSetMode({
        gamesPerOpponent: 1,
        includePlayoffs: false,
        playoffTeamCount: undefined,
        usesSets: false,
        matchDurationMinutes: 60,
        restTimeMinutes: 0,
        setDurationMinutes: undefined,
        setsPerMatch: undefined,
        pointsToVictory: undefined,
    }, requiresSets);
};

export const buildDefaultTournamentData = (activeEditingEvent?: Event | null): TournamentConfig => {
    if (activeEditingEvent && activeEditingEvent.eventType === 'TOURNAMENT') {
        return buildTournamentConfig({
            doubleElimination: activeEditingEvent.doubleElimination,
            winnerSetCount: activeEditingEvent.winnerSetCount,
            loserSetCount: activeEditingEvent.loserSetCount,
            winnerBracketPointsToVictory: activeEditingEvent.winnerBracketPointsToVictory,
            loserBracketPointsToVictory: activeEditingEvent.loserBracketPointsToVictory,
            prize: activeEditingEvent.prize,
            fieldCount: activeEditingEvent.fieldCount ?? activeEditingEvent.fields?.length ?? 1,
            restTimeMinutes: normalizeNumber(activeEditingEvent.restTimeMinutes, 0) ?? 0,
            usesSets: activeEditingEvent.usesSets,
            matchDurationMinutes: normalizeNumber(activeEditingEvent.matchDurationMinutes),
            setDurationMinutes: normalizeNumber(activeEditingEvent.setDurationMinutes),
        });
    }
    return buildTournamentConfig();
};

export const buildDefaultPlayoffData = (activeEditingEvent?: Event | null): TournamentConfig => {
    if (activeEditingEvent?.includePlayoffs) {
        const extractedPlayoff = extractTournamentConfigFromEvent(activeEditingEvent);
        if (extractedPlayoff) {
            return extractedPlayoff;
        }
    }
    return buildTournamentConfig();
};
