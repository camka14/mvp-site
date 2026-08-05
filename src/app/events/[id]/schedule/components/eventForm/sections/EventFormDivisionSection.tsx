import {
    useCallback,
    useMemo,
    type ComponentProps,
} from 'react';
import type {
    Control,
    FieldErrors,
} from 'react-hook-form';

import type { Division, Event } from '@/types';

import {
    buildDivisionTypeSelectOptions,
    buildPlayoffDivisionCapacityWarnings,
    buildPlayoffDivisionSelectOptions,
    DIVISION_GENDER_OPTIONS,
    normalizePlayoffDivisionParticipantCount,
    type DivisionTypeOption,
} from '../divisionForm';
import {
    buildTournamentConfig,
    derivePoolTeamCount,
} from '../configDefaults';
import type { EventFormValues } from '../formTypes';
import { BRACKET_TEAM_COUNT_ERROR } from '../divisionMessages';
import { sumInstallmentAmounts } from '../paymentPlanHelpers';
import type { useDivisionEditorController } from '../hooks/useDivisionEditorController';
import type { useEventPaymentController } from '../hooks/useEventPaymentController';
import { DivisionEditorActionsAndErrors } from './DivisionEditorActionsAndErrors';
import { DivisionEditorHeader } from './DivisionEditorHeader';
import { DivisionEditorLeaguePanel } from './DivisionEditorLeaguePanel';
import { DivisionEditorPlayoffDivisionControls } from './DivisionEditorPlayoffDivisionControls';
import { DivisionModeControls } from './DivisionModeControls';
import { DivisionSettingsSection } from './DivisionSettingsSection';
import { DivisionSummaryList } from './DivisionSummaryList';
import { SingleDivisionDefaultsPanel } from './SingleDivisionDefaultsPanel';
import { TryoutDivisionSelector } from '../components/TryoutDivisionSelector';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormDivisionSectionProps = {
    collapsed: boolean;
    comboboxProps: ComponentProps<typeof DivisionEditorHeader>['comboboxProps'];
    control: Control<EventFormValues>;
    divisionController: ReturnType<typeof useDivisionEditorController>;
    divisionTypeOptions: DivisionTypeOption[];
    errors: FieldErrors<EventFormValues>;
    eventData: EventFormValues;
    hasExternalRentalField: boolean;
    isAffiliateEvent: boolean;
    isImmutableField: (key: keyof Event) => boolean;
    isOrganizationHostedEvent: boolean;
    maxMediumTextLength: number;
    maxPriceCents: number;
    maxStandardNumber: number;
    numberInputStyles: ComponentProps<typeof SingleDivisionDefaultsPanel>['numberInputStyles'];
    onSaveDivision: ComponentProps<typeof DivisionEditorActionsAndErrors>['onSave'];
    onTryoutDivisionSelection: (divisions: Division[]) => void;
    onTryoutPriceChange: (sourceDivisionId: string, price: number) => void;
    onToggle: () => void;
    organizationId?: string;
    paymentController: ReturnType<typeof useEventPaymentController>;
    playoffData: EventFormValues['playoffData'];
    setLeagueData: ComponentProps<typeof SingleDivisionDefaultsPanel>['setLeagueData'];
    setPlayoffData: ComponentProps<typeof SingleDivisionDefaultsPanel>['setPlayoffData'];
    setTournamentData: ComponentProps<typeof SingleDivisionDefaultsPanel>['setTournamentData'];
    setValue: EventFormSetValue;
    showsFixedTeamEventToggle: boolean;
    splitLeaguePlayoffDivisionsLocked: boolean;
    supportsEditableTeamSignup: boolean;
    tournamentData: EventFormValues['tournamentData'];
    errorCount?: number;
    firstErrorMessage?: string;
};

