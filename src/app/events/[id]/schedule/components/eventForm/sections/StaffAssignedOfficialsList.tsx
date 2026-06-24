import type { ComponentProps, UIEvent } from 'react';
import {
    Badge,
    Button,
    Group,
    MultiSelect as MantineMultiSelect,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core';

import UserCard from '@/components/ui/UserCard';
import type { EventOfficial, EventOfficialPosition } from '@/types';

import {
    type AssignedStaffCard,
    formatStaffRoleLabel,
    formatStaffStatusLabel,
    getStaffStatusColor,
} from '../staffInvites';

type StaffAssignedOfficialsListProps = {
    cards: AssignedStaffCard[];
    visibleCount: number;
    officialPositions: EventOfficialPosition[];
    eventOfficialByUserId: Map<string, EventOfficial>;
    availableFieldOptions: ComponentProps<typeof MantineMultiSelect>['data'];
    assignedOfficialsDisabled: boolean;
    comboboxProps?: ComponentProps<typeof MantineMultiSelect>['comboboxProps'];
    onScroll: (event: UIEvent<HTMLDivElement>) => void;
    onRemoveCard: (card: AssignedStaffCard) => void;
    onUpdateEligibility: (
        userId: string,
        updates: Partial<Pick<EventOfficial, 'positionIds' | 'fieldIds'>>,
    ) => void;
};

export const StaffAssignedOfficialsList = ({
    cards,
    visibleCount,
    officialPositions,
    eventOfficialByUserId,
    availableFieldOptions = [],
    assignedOfficialsDisabled,
    comboboxProps,
    onScroll,
    onRemoveCard,
    onUpdateEligibility,
}: StaffAssignedOfficialsListProps) => (
    <Paper withBorder radius="md" p="md" bg="white">
        <Stack gap="sm">
            <Group justify="space-between" align="center">
                <Title order={6}>Officials</Title>
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
                                <Button
                                    type="button"
                                    variant="subtle"
                                    color="red"
                                    size="xs"
                                    disabled={card.source === 'assigned' ? assignedOfficialsDisabled : false}
                                    onClick={() => onRemoveCard(card)}
                                >
                                    Remove
                                </Button>
                            </Group>
                            {card.userId && card.source === 'assigned' ? (
                                <SimpleGrid cols={{ base: 1, md: availableFieldOptions.length > 0 ? 2 : 1 }} spacing="sm">
                                    <MantineMultiSelect
                                        label="Eligible positions"
                                        description="Used by the scheduler when assigning this official."
                                        data={officialPositions.map((position) => ({
                                            value: position.id,
                                            label: `${position.name} (${position.count})`,
                                        }))}
                                        value={eventOfficialByUserId.get(card.userId)?.positionIds || []}
                                        onChange={(value) => onUpdateEligibility(card.userId!, { positionIds: value })}
                                        searchable
                                        clearable={false}
                                        comboboxProps={comboboxProps}
                                    />
                                    {availableFieldOptions.length > 0 ? (
                                        <MantineMultiSelect
                                            label="Eligible fields"
                                            description="Leave empty to allow all event fields."
                                            data={availableFieldOptions}
                                            value={eventOfficialByUserId.get(card.userId)?.fieldIds || []}
                                            onChange={(value) => onUpdateEligibility(card.userId!, { fieldIds: value })}
                                            searchable
                                            clearable
                                            comboboxProps={comboboxProps}
                                        />
                                    ) : null}
                                </SimpleGrid>
                            ) : null}
                            {card.status === 'failed' ? (
                                <Text size="xs" c="red">
                                    Email likely failed to send. Remove and re-add this invite to retry.
                                </Text>
                            ) : null}
                        </Stack>
                    </Paper>
                ))}
                {cards.length === 0 ? (
                    <Text size="sm" c="dimmed">No officials assigned.</Text>
                ) : null}
            </div>
        </Stack>
    </Paper>
);
