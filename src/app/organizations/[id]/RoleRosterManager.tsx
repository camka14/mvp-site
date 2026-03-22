"use client";

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  MultiSelect,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import UserCard from '@/components/ui/UserCard';
import type { StaffMemberType, UserData } from '@/types';

export type RoleRosterStatus = 'active' | 'pending' | 'declined';

export type RoleInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
  types: StaffMemberType[];
};

export type RoleRosterEntry = {
  id: string;
  userId: string;
  fullName: string;
  userName: string | null;
  email?: string | null;
  user?: UserData | null;
  status: RoleRosterStatus;
  subtitle?: string | null;
  types: StaffMemberType[];
  canRemove?: boolean;
  locked?: boolean;
};

type RoleRosterManagerProps = {
  rosterEntries: RoleRosterEntry[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults: UserData[];
  searchLoading: boolean;
  searchError: string | null;
  existingInviteTypes: StaffMemberType[];
  onExistingInviteTypesChange: (types: StaffMemberType[]) => void;
  onAddExisting: (user: UserData, types: StaffMemberType[]) => void;
  inviteRows: RoleInviteRow[];
  onInviteRowsChange: (rows: RoleInviteRow[]) => void;
  inviteError: string | null;
  inviting: boolean;
  onSendInvites: () => void;
  onRemoveFromRoster: (userId: string) => void;
  onTypesChange: (userId: string, types: StaffMemberType[]) => void;
};

const STAFF_TYPE_OPTIONS = [
  { value: 'HOST', label: 'Host' },
  { value: 'OFFICIAL', label: 'Official' },
  { value: 'STAFF', label: 'Staff' },
] satisfies Array<{ value: StaffMemberType; label: string }>;

const statusColor = (status: RoleRosterStatus): 'teal' | 'blue' | 'gray' => {
  if (status === 'active') return 'teal';
  if (status === 'pending') return 'blue';
  return 'gray';
};

const statusLabel = (status: RoleRosterStatus): string => {
  if (status === 'active') return 'Active';
  if (status === 'pending') return 'Pending';
  return 'Declined';
};

const formatTypeLabel = (type: StaffMemberType): string => STAFF_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;

const getUserCardData = (entry: RoleRosterEntry): UserData | null => (
  entry.user
    ? {
      ...entry.user,
      fullName: entry.fullName,
    }
    : null
);

export default function RoleRosterManager({
  rosterEntries,
  searchValue,
  onSearchChange,
  searchResults,
  searchLoading,
  searchError,
  existingInviteTypes,
  onExistingInviteTypesChange,
  onAddExisting,
  inviteRows,
  onInviteRowsChange,
  inviteError,
  inviting,
  onSendInvites,
  onRemoveFromRoster,
  onTypesChange,
}: RoleRosterManagerProps) {
  const [inviteMode, setInviteMode] = useState<'existing' | 'email'>('existing');
  const [rosterQuery, setRosterQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<StaffMemberType[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | RoleRosterStatus>('all');

  const filteredRosterEntries = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return rosterEntries.filter((entry) => {
      if (typeFilter.length > 0 && !typeFilter.some((type) => entry.types.includes(type))) {
        return false;
      }
      if (statusFilter !== 'all' && entry.status !== statusFilter) {
        return false;
      }
      if (!query.length) {
        return true;
      }
      return entry.fullName.toLowerCase().includes(query)
        || (entry.userName ?? '').toLowerCase().includes(query)
        || (entry.email ?? '').toLowerCase().includes(query)
        || (entry.subtitle ?? '').toLowerCase().includes(query);
    });
  }, [rosterEntries, rosterQuery, statusFilter, typeFilter]);

  const rosterCounts = useMemo(
    () => ({
      active: rosterEntries.filter((entry) => entry.status === 'active').length,
      pending: rosterEntries.filter((entry) => entry.status === 'pending').length,
      declined: rosterEntries.filter((entry) => entry.status === 'declined').length,
    }),
    [rosterEntries],
  );

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={5}>Staff List</Title>
          <Text size="sm" c="dimmed">
            Manage organization hosts, officials, and staff access in one roster.
          </Text>
        </Stack>

        <Paper withBorder p="md" radius="md" bg="gray.0">
          <Stack gap="sm">
            <Stack gap={2}>
              <Title order={6}>Invite Staff</Title>
              <Text size="sm" c="dimmed">
                Invite existing users or send email invites with one or more staff roles.
              </Text>
            </Stack>

            <SegmentedControl
              value={inviteMode}
              onChange={(value) => setInviteMode(value as typeof inviteMode)}
              data={[
                { label: 'Add existing', value: 'existing' },
                { label: 'Email invite', value: 'email' },
              ]}
            />

            {inviteMode === 'existing' ? (
              <Stack gap="sm">
                <MultiSelect
                  label="Staff type"
                  data={STAFF_TYPE_OPTIONS}
                  value={existingInviteTypes}
                  onChange={(values) => {
                    const nextTypes = values.filter((value): value is StaffMemberType => STAFF_TYPE_OPTIONS.some((option) => option.value === value));
                    if (!nextTypes.length) {
                      return;
                    }
                    onExistingInviteTypesChange(nextTypes);
                  }}
                  searchable={false}
                  clearable={false}
                />
                <TextInput
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.currentTarget.value)}
                  placeholder="Search staff by name or username"
                />
                {searchError && <Text size="xs" c="red">{searchError}</Text>}
                {searchLoading ? (
                  <Text size="sm" c="dimmed">Searching staff...</Text>
                ) : searchValue.length < 2 ? (
                  <Text size="sm" c="dimmed">Type at least 2 characters to search.</Text>
                ) : searchResults.length > 0 ? (
                  <Stack gap="xs">
                    {searchResults.map((result) => (
                      <Paper key={result.$id} withBorder p="sm" radius="md">
                        <Group justify="space-between" align="center" gap="sm">
                          <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                          <Button size="xs" onClick={() => onAddExisting(result, existingInviteTypes)}>
                            Invite
                          </Button>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">No users found.</Text>
                )}
              </Stack>
            ) : (
              <Stack gap="sm">
                {inviteRows.map((invite, index) => (
                  <Paper key={index} withBorder radius="md" p="sm">
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <TextInput
                        label="First name"
                        placeholder="First name"
                        value={invite.firstName}
                        onChange={(event) => {
                          const next = [...inviteRows];
                          next[index] = { ...invite, firstName: event.currentTarget.value };
                          onInviteRowsChange(next);
                        }}
                      />
                      <TextInput
                        label="Last name"
                        placeholder="Last name"
                        value={invite.lastName}
                        onChange={(event) => {
                          const next = [...inviteRows];
                          next[index] = { ...invite, lastName: event.currentTarget.value };
                          onInviteRowsChange(next);
                        }}
                      />
                    </SimpleGrid>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mt="sm">
                      <TextInput
                        label="Email"
                        placeholder="name@example.com"
                        value={invite.email}
                        onChange={(event) => {
                          const next = [...inviteRows];
                          next[index] = { ...invite, email: event.currentTarget.value };
                          onInviteRowsChange(next);
                        }}
                      />
                      <MultiSelect
                        label="Staff type"
                        data={STAFF_TYPE_OPTIONS}
                        value={invite.types}
                        onChange={(values) => {
                          const nextTypes = values.filter((value): value is StaffMemberType => STAFF_TYPE_OPTIONS.some((option) => option.value === value));
                          if (!nextTypes.length) {
                            return;
                          }
                          const next = [...inviteRows];
                          next[index] = { ...invite, types: nextTypes };
                          onInviteRowsChange(next);
                        }}
                        searchable={false}
                        clearable={false}
                      />
                    </SimpleGrid>
                    {inviteRows.length > 1 && (
                      <Group justify="flex-end" mt="xs">
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => onInviteRowsChange(inviteRows.filter((_, rowIndex) => rowIndex !== index))}
                        >
                          Remove
                        </Button>
                      </Group>
                    )}
                  </Paper>
                ))}
                <Group justify="space-between" align="center">
                  <Button
                    type="button"
                    variant="default"
                    size="xs"
                    onClick={() => onInviteRowsChange([...inviteRows, { firstName: '', lastName: '', email: '', types: ['HOST'] }])}
                  >
                    Add row
                  </Button>
                  <Button onClick={onSendInvites} loading={inviting} disabled={inviting}>
                    Send invites
                  </Button>
                </Group>
                {inviteError && <Text size="xs" c="red">{inviteError}</Text>}
              </Stack>
            )}
          </Stack>
        </Paper>

        <div className="staff-roster-layout">
          <Paper withBorder p="md" radius="md" h="fit-content">
            <Stack gap="sm">
              <Stack gap={2}>
                <Title order={6}>Filters</Title>
                <Text size="sm" c="dimmed">
                  Narrow the staff list by role or invite status.
                </Text>
              </Stack>

              <TextInput
                label="Search"
                placeholder="Name or username"
                value={rosterQuery}
                onChange={(event) => setRosterQuery(event.currentTarget.value)}
              />

              <MultiSelect
                label="Type"
                data={STAFF_TYPE_OPTIONS}
                value={typeFilter}
                onChange={(values) => {
                  setTypeFilter(
                    values.filter((value): value is StaffMemberType => STAFF_TYPE_OPTIONS.some((option) => option.value === value)),
                  );
                }}
                placeholder="All types"
                clearable
                searchable={false}
              />

              <Select
                label="Status"
                data={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'declined', label: 'Declined' },
                ]}
                value={statusFilter}
                onChange={(value: string | null) => setStatusFilter((value as 'all' | RoleRosterStatus | null) ?? 'all')}
                allowDeselect={false}
              />

              <Button
                variant="default"
                onClick={() => {
                  setRosterQuery('');
                  setTypeFilter([]);
                  setStatusFilter('all');
                }}
              >
                Clear filters
              </Button>
            </Stack>
          </Paper>

          <Stack gap="md">
            <Stack gap={2}>
              <Title order={6}>Roster</Title>
              <Text size="sm" c="dimmed">
                {`${filteredRosterEntries.length} shown • ${rosterCounts.active} active • ${rosterCounts.pending} pending • ${rosterCounts.declined} declined`}
              </Text>
            </Stack>

            {filteredRosterEntries.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <Table withTableBorder withColumnBorders highlightOnHover miw={760}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Staff Member</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th style={{ width: 140 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredRosterEntries.map((entry) => {
                      const userCardData = getUserCardData(entry);
                      const secondaryParts = [
                        entry.userName ? `@${entry.userName}` : null,
                        entry.email ?? null,
                      ].filter((value): value is string => Boolean(value));

                      return (
                        <Table.Tr key={entry.id}>
                          <Table.Td>
                            {userCardData ? (
                              <Stack gap={4}>
                                <UserCard
                                  user={userCardData}
                                  className="!p-0 !shadow-none !bg-transparent"
                                />
                                {entry.email && (
                                  <Text size="xs" c="dimmed">
                                    {entry.email}
                                  </Text>
                                )}
                                {entry.subtitle && (
                                  <Text size="xs" c="dimmed">
                                    {entry.subtitle}
                                  </Text>
                                )}
                              </Stack>
                            ) : (
                              <>
                                <Text fw={600}>{entry.fullName}</Text>
                                {secondaryParts.length > 0 && (
                                  <Text size="xs" c="dimmed">
                                    {secondaryParts.join(' • ')}
                                  </Text>
                                )}
                              </>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {!entry.locked ? (
                              <MultiSelect
                                data={STAFF_TYPE_OPTIONS}
                                value={entry.types}
                                onChange={(values) => {
                                  const nextTypes = values.filter((value): value is StaffMemberType => STAFF_TYPE_OPTIONS.some((option) => option.value === value));
                                  if (!nextTypes.length) {
                                    return;
                                  }
                                  onTypesChange(entry.userId, nextTypes);
                                }}
                                placeholder="Select roles"
                                searchable={false}
                                clearable={false}
                              />
                            ) : (
                              <Group gap={6}>
                                {entry.types.map((type) => (
                                  <Badge key={`${entry.id}-${type}`} variant="light">
                                    {formatTypeLabel(type)}
                                  </Badge>
                                ))}
                              </Group>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Badge radius="xl" variant="light" color={statusColor(entry.status)}>
                              {statusLabel(entry.status)}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {entry.canRemove === false ? (
                              <Text size="xs" c="dimmed">Locked</Text>
                            ) : (
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => onRemoveFromRoster(entry.userId)}
                              >
                                Remove
                              </Button>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>
            ) : (
              <Paper withBorder p="lg" radius="md" style={{ textAlign: 'center' }}>
                <Stack gap="xs" align="center">
                  <Title order={6}>No matching staff</Title>
                  <Text size="sm" c="dimmed">
                    Adjust your filters or use Invite Staff to add someone new.
                  </Text>
                </Stack>
              </Paper>
            )}
          </Stack>
        </div>
      </Stack>
      <style jsx>{`
        .staff-roster-layout {
          display: grid;
          gap: 1rem;
          grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
        }

        @media (max-width: 768px) {
          .staff-roster-layout {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </Paper>
  );
}
