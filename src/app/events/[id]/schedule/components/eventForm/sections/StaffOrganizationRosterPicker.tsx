import type { ComponentProps, UIEvent } from 'react';
import {
    Badge,
    Button,
    Group,
    Paper,
    Select as MantineSelect,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

import UserCard from '@/components/ui/UserCard';
import type { StaffMemberType, UserData } from '@/types';

import {
    formatStaffStatusLabel,
    getStaffStatusColor,
    type StaffRosterEntry,
    type StaffRosterStatus,
} from '../staffInvites';

type OrganizationStaffTypeFilter = 'all' | StaffMemberType;
type OrganizationStaffStatusFilter = 'all' | StaffRosterStatus;

type StaffOrganizationRosterPickerProps = {
    search: string;
    typeFilter: OrganizationStaffTypeFilter;
    statusFilter: OrganizationStaffStatusFilter;
    entries: StaffRosterEntry[];
    visibleCount: number;
    assignedOfficialUserIds: Set<string>;
    assistantHostIds: string[];
    hostId?: string | null;
    maxMediumTextLength: number;
    eventOfficialsDisabled: boolean;
    assistantHostsDisabled: boolean;
    hostDisabled: boolean;
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    onSearchChange: (value: string) => void;
    onTypeFilterChange: (value: OrganizationStaffTypeFilter) => void;
    onStatusFilterChange: (value: OrganizationStaffStatusFilter) => void;
    onScrollRoster: (event: UIEvent<HTMLDivElement>) => void;
    onAddOfficial: (user: UserData) => void;
    onAddAssistantHost: (user: UserData) => void;
    onSetHost: (userId: string | null) => void;
};

const ORGANIZATION_STAFF_TYPE_OPTIONS = [
    { value: 'all', label: 'All roles' },
    { value: 'HOST', label: 'Host' },
    { value: 'OFFICIAL', label: 'Official' },
    { value: 'STAFF', label: 'Staff' },
];

const ORGANIZATION_STAFF_STATUS_OPTIONS = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'declined', label: 'Declined' },
];

export const StaffOrganizationRosterPicker = ({
    search,
    typeFilter,
    statusFilter,
    entries,
    visibleCount,
    assignedOfficialUserIds,
    assistantHostIds,
    hostId,
    maxMediumTextLength,
    eventOfficialsDisabled,
    assistantHostsDisabled,
    hostDisabled,
    comboboxProps,
    onSearchChange,
    onTypeFilterChange,
    onStatusFilterChange,
    onScrollRoster,
    onAddOfficial,
    onAddAssistantHost,
    onSetHost,
}: StaffOrganizationRosterPickerProps) => (
    <Paper withBorder radius="md" p="md" bg="white">
        <Stack gap="sm">
            <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
                <div>
                    <Title order={6}>Organization Staff</Title>
                    <Text size="sm" c="dimmed">
                        Search the organization roster and assign staff directly to this event.
                    </Text>
                </div>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                <TextInput
                    label="Search staff"
                    placeholder="Search by name or email"
                    value={search}
                    onChange={(event) => onSearchChange(event.currentTarget.value)}
                    maxLength={maxMediumTextLength}
                />
                <MantineSelect
                    label="Role filter"
                    data={ORGANIZATION_STAFF_TYPE_OPTIONS}
                    value={typeFilter}
                    onChange={(value) => onTypeFilterChange((value as OrganizationStaffTypeFilter) ?? 'all')}
                    comboboxProps={comboboxProps}
                />
                <MantineSelect
                    label="Status filter"
                    data={ORGANIZATION_STAFF_STATUS_OPTIONS}
                    value={statusFilter}
                    onChange={(value) => onStatusFilterChange((value as OrganizationStaffStatusFilter) ?? 'all')}
                    comboboxProps={comboboxProps}
                />
            </SimpleGrid>
            <div
                className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                onScroll={onScrollRoster}
            >
                {entries.slice(0, visibleCount).map((entry) => {
                    const userId = entry.userId;
                    const isOfficialAssigned = Boolean(userId && assignedOfficialUserIds.has(userId));
                    const isHostAssigned = Boolean(userId && userId === hostId);
                    const isAssistantAssigned = Boolean(userId && assistantHostIds.includes(userId));
                    const assignmentsDisabled = !userId;
                    const canAssignOfficial = entry.status === 'active' && entry.types.includes('OFFICIAL');
                    const canAssignHost = entry.status === 'active' && entry.types.includes('HOST');
                    const assignableUser = { ...((entry.user ?? {}) as UserData), $id: userId ?? undefined } as UserData;

                    return (
                        <Paper key={entry.id} withBorder radius="md" p="sm">
                            <Stack gap="xs">
                                <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                                    <div className="flex-1 min-w-0">
                                        {entry.user ? (
                                            <UserCard user={entry.user} className="!p-0 !shadow-none" />
                                        ) : (
                                            <Stack gap={2}>
                                                <Text fw={600}>{entry.fullName}</Text>
                                                {entry.email ? <Text size="xs" c="dimmed">{entry.email}</Text> : null}
                                            </Stack>
                                        )}
                                    </div>
                                    <Badge radius="xl" variant="light" color={getStaffStatusColor(entry.status)}>
                                        {formatStaffStatusLabel(entry.status)}
                                    </Badge>
                                </Group>
                                <Group gap="xs" wrap="wrap">
                                    <Button
                                        type="button"
                                        size="xs"
                                        disabled={assignmentsDisabled || !canAssignOfficial || isOfficialAssigned || eventOfficialsDisabled}
                                        onClick={() => onAddOfficial(assignableUser)}
                                    >
                                        Add as official
                                    </Button>
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="default"
                                        disabled={assignmentsDisabled || !canAssignHost || isAssistantAssigned || isHostAssigned || assistantHostsDisabled}
                                        onClick={() => onAddAssistantHost(assignableUser)}
                                    >
                                        Add as assistant
                                    </Button>
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="light"
                                        disabled={assignmentsDisabled || !canAssignHost || isHostAssigned || hostDisabled}
                                        onClick={() => onSetHost(userId)}
                                    >
                                        Set as host
                                    </Button>
                                </Group>
                            </Stack>
                        </Paper>
                    );
                })}
                {entries.length === 0 ? (
                    <Text size="sm" c="dimmed">No organization staff matched your filters.</Text>
                ) : null}
            </div>
        </Stack>
    </Paper>
);
