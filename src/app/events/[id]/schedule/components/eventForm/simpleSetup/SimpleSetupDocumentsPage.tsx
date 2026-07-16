'use client';

import type { ComponentProps } from 'react';
import { Controller, type Control } from 'react-hook-form';
import {
    Alert,
    Button,
    Checkbox,
    Group,
    Loader,
    MultiSelect,
    Stack,
    Text,
    Textarea,
    Title,
} from '@mantine/core';

import type { Event, RegistrationQuestionDraft } from '@/types';

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
    questions: RegistrationQuestionDraft[];
    questionsLoading: boolean;
    questionsError?: string | null;
    onAddQuestion: () => void;
    onPromptChange: (index: number, prompt: string) => void;
    onRequiredChange: (index: number, required: boolean) => void;
    onRemoveQuestion: (index: number) => void;
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
    questions,
    questionsLoading,
    questionsError,
    onAddQuestion,
    onPromptChange,
    onRequiredChange,
    onRemoveQuestion,
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
        {showQuestions ? (
            <Stack gap="sm">
                <Group justify="space-between" align="center">
                    <div>
                        <Text fw={600} size="sm">Registration questions</Text>
                        <Text size="xs" c="dimmed">Participants answer these during event registration.</Text>
                    </div>
                    <Button type="button" size="xs" onClick={onAddQuestion}>
                        Add question
                    </Button>
                </Group>
                {questionsError ? <Alert color="red">{questionsError}</Alert> : null}
                {questionsLoading ? (
                    <Group gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading questions...</Text>
                    </Group>
                ) : null}
                {!questionsLoading && questions.length === 0 ? (
                    <Text size="sm" c="dimmed">No registration questions configured.</Text>
                ) : null}
                {questions.map((question, index) => (
                    <Stack key={question.id ?? index} gap="xs" p="sm" className="rounded-md border border-gray-200">
                        <Textarea
                            label={`Question ${index + 1}`}
                            value={question.prompt ?? ''}
                            autosize
                            minRows={2}
                            maxLength={500}
                            onChange={(event) => onPromptChange(index, event.currentTarget.value)}
                        />
                        <Group justify="space-between" align="center">
                            <Checkbox
                                label="Required"
                                checked={Boolean(question.required)}
                                onChange={(event) => onRequiredChange(index, event.currentTarget.checked)}
                            />
                            <Button
                                type="button"
                                variant="subtle"
                                color="red"
                                size="xs"
                                onClick={() => onRemoveQuestion(index)}
                            >
                                Remove
                            </Button>
                        </Group>
                    </Stack>
                ))}
            </Stack>
        ) : null}
    </Stack>
);
