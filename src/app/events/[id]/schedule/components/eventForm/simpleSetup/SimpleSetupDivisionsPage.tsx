'use client';

import { useMemo } from 'react';
import { Stack, Text, Title } from '@mantine/core';

import {
    buildDivisionTypeSelectOptions,
    buildPlayoffDivisionCapacityWarnings,
    buildPlayoffDivisionSelectOptions,
    DIVISION_GENDER_OPTIONS,
    normalizePlayoffDivisionParticipantCount,
} from '../divisionForm';
import {
    buildTournamentConfig,
    derivePoolTeamCount,
} from '../configDefaults';
import { sumInstallmentAmounts } from '../paymentPlanHelpers';
import { TryoutDivisionSelector } from '../components/TryoutDivisionSelector';
import { DivisionEditorActionsAndErrors } from '../sections/DivisionEditorActionsAndErrors';
import { DivisionEditorHeader } from '../sections/DivisionEditorHeader';
import { DivisionEditorLeaguePanel } from '../sections/DivisionEditorLeaguePanel';
import { DivisionEditorPlayoffDivisionControls } from '../sections/DivisionEditorPlayoffDivisionControls';
import { DivisionModeControls } from '../sections/DivisionModeControls';
import { DivisionSummaryList } from '../sections/DivisionSummaryList';
import type { EventFormSectionsProps } from '../sections/EventFormSections';
import { SingleDivisionDefaultsPanel } from '../sections/SingleDivisionDefaultsPanel';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const alignedDetailsFieldStyles = {
    label: {
        minHeight: '3rem',
        display: 'flex',
        alignItems: 'flex-end',
        lineHeight: 1.25,
    },
} as const;
const MAX_STANDARD_NUMBER = 99_999;
const MAX_MEDIUM_TEXT_LENGTH = 160;
const MAX_PRICE_CENTS = 9_999_999 * 100;

type SimpleSetupDivisionsPageProps = {
    model: EventFormSectionsProps;
};

