import type { Event } from '@/types';
import { formatPrice } from '@/types';
import { calculateAgeOnDate, isAgeWithinRange } from '@/lib/age';
import type { FamilyChild } from '@/lib/familyService';
import {
    buildDivisionToken,
    cleanDivisionDisplayName,
    deriveDivisionTypeDisplayName,
    evaluateDivisionAgeEligibility,
    extractDivisionTokenFromId,
    inferDivisionDetails,
    normalizeDivisionGender,
    normalizeDivisionRatingType,
    parseDivisionToken,
} from '@/lib/divisionTypes';
import { parseDateValue } from './dateValues';

export type EventDivisionOption = {
    id: string;
    key: string;
    name: string;
    divisionTypeId: string;
    divisionTypeName: string;
    divisionTypeKey: string;
    ratingType: 'AGE' | 'SKILL';
    gender: 'M' | 'F' | 'C';
    priceCents?: number;
    maxParticipants?: number;
    playoffTeamCount?: number;
    allowPaymentPlans?: boolean;
    installmentCount?: number;
    installmentDueDates?: string[];
    installmentDueRelativeDays?: number[];
    installmentAmounts?: number[];
    sportId?: string;
    ageCutoffDate?: string;
    ageCutoffLabel?: string;
    ageCutoffSource?: string;
};

type EventDivisionDetail = NonNullable<Event['divisionDetails']>[number];

export const normalizeDivisionKey = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
};

export const getDivisionIdFromEventEntry = (entry: unknown): string | null => {
    if (typeof entry === 'string') {
        return normalizeDivisionKey(entry);
    }
    if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        return normalizeDivisionKey(row.id)
            ?? normalizeDivisionKey(row.$id)
            ?? normalizeDivisionKey(row.key)
            ?? normalizeDivisionKey(row.name);
    }
    return null;
};

export const getNormalizedDivisionAliases = (value: unknown): string[] => {
    const normalized = normalizeDivisionKey(value);
    if (!normalized) {
        return [];
    }
    const aliases = new Set([normalized]);
    const token = extractDivisionTokenFromId(normalized);
    if (token) {
        aliases.add(token);
    }
    return Array.from(aliases);
};

const getDivisionDetailAliases = (detail: Pick<EventDivisionDetail, 'id' | 'key'>): string[] => {
    const aliases = new Set<string>();
    getNormalizedDivisionAliases(detail.id).forEach((alias) => aliases.add(alias));
    getNormalizedDivisionAliases(detail.key).forEach((alias) => aliases.add(alias));
    return Array.from(aliases);
};

const isPlayoffDivisionDetail = (detail: Pick<EventDivisionDetail, 'kind'> | null | undefined): boolean => (
    normalizeDivisionKey(detail?.kind) === 'playoff'
);

const stripTournamentPoolSuffix = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const stripped = value.trim().replace(/[\s_-]+pool[\s_-]*[a-z0-9]+$/i, '').trim();
    return stripped.length > 0 ? stripped : null;
};

const inferTournamentBracketIdFromPoolId = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
        return null;
    }
    const stripped = trimmed.replace(/[\s_-]+pool[\s_-]*[a-z0-9]+$/i, '').trim();
    return stripped.length > 0 && stripped !== trimmed ? stripped : null;
};

const getFirstTournamentPoolPlacementId = (
    detail: Pick<EventDivisionDetail, 'playoffPlacementDivisionIds'>,
): string | null => {
    if (!Array.isArray(detail.playoffPlacementDivisionIds)) {
        return null;
    }
    return detail.playoffPlacementDivisionIds
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .find((entry) => entry.length > 0) ?? null;
};

const getTournamentPoolBracketId = (detail: EventDivisionDetail): string | null => (
    getFirstTournamentPoolPlacementId(detail)
    ?? inferTournamentBracketIdFromPoolId(detail.id)
    ?? inferTournamentBracketIdFromPoolId(detail.key)
);

const hasTournamentPoolPlayRegistration = (event: Event, detailRows: EventDivisionDetail[]): boolean => {
    const eventType = typeof event.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
    const includePools = typeof event.includePlayoffsOrPools === 'boolean'
        ? event.includePlayoffsOrPools
        : event.includePlayoffs === true;
    if (eventType !== 'TOURNAMENT' || !includePools) {
        return false;
    }
    return detailRows.some((detail) => !isPlayoffDivisionDetail(detail) && Boolean(getTournamentPoolBracketId(detail)))
        || (Array.isArray(event.divisions) && event.divisions.some((entry) => {
            const divisionId = getDivisionIdFromEventEntry(entry);
            return Boolean(inferTournamentBracketIdFromPoolId(divisionId));
        }));
};