export const EventFormDivisionSection = ({
    collapsed,
    comboboxProps,
    control,
    divisionController,
    divisionTypeOptions,
    errors,
    eventData,
    hasExternalRentalField,
    isAffiliateEvent,
    isImmutableField,
    isOrganizationHostedEvent,
    maxMediumTextLength,
    maxPriceCents,
    maxStandardNumber,
    numberInputStyles,
    onSaveDivision,
    onTryoutDivisionSelection,
    onTryoutPriceChange,
    onToggle,
    organizationId,
    paymentController,
    playoffData,
    setLeagueData,
    setPlayoffData,
    setTournamentData,
    setValue,
    showsFixedTeamEventToggle,
    splitLeaguePlayoffDivisionsLocked,
    supportsEditableTeamSignup,
    tournamentData,
    errorCount,
    firstErrorMessage,
}: EventFormDivisionSectionProps) => {
    const {
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
    } = divisionController;
    const {
        connectStripe,
        connectingStripe,
        eventTaxableForPreview,
        eventTaxPolicyForPreview,
        hasStripeAccount,
        manualPaymentsEnabled,
        organizationDefaultEventTaxHandling,
        organizerManualTaxSelected,
        organizerTaxCollectionAllowed,
        removeInstallment,
        setInstallmentAmount,
        setInstallmentDueDate,
        setInstallmentDueRelativeDay,
        syncInstallmentCount,
    } = paymentController;
    const skillDivisionTypeSelectOptions = useMemo(
        () => buildDivisionTypeSelectOptions(divisionTypeOptions, 'SKILL'),
        [divisionTypeOptions],
    );
    const ageDivisionTypeSelectOptions = useMemo(
        () => buildDivisionTypeSelectOptions(divisionTypeOptions, 'AGE'),
        [divisionTypeOptions],
    );
    const playoffDivisionSelectOptions = useMemo(
        () => buildPlayoffDivisionSelectOptions(eventData.playoffDivisionDetails),
        [eventData.playoffDivisionDetails],
    );
    const playoffDivisionCapacityWarnings = useMemo(
        () => buildPlayoffDivisionCapacityWarnings({
            eventType: eventData.eventType,
            includePlayoffs: eventData.leagueData.includePlayoffs,
            splitLeaguePlayoffDivisions: eventData.splitLeaguePlayoffDivisions,
            divisionDetails: eventData.divisionDetails,
            playoffDivisionDetails: eventData.playoffDivisionDetails,
        }),
        [
            eventData.divisionDetails,
            eventData.eventType,
            eventData.leagueData.includePlayoffs,
            eventData.playoffDivisionDetails,
            eventData.splitLeaguePlayoffDivisions,
        ],
    );
    const singleDivisionPlayoffTeamCountError = eventData.eventType === 'TOURNAMENT'
        ? errors.divisionDetails?.[0]?.playoffTeamCount?.message as string | undefined
        : errors.leagueData?.playoffTeamCount?.message as string | undefined;
    const divisionEditorPlayoffTeamCountError = divisionEditor.error === BRACKET_TEAM_COUNT_ERROR
        ? BRACKET_TEAM_COUNT_ERROR
        : undefined;
    const singleDivisionPhaseSettings = eventData.divisionDetails?.[0]?.phaseSettings ?? {};
    const handleSingleDivisionPhaseSettingsChange = useCallback<
        NonNullable<ComponentProps<typeof SingleDivisionDefaultsPanel>['onPhaseSettingsChange']>
    >((phase, settings) => {
        setValue('divisionDetails', (eventData.divisionDetails ?? []).map((division) => ({
            ...division,
            phaseSettings: {
                ...(division.phaseSettings ?? {}),
                [phase]: settings,
            },
        })), { shouldDirty: true, shouldValidate: true });
    }, [eventData.divisionDetails, setValue]);

    return (
        <DivisionSettingsSection
            collapsed={collapsed}
            title="Divisions"
            onToggle={onToggle}
            errorCount={errorCount}
            firstErrorMessage={firstErrorMessage}
        >
            <div className="mt-4 space-y-4">
                {eventData.eventType === 'TRYOUT' ? (
                    <TryoutDivisionSelector
                        organizationId={organizationId}
                        preferredSportId={eventData.sportIds[0]}
                        selectedDivisions={eventData.divisionDetails ?? []}
                        maxPriceCents={maxPriceCents}
                        disabled={isImmutableField('divisions')}
                        onChange={onTryoutDivisionSelection}
                        onTryoutPriceChange={onTryoutPriceChange}
                        validationMessage={errors.divisionDetails?.message as string | undefined}
                    />
                ) : (
                    <>
                <DivisionModeControls
                    control={control}
                    supportsEditableTeamSignup={supportsEditableTeamSignup}
                    showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                    singleDivisionOnly={isAffiliateEvent}
                    eventType={eventData.eventType}
                    singleDivision={eventData.singleDivision}
                    leagueIncludesPlayoffs={Boolean(eventData.leagueData.includePlayoffs)}
                    splitLeaguePlayoffDivisionsLocked={splitLeaguePlayoffDivisionsLocked}
                    hasExternalRentalField={hasExternalRentalField}
                    isImmutableField={isImmutableField}
                />
                {!isAffiliateEvent && eventData.singleDivision ? (
                    <SingleDivisionDefaultsPanel
                        control={control}
                        eventData={eventData}
                        leagueData={eventData.leagueData}
                        playoffData={playoffData}
                        tournamentData={tournamentData}
                        poolDefaults={singleDivisionPoolPlayDefaults}
                        phaseSettings={singleDivisionPhaseSettings}
                        eventTaxableForPreview={eventTaxableForPreview}
                        maxStandardNumber={maxStandardNumber}
                        maxPriceCents={maxPriceCents}
                        numberInputStyles={numberInputStyles}
                        hasStripeAccount={hasStripeAccount}
                        organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                        organizerResponsibilityMessage={eventTaxPolicyForPreview.organizerResponsibilityMessage}
                        isOrganizationHostedEvent={isOrganizationHostedEvent}
                        organizerManualTaxSelected={organizerManualTaxSelected}
                        organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                        connectingStripe={connectingStripe}
                        simplifiedPricing={manualPaymentsEnabled}
                        showPaymentPlanControls={!manualPaymentsEnabled}
                        isImmutableField={isImmutableField}
                        playoffTeamCountError={singleDivisionPlayoffTeamCountError}
                        setLeagueData={setLeagueData}
                        setPlayoffData={setPlayoffData}
                        setTournamentData={setTournamentData}
                        onPoolDefaultsChange={updateSingleDivisionTournamentPoolDefaults}
                        onPhaseSettingsChange={handleSingleDivisionPhaseSettingsChange}
                        onConnectStripe={connectStripe}
                        syncInstallmentCount={syncInstallmentCount}
                        onAllowPaymentPlansChange={(next) => {
                            setValue('allowPaymentPlans', next, { shouldDirty: true, shouldValidate: true });
                            if (next && !eventData.installmentAmounts?.length) {
                                syncInstallmentCount(eventData.installmentCount || 1);
                            } else if (next) {
                                setValue('price', sumInstallmentAmounts(eventData.installmentAmounts), {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                });
                            }
                        }}
                        onInstallmentDueRelativeDayChange={setInstallmentDueRelativeDay}
                        onInstallmentDueDateChange={setInstallmentDueDate}
                        onInstallmentAmountChange={setInstallmentAmount}
                        onRemoveInstallment={removeInstallment}
                        onTeamSplitDefaultChange={(checked) => setValue('allowTeamSplitDefault', checked, {
                            shouldDirty: true,
                            shouldValidate: true,
                        })}
                    />
                ) : null}
                <DivisionEditorHeader
                    editing={Boolean(divisionEditor.editingId)}
                    splitDivisionEditorEnabled={!isAffiliateEvent && splitDivisionEditorEnabled}
                    divisionKind={divisionEditor.divisionKind}
                    disabled={isImmutableField('divisions')}
                    comboboxProps={comboboxProps}
                    onDivisionKindChange={handleDivisionEditorKindChange}
                />
                <DivisionEditorLeaguePanel
                    divisionEditor={divisionEditor}
                    eventData={isAffiliateEvent ? {
                        ...eventData,
                        teamSignup: false,
                        allowPaymentPlans: false,
                    } : eventData}
                    leagueData={eventData.leagueData}
                    eventTaxableForPreview={eventTaxableForPreview}
                    splitDivisionEditorEnabled={!isAffiliateEvent && splitDivisionEditorEnabled}
                    divisionEditorReady={divisionEditorReady}
                    divisionMaxParticipantsWarning={isAffiliateEvent ? null : divisionMaxParticipantsWarning}
                    hasStripeAccount={hasStripeAccount}
                    maxStandardNumber={maxStandardNumber}
                    maxPriceCents={maxPriceCents}
                    maxMediumTextLength={maxMediumTextLength}
                    numberInputStyles={numberInputStyles}
                    simplePriceInput={isAffiliateEvent || manualPaymentsEnabled}
                    showCapacityForSingleDivision={isAffiliateEvent}
                    showPriceForSingleDivision={isAffiliateEvent}
                    showPaymentPlanControls={!isAffiliateEvent && !manualPaymentsEnabled}
                    showOperationalControls={!isAffiliateEvent}
                    showSingleDivisionNotice={!isAffiliateEvent}
                    playoffTeamCountError={divisionEditorPlayoffTeamCountError}
                    genderOptions={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                    skillDivisionTypeOptions={skillDivisionTypeSelectOptions}
                    ageDivisionTypeOptions={ageDivisionTypeSelectOptions}
                    playoffDivisionOptions={playoffDivisionSelectOptions}
                    comboboxProps={comboboxProps}
                    isImmutableField={isImmutableField}
                    setDivisionEditor={setDivisionEditor}
                    updateDivisionEditorSelection={updateDivisionEditorSelection}
                    setDivisionEditorLeagueConfig={setDivisionEditorLeagueConfig}
                    setDivisionEditorPlayoffConfig={setDivisionEditorPlayoffConfig}
                    syncDivisionInstallmentCount={syncDivisionInstallmentCount}
                    onInstallmentDueRelativeDayChange={setDivisionInstallmentDueRelativeDay}
                    onInstallmentDueDateChange={setDivisionInstallmentDueDate}
                    onInstallmentAmountChange={setDivisionInstallmentAmount}
                    onRemoveInstallment={removeDivisionInstallment}
                />
                {!isAffiliateEvent ? (
                    <>
                        <DivisionEditorPlayoffDivisionControls
                            visible={splitDivisionEditorEnabled && divisionEditor.divisionKind === 'PLAYOFF'}
                            name={divisionEditor.name}
                            maxParticipants={divisionEditor.maxParticipants}
                            teamSignup={eventData.teamSignup}
                            playoffConfig={buildTournamentConfig(divisionEditor.playoffConfig)}
                            phaseSettings={divisionEditor.phaseSettings}
                            eventMatchRulesOverride={eventData.matchRulesOverride}
                            officialPositions={eventData.officialPositions}
                            autoCreatePointMatchIncidents={eventData.autoCreatePointMatchIncidents}
                            sport={eventData.sportConfig ?? undefined}
                            maxStandardNumber={maxStandardNumber}
                            maxMediumTextLength={maxMediumTextLength}
                            disabled={isImmutableField('divisions')}
                            onNameChange={(name) => {
                                setDivisionEditor((previous) => ({
                                    ...previous,
                                    name,
                                    nameTouched: true,
                                    error: null,
                                }));
                            }}
                            onMaxParticipantsChange={(value) => {
                                setDivisionEditor((previous) => ({
                                    ...previous,
                                    maxParticipants: normalizePlayoffDivisionParticipantCount(value),
                                    error: null,
                                }));
                            }}
                            onPlayoffConfigChange={setDivisionEditorPlayoffConfig}
                            onPhaseSettingsChange={(settings) => setDivisionEditor((previous) => ({
                                ...previous,
                                phaseSettings: {
                                    ...previous.phaseSettings,
                                    PLAYOFF: settings,
                                },
                                error: null,
                            }))}
                        />
                        <DivisionEditorActionsAndErrors
                            isEditing={Boolean(divisionEditor.editingId)}
                            disabled={isImmutableField('divisions')}
                            editorError={divisionEditor.error}
                            divisionsError={errors.divisions?.message as string | undefined}
                            divisionDetailsError={errors.divisionDetails?.message as string | undefined}
                            playoffDivisionDetailsError={errors.playoffDivisionDetails?.message as string | undefined}
                            showMissingPlayoffDivisionWarning={splitDivisionEditorEnabled && (eventData.playoffDivisionDetails || []).length === 0}
                            onSave={onSaveDivision}
                            onCancelEdit={resetDivisionEditor}
                        />
                        <DivisionSummaryList
                            divisionDetails={eventData.divisionDetails || []}
                            playoffDivisionDetails={eventData.playoffDivisionDetails || []}
                            singleDivision={eventData.singleDivision}
                            teamSignup={eventData.teamSignup}
                            eventType={eventData.eventType}
                            includePlayoffs={eventData.leagueData.includePlayoffs}
                            splitDivisionEditorEnabled={splitDivisionEditorEnabled}
                            eventPrice={eventData.price}
                            eventMaxParticipants={eventData.maxParticipants}
                            eventAllowPaymentPlans={Boolean(eventData.allowPaymentPlans)}
                            eventInstallmentCount={eventData.installmentCount}
                            eventInstallmentAmounts={eventData.installmentAmounts || []}
                            leaguePlayoffTeamCount={eventData.leagueData.playoffTeamCount}
                            disabled={isImmutableField('divisions')}
                            playoffDivisionCapacityWarnings={playoffDivisionCapacityWarnings}
                            derivePoolTeamCount={derivePoolTeamCount}
                            buildTournamentConfig={buildTournamentConfig}
                            onEditDivision={handleEditDivisionDetail}
                            onRemoveDivision={handleRemoveDivisionDetail}
                            onEditPlayoffDivision={handleEditPlayoffDivisionDetail}
                            onRemovePlayoffDivision={handleRemovePlayoffDivision}
                        />
                    </>
                ) : (
                    <>
                        <DivisionEditorActionsAndErrors
                            isEditing={Boolean(divisionEditor.editingId)}
                            disabled={isImmutableField('divisions')}
                            editorError={divisionEditor.error}
                            divisionsError={errors.divisions?.message as string | undefined}
                            divisionDetailsError={errors.divisionDetails?.message as string | undefined}
                            showMissingPlayoffDivisionWarning={false}
                            onSave={onSaveDivision}
                            onCancelEdit={resetDivisionEditor}
                        />
                        <DivisionSummaryList
                            divisionDetails={eventData.divisionDetails || []}
                            playoffDivisionDetails={[]}
                            singleDivision={eventData.singleDivision}
                            teamSignup={false}
                            eventType={eventData.eventType}
                            includePlayoffs={false}
                            splitDivisionEditorEnabled={false}
                            eventPrice={eventData.price}
                            eventMaxParticipants={eventData.maxParticipants}
                            eventAllowPaymentPlans={false}
                            eventInstallmentCount={0}
                            eventInstallmentAmounts={[]}
                            disabled={isImmutableField('divisions')}
                            playoffDivisionCapacityWarnings={[]}
                            useDivisionPriceForSingleDivision
                            useDivisionCapacityForSingleDivision
                            hidePaymentPlanDetails
                            hideOperationalDetails
                            derivePoolTeamCount={derivePoolTeamCount}
                            buildTournamentConfig={buildTournamentConfig}
                            onEditDivision={handleEditDivisionDetail}
                            onRemoveDivision={handleRemoveDivisionDetail}
                            onEditPlayoffDivision={handleEditPlayoffDivisionDetail}
                            onRemovePlayoffDivision={handleRemovePlayoffDivision}
                        />
                    </>
                )}
                    </>
                )}
            </div>
        </DivisionSettingsSection>
    );
};
