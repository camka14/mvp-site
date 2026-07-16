'use client';

import { Alert, Stack, Text, Title } from '@mantine/core';

import LeagueScoringConfigPanel from '@/app/discover/components/LeagueScoringConfigPanel';

import MatchRulesSection from '../../MatchRulesSection';
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
const MAX_PRICE_CENTS = 9_999_999 * 100;

type SimpleSetupCompetitionRulesPageProps = {
    model: EventFormSectionsProps;
};

export const SimpleSetupCompetitionRulesPage = ({
    model,
}: SimpleSetupCompetitionRulesPageProps) => {
    const {
        configurationActions,
        control,
        divisionController,
        errors,
        eventData,
        fieldWriters,
        isImmutableField,
        paymentController,
        presentation,
        sectionsController,
        setValue,
    } = model;
    const {
        setLeagueData,
        setPlayoffData,
        setTournamentData,
    } = fieldWriters;
    const {
        showMatchRulesSection,
        showScoringConfigSection,
        scoringConfigSectionLabel,
    } = sectionsController;

    return (
        <Stack gap="xl">
            <div>
                <Title order={4}>Competition rules</Title>
                <Text size="sm" c="dimmed">
                    Configure the match structure, bracket or pool behavior, and result scoring.
                </Text>
            </div>

            {eventData.singleDivision ? (
                <SingleDivisionDefaultsPanel
                    control={control}
                    eventData={eventData}
                    leagueData={eventData.leagueData}
                    playoffData={eventData.playoffData}
                    tournamentData={eventData.tournamentData}
                    poolDefaults={divisionController.singleDivisionPoolPlayDefaults}
                    eventTaxableForPreview={paymentController.eventTaxableForPreview}
                    maxStandardNumber={MAX_STANDARD_NUMBER}
                    maxPriceCents={MAX_PRICE_CENTS}
                    numberInputStyles={alignedDetailsFieldStyles}
                    hasStripeAccount={paymentController.pricingControlsEnabled}
                    organizerTaxCollectionAllowed={paymentController.organizerTaxCollectionAllowed}
                    organizerResponsibilityMessage={
                        paymentController.eventTaxPolicyForPreview.organizerResponsibilityMessage
                    }
                    isOrganizationHostedEvent={model.resourceController.isOrganizationHostedEvent}
                    organizerManualTaxSelected={paymentController.organizerManualTaxSelected}
                    organizationDefaultEventTaxHandling={paymentController.organizationDefaultEventTaxHandling}
                    connectingStripe={paymentController.connectingStripe}
                    showCapacityControls={false}
                    showPricingControls={false}
                    showPaymentPlanControls={false}
                    showScheduleControls
                    title="Match and advancement format"
                    description="These settings control generated matches for the shared division."
                    isImmutableField={isImmutableField}
                    playoffTeamCountError={errors.leagueData?.playoffTeamCount?.message as string | undefined}
                    setLeagueData={setLeagueData}
                    setPlayoffData={setPlayoffData}
                    setTournamentData={setTournamentData}
                    onPoolDefaultsChange={divisionController.updateSingleDivisionTournamentPoolDefaults}
                    onConnectStripe={paymentController.connectStripe}
                    syncInstallmentCount={paymentController.syncInstallmentCount}
                    onAllowPaymentPlansChange={() => undefined}
                    onInstallmentDueRelativeDayChange={paymentController.setInstallmentDueRelativeDay}
                    onInstallmentDueDateChange={paymentController.setInstallmentDueDate}
                    onInstallmentAmountChange={paymentController.setInstallmentAmount}
                    onRemoveInstallment={paymentController.removeInstallment}
                    onTeamSplitDefaultChange={() => undefined}
                />
            ) : (
                <Alert color="blue" variant="light">
                    Match format and advancement settings are stored per division. Edit those values on the Divisions page.
                </Alert>
            )}

            {showMatchRulesSection ? (
                <div>
                    <Title order={5} mb="sm">Match rules</Title>
                    <MatchRulesSection
                        sport={presentation.selectedSportForOfficials ?? undefined}
                        usesSets={eventData.eventType === 'LEAGUE'
                            ? Boolean(eventData.leagueData.usesSets)
                            : eventData.eventType === 'TOURNAMENT'
                                ? Boolean(eventData.tournamentData.usesSets)
                                : Boolean(presentation.selectedSportForOfficials?.usePointsPerSetWin)}
                        setsPerMatch={eventData.eventType === 'LEAGUE'
                            ? eventData.leagueData.setsPerMatch
                            : undefined}
                        winnerSetCount={eventData.eventType === 'TOURNAMENT'
                            ? eventData.tournamentData.winnerSetCount
                            : undefined}
                        officialPositions={eventData.officialPositions}
                        value={eventData.matchRulesOverride}
                        onChange={configurationActions.handleMatchRulesOverrideChange}
                        autoCreatePointMatchIncidents={eventData.autoCreatePointMatchIncidents}
                        onAutoCreatePointMatchIncidentsChange={(checked) => setValue(
                            'autoCreatePointMatchIncidents',
                            checked,
                            { shouldDirty: true, shouldValidate: false },
                        )}
                        disabled={isImmutableField('matchRulesOverride')}
                        incidentToggleDisabled={
                            isImmutableField('matchRulesOverride')
                            || isImmutableField('autoCreatePointMatchIncidents')
                        }
                        comboboxProps={sharedComboboxProps}
                    />
                </div>
            ) : null}

            {showScoringConfigSection ? (
                <div>
                    <Title order={5} mb="sm">{scoringConfigSectionLabel}</Title>
                    <LeagueScoringConfigPanel
                        value={eventData.leagueScoringConfig}
                        sport={eventData.sportConfig ?? undefined}
                        editable={!isImmutableField('leagueScoringConfig')}
                        onChange={configurationActions.handleLeagueScoringConfigChange}
                    />
                </div>
            ) : null}
        </Stack>
    );
};