const dedupeDivisionDetails = (rows: EventDivisionDetail[]): EventDivisionDetail[] => {
    const seen = new Set<string>();
    const deduped: EventDivisionDetail[] = [];
    rows.forEach((row) => {
        const aliases = getDivisionDetailAliases(row);
        const identity = aliases[0] ?? normalizeDivisionKey(row.name);
        if (!identity || seen.has(identity)) {
            return;
        }
        aliases.forEach((alias) => seen.add(alias));
        deduped.push(row);
    });
    return deduped;
};

const buildTournamentBracketRegistrationRows = (
    event: Event,
    detailRows: EventDivisionDetail[],
    playoffRows: EventDivisionDetail[],
): EventDivisionDetail[] => {
    const explicitBracketRows = dedupeDivisionDetails([
        ...playoffRows,
        ...detailRows.filter(isPlayoffDivisionDetail),
    ]);
    if (explicitBracketRows.length > 0) {
        return explicitBracketRows;
    }

    const detailsByAlias = new Map<string, EventDivisionDetail>();
    detailRows.forEach((detail) => {
        getDivisionDetailAliases(detail).forEach((alias) => detailsByAlias.set(alias, detail));
    });

    const poolRows = new Map<string, EventDivisionDetail>();
    detailRows
        .filter((detail) => !isPlayoffDivisionDetail(detail) && Boolean(getTournamentPoolBracketId(detail)))
        .forEach((detail) => {
            const id = normalizeDivisionKey(detail.id) ?? normalizeDivisionKey(detail.key);
            if (id) {
                poolRows.set(id, detail);
            }
        });

    if (Array.isArray(event.divisions)) {
        event.divisions.forEach((entry) => {
            const divisionId = getDivisionIdFromEventEntry(entry);
            if (!divisionId || poolRows.has(divisionId)) {
                return;
            }
            const bracketId = inferTournamentBracketIdFromPoolId(divisionId);
            if (!bracketId) {
                return;
            }
            const detail = detailsByAlias.get(divisionId) ?? {
                id: divisionId,
                key: divisionId,
                name: stripTournamentPoolSuffix(divisionId) ?? divisionId,
                playoffPlacementDivisionIds: [bracketId],
            };
            poolRows.set(divisionId, detail);
        });
    }

    const bracketRows = new Map<string, EventDivisionDetail>();
    poolRows.forEach((pool) => {
        const bracketId = getTournamentPoolBracketId(pool);
        const normalizedBracketId = normalizeDivisionKey(bracketId);
        if (!bracketId || !normalizedBracketId || bracketRows.has(normalizedBracketId)) {
            return;
        }
        const existingBracketDetail = getNormalizedDivisionAliases(bracketId)
            .map((alias) => detailsByAlias.get(alias))
            .find((detail): detail is EventDivisionDetail => Boolean(detail));
        const bracketKey = stripTournamentPoolSuffix(pool.key)
            ?? extractDivisionTokenFromId(bracketId)
            ?? bracketId;
        const bracketName = stripTournamentPoolSuffix(pool.name)
            ?? stripTournamentPoolSuffix(pool.key)
            ?? stripTournamentPoolSuffix(pool.id)
            ?? bracketId;
        const sourceDetail = existingBracketDetail ?? pool;
        bracketRows.set(normalizedBracketId, {
            ...sourceDetail,
            id: bracketId,
            key: existingBracketDetail?.key ?? bracketKey,
            kind: 'PLAYOFF',
            name: existingBracketDetail?.name ?? bracketName,
            playoffPlacementDivisionIds: [],
        });
    });

    return Array.from(bracketRows.values());
};

export const normalizePriceCents = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.round(parsed));
};

export const normalizeInstallmentAmountsCents = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => normalizePriceCents(entry))
        .filter((entry) => entry >= 0);
};

export const normalizeInstallmentDueDateValues = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => parseDateValue(typeof entry === 'string' ? entry : String(entry ?? '')))
        .filter((entry): entry is Date => Boolean(entry))
        .map((entry) => entry.toISOString());
};

export const normalizeInstallmentDueRelativeDayValues = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.trunc(entry));
};

