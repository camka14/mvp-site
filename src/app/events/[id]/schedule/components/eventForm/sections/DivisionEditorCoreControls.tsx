import type { ComponentProps } from 'react';
import {
    NumberInput,
    Select as MantineSelect,
    Text,
    TextInput,
} from '@mantine/core';

import CentsInput from '@/components/ui/CentsInput';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import type { Event } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';

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
    taxable: boolean;
    divisionEditorReady: boolean;
    divisionsImmutable: boolean;
    hasStripeAccount: boolean;
    maxStandardNumber: number;
    maxPriceCents: number;
    maxMediumTextLength: number;
    divisionMaxParticipantsWarning?: string | null;
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
    taxable,
    divisionEditorReady,
    divisionsImmutable,
    hasStripeAccount,
    maxStandardNumber,
    maxPriceCents,
    maxMediumTextLength,
    divisionMaxParticipantsWarning,
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
            className="md:col-span-4"
            maw={280}
            comboboxProps={comboboxProps}
            disabled={divisionsImmutable}
            onChange={(value) => onGenderChange((value as '' | 'M' | 'F' | 'C') || '')}
        />
        <MantineSelect
            label="Skill Division"
            placeholder="Select skill division"
            data={skillDivisionTypeOptions}
            value={skillDivisionTypeId || null}
            className="md:col-span-4"
            maw={280}
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
            className="md:col-span-4"
            maw={320}
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
            className="md:col-span-6"
            maw={520}
            maxLength={maxMediumTextLength}
            disabled={divisionsImmutable || !divisionEditorReady}
            onChange={(event) => onNameChange(event.currentTarget.value)}
        />
        <AnimatedLayoutSection in={!singleDivision} className="md:col-span-3">
            <NumberInput
                label={teamSignup ? 'Division Max Teams' : 'Division Max Participants'}
                min={0}
                max={maxStandardNumber}
                value={maxParticipants ?? ''}
                w="100%"
                maw={220}
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
            in={!singleDivision && !allowPaymentPlans}
            className="md:col-span-3 md:col-start-1"
        >
            <div>
                <CentsInput
                    label="Division Price"
                    maxCents={maxPriceCents}
                    value={price}
                    maw={220}
                    disabled={divisionsImmutable || !divisionEditorReady || !hasStripeAccount}
                    onChange={(nextValue) => {
                        if (divisionsImmutable || !divisionEditorReady || !hasStripeAccount) {
                            return;
                        }
                        onPriceChange(nextValue);
                    }}
                />
                <PriceWithFeesPreview
                    amountCents={price}
                    eventType={eventType}
                    taxable={taxable}
                />
            </div>
        </AnimatedLayoutSection>
    </>
);
