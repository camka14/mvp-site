type DivisionDefaultsTarget = {
    price: number;
    maxParticipants: number;
    playoffTeamCount?: number;
    poolCount?: number;
    poolTeamCount?: number;
};

type ApplyEventDivisionDefaultsParams<T extends DivisionDefaultsTarget> = {
    details: T[];
    defaultPrice: number;
    defaultMaxParticipants: number;
    includePlayoffs: boolean;
    defaultPlayoffTeamCount?: number;
    includeTournamentPoolPlay?: boolean;
    defaultPoolCount?: number | null;
};

type ApplyEventDivisionDefaultsResult<T extends DivisionDefaultsTarget> = {
    details: T[];
    changed: boolean;
};

const normalizePrice = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, value);
};

const normalizeCapacity = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 2;
    }
    return Math.max(2, Math.trunc(value));
};

const normalizePoolCount = (value: number | null | undefined): number | undefined => {
    if (!Number.isFinite(Number(value))) {
        return undefined;
    }
    return Math.max(1, Math.trunc(Number(value)));
};

const derivePoolTeamCount = (maxTeams: number, poolCount: number | undefined): number | undefined => {
    if (!poolCount || maxTeams % poolCount !== 0) {
        return undefined;
    }
    return maxTeams / poolCount;
};

export const applyEventDefaultsToDivisionDetails = <T extends DivisionDefaultsTarget>(
    params: ApplyEventDivisionDefaultsParams<T>,
): ApplyEventDivisionDefaultsResult<T> => {
    const normalizedPrice = normalizePrice(params.defaultPrice);
    const normalizedMaxParticipants = normalizeCapacity(params.defaultMaxParticipants);
    const shouldUpdatePlayoff = params.includePlayoffs || Boolean(params.includeTournamentPoolPlay);
    const normalizedPlayoffTeamCount = shouldUpdatePlayoff
        ? normalizeCapacity(
            Number.isFinite(params.defaultPlayoffTeamCount)
                ? (params.defaultPlayoffTeamCount as number)
                : normalizedMaxParticipants,
        )
        : undefined;
    const shouldUpdatePool = Boolean(params.includeTournamentPoolPlay);
    const normalizedPoolCount = shouldUpdatePool
        ? normalizePoolCount(params.defaultPoolCount)
        : undefined;
    const normalizedPoolTeamCount = shouldUpdatePool
        ? derivePoolTeamCount(normalizedMaxParticipants, normalizedPoolCount)
        : undefined;

    let changed = false;
    const nextDetails = params.details.map((detail) => {
        const nextPrice = normalizedPrice;
        const nextMaxParticipants = normalizedMaxParticipants;
        const nextPlayoffTeamCount = shouldUpdatePlayoff
            ? normalizedPlayoffTeamCount
            : detail.playoffTeamCount;
        const nextPoolCount = shouldUpdatePool
            ? normalizedPoolCount
            : detail.poolCount;
        const nextPoolTeamCount = shouldUpdatePool
            ? normalizedPoolTeamCount
            : detail.poolTeamCount;
        const detailChanged = detail.price !== nextPrice
            || detail.maxParticipants !== nextMaxParticipants
            || (shouldUpdatePlayoff && detail.playoffTeamCount !== nextPlayoffTeamCount)
            || (shouldUpdatePool && detail.poolCount !== nextPoolCount)
            || (shouldUpdatePool && detail.poolTeamCount !== nextPoolTeamCount);
        if (!detailChanged) {
            return detail;
        }
        changed = true;
        return {
            ...detail,
            price: nextPrice,
            maxParticipants: nextMaxParticipants,
            playoffTeamCount: nextPlayoffTeamCount,
            poolCount: nextPoolCount,
            poolTeamCount: nextPoolTeamCount,
        };
    });

    return {
        details: nextDetails,
        changed,
    };
};