export const formatInstallmentDueDateLabel = (value: string): string => {
    const parsed = parseDateValue(value);
    if (!parsed) {
        return 'TBD';
    }
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatPaymentPlanPreviewPrice = (amountCents: number): string => `${formatPrice(amountCents)} + fees`;

export const formatInstallmentRelativeDueDayLabel = (offsetDays: number): string => {
    if (!Number.isFinite(offsetDays) || offsetDays === 0) {
        return 'Session day';
    }
    const absDays = Math.abs(Math.trunc(offsetDays));
    const unit = absDays === 1 ? 'day' : 'days';
    return offsetDays > 0
        ? `${absDays} ${unit} after session`
        : `${absDays} ${unit} before session`;
};

export const buildDivisionOptionsForEvent = (event: Event | null): EventDivisionOption[] => {
    if (!event) {
        return [];
    }
    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? '';
    const referenceDate = parseDateValue(event.start ?? null);
    const baseDetailRows = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
    const playoffRows = Array.isArray(event.playoffDivisionDetails) ? event.playoffDivisionDetails : [];
    const tournamentBracketRows = hasTournamentPoolPlayRegistration(event, baseDetailRows)
        ? buildTournamentBracketRegistrationRows(event, baseDetailRows, playoffRows)
        : [];
    const useTournamentBracketRegistration = tournamentBracketRows.length > 0;
    const detailRows = useTournamentBracketRegistration
        ? tournamentBracketRows
        : baseDetailRows.filter((detail) => !isPlayoffDivisionDetail(detail));
    const playoffAliases = new Set<string>();
    if (!useTournamentBracketRegistration) {
        [...baseDetailRows, ...playoffRows]
            .filter(isPlayoffDivisionDetail)
            .forEach((detail) => {
                getDivisionDetailAliases(detail).forEach((alias) => playoffAliases.add(alias));
            });
    }
    const defaultPriceCents = normalizePriceCents(event.price);
    const defaultAllowPaymentPlans = Boolean(event.allowPaymentPlans);
    const defaultInstallmentAmounts = normalizeInstallmentAmountsCents(event.installmentAmounts);
    const defaultInstallmentDueDates = normalizeInstallmentDueDateValues(event.installmentDueDates);
    const defaultInstallmentDueRelativeDays = normalizeInstallmentDueRelativeDayValues(
        (event as Event & { installmentDueRelativeDays?: unknown }).installmentDueRelativeDays,
    );
    const defaultInstallmentCount = Number.isFinite(Number(event.installmentCount))
        ? Math.max(0, Math.trunc(Number(event.installmentCount)))
        : defaultInstallmentAmounts.length;
    const detailsById = new Map<string, EventDivisionDetail>();
    const detailsByKey = new Map<string, EventDivisionDetail>();
    detailRows.forEach((detail) => {
        const detailId = normalizeDivisionKey(detail?.id);
        const detailKey = normalizeDivisionKey(detail?.key);
        if (detailId) {
            detailsById.set(detailId, detail);
            const token = extractDivisionTokenFromId(detailId);
            if (token) {
                detailsByKey.set(token, detail);
            }
        }
        if (detailKey) {
            detailsByKey.set(detailKey, detail);
        }
    });

    const divisionIds = useTournamentBracketRegistration
        ? []
        : Array.isArray(event.divisions)
            ? Array.from(
                new Set(
                    event.divisions
                        .map(getDivisionIdFromEventEntry)
                        .filter((entry): entry is string => Boolean(entry))
                        .filter((entry) => !getNormalizedDivisionAliases(entry).some((alias) => playoffAliases.has(alias))),
                ),
            )
            : [];

    const orderedIds = divisionIds.length
        ? divisionIds
        : Array.from(detailsById.keys());

    const options: EventDivisionOption[] = [];
    const seen = new Set<string>();

    orderedIds.forEach((divisionId) => {
        const row = detailsById.get(divisionId)
            ?? detailsByKey.get(divisionId)
            ?? detailsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
            ?? null;

        const inferred = inferDivisionDetails({
            identifier: (row?.key ?? row?.id ?? divisionId) as string,
            sportInput,
            fallbackName: typeof row?.name === 'string' ? row.name : undefined,
        });

        const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
        const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
        const divisionTypeId = normalizeDivisionKey(row?.divisionTypeId) ?? inferred.divisionTypeId;
        const key = normalizeDivisionKey(row?.key) ?? inferred.token;
        const parsedKey = parseDivisionToken(key);
        const divisionTypeKey = parsedKey
            ? key
            : buildDivisionToken({ gender, ratingType, divisionTypeId });
        const ageEligibility = evaluateDivisionAgeEligibility({
            divisionTypeId,
            sportInput: row?.sportId ?? sportInput,
            referenceDate: referenceDate ?? undefined,
        });

        const option: EventDivisionOption = {
            id: row?.id ?? divisionId,
            key,
            name: cleanDivisionDisplayName(row?.name, inferred.defaultName),
            divisionTypeId,
            divisionTypeName: deriveDivisionTypeDisplayName({
                sportInput,
                gender,
                ratingType,
                divisionTypeId,
            }),
            divisionTypeKey,
            ratingType,
            gender,
            priceCents: typeof row?.price === 'number'
                ? normalizePriceCents(row.price)
                : defaultPriceCents,
            maxParticipants: typeof row?.maxParticipants === 'number'
                ? Math.max(2, Math.trunc(row.maxParticipants))
                : undefined,
            playoffTeamCount: typeof row?.playoffTeamCount === 'number'
                ? Math.max(2, Math.trunc(row.playoffTeamCount))
                : undefined,
            allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
                ? row.allowPaymentPlans
                : defaultAllowPaymentPlans,
            installmentCount: (() => {
                if (typeof row?.installmentCount === 'number') {
                    return Math.max(0, Math.trunc(row.installmentCount));
                }
                return defaultInstallmentCount;
            })(),
            installmentDueDates: (() => {
                const normalized = normalizeInstallmentDueDateValues(row?.installmentDueDates);
                if (normalized.length) {
                    return normalized;
                }
                return [...defaultInstallmentDueDates];
            })(),
            installmentDueRelativeDays: (() => {
                const normalized = normalizeInstallmentDueRelativeDayValues(row?.installmentDueRelativeDays);
                if (normalized.length) {
                    return normalized;
                }
                return [...defaultInstallmentDueRelativeDays];
            })(),
            installmentAmounts: (() => {
                const normalized = normalizeInstallmentAmountsCents(row?.installmentAmounts);
                if (normalized.length) {
                    return normalized;
                }
                return [...defaultInstallmentAmounts];
            })(),
            sportId: row?.sportId ?? (sportInput || undefined),
            ageCutoffDate: typeof row?.ageCutoffDate === 'string'
                ? row.ageCutoffDate
                : (ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : undefined),
            ageCutoffLabel: typeof row?.ageCutoffLabel === 'string'
                ? row.ageCutoffLabel
                : ageEligibility.message ?? undefined,
            ageCutoffSource: typeof row?.ageCutoffSource === 'string'
                ? row.ageCutoffSource
                : (ageEligibility.applies ? ageEligibility.cutoffRule.source : undefined),
        };

        if (seen.has(option.id)) {
            return;
        }
        seen.add(option.id);
        options.push(option);
    });

    return options;
};

export const isActiveFamilyChild = (child: FamilyChild): boolean => {
    const normalizedLinkStatus = typeof child.linkStatus === 'string'
        ? child.linkStatus.trim().toLowerCase()
        : 'active';
    return normalizedLinkStatus === 'active';
};

export const isDivisionOptionEligibleForRegistrant = ({
    division,
    dateOfBirth,
    eventStartDate,
    eventMinAge,
    eventMaxAge,
}: {
    division: EventDivisionOption;
    dateOfBirth: Date | null;
    eventStartDate: Date | null;
    eventMinAge?: number;
    eventMaxAge?: number;
}): boolean => {
    if (!dateOfBirth) {
        return true;
    }

    const ageAtEvent = calculateAgeOnDate(dateOfBirth, eventStartDate ?? new Date());
    if (!Number.isFinite(ageAtEvent)) {
        return false;
    }

    const hasEventAgeLimits = typeof eventMinAge === 'number' || typeof eventMaxAge === 'number';
    if (hasEventAgeLimits && !isAgeWithinRange(ageAtEvent, eventMinAge, eventMaxAge)) {
        return false;
    }

    const divisionEligibility = evaluateDivisionAgeEligibility({
        dateOfBirth,
        divisionTypeId: division.divisionTypeId,
        sportInput: division.sportId ?? undefined,
        referenceDate: eventStartDate ?? undefined,
    });

    return !(divisionEligibility.applies && divisionEligibility.eligible === false);
};
