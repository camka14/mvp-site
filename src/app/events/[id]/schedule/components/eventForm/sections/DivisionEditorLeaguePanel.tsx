import type {
    ComponentProps,
    Dispatch,
    SetStateAction,
} from 'react';
import { motion } from 'motion/react';

import { normalizePriceCents } from '@/lib/priceUtils';
import type { Event, LeagueConfig } from '@/types';

import {
    buildTournamentConfig,
    derivePoolTeamCount,
} from '../configDefaults';
import { DIVISION_LAYOUT_TRANSITION } from '../constants';
import { DIVISION_FIELD_ROW_CLASS } from '../divisionLayout';
import type { DivisionEditorState } from '../divisionForm';
import {
    normalizeDivisionKeys,
    normalizePlayoffDivisionParticipantCount,
} from '../divisionForm';
import type { EventFormValues } from '../formTypes';
import { sumInstallmentAmounts } from '../paymentPlanHelpers';
import { AnimatedSection } from '../components/AnimatedSection';
import { DivisionEditorCoreControls } from './DivisionEditorCoreControls';
import { DivisionEditorLeagueConfigControls } from './DivisionEditorLeagueConfigControls';
import { DivisionEditorPaymentPlanControls } from './DivisionEditorPaymentPlanControls';
import { DivisionEditorPlayoffPlacementControls } from './DivisionEditorPlayoffPlacementControls';
import { DivisionEditorTournamentConfigControls } from './DivisionEditorTournamentConfigControls';
import { DivisionEditorTournamentPoolControls } from './DivisionEditorTournamentPoolControls';
import { SingleDivisionEditorNotice } from './SingleDivisionEditorNotice';

type DivisionEditorLeaguePanelProps = {
    divisionEditor: DivisionEditorState;
    eventData: EventFormValues;
    leagueData: LeagueConfig;
    eventTaxableForPreview: boolean;
    splitDivisionEditorEnabled: boolean;
    divisionEditorReady: boolean;
    divisionMaxParticipantsWarning?: string | null;
    hasStripeAccount: boolean;
    maxStandardNumber: number;
    maxPriceCents: number;
    maxMediumTextLength: number;
    numberInputStyles?: ComponentProps<typeof DivisionEditorLeagueConfigControls>['numberInputStyles'];
    hideCapacity?: boolean;
    hidePrice?: boolean;
    simplePriceInput?: boolean;
    showCapacityForSingleDivision?: boolean;
    showPriceForSingleDivision?: boolean;
    showPaymentPlanControls?: boolean;
    showOperationalControls?: boolean;
    showSingleDivisionNotice?: boolean;
    playoffTeamCountError?: string;
    genderOptions: ComponentProps<typeof DivisionEditorCoreControls>['genderOptions'];
    skillDivisionTypeOptions: ComponentProps<typeof DivisionEditorCoreControls>['skillDivisionTypeOptions'];
    ageDivisionTypeOptions: ComponentProps<typeof DivisionEditorCoreControls>['ageDivisionTypeOptions'];
    playoffDivisionOptions: ComponentProps<typeof DivisionEditorPlayoffPlacementControls>['playoffDivisionOptions'];
    comboboxProps?: ComponentProps<typeof DivisionEditorCoreControls>['comboboxProps'];
    isImmutableField: (field: keyof Event) => boolean;
    setDivisionEditor: Dispatch<SetStateAction<DivisionEditorState>>;
    updateDivisionEditorSelection: (
        updates: Partial<Pick<DivisionEditorState, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    ) => void;
    setDivisionEditorLeagueConfig: ComponentProps<typeof DivisionEditorLeagueConfigControls>['onLeagueDataChange'];
    setDivisionEditorPlayoffConfig: ComponentProps<typeof DivisionEditorLeagueConfigControls>['onPlayoffConfigChange'];
    syncDivisionInstallmentCount: (count: number) => void;
    onInstallmentDueRelativeDayChange: ComponentProps<typeof DivisionEditorPaymentPlanControls>['onInstallmentDueRelativeDayChange'];
    onInstallmentDueDateChange: ComponentProps<typeof DivisionEditorPaymentPlanControls>['onInstallmentDueDateChange'];
    onInstallmentAmountChange: ComponentProps<typeof DivisionEditorPaymentPlanControls>['onInstallmentAmountChange'];
    onRemoveInstallment: ComponentProps<typeof DivisionEditorPaymentPlanControls>['onRemoveInstallment'];
};

