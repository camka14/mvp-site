"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
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
import { Plus } from 'lucide-react';
import UserCard from '@/components/ui/UserCard';
import { ORGANIZATION_PERMISSION_OPTIONS } from '@/lib/organizationPermissions';
import { getStaffMemberTypesForOrganizationRole } from '@/lib/staff';
import type { OrganizationRole, StaffMemberType, UserData } from '@/types';

export type RoleRosterStatus = 'active' | 'pending' | 'declined';

export type RoleInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
  types: StaffMemberType[];
  roleId?: string | null;
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
  roleId?: string | null;
  roleName?: string | null;
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
  onAddExisting: (user: UserData, roleId: string, types: StaffMemberType[]) => void;
  inviteRows: RoleInviteRow[];
  onInviteRowsChange: (rows: RoleInviteRow[]) => void;
  inviteError: string | null;
  inviting: boolean;
  staffRoles: OrganizationRole[];
  onSendInvites: () => void;
  onRemoveFromRoster: (userId: string) => void;
  onRoleChange: (userId: string, roleId: string) => Promise<void> | void;
  onCreateRole: (name: string, permissions: string[]) => Promise<void> | void;
  onUpdateRole: (roleId: string, data: { name?: string; permissions?: string[] }) => Promise<void> | void;
};

type ManagerView = 'staff' | 'roles';

type DraftRole = {
  clientId: string;
  name: string;
  permissions: string[];
  error: string | null;
  isCreating: boolean;
};

const ROLE_NAME_DEBOUNCE_MS = 650;

const STAFF_TYPE_OPTIONS = [
  { value: 'HOST', label: 'Host' },
  { value: 'OFFICIAL', label: 'Official' },
  { value: 'STAFF', label: 'Staff' },
] satisfies Array<{ value: StaffMemberType; label: string }>;

const normalizeRoleKey = (role: Pick<OrganizationRole, 'kind' | 'name' | 'systemKey'> | null | undefined): string => (
  `${role?.systemKey ?? ''} ${role?.kind ?? ''} ${role?.name ?? ''}`.trim().toUpperCase()
);

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

const formatTypeLabel = (type: StaffMemberType): string => (
  STAFF_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
);

const getUserCardData = (entry: RoleRosterEntry): UserData | null => (
  entry.user
    ? {
      ...entry.user,
      fullName: entry.fullName,
    }
    : null
);

const normalizePermissionList = (permissions: readonly string[] | undefined): string[] => (
  Array.from(new Set((permissions ?? []).filter((permission): permission is string => typeof permission === 'string')))
);

const roleNameValidationMessage = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Role name is required.';
  }
  if (trimmed.length < 2) {
    return 'Use at least 2 characters.';
  }
  return null;
};

const createDraftRoleId = (): string => `draft_role_${Date.now()}`;

