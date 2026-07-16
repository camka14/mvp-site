'use client';

import { Controller } from 'react-hook-form';
import {
    Alert,
    Button,
    Group,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';

import { normalizeManualPaymentProvider } from '@/lib/manualRegistrationPayments';

import { EventDetailsLocationControls } from '../sections/EventDetailsLocationControls';
import { EventDetailsTimingControls } from '../sections/EventDetailsTimingControls';
import type { EventFormSectionsProps } from '../sections/EventFormSections';
import { SingleDivisionDefaultsPanel } from '../sections/SingleDivisionDefaultsPanel';
import { sumInstallmentAmounts } from '../paymentPlanHelpers';
import { normalizeNumber } from '../configDefaults';

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
};

export const SimpleSetupPricingRegistrationPage = ({
    model,
}: SimpleSetupPricingRegistrationPageProps) => {
    const {
        configurationActions,
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
        manualPaymentLinks,
        manualPaymentsEnabled,
        organizationDefaultEventTaxHandling,
        organizerManualTaxSelected,
        organizerTaxCollectionAllowed,
        pricingControlsEnabled,
        removeInstallment,
        removeManualPaymentLink,
        setInstallmentAmount,
        setInstallmentDueDate,
        setInstallmentDueRelativeDay,
        setManualPaymentLinkValue,
        syncInstallmentCount,
        addManualPaymentLink,
    } = paymentController;
    const {
        handleManualPaymentsChange,
        showManualPaymentsSection,
    } = sectionsController;
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
                    onManualPaymentsChange={handleManualPaymentsChange}
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

            {eventData.singleDivision && !model.isAffiliateEvent ? (
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
                    hasStripeAccount={pricingControlsEnabled}
                    organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                    organizerResponsibilityMessage={eventTaxPolicyForPreview.organizerResponsibilityMessage}
                    isOrganizationHostedEvent={model.resourceController.isOrganizationHostedEvent}
                    organizerManualTaxSelected={organizerManualTaxSelected}
                    organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                    connectingStripe={connectingStripe}
                    simplifiedPricing
                    showCapacityControls={false}
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
            ) : (
                <Alert color="blue" variant="light">
                    {model.isAffiliateEvent
                        ? 'External listings manage payment on the linked registration site.'
                        : 'Each division owns its price and payment plan. Edit those values on the Divisions page.'}
                </Alert>
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
                    {manualPaymentLinks.map((link, index) => (
                        <Group key={link.id || index} align="flex-end" grow>
                            <Select
                                label={index === 0 ? 'Provider' : undefined}
                                value={normalizeManualPaymentProvider(link.provider)}
                                data={[
                                    { value: 'CASH_APP', label: 'Cash App' },
                                    { value: 'VENMO', label: 'Venmo' },
                                    { value: 'PAYPAL', label: 'PayPal' },
                                    { value: 'STRIPE', label: 'Stripe' },
                                    { value: 'ZELLE', label: 'Zelle' },
                                    { value: 'OTHER', label: 'Other' },
                                ]}
                                onChange={(value) => setManualPaymentLinkValue(index, 'provider', value ?? 'OTHER')}
                            />
                            <TextInput
                                label={index === 0 ? 'Label' : undefined}
                                value={link.label ?? ''}
                                onChange={(event) => setManualPaymentLinkValue(
                                    index,
                                    'label',
                                    event.currentTarget.value,
                                )}
                            />
                            <TextInput
                                label={index === 0 ? 'Payment destination' : undefined}
                                value={link.url ?? ''}
                                placeholder="Username or https://..."
                                onChange={(event) => setManualPaymentLinkValue(
                                    index,
                                    'url',
                                    event.currentTarget.value,
                                )}
                            />
                            <Button
                                type="button"
                                variant="subtle"
                                color="red"
                                onClick={() => removeManualPaymentLink(index)}
                            >
                                Remove
                            </Button>
                        </Group>
                    ))}
                    <Group justify="flex-start">
                        <Button type="button" variant="default" onClick={addManualPaymentLink}>
                            Add payment destination
                        </Button>
                    </Group>
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
