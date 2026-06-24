import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    buildDivisionName,
    buildEventDivisionId,
} from '@/lib/divisionTypes';
import { normalizePriceCents } from '@/lib/priceUtils';
import type { LeagueConfig, TournamentConfig } from '@/types';

import { applyEventDefaultsToDivisionDetails } from '../../divisionDefaults';
import {
    buildDivisionLeagueConfig,
    buildTournamentConfig,
    derivePoolTeamCount,
    normalizeLeagueConfigForSetMode,
} from '../configDefaults';
import {
    type DivisionEditorKind,
    type DivisionEditorState,
    type PlayoffDivisionDetailForm,
    deriveSingleDivisionPoolPlayDefaults,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionKeys,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionParticipantCount,
    parseCompositeDivisionTypeId,
    resolveSportInput,
} from '../divisionForm';
import type { EventFormValues } from '../formTypes';
import {
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
    sumInstallmentAmounts,
} from '../paymentPlanHelpers';
import { stringArraysEqual } from '../shared';
import { leagueConfigEqual } from '../formEquality';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormGetValues = (name: string) => unknown;

type UseDivisionEditorControllerParams = {
    eventData: EventFormValues;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    currentSportRequiresSets: boolean;
    hasStripeAccount: boolean;
    isCreateMode: boolean;
    setValue: EventFormSetValue;
    getValues: EventFormGetValues;
};

