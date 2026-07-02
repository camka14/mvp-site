import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { getSystemTimeZone, formatLocalDateTime, normalizeTimeZone, parseLocalDateTime } from '@/lib/dateUtils';
import { buildDivisionName, buildDivisionToken, getDivisionTypeById, inferDivisionDetails } from '@/lib/divisionTypes';
import { normalizeEntityId, sanitizeOrganizationEventAssignments } from '@/lib/organizationEventAccess';
import { getFieldOrganizationId } from '../externalRentalField';
import { resolveOrganizationEventFieldIds } from '../eventFieldSelection';
import { resolveDraftSportForScoring } from '../eventDraftSport';
import { resolveTournamentSetMode } from '../tournamentSetMode';
import type { Event, Field, Organization, Sport, Team, TimeSlot, UserData } from '@/types';
import { normalizePriceCents } from '@/lib/priceUtils';
import { normalizeOrganizerManualTaxRateBps, normalizeEventTaxHandling } from '@/lib/taxPolicy';
import {
    normalizeManualPaymentInstructions,
    normalizeManualPaymentLinks,
    normalizeRegistrationPaymentMode,
} from '@/lib/manualRegistrationPayments';
import {
    applyDivisionAgeCutoff,
    buildCompositeDivisionTypeId,
    buildSlotDivisionLookup,
    type DivisionDetailForm,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionDetailEntry,
    normalizeDivisionKeys,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionDetailEntry,
    normalizePlayoffDivisionParticipantCount,
    normalizeSlotDivisionIdsWithLookup,
    parseCompositeDivisionTypeId,
    type PlayoffDivisionDetailForm,
    resolveSportInput,
} from './divisionForm';
import {
    getEventOfficialUserIds,
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
    normalizeSportOfficialPositionTemplates,
} from './officials';
import { defaultFieldLocationForEvent, withEventFieldLocationDefault } from './fieldDefaults';
import { hasAffiliateUrl, isTournamentPoolPlayFormEnabled, supportsOrganizationFieldSelectionForEvent, supportsScheduleSlotsForEvent } from './eventRules';
import { isEventLocalField, toFieldIdList } from './resourceGroups';
import {
    buildDivisionLeagueConfig,
    derivePoolTeamCount,
    leagueConfigToDivisionFields,
    normalizeLeagueConfigForSetMode,
    normalizeNumber,
    normalizeTournamentConfigForSetMode,
} from './configDefaults';
import { normalizeInstallmentAmounts, normalizeInstallmentRelativeDays, sumInstallmentAmounts } from './paymentPlanHelpers';
import { parseDateValue } from './dateHelpers';
import { normalizeFieldIds, normalizeSlotFieldIds, normalizeWeekdays } from './slotForm';
import { normalizeSlotBoundaryOverrideForForm } from './slotConflictHelpers';
import type { EventFormValues } from './formTypes';
import type { RentalPurchaseContext } from './types';

type BuildEventDraftInput = {
    activeEditingEvent: Event | null;
    currentUser: UserData;
    fieldCount: number;
    fields: Field[];
    fieldsReferencedInSlots: Field[];
    hasImmutableTimeSlots: boolean;
    hasRestrictedImmutableFields: boolean;
    hasStripeAccount: boolean;
    immutableFields: Field[];
    immutableTimeSlots: TimeSlot[];
    isEditMode: boolean;
    isOrganizationHostedEvent: boolean;
    isOrganizationManagedEvent: boolean;
    joinAsParticipant: boolean;
    organizationHostedEventId: string;
    organizationOfficialsById: Map<string, UserData>;
    previousEventFieldLocation: string;
    rentalLockedSlotsForDraft: TimeSlot[];
    rentalPurchase?: RentalPurchaseContext;
    resolvedOrganization: Organization | null;
    selectedRentedFieldIds: string[];
    shouldManageLocalFields: boolean;
    shouldProvisionFields: boolean;
    source: EventFormValues;
    sportsById: Map<string, Sport>;
};

const minutesFromDate = (value: Date): number => value.getHours() * 60 + value.getMinutes();

const withMinutesOnDate = (date: Date, minutes: number): Date => {
    const normalizedMinutes = Math.max(0, Math.trunc(minutes));
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(normalizedMinutes / 60),
        normalizedMinutes % 60,
        0,
        0,
    );
};

