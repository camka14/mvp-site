type DivisionDefaultsTarget = {
    price: number;
    maxParticipants: number;
    playoffTeamCount?: number;
};

type ApplyEventDivisionDefaultsParams<T extends DivisionDefaultsTarget> = {
    details: T[];
    defaultPrice: number;
    defaultMaxParticipants: number;
    includePlayoffs: boolean;
    defaultPlayoffTeamCount?: number;
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

export const applyEventDefaultsToDivisionDetails = <T extends DivisionDefaultsTarget>(
    params: ApplyEventDivisionDefaultsParams<T>,
): ApplyEventDivisionDefaultsResult<T> => {
    const normalizedPrice = normalizePrice(params.defaultPrice);
    const normalizedMaxParticipants = normalizeCapacity(params.defaultMaxParticipants);
    const normalizedPlayoffTeamCount = params.includePlayoffs
        ? normalizeCapacity(
            Number.isFinite(params.defaultPlayoffTeamCount)
                ? (params.defaultPlayoffTeamCount as number)
                : normalizedMaxParticipants,
        )
        : undefined;

    let changed = false;
    const nextDetails = params.details.map((detail) => {
        const nextPrice = normalizedPrice;
        const nextMaxParticipants = normalizedMaxParticipants;
        const shouldUpdatePlayoff = params.includePlayoffs;
        const nextPlayoffTeamCount = shouldUpdatePlayoff
            ? normalizedPlayoffTeamCount
            : detail.playoffTeamCount;
        const detailChanged = detail.price !== nextPrice
            || detail.maxParticipants !== nextMaxParticipants
            || (shouldUpdatePlayoff && detail.playoffTeamCount !== nextPlayoffTeamCount);
        if (!detailChanged) {
            return detail;
        }
        changed = true;
        return {
            ...detail,
            price: nextPrice,
            maxParticipants: nextMaxParticipants,
            playoffTeamCount: nextPlayoffTeamCount,
        };
    });

    return {
        details: nextDetails,
        changed,
    };
};