export const useDivisionEditorController = ({
    eventData,
    leagueData,
    playoffData,
    currentSportRequiresSets,
    hasStripeAccount,
    isCreateMode,
    setValue,
    getValues,
}: UseDivisionEditorControllerParams) => {
    const defaultDivisionTypeSelections = useMemo(
        () => getDefaultDivisionTypeSelectionsForSport(resolveSportInput(eventData.sportConfig ?? eventData.sportId)),
        [eventData.sportConfig, eventData.sportId],
    );

    const [divisionEditor, setDivisionEditor] = useState<DivisionEditorState>({
        editingId: null,
        divisionKind: 'LEAGUE',
        gender: '',
        skillDivisionTypeId: '',
        ageDivisionTypeId: '',
        name: '',
        price: Math.max(0, eventData.price || 0),
        maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        playoffTeamCount: Math.max(
            2,
            Math.trunc(
                typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants || 2,
            ),
        ),
        poolCount: null,
        playoffPlacementDivisionIds: [],
        leagueConfig: normalizeLeagueConfigForSetMode(leagueData, Boolean(eventData.sportConfig?.usePointsPerSetWin)),
        playoffConfig: buildTournamentConfig(),
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentDueRelativeDays: [],
        installmentAmounts: [],
        nameTouched: false,
        error: null,
    });

    const previousSingleDivisionRef = useRef<boolean | null>(null);
    const firstDivisionDetailForDefaults = useMemo(
        () => (Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails[0] : undefined),
        [eventData.divisionDetails],
    );
    const singleDivisionPoolPlayDefaults = useMemo(() => deriveSingleDivisionPoolPlayDefaults({
        firstDivisionDetail: firstDivisionDetailForDefaults,
        editorPlayoffTeamCount: divisionEditor.playoffTeamCount,
        editorPoolCount: divisionEditor.poolCount,
        maxParticipants: eventData.maxParticipants,
    }), [
        divisionEditor.playoffTeamCount,
        divisionEditor.poolCount,
        eventData.maxParticipants,
        firstDivisionDetailForDefaults,
    ]);
    const splitDivisionEditorEnabled = Boolean(
        eventData.eventType === 'LEAGUE'
        && leagueData.includePlayoffs
        && eventData.splitLeaguePlayoffDivisions
        && !eventData.singleDivision,
    );

    const syncDivisionInstallmentCount = useCallback((count: number) => {
        setDivisionEditor((prev) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            const price = Math.max(0, Number(prev.price) || 0);
            const fallbackDueDate = eventData.start;
            const useRelativeDueDates = eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent;

            while (amounts.length < safeCount) {
                amounts.push(amounts.length === 0 ? price : 0);
                dueDates.push(fallbackDueDate);
                relativeDueDays.push(0);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
                relativeDueDays.pop();
            }

            return {
                ...prev,
                installmentCount: safeCount,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                installmentDueDates: useRelativeDueDates ? [] : dueDates,
                installmentDueRelativeDays: useRelativeDueDates ? relativeDueDays : [],
                error: null,
            };
        });
    }, [eventData.eventType, eventData.parentEvent, eventData.start]);

    const setDivisionInstallmentAmount = useCallback((index: number, value: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts[index] = normalizePriceCents(value);
            return {
                ...prev,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueDate = useCallback((index: number, value: Date | string | null) => {
        setDivisionEditor((prev) => {
            const dueDates = [...(prev.installmentDueDates || [])];
            if (index < 0 || index >= dueDates.length) {
                return prev;
            }
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            return {
                ...prev,
                installmentDueDates: dueDates,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueRelativeDay = useCallback((index: number, value: number | string) => {
        setDivisionEditor((prev) => {
            const amounts = prev.installmentAmounts || [];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            while (relativeDueDays.length < amounts.length) {
                relativeDueDays.push(0);
            }
            const parsed = typeof value === 'number' ? value : Number(value);
            relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
            return {
                ...prev,
                installmentDueRelativeDays: relativeDueDays,
                installmentDueDates: [],
                error: null,
            };
        });
    }, []);

    const removeDivisionInstallment = useCallback((index: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            if (amounts.length <= 1 || index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            relativeDueDays.splice(index, 1);
            return {
                ...prev,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                installmentDueDates: dueDates,
                installmentDueRelativeDays: relativeDueDays,
                installmentCount: amounts.length,
                error: null,
            };
        });
    }, []);

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }
        setDivisionEditor((prev) => {
            const hasEditorPaidSettings = prev.price !== 0
                || prev.allowPaymentPlans
                || (prev.installmentCount || 0) !== 0
                || (prev.installmentAmounts?.length || 0) > 0
                || (prev.installmentDueDates?.length || 0) > 0
                || (prev.installmentDueRelativeDays?.length || 0) > 0;
            if (!hasEditorPaidSettings) {
                return prev;
            }
            return {
                ...prev,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
                error: null,
            };
        });
    }, [hasStripeAccount, isCreateMode]);

    const createNextPlayoffDivision = useCallback((
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ): PlayoffDivisionDetailForm => {
        let index = Math.max(1, existing.length + 1);
        while (index < 500) {
            const key = `playoff_${index}`;
            const id = buildEventDivisionId(eventData.$id, key);
            if (!existing.some((division) => division.id === id || division.key === key)) {
                return {
                    id,
                    key,
                    kind: 'PLAYOFF',
                    name: `Playoff Division ${index}`,
                    maxParticipants: 2,
                    playoffConfig: buildTournamentConfig(configTemplate),
                };
            }
            index += 1;
        }
        const fallbackKey = `playoff_${Date.now()}`;
        return {
            id: buildEventDivisionId(eventData.$id, fallbackKey),
            key: fallbackKey,
            kind: 'PLAYOFF',
            name: 'Playoff Division',
            maxParticipants: 2,
            playoffConfig: buildTournamentConfig(configTemplate),
        };
    }, [eventData.$id]);

    const handleRemovePlayoffDivision = useCallback((playoffDivisionId: string) => {
        const normalizedPlayoffDivisionId = normalizeDivisionKeys([playoffDivisionId])[0];
        if (!normalizedPlayoffDivisionId) {
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivisions = currentPlayoffDivisions.filter((division) => (
            normalizeDivisionKeys([division.id])[0] !== normalizedPlayoffDivisionId
        ));
        setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const remappedLeagueDivisions = currentLeagueDivisions.map((division) => {
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            const nextMapping = mapping.map((entry) => {
                const normalizedEntry = normalizeDivisionKeys([entry])[0];
                return normalizedEntry === normalizedPlayoffDivisionId ? '' : entry;
            });
            if (stringArraysEqual(mapping, nextMapping)) {
                return division;
            }
            return {
                ...division,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        setValue('divisionDetails', remappedLeagueDivisions, { shouldDirty: true, shouldValidate: true });
        setDivisionEditor((prev) => {
            if (prev.editingId === normalizedPlayoffDivisionId && prev.divisionKind === 'PLAYOFF') {
                return {
                    ...prev,
                    editingId: null,
                    divisionKind: 'LEAGUE',
                    error: null,
                };
            }
            if (!prev.playoffPlacementDivisionIds.some((entry) => normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId)) {
                return prev;
            }
            return {
                ...prev,
                playoffPlacementDivisionIds: prev.playoffPlacementDivisionIds.map((entry) => (
                    normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId ? '' : entry
                )),
                error: null,
            };
        });
    }, [eventData.divisionDetails, eventData.playoffDivisionDetails, setValue]);

    const updateSingleDivisionTournamentPoolDefaults = useCallback((
        updates: Partial<Pick<DivisionEditorState, 'playoffTeamCount' | 'poolCount'>>,
    ) => {
        setDivisionEditor((prev) => ({
            ...prev,
            ...updates,
            error: null,
        }));

        if (!eventData.singleDivision || eventData.eventType !== 'TOURNAMENT' || !leagueData.includePlayoffs) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }

        const nextPlayoffTeamCount = Object.prototype.hasOwnProperty.call(updates, 'playoffTeamCount')
            ? updates.playoffTeamCount
            : singleDivisionPoolPlayDefaults.bracketTeams;
        const nextPoolCount = Object.prototype.hasOwnProperty.call(updates, 'poolCount')
            ? updates.poolCount
            : singleDivisionPoolPlayDefaults.poolCount;
        const normalizedMaxParticipants = Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const normalizedPlayoffTeamCount = typeof nextPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(nextPlayoffTeamCount))
            : undefined;
        const normalizedPoolCount = typeof nextPoolCount === 'number'
            ? Math.max(1, Math.trunc(nextPoolCount))
            : undefined;
        const normalizedPoolTeamCount = derivePoolTeamCount(normalizedMaxParticipants, normalizedPoolCount);

        const nextDetails = currentDetails.map((detail) => ({
            ...detail,
            maxParticipants: normalizedMaxParticipants,
            playoffTeamCount: normalizedPlayoffTeamCount,
            poolCount: normalizedPoolCount,
            poolTeamCount: normalizedPoolTeamCount,
        }));
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
        singleDivisionPoolPlayDefaults.bracketTeams,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    const resetDivisionEditor = useCallback(() => {
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? normalizeInstallmentAmounts(eventData.installmentAmounts)
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
            ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
            : [];
        setDivisionEditor({
            editingId: null,
            divisionKind: 'LEAGUE',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: Math.max(0, eventData.price || 0),
            maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                        ? firstDivisionDetailForDefaults.playoffTeamCount
                        : typeof leagueData.playoffTeamCount === 'number'
                        ? leagueData.playoffTeamCount
                        : eventData.maxParticipants || 2,
                ),
            ),
            poolCount: eventData.eventType === 'TOURNAMENT'
                && leagueData.includePlayoffs
                && typeof firstDivisionDetailForDefaults?.poolCount === 'number'
                ? Math.max(1, Math.trunc(firstDivisionDetailForDefaults.poolCount))
                : null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(playoffData),
            allowPaymentPlans: Boolean(eventData.allowPaymentPlans),
            installmentCount: eventData.allowPaymentPlans
                ? (eventData.installmentCount || defaultInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: defaultInstallmentDueDates,
            installmentDueRelativeDays: defaultInstallmentDueRelativeDays,
            installmentAmounts: defaultInstallmentAmounts,
            nameTouched: false,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.allowPaymentPlans,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.price,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        currentSportRequiresSets,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        leagueData,
        playoffData,
    ]);

    const handleDivisionEditorKindChange = useCallback((value: string | null) => {
        const nextKind: DivisionEditorKind = value === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE';
        if (nextKind === 'LEAGUE') {
            resetDivisionEditor();
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivision = createNextPlayoffDivision(currentPlayoffDivisions, playoffData);
        setDivisionEditor({
            editingId: null,
            divisionKind: 'PLAYOFF',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: nextPlayoffDivision.name,
            price: 0,
            maxParticipants: nextPlayoffDivision.maxParticipants,
            playoffTeamCount: null,
            poolCount: null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(nextPlayoffDivision.playoffConfig),
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            installmentAmounts: [],
            nameTouched: true,
            error: null,
        });
    }, [
        createNextPlayoffDivision,
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData,
        playoffData,
        resetDivisionEditor,
    ]);

    const setDivisionEditorPlayoffConfig = useCallback((updater: React.SetStateAction<TournamentConfig>) => {
        setDivisionEditor((prev) => {
            const previousConfig = buildTournamentConfig(prev.playoffConfig);
            const resolved = typeof updater === 'function'
                ? (updater as (previous: TournamentConfig) => TournamentConfig)(previousConfig)
                : updater;
            return {
                ...prev,
                playoffConfig: buildTournamentConfig(resolved),
                error: null,
            };
        });
    }, []);

    const setDivisionEditorLeagueConfig = useCallback((updates: Partial<LeagueConfig>) => {
        setDivisionEditor((prev) => ({
            ...prev,
            leagueConfig: normalizeLeagueConfigForSetMode(
                {
                    ...prev.leagueConfig,
                    ...updates,
                    includePlayoffs: prev.leagueConfig.includePlayoffs,
                    playoffTeamCount: prev.leagueConfig.playoffTeamCount,
                },
                currentSportRequiresSets,
            ),
            error: null,
        }));
    }, [currentSportRequiresSets]);

    useEffect(() => {
        if (splitDivisionEditorEnabled || divisionEditor.divisionKind !== 'PLAYOFF') {
            return;
        }
        resetDivisionEditor();
    }, [divisionEditor.divisionKind, resetDivisionEditor, splitDivisionEditorEnabled]);

    useEffect(() => {
        const isSingleDivision = Boolean(eventData.singleDivision);
        if (previousSingleDivisionRef.current === null) {
            previousSingleDivisionRef.current = isSingleDivision;
            return;
        }
        const wasSingleDivision = previousSingleDivisionRef.current;
        previousSingleDivisionRef.current = isSingleDivision;
        if (!wasSingleDivision || isSingleDivision) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            resetDivisionEditor();
            return;
        }

        const { details: nextDetails, changed } = applyEventDefaultsToDivisionDetails({
            details: currentDetails,
            defaultPrice: Number(eventData.price) || 0,
            defaultMaxParticipants: Number(eventData.maxParticipants) || 2,
            includePlayoffs: eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs,
            defaultPlayoffTeamCount: typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.eventType === 'TOURNAMENT' && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                    ? firstDivisionDetailForDefaults.playoffTeamCount
                    : typeof eventData.maxParticipants === 'number'
                    ? eventData.maxParticipants
                    : undefined,
            includeTournamentPoolPlay: eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs,
            defaultPoolCount: eventData.eventType === 'TOURNAMENT'
                ? firstDivisionDetailForDefaults?.poolCount ?? singleDivisionPoolPlayDefaults.poolCount
                : undefined,
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
        }
        resetDivisionEditor();
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.price,
        eventData.singleDivision,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        resetDivisionEditor,
        setValue,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    const updateDivisionEditorSelection = useCallback((
        updates: Partial<Pick<DivisionEditorState, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    ) => {
        setDivisionEditor((prev) => {
            const next = { ...prev, ...updates, error: null };
            if (Object.prototype.hasOwnProperty.call(updates, 'skillDivisionTypeId') && !updates.skillDivisionTypeId) {
                next.skillDivisionTypeId = '';
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'ageDivisionTypeId') && !updates.ageDivisionTypeId) {
                next.ageDivisionTypeId = '';
            }

            const hasRequiredFields = Boolean(next.gender && next.skillDivisionTypeId && next.ageDivisionTypeId);
            if (!hasRequiredFields) {
                next.name = '';
                next.nameTouched = false;
                return next;
            }

            next.name = buildDivisionName({
                gender: next.gender as 'M' | 'F' | 'C',
                sportInput: resolveSportInput(eventData.sportConfig ?? eventData.sportId),
                skillDivisionTypeId: next.skillDivisionTypeId,
                ageDivisionTypeId: next.ageDivisionTypeId,
            });
            next.nameTouched = false;
            return next;
        });
    }, [eventData.sportConfig, eventData.sportId]);

    const handleEditDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.divisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        const composite = parseCompositeDivisionTypeId(detail.divisionTypeId);
        const fallbackSelections = getDefaultDivisionTypeSelectionsForSport(
            resolveSportInput(eventData.sportConfig ?? eventData.sportId),
        );
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? normalizeInstallmentAmounts(eventData.installmentAmounts)
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
            ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
            : [];
        const detailAllowPaymentPlans = typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : Boolean(eventData.allowPaymentPlans);
        const detailInstallmentAmounts = detailAllowPaymentPlans
            ? ((detail.installmentAmounts?.length
                ? detail.installmentAmounts
                : defaultInstallmentAmounts).map((value) => normalizePriceCents(value)))
            : [];
        const detailInstallmentDueDates = detailAllowPaymentPlans
            ? (detail.installmentDueDates?.length
                ? [...detail.installmentDueDates]
                : defaultInstallmentDueDates)
            : [];
        const detailInstallmentDueRelativeDays = detailAllowPaymentPlans
            ? (detail.installmentDueRelativeDays?.length
                ? normalizeInstallmentRelativeDays(detail.installmentDueRelativeDays)
                : defaultInstallmentDueRelativeDays)
            : [];
        setDivisionEditor({
            editingId: detail.id,
            divisionKind: 'LEAGUE',
            gender: detail.gender,
            skillDivisionTypeId: detail.skillDivisionTypeId
                || composite?.skillDivisionTypeId
                || (detail.ratingType === 'SKILL' ? detail.divisionTypeId : fallbackSelections.skillDivisionTypeId),
            ageDivisionTypeId: detail.ageDivisionTypeId
                || composite?.ageDivisionTypeId
                || (detail.ratingType === 'AGE' ? detail.divisionTypeId : fallbackSelections.ageDivisionTypeId),
            name: detail.name,
            price: Math.max(0, detail.price || 0),
            maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    detail.playoffTeamCount
                        || detail.maxParticipants
                        || eventData.maxParticipants
                        || 2,
                ),
            ),
            poolCount: typeof detail.poolCount === 'number'
                ? Math.max(1, Math.trunc(detail.poolCount))
                : null,
            playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
            leagueConfig: buildDivisionLeagueConfig(detail, leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(detail.playoffConfig ?? playoffData),
            allowPaymentPlans: detailAllowPaymentPlans,
            installmentCount: detailAllowPaymentPlans
                ? (detail.installmentCount || detailInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: detailInstallmentDueDates,
            installmentDueRelativeDays: detailInstallmentDueRelativeDays,
            installmentAmounts: detailInstallmentAmounts,
            nameTouched: true,
            error: null,
        });
    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.sportConfig,
        eventData.sportId,
        currentSportRequiresSets,
        leagueData,
        playoffData,
    ]);

    const handleEditPlayoffDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.playoffDivisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        setDivisionEditor({
            editingId: detail.id,
            divisionKind: 'PLAYOFF',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: detail.name,
            price: 0,
            maxParticipants: normalizePlayoffDivisionParticipantCount(detail.maxParticipants),
            playoffTeamCount: null,
            poolCount: null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(detail.playoffConfig),
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            installmentAmounts: [],
            nameTouched: true,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData,
    ]);

    const handleRemoveDivisionDetail = useCallback((divisionId: string) => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDetails = currentDetails.filter((detail) => detail.id !== divisionId);
        const nextDivisionIds = nextDetails.map((detail) => detail.id);
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const cleanedFieldMap = Object.fromEntries(
            Object.entries(currentFieldMap as Record<string, unknown>).filter(([divisionKey]) => nextDivisionIds.includes(divisionKey)),
        );
        setValue('divisionFieldIds', cleanedFieldMap, { shouldDirty: true, shouldValidate: true });

        if (divisionEditor.editingId === divisionId) {
            resetDivisionEditor();
        }
    }, [
        divisionEditor.editingId,
        eventData.divisionDetails,
        getValues,
        resetDivisionEditor,
        setValue,
    ]);

    useEffect(() => {
        setDivisionEditor((prev) => {
            if (prev.divisionKind !== 'LEAGUE') {
                return prev;
            }
            const normalized = normalizeLeagueConfigForSetMode(prev.leagueConfig, currentSportRequiresSets);
            if (leagueConfigEqual(prev.leagueConfig, normalized)) {
                return prev;
            }
            return {
                ...prev,
                leagueConfig: normalized,
            };
        });
    }, [currentSportRequiresSets]);

    const leagueDivisionEditorReady = Boolean(
        divisionEditor.gender
        && divisionEditor.skillDivisionTypeId
        && divisionEditor.ageDivisionTypeId,
    );
    const divisionEditorReady = leagueDivisionEditorReady;
    const divisionMaxParticipantsWarning = !eventData.singleDivision
        && typeof divisionEditor.maxParticipants === 'number'
        && divisionEditor.maxParticipants < 2
        ? (eventData.teamSignup
            ? 'Warning: make division max teams at least 2.'
            : 'Warning: make division max participants at least 2.')
        : null;

    return {
        createNextPlayoffDivision,
        defaultDivisionTypeSelections,
        divisionEditor,
        divisionEditorReady,
        divisionMaxParticipantsWarning,
        handleDivisionEditorKindChange,
        handleEditDivisionDetail,
        handleEditPlayoffDivisionDetail,
        handleRemoveDivisionDetail,
        handleRemovePlayoffDivision,
        removeDivisionInstallment,
        resetDivisionEditor,
        setDivisionEditor,
        setDivisionEditorLeagueConfig,
        setDivisionEditorPlayoffConfig,
        setDivisionInstallmentAmount,
        setDivisionInstallmentDueDate,
        setDivisionInstallmentDueRelativeDay,
        singleDivisionPoolPlayDefaults,
        splitDivisionEditorEnabled,
        syncDivisionInstallmentCount,
        updateDivisionEditorSelection,
        updateSingleDivisionTournamentPoolDefaults,
    };
};