export const DivisionEditorLeaguePanel = ({
    divisionEditor,
    eventData,
    leagueData,
    eventTaxableForPreview,
    splitDivisionEditorEnabled,
    divisionEditorReady,
    divisionMaxParticipantsWarning,
    hasStripeAccount,
    maxStandardNumber,
    maxPriceCents,
    maxMediumTextLength,
    numberInputStyles,
    hideCapacity = false,
    hidePrice = false,
    simplePriceInput = false,
    showCapacityForSingleDivision = false,
    showPriceForSingleDivision = false,
    showPaymentPlanControls = true,
    showOperationalControls = true,
    showSingleDivisionNotice = true,
    playoffTeamCountError,
    genderOptions,
    skillDivisionTypeOptions,
    ageDivisionTypeOptions,
    playoffDivisionOptions,
    comboboxProps,
    isImmutableField,
    setDivisionEditor,
    updateDivisionEditorSelection,
    setDivisionEditorLeagueConfig,
    setDivisionEditorPlayoffConfig,
    syncDivisionInstallmentCount,
    onInstallmentDueRelativeDayChange,
    onInstallmentDueDateChange,
    onInstallmentAmountChange,
    onRemoveInstallment,
}: DivisionEditorLeaguePanelProps) => {
    const handlePhaseSettingsChange: ComponentProps<typeof DivisionEditorLeagueConfigControls>['onPhaseSettingsChange'] = (
        phase,
        settings,
    ) => {
        setDivisionEditor((previous) => ({
            ...previous,
            phaseSettings: {
                ...previous.phaseSettings,
                [phase]: settings,
            },
            error: null,
        }));
    };

    return (
    <AnimatedSection in={!splitDivisionEditorEnabled || divisionEditor.divisionKind === 'LEAGUE'}>
        <motion.div
            layout
            className={DIVISION_FIELD_ROW_CLASS}
            transition={DIVISION_LAYOUT_TRANSITION}
        >
            <DivisionEditorCoreControls
                gender={divisionEditor.gender}
                skillDivisionTypeId={divisionEditor.skillDivisionTypeId}
                ageDivisionTypeId={divisionEditor.ageDivisionTypeId}
                name={divisionEditor.name}
                maxParticipants={divisionEditor.maxParticipants}
                price={divisionEditor.price}
                allowPaymentPlans={divisionEditor.allowPaymentPlans}
                singleDivision={eventData.singleDivision}
                teamSignup={eventData.teamSignup}
                eventType={eventData.eventType}
                divisionEditorReady={divisionEditorReady}
                divisionsImmutable={isImmutableField('divisions')}
                hasStripeAccount={hasStripeAccount}
                maxStandardNumber={maxStandardNumber}
                maxPriceCents={maxPriceCents}
                maxMediumTextLength={maxMediumTextLength}
                divisionMaxParticipantsWarning={divisionMaxParticipantsWarning}
                hideCapacity={hideCapacity}
                hidePrice={hidePrice}
                simplePriceInput={simplePriceInput}
                showCapacityForSingleDivision={showCapacityForSingleDivision}
                showPriceForSingleDivision={showPriceForSingleDivision}
                genderOptions={genderOptions}
                skillDivisionTypeOptions={skillDivisionTypeOptions}
                ageDivisionTypeOptions={ageDivisionTypeOptions}
                comboboxProps={comboboxProps}
                onGenderChange={(gender) => updateDivisionEditorSelection({ gender })}
                onSkillDivisionChange={(skillDivisionTypeId) => updateDivisionEditorSelection({ skillDivisionTypeId })}
                onAgeDivisionChange={(ageDivisionTypeId) => updateDivisionEditorSelection({ ageDivisionTypeId })}
                onNameChange={(nextName) => {
                    setDivisionEditor((prev) => ({
                        ...prev,
                        name: nextName,
                        nameTouched: true,
                        error: null,
                    }));
                }}
                onMaxParticipantsChange={(value) => {
                    setDivisionEditor((prev) => ({
                        ...prev,
                        maxParticipants: normalizePlayoffDivisionParticipantCount(value),
                        error: null,
                    }));
                }}
                onPriceChange={(nextValue) => {
                    setDivisionEditor((prev) => ({
                        ...prev,
                        price: normalizePriceCents(nextValue),
                        error: null,
                    }));
                }}
            />
            {showPaymentPlanControls && !eventData.singleDivision ? (
                <DivisionEditorPaymentPlanControls
                    allowPaymentPlans={divisionEditor.allowPaymentPlans}
                    installmentCount={divisionEditor.installmentCount || 0}
                    installmentAmounts={divisionEditor.installmentAmounts || []}
                    installmentDueDates={divisionEditor.installmentDueDates || []}
                    installmentDueRelativeDays={divisionEditor.installmentDueRelativeDays || []}
                    eventType={eventData.eventType}
                    parentEvent={eventData.parentEvent}
                    eventStart={eventData.start}
                    taxable={eventTaxableForPreview}
                    disabled={isImmutableField('divisions') || !divisionEditorReady || !hasStripeAccount}
                    maxStandardNumber={maxStandardNumber}
                    maxPriceCents={maxPriceCents}
                    onAllowPaymentPlansChange={(checked) => {
                        setDivisionEditor((prev) => ({
                            ...prev,
                            allowPaymentPlans: checked,
                            price: checked && prev.installmentAmounts.length
                                ? sumInstallmentAmounts(prev.installmentAmounts)
                                : prev.price,
                            installmentCount: checked
                                ? (prev.installmentCount || prev.installmentAmounts.length || 1)
                                : 0,
                            installmentDueDates: checked ? prev.installmentDueDates : [],
                            installmentDueRelativeDays: checked ? prev.installmentDueRelativeDays : [],
                            installmentAmounts: checked ? prev.installmentAmounts : [],
                            error: null,
                        }));
                        if (checked && (!divisionEditor.installmentAmounts || divisionEditor.installmentAmounts.length === 0)) {
                            syncDivisionInstallmentCount(divisionEditor.installmentCount || 1);
                        }
                    }}
                    onInstallmentCountChange={(count) => syncDivisionInstallmentCount(count)}
                    onInstallmentDueRelativeDayChange={onInstallmentDueRelativeDayChange}
                    onInstallmentDueDateChange={onInstallmentDueDateChange}
                    onInstallmentAmountChange={onInstallmentAmountChange}
                    onRemoveInstallment={onRemoveInstallment}
                    onAddInstallment={() => syncDivisionInstallmentCount((divisionEditor.installmentAmounts?.length || 0) + 1)}
                />
            ) : null}
            <DivisionEditorLeagueConfigControls
                leagueConfigVisible={showOperationalControls && eventData.eventType === 'LEAGUE' && !eventData.singleDivision}
                playoffTeamCountVisible={showOperationalControls && eventData.eventType === 'LEAGUE' && !eventData.singleDivision && leagueData.includePlayoffs}
                playoffConfigVisible={
                    showOperationalControls
                    && eventData.eventType === 'LEAGUE'
                    && !eventData.singleDivision
                    && leagueData.includePlayoffs
                    && !eventData.splitLeaguePlayoffDivisions
                }
                leagueData={divisionEditor.leagueConfig}
                sport={eventData.sportConfig ?? undefined}
                participantCount={divisionEditor.maxParticipants ?? undefined}
                playoffTeamCount={divisionEditor.playoffTeamCount}
                playoffConfig={buildTournamentConfig(divisionEditor.playoffConfig)}
                divisionName={divisionEditor.name}
                phaseSettings={divisionEditor.phaseSettings}
                eventMatchRulesOverride={eventData.matchRulesOverride}
                officialPositions={eventData.officialPositions}
                autoCreatePointMatchIncidents={eventData.autoCreatePointMatchIncidents}
                maxStandardNumber={maxStandardNumber}
                numberInputStyles={numberInputStyles}
                disabled={isImmutableField('divisions') || !divisionEditorReady}
                playoffTeamCountError={playoffTeamCountError}
                onLeagueDataChange={setDivisionEditorLeagueConfig}
                onPlayoffTeamCountChange={(playoffTeamCount) => {
                    setDivisionEditor((prev) => ({
                        ...prev,
                        playoffTeamCount,
                        error: null,
                    }));
                }}
                onPlayoffConfigChange={setDivisionEditorPlayoffConfig}
                onPhaseSettingsChange={handlePhaseSettingsChange}
            />
            <DivisionEditorPlayoffPlacementControls
                visible={showOperationalControls && splitDivisionEditorEnabled && typeof divisionEditor.playoffTeamCount === 'number' && divisionEditor.playoffTeamCount > 0}
                playoffTeamCount={divisionEditor.playoffTeamCount}
                playoffDivisionOptions={playoffDivisionOptions}
                placementDivisionIds={normalizeDivisionKeys(divisionEditor.playoffPlacementDivisionIds || [])}
                comboboxProps={comboboxProps}
                disabled={isImmutableField('divisions')}
                onPlacementDivisionChange={(placementIndex, value) => {
                    const normalizedValue = normalizeDivisionKeys([value ?? ''])[0] ?? '';
                    setDivisionEditor((prev) => {
                        const nextMapping = [...prev.playoffPlacementDivisionIds];
                        while (nextMapping.length <= placementIndex) {
                            nextMapping.push('');
                        }
                        nextMapping[placementIndex] = normalizedValue;
                        return {
                            ...prev,
                            playoffPlacementDivisionIds: nextMapping,
                            error: null,
                        };
                    });
                }}
            />
            <DivisionEditorTournamentPoolControls
                visible={showOperationalControls && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && !eventData.singleDivision}
                playoffTeamCount={divisionEditor.playoffTeamCount}
                poolCount={divisionEditor.poolCount}
                poolTeamCount={derivePoolTeamCount(
                    eventData.singleDivision
                        ? eventData.maxParticipants
                        : divisionEditor.maxParticipants,
                    divisionEditor.poolCount,
                )}
                maxStandardNumber={maxStandardNumber}
                numberInputStyles={numberInputStyles}
                disabled={isImmutableField('divisions') || !divisionEditorReady}
                playoffTeamCountError={playoffTeamCountError}
                onPlayoffTeamCountChange={(playoffTeamCount) => {
                    setDivisionEditor((prev) => ({
                        ...prev,
                        playoffTeamCount,
                        error: null,
                    }));
                }}
                onPoolCountChange={(poolCount) => {
                    setDivisionEditor((prev) => ({
                        ...prev,
                        poolCount,
                        error: null,
                    }));
                }}
            />
            <DivisionEditorTournamentConfigControls
                poolConfigVisible={showOperationalControls && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && !eventData.singleDivision}
                tournamentConfigVisible={showOperationalControls && eventData.eventType === 'TOURNAMENT' && !eventData.singleDivision}
                leagueData={divisionEditor.leagueConfig}
                tournamentData={buildTournamentConfig(divisionEditor.playoffConfig)}
                sport={eventData.sportConfig ?? undefined}
                participantCount={divisionEditor.maxParticipants ?? undefined}
                divisionName={divisionEditor.name}
                phaseSettings={divisionEditor.phaseSettings}
                eventMatchRulesOverride={eventData.matchRulesOverride}
                officialPositions={eventData.officialPositions}
                autoCreatePointMatchIncidents={eventData.autoCreatePointMatchIncidents}
                disabled={isImmutableField('divisions') || !divisionEditorReady}
                onLeagueDataChange={setDivisionEditorLeagueConfig}
                onTournamentDataChange={setDivisionEditorPlayoffConfig}
                onPhaseSettingsChange={handlePhaseSettingsChange}
            />
        </motion.div>
        <SingleDivisionEditorNotice
            visible={showSingleDivisionNotice && eventData.singleDivision}
            eventType={eventData.eventType}
        />
    </AnimatedSection>
    );
};
