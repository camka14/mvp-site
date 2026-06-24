import type {
    ComponentProps,
    Dispatch,
    SetStateAction,
} from 'react';
import {
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { motion } from 'motion/react';
import {
    type Control,
} from 'react-hook-form';

import type { Event, LeagueConfig, TournamentConfig } from '@/types';

import { DIVISION_LAYOUT_TRANSITION } from '../constants';
import type { EventFormValues } from '../formTypes';
import { SingleDivisionCapacityControls } from './SingleDivisionCapacityControls';
import { SingleDivisionPaymentPlanControls } from './SingleDivisionPaymentPlanControls';
import { SingleDivisionPricingControls } from './SingleDivisionPricingControls';
import { SingleDivisionScheduleControls } from './SingleDivisionScheduleControls';

type SingleDivisionDefaultsPanelProps = {
    control: Control<EventFormValues>;
    eventData: EventFormValues;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    poolDefaults: ComponentProps<typeof SingleDivisionScheduleControls>['poolDefaults'];
    eventTaxableForPreview: boolean;
    maxStandardNumber: number;
    maxPriceCents: number;
    numberInputStyles?: ComponentProps<typeof SingleDivisionCapacityControls>['numberInputStyles'];
    hasStripeAccount: boolean;
    organizerTaxCollectionAllowed: boolean;
    organizerResponsibilityMessage?: string | null;
    isOrganizationHostedEvent: boolean;
    organizerManualTaxSelected: boolean;
    organizationDefaultEventTaxHandling: ComponentProps<typeof SingleDivisionPricingControls>['organizationDefaultEventTaxHandling'];
    connectingStripe: boolean;
    isImmutableField: (field: keyof Event) => boolean;
    playoffTeamCountError?: string;
    setLeagueData: Dispatch<SetStateAction<LeagueConfig>>;
    setPlayoffData: Dispatch<SetStateAction<TournamentConfig>>;
    setTournamentData: Dispatch<SetStateAction<TournamentConfig>>;
    onPoolDefaultsChange: ComponentProps<typeof SingleDivisionScheduleControls>['onPoolDefaultsChange'];
    onConnectStripe: () => void;
    syncInstallmentCount: (count: number) => void;
    onAllowPaymentPlansChange: ComponentProps<typeof SingleDivisionPaymentPlanControls>['onAllowPaymentPlansChange'];
    onInstallmentDueRelativeDayChange: ComponentProps<typeof SingleDivisionPaymentPlanControls>['onInstallmentDueRelativeDayChange'];
    onInstallmentDueDateChange: ComponentProps<typeof SingleDivisionPaymentPlanControls>['onInstallmentDueDateChange'];
    onInstallmentAmountChange: ComponentProps<typeof SingleDivisionPaymentPlanControls>['onInstallmentAmountChange'];
    onRemoveInstallment: ComponentProps<typeof SingleDivisionPaymentPlanControls>['onRemoveInstallment'];
    onTeamSplitDefaultChange: ComponentProps<typeof SingleDivisionPaymentPlanControls>['onTeamSplitDefaultChange'];
};

export const SingleDivisionDefaultsPanel = ({
    control,
    eventData,
    leagueData,
    playoffData,
    tournamentData,
    poolDefaults,
    eventTaxableForPreview,
    maxStandardNumber,
    maxPriceCents,
    numberInputStyles,
    hasStripeAccount,
    organizerTaxCollectionAllowed,
    organizerResponsibilityMessage,
    isOrganizationHostedEvent,
    organizerManualTaxSelected,
    organizationDefaultEventTaxHandling,
    connectingStripe,
    isImmutableField,
    playoffTeamCountError,
    setLeagueData,
    setPlayoffData,
    setTournamentData,
    onPoolDefaultsChange,
    onConnectStripe,
    syncInstallmentCount,
    onAllowPaymentPlansChange,
    onInstallmentDueRelativeDayChange,
    onInstallmentDueDateChange,
    onInstallmentAmountChange,
    onRemoveInstallment,
    onTeamSplitDefaultChange,
}: SingleDivisionDefaultsPanelProps) => (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
        <Stack gap="md">
            <div>
                <Title order={6}>Single Division</Title>
                <Text size="sm" c="dimmed">
                    Price, capacity, and payment plans apply to every selected division.
                </Text>
            </div>
            <motion.div
                id="division-defaults-content"
                layout
                className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start"
                transition={DIVISION_LAYOUT_TRANSITION}
            >
                <SingleDivisionCapacityControls
                    control={control}
                    singleDivision={Boolean(eventData.singleDivision)}
                    teamSignup={Boolean(eventData.teamSignup)}
                    eventType={eventData.eventType}
                    includePlayoffs={Boolean(leagueData.includePlayoffs)}
                    playoffTeamCount={leagueData.playoffTeamCount}
                    maxStandardNumber={maxStandardNumber}
                    numberInputStyles={numberInputStyles}
                    maxParticipantsDisabled={isImmutableField('maxParticipants')}
                    playoffTeamCountDisabled={isImmutableField('playoffTeamCount')}
                    playoffTeamCountError={playoffTeamCountError}
                    onPlayoffTeamCountChange={(playoffTeamCount) => {
                        setLeagueData((prev) => ({
                            ...prev,
                            playoffTeamCount,
                        }));
                    }}
                />
                <SingleDivisionScheduleControls
                    singleDivision={Boolean(eventData.singleDivision)}
                    eventType={eventData.eventType}
                    includePlayoffs={Boolean(leagueData.includePlayoffs)}
                    splitLeaguePlayoffDivisions={eventData.splitLeaguePlayoffDivisions}
                    leagueData={leagueData}
                    playoffData={playoffData}
                    tournamentData={tournamentData}
                    sport={eventData.sportConfig ?? undefined}
                    participantCount={eventData.maxParticipants ?? undefined}
                    poolDefaults={poolDefaults}
                    maxStandardNumber={maxStandardNumber}
                    numberInputStyles={numberInputStyles}
                    disabled={isImmutableField('divisions')}
                    onLeagueDataChange={(updates) => setLeagueData((prev) => ({ ...prev, ...updates }))}
                    onPlayoffDataChange={setPlayoffData}
                    onTournamentDataChange={setTournamentData}
                    onPoolDefaultsChange={onPoolDefaultsChange}
                />
                <SingleDivisionPricingControls
                    visible={Boolean(eventData.singleDivision) && !eventData.allowPaymentPlans}
                    control={control}
                    priceCents={eventData.price}
                    eventType={eventData.eventType}
                    taxable={eventTaxableForPreview}
                    maxPriceCents={maxPriceCents}
                    numberInputStyles={numberInputStyles}
                    hasStripeAccount={hasStripeAccount}
                    priceImmutable={isImmutableField('price')}
                    organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                    organizerResponsibilityMessage={organizerResponsibilityMessage}
                    showTaxHandlingControls={isOrganizationHostedEvent || organizerTaxCollectionAllowed}
                    organizerManualTaxSelected={organizerManualTaxSelected}
                    organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                    connectingStripe={connectingStripe}
                    onConnectStripe={onConnectStripe}
                />
                <SingleDivisionPaymentPlanControls
                    allowPaymentPlans={eventData.allowPaymentPlans}
                    installmentCount={eventData.installmentCount || 0}
                    installmentAmounts={eventData.installmentAmounts || []}
                    installmentDueDates={eventData.installmentDueDates || []}
                    installmentDueRelativeDays={eventData.installmentDueRelativeDays || []}
                    teamSignup={eventData.teamSignup}
                    allowTeamSplitDefault={eventData.allowTeamSplitDefault}
                    eventType={eventData.eventType}
                    parentEvent={eventData.parentEvent}
                    eventStart={eventData.start}
                    taxable={eventTaxableForPreview}
                    hasStripeAccount={hasStripeAccount}
                    maxStandardNumber={maxStandardNumber}
                    maxPriceCents={maxPriceCents}
                    onAllowPaymentPlansChange={onAllowPaymentPlansChange}
                    onInstallmentCountChange={(count) => syncInstallmentCount(count)}
                    onTeamSplitDefaultChange={onTeamSplitDefaultChange}
                    onInstallmentDueRelativeDayChange={onInstallmentDueRelativeDayChange}
                    onInstallmentDueDateChange={onInstallmentDueDateChange}
                    onInstallmentAmountChange={onInstallmentAmountChange}
                    onRemoveInstallment={onRemoveInstallment}
                    onAddInstallment={() => syncInstallmentCount((eventData.installmentAmounts?.length || 0) + 1)}
                />
            </motion.div>
        </Stack>
    </div>
);
