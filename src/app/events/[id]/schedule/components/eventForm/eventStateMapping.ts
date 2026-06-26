import { createLeagueScoringConfig } from '@/types/defaults';
import { getDivisionTypeById, buildDivisionName, buildDivisionToken, inferDivisionDetails } from '@/lib/divisionTypes';
import { getSystemTimeZone, normalizeTimeZone } from '@/lib/dateUtils';
import { normalizePriceCents } from '@/lib/priceUtils';
import {
    normalizeEventTaxHandling,
    normalizeOrganizerManualTaxRateBps,
} from '@/lib/taxPolicy';
import type { Event, EventState, Division as CoreDivision, LeagueScoringConfig, Sport } from '@/types';

import {
    buildTournamentConfig,
    derivePoolTeamCount,
    extractTournamentConfigFromEvent,
} from './configDefaults';
import {
    applyDivisionAgeCutoff,
    buildCompositeDivisionTypeId,
    deriveTournamentPoolSettingsByBracketId,
    divisionIdFromValue,
    type DivisionDetailForm,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionDetailEntry,
    normalizeDivisionKeys,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionDetailEntry,
    type PlayoffDivisionDetailForm,
    parseCompositeDivisionTypeId,
    type TournamentPoolSettings,
} from './divisionForm';
import { isTournamentPoolPlayFormEnabled, supportsScheduleSlotsForEvent } from './eventRules';
import type { EventFormState } from './formTypes';
import { sanitizeMatchRulesOverrideForEditor } from './matchRulesHelpers';
import {
    getEventOfficialUserIds,
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
    normalizeSportOfficialPositionTemplates,
} from './officials';
import {
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
    sumInstallmentAmounts,
} from './paymentPlanHelpers';
import type { PendingStaffInvite, StaffAssignmentRole } from './staffInvites';
import { formatEventDateTimeForForm, parseDateValue } from './dateHelpers';

