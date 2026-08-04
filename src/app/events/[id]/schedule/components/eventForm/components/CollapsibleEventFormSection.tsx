import type { ReactNode } from 'react';
import { Badge, Button, Collapse, Paper, Text } from '@mantine/core';

import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type CollapsibleEventFormSectionProps = {
    id: string;
    title: string;
    collapsed: boolean;
    onToggle: () => void;
    errorCount?: number;
    firstErrorMessage?: string;
    contentClassName?: string;
    children: ReactNode;
};

export const CollapsibleEventFormSection = ({
    id,
    title,
    collapsed,
    onToggle,
    errorCount = 0,
    firstErrorMessage,
    contentClassName,
    children,
}: CollapsibleEventFormSectionProps) => {
    const contentId = `${id}-content`;
    const titleId = `${id}-title`;
    const hasErrors = errorCount > 0;
    const issueLabel = `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`;

    return (
        <Paper
            id={id}
            aria-labelledby={titleId}
            data-error-count={errorCount}
            shadow="xs"
            radius="md"
            withBorder
            p="lg"
            className="scroll-mt-20 bg-gray-50"
            style={hasErrors ? { borderColor: 'var(--mantine-color-red-6)' } : undefined}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 id={titleId} className="text-lg font-semibold">{title}</h3>
                        {hasErrors ? (
                            <Badge color="red" variant="light" aria-label={`${title}: ${issueLabel}`}>
                                {issueLabel}
                            </Badge>
                        ) : null}
                    </div>
                    {hasErrors && firstErrorMessage ? (
                        <Text size="xs" c="red.7" mt={4}>
                            {firstErrorMessage}
                        </Text>
                    ) : null}
                </div>
                <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    aria-expanded={!collapsed}
                    aria-controls={contentId}
                    onClick={onToggle}
                >
                    {collapsed ? 'Expand' : 'Collapse'}
                </Button>
            </div>
            <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                <div id={contentId} className={contentClassName}>
                    {children}
                </div>
            </Collapse>
        </Paper>
    );
};
