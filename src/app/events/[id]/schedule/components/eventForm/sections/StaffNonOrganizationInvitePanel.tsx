import {
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

import UserCard from '@/components/ui/UserCard';
import type { UserData } from '@/types';

import type { PendingStaffInvite, StaffAssignmentRole } from '../staffInvites';

type StaffNonOrganizationInvitePanelProps = {
    search: string;
    searchResults: UserData[];
    searchLoading: boolean;
    searchError?: string | null;
    inviteDraft: PendingStaffInvite;
    assignedOfficialUserIds: Set<string>;
    assistantHostIds: string[];
    hostId?: string | null;
    maxMediumTextLength: number;
    maxShortTextLength: number;
    eventOfficialsDisabled: boolean;
    assistantHostsDisabled: boolean;
    onSearchChange: (value: string) => void;
    onAddOfficial: (user: UserData) => void;
    onAddAssistantHost: (user: UserData) => void;
    onInviteFieldChange: (field: 'firstName' | 'lastName' | 'email', value: string) => void;
    onInviteRoleToggle: (role: StaffAssignmentRole) => void;
    onStageInvite: () => void;
};

export const StaffNonOrganizationInvitePanel = ({
    search,
    searchResults,
    searchLoading,
    searchError,
    inviteDraft,
    assignedOfficialUserIds,
    assistantHostIds,
    hostId,
    maxMediumTextLength,
    maxShortTextLength,
    eventOfficialsDisabled,
    assistantHostsDisabled,
    onSearchChange,
    onAddOfficial,
    onAddAssistantHost,
    onInviteFieldChange,
    onInviteRoleToggle,
    onStageInvite,
}: StaffNonOrganizationInvitePanelProps) => (
    <Paper withBorder radius="md" p="md" bg="white">
        <Stack gap="sm">
            <div>
                <Title order={6}>Add / Invite Staff</Title>
                <Text size="sm" c="dimmed">
                    Add existing users or stage email invites as officials and assistant hosts.
                </Text>
            </div>
            <TextInput
                label="Search users"
                placeholder="Search by name or username"
                value={search}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                maxLength={maxMediumTextLength}
            />
            {searchError ? (
                <Text size="xs" c="red">{searchError}</Text>
            ) : null}
            {searchLoading ? (
                <Text size="sm" c="dimmed">Searching staff...</Text>
            ) : search.trim().length >= 2 ? (
                <Stack gap="xs">
                    {searchResults.length > 0 ? searchResults.map((result) => {
                        const isOfficialAssigned = assignedOfficialUserIds.has(result.$id);
                        const isHostAssigned = result.$id === hostId;
                        const isAssistantAssigned = assistantHostIds.includes(result.$id);

                        return (
                            <Group key={result.$id} justify="space-between" align="center" gap="sm">
                                <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                                <Group gap="xs">
                                    <Button
                                        type="button"
                                        size="xs"
                                        disabled={isOfficialAssigned || eventOfficialsDisabled}
                                        onClick={() => onAddOfficial(result)}
                                    >
                                        Add as official
                                    </Button>
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="default"
                                        disabled={isAssistantAssigned || isHostAssigned || assistantHostsDisabled}
                                        onClick={() => onAddAssistantHost(result)}
                                    >
                                        Add as assistant host
                                    </Button>
                                </Group>
                            </Group>
                        );
                    }) : (
                        <Text size="sm" c="dimmed">No users found.</Text>
                    )}
                </Stack>
            ) : (
                <Text size="sm" c="dimmed">Type at least 2 characters to search existing users.</Text>
            )}
            <Paper withBorder radius="md" p="sm" bg="gray.0">
                <Stack gap="sm">
                    <Title order={6}>Invite by email</Title>
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                        <TextInput
                            label="First name"
                            value={inviteDraft.firstName}
                            onChange={(event) => onInviteFieldChange('firstName', event.currentTarget.value)}
                            maxLength={maxShortTextLength}
                        />
                        <TextInput
                            label="Last name"
                            value={inviteDraft.lastName}
                            onChange={(event) => onInviteFieldChange('lastName', event.currentTarget.value)}
                            maxLength={maxShortTextLength}
                        />
                        <TextInput
                            label="Email"
                            value={inviteDraft.email}
                            onChange={(event) => onInviteFieldChange('email', event.currentTarget.value)}
                            maxLength={maxMediumTextLength}
                        />
                    </SimpleGrid>
                    <Group gap="xs">
                        <Button
                            type="button"
                            size="xs"
                            variant={inviteDraft.roles.includes('OFFICIAL') ? 'filled' : 'default'}
                            onClick={() => onInviteRoleToggle('OFFICIAL')}
                        >
                            Official
                        </Button>
                        <Button
                            type="button"
                            size="xs"
                            variant={inviteDraft.roles.includes('ASSISTANT_HOST') ? 'filled' : 'default'}
                            onClick={() => onInviteRoleToggle('ASSISTANT_HOST')}
                        >
                            Assistant host
                        </Button>
                        <Button type="button" size="xs" onClick={onStageInvite}>
                            Add email invite
                        </Button>
                    </Group>
                    <Text size="xs" c="dimmed">
                        Email-invite cards stay labeled as Email invite until you save the event.
                    </Text>
                </Stack>
            </Paper>
        </Stack>
    </Paper>
);
