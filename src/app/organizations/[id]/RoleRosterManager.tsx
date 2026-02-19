"use client";

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import UserCard from '@/components/ui/UserCard';
import type { UserData } from '@/types';

export type RoleRosterStatus = 'active' | 'invited' | 'inactive';

export type RoleInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
};

export type RoleRosterEntry = {
  id: string;
  fullName: string;
  userName: string | null;
  status: RoleRosterStatus;
  subtitle?: string | null;
  canRemove?: boolean;
};

type RoleRosterManagerProps = {
  roleSingular: string;
  rolePlural: string;
  description: string;
  rosterEntries: RoleRosterEntry[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults: UserData[];
  searchLoading: boolean;
  searchError: string | null;
  onAddExisting: (user: UserData) => void;
  inviteRows: RoleInviteRow[];
  onInviteRowsChange: (rows: RoleInviteRow[]) => void;
  inviteError: string | null;
  inviting: boolean;
  onSendInvites: () => void;
  onRemoveFromRoster: (id: string) => void;
  onImportCsv?: () => void;
};

const statusColor = (status: RoleRosterStatus): 'teal' | 'blue' | 'gray' => {
  if (status === 'active') return 'teal';
  if (status === 'invited') return 'blue';
  return 'gray';
};

const statusLabel = (status: RoleRosterStatus): string => {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Invited';
  return 'Inactive';
};

export default function RoleRosterManager({
  roleSingular,
  rolePlural,
  description,
  rosterEntries,
  searchValue,
  onSearchChange,
  searchResults,
  searchLoading,
  searchError,
  onAddExisting,
  inviteRows,
  onInviteRowsChange,
  inviteError,
  inviting,
  onSendInvites,
  onRemoveFromRoster,
  onImportCsv,
}: RoleRosterManagerProps) {
  const [inviteExpanded, setInviteExpanded] = useState(true);
  const [inviteMode, setInviteMode] = useState<'existing' | 'email'>('existing');
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterStatus, setRosterStatus] = useState<'all' | RoleRosterStatus>('all');
  const [rosterSort, setRosterSort] = useState<'name-asc' | 'name-desc' | 'status'>('name-asc');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'volunteer' | 'paid'>('all');

  const filteredRosterEntries = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    const filtered = rosterEntries.filter((entry) => {
      if (rosterStatus !== 'all' && entry.status !== rosterStatus) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      return entry.fullName.toLowerCase().includes(query)
        || (entry.userName ?? '').toLowerCase().includes(query)
        || entry.id.toLowerCase().includes(query);
    });

    if (rosterSort === 'status') {
      const rank: Record<RoleRosterStatus, number> = {
        active: 0,
        invited: 1,
        inactive: 2,
      };
      return filtered.sort((left, right) => (
        rank[left.status] - rank[right.status]
          || left.fullName.localeCompare(right.fullName)
      ));
    }

    return filtered.sort((left, right) => {
      const comparison = left.fullName.localeCompare(right.fullName);
      return rosterSort === 'name-desc' ? comparison * -1 : comparison;
    });
  }, [rosterEntries, rosterQuery, rosterSort, rosterStatus]);

  const rosterCounts = useMemo(
    () => ({
      total: rosterEntries.length,
      active: rosterEntries.filter((entry) => entry.status === 'active').length,
      invited: rosterEntries.filter((entry) => entry.status === 'invited').length,
    }),
    [rosterEntries],
  );

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap={2}>
          <Title order={5}>{roleSingular} Roster</Title>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-start" gap="md" wrap="wrap" mb={inviteExpanded ? 'sm' : 0}>
          <Stack gap={2}>
            <Title order={6}>Invite {rolePlural}</Title>
            <Text size="sm" c="dimmed">
              Add existing users or send email invitations.
            </Text>
          </Stack>
          <Group gap="xs">
            {onImportCsv && (
              <Button variant="outline" size="xs" onClick={onImportCsv}>
                Import CSV
              </Button>
            )}
            <Button variant="default" size="xs" onClick={() => setInviteExpanded((previous) => !previous)}>
              {inviteExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </Group>
        </Group>

        {inviteExpanded && (
          <Stack gap="sm">
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
                <TextInput
                  value={searchValue}
                  onChange={(event) => {
                    onSearchChange(event.currentTarget.value);
                  }}
                  placeholder={`Search ${rolePlural.toLowerCase()} by name or username`}
                />
                {searchError && (
                  <Text size="xs" c="red">
                    {searchError}
                  </Text>
                )}
                {searchLoading ? (
                  <Text size="sm" c="dimmed">Searching {rolePlural.toLowerCase()}...</Text>
                ) : searchValue.length < 2 ? (
                  <Text size="sm" c="dimmed">Type at least 2 characters to search.</Text>
                ) : searchResults.length > 0 ? (
                  <Stack gap="xs">
                    {searchResults.map((result) => (
                      <Paper key={result.$id} withBorder p="sm" radius="md">
                        <Group justify="space-between" align="center" gap="sm">
                          <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                          <Button size="xs" onClick={() => onAddExisting(result)}>
                            Add
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
                <Text size="sm" c="dimmed">
                  Add one or more invite rows and send them in one action.
                </Text>
                {inviteRows.map((invite, index) => (
                  <Paper key={index} withBorder radius="md" p="sm">
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
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
                    onClick={() => onInviteRowsChange([...inviteRows, { firstName: '', lastName: '', email: '' }])}
                  >
                    Add row
                  </Button>
                  <Button
                    onClick={onSendInvites}
                    loading={inviting}
                    disabled={inviting}
                  >
                    Send invites
                  </Button>
                </Group>
                {inviteError && (
                  <Text size="xs" c="red">
                    {inviteError}
                  </Text>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </Paper>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Title order={6}>Roster Filters</Title>
            <TextInput
              label="Search"
              placeholder={`Filter ${rolePlural.toLowerCase()} by name, username, or id`}
              value={rosterQuery}
              onChange={(event) => setRosterQuery(event.currentTarget.value)}
            />
            <Select
              label="Status"
              value={rosterStatus}
              onChange={(value) => setRosterStatus((value as typeof rosterStatus) ?? 'all')}
              data={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'invited', label: 'Invited' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
            <Select
              label="Sort"
              value={rosterSort}
              onChange={(value) => setRosterSort((value as typeof rosterSort) ?? 'name-asc')}
              data={[
                { value: 'name-asc', label: 'Name (A-Z)' },
                { value: 'name-desc', label: 'Name (Z-A)' },
                { value: 'status', label: 'Status' },
              ]}
            />
            <Switch
              label="Show only available"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.currentTarget.checked)}
              disabled
            />
            <Select
              label="Payment"
              value={paymentFilter}
              onChange={(value) => setPaymentFilter((value as typeof paymentFilter) ?? 'all')}
              data={[
                { value: 'all', label: 'All payment types' },
                { value: 'volunteer', label: 'Volunteer' },
                { value: 'paid', label: 'Paid' },
              ]}
              disabled
            />
            <Button
              variant="subtle"
              size="xs"
              onClick={() => {
                setRosterQuery('');
                setRosterStatus('all');
                setRosterSort('name-asc');
                setAvailableOnly(false);
                setPaymentFilter('all');
              }}
            >
              Clear filters
            </Button>
            <Text size="xs" c="dimmed">
              Availability and payment filters will activate once metadata is enabled.
            </Text>
          </Stack>
        </Paper>

        <div style={{ gridColumn: 'span 2' }}>
          <Paper withBorder p="md" radius="md">
            <Stack gap={2} mb="md">
              <Title order={6}>Roster</Title>
              <Text size="sm" c="dimmed">
                {`${filteredRosterEntries.length} shown • ${rosterCounts.active} active • ${rosterCounts.invited} invited`}
              </Text>
            </Stack>

            {filteredRosterEntries.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <Table withTableBorder withColumnBorders highlightOnHover miw={720}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{roleSingular}</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Username</Table.Th>
                      <Table.Th style={{ width: 130 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredRosterEntries.map((entry) => (
                      <Table.Tr key={entry.id}>
                        <Table.Td>
                          <Text fw={600}>{entry.fullName}</Text>
                          {entry.subtitle && (
                            <Text size="xs" c="dimmed">{entry.subtitle}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            radius="xl"
                            variant="light"
                            color={statusColor(entry.status)}
                          >
                            {statusLabel(entry.status)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {entry.userName ? `@${entry.userName}` : 'Not available'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {entry.canRemove === false ? (
                            <Text size="xs" c="dimmed">Locked</Text>
                          ) : (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              onClick={() => onRemoveFromRoster(entry.id)}
                            >
                              Remove
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            ) : (
              <Paper withBorder p="lg" radius="md" style={{ textAlign: 'center' }}>
                <Stack gap="xs" align="center">
                  <Title order={6}>No {rolePlural.toLowerCase()} yet</Title>
                  <Text size="sm" c="dimmed">
                    Use the invite card above to add existing users or send email invitations.
                  </Text>
                </Stack>
              </Paper>
            )}
          </Paper>
        </div>
      </SimpleGrid>
    </Stack>
  );
}