export default function RoleRosterManager({
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
  staffRoles,
  onSendInvites,
  onRemoveFromRoster,
  onRoleChange,
  onCreateRole,
  onUpdateRole,
}: RoleRosterManagerProps) {
  const [managerView, setManagerView] = useState<ManagerView>('staff');
  const [inviteMode, setInviteMode] = useState<'existing' | 'email'>('existing');
  const [rosterQuery, setRosterQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RoleRosterStatus>('all');
  const [existingInviteRoleId, setExistingInviteRoleId] = useState<string | null>(null);
  const [roleNameDrafts, setRoleNameDrafts] = useState<Record<string, string>>({});
  const [roleNameErrors, setRoleNameErrors] = useState<Record<string, string | null>>({});
  const [rolePermissionDrafts, setRolePermissionDrafts] = useState<Record<string, string[]>>({});
  const [roleUpdateErrors, setRoleUpdateErrors] = useState<Record<string, string | null>>({});
  const [updatingRoleIds, setUpdatingRoleIds] = useState<string[]>([]);
  const [savingRosterRoleUserIds, setSavingRosterRoleUserIds] = useState<string[]>([]);
  const [rosterRoleSelections, setRosterRoleSelections] = useState<Record<string, string | null>>({});
  const [draftRole, setDraftRole] = useState<DraftRole | null>(null);
  const rosterRoleSaveSequenceRef = useRef<Record<string, number>>({});

  const roleOptions = useMemo(
    () => staffRoles.map((role) => ({ value: role.$id, label: role.name })),
    [staffRoles],
  );
  const defaultInviteRoleId = useMemo(() => {
    const staffRole = staffRoles.find((role) => normalizeRoleKey(role).includes('STAFF'));
    return staffRole?.$id ?? staffRoles[0]?.$id ?? null;
  }, [staffRoles]);

  const permissionColumns = ORGANIZATION_PERMISSION_OPTIONS;
  const rolesTableMinWidth = 280 + permissionColumns.length * 150;

  useEffect(() => {
    setRoleNameDrafts((current) => {
      const next: Record<string, string> = {};
      staffRoles.forEach((role) => {
        next[role.$id] = current[role.$id] ?? role.name;
      });
      return next;
    });
    setRolePermissionDrafts((current) => {
      const next: Record<string, string[]> = {};
      staffRoles.forEach((role) => {
        next[role.$id] = current[role.$id] ?? normalizePermissionList(role.permissions);
      });
      return next;
    });
  }, [staffRoles]);

  useEffect(() => {
    setExistingInviteRoleId((current) => (
      current && staffRoles.some((role) => role.$id === current)
        ? current
        : defaultInviteRoleId
    ));
  }, [defaultInviteRoleId, staffRoles]);

  useEffect(() => {
    const sourceRoleByUserId = new Map(rosterEntries.map((entry) => [entry.userId, entry.roleId ?? null] as const));
    setRosterRoleSelections((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(current).forEach(([userId, roleId]) => {
        if (!sourceRoleByUserId.has(userId) || sourceRoleByUserId.get(userId) === roleId) {
          delete next[userId];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [rosterEntries]);

  const setRoleUpdating = useCallback((roleId: string, updating: boolean) => {
    setUpdatingRoleIds((current) => {
      if (updating) {
        return current.includes(roleId) ? current : [...current, roleId];
      }
      return current.filter((id) => id !== roleId);
    });
  }, []);

  const setRosterRoleSaving = useCallback((userId: string, saving: boolean) => {
    setSavingRosterRoleUserIds((current) => {
      if (saving) {
        return current.includes(userId) ? current : [...current, userId];
      }
      return current.filter((entry) => entry !== userId);
    });
  }, []);

  const updateRosterRole = useCallback(
    async (entry: RoleRosterEntry, roleId: string) => {
      const nextSequence = (rosterRoleSaveSequenceRef.current[entry.userId] ?? 0) + 1;
      rosterRoleSaveSequenceRef.current[entry.userId] = nextSequence;
      setRosterRoleSelections((current) => ({ ...current, [entry.userId]: roleId }));
      setRosterRoleSaving(entry.userId, true);
      try {
        await onRoleChange(entry.userId, roleId);
      } catch {
        if (rosterRoleSaveSequenceRef.current[entry.userId] === nextSequence) {
          setRosterRoleSelections((current) => ({ ...current, [entry.userId]: entry.roleId ?? null }));
        }
      } finally {
        if (rosterRoleSaveSequenceRef.current[entry.userId] === nextSequence) {
          setRosterRoleSaving(entry.userId, false);
        }
      }
    },
    [onRoleChange, setRosterRoleSaving],
  );

  const updateRoleDefinition = useCallback(
    async (roleId: string, data: { name?: string; permissions?: string[] }) => {
      setRoleUpdating(roleId, true);
      setRoleUpdateErrors((current) => ({ ...current, [roleId]: null }));
      try {
        await onUpdateRole(roleId, data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update role.';
        setRoleUpdateErrors((current) => ({ ...current, [roleId]: message }));
        const role = staffRoles.find((entry) => entry.$id === roleId);
        if (role && data.permissions) {
          setRolePermissionDrafts((current) => ({ ...current, [roleId]: normalizePermissionList(role.permissions) }));
        }
      } finally {
        setRoleUpdating(roleId, false);
      }
    },
    [onUpdateRole, setRoleUpdating, staffRoles],
  );

  useEffect(() => {
    if (!staffRoles.length) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const nextErrors: Record<string, string | null> = {};
      staffRoles.forEach((role) => {
        if (role.isSystem) {
          return;
        }
        const draftName = roleNameDrafts[role.$id] ?? role.name;
        const validationMessage = roleNameValidationMessage(draftName);
        nextErrors[role.$id] = validationMessage;
        const nextName = draftName.trim();
        if (!validationMessage && nextName !== role.name) {
          void updateRoleDefinition(role.$id, { name: nextName });
        }
      });
      setRoleNameErrors((current) => ({ ...current, ...nextErrors }));
    }, ROLE_NAME_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [roleNameDrafts, staffRoles, updateRoleDefinition]);

  useEffect(() => {
    if (!draftRole || draftRole.isCreating) {
      return undefined;
    }

    const validationMessage = roleNameValidationMessage(draftRole.name);
    if (validationMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const name = draftRole.name.trim();
      setDraftRole((current) => (
        current?.clientId === draftRole.clientId
          ? { ...current, isCreating: true, error: null }
          : current
      ));
      try {
        await onCreateRole(name, draftRole.permissions);
        setDraftRole((current) => (current?.clientId === draftRole.clientId ? null : current));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create role.';
        setDraftRole((current) => (
          current?.clientId === draftRole.clientId
            ? { ...current, isCreating: false, error: message }
            : current
        ));
      }
    }, ROLE_NAME_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    draftRole?.clientId,
    draftRole?.isCreating,
    draftRole?.name,
    draftRole?.permissions,
    onCreateRole,
  ]);

  const filteredRosterEntries = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return rosterEntries.filter((entry) => {
      const selectedRoleId = Object.prototype.hasOwnProperty.call(rosterRoleSelections, entry.userId)
        ? rosterRoleSelections[entry.userId]
        : entry.roleId ?? null;
      if (roleFilter !== 'all' && selectedRoleId !== roleFilter) {
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
  }, [roleFilter, rosterEntries, rosterQuery, rosterRoleSelections, statusFilter]);

  const rosterCounts = useMemo(
    () => ({
      active: rosterEntries.filter((entry) => entry.status === 'active').length,
      pending: rosterEntries.filter((entry) => entry.status === 'pending').length,
      declined: rosterEntries.filter((entry) => entry.status === 'declined').length,
    }),
    [rosterEntries],
  );

  const toggleRolePermission = useCallback(
    (role: OrganizationRole, permission: string, checked: boolean) => {
      const currentPermissions = rolePermissionDrafts[role.$id] ?? normalizePermissionList(role.permissions);
      const nextPermissions = checked
        ? normalizePermissionList([...currentPermissions, permission])
        : currentPermissions.filter((entry) => entry !== permission);
      setRolePermissionDrafts((current) => ({ ...current, [role.$id]: nextPermissions }));
      void updateRoleDefinition(role.$id, { permissions: nextPermissions });
    },
    [rolePermissionDrafts, updateRoleDefinition],
  );

  const handleAddRoleRow = useCallback(() => {
    setManagerView('roles');
    setDraftRole((current) => (
      current ?? {
        clientId: createDraftRoleId(),
        name: '',
        permissions: [],
        error: 'Role name is required.',
        isCreating: false,
      }
    ));
  }, []);

  const renderInvitePanel = () => (
    <Paper withBorder p="md" radius="md" className="org-tab-item">
      <Stack gap="sm">
        <Stack gap={2}>
          <Title order={6}>Invite Staff</Title>
          <Text size="sm" c="dimmed">
            Invite existing users or send email invites with one staff role.
          </Text>
        </Stack>

        <SegmentedControl
          fullWidth
          value={inviteMode}
          onChange={(value) => setInviteMode(value as typeof inviteMode)}
          data={[
            { label: 'Add existing', value: 'existing' },
            { label: 'Email invite', value: 'email' },
          ]}
        />

        {inviteMode === 'existing' ? (
          <Stack gap="sm">
            <Select
              label="Role"
              data={roleOptions}
              value={existingInviteRoleId}
              onChange={(value) => {
                setExistingInviteRoleId(value);
              }}
              searchable={roleOptions.length > 8}
              allowDeselect={false}
            />
            <TextInput
              value={searchValue}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Search staff by name or username"
            />
            {searchError ? (
              <Text size="xs" c="red">
                {searchError}
              </Text>
            ) : null}
            {searchLoading ? (
              <Text size="sm" c="dimmed">
                Searching staff...
              </Text>
            ) : searchValue.length < 2 ? (
              <Text size="sm" c="dimmed">
                Type at least 2 characters to search.
              </Text>
            ) : searchResults.length > 0 ? (
              <Stack gap="xs">
                {searchResults.map((result) => (
                  <Paper key={result.$id} withBorder p="sm" radius="md" className="org-tab-nested-item">
                    <Group justify="space-between" align="center" gap="sm">
                      <UserCard
                        user={result}
                        className="!p-0 !shadow-none flex-1"
                      />
                      <Button
                        size="xs"
                        disabled={!existingInviteRoleId}
                        onClick={() => {
                          const role = staffRoles.find((entry) => entry.$id === existingInviteRoleId) ?? null;
                          if (existingInviteRoleId) {
                            onAddExisting(result, existingInviteRoleId, getStaffMemberTypesForOrganizationRole(role));
                          }
                        }}
                      >
                        Invite
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                No users found.
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap="sm">
            {inviteRows.map((invite, index) => (
              <Paper key={index} withBorder radius="md" p="sm" className="org-tab-nested-item">
                <SimpleGrid cols={1} spacing="sm">
                  <TextInput
                    label="First name"
                    placeholder="First name"
                    value={invite.firstName}
                    onChange={(event) => {
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        firstName: event.currentTarget.value,
                      };
                      onInviteRowsChange(next);
                    }}
                  />
                  <TextInput
                    label="Last name"
                    placeholder="Last name"
                    value={invite.lastName}
                    onChange={(event) => {
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        lastName: event.currentTarget.value,
                      };
                      onInviteRowsChange(next);
                    }}
                  />
                </SimpleGrid>
                <SimpleGrid cols={1} spacing="sm" mt="sm">
                  <TextInput
                    label="Email"
                    placeholder="name@example.com"
                    value={invite.email}
                    onChange={(event) => {
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        email: event.currentTarget.value,
                      };
                      onInviteRowsChange(next);
                    }}
                  />
                  <Select
                    label="Role"
                    data={roleOptions}
                    value={invite.roleId ?? defaultInviteRoleId}
                    onChange={(value) => {
                      const role = staffRoles.find((entry) => entry.$id === value) ?? null;
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        roleId: value,
                        types: getStaffMemberTypesForOrganizationRole(role),
                      };
                      onInviteRowsChange(next);
                    }}
                    searchable={roleOptions.length > 8}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                {inviteRows.length > 1 ? (
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
                ) : null}
              </Paper>
            ))}
            <Group justify="space-between" align="center">
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={() =>
                  onInviteRowsChange([
                    ...inviteRows,
                    {
                      firstName: '',
                      lastName: '',
                      email: '',
                      types: ['STAFF'],
                      roleId: defaultInviteRoleId,
                    },
                  ])
                }
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
            {inviteError ? (
              <Text size="xs" c="red">
                {inviteError}
              </Text>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Paper>
  );

  const renderFiltersPanel = () => (
    <Paper withBorder p="md" radius="md" className="org-tab-item">
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

        <Select
          label="Role"
          data={[{ value: 'all', label: 'All roles' }, ...roleOptions]}
          value={roleFilter}
          onChange={(value: string | null) => setRoleFilter(value ?? 'all')}
          allowDeselect={false}
          searchable={roleOptions.length > 8}
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
            setRoleFilter('all');
            setStatusFilter('all');
          }}
        >
          Clear filters
        </Button>
      </Stack>
    </Paper>
  );

  const renderStaffView = () => (
    <div className="staff-roster-layout">
      <Stack gap="md" h="fit-content">
        {renderInvitePanel()}
        {renderFiltersPanel()}
      </Stack>

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={6}>Roster</Title>
          <Text size="sm" c="dimmed">
            {`${filteredRosterEntries.length} shown - ${rosterCounts.active} active - ${rosterCounts.pending} pending - ${rosterCounts.declined} declined`}
          </Text>
        </Stack>

        {filteredRosterEntries.length > 0 ? (
          <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <Table withColumnBorders highlightOnHover miw={760}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Staff Member</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th style={{ width: 140 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredRosterEntries.map((entry) => {
                    const userCardData = getUserCardData(entry);
                    const selectedRoleId = Object.prototype.hasOwnProperty.call(rosterRoleSelections, entry.userId)
                      ? rosterRoleSelections[entry.userId]
                      : entry.roleId ?? null;
                    const isSavingRosterRole = savingRosterRoleUserIds.includes(entry.userId);
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
                              {entry.email ? (
                                <Text size="xs" c="dimmed">
                                  {entry.email}
                                </Text>
                              ) : null}
                              {entry.subtitle ? (
                                <Text size="xs" c="dimmed">
                                  {entry.subtitle}
                                </Text>
                              ) : null}
                            </Stack>
                          ) : (
                            <>
                              <Text fw={600}>{entry.fullName}</Text>
                              {secondaryParts.length > 0 ? (
                                <Text size="xs" c="dimmed">
                                  {secondaryParts.join(' - ')}
                                </Text>
                              ) : null}
                            </>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {!entry.locked ? (
                            <Select
                              data={roleOptions}
                              value={selectedRoleId ?? null}
                              onChange={(value) => {
                                if (value) {
                                  void updateRosterRole(entry, value);
                                }
                              }}
                              placeholder="Select role"
                              searchable={roleOptions.length > 8}
                              allowDeselect={false}
                              rightSection={isSavingRosterRole ? <Loader size="xs" aria-label="Saving role" /> : undefined}
                              rightSectionPointerEvents="none"
                            />
                          ) : (
                            <Group gap={6}>
                              <Text size="sm" c={entry.roleName ? undefined : 'dimmed'}>
                                {entry.roleName ?? 'No role'}
                              </Text>
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
          </Paper>
        ) : (
          <Paper withBorder p="lg" radius="md" className="org-tab-item" style={{ textAlign: 'center' }}>
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
  );

  const renderRoleNameCell = (role: OrganizationRole) => {
    const draftName = roleNameDrafts[role.$id] ?? role.name;
    const rowError = roleNameErrors[role.$id] || roleUpdateErrors[role.$id] || null;
    const isUpdating = updatingRoleIds.includes(role.$id);
    return (
      <Stack gap={4}>
        <TextInput
          value={draftName}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setRoleNameDrafts((current) => ({ ...current, [role.$id]: value }));
            setRoleNameErrors((current) => ({ ...current, [role.$id]: roleNameValidationMessage(value) }));
          }}
          disabled={role.isSystem}
          error={rowError}
          aria-label={`${role.name} role name`}
        />
        {role.isSystem ? (
          <Text size="xs" c="dimmed">
            System role
          </Text>
        ) : isUpdating ? (
          <Text size="xs" c="dimmed">
            Updating...
          </Text>
        ) : null}
      </Stack>
    );
  };

  const renderRolesView = () => (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" gap="md">
        <Stack gap={2}>
          <Title order={6}>Roles</Title>
          <Text size="sm" c="dimmed">
            Edit role names and permissions. Changes are applied automatically.
          </Text>
        </Stack>
      </Group>

      <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <Table withColumnBorders highlightOnHover miw={rolesTableMinWidth}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 260 }}>Role name</Table.Th>
                {permissionColumns.map((permission) => (
                  <Table.Th key={permission.value} style={{ minWidth: 150, textAlign: 'center' }}>
                    <Text size="xs" fw={700}>
                      {permission.label}
                    </Text>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {staffRoles.map((role) => {
                const permissions = rolePermissionDrafts[role.$id] ?? normalizePermissionList(role.permissions);
                const isUpdating = updatingRoleIds.includes(role.$id);
                return (
                  <Table.Tr key={role.$id}>
                    <Table.Td>{renderRoleNameCell(role)}</Table.Td>
                    {permissionColumns.map((permission) => (
                      <Table.Td key={`${role.$id}-${permission.value}`} style={{ textAlign: 'center' }}>
                        <Checkbox
                          aria-label={`${role.name} ${permission.label}`}
                          checked={permissions.includes(permission.value)}
                          disabled={isUpdating}
                          onChange={(event) => toggleRolePermission(role, permission.value, event.currentTarget.checked)}
                        />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
              {draftRole ? (
                <Table.Tr>
                  <Table.Td>
                    <TextInput
                      value={draftRole.name}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraftRole((current) => (
                          current
                            ? {
                              ...current,
                              name: value,
                              error: current.error && roleNameValidationMessage(value)
                                ? roleNameValidationMessage(value)
                                : null,
                            }
                            : current
                        ));
                      }}
                      placeholder="Role name"
                      error={draftRole.error ?? roleNameValidationMessage(draftRole.name)}
                      disabled={draftRole.isCreating}
                      aria-label="New role name"
                      autoFocus
                    />
                    {draftRole.isCreating ? (
                      <Text size="xs" c="dimmed" mt={4}>
                        Creating...
                      </Text>
                    ) : null}
                  </Table.Td>
                  {permissionColumns.map((permission) => (
                    <Table.Td key={`${draftRole.clientId}-${permission.value}`} style={{ textAlign: 'center' }}>
                      <Checkbox
                        aria-label={`New role ${permission.label}`}
                        checked={draftRole.permissions.includes(permission.value)}
                        disabled={draftRole.isCreating}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setDraftRole((current) => {
                            if (!current) return current;
                            const permissions = checked
                              ? normalizePermissionList([...current.permissions, permission.value])
                              : current.permissions.filter((entry) => entry !== permission.value);
                            return { ...current, permissions };
                          });
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ) : null}
              <Table.Tr className="role-add-row">
                <Table.Td colSpan={permissionColumns.length + 1}>
                  <Button
                    variant="subtle"
                    leftSection={<Plus size={16} aria-hidden="true" />}
                    onClick={handleAddRoleRow}
                  >
                    Add role
                  </Button>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
      </Paper>
    </Stack>
  );

  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <Stack gap={2}>
            <Title order={5}>Staff List</Title>
            <Text size="sm" c="dimmed">
              Manage organization hosts, officials, and staff access in one roster.
            </Text>
          </Stack>
          <SegmentedControl
            value={managerView}
            onChange={(value) => setManagerView(value as ManagerView)}
            data={[
              { label: 'Staff', value: 'staff' },
              { label: 'Roles', value: 'roles' },
            ]}
          />
        </Group>

        {managerView === 'staff' ? renderStaffView() : renderRolesView()}
      </Stack>
    </Paper>
  );
}
