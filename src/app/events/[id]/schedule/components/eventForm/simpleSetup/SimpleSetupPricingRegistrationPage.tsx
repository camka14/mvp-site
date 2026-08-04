'use client';

import { Controller } from 'react-hook-form';
import {
    Alert,
    Stack,
    Text,
    Textarea,
    Title,
} from '@mantine/core';

import { EventDetailsLocationControls } from '../sections/EventDetailsLocationControls';
import { EventDetailsTimingControls } from '../sections/EventDetailsTimingControls';
import type { EventFormSectionsProps } from '../sections/EventFormSections';
import { ManualPaymentDestinationEditor } from '../sections/ManualPaymentDestinationEditor';
import { SingleDivisionDefaultsPanel } from '../sections/SingleDivisionDefaultsPanel';
import { sumInstallmentAmounts } from '../paymentPlanHelpers';
import { normalizeNumber } from '../configDefaults';
import { SimpleSetupDivisionPricingList } from './SimpleSetupDivisionPricingList';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
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

type SimpleSetupPricingRegistrationPageProps = {
    model: EventFormSectionsProps;
    paidRegistration: boolean;
};

export const SimpleSetupPricingRegistrationPage = ({
    model,
    paidRegistration,
}: SimpleSetupPricingRegistrationPageProps) => {
    const {
        control,
        divisionController,
        eventData,
        fieldWriters,
        isImmutableField,
        paymentController,
        sectionsController,
        setValue,
    } = model;
    const {
        connectStripe,
        connectingStripe,
        eventTaxableForPreview,
        eventTaxPolicyForPreview,
        hasStripeAccount,
        manualPaymentLinks,
        manualPaymentsEnabled,
        organizationDefaultEventTaxHandling,
        organizerManualTaxSelected,
        organizerTaxCollectionAllowed,
        removeInstallment,
        removeManualPaymentLink,
        setInstallmentAmount,
        setInstallmentDueDate,
        setInstallmentDueRelativeDay,
        setManualPaymentLinkValue,
        syncInstallmentCount,
        addManualPaymentLink,
    } = paymentController;
    const { showManualPaymentsSection } = sectionsController;
    const {
        setLeagueData,
        setPlayoffData,
        setTournamentData,
    } = fieldWriters;

    return (
        <Stack gap="xl">
            <div>
                <Title order={4}>Pricing and registration</Title>
                <Text size="sm" c="dimmed">
                    Configure registration timing, age limits, pricing, payment plans, and refunds.
                </Text>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
                <EventDetailsTimingControls
                    control={control}
                    eventType={eventData.eventType}
                    startValue={eventData.start}
                    noFixedEndDateTime={Boolean(eventData.noFixedEndDateTime)}
                    supportsNoFixedEndDateTime={model.presentation.supportsNoFixedEndDateTime}
                    automaticRefundsAvailable={paymentController.automaticRefundsAvailable}
                    manualPaymentsEnabled={manualPaymentsEnabled}
                    todaysDate={new Date(new Date().setHours(0, 0, 0, 0))}
                    maxStandardNumber={MAX_STANDARD_NUMBER}
                    dateTimePickerStyles={alignedDetailsFieldStyles}
                    numberInputStyles={alignedDetailsFieldStyles}
                    popoverProps={sharedPopoverProps}
                    isImmutableField={isImmutableField}
                    onStartChange={() => undefined}
                    onEndChange={() => undefined}
                    onNoFixedEndDateTimeChange={() => undefined}
                    showScheduleControls={false}
                    showRegistrationControls
                />
            </div>

            <EventDetailsLocationControls
                control={control}
                coordinates={eventData.coordinates}
                coordinatesSelected
                onSelectedAddressChange={() => undefined}
                isLocationImmutable
                isImmutableField={isImmutableField}
                templatesLoading={false}
                templateOptions={[]}
                comboboxProps={sharedComboboxProps}
                maxStandardNumber={MAX_STANDARD_NUMBER}
                normalizeNumberValue={normalizeNumber}
                minAge={eventData.minAge}
                maxAge={eventData.maxAge}
                showLocationMap={false}
                showAffiliateListingControls={false}
                showRequiredDocumentControls={false}
                showAgeControls
                showRegistrationQuestions={false}
                showCapacityWarning={false}
                registrationQuestionsEditor={null}
                hasUnsetTeamCapacityLimits={false}
                teamSignup={Boolean(eventData.teamSignup)}
            />

            {!paidRegistration ? (
                <Alert color="blue" variant="light">
                    Registration is free. Turn on Paid registration in Registration Plan to configure prices and payment methods.
                </Alert>
            ) : eventData.singleDivision && !model.isAffiliateEvent ? (
                <SingleDivisionDefaultsPanel
                    control={control}
                    eventData={eventData}
                    leagueData={eventData.leagueData}
                    playoffData={eventData.playoffData}
                    tournamentData={eventData.tournamentData}
                    poolDefaults={divisionController.singleDivisionPoolPlayDefaults}
                    eventTaxableForPreview={eventTaxableForPreview}
                    maxStandardNumber={MAX_STANDARD_NUMBER}
                    maxPriceCents={MAX_PRICE_CENTS}
                    numberInputStyles={alignedDetailsFieldStyles}
                    hasStripeAccount={hasStripeAccount}
                    organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                    organizerResponsibilityMessage={eventTaxPolicyForPreview.organizerResponsibilityMessage}
                    isOrganizationHostedEvent={model.resourceController.isOrganizationHostedEvent}
                    organizerManualTaxSelected={organizerManualTaxSelected}
                    organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                    connectingStripe={connectingStripe}
                    simplifiedPricing={manualPaymentsEnabled}
                    showCapacityControls={false}
                    showPaymentPlanControls={!manualPaymentsEnabled}
                    showScheduleControls={false}
                    title="Registration price"
                    description="This price and payment plan apply to the shared division."
                    isImmutableField={isImmutableField}
                    setLeagueData={setLeagueData}
                    setPlayoffData={setPlayoffData}
                    setTournamentData={setTournamentData}
                    onPoolDefaultsChange={divisionController.updateSingleDivisionTournamentPoolDefaults}
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
                    onTeamSplitDefaultChange={(checked) => setValue('allowTeamSplitDefault', checked, {
                        shouldDirty: true,
                        shouldValidate: true,
                    })}
                />
            ) : model.isAffiliateEvent ? (
                <Alert color="blue" variant="light">
                    External listings manage payment on the linked registration site.
                </Alert>
            ) : (
                <SimpleSetupDivisionPricingList
                    eventData={eventData}
                    hasStripeAccount={hasStripeAccount}
                    manualPaymentsEnabled={manualPaymentsEnabled}
                    eventTaxableForPreview={eventTaxableForPreview}
                    connectingStripe={connectingStripe}
                    disabled={isImmutableField('divisions')}
                    maxPriceCents={MAX_PRICE_CENTS}
                    maxStandardNumber={MAX_STANDARD_NUMBER}
                    onConnectStripe={connectStripe}
                    setValue={setValue}
                />
            )}

            {showManualPaymentsSection ? (
                <Stack gap="md">
                    <div>
                        <Title order={5}>Manual payment settings</Title>
                        <Text size="sm" c="dimmed">
                            Provide the payment destinations and instructions registrants should use.
                        </Text>
                    </div>
                    <Alert color="yellow" variant="light">
                        Manual payments are handled outside BracketIQ. The host confirms payment and handles refunds.
                    </Alert>
                    <ManualPaymentDestinationEditor
                        control={control}
                        links={manualPaymentLinks}
                        onAddLink={addManualPaymentLink}
                        onLinkChange={setManualPaymentLinkValue}
                        onRemoveLink={removeManualPaymentLink}
                    />
                    <Controller
                        name="manualPaymentInstructions"
                        control={control}
                        render={({ field }) => (
                            <Textarea
                                label="Manual payment instructions"
                                autosize
                                minRows={3}
                                maxLength={2000}
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                placeholder="Tell registrants what to include and how refunds are handled."
                            />
                        )}
                    />
                </Stack>
            ) : null}
        </Stack>
    );
};
