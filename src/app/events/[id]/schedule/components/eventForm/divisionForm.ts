import type { Division as CoreDivision, Event, LeagueConfig, Sport, TournamentConfig } from '@/types';
import {
    buildDivisionName,
    buildDivisionToken,
    buildEventDivisionId,
    cleanDivisionDisplayName,
    evaluateDivisionAgeEligibility,
    getDivisionTypeById,
    getDivisionTypeOptionsForSport,
    inferDivisionDetails,
    normalizeDivisionGender,
    normalizeDivisionRatingType,
} from '@/lib/divisionTypes';
import { normalizePriceCents } from '@/lib/priceUtils';

import {
    buildTournamentConfig,
    extractTournamentConfigFromEvent,
    leagueConfigToDivisionFields,
    normalizeLeagueConfigForSetMode,
} from './configDefaults';
import {
    normalizeInstallmentDates,
    normalizeInstallmentRelativeDays,
} from './paymentPlanHelpers';
import { normalizeBoolean, stringArraysEqual } from './shared';

export const DEFAULT_DIVISION_KEY = 'open';
export const DEFAULT_AGE_DIVISION_FALLBACK = '18plus';
export const PREFERRED_AGE_DIVISION_IDS = ['18plus', '19plus', 'u18', '18u', 'u19'] as const;

export const DIVISION_GENDER_OPTIONS = [
    { value: 'M', label: 'Mens' },
    { value: 'F', label: 'Womens' },
    { value: 'C', label: 'CoEd' },
] as const;

export const normalizeDivisionTokenPart = (value: unknown): string => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const buildCompositeDivisionTypeId = (skillDivisionTypeId: string, ageDivisionTypeId: string): string => {
    const normalizedSkill = normalizeDivisionTokenPart(skillDivisionTypeId) || 'open';
    const normalizedAge = normalizeDivisionTokenPart(ageDivisionTypeId) || DEFAULT_AGE_DIVISION_FALLBACK;
    return `skill_${normalizedSkill}_age_${normalizedAge}`;
};

export const parseCompositeDivisionTypeId = (
    divisionTypeId: unknown,
): { skillDivisionTypeId: string; ageDivisionTypeId: string } | null => {
    const normalized = normalizeDivisionTokenPart(divisionTypeId);
    if (!normalized.length) {
        return null;
    }
    const match = normalized.match(/^skill_([a-z0-9_]+)_age_([a-z0-9_]+)$/);
    if (!match) {
        return null;
    }
    return {
        skillDivisionTypeId: match[1],
        ageDivisionTypeId: match[2],
    };
};

export const buildDivisionTypeCompositeName = (skillDivisionTypeName: string, ageDivisionTypeName: string): string => (
    [skillDivisionTypeName, ageDivisionTypeName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')
    || 'Open 18+'
);

export const normalizeDivisionKeys = (values: unknown): string[] => {
    if (!Array.isArray(values)) {
        return [];
    }
    return Array.from(
        new Set(
            values
                .map((value) => {
                    if (typeof value !== 'string' && typeof value !== 'number') {
                        return '';
                    }
                    const normalized = String(value).trim().toLowerCase();
                    if (normalized === 'undefined' || normalized === 'null') {
                        return '';
                    }
                    return normalized;
                })
                .filter((value) => value.length > 0),
        ),
    );
};

export const normalizePlacementDivisionIds = (values: unknown): string[] => {
    if (!Array.isArray(values)) {
        return [];
    }
    return values.map((value) => normalizeDivisionKeys([value])[0] ?? '');
};

export const normalizeDivisionNameKey = (value: unknown): string => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const buildUniqueDivisionIdForToken = (params: {
    eventId: string;
    token: string;
    existingDivisionIds: string[];
}): string => {
    const usedDivisionIds = new Set(normalizeDivisionKeys(params.existingDivisionIds));
    let suffix = 1;
    while (true) {
        const scopedEventId = suffix === 1 ? params.eventId : `${params.eventId}_${suffix}`;
        const candidate = buildEventDivisionId(scopedEventId, params.token);
        if (!usedDivisionIds.has(candidate)) {
            return candidate;
        }
        suffix += 1;
    }
};

export const resolveSportInput = (sportInput?: Sport | string | null): string => {
    const sportName = typeof sportInput === 'string'
        ? sportInput
        : sportInput?.name ?? sportInput?.$id ?? '';
    return sportName.toLowerCase();
};

export const getDefaultDivisionTypeSelectionsForSport = (sportInput?: string | null): {
    skillDivisionTypeId: string;
    skillDivisionTypeName: string;
    ageDivisionTypeId: string;
    ageDivisionTypeName: string;
} => {
    const options = getDivisionTypeOptionsForSport(sportInput ?? '');
    const fallbackSkill = options.find((option) => option.ratingType === 'SKILL' && option.id === 'open')
        ?? options.find((option) => option.ratingType === 'SKILL')
        ?? { id: 'open', name: 'Open', ratingType: 'SKILL', sportKey: 'generic' };
    let fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === '18plus');
    if (!fallbackAge) {
        for (const preferredAgeId of PREFERRED_AGE_DIVISION_IDS) {
            fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === preferredAgeId);
            if (fallbackAge) break;
        }
    }
    fallbackAge = fallbackAge
        ?? options.find((option) => option.ratingType === 'AGE')
        ?? { id: '18plus', name: '18+', ratingType: 'AGE', sportKey: 'generic' };
    return {
        skillDivisionTypeId: fallbackSkill.id,
        skillDivisionTypeName: fallbackSkill.name,
        ageDivisionTypeId: fallbackAge.id,
        ageDivisionTypeName: fallbackAge.name,
    };
};