export const SimpleSetupDivisionsPage = ({
    model,
}: SimpleSetupDivisionsPageProps) => {
    const {
        control,
        divisionController,
        divisionTypeOptions,
        errors,
        eventData,
        fieldWriters,
        handleSaveDivisionDetail,
        isAffiliateEvent,
        isImmutableField,
        onTryoutDivisionSelection,
        onTryoutPriceChange,
        organizationId,
        paymentController,
        resourceController,
        sectionsController,
        setValue,
    } = model;
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
        organizationDefaultEventTaxHandling,
        organizerManualTaxSelected,
        organizerTaxCollectionAllowed,
        pricingControlsEnabled,
        removeInstallment,
        setInstallmentAmount,
        setInstallmentDueDate,
        setInstallmentDueRelativeDay,
        syncInstallmentCount,
    } = paymentController;
    const {
        setLeagueData,
        setPlayoffData,
        setTournamentData,
    } = fieldWriters;
    const {
        hasExternalRentalField,
        isOrganizationHostedEvent,
    } = resourceController;
    const {
        showsFixedTeamEventToggle,
        supportsEditableTeamSignup,
    } = sectionsController;

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

    return (
        <Stack gap="lg">
            <div>
                <Title order={4}>Division configuration</Title>
                <Text size="sm" c="dimmed">
                    Configure capacity, classification, pricing, and division-owned competition settings.
                </Text>
            </div>

            {eventData.eventType === 'TRYOUT' ? (
                <TryoutDivisionSelector
                    organizationId={organizationId}
                    preferredSportId={eventData.sportId}
                    selectedDivisions={eventData.divisionDetails ?? []}
                    maxPriceCents={MAX_PRICE_CENTS}
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
                        splitLeaguePlayoffDivisionsLocked={
                            isImmutableField('splitLeaguePlayoffDivisions')
                            && !hasExternalRentalField
                        }
                        hasExternalRentalField={hasExternalRentalField}
                        isImmutableField={isImmutableField}
                    />
                    {!isAffiliateEvent && eventData.singleDivision ? (
                        <SingleDivisionDefaultsPanel
                            control={control}
                            eventData={eventData}
                            leagueData={eventData.leagueData}
                            playoffData={eventData.playoffData}
                            tournamentData={eventData.tournamentData}
                            poolDefaults={singleDivisionPoolPlayDefaults}
                            eventTaxableForPreview={eventTaxableForPreview}
                            maxStandardNumber={MAX_STANDARD_NUMBER}
                            maxPriceCents={MAX_PRICE_CENTS}
                            numberInputStyles={alignedDetailsFieldStyles}
                            hasStripeAccount={pricingControlsEnabled}
                            organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                            organizerResponsibilityMessage={
                                eventTaxPolicyForPreview.organizerResponsibilityMessage
                            }
                            isOrganizationHostedEvent={isOrganizationHostedEvent}
                            organizerManualTaxSelected={organizerManualTaxSelected}
                            organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                            connectingStripe={connectingStripe}
                            isImmutableField={isImmutableField}
                            playoffTeamCountError={
                                errors.leagueData?.playoffTeamCount?.message as string | undefined
                            }
                            setLeagueData={setLeagueData}
                            setPlayoffData={setPlayoffData}
                            setTournamentData={setTournamentData}
                            onPoolDefaultsChange={updateSingleDivisionTournamentPoolDefaults}
                            onConnectStripe={connectStripe}
                            syncInstallmentCount={syncInstallmentCount}
                            onAllowPaymentPlansChange={(next) => {
                                setValue('allowPaymentPlans', next, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                });
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
                            onTeamSplitDefaultChange={(checked) => setValue(
                                'allowTeamSplitDefault',
                                checked,
                                { shouldDirty: true, shouldValidate: true },
                            )}
                        />
                    ) : null}
                    <DivisionEditorHeader
                        editing={Boolean(divisionEditor.editingId)}
                        splitDivisionEditorEnabled={!isAffiliateEvent && splitDivisionEditorEnabled}
                        divisionKind={divisionEditor.divisionKind}
                        disabled={isImmutableField('divisions')}
                        comboboxProps={sharedComboboxProps}
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
                        divisionMaxParticipantsWarning={
                            isAffiliateEvent ? null : divisionMaxParticipantsWarning
                        }
                        hasStripeAccount={pricingControlsEnabled}
                        maxStandardNumber={MAX_STANDARD_NUMBER}
                        maxPriceCents={MAX_PRICE_CENTS}
                        maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                        numberInputStyles={alignedDetailsFieldStyles}
                        simplePriceInput={isAffiliateEvent}
                        showCapacityForSingleDivision={isAffiliateEvent}
                        showPriceForSingleDivision={isAffiliateEvent}
                        showPaymentPlanControls={!isAffiliateEvent}
                        showOperationalControls={!isAffiliateEvent}
                        showSingleDivisionNotice={!isAffiliateEvent}
                        genderOptions={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                        skillDivisionTypeOptions={skillDivisionTypeSelectOptions}
                        ageDivisionTypeOptions={ageDivisionTypeSelectOptions}
                        playoffDivisionOptions={playoffDivisionSelectOptions}
                        comboboxProps={sharedComboboxProps}
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
                                visible={
                                    splitDivisionEditorEnabled
                                    && divisionEditor.divisionKind === 'PLAYOFF'
                                }
                                name={divisionEditor.name}
                                maxParticipants={divisionEditor.maxParticipants}
                                teamSignup={eventData.teamSignup}
                                playoffConfig={buildTournamentConfig(divisionEditor.playoffConfig)}
                                sport={eventData.sportConfig ?? undefined}
                                maxStandardNumber={MAX_STANDARD_NUMBER}
                                maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
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
                            />
                            <DivisionEditorActionsAndErrors
                                isEditing={Boolean(divisionEditor.editingId)}
                                disabled={isImmutableField('divisions')}
                                editorError={divisionEditor.error}
                                divisionsError={errors.divisions?.message as string | undefined}
                                divisionDetailsError={
                                    errors.divisionDetails?.message as string | undefined
                                }
                                playoffDivisionDetailsError={
                                    errors.playoffDivisionDetails?.message as string | undefined
                                }
                                showMissingPlayoffDivisionWarning={
                                    splitDivisionEditorEnabled
                                    && (eventData.playoffDivisionDetails || []).length === 0
                                }
                                onSave={handleSaveDivisionDetail}
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
                                divisionDetailsError={
                                    errors.divisionDetails?.message as string | undefined
                                }
                                showMissingPlayoffDivisionWarning={false}
                                onSave={handleSaveDivisionDetail}
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
        </Stack>
    );
};
