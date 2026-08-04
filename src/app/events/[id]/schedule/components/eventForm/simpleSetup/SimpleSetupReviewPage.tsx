'use client';

import { Alert, Badge, Button, Group, Image, Paper, Stack, Text, Title } from '@mantine/core';

import type { SimpleSetupReviewModel, SimpleSetupReviewRow } from './reviewModel';
import type { EventSetupPageId } from './types';

type SimpleSetupReviewPageProps = {
    model: SimpleSetupReviewModel;
    onEditPage: (pageId: EventSetupPageId) => void;
};

const ReviewRows = ({ rows }: { rows: SimpleSetupReviewRow[] }) => (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]">
        {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="contents">
                <dt className="text-sm font-medium text-gray-600">{row.label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-gray-950">{row.value}</dd>
            </div>
        ))}
    </dl>
);

export const SimpleSetupReviewPage = ({ model, onEditPage }: SimpleSetupReviewPageProps) => (
    <Stack gap="lg">
        <div>
            <Title order={4}>Review the event setup</Title>
            <Text size="sm" c="dimmed">
                Compare each selection below. Use Edit to return to its setup page without losing the draft.
            </Text>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {model.sections.map((section) => (
                <Paper
                    key={section.id}
                    component="section"
                    withBorder
                    radius="md"
                    p="lg"
                    data-testid={`simple-review-section-${section.id}`}
                    className="min-w-0"
                >
                    <Stack gap="md">
                        <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
                            <div className="min-w-0">
                                <Title order={5}>{section.title}</Title>
                                {section.badges?.length ? (
                                    <Group gap="xs" mt="xs">
                                        {section.badges.map((badge) => (
                                            <Badge key={badge} variant="light">{badge}</Badge>
                                        ))}
                                    </Group>
                                ) : null}
                            </div>
                            <Button
                                type="button"
                                variant="subtle"
                                size="xs"
                                aria-label={`Edit ${section.title}`}
                                onClick={() => onEditPage(section.ownerPageId)}
                            >
                                Edit
                            </Button>
                        </Group>

                        {section.warnings.map((warning) => (
                            <Alert key={warning} color="red" variant="light" title="Needs attention">
                                {warning}
                            </Alert>
                        ))}

                        {section.imageUrl ? (
                            <Image
                                src={section.imageUrl}
                                alt="Event preview"
                                radius="md"
                                fit="cover"
                                h={176}
                                maw={320}
                            />
                        ) : null}

                        <ReviewRows rows={section.rows} />

                        {section.groups?.map((group, index) => (
                            <div
                                key={`${group.title ?? 'group'}-${index}`}
                                className="rounded-md border border-gray-200 bg-gray-50 p-4"
                            >
                                {group.title || group.badges?.length ? (
                                    <Group justify="space-between" align="flex-start" gap="sm" mb="sm">
                                        {group.title ? <Text fw={600} size="sm">{group.title}</Text> : <span />}
                                        {group.badges?.length ? (
                                            <Group gap={6} justify="flex-end">
                                                {group.badges.map((badge) => (
                                                    <Badge key={badge} size="sm" variant="outline">{badge}</Badge>
                                                ))}
                                            </Group>
                                        ) : null}
                                    </Group>
                                ) : null}
                                <ReviewRows rows={group.rows} />
                            </div>
                        ))}
                    </Stack>
                </Paper>
            ))}
        </div>

        <Alert color="blue" variant="light">
            Simple and Advanced Setup use the same draft. Switching modes does not discard these values.
        </Alert>
    </Stack>
);
