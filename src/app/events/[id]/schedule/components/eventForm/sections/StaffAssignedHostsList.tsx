import type { UIEvent } from 'react';
import {
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';

import UserCard from '@/components/ui/UserCard';

import {
    type AssignedStaffCard,
    formatStaffRoleLabel,
    formatStaffStatusLabel,
    getStaffStatusColor,
} from '../staffInvites';

type StaffAssignedHostsListProps = {
    cards: AssignedStaffCard[];
    visibleCount: number;
    assistantHostsDisabled: boolean;
    onScroll: (event: UIEvent<HTMLDivElement>) => void;
    onRemoveCard: (card: AssignedStaffCard) => void;
};

export const StaffAssignedHostsList = ({
    cards,
    visibleCount,
    assistantHostsDisabled,
    onScroll,
    onRemoveCard,
}: StaffAssignedHostsListProps) => (
    <Paper withBorder radius="md" p="md" bg="white">
        <Stack gap="sm">
            <Group justify="space-between" align="center">
                <Title order={6}>Host Staff</Title>
                <Badge radius="xl" variant="light">{cards.length}</Badge>
            </Group>
            <div
                className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                onScroll={onScroll}
            >
                {cards.slice(0, visibleCount).map((card) => (
                    <Paper key={card.key} withBorder radius="md" p="sm">
                        <Stack gap="xs">
                            <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                                <div className="flex-1 min-w-0">
                                    {card.user ? (
                                        <UserCard user={card.user} className="!p-0 !shadow-none" />
                                    ) : (
                                        <Stack gap={2}>
                                            <Text fw={600}>{card.displayName}</Text>
                                            {card.email ? <Text size="xs" c="dimmed">{card.email}</Text> : null}
                                        </Stack>
                                    )}
                                </div>
                                {card.status ? (
                                    <Badge radius="xl" variant="light" color={getStaffStatusColor(card.status)}>
                                        {formatStaffStatusLabel(card.status)}
                                    </Badge>
                                ) : null}
                            </Group>
                            <Group gap="xs" wrap="wrap">
                                <Badge variant="outline">{formatStaffRoleLabel(card.role)}</Badge>
                                {card.role !== 'HOST' ? (
                                    <Button
                                        type="button"
                                        variant="subtle"
                                        color="red"
                                        size="xs"
                                        disabled={card.source === 'assigned' ? assistantHostsDisabled : false}
                                        onClick={() => onRemoveCard(card)}
                                    >
                                        Remove
                                    </Button>
                                ) : null}
                            </Group>
                            {card.status === 'failed' ? (
                                <Text size="xs" c="red">
                                    Email likely failed to send. Remove and re-add this invite to retry.
                                </Text>
                            ) : null}
                        </Stack>
                    </Paper>
                ))}
                {cards.length === 0 ? (
                    <Text size="sm" c="dimmed">No host-side staff assigned.</Text>
                ) : null}
            </div>
        </Stack>
    </Paper>
);
