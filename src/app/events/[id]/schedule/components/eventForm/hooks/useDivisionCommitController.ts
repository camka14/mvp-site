import { useCallback } from 'react';
import type {
    Dispatch,
    SetStateAction,
} from 'react';

import {
    buildDivisionName,
    buildDivisionToken,
    getDivisionTypeById,
} from '@/lib/divisionTypes';
import type {
    LeagueConfig,
    TournamentConfig,
} from '@/types';

import { resolveTournamentSetMode } from '../../tournamentSetMode';
import {
    buildTournamentConfig,
    derivePoolTeamCount,
    leagueConfigToDivisionFields,
    normalizeLeagueConfigForSetMode,
    normalizeTournamentConfigForSetMode,
} from '../configDefaults';
import { parseDateValue } from '../dateHelpers';
import {
    applyDivisionAgeCutoff,
    buildCompositeDivisionTypeId,
    buildUniqueDivisionIdForToken,
    normalizeDivisionNameKey,
    normalizeDivisionTokenPart,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionParticipantCount,
    resolveSportInput,
    type DivisionDetailForm,
    type DivisionEditorState,
    type DivisionTypeOption,
    type PlayoffDivisionDetailForm,
} from '../divisionForm';
import type { EventFormValues } from '../formTypes';
import {
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
    sumInstallmentAmounts,
} from '../paymentPlanHelpers';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormGetValues = (name: string) => unknown;

type LeagueDataSetter = (
    updater: SetStateAction<LeagueConfig>,
    options?: Record<string, unknown>,
) => void;

type UseDivisionCommitControllerParams = {
    createNextPlayoffDivision: (
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ) => PlayoffDivisionDetailForm;
    currentSportRequiresSets: boolean;
    defaultDivisionTypeSelections: {
        ageDivisionTypeId: string;
        skillDivisionTypeId: string;
    };
    divisionEditor: DivisionEditorState;
    divisionTypeOptions: DivisionTypeOption[];
    eventData: EventFormValues;
    getValues: EventFormGetValues;
    isAffiliateEvent: boolean;
    leagueData: LeagueConfig;
    resetDivisionEditor: () => void;
    setDivisionEditor: Dispatch<SetStateAction<DivisionEditorState>>;
    setLeagueData: LeagueDataSetter;
    setValue: EventFormSetValue;
};

