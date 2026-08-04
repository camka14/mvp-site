import type { ComponentProps } from 'react';
import {
    NumberInput,
    Select as MantineSelect,
    Text,
    TextInput,
} from '@mantine/core';

import CentsInput from '@/components/ui/CentsInput';
import HostPriceInput from '@/components/ui/HostPriceInput';
import type { Event } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import {
    DIVISION_ALIGNED_INPUT_STYLES,
    DIVISION_COMPACT_FIELD_CLASS,
    DIVISION_MEDIUM_FIELD_CLASS,
    DIVISION_NAME_FIELD_CLASS,
    DIVISION_NUMBER_FIELD_CLASS,
    DIVISION_PRICE_FIELD_CLASS,
} from '../divisionLayout';

type DivisionEditorCoreControlsProps = {
    gender: string;
    skillDivisionTypeId: string;
    ageDivisionTypeId: string;
    name: string;
    maxParticipants?: number | null;
    price: number;
    allowPaymentPlans: boolean;
    singleDivision: boolean;
    teamSignup: boolean;
    eventType: Event['eventType'];
    divisionEditorReady: boolean;
    divisionsImmutable: boolean;
    hasStripeAccount: boolean;
    maxStandardNumber: number;
    maxPriceCents: number;
    maxMediumTextLength: number;
    divisionMaxParticipantsWarning?: string | null;
    hideCapacity?: boolean;
    hidePrice?: boolean;
    simplePriceInput?: boolean;
    showCapacityForSingleDivision?: boolean;
    showPriceForSingleDivision?: boolean;
    genderOptions: ComponentProps<typeof MantineSelect>['data'];
    skillDivisionTypeOptions: ComponentProps<typeof MantineSelect>['data'];
    ageDivisionTypeOptions: ComponentProps<typeof MantineSelect>['data'];
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    onGenderChange: (value: '' | 'M' | 'F' | 'C') => void;
    onSkillDivisionChange: (value: string) => void;
    onAgeDivisionChange: (value: string) => void;
    onNameChange: (value: string) => void;
    onMaxParticipantsChange: (value: string | number) => void;
    onPriceChange: (value: number) => void;
};

export const DivisionEditorCoreControls = ({
    gender,
    skillDivisionTypeId,
    ageDivisionTypeId,
    name,
    maxParticipants,
    price,
    allowPaymentPlans,
    singleDivision,
    teamSignup,
    eventType,
    divisionEditorReady,
    divisionsImmutable,
    hasStripeAccount,
    maxStandardNumber,
    maxPriceCents,
    maxMediumTextLength,
    divisionMaxParticipantsWarning,
    hideCapacity = false,
    hidePrice = false,
    simplePriceInput = false,
    showCapacityForSingleDivision = false,
    showPriceForSingleDivision = false,
    genderOptions,
    skillDivisionTypeOptions,
    ageDivisionTypeOptions,
    comboboxProps,
    onGenderChange,
    onSkillDivisionChange,
    onAgeDivisionChange,
    onNameChange,
    onMaxParticipantsChange,
    onPriceChange,
}: DivisionEditorCoreControlsProps) => (
    <>
        <MantineSelect
            label="Gender"
            placeholder="Select gender"
            data={genderOptions}
            value={gender || null}
            className={DIVISION_COMPACT_FIELD_CLASS}
            styles={DIVISION_ALIGNED_INPUT_STYLES}
            comboboxProps={comboboxProps}
            disabled={divisionsImmutable}
            onChange={(value) => onGenderChange((value as '' | 'M' | 'F' | 'C') || '')}
        />
        <MantineSelect
            label="Skill Division"
            placeholder="Select skill division"
            data={skillDivisionTypeOptions}
            value={skillDivisionTypeId || null}
            className={DIVISION_MEDIUM_FIELD_CLASS}
            styles={DIVISION_ALIGNED_INPUT_STYLES}
            comboboxProps={comboboxProps}
            disabled={divisionsImmutable}
            searchable
            allowDeselect={false}
            onChange={(value) => onSkillDivisionChange(value || '')}
        />
        <MantineSelect
            label="Age Division"
            placeholder="Select age division"
            data={ageDivisionTypeOptions}
            value={ageDivisionTypeId || null}
            className={DIVISION_MEDIUM_FIELD_CLASS}
            styles={DIVISION_ALIGNED_INPUT_STYLES}
            comboboxProps={comboboxProps}
            disabled={divisionsImmutable}
            searchable
            allowDeselect={false}
            onChange={(value) => onAgeDivisionChange(value || '')}
        />
        <TextInput
            label="Division Name"
            placeholder="Division display name"
            value={name}
            className={DIVISION_NAME_FIELD_CLASS}
            styles={DIVISION_ALIGNED_INPUT_STYLES}
            maxLength={maxMediumTextLength}
            disabled={divisionsImmutable || !divisionEditorReady}
            onChange={(event) => onNameChange(event.currentTarget.value)}
        />
        <AnimatedLayoutSection
            in={!hideCapacity && (!singleDivision || showCapacityForSingleDivision)}
            className={DIVISION_NUMBER_FIELD_CLASS}
        >
            <NumberInput
                label={teamSignup ? 'Division Max Teams' : 'Division Max Participants'}
                min={0}
                max={maxStandardNumber}
                value={maxParticipants ?? ''}
                w="100%"
                styles={DIVISION_ALIGNED_INPUT_STYLES}
                clampBehavior="strict"
                disabled={divisionsImmutable || !divisionEditorReady}
                onChange={(value) => {
                    if (divisionsImmutable || !divisionEditorReady) {
                        return;
                    }
                    onMaxParticipantsChange(value);
                }}
            />
            {divisionMaxParticipantsWarning ? (
                <Text size="xs" c="orange.7" mt={4}>
                    {divisionMaxParticipantsWarning}
                </Text>
            ) : null}
        </AnimatedLayoutSection>
        <AnimatedLayoutSection
            in={!hidePrice && (!singleDivision || showPriceForSingleDivision) && !allowPaymentPlans}
            className={DIVISION_PRICE_FIELD_CLASS}
        >
            <div>
                {simplePriceInput ? (
                    <CentsInput
                        label="Registration price"
                        maxCents={maxPriceCents}
                        value={price}
                        disabled={divisionsImmutable || !divisionEditorReady}
                        onChange={(nextValue) => {
                            if (divisionsImmutable || !divisionEditorReady) {
                                return;
                            }
                            onPriceChange(nextValue);
                        }}
                    />
                ) : (
                    <HostPriceInput
                        hostLabel="Host take-home"
                        totalLabel="Division price"
                        eventType={eventType}
                        maxCents={maxPriceCents}
                        value={price}
                        disabled={divisionsImmutable || !divisionEditorReady || !hasStripeAccount}
                        onChange={(nextValue) => {
                            if (divisionsImmutable || !divisionEditorReady || !hasStripeAccount) {
                                return;
                            }
                            onPriceChange(nextValue);
                        }}
                    />
                )}
            </div>
        </AnimatedLayoutSection>
    </>
);