export function buildEventDraft(input: BuildEventDraftInput): Partial<Event> {
    const {
        activeEditingEvent,
        currentUser,
        fieldCount,
        fields,
        fieldsReferencedInSlots,
        hasImmutableTimeSlots,
        hasRestrictedImmutableFields,
        hasStripeAccount,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        joinAsParticipant,
        organizationHostedEventId,
        previousEventFieldLocation,
        rentalLockedSlotsForDraft,
        rentalPurchase,
        resolvedOrganization,
        selectedRentedFieldIds,
        shouldManageLocalFields,
        shouldProvisionFields,
        source,
        sportsById,
        organizationOfficialsById,
    } = input;
        const finalImageId = source.imageId;
        const sportSelection = source.sportConfig;
        const selectedSportId = source.sportId?.trim() || '';
        const fallbackSportId = (sportSelection?.$id && String(sportSelection.$id)) || '';
        const sportId = selectedSportId || fallbackSportId;
        const resolvedSport = resolveDraftSportForScoring({
            sportId,
            sportConfig: sportSelection,
            sportsById,
        });
        const baseCoordinates: [number, number] = source.coordinates;
        const toIdList = <T extends { $id?: string | undefined }>(items: T[] | undefined): string[] => {
            if (!Array.isArray(items)) {
                return [];
            }
            return items
                .map((item) => {
                    if (item && typeof item === 'object' && item.$id) {
                        return String(item.$id);
                    }
                    return '';
                })
                .filter((id): id is string => id.length > 0);
        };

        const affiliateUrl = source.isAffiliateEvent ? source.affiliateUrl?.trim() ?? '' : '';
        const isAffiliateEvent = hasAffiliateUrl(affiliateUrl);
        const registrationPaymentMode = isAffiliateEvent
            ? 'ONLINE'
            : normalizeRegistrationPaymentMode(source.registrationPaymentMode);
        const manualPaymentEnabled = registrationPaymentMode === 'MANUAL';
        const pricingEnabled = hasStripeAccount || manualPaymentEnabled || isAffiliateEvent;
        const eventAllowPaymentPlans = !isAffiliateEvent && pricingEnabled ? Boolean(source.allowPaymentPlans) : false;
        const installmentAmountsCents = eventAllowPaymentPlans
            ? normalizeInstallmentAmounts(source.installmentAmounts)
            : [];
        let eventPriceCents = pricingEnabled
            ? (eventAllowPaymentPlans ? sumInstallmentAmounts(installmentAmountsCents) : normalizePriceCents(source.price))
            : 0;
        const minAge = normalizeNumber(source.minAge);
        const maxAge = normalizeNumber(source.maxAge);
        const sportInput = resolveSportInput(resolvedSport ?? sportId);
        const divisionReferenceDate = parseDateValue(source.start ?? null);
        const normalizedDivisionDetails = (() => {
            const fromDetails = Array.isArray(source.divisionDetails)
                ? source.divisionDetails
                    .map((entry) => normalizeDivisionDetailEntry(
                        entry,
                        source.$id,
                        sportInput,
                        divisionReferenceDate,
                    ))
                    .filter((entry): entry is DivisionDetailForm => Boolean(entry))
                : [];
            if (fromDetails.length) {
                return fromDetails;
            }
            const fromIds = normalizeDivisionKeys(source.divisions).map((divisionId) => {
                const inferred = inferDivisionDetails({
                    identifier: divisionId,
                    sportInput,
                });
                const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(sportInput);
                const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
                const skillDivisionTypeId = composite?.skillDivisionTypeId
                    ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
                const ageDivisionTypeId = composite?.ageDivisionTypeId
                    ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
                const skillDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    skillDivisionTypeId,
                    'SKILL',
                )?.name ?? defaultsForSport.skillDivisionTypeName;
                const ageDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    ageDivisionTypeId,
                    'AGE',
                )?.name ?? defaultsForSport.ageDivisionTypeName;
                const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
                const divisionTypeName = buildDivisionName({
                    gender: inferred.gender,
                    sportInput,
                    skillDivisionTypeId,
                    ageDivisionTypeId,
                });
                const token = buildDivisionToken({
                    gender: inferred.gender,
                    ratingType: 'SKILL',
                    divisionTypeId,
                });
                return applyDivisionAgeCutoff({
                    id: divisionId,
                    key: token,
                    kind: 'LEAGUE',
                    name: divisionTypeName,
                    divisionTypeId,
                    divisionTypeName,
                    ratingType: 'SKILL',
                    gender: inferred.gender,
                    skillDivisionTypeId,
                    skillDivisionTypeName,
                    ageDivisionTypeId,
                    ageDivisionTypeName,
                    price: eventPriceCents,
                    maxParticipants: Math.max(2, Math.trunc(source.maxParticipants || 2)),
                    playoffTeamCount: Number.isFinite(source.leagueData?.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined,
                    playoffPlacementDivisionIds: [],
                    allowPaymentPlans: eventAllowPaymentPlans,
                    installmentCount: eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0,
                    installmentDueDates: eventAllowPaymentPlans && !(source.eventType === 'WEEKLY_EVENT' && !source.parentEvent)
                        ? [...(source.installmentDueDates || [])]
                        : [],
                    installmentDueRelativeDays: eventAllowPaymentPlans && source.eventType === 'WEEKLY_EVENT' && !source.parentEvent
                        ? normalizeInstallmentRelativeDays(source.installmentDueRelativeDays)
                        : [],
                    installmentAmounts: eventAllowPaymentPlans
                        ? normalizeInstallmentAmounts(source.installmentAmounts)
                        : [],
                    sportId: sportInput || undefined,
                    fieldIds: [],
                } satisfies DivisionDetailForm, sportInput, divisionReferenceDate);
            });
            if (fromIds.length) {
                return fromIds;
            }
            return [];
        })();
        const normalizedDivisionKeys = (() => {
            const normalized = normalizeDivisionKeys(normalizedDivisionDetails.map((detail) => detail.id));
            if (normalized.length) {
                return normalized;
            }
            return normalizeDivisionKeys(source.divisions);
        })();
        const sportRequiresSets = Boolean(resolvedSport?.usePointsPerSetWin);
        const tournamentRequiresSets = resolveTournamentSetMode(
            sportRequiresSets,
            source.tournamentData,
        );
        const playoffRequiresSets = resolveTournamentSetMode(
            sportRequiresSets,
            source.playoffData,
        );
        const splitLeaguePlayoffDivisions = Boolean(
            source.eventType === 'LEAGUE'
            && source.leagueData.includePlayoffs
            && source.splitLeaguePlayoffDivisions,
        );
        const tournamentPoolPlayEnabled = isTournamentPoolPlayFormEnabled(
            source.eventType,
            Boolean(source.leagueData.includePlayoffs),
        );
        if (isAffiliateEvent && normalizedDivisionDetails.length) {
            eventPriceCents = Math.min(
                ...normalizedDivisionDetails.map((detail) => normalizePriceCents(detail.price)),
            );
        }
        const singleDivisionEnabled = Boolean(source.singleDivision);
        const useEventLevelDivisionDefaults = singleDivisionEnabled && !isAffiliateEvent;
        const tournamentBracketConfig = normalizeTournamentConfigForSetMode(
            source.tournamentData,
            tournamentRequiresSets,
        );
        const normalizedTournamentPoolBracketDetails: PlayoffDivisionDetailForm[] = tournamentPoolPlayEnabled
            ? normalizedDivisionDetails.map((detail) => {
                const maxParticipants = singleDivisionEnabled
                    ? Math.max(2, Math.trunc(source.maxParticipants || detail.maxParticipants || 2))
                    : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2));
                const poolCount = Number.isFinite(detail.poolCount)
                    ? Math.max(1, Math.trunc(detail.poolCount as number))
                    : undefined;
                return {
                    ...detail,
                    kind: 'PLAYOFF' as const,
                    maxParticipants,
                    playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                        ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                        : undefined,
                    poolCount,
                    poolTeamCount: derivePoolTeamCount(maxParticipants, poolCount),
                    playoffPlacementDivisionIds: [],
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? tournamentBracketConfig,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? tournamentBracketConfig,
                        ),
                    ),
                };
            })
            : [];
        const normalizedPlayoffDivisionDetails = splitLeaguePlayoffDivisions
            ? (source.playoffDivisionDetails || [])
                .map((entry) => normalizePlayoffDivisionDetailEntry(
                    entry,
                    source.$id,
                    source.playoffData,
                    sportInput,
                    divisionReferenceDate,
                ))
                .filter((entry): entry is PlayoffDivisionDetailForm => Boolean(entry))
            : tournamentPoolPlayEnabled
                ? normalizedTournamentPoolBracketDetails
            : [];
        const slotDivisionLookupForDraft = buildSlotDivisionLookup(
            normalizedDivisionDetails,
            splitLeaguePlayoffDivisions ? normalizedPlayoffDivisionDetails : [],
        );
        const normalizedDivisionDetailsForPayload = normalizedDivisionDetails.map((detail) => ({
            ...detail,
            kind: 'LEAGUE' as const,
            price: pricingEnabled
                ? (
                    useEventLevelDivisionDefaults
                        ? eventPriceCents
                        : Boolean(detail.allowPaymentPlans)
                            ? sumInstallmentAmounts(detail.installmentAmounts)
                            : normalizePriceCents(detail.price)
                )
                : 0,
            maxParticipants: useEventLevelDivisionDefaults
                ? Math.max(2, Math.trunc(source.maxParticipants || 2))
                : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2)),
            playoffTeamCount: (() => {
                if (source.eventType !== 'LEAGUE' || !source.leagueData.includePlayoffs) {
                    return undefined;
                }
                if (singleDivisionEnabled && !splitLeaguePlayoffDivisions) {
                    return Number.isFinite(source.leagueData.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined;
                }
                return Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined;
            })(),
            playoffPlacementDivisionIds: (() => {
                if (!splitLeaguePlayoffDivisions) {
                    return [] as string[];
                }
                const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                    : 0;
                const mapping = normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds);
                if (playoffTeamCount <= 0) {
                    return mapping;
                }
                return mapping.slice(0, playoffTeamCount);
            })(),
            ...((source.eventType === 'LEAGUE' || (source.eventType === 'TOURNAMENT' && source.leagueData.includePlayoffs))
                ? leagueConfigToDivisionFields(
                    singleDivisionEnabled
                        ? normalizeLeagueConfigForSetMode(source.leagueData, sportRequiresSets)
                        : buildDivisionLeagueConfig(detail, source.leagueData, sportRequiresSets),
                )
                : {}),
            ...(source.eventType === 'LEAGUE'
                && source.leagueData.includePlayoffs
                && !singleDivisionEnabled
                && !splitLeaguePlayoffDivisions
                ? {
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? source.playoffData,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? source.playoffData,
                        ),
                    ),
                }
                : {}),
            ...(source.eventType === 'TOURNAMENT' && !singleDivisionEnabled
                ? {
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? source.tournamentData,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? source.tournamentData,
                        ),
                    ),
                }
                : {}),
            allowPaymentPlans: pricingEnabled
                ? (
                    useEventLevelDivisionDefaults
                        ? eventAllowPaymentPlans
                        : !isAffiliateEvent && Boolean(detail.allowPaymentPlans)
                )
                : false,
            installmentCount: (() => {
                if (!pricingEnabled) {
                    return 0;
                }
                if (useEventLevelDivisionDefaults) {
                    return eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0;
                }
                if (isAffiliateEvent || !detail.allowPaymentPlans) {
                    return 0;
                }
                return detail.installmentCount || detail.installmentAmounts.length || 0;
            })(),
            installmentAmounts: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (useEventLevelDivisionDefaults) {
                    return eventAllowPaymentPlans
                        ? normalizeInstallmentAmounts(source.installmentAmounts)
                        : [];
                }
                if (isAffiliateEvent || !detail.allowPaymentPlans) {
                    return [];
                }
                return normalizeInstallmentAmounts(detail.installmentAmounts);
            })(),
            installmentDueDates: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (useEventLevelDivisionDefaults) {
                    return eventAllowPaymentPlans ? [...(source.installmentDueDates || [])] : [];
                }
                if (isAffiliateEvent || !detail.allowPaymentPlans) {
                    return [];
                }
                return Array.isArray(detail.installmentDueDates) ? [...detail.installmentDueDates] : [];
            })(),
        }));

        const organizationAssignments = isOrganizationHostedEvent
            ? sanitizeOrganizationEventAssignments(
                {
                    hostId: source.hostId || currentUser?.$id || null,
                    assistantHostIds: source.assistantHostIds || [],
                    officialIds: getEventOfficialUserIds(source.eventOfficials),
                },
                {
                    ownerId: resolvedOrganization?.ownerId,
                    staffMembers: resolvedOrganization?.staffMembers,
                    staffInvites: resolvedOrganization?.staffInvites,
                },
            )
            : null;
        const normalizedHostId = (
            organizationAssignments?.hostId
            || normalizeEntityId(source.hostId)
            || normalizeEntityId(currentUser?.$id)
            || ''
        );
        const normalizedAssistantHostIds = organizationAssignments
            ? organizationAssignments.assistantHostIds
            : Array.from(
                new Set(
                    (source.assistantHostIds || [])
                        .map((id) => String(id))
                    .filter((id) => id.length > 0 && id !== normalizedHostId),
                ),
            );
        const normalizedOfficialPositionsForPayload = normalizeEventOfficialPositions(
            source.officialPositions,
            normalizeSportOfficialPositionTemplates(resolvedSport?.officialPositionTemplates),
        );
        const normalizedEventOfficials = normalizeEventOfficials(
            source.eventOfficials,
            Array.isArray(source.eventOfficials) ? [] : source.officialIds || [],
            normalizedOfficialPositionsForPayload,
        ).filter((official) => (
            organizationAssignments ? organizationAssignments.officialIds.includes(official.userId) : true
        ));
        const normalizedOfficialIds = getEventOfficialUserIds(normalizedEventOfficials);
        const officialPoolById = new Map<string, UserData>();
        (source.officials || []).forEach((official) => {
            if (official?.$id) {
                officialPoolById.set(official.$id, official);
            }
        });
        if (isOrganizationHostedEvent) {
            organizationOfficialsById.forEach((official, id) => {
                officialPoolById.set(id, official);
            });
        }
        const normalizedOfficials = normalizedOfficialIds
            .map((id) => officialPoolById.get(id))
            .filter((official): official is UserData => Boolean(official));
        const normalizedEnd = (() => {
            if (typeof source.end === 'string') {
                const trimmed = source.end.trim();
                return trimmed.length > 0 ? trimmed : null;
            }
            return source.end ?? null;
        })();
        const eventFieldLocation = defaultFieldLocationForEvent(source.location);

        const draft: Partial<Event> = {
            $id: activeEditingEvent?.$id,
            hostId: normalizedHostId,
            name: (source.name ?? '').trim(),
            description: source.description,
            affiliateUrl: source.isAffiliateEvent ? affiliateUrl : '',
            tags: Array.isArray(source.tags) ? source.tags : [],
            location: source.location,
            address: source.address?.trim() || undefined,
            start: source.start,
            end: normalizedEnd,
            timeZone: normalizeTimeZone(source.timeZone, getSystemTimeZone()),
            eventType: source.eventType,
            parentEvent: source.parentEvent || undefined,
            noFixedEndDateTime: !isAffiliateEvent && supportsScheduleSlotsForEvent(source.eventType, source.parentEvent)
                ? Boolean(source.noFixedEndDateTime)
                : false,
            state: isEditMode ? activeEditingEvent?.state ?? 'PUBLISHED' : 'UNPUBLISHED',
            sportId: sportId || undefined,
            price: eventPriceCents,
            registrationPaymentMode,
            manualPaymentLinks: manualPaymentEnabled ? normalizeManualPaymentLinks(source.manualPaymentLinks) : [],
            manualPaymentInstructions: manualPaymentEnabled
                ? normalizeManualPaymentInstructions(source.manualPaymentInstructions) ?? null
                : null,
            taxHandling: isAffiliateEvent ? 'INHERIT_ORG' : normalizeEventTaxHandling(source.taxHandling),
            organizerManualTaxRateBps: isAffiliateEvent ? 0 : normalizeOrganizerManualTaxRateBps(source.organizerManualTaxRateBps),
            minAge,
            maxAge,
            allowPaymentPlans: eventAllowPaymentPlans,
            installmentCount: eventAllowPaymentPlans
                ? source.installmentCount || installmentAmountsCents.length || 0
                : undefined,
            installmentAmounts: eventAllowPaymentPlans ? installmentAmountsCents : [],
            installmentDueDates: eventAllowPaymentPlans ? source.installmentDueDates : [],
            allowTeamSplitDefault: isAffiliateEvent ? false : source.allowTeamSplitDefault,
            maxParticipants: source.maxParticipants ?? undefined,
            teamSizeLimit: source.teamSizeLimit ?? undefined,
            teamSignup: isAffiliateEvent ? false : source.teamSignup,
            singleDivision: source.singleDivision,
            splitLeaguePlayoffDivisions: isAffiliateEvent ? false : splitLeaguePlayoffDivisions,
            registrationByDivisionType: isAffiliateEvent ? false : source.registrationByDivisionType,
            divisions: normalizedDivisionKeys,
            divisionDetails: (tournamentPoolPlayEnabled ? [] : normalizedDivisionDetailsForPayload).map((detail) => ({
                ...detail,
                price: normalizePriceCents(detail.price),
                maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || 2)),
                playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(detail.allowPaymentPlans),
                installmentCount: detail.allowPaymentPlans
                    ? (detail.installmentCount || detail.installmentAmounts.length || 0)
                    : 0,
                installmentAmounts: detail.allowPaymentPlans
                    ? normalizeInstallmentAmounts(detail.installmentAmounts)
                    : [],
                installmentDueDates: detail.allowPaymentPlans
                    ? (Array.isArray(detail.installmentDueDates)
                        ? detail.installmentDueDates
                        : [])
                    : [],
            })),
            playoffDivisionDetails: (isAffiliateEvent ? [] : normalizedPlayoffDivisionDetails).map((division) => ({
                id: division.id,
                key: division.key,
                kind: 'PLAYOFF' as const,
                name: division.name,
                divisionTypeId: division.divisionTypeId,
                divisionTypeName: division.divisionTypeName,
                ratingType: division.ratingType,
                gender: division.gender,
                sportId: division.sportId,
                price: Number.isFinite(division.price)
                    ? normalizePriceCents(division.price as number)
                    : undefined,
                maxParticipants: normalizePlayoffDivisionParticipantCount(division.maxParticipants) ?? undefined,
                playoffTeamCount: Number.isFinite(division.playoffTeamCount)
                    ? Math.max(2, Math.trunc(division.playoffTeamCount as number))
                    : undefined,
                poolCount: Number.isFinite(division.poolCount)
                    ? Math.max(1, Math.trunc(division.poolCount as number))
                    : undefined,
                poolTeamCount: Number.isFinite(division.poolTeamCount)
                    ? Math.max(1, Math.trunc(division.poolTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(division.allowPaymentPlans),
                installmentCount: division.allowPaymentPlans
                    ? (division.installmentCount || division.installmentAmounts?.length || 0)
                    : 0,
                installmentAmounts: division.allowPaymentPlans
                    ? normalizeInstallmentAmounts(division.installmentAmounts)
                    : [],
                installmentDueDates: division.allowPaymentPlans && Array.isArray(division.installmentDueDates)
                    ? division.installmentDueDates
                    : [],
                installmentDueRelativeDays: division.allowPaymentPlans
                    ? normalizeInstallmentRelativeDays(division.installmentDueRelativeDays)
                    : [],
                playoffConfig: normalizeTournamentConfigForSetMode(
                    division.playoffConfig,
                    resolveTournamentSetMode(
                        sportRequiresSets,
                        division.playoffConfig,
                    ),
                ),
            })),
            cancellationRefundHours: source.cancellationRefundHours,
            registrationCutoffHours: source.registrationCutoffHours,
            requiredTemplateIds: isAffiliateEvent ? [] : source.requiredTemplateIds,
            imageId: finalImageId,
            seedColor: source.seedColor,
            waitListIds: source.waitList,
            freeAgentIds: source.freeAgents,
            teams: source.teams,
            players: source.players,
            officials: isAffiliateEvent ? [] : normalizedOfficials,
            officialIds: isAffiliateEvent ? [] : normalizedOfficialIds,
            officialSchedulingMode: isAffiliateEvent ? 'OFF' : normalizeOfficialSchedulingMode(source.officialSchedulingMode),
            officialPositions: isAffiliateEvent ? [] : normalizedOfficialPositionsForPayload,
            eventOfficials: isAffiliateEvent ? [] : normalizedEventOfficials,
            assistantHostIds: isAffiliateEvent ? [] : normalizedAssistantHostIds,
            doTeamsOfficiate: isAffiliateEvent ? false : source.doTeamsOfficiate,
            teamOfficialsMaySwap: isAffiliateEvent ? false : source.doTeamsOfficiate ? Boolean(source.teamOfficialsMaySwap) : false,
            teamCheckInMode: isAffiliateEvent || !source.teamSignup ? 'OFF' : source.teamCheckInMode,
            teamCheckInOpenMinutesBefore: Number.isFinite(Number(source.teamCheckInOpenMinutesBefore))
                ? Math.max(0, Math.trunc(Number(source.teamCheckInOpenMinutesBefore)))
                : 60,
            allowMatchRosterEdits: isAffiliateEvent || !source.teamSignup ? false : Boolean(source.allowMatchRosterEdits),
            allowTemporaryMatchPlayers:
                isAffiliateEvent || !source.teamSignup || !source.allowMatchRosterEdits
                    ? false
                    : Boolean(source.allowTemporaryMatchPlayers),
            matchRulesOverride: isAffiliateEvent ? null : source.matchRulesOverride ?? null,
            autoCreatePointMatchIncidents: isAffiliateEvent ? false : Boolean(source.autoCreatePointMatchIncidents),
            coordinates: baseCoordinates,
        };

        const organizationId = source.organizationId || organizationHostedEventId || undefined;
        const sourceFields = hasRestrictedImmutableFields ? immutableFields : fields;
        const organizationFieldIds = organizationHostedEventId
            ? toFieldIdList(sourceFields.filter((field) => getFieldOrganizationId(field) === organizationHostedEventId))
            : [];
        const selectedOrganizationFieldIds = isOrganizationHostedEvent && supportsOrganizationFieldSelectionForEvent(
            source.eventType,
            source.parentEvent,
        )
            ? resolveOrganizationEventFieldIds(source.selectedFieldIds, organizationFieldIds)
            : [];

        if (!shouldManageLocalFields) {
            let fieldsToInclude = fieldsReferencedInSlots;
            if (!fieldsToInclude.length && hasRestrictedImmutableFields) {
                fieldsToInclude = immutableFields;
            }
            if (isOrganizationManagedEvent) {
                const defaultOrganizationFieldIds = toIdList(fields.length ? fields : fieldsToInclude);
                const fieldIds = supportsOrganizationFieldSelectionForEvent(source.eventType, source.parentEvent)
                    ? resolveOrganizationEventFieldIds(source.selectedFieldIds, defaultOrganizationFieldIds)
                    : toIdList(fieldsToInclude);
                selectedRentedFieldIds.forEach((fieldId) => {
                    if (!fieldIds.includes(fieldId)) {
                        fieldIds.push(fieldId);
                    }
                });
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            } else if (fieldsToInclude.length) {
                draft.fields = fieldsToInclude.map(field => withEventFieldLocationDefault(
                    { ...field },
                    eventFieldLocation,
                    previousEventFieldLocation,
                ));
                const fieldIds = toIdList(fieldsToInclude);
                selectedRentedFieldIds.forEach((fieldId) => {
                    if (!fieldIds.includes(fieldId)) {
                        fieldIds.push(fieldId);
                    }
                });
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            }
            if ((!draft.fieldIds || draft.fieldIds.length === 0) && rentalPurchase?.fieldId) {
                draft.fieldIds = [rentalPurchase.fieldId];
            } else if ((!draft.fieldIds || draft.fieldIds.length === 0) && selectedRentedFieldIds.length) {
                draft.fieldIds = selectedRentedFieldIds;
            }
        } else {
            const localFields = sourceFields.filter(isEventLocalField);
            if (localFields.length) {
                draft.fields = localFields.map((field) => withEventFieldLocationDefault(
                    { ...field },
                    eventFieldLocation,
                    previousEventFieldLocation,
                ));
            }
            const fieldIds = Array.from(new Set([
                ...selectedOrganizationFieldIds,
                ...selectedRentedFieldIds,
                ...toIdList(localFields),
            ]));
            if (fieldIds.length) {
                draft.fieldIds = fieldIds;
            }
        }

        const normalizedFieldIds = Array.isArray(draft.fieldIds)
            ? Array.from(new Set(draft.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
            : [];
        if (normalizedFieldIds.length) {
            draft.fieldIds = normalizedFieldIds;
        }
        delete (draft as Partial<Event>).divisionFieldIds;

        if (organizationId) {
            draft.organizationId = organizationId;
        }

        if (!isEditMode) {
            if (currentUser?.$id) {
                draft.hostId = currentUser.$id;
            }
            draft.waitListIds = [];
            draft.freeAgentIds = [];
            draft.players = joinAsParticipant && currentUser ? [currentUser] : [];
            draft.userIds = joinAsParticipant && currentUser?.$id ? [currentUser.$id] : [];
            if (shouldProvisionFields) {
                draft.fieldCount = fieldCount;
            }
        }

        if (hasImmutableTimeSlots) {
            draft.timeSlots = immutableTimeSlots.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : slotDivisions,
                };
            });
            const slotIds = toIdList(immutableTimeSlots);
            if (slotIds.length) {
                draft.timeSlotIds = slotIds;
            }
        }

        const teamIds = toIdList(draft.teams as Team[] | undefined);
        if (teamIds.length) {
            draft.teamIds = teamIds;
        }

        const userIds = toIdList(draft.players as UserData[] | undefined);
        if (userIds.length && !draft.userIds?.length) {
            draft.userIds = userIds;
        }

        const sourceUsesStandingsScoring = source.eventType === 'LEAGUE'
            || isTournamentPoolPlayFormEnabled(source.eventType, Boolean(source.leagueData.includePlayoffs));

        if (sourceUsesStandingsScoring) {
            if (source.leagueScoringConfig?.$id) {
                draft.leagueScoringConfigId = source.leagueScoringConfig.$id;
            }
            if (source.leagueScoringConfig) {
                draft.leagueScoringConfig = source.leagueScoringConfig;
            }
        } else {
            draft.leagueScoringConfigId = undefined;
            draft.leagueScoringConfig = undefined;
        }

        if (source.eventType === 'LEAGUE') {
            const restTime = normalizeNumber(source.leagueData.restTimeMinutes);
            const setsPerMatchValue = source.leagueData.setsPerMatch ?? 1;
            const normalizedPoints = sportRequiresSets
                ? (() => {
                    const base = Array.isArray(source.leagueData.pointsToVictory)
                        ? source.leagueData.pointsToVictory.slice(0, setsPerMatchValue)
                    : [];
                    while (base.length < setsPerMatchValue) base.push(21);
                    return base;
                })()
                : undefined;

            draft.gamesPerOpponent = source.leagueData.gamesPerOpponent;
            draft.includePlayoffs = source.leagueData.includePlayoffs;
            (draft as any).includePlayoffsOrPools = source.leagueData.includePlayoffs;
            draft.playoffTeamCount = source.leagueData.includePlayoffs
                ? (Number.isFinite(source.leagueData.playoffTeamCount)
                    ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                    : undefined)
                : undefined;

            if (sportRequiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(source.leagueData.setDurationMinutes);
                draft.setsPerMatch = setsPerMatchValue;
                draft.pointsToVictory = normalizedPoints;
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(source.leagueData.matchDurationMinutes);
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            }

            if (source.leagueData.includePlayoffs && source.playoffData && !splitLeaguePlayoffDivisions) {
                const normalizedPlayoffConfig = normalizeTournamentConfigForSetMode(
                    source.playoffData,
                    playoffRequiresSets,
                );
                draft.doubleElimination = normalizedPlayoffConfig.doubleElimination;
                draft.winnerSetCount = normalizedPlayoffConfig.winnerSetCount;
                draft.loserSetCount = normalizedPlayoffConfig.loserSetCount;
                draft.winnerBracketPointsToVictory = normalizedPlayoffConfig.winnerBracketPointsToVictory;
                draft.loserBracketPointsToVictory = normalizedPlayoffConfig.loserBracketPointsToVictory;
                draft.restTimeMinutes = normalizeNumber(normalizedPlayoffConfig.restTimeMinutes, 0) ?? 0;
            }

        }

        if (source.eventType === 'TOURNAMENT') {
            const normalizedTournamentConfig = normalizeTournamentConfigForSetMode(
                source.tournamentData,
                tournamentRequiresSets,
            );
            draft.includePlayoffs = Boolean(source.leagueData.includePlayoffs);
            (draft as any).includePlayoffsOrPools = Boolean(source.leagueData.includePlayoffs);
            draft.playoffTeamCount = undefined;
            draft.doubleElimination = normalizedTournamentConfig.doubleElimination;
            draft.winnerSetCount = normalizedTournamentConfig.winnerSetCount;
            draft.loserSetCount = normalizedTournamentConfig.loserSetCount;
            draft.winnerBracketPointsToVictory = normalizedTournamentConfig.winnerBracketPointsToVictory;
            draft.loserBracketPointsToVictory = normalizedTournamentConfig.loserBracketPointsToVictory;
            draft.prize = normalizedTournamentConfig.prize;
            draft.fieldCount = fieldCount;
            draft.restTimeMinutes = normalizeNumber(normalizedTournamentConfig.restTimeMinutes, 0) ?? 0;
            if (tournamentRequiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(normalizedTournamentConfig.setDurationMinutes);
                draft.matchDurationMinutes = undefined;
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(normalizedTournamentConfig.matchDurationMinutes);
                draft.setDurationMinutes = undefined;
            }
        }

        if (!isAffiliateEvent && !hasImmutableTimeSlots && supportsScheduleSlotsForEvent(source.eventType, source.parentEvent)) {
            const rentalLockedSlotDocuments = rentalLockedSlotsForDraft.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : slotDivisions,
                };
            });
            const editableSlotDocuments = source.leagueSlots
                .filter((slot) => {
                    if (!normalizeSlotFieldIds(slot).length) {
                        return false;
                    }
                    if (slot.repeating === false) {
                        const slotStart = parseLocalDateTime(slot.startDate ?? null);
                        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                        return Boolean(slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime());
                    }
                    return normalizeWeekdays(slot).length > 0
                        && typeof slot.startTimeMinutes === 'number'
                        && typeof slot.endTimeMinutes === 'number';
                })
                .map((slot) => {
                    const slotId = slot.$id || slot.key;
                    const repeating = slot.repeating !== false;
                    const slotTimeZone = normalizeTimeZone(slot.timeZone, source.timeZone);
                    const slotFieldIds = normalizeSlotFieldIds(slot);
                    const slotDivisionKeys = normalizeSlotDivisionIdsWithLookup(
                        slot.divisions,
                        slotDivisionLookupForDraft,
                    );
                    const explicitStart = parseLocalDateTime(slot.startDate ?? null);
                    const explicitEnd = parseLocalDateTime(slot.endDate ?? null);
                    const fallbackStart = parseLocalDateTime(source.start ?? null);
                    const nonRepeatingDay = explicitStart
                        ? ((explicitStart.getDay() + 6) % 7)
                        : fallbackStart
                            ? ((fallbackStart.getDay() + 6) % 7)
                            : 0;
                    const normalizedDays = repeating
                        ? normalizeWeekdays(slot)
                        : [nonRepeatingDay];
                    const startTimeMinutes = repeating
                        ? Number(slot.startTimeMinutes)
                        : (typeof slot.startTimeMinutes === 'number' && Number.isFinite(slot.startTimeMinutes)
                            ? Number(slot.startTimeMinutes)
                            : explicitStart
                                ? minutesFromDate(explicitStart)
                                : Number(slot.startTimeMinutes));
                    const endTimeMinutes = repeating
                        ? Number(slot.endTimeMinutes)
                        : (typeof slot.endTimeMinutes === 'number' && Number.isFinite(slot.endTimeMinutes)
                            ? Number(slot.endTimeMinutes)
                            : explicitEnd
                                ? minutesFromDate(explicitEnd)
                                : Number(slot.endTimeMinutes));
                    const serialized: TimeSlot = {
                        $id: slotId,
                        dayOfWeek: normalizedDays[0] as TimeSlot['dayOfWeek'],
                        daysOfWeek: normalizedDays as TimeSlot['daysOfWeek'],
                        scheduledFieldId: slotFieldIds[0],
                        scheduledFieldIds: slotFieldIds,
                        divisions: singleDivisionEnabled
                            ? normalizedDivisionKeys
                            : slotDivisionKeys,
                        timeZone: slotTimeZone,
                        startTimeMinutes,
                        endTimeMinutes,
                        repeating,
                        price: typeof slot.price === 'number' && Number.isFinite(slot.price) ? slot.price : undefined,
                        requiredTemplateIds: normalizeFieldIds(slot.requiredTemplateIds),
                        hostRequiredTemplateIds: normalizeFieldIds(slot.hostRequiredTemplateIds),
                        sourceType: typeof slot.sourceType === 'string' && slot.sourceType.trim().length > 0
                            ? slot.sourceType
                            : (slot.rentalLocked ? 'RENTAL_BOOKING' : undefined),
                        rentalBookingId: typeof slot.rentalBookingId === 'string' && slot.rentalBookingId.trim().length > 0
                            ? slot.rentalBookingId
                            : undefined,
                        rentalBookingItemId: typeof slot.rentalBookingItemId === 'string' && slot.rentalBookingItemId.trim().length > 0
                            ? slot.rentalBookingItemId
                            : undefined,
                        rentalLocked: Boolean(slot.rentalLocked),
                    };

                    if (!repeating) {
                        if (explicitStart) {
                            const normalizedSlotStart = Number.isFinite(startTimeMinutes)
                                ? withMinutesOnDate(explicitStart, startTimeMinutes)
                                : explicitStart;
                            serialized.startDate = formatLocalDateTime(normalizedSlotStart);
                        }
                        if (explicitEnd) {
                            const normalizedSlotEnd = Number.isFinite(endTimeMinutes)
                                ? withMinutesOnDate(explicitEnd, endTimeMinutes)
                                : explicitEnd;
                            serialized.endDate = formatLocalDateTime(normalizedSlotEnd);
                        }
                    } else {
                        const slotStartDateOverride = normalizeSlotBoundaryOverrideForForm(
                            slot.startDate ?? null,
                            activeEditingEvent?.start ?? null,
                            slotTimeZone,
                        );
                        if (slotStartDateOverride) {
                            serialized.startDate = slotStartDateOverride;
                        } else if (source.start) {
                            serialized.startDate = source.start;
                        }
                        // Open-ended scheduling should not force recurring slot end bounds.
                        if (!source.noFixedEndDateTime && source.end) {
                            serialized.endDate = source.end;
                        }
                    }

                    return serialized;
                });
            const editableSlotIds = new Set(
                editableSlotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id.trim() : ''))
                    .filter((slotId) => slotId.length > 0),
            );
            const retainedRentalLockedSlotDocuments = rentalLockedSlotDocuments.filter((slot) => {
                const slotId = typeof slot.$id === 'string' ? slot.$id.trim() : '';
                return !slotId || !editableSlotIds.has(slotId);
            });
            const slotDocumentsByKey = new Map<string, TimeSlot>();
            [...retainedRentalLockedSlotDocuments, ...editableSlotDocuments].forEach((slot) => {
                const key = slot.rentalBookingItemId
                    || slot.$id
                    || `${normalizeSlotFieldIds(slot).join(',')}:${slot.startDate ?? ''}:${slot.endDate ?? ''}:${slot.startTimeMinutes ?? ''}:${slot.endTimeMinutes ?? ''}`;
                slotDocumentsByKey.set(key, slot);
            });
            const slotDocuments = Array.from(slotDocumentsByKey.values());

            if (slotDocuments.length) {
                draft.timeSlots = slotDocuments;
                const explicitSlotWindows = slotDocuments
                    .filter((slot) => slot.repeating === false)
                    .map((slot) => ({
                        start: parseLocalDateTime(slot.startDate ?? null),
                        end: parseLocalDateTime(slot.endDate ?? null),
                    }))
                    .filter((window): window is { start: Date; end: Date } => (
                        Boolean(window.start && window.end && window.end.getTime() > window.start.getTime())
                    ));
                if (explicitSlotWindows.length) {
                    const earliestStart = explicitSlotWindows.reduce((earliest, window) => (
                        window.start.getTime() < earliest.getTime() ? window.start : earliest
                    ), explicitSlotWindows[0].start);
                    const latestEnd = explicitSlotWindows.reduce((latest, window) => (
                        window.end.getTime() > latest.getTime() ? window.end : latest
                    ), explicitSlotWindows[0].end);
                    draft.start = formatLocalDateTime(earliestStart);
                    draft.end = formatLocalDateTime(latestEnd);
                }
                const slotIds = slotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id : null))
                    .filter((id): id is string => Boolean(id));
                if (slotIds.length) {
                    draft.timeSlotIds = slotIds;
                }
                const slotFieldIds = Array.from(
                    new Set(
                        slotDocuments.flatMap((slot) => normalizeSlotFieldIds(slot)),
                    ),
                );
                if (slotFieldIds.length) {
                    draft.fieldIds = slotFieldIds;
                }
            }
        }

        return draft;

}