export const useDivisionCommitController = ({
    createNextPlayoffDivision,
    currentSportRequiresSets,
    defaultDivisionTypeSelections,
    divisionEditor,
    divisionTypeOptions,
    eventData,
    getValues,
    isAffiliateEvent,
    leagueData,
    resetDivisionEditor,
    setDivisionEditor,
    setLeagueData,
    setValue,
}: UseDivisionCommitControllerParams) => {
    const getDivisionTypeNameForEditor = useCallback((
        ratingType: 'AGE' | 'SKILL',
        divisionTypeId: string,
    ): string => {
        if (!divisionTypeId) {
            return '';
        }
        const fromCatalog = divisionTypeOptions.find((option) => (
            option.id === divisionTypeId && option.ratingType === ratingType
        ));
        if (fromCatalog) {
            return fromCatalog.name;
        }
        return getDivisionTypeById(
            resolveSportInput(eventData.sportConfig ?? eventData.sportId),
            divisionTypeId,
            ratingType,
        )?.name ?? divisionTypeId.toUpperCase();
    }, [divisionTypeOptions, eventData.sportConfig, eventData.sportId]);

    const handleSaveDivisionDetail = useCallback(() => {
        if (divisionEditor.divisionKind === 'PLAYOFF') {
            const name = divisionEditor.name.trim();
            const normalizedMaxParticipants = normalizePlayoffDivisionParticipantCount(divisionEditor.maxParticipants);

            if (!name.length) {
                setDivisionEditor((previous) => ({ ...previous, error: 'Playoff division name is required.' }));
                return;
            }
            if (typeof normalizedMaxParticipants !== 'number' || normalizedMaxParticipants < 2) {
                setDivisionEditor((previous) => ({
                    ...previous,
                    error: eventData.teamSignup
                        ? 'Playoff division teams count must be at least 2.'
                        : 'Playoff division participants count must be at least 2.',
                }));
                return;
            }

            const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
                ? [...eventData.playoffDivisionDetails]
                : [];
            const normalizedName = normalizeDivisionNameKey(name);
            const duplicateByName = currentPlayoffDivisions.find((detail) => (
                detail.id !== divisionEditor.editingId
                && normalizeDivisionNameKey(detail.name) === normalizedName
            ));
            if (duplicateByName) {
                setDivisionEditor((previous) => ({
                    ...previous,
                    error: 'Division name must be unique within this event.',
                }));
                return;
            }

            const existingDetail = divisionEditor.editingId
                ? currentPlayoffDivisions.find((detail) => detail.id === divisionEditor.editingId)
                : null;
            const defaultDetail = existingDetail ?? createNextPlayoffDivision(
                currentPlayoffDivisions,
                divisionEditor.playoffConfig,
            );
            const nextDetail: PlayoffDivisionDetailForm = {
                ...defaultDetail,
                name,
                maxParticipants: normalizedMaxParticipants,
                playoffConfig: buildTournamentConfig(divisionEditor.playoffConfig),
            };
            const nextPlayoffDivisions = existingDetail
                ? currentPlayoffDivisions.map((detail) => (
                    detail.id === existingDetail.id ? nextDetail : detail
                ))
                : [...currentPlayoffDivisions, nextDetail];

            setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });
            resetDivisionEditor();
            return;
        }

        const gender = divisionEditor.gender;
        const skillDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.skillDivisionTypeId);
        const ageDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.ageDivisionTypeId);
        const ratingType: 'SKILL' = 'SKILL';
        const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
        const skillDivisionTypeName = getDivisionTypeNameForEditor('SKILL', skillDivisionTypeId);
        const ageDivisionTypeName = getDivisionTypeNameForEditor('AGE', ageDivisionTypeId);
        const name = divisionEditor.name.trim();
        const usesEventLevelDivisionDefaults = eventData.singleDivision && !isAffiliateEvent;
        const rawNormalizedDivisionPrice = usesEventLevelDivisionDefaults
            ? Math.max(0, eventData.price || 0)
            : Math.max(0, divisionEditor.price || 0);
        const rawDivisionMaxParticipants = usesEventLevelDivisionDefaults
            ? eventData.maxParticipants
            : divisionEditor.maxParticipants;
        const isDivisionMaxParticipantsMissing = (!eventData.singleDivision || isAffiliateEvent)
            && typeof rawDivisionMaxParticipants !== 'number';
        const normalizedDivisionMaxParticipants = typeof rawDivisionMaxParticipants === 'number'
            ? Math.max(0, Math.trunc(rawDivisionMaxParticipants))
            : Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const rawDivisionPlayoffTeamCount = (() => {
            if (
                (eventData.eventType !== 'LEAGUE' && eventData.eventType !== 'TOURNAMENT')
                || !leagueData.includePlayoffs
            ) {
                return undefined;
            }
            if (eventData.eventType === 'LEAGUE' && eventData.singleDivision) {
                return typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants;
            }
            return divisionEditor.playoffTeamCount;
        })();
        const normalizedDivisionPlayoffTeamCount = typeof rawDivisionPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(rawDivisionPlayoffTeamCount))
            : undefined;
        const normalizedDivisionPoolCount = (
            eventData.eventType === 'TOURNAMENT'
            && leagueData.includePlayoffs
            && typeof divisionEditor.poolCount === 'number'
        )
            ? Math.max(1, Math.trunc(divisionEditor.poolCount))
            : undefined;
        const normalizedDivisionPoolTeamCount = eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs
            ? derivePoolTeamCount(normalizedDivisionMaxParticipants, normalizedDivisionPoolCount)
            : undefined;
        const normalizedDivisionAllowPaymentPlans = !isAffiliateEvent && eventData.singleDivision
            ? Boolean(eventData.allowPaymentPlans)
            : !isAffiliateEvent && Boolean(divisionEditor.allowPaymentPlans);
        const normalizedDivisionInstallmentAmounts = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? normalizeInstallmentAmounts(eventData.installmentAmounts)
                : normalizeInstallmentAmounts(divisionEditor.installmentAmounts))
            : [];
        const normalizedDivisionInstallmentDueDates = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? [...(eventData.installmentDueDates || [])]
                : [...(divisionEditor.installmentDueDates || [])])
            : [];
        const normalizedDivisionInstallmentDueRelativeDays = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
                : normalizeInstallmentRelativeDays(divisionEditor.installmentDueRelativeDays))
            : [];
        const normalizedDivisionInstallmentCount = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? (eventData.installmentCount || normalizedDivisionInstallmentAmounts.length || 0)
                : (divisionEditor.installmentCount || normalizedDivisionInstallmentAmounts.length || 0))
            : 0;
        const normalizedDivisionPrice = normalizedDivisionAllowPaymentPlans
            ? sumInstallmentAmounts(normalizedDivisionInstallmentAmounts)
            : rawNormalizedDivisionPrice;

        if (!gender || !skillDivisionTypeId || !ageDivisionTypeId) {
            setDivisionEditor((previous) => ({
                ...previous,
                error: 'Select gender, skill division, and age division before adding.',
            }));
            return;
        }
        const divisionTypeName = buildDivisionName({
            gender,
            sportInput: resolveSportInput(eventData.sportConfig ?? eventData.sportId),
            skillDivisionTypeId,
            ageDivisionTypeId,
        });
        if (!name.length) {
            setDivisionEditor((previous) => ({ ...previous, error: 'Division name is required.' }));
            return;
        }
        if (isDivisionMaxParticipantsMissing) {
            setDivisionEditor((previous) => ({
                ...previous,
                error: eventData.teamSignup
                    ? 'Division max teams is required.'
                    : 'Division max participants is required.',
            }));
            return;
        }
        if ((!eventData.singleDivision || isAffiliateEvent) && normalizedDivisionMaxParticipants < 2) {
            setDivisionEditor((previous) => ({
                ...previous,
                error: eventData.teamSignup
                    ? 'Division max teams must be at least 2.'
                    : 'Division max participants must be at least 2.',
            }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && typeof rawDivisionPlayoffTeamCount !== 'number'
        ) {
            setDivisionEditor((previous) => ({ ...previous, error: 'Division playoff team count is required.' }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)
        ) {
            setDivisionEditor((previous) => ({ ...previous, error: 'Division playoff team count must be at least 2.' }));
            return;
        }
        if (eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs) {
            if (!(typeof normalizedDivisionPoolCount === 'number' && normalizedDivisionPoolCount >= 1)) {
                setDivisionEditor((previous) => ({ ...previous, error: 'Pool count is required.' }));
                return;
            }
            if (!(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)) {
                setDivisionEditor((previous) => ({ ...previous, error: 'Bracket team count is required.' }));
                return;
            }
            if (normalizedDivisionMaxParticipants % normalizedDivisionPoolCount !== 0) {
                setDivisionEditor((previous) => ({ ...previous, error: 'Division max teams must divide evenly by pool count.' }));
                return;
            }
            if (normalizedDivisionPlayoffTeamCount % normalizedDivisionPoolCount !== 0) {
                setDivisionEditor((previous) => ({ ...previous, error: 'Bracket team count must divide evenly by pool count.' }));
                return;
            }
        }
        if (!eventData.singleDivision && normalizedDivisionAllowPaymentPlans) {
            if (!normalizedDivisionInstallmentAmounts.length) {
                setDivisionEditor((previous) => ({
                    ...previous,
                    error: 'Add at least one installment amount for this division.',
                }));
                return;
            }
            if (
                normalizedDivisionInstallmentCount > 0
                && normalizedDivisionInstallmentAmounts.length !== normalizedDivisionInstallmentCount
            ) {
                setDivisionEditor((previous) => ({
                    ...previous,
                    error: 'Division installment count must match number of installment rows.',
                }));
                return;
            }
            if (
                eventData.eventType === 'WEEKLY_EVENT'
                && !eventData.parentEvent
                && normalizedDivisionInstallmentDueRelativeDays.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((previous) => ({
                    ...previous,
                    error: 'Each division installment amount needs a due date offset.',
                }));
                return;
            }
            if (
                !(eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent)
                && normalizedDivisionInstallmentDueDates.length
                && normalizedDivisionInstallmentDueDates.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((previous) => ({
                    ...previous,
                    error: 'Each division installment amount needs a due date.',
                }));
                return;
            }
        }

        const token = buildDivisionToken({ gender, ratingType, divisionTypeId });
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId) || undefined;
        const referenceDate = parseDateValue(eventData.start ?? null);

        const currentDetails = Array.isArray(eventData.divisionDetails) ? [...eventData.divisionDetails] : [];
        const existingDetail = divisionEditor.editingId
            ? currentDetails.find((detail) => detail.id === divisionEditor.editingId)
            : null;
        const normalizedName = normalizeDivisionNameKey(name);
        const duplicateByName = currentDetails.find((detail) => (
            detail.id !== divisionEditor.editingId
            && normalizeDivisionNameKey(detail.name) === normalizedName
        ));
        if (duplicateByName) {
            setDivisionEditor((previous) => ({
                ...previous,
                error: 'Division name must be unique within this event.',
            }));
            return;
        }
        const nextId = existingDetail?.id ?? buildUniqueDivisionIdForToken({
            eventId: eventData.$id,
            token,
            existingDivisionIds: currentDetails.map((detail) => detail.id),
        });
        const normalizedPlacementMapping = (() => {
            if (
                eventData.eventType === 'LEAGUE'
                && leagueData.includePlayoffs
                && eventData.splitLeaguePlayoffDivisions
                && !eventData.singleDivision
                && typeof normalizedDivisionPlayoffTeamCount === 'number'
            ) {
                const mapping = normalizePlacementDivisionIds(divisionEditor.playoffPlacementDivisionIds)
                    .slice(0, normalizedDivisionPlayoffTeamCount);
                while (mapping.length < normalizedDivisionPlayoffTeamCount) {
                    mapping.push('');
                }
                return mapping;
            }
            return Array.isArray(existingDetail?.playoffPlacementDivisionIds)
                ? [...existingDetail.playoffPlacementDivisionIds]
                : [];
        })();
        const storesLeagueDivisionPlayoffConfig = (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !eventData.splitLeaguePlayoffDivisions
        );
        const storesTournamentDivisionConfig = (
            eventData.eventType === 'TOURNAMENT'
            && !eventData.singleDivision
        );
        const normalizedDivisionPlayoffConfig = storesLeagueDivisionPlayoffConfig
            ? normalizeTournamentConfigForSetMode(
                divisionEditor.playoffConfig,
                resolveTournamentSetMode(currentSportRequiresSets, divisionEditor.playoffConfig),
            )
            : undefined;
        const normalizedDivisionTournamentConfig = storesTournamentDivisionConfig
            ? normalizeTournamentConfigForSetMode(
                divisionEditor.playoffConfig,
                resolveTournamentSetMode(currentSportRequiresSets, divisionEditor.playoffConfig),
            )
            : undefined;

        const nextDetail = applyDivisionAgeCutoff({
            id: nextId,
            key: token,
            kind: 'LEAGUE',
            name,
            divisionTypeId,
            divisionTypeName,
            ratingType,
            gender,
            skillDivisionTypeId,
            skillDivisionTypeName,
            ageDivisionTypeId,
            ageDivisionTypeName,
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: normalizedDivisionPlayoffTeamCount,
            poolCount: normalizedDivisionPoolCount,
            poolTeamCount: normalizedDivisionPoolTeamCount,
            playoffPlacementDivisionIds: normalizedPlacementMapping,
            ...((eventData.eventType === 'LEAGUE' || (eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs))
                ? leagueConfigToDivisionFields(normalizeLeagueConfigForSetMode(divisionEditor.leagueConfig, currentSportRequiresSets))
                : {}),
            ...((normalizedDivisionPlayoffConfig || normalizedDivisionTournamentConfig)
                ? { playoffConfig: normalizedDivisionPlayoffConfig ?? normalizedDivisionTournamentConfig }
                : {}),
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans && !(eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent)
                ? normalizedDivisionInstallmentDueDates
                : [],
            installmentDueRelativeDays: normalizedDivisionAllowPaymentPlans && eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent
                ? normalizedDivisionInstallmentDueRelativeDays
                : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            sportId: sportInput,
            fieldIds: [],
        }, sportInput, referenceDate);

        const nextDetails = divisionEditor.editingId
            ? currentDetails.map((detail) => (
                detail.id === divisionEditor.editingId ? nextDetail : detail
            ))
            : [...currentDetails, nextDetail];
        const nextDivisionIds = nextDetails.map((detail) => detail.id);

        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const remappedFieldMap: Record<string, string[]> = {};
        Object.entries(currentFieldMap).forEach(([divisionKey, fieldIds]) => {
            if (divisionEditor.editingId && divisionKey === divisionEditor.editingId) {
                remappedFieldMap[nextId] = Array.isArray(fieldIds) ? [...fieldIds] : [];
                return;
            }
            if (nextDivisionIds.includes(divisionKey)) {
                remappedFieldMap[divisionKey] = Array.isArray(fieldIds) ? [...fieldIds] : [];
            }
        });
        setValue('divisionFieldIds', remappedFieldMap, { shouldDirty: true, shouldValidate: true });
        if (!eventData.singleDivision) {
            setValue('price', normalizedDivisionPrice, { shouldDirty: true, shouldValidate: false });
            setValue('maxParticipants', normalizedDivisionMaxParticipants, { shouldDirty: true, shouldValidate: true });
            setValue('allowPaymentPlans', normalizedDivisionAllowPaymentPlans, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueRelativeDays', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueRelativeDays : [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [], { shouldDirty: true, shouldValidate: true });
            if (
                eventData.eventType === 'LEAGUE'
                && leagueData.includePlayoffs
                && typeof normalizedDivisionPlayoffTeamCount === 'number'
            ) {
                setLeagueData((previous) => ({
                    ...previous,
                    playoffTeamCount: normalizedDivisionPlayoffTeamCount,
                }), { shouldDirty: true, shouldValidate: true });
            }
        }
        setDivisionEditor({
            editingId: null,
            divisionKind: 'LEAGUE',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: typeof normalizedDivisionPlayoffTeamCount === 'number'
                ? normalizedDivisionPlayoffTeamCount
                : Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            poolCount: typeof normalizedDivisionPoolCount === 'number'
                ? normalizedDivisionPoolCount
                : null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(divisionEditor.leagueConfig, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(divisionEditor.playoffConfig),
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [],
            installmentDueRelativeDays: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueRelativeDays : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            nameTouched: false,
            error: null,
        });
    }, [
        createNextPlayoffDivision,
        currentSportRequiresSets,
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        divisionEditor,
        eventData.$id,
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.parentEvent,
        eventData.playoffDivisionDetails,
        eventData.price,
        eventData.singleDivision,
        eventData.sportConfig,
        eventData.sportId,
        eventData.splitLeaguePlayoffDivisions,
        eventData.start,
        eventData.teamSignup,
        getDivisionTypeNameForEditor,
        getValues,
        isAffiliateEvent,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        resetDivisionEditor,
        setDivisionEditor,
        setLeagueData,
        setValue,
    ]);

    return { handleSaveDivisionDetail };
};
