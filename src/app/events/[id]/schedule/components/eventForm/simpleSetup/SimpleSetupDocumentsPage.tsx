'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { Alert, MultiSelect, Stack, Text, Title } from '@mantine/core';

import type { Event } from '@/types';

import type { EventFormValues } from '../formTypes';

type SimpleSetupDocumentsPageProps = {
    control: Control<EventFormValues>;
    templatesLoading: boolean;
    templatesError?: string | null;
    templateOrganizationId?: string | null;
    templateOptions: Array<{ value: string; label: string }>;
    comboboxProps?: ComponentProps<typeof MultiSelect>['comboboxProps'];
    showDocuments: boolean;
    showQuestions: boolean;
    registrationQuestionsEditor: ReactNode;
    isImmutableField: (key: keyof Event) => boolean;
};

export const SimpleSetupDocumentsPage = ({
    control,
    templatesLoading,
    templatesError,
    templateOrganizationId,
    templateOptions,
    comboboxProps,
    showDocuments,
    showQuestions,
    registrationQuestionsEditor,
    isImmutableField,
}: SimpleSetupDocumentsPageProps) => (
    <Stack gap="lg">
        <div>
            <Title order={4}>Registration requirements</Title>
            <Text size="sm" c="dimmed">
                Configure the document acknowledgements and questions selected on Registration Plan.
            </Text>
        </div>
        {showDocuments ? (
            <Controller
                name="requiredTemplateIds"
                control={control}
                render={({ field }) => (
                    <MultiSelect
                        label="Required documents"
                        placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
                        data={templateOptions}
                        value={field.value ?? []}
                        disabled={!templateOrganizationId || templatesLoading || isImmutableField('requiredTemplateIds')}
                        comboboxProps={comboboxProps}
                        onChange={field.onChange}
                        searchable
                        clearable
                    />
                )}
            />
        ) : null}
        {templatesError ? <Alert color="red">{templatesError}</Alert> : null}
        {showDocuments && !templatesLoading && templateOrganizationId && templateOptions.length === 0 ? (
            <Text size="sm" c="dimmed">No document templates exist for this organization yet.</Text>
        ) : null}
        {showQuestions ? registrationQuestionsEditor : null}
    </Stack>
);