export const mapEventToFormState = (event: Event): EventFormState => {
    const isSchedulableType = supportsScheduleSlotsForEvent(event.eventType, event.parentEvent);
    const derivedNoFixedEndDateTime = (() => {
        if (typeof event.noFixedEndDateTime === 'boolean') {
            return event.noFixedEndDateTime;
        }
        return false;
    })();
    const eventTimeZone = normalizeTimeZone(event.timeZone, getSystemTimeZone());

    const resolvedSportId = (() => {
        // `event.sport` is historically inconsistent: it may be a Sport object, a string id, or absent.
        // Keep runtime compatibility by treating it as unknown and narrowing safely.
        const sport = (event as { sport?: unknown }).sport;
        if (sport && typeof sport === 'object' && '$id' in sport) {
            return (sport as Sport).$id;
        }
        if (typeof sport === 'string' && sport.trim().length > 0) {
            return sport;
        }
        if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
            return event.sportId;
        }
        return '';
    })();
    const resolvedSportInput = (event.sport && typeof event.sport === 'object'
        ? ((event.sport as Sport).name || (event.sport as Sport).$id || '')
        : resolvedSportId) || '';
    const officialPositionTemplates = normalizeSportOfficialPositionTemplates(
        event.sport && typeof event.sport === 'object'
            ? (event.sport as Sport).officialPositionTemplates
            : undefined,
    );
    const normalizedOfficialPositions = normalizeEventOfficialPositions(
        event.officialPositions,
        officialPositionTemplates,
    );
    const normalizedEventOfficials = normalizeEventOfficials(
        event.eventOfficials,
        Array.isArray(event.eventOfficials)
            ? []
            : Array.isArray(event.officialIds)
                ? event.officialIds.map((officialId) => String(officialId)).filter(Boolean)
                : [],
        normalizedOfficialPositions,
    );
    const normalizedOfficialIds = getEventOfficialUserIds(normalizedEventOfficials);
    const divisionReferenceDate = parseDateValue(event.start ?? null);
    const defaultEventInstallmentAmounts = normalizeInstallmentAmounts(event.installmentAmounts);
    const defaultEventInstallmentDueDates = Array.isArray(event.installmentDueDates)
        ? event.installmentDueDates.map((value) => String(value))
        : [];
    const defaultEventInstallmentDueRelativeDays = normalizeInstallmentRelativeDays((event as any).installmentDueRelativeDays);
    const defaultEventInstallmentCount = Number.isFinite(event.installmentCount)
        ? Math.max(0, Math.trunc(event.installmentCount as number))
        : defaultEventInstallmentAmounts.length;
    const defaultEventAllowPaymentPlans = Boolean(event.allowPaymentPlans);
    const defaultEventPrice = defaultEventAllowPaymentPlans && defaultEventInstallmentAmounts.length
        ? sumInstallmentAmounts(defaultEventInstallmentAmounts)
        : normalizePriceCents(event.price);

    const normalizedDivisionIds = Array.isArray(event.divisions)
        ? Array.from(
            new Set(
                (event.divisions as (string | CoreDivision)[])
                    .map(divisionIdFromValue)
                    .filter((divisionId) => divisionId.length > 0),
            ),
        )
        : [];
    const normalizedDivisionDetails = (() => {
        const details = Array.isArray(event.divisionDetails)
            ? event.divisionDetails
                .map((entry) => normalizeDivisionDetailEntry(entry, event.$id, resolvedSportInput, divisionReferenceDate))
                .filter((entry): entry is DivisionDetailForm => Boolean(entry))
            : [];
        const detailsById = new Map<string, DivisionDetailForm>();
        details.forEach((detail) => detailsById.set(detail.id, detail));

        normalizedDivisionIds.forEach((divisionId) => {
            if (detailsById.has(divisionId)) {
                return;
            }
            const inferred = inferDivisionDetails({
                identifier: divisionId,
                sportInput: resolvedSportInput,
            });
            const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(resolvedSportInput);
            const parsedComposite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
            const skillDivisionTypeId = parsedComposite?.skillDivisionTypeId
                ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
            const ageDivisionTypeId = parsedComposite?.ageDivisionTypeId
                ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
            const skillDivisionTypeName = getDivisionTypeById(
                resolvedSportInput,
                skillDivisionTypeId,
                'SKILL',
            )?.name ?? defaultsForSport.skillDivisionTypeName;
            const ageDivisionTypeName = getDivisionTypeById(
                resolvedSportInput,
                ageDivisionTypeId,
                'AGE',
            )?.name ?? defaultsForSport.ageDivisionTypeName;
            const compositeDivisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
            const divisionTypeName = buildDivisionName({
                gender: inferred.gender,
                sportInput: resolvedSportInput,
                skillDivisionTypeId,
                ageDivisionTypeId,
            });
            const inferredToken = buildDivisionToken({
                gender: inferred.gender,
                ratingType: 'SKILL',
                divisionTypeId: compositeDivisionTypeId,
            });
            detailsById.set(divisionId, applyDivisionAgeCutoff({
                id: divisionId,
                key: inferredToken,
                kind: 'LEAGUE',
                name: divisionTypeName,
                divisionTypeId: compositeDivisionTypeId,
                divisionTypeName,
                ratingType: 'SKILL',
                gender: inferred.gender,
                skillDivisionTypeId,
                skillDivisionTypeName,
                ageDivisionTypeId,
                ageDivisionTypeName,
                price: defaultEventPrice,
                maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : 10,
                playoffTeamCount: Number.isFinite(event.playoffTeamCount)
                    ? Math.max(2, Math.trunc(event.playoffTeamCount as number))
                    : undefined,
                playoffPlacementDivisionIds: [],
                allowPaymentPlans: defaultEventAllowPaymentPlans,
                installmentCount: defaultEventAllowPaymentPlans
                    ? (defaultEventInstallmentCount || defaultEventInstallmentAmounts.length || 0)
                    : 0,
                installmentDueDates: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentDueDates] : [],
                installmentDueRelativeDays: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentDueRelativeDays] : [],
                installmentAmounts: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentAmounts] : [],
                sportId: resolvedSportInput || undefined,
                fieldIds: [],
            }, resolvedSportInput, divisionReferenceDate));
        });

        const preferredOrder = normalizedDivisionIds.length
            ? normalizedDivisionIds
            : Array.from(detailsById.keys());
        const ordered: DivisionDetailForm[] = preferredOrder
            .map((divisionId) => detailsById.get(divisionId))
            .filter((entry): entry is DivisionDetailForm => Boolean(entry));
        if (ordered.length === detailsById.size) {
            return ordered;
        }
        detailsById.forEach((detail) => {
            if (!ordered.some((entry) => entry.id === detail.id)) {
                ordered.push(detail);
            }
        });
        return ordered;
    })();
    const normalizedDivisionDetailsWithCapacity: DivisionDetailForm[] = normalizedDivisionDetails.map((detail): DivisionDetailForm => ({
        ...detail,
        kind: detail.kind === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE',
        price: detail.allowPaymentPlans && normalizeInstallmentAmounts(detail.installmentAmounts).length
            ? sumInstallmentAmounts(detail.installmentAmounts)
            : Number.isFinite(detail.price)
                ? Math.max(0, detail.price)
                : defaultEventPrice,
        maxParticipants: Number.isFinite(detail.maxParticipants)
            ? Math.max(2, Math.trunc(detail.maxParticipants))
            : Number.isFinite(event.maxParticipants)
                ? Math.max(2, Math.trunc(event.maxParticipants))
                : 10,
        playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
            ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
            : Number.isFinite(event.playoffTeamCount)
                ? Math.max(2, Math.trunc(event.playoffTeamCount as number))
                : undefined,
        poolCount: Number.isFinite(detail.poolCount)
            ? Math.max(1, Math.trunc(detail.poolCount as number))
            : undefined,
        poolTeamCount: Number.isFinite(detail.poolTeamCount)
            ? Math.max(1, Math.trunc(detail.poolTeamCount as number))
            : undefined,
        playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
        allowPaymentPlans: typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : defaultEventAllowPaymentPlans,
        installmentAmounts: (() => {
            const divisionInstallments = normalizeInstallmentAmounts(detail.installmentAmounts);
            if (detail.allowPaymentPlans) {
                return divisionInstallments;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentAmounts];
            }
            return [];
        })(),
        installmentDueDates: (() => {
            const divisionDueDates = Array.isArray(detail.installmentDueDates)
                ? detail.installmentDueDates
                    .map((value) => String(value))
                    .filter((value) => value.trim().length > 0)
                : [];
            if (detail.allowPaymentPlans) {
                return divisionDueDates;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentDueDates];
            }
            return [];
        })(),
        installmentDueRelativeDays: (() => {
            const divisionRelativeDays = normalizeInstallmentRelativeDays(detail.installmentDueRelativeDays);
            if (detail.allowPaymentPlans) {
                return divisionRelativeDays;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentDueRelativeDays];
            }
            return [];
        })(),
        installmentCount: (() => {
            if (detail.allowPaymentPlans) {
                if (typeof detail.installmentCount === 'number' && Number.isFinite(detail.installmentCount)) {
                    return Math.max(0, Math.trunc(detail.installmentCount));
                }
                return Array.isArray(detail.installmentAmounts) ? detail.installmentAmounts.length : 0;
            }
            if (defaultEventAllowPaymentPlans) {
                return defaultEventInstallmentCount || defaultEventInstallmentAmounts.length || 0;
            }
            return 0;
        })(),
    }));
    const fallbackPlayoffConfig = extractTournamentConfigFromEvent(event) ?? buildTournamentConfig();
    const normalizedPlayoffDivisionDetails: PlayoffDivisionDetailForm[] = Array.isArray((event as any).playoffDivisionDetails)
        ? (event as any).playoffDivisionDetails
            .map((entry: unknown) => normalizePlayoffDivisionDetailEntry(
                entry,
                event.$id,
                fallbackPlayoffConfig,
                resolvedSportInput,
                divisionReferenceDate,
            ))
            .filter((entry: PlayoffDivisionDetailForm | null): entry is PlayoffDivisionDetailForm => Boolean(entry))
        : [];
    const tournamentPoolPlayEnabled = isTournamentPoolPlayFormEnabled(
        event.eventType,
        Boolean((event as any).includePlayoffsOrPools ?? event.includePlayoffs),
    );
    const derivedTournamentPoolSettingsByBracketId = tournamentPoolPlayEnabled
        ? deriveTournamentPoolSettingsByBracketId(normalizedDivisionDetailsWithCapacity)
        : new Map<string, TournamentPoolSettings>();
    const tournamentPoolBracketDivisionDetails: DivisionDetailForm[] = tournamentPoolPlayEnabled
        ? normalizedPlayoffDivisionDetails
            .map((division) => {
                const bracketDivisionId = normalizeDivisionKeys([division.id])[0];
                const derivedPoolSettings = bracketDivisionId
                    ? derivedTournamentPoolSettingsByBracketId.get(bracketDivisionId)
                    : undefined;
                const poolCount = Number.isFinite(division.poolCount)
                    ? Math.max(1, Math.trunc(division.poolCount as number))
                    : derivedPoolSettings?.poolCount;
                const rawMaxParticipants = Number.isFinite(division.maxParticipants)
                    ? Math.max(2, Math.trunc(division.maxParticipants as number))
                    : Number.isFinite(event.maxParticipants)
                        ? Math.max(2, Math.trunc(event.maxParticipants as number))
                        : undefined;
                const maxParticipantsFromPools = typeof poolCount === 'number'
                    && typeof derivedPoolSettings?.poolTeamCount === 'number'
                    ? poolCount * derivedPoolSettings.poolTeamCount
                    : undefined;
                const maxParticipants = typeof maxParticipantsFromPools === 'number'
                    ? Math.max(rawMaxParticipants ?? 2, maxParticipantsFromPools)
                    : rawMaxParticipants;
                const poolTeamCount = derivePoolTeamCount(maxParticipants, poolCount)
                    ?? (Number.isFinite(division.poolTeamCount)
                        ? Math.max(1, Math.trunc(division.poolTeamCount as number))
                        : derivedPoolSettings?.poolTeamCount);
                return normalizeDivisionDetailEntry(
                    {
                        ...division,
                        kind: 'LEAGUE',
                        price: typeof division.price === 'number' ? division.price : event.price,
                        maxParticipants,
                        poolCount,
                        poolTeamCount,
                        allowPaymentPlans: typeof division.allowPaymentPlans === 'boolean'
                            ? division.allowPaymentPlans
                            : defaultEventAllowPaymentPlans,
                        installmentCount: typeof division.installmentCount === 'number'
                            ? division.installmentCount
                            : defaultEventInstallmentCount,
                        installmentDueDates: Array.isArray(division.installmentDueDates)
                            ? division.installmentDueDates
                            : defaultEventInstallmentDueDates,
                        installmentDueRelativeDays: Array.isArray(division.installmentDueRelativeDays)
                            ? division.installmentDueRelativeDays
                            : defaultEventInstallmentDueRelativeDays,
                        installmentAmounts: Array.isArray(division.installmentAmounts)
                            ? division.installmentAmounts
                            : defaultEventInstallmentAmounts,
                    },
                    event.$id,
                    resolvedSportInput,
                    divisionReferenceDate,
                );
            })
            .filter((entry: DivisionDetailForm | null): entry is DivisionDetailForm => Boolean(entry))
        : [];
    const formDivisionDetails: DivisionDetailForm[] = tournamentPoolBracketDivisionDetails.length
        ? tournamentPoolBracketDivisionDetails
        : normalizedDivisionDetailsWithCapacity;
    const finalDivisionIds = formDivisionDetails.map((detail) => detail.id);
    const splitLeaguePlayoffDivisions = event.eventType === 'LEAGUE'
        ? Boolean(
            event.splitLeaguePlayoffDivisions
            || (normalizedPlayoffDivisionDetails.length > 0 && normalizedDivisionDetailsWithCapacity.some((detail) => (
                Array.isArray(detail.playoffPlacementDivisionIds) && detail.playoffPlacementDivisionIds.length > 0
            ))),
        )
        : false;
    const officialSchedulingMode = normalizeOfficialSchedulingMode(event.officialSchedulingMode);
    const doTeamsOfficiate = officialSchedulingMode === 'TEAM_STAFFING' || Boolean(event.doTeamsOfficiate);

    const existingAffiliateUrl = event.affiliateUrl ?? '';
    const normalizedEventType = event.eventType === 'AFFILIATE' ? 'EVENT' : event.eventType;

    return {
    $id: event.$id,
    name: event.name,
    description: event.description ?? '',
    isAffiliateEvent: existingAffiliateUrl.trim().length > 0 || event.eventType === 'AFFILIATE',
    affiliateUrl: existingAffiliateUrl,
    tags: Array.isArray(event.tags) ? event.tags : [],
    location: event.location ?? '',
    address: event.address ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates as [number, number] : [0, 0],
    start: formatEventDateTimeForForm(event.start, eventTimeZone) || event.start,
    end: event.end ? (formatEventDateTimeForForm(event.end, eventTimeZone) || event.end) : '',
    timeZone: eventTimeZone,
    state: (event.state as EventState) ?? 'DRAFT',
    eventType: normalizedEventType,
    parentEvent: event.parentEvent || undefined,
    sportId: resolvedSportId,
    sportConfig: event.sport && typeof event.sport === 'object'
        ? { ...(event.sport as Sport) }
        : null,
    price: defaultEventPrice,
    taxHandling: normalizeEventTaxHandling(event.taxHandling),
    organizerManualTaxRateBps: normalizeOrganizerManualTaxRateBps(event.organizerManualTaxRateBps),
    minAge: Number.isFinite(event.minAge) ? event.minAge : undefined,
    maxAge: Number.isFinite(event.maxAge) ? event.maxAge : undefined,
    allowPaymentPlans: Boolean(event.allowPaymentPlans),
    installmentAmounts: normalizeInstallmentAmounts(event.installmentAmounts),
    installmentCount: (() => {
        const amounts = Array.isArray(event.installmentAmounts) ? event.installmentAmounts as number[] : [];
        return Number.isFinite(event.installmentCount) ? (event.installmentCount as number) : (amounts.length || 0);
    })(),
    installmentDueDates: Array.isArray(event.installmentDueDates) ? event.installmentDueDates as string[] : [],
    installmentDueRelativeDays: normalizeInstallmentRelativeDays((event as any).installmentDueRelativeDays),
    allowTeamSplitDefault: Boolean(event.allowTeamSplitDefault),
    maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : null,
    teamSizeLimit: Number.isFinite(event.teamSizeLimit) ? event.teamSizeLimit : null,
    teamSignup: Boolean(event.teamSignup),
    singleDivision: Boolean(event.singleDivision),
    splitLeaguePlayoffDivisions,
    registrationByDivisionType: Boolean(event.registrationByDivisionType),
    organizationId: event.organizationId || undefined,
    divisions: finalDivisionIds,
    divisionDetails: formDivisionDetails,
    playoffDivisionDetails: normalizedPlayoffDivisionDetails,
    divisionFieldIds: event.divisionFieldIds && typeof event.divisionFieldIds === 'object'
        ? Object.fromEntries(
            Object.entries(event.divisionFieldIds).map(([divisionKey, fieldIds]) => [
                String(divisionKey).toLowerCase(),
                Array.isArray(fieldIds)
                    ? Array.from(new Set(fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
                    : [],
            ]),
        )
        : {},
    selectedFieldIds: Array.isArray(event.fieldIds)
        ? Array.from(new Set(event.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
        : [],
    cancellationRefundHours: event.cancellationRefundHours != null && Number.isFinite(Number(event.cancellationRefundHours))
        ? Number(event.cancellationRefundHours)
        : null,
    registrationCutoffHours: event.registrationCutoffHours != null && Number.isFinite(Number(event.registrationCutoffHours))
        ? Number(event.registrationCutoffHours)
        : 2,
    hostId: event.hostId || undefined,
    noFixedEndDateTime: isSchedulableType ? derivedNoFixedEndDateTime : false,
    requiredTemplateIds: Array.isArray(event.requiredTemplateIds)
        ? event.requiredTemplateIds
        : [],
    imageId: event.imageId ?? '',
    seedColor: event.seedColor || 0,
    waitList: event.waitListIds || [],
    freeAgents: event.freeAgentIds || [],
    players: event.players || [],
    teams: event.teams || [],
    officials: event.officials || [],
    officialIds: normalizedOfficialIds,
    officialSchedulingMode,
    officialPositions: normalizedOfficialPositions,
    eventOfficials: normalizedEventOfficials,
    pendingStaffInvites: Array.isArray((event as { pendingStaffInvites?: PendingStaffInvite[] }).pendingStaffInvites)
        && (event as { pendingStaffInvites?: PendingStaffInvite[] }).pendingStaffInvites!.length > 0
        ? (event as { pendingStaffInvites?: PendingStaffInvite[] }).pendingStaffInvites!.map((invite) => ({
            firstName: invite.firstName ?? '',
            lastName: invite.lastName ?? '',
            email: invite.email ?? '',
            roles: Array.isArray(invite.roles) ? invite.roles.filter((role): role is StaffAssignmentRole => (
                role === 'OFFICIAL' || role === 'ASSISTANT_HOST'
            )) : [],
        }))
        : [],
    assistantHostIds: Array.isArray(event.assistantHostIds) ? event.assistantHostIds : [],
    doTeamsOfficiate,
    teamOfficialsMaySwap: doTeamsOfficiate && Boolean((event as any).teamOfficialsMaySwap),
    matchRulesOverride: sanitizeMatchRulesOverrideForEditor((event as any).matchRulesOverride),
    autoCreatePointMatchIncidents: Boolean((event as any).autoCreatePointMatchIncidents),
    leagueScoringConfig: createLeagueScoringConfig(
        typeof event.leagueScoringConfig === 'object'
            ? (event.leagueScoringConfig as Partial<LeagueScoringConfig>)
            : undefined
    ),
};
};