export type DivisionTypeOption = ReturnType<typeof getDivisionTypeOptionsForSport>[number];

export const buildDivisionTypeOptionsForEvent = (
    sportInput: Sport | string | null | undefined,
    divisionDetails: DivisionDetailForm[] = [],
): DivisionTypeOption[] => {
    const resolvedSportInput = resolveSportInput(sportInput);
    const catalogOptions = getDivisionTypeOptionsForSport(resolvedSportInput);
    const detailSkillOptions = divisionDetails.map((detail) => ({
        id: detail.skillDivisionTypeId || detail.divisionTypeId,
        name: detail.skillDivisionTypeName || detail.divisionTypeName,
        ratingType: 'SKILL' as const,
        sportKey: resolvedSportInput || 'event',
    }));
    const detailAgeOptions = divisionDetails.map((detail) => ({
        id: detail.ageDivisionTypeId || detail.divisionTypeId,
        name: detail.ageDivisionTypeName || detail.divisionTypeName,
        ratingType: 'AGE' as const,
        sportKey: resolvedSportInput || 'event',
    }));
    const merged = [...catalogOptions, ...detailSkillOptions, ...detailAgeOptions];
    const seen = new Set<string>();
    return merged.filter((option) => {
        const key = `${option.ratingType}:${option.id}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

export const buildDivisionTypeSelectOptions = (
    options: DivisionTypeOption[],
    ratingType: DivisionTypeOption['ratingType'],
): Array<{ value: string; label: string }> => (
    options
        .filter((option) => option.ratingType === ratingType)
        .map((option) => ({ value: option.id, label: option.name }))
);

export const buildPlayoffDivisionSelectOptions = (
    playoffDivisionDetails: PlayoffDivisionDetailForm[] = [],
): Array<{ value: string; label: string }> => (
    playoffDivisionDetails.map((division) => ({
        value: division.id,
        label: division.name,
    }))
);

export const buildPlayoffDivisionCapacityWarnings = ({
    eventType,
    includePlayoffs,
    splitLeaguePlayoffDivisions,
    divisionDetails,
    playoffDivisionDetails,
}: {
    eventType?: Event['eventType'] | null;
    includePlayoffs?: boolean | null;
    splitLeaguePlayoffDivisions?: boolean | null;
    divisionDetails?: DivisionDetailForm[] | null;
    playoffDivisionDetails?: PlayoffDivisionDetailForm[] | null;
}): string[] => {
    if (eventType !== 'LEAGUE' || !includePlayoffs || !splitLeaguePlayoffDivisions) {
        return [];
    }

    const assignmentCounts = new Map<string, number>();
    const playoffDivisions = Array.isArray(playoffDivisionDetails) ? playoffDivisionDetails : [];

    (divisionDetails || []).forEach((division) => {
        const playoffTeamCount = Number.isFinite(division.playoffTeamCount)
            ? Math.max(0, Math.trunc(division.playoffTeamCount as number))
            : 0;
        const mapping = Array.isArray(division.playoffPlacementDivisionIds)
            ? division.playoffPlacementDivisionIds
            : [];
        for (let index = 0; index < playoffTeamCount; index += 1) {
            const mappedDivisionId = normalizeDivisionKeys([mapping[index]])[0];
            if (!mappedDivisionId) {
                continue;
            }
            assignmentCounts.set(mappedDivisionId, (assignmentCounts.get(mappedDivisionId) ?? 0) + 1);
        }
    });

    return playoffDivisions
        .map((division) => {
            const normalizedId = normalizeDivisionKeys([division.id])[0];
            if (!normalizedId) {
                return null;
            }
            const assigned = assignmentCounts.get(normalizedId) ?? 0;
            const capacity = normalizePlayoffDivisionParticipantCount(division.maxParticipants) ?? 0;
            if (assigned > capacity) {
                return `${division.name} has ${assigned} mapped teams but only ${capacity} slots.`;
            }
            return null;
        })
        .filter((message): message is string => Boolean(message));
};

export const normalizePlayoffDivisionParticipantCount = (value: unknown): number | null => {
    if (typeof value === 'string' && value.trim().length === 0) {
        return null;
    }
    if (value === null || value === undefined) {
        return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return Math.max(0, Math.trunc(numeric));
};

export const formatPlayoffDivisionParticipantCount = (value: unknown): string => {
    const normalized = normalizePlayoffDivisionParticipantCount(value);
    return typeof normalized === 'number' ? String(normalized) : 'Not set';
};

export type DivisionDetailForm = {
    id: string;
    key: string;
    kind?: 'LEAGUE' | 'PLAYOFF';
    name: string;
    divisionTypeId: string;
    divisionTypeName: string;
    ratingType: 'AGE' | 'SKILL';
    gender: 'M' | 'F' | 'C';
    skillDivisionTypeId: string;
    skillDivisionTypeName: string;
    ageDivisionTypeId: string;
    ageDivisionTypeName: string;
    price: number;
    maxParticipants: number;
    playoffTeamCount?: number;
    poolCount?: number;
    poolTeamCount?: number;
    playoffPlacementDivisionIds?: string[];
    gamesPerOpponent?: number;
    restTimeMinutes?: number;
    usesSets?: boolean;
    matchDurationMinutes?: number | null;
    setDurationMinutes?: number | null;
    setsPerMatch?: number;
    pointsToVictory?: number[];
    playoffConfig?: TournamentConfig;
    allowPaymentPlans: boolean;
    installmentCount?: number;
    installmentDueDates: string[];
    installmentDueRelativeDays: number[];
    installmentAmounts: number[];
    sportId?: string;
    fieldIds?: string[];
    ageCutoffDate?: string;
    ageCutoffLabel?: string;
    ageCutoffSource?: string;
};

export type PlayoffDivisionDetailForm = Omit<
    Partial<DivisionDetailForm>,
    'id' | 'key' | 'kind' | 'name' | 'maxParticipants'
> & {
    id: string;
    key: string;
    kind: 'PLAYOFF';
    name: string;
    maxParticipants: number | null;
    playoffConfig: TournamentConfig;
};

export const divisionIdFromValue = (value: string | CoreDivision): string => {
    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }
    const fallback = (
        value.id
        || (value as { $id?: string }).$id
        || value.key
        || value.skillLevel
        || value.name
        || ''
    ).toString();
    return fallback.trim().toLowerCase();
};

export const normalizeDivisionDetailEntry = (
    entry: unknown,
    eventId: string,
    sportInput?: string | null,
    referenceDate?: Date | null,
    valuesStoredInCents: boolean = true,
): DivisionDetailForm | null => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const row = entry as Record<string, unknown>;
    const rawId = normalizeDivisionKeys([row.id ?? row.$id])[0];
    const inferred = inferDivisionDetails({
        identifier: (row.key ?? rawId ?? row.name ?? 'c_skill_open') as string,
        sportInput: sportInput ?? undefined,
        fallbackName: typeof row.name === 'string' ? row.name : undefined,
    });
    const defaults = getDefaultDivisionTypeSelectionsForSport(sportInput ?? undefined);
    const rawDivisionTypeId = normalizeDivisionKeys([row.divisionTypeId])[0] || inferred.divisionTypeId;
    const parsedComposite = parseCompositeDivisionTypeId(row.divisionTypeId ?? rawDivisionTypeId);
    const rawSkillDivisionTypeId = normalizeDivisionKeys([row.skillDivisionTypeId])[0];
    const rawAgeDivisionTypeId = normalizeDivisionKeys([row.ageDivisionTypeId])[0];
    const ratingType = parsedComposite || rawSkillDivisionTypeId || rawAgeDivisionTypeId
        ? 'SKILL'
        : (normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType);
    const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
    const skillDivisionTypeId = rawSkillDivisionTypeId
        ?? parsedComposite?.skillDivisionTypeId
        ?? (ratingType === 'SKILL' ? rawDivisionTypeId : defaults.skillDivisionTypeId);
    const ageDivisionTypeId = rawAgeDivisionTypeId
        ?? parsedComposite?.ageDivisionTypeId
        ?? (ratingType === 'AGE' ? rawDivisionTypeId : defaults.ageDivisionTypeId);
    const skillDivisionTypeName = typeof row.skillDivisionTypeName === 'string' && row.skillDivisionTypeName.trim().length > 0
        ? row.skillDivisionTypeName.trim()
        : (
            getDivisionTypeById(sportInput ?? null, skillDivisionTypeId, 'SKILL')?.name
            ?? defaults.skillDivisionTypeName
        );
    const ageDivisionTypeName = typeof row.ageDivisionTypeName === 'string' && row.ageDivisionTypeName.trim().length > 0
        ? row.ageDivisionTypeName.trim()
        : (
            getDivisionTypeById(sportInput ?? null, ageDivisionTypeId, 'AGE')?.name
            ?? defaults.ageDivisionTypeName
        );
    const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
    const divisionTypeName = buildDivisionName({
        gender,
        sportInput,
        skillDivisionTypeId,
        ageDivisionTypeId,
    });
    const key = normalizeDivisionKeys([row.key])[0] || buildDivisionToken({
        gender,
        ratingType: 'SKILL',
        divisionTypeId,
    });
    const id = rawId || buildEventDivisionId(eventId, key);
    const name = cleanDivisionDisplayName(
        row.name,
        divisionTypeName,
    );
    const rawDivisionPriceCents = typeof row.price === 'number'
        ? row.price
        : Number.isFinite(Number(row.price))
            ? Number(row.price)
            : 0;
    const rawDivisionMaxParticipants = typeof row.maxParticipants === 'number'
        ? row.maxParticipants
        : Number.isFinite(Number(row.maxParticipants))
            ? Number(row.maxParticipants)
            : 10;
    const rawDivisionPlayoffTeamCount = typeof row.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : Number.isFinite(Number(row.playoffTeamCount))
            ? Number(row.playoffTeamCount)
            : undefined;
    const rawPoolCount = typeof row.poolCount === 'number'
        ? row.poolCount
        : Number.isFinite(Number(row.poolCount))
            ? Number(row.poolCount)
            : undefined;
    const rawPoolTeamCount = typeof row.poolTeamCount === 'number'
        ? row.poolTeamCount
        : Number.isFinite(Number(row.poolTeamCount))
            ? Number(row.poolTeamCount)
            : undefined;
    const rawLeagueConfigSource = row.leagueConfig && typeof row.leagueConfig === 'object' && !Array.isArray(row.leagueConfig)
        ? row.leagueConfig as Partial<LeagueConfig>
        : row as Partial<LeagueConfig>;
    const rawLeagueConfig = normalizeLeagueConfigForSetMode(
        rawLeagueConfigSource,
        Boolean(rawLeagueConfigSource.usesSets),
    );
    const rawPlayoffConfig = extractTournamentConfigFromEvent(row as unknown as Partial<Event>) ?? undefined;
    const rawPlayoffPlacementDivisionIds = normalizePlacementDivisionIds(row.playoffPlacementDivisionIds);
    const rawAllowPaymentPlans = normalizeBoolean(row.allowPaymentPlans) ?? false;
    const rawInstallmentAmounts = Array.isArray(row.installmentAmounts)
        ? row.installmentAmounts.map((value) => {
            const parsed = typeof value === 'number' ? value : Number(value);
            return valuesStoredInCents
                ? normalizePriceCents(parsed)
                : normalizePriceCents(Number.isFinite(parsed) ? parsed * 100 : 0);
        })
        : [];
    const rawInstallmentDueDates = normalizeInstallmentDates(row.installmentDueDates);
    const rawInstallmentDueRelativeDays = normalizeInstallmentRelativeDays(row.installmentDueRelativeDays);
    const rawInstallmentCount = Number.isFinite(Number(row.installmentCount))
        ? Math.max(0, Math.trunc(Number(row.installmentCount)))
        : rawInstallmentAmounts.length;

    const baseDetail: DivisionDetailForm = {
        id,
        key,
        kind: typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE',
        name,
        divisionTypeId,
        divisionTypeName,
        ratingType,
        gender,
        skillDivisionTypeId,
        skillDivisionTypeName,
        ageDivisionTypeId,
        ageDivisionTypeName,
        price: valuesStoredInCents
            ? normalizePriceCents(rawDivisionPriceCents)
            : normalizePriceCents(rawDivisionPriceCents * 100),
        maxParticipants: Math.max(2, Math.trunc(rawDivisionMaxParticipants)),
        playoffTeamCount: Number.isFinite(rawDivisionPlayoffTeamCount)
            ? Math.max(2, Math.trunc(rawDivisionPlayoffTeamCount as number))
            : undefined,
        poolCount: Number.isFinite(rawPoolCount)
            ? Math.max(1, Math.trunc(rawPoolCount as number))
            : undefined,
        poolTeamCount: Number.isFinite(rawPoolTeamCount)
            ? Math.max(1, Math.trunc(rawPoolTeamCount as number))
            : undefined,
        playoffPlacementDivisionIds: rawPlayoffPlacementDivisionIds,
        ...leagueConfigToDivisionFields(rawLeagueConfig),
        ...(rawPlayoffConfig ? { playoffConfig: rawPlayoffConfig } : {}),
        allowPaymentPlans: rawAllowPaymentPlans,
        installmentCount: rawAllowPaymentPlans
            ? (rawInstallmentCount || rawInstallmentAmounts.length || 0)
            : 0,
        installmentDueDates: rawAllowPaymentPlans ? rawInstallmentDueDates : [],
        installmentDueRelativeDays: rawAllowPaymentPlans ? rawInstallmentDueRelativeDays : [],
        installmentAmounts: rawAllowPaymentPlans ? rawInstallmentAmounts : [],
        sportId: typeof row.sportId === 'string' ? row.sportId : sportInput ?? undefined,
        fieldIds: Array.isArray(row.fieldIds)
            ? row.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)
            : [],
        ageCutoffDate: typeof row.ageCutoffDate === 'string' ? row.ageCutoffDate : undefined,
        ageCutoffLabel: typeof row.ageCutoffLabel === 'string' ? row.ageCutoffLabel : undefined,
        ageCutoffSource: typeof row.ageCutoffSource === 'string' ? row.ageCutoffSource : undefined,
    };
    return applyDivisionAgeCutoff(baseDetail, sportInput, referenceDate);
};

export const normalizePlayoffDivisionDetailEntry = (
    entry: unknown,
    eventId: string,
    fallbackPlayoffConfig?: TournamentConfig,
    sportInput?: string | null,
    referenceDate?: Date | null,
): PlayoffDivisionDetailForm | null => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const row = entry as Record<string, unknown>;
    const rawId = normalizeDivisionKeys([row.id ?? row.$id])[0];
    const rawKey = normalizeDivisionKeys([row.key])[0];
    const key = rawKey || `playoff_${Math.max(1, Math.trunc(Number(row.seed) || 1))}`;
    const id = rawId || buildEventDivisionId(eventId, key);
    const name = typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name.trim()
        : `Playoff Division ${key.replace(/^playoff_/, '')}`;
    const maxParticipantsRaw = normalizePlayoffDivisionParticipantCount(row.maxParticipants);
    const playoffConfig = extractTournamentConfigFromEvent(row as unknown as Partial<Event>)
        ?? buildTournamentConfig(fallbackPlayoffConfig);
    const normalizedDivision = normalizeDivisionDetailEntry(
        {
            ...row,
            id,
            key,
            kind: 'PLAYOFF',
            name,
            maxParticipants: maxParticipantsRaw,
        },
        eventId,
        typeof row.sportId === 'string' ? row.sportId : sportInput,
        referenceDate,
    );

    return {
        ...(normalizedDivision
            ? {
                divisionTypeId: normalizedDivision.divisionTypeId,
                divisionTypeName: normalizedDivision.divisionTypeName,
                ratingType: normalizedDivision.ratingType,
                gender: normalizedDivision.gender,
                skillDivisionTypeId: normalizedDivision.skillDivisionTypeId,
                skillDivisionTypeName: normalizedDivision.skillDivisionTypeName,
                ageDivisionTypeId: normalizedDivision.ageDivisionTypeId,
                ageDivisionTypeName: normalizedDivision.ageDivisionTypeName,
                price: normalizedDivision.price,
                playoffTeamCount: normalizedDivision.playoffTeamCount,
                poolCount: normalizedDivision.poolCount,
                poolTeamCount: normalizedDivision.poolTeamCount,
                allowPaymentPlans: normalizedDivision.allowPaymentPlans,
                installmentCount: normalizedDivision.installmentCount,
                installmentDueDates: normalizedDivision.installmentDueDates,
                installmentDueRelativeDays: normalizedDivision.installmentDueRelativeDays,
                installmentAmounts: normalizedDivision.installmentAmounts,
                sportId: normalizedDivision.sportId,
                ageCutoffDate: normalizedDivision.ageCutoffDate,
                ageCutoffLabel: normalizedDivision.ageCutoffLabel,
                ageCutoffSource: normalizedDivision.ageCutoffSource,
                fieldIds: normalizedDivision.fieldIds,
            }
            : {}),
        id,
        key,
        kind: 'PLAYOFF',
        name,
        maxParticipants: maxParticipantsRaw,
        playoffConfig,
    };
};

export type DivisionEditorKind = 'LEAGUE' | 'PLAYOFF';

export type TournamentPoolSettings = {
    poolCount: number;
    poolTeamCount?: number;
};

export const deriveTournamentPoolSettingsByBracketId = (
    poolDivisionDetails: DivisionDetailForm[],
): Map<string, TournamentPoolSettings> => {
    const grouped = new Map<string, {
        poolIds: Set<string>;
        totalPoolTeams: number;
        poolTeamCounts: Set<number>;
    }>();

    poolDivisionDetails.forEach((detail) => {
        const parentBracketIds = Array.from(
            new Set(normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds).filter(Boolean)),
        );
        if (!parentBracketIds.length) {
            return;
        }

        const poolId = normalizeDivisionKeys([detail.id])[0] || detail.id;
        const poolTeamCount = Number.isFinite(detail.maxParticipants)
            ? Math.max(1, Math.trunc(detail.maxParticipants))
            : undefined;

        parentBracketIds.forEach((bracketId) => {
            const current = grouped.get(bracketId) ?? {
                poolIds: new Set<string>(),
                totalPoolTeams: 0,
                poolTeamCounts: new Set<number>(),
            };
            if (!current.poolIds.has(poolId)) {
                current.poolIds.add(poolId);
                if (typeof poolTeamCount === 'number') {
                    current.totalPoolTeams += poolTeamCount;
                    current.poolTeamCounts.add(poolTeamCount);
                }
            }
            grouped.set(bracketId, current);
        });
    });

    const settingsByBracketId = new Map<string, TournamentPoolSettings>();
    grouped.forEach((group, bracketId) => {
        const poolCount = group.poolIds.size;
        if (!poolCount) {
            return;
        }
        const uniformPoolTeamCount = group.poolTeamCounts.size === 1
            ? Array.from(group.poolTeamCounts)[0]
            : undefined;
        const evenlyDerivedPoolTeamCount = group.totalPoolTeams > 0 && group.totalPoolTeams % poolCount === 0
            ? group.totalPoolTeams / poolCount
            : undefined;
        settingsByBracketId.set(bracketId, {
            poolCount,
            poolTeamCount: uniformPoolTeamCount ?? evenlyDerivedPoolTeamCount,
        });
    });

    return settingsByBracketId;
};

export type SlotDivisionLookup = {
    options: Array<{ value: string; label: string }>;
    keys: string[];
    valueToId: Map<string, string>;
};

export type SlotDivisionLookupDetail = {
    id: string;
    name: string;
    gender?: 'M' | 'F' | 'C';
    sportId?: string;
    skillDivisionTypeId?: string;
    ageDivisionTypeId?: string;
    divisionTypeName?: string;
};

export const getDivisionDetailLabel = (
    detail: SlotDivisionLookupDetail,
): string => {
    if (typeof detail.name === 'string' && detail.name.trim().length > 0) {
        return detail.name.trim();
    }
    if (detail.skillDivisionTypeId && detail.ageDivisionTypeId) {
        return buildDivisionName({
            gender: detail.gender ?? 'C',
            sportInput: detail.sportId,
            skillDivisionTypeId: detail.skillDivisionTypeId,
            ageDivisionTypeId: detail.ageDivisionTypeId,
        });
    }
    return detail.divisionTypeName?.trim() || detail.id;
};

export const buildSlotDivisionLookup = (
    details: SlotDivisionLookupDetail[],
    playoffDetails: PlayoffDivisionDetailForm[] = [],
): SlotDivisionLookup => {
    const allDetails: SlotDivisionLookupDetail[] = [
        ...details,
        ...playoffDetails.map((division) => ({
            id: division.id,
            name: division.name,
            gender: 'C' as const,
            divisionTypeName: 'Playoff',
        })),
    ];
    const optionByValue = new Map<string, { value: string; label: string }>();
    const orderedKeys: string[] = [];
    const seenKeys = new Set<string>();
    const valueToId = new Map<string, string>();

    allDetails.forEach((detail) => {
        const normalizedId = normalizeDivisionKeys([detail.id])[0];
        const label = getDivisionDetailLabel(detail);
        if (!normalizedId) {
            return;
        }

        if (!optionByValue.has(normalizedId)) {
            optionByValue.set(normalizedId, {
                value: normalizedId,
                label,
            });
        }
        if (!seenKeys.has(normalizedId)) {
            seenKeys.add(normalizedId);
            orderedKeys.push(normalizedId);
        }

        const normalizedName = normalizeDivisionNameKey(label);
        valueToId.set(normalizedId, normalizedId);
        valueToId.set(normalizeDivisionNameKey(detail.id), normalizedId);
        if (normalizedName.length > 0 && !valueToId.has(normalizedName)) {
            valueToId.set(normalizedName, normalizedId);
        }
    });

    return {
        options: Array.from(optionByValue.values()).sort((left, right) => left.label.localeCompare(right.label)),
        keys: orderedKeys,
        valueToId,
    };
};

export const normalizeSlotDivisionIdsWithLookup = (
    values: unknown,
    lookup: Pick<SlotDivisionLookup, 'valueToId'>,
): string[] => (
    Array.from(
        new Set(
            (Array.isArray(values) ? values : [])
                .map((value) => String(value).trim())
                .filter((value) => value.length > 0)
                .map((value) => {
                    const normalizedId = normalizeDivisionKeys([value])[0];
                    if (normalizedId) {
                        const byId = lookup.valueToId.get(normalizedId);
                        if (byId) {
                            return byId;
                        }
                    }
                    const byLabel = lookup.valueToId.get(normalizeDivisionNameKey(value));
                    return byLabel ?? normalizedId ?? '';
                })
                .filter((value) => value.length > 0),
        ),
    )
);

export const normalizeSlotDivisionKeysWithLookup = (
    values: unknown,
    lookup: Pick<SlotDivisionLookup, 'valueToId'>,
): string[] => normalizeSlotDivisionIdsWithLookup(values, lookup);

export const applyDivisionAgeCutoff = (
    detail: DivisionDetailForm,
    sportInput?: string | null,
    referenceDate?: Date | null,
): DivisionDetailForm => {
    const eligibility = evaluateDivisionAgeEligibility({
        divisionTypeId: detail.ageDivisionTypeId || detail.divisionTypeId,
        sportInput: sportInput ?? detail.sportId ?? undefined,
        referenceDate: referenceDate ?? null,
    });
    if (!eligibility.applies) {
        return {
            ...detail,
            ageCutoffDate: undefined,
            ageCutoffLabel: undefined,
            ageCutoffSource: undefined,
        };
    }
    return {
        ...detail,
        ageCutoffDate: eligibility.cutoffDate.toISOString(),
        ageCutoffLabel: eligibility.message ?? undefined,
        ageCutoffSource: eligibility.cutoffRule.source,
    };
};

export const buildDefaultDivisionDetailsForSport = (
    eventId: string,
    sportInput?: Sport | string | null,
    referenceDate?: Date | null,
): DivisionDetailForm[] => {
    const sport = resolveSportInput(sportInput);
    const options = getDivisionTypeOptionsForSport(sport);
    const fallbackSkill = options.find((option) => option.ratingType === 'SKILL' && option.id === 'open')
        ?? options.find((option) => option.ratingType === 'SKILL')
        ?? { id: 'open', name: 'Open', ratingType: 'SKILL', sportKey: 'generic' };
    let fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === '18plus');
    if (!fallbackAge) {
        for (const preferredAgeId of PREFERRED_AGE_DIVISION_IDS) {
            fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === preferredAgeId);
            if (fallbackAge) break;
        }
    }
    fallbackAge = fallbackAge
        ?? options.find((option) => option.ratingType === 'AGE')
        ?? { id: '18plus', name: '18+', ratingType: 'AGE', sportKey: 'generic' };
    const compositeDivisionTypeId = buildCompositeDivisionTypeId(fallbackSkill.id, fallbackAge.id);
    const token = buildDivisionToken({
        gender: 'C',
        ratingType: 'SKILL',
        divisionTypeId: compositeDivisionTypeId,
    });
    const divisionTypeName = buildDivisionName({
        gender: 'C',
        sportInput: sport,
        skillDivisionTypeId: fallbackSkill.id,
        ageDivisionTypeId: fallbackAge.id,
    });
    const detail: DivisionDetailForm = {
        id: buildEventDivisionId(eventId, token),
        key: token,
        kind: 'LEAGUE',
        name: divisionTypeName,
        divisionTypeId: compositeDivisionTypeId,
        divisionTypeName,
        ratingType: 'SKILL',
        gender: 'C',
        skillDivisionTypeId: fallbackSkill.id,
        skillDivisionTypeName: fallbackSkill.name,
        ageDivisionTypeId: fallbackAge.id,
        ageDivisionTypeName: fallbackAge.name,
        price: 0,
        maxParticipants: 10,
        playoffTeamCount: 10,
        playoffPlacementDivisionIds: [],
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentDueRelativeDays: [],
        installmentAmounts: [],
        sportId: sport || undefined,
        fieldIds: [],
    };
    return [applyDivisionAgeCutoff(detail, sport, referenceDate)];
};

export const normalizeDivisionFieldIds = (
    value: unknown,
    divisionKeys: string[],
    availableFieldIds: string[],
): Record<string, string[]> => {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    const allowed = new Set(availableFieldIds);
    const normalizedDivisionKeys = divisionKeys.length ? divisionKeys : [DEFAULT_DIVISION_KEY];
    const result: Record<string, string[]> = {};

    normalizedDivisionKeys.forEach((divisionKey) => {
        const rawFieldIds = source[divisionKey];
        const selected = Array.isArray(rawFieldIds)
            ? Array.from(new Set(rawFieldIds.map((entry) => String(entry)).filter((entry) => allowed.has(entry))))
            : [];
        result[divisionKey] = selected.length ? selected : [...availableFieldIds];
    });

    return result;
};

export const divisionFieldIdsEqual = (
    left: Record<string, string[]>,
    right: Record<string, string[]>,
): boolean => {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    for (const key of keys) {
        const leftValues = Array.from(new Set((left[key] ?? []).map(String))).sort();
        const rightValues = Array.from(new Set((right[key] ?? []).map(String))).sort();
        if (leftValues.length !== rightValues.length) {
            return false;
        }
        if (!stringArraysEqual(leftValues, rightValues)) {
            return false;
        }
    }
    return true;
};
