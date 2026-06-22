import {
    Alert,
    Button,
    Checkbox,
    Collapse,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import type { RegistrationQuestionDraft } from '@/types';

import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type RegistrationQuestionsSectionProps = {
    collapsed: boolean;
    questions: RegistrationQuestionDraft[];
    loading: boolean;
    error?: string | null;
    onToggle: () => void;
    onAddQuestion: () => void;
    onPromptChange: (index: number, prompt: string) => void;
    onRequiredChange: (index: number, required: boolean) => void;
    onRemoveQuestion: (index: number) => void;
};

export const RegistrationQuestionsSection = ({
    collapsed,
    questions,
    loading,
    error,
    onToggle,
    onAddQuestion,
    onPromptChange,
    onRequiredChange,
    onRemoveQuestion,
}: RegistrationQuestionsSectionProps) => (
    <Paper id="section-registration-questions" withBorder radius="md" p="sm" className="scroll-mt-20 bg-white sm:col-span-2">
        <div className="flex items-center justify-between gap-3">
            <div>
                <Text fw={600} size="sm">Registration questions</Text>
                <Text size="xs" c="dimmed">Players answer these during event registration.</Text>
            </div>
            <Group gap="xs" wrap="nowrap">
                <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    aria-expanded={!collapsed}
                    aria-controls="section-registration-questions-content"
                    onClick={onToggle}
                >
                    {collapsed ? 'Expand' : 'Collapse'}
                </Button>
                <Button
                    type="button"
                    size="xs"
                    onClick={onAddQuestion}
                >
                    Add Question
                </Button>
            </Group>
        </div>
        <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
            <Stack id="section-registration-questions-content" gap="sm" mt="md">
                {error ? (
                    <Alert color="red" variant="light">
                        {error}
                    </Alert>
                ) : null}
                {loading ? (
                    <Group gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading questions...</Text>
                    </Group>
                ) : null}
                {questions.length > 0 ? (
                    <Stack gap="sm">
                        {questions.map((question, index) => (
                            <Stack key={question.id ?? index} gap="xs">
                                <Textarea
                                    label={`Question ${index + 1}`}
                                    value={question.prompt ?? ''}
                                    autosize
                                    minRows={2}
                                    maxLength={500}
                                    onChange={(event) => onPromptChange(index, event.currentTarget.value)}
                                />
                                <Group justify="space-between" align="center" gap="sm" wrap="wrap">
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
                ) : (
                    <Text size="sm" c="dimmed">
                        No registration questions configured.
                    </Text>
                )}
            </Stack>
        </Collapse>
    </Paper>
);
