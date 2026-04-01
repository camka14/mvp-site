'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/layout/Navigation';
import EventCard from '@/components/ui/EventCard';
import OrganizationCard from '@/components/ui/OrganizationCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import type { Event, Field, Organization, UserData } from '@/types';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Search } from 'lucide-react';

type AdminTab = 'events' | 'organizations' | 'fields' | 'users';

type PageState<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  query: string;
};

type AdminFieldRow = Field & {
  organization?: Pick<Organization, '$id' | 'name'> | null;
};

type AdminUserRow = UserData & {
  email?: string | null;
  emailVerifiedAt?: string | null;
};

const DEFAULT_LIMIT = 50;

const initialPageState = <T,>(query = ''): PageState<T> => ({
  items: [],
  total: 0,
  limit: DEFAULT_LIMIT,
  offset: 0,
  loading: false,
  loaded: false,
  error: null,
  query,
});

type AdminDashboardClientProps = {
  initialAdminEmail: string;
};

export default function AdminDashboardClient({ initialAdminEmail }: AdminDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('events');

  const [eventsState, setEventsState] = useState<PageState<Event>>(() => initialPageState<Event>());
  const [organizationsState, setOrganizationsState] =
    useState<PageState<Organization>>(() => initialPageState<Organization>());
  const [fieldsState, setFieldsState] = useState<PageState<AdminFieldRow>>(() => initialPageState<AdminFieldRow>());
  const [usersState, setUsersState] = useState<PageState<AdminUserRow>>(() => initialPageState<AdminUserRow>(''));
  const [userSearchInput, setUserSearchInput] = useState('');

  const loadEvents = useCallback(async (offset = 0, query = eventsState.query) => {
    setEventsState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/events?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load events.');
      }
      setEventsState({
        items: Array.isArray(payload.events) ? payload.events : [],
        total: Number(payload.total ?? 0),
        limit: Number(payload.limit ?? DEFAULT_LIMIT),
        offset: Number(payload.offset ?? 0),
        loading: false,
        loaded: true,
        error: null,
        query: normalizedQuery,
      });
    } catch (error) {
      setEventsState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load events.',
      }));
    }
  }, [eventsState.query]);

  const loadOrganizations = useCallback(async (offset = 0, query = organizationsState.query) => {
    setOrganizationsState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/organizations?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load organizations.');
      }
      setOrganizationsState({
        items: Array.isArray(payload.organizations) ? payload.organizations : [],
        total: Number(payload.total ?? 0),
        limit: Number(payload.limit ?? DEFAULT_LIMIT),
        offset: Number(payload.offset ?? 0),
        loading: false,
        loaded: true,
        error: null,
        query: normalizedQuery,
      });
    } catch (error) {
      setOrganizationsState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load organizations.',
      }));
    }
  }, [organizationsState.query]);

  const loadFields = useCallback(async (offset = 0, query = fieldsState.query) => {
    setFieldsState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/fields?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load fields.');
      }
      setFieldsState({
        items: Array.isArray(payload.fields) ? payload.fields : [],
        total: Number(payload.total ?? 0),
        limit: Number(payload.limit ?? DEFAULT_LIMIT),
        offset: Number(payload.offset ?? 0),
        loading: false,
        loaded: true,
        error: null,
        query: normalizedQuery,
      });
    } catch (error) {
      setFieldsState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load fields.',
      }));
    }
  }, [fieldsState.query]);

  const loadUsers = useCallback(async (offset = 0, query = usersState.query) => {
    setUsersState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load users.');
      }
      setUsersState({
        items: Array.isArray(payload.users) ? payload.users : [],
        total: Number(payload.total ?? 0),
        limit: Number(payload.limit ?? DEFAULT_LIMIT),
        offset: Number(payload.offset ?? 0),
        loading: false,
        loaded: true,
        error: null,
        query: normalizedQuery,
      });
    } catch (error) {
      setUsersState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load users.',
      }));
    }
  }, [usersState.query]);

  useEffect(() => {
    if (activeTab === 'events' && !eventsState.loaded) {
      void loadEvents(0);
    }
    if (activeTab === 'organizations' && !organizationsState.loaded) {
      void loadOrganizations(0);
    }
    if (activeTab === 'fields' && !fieldsState.loaded) {
      void loadFields(0);
    }
    if (activeTab === 'users' && !usersState.loaded) {
      void loadUsers(0, usersState.query);
    }
  }, [
    activeTab,
    eventsState.loaded,
    fieldsState.loaded,
    organizationsState.loaded,
    usersState.loaded,
    usersState.query,
    loadEvents,
    loadOrganizations,
    loadFields,
    loadUsers,
  ]);

  const activeState = useMemo(() => {
    if (activeTab === 'events') return eventsState;
    if (activeTab === 'organizations') return organizationsState;
    if (activeTab === 'fields') return fieldsState;
    return usersState;
  }, [activeTab, eventsState, organizationsState, fieldsState, usersState]);

  const onRefreshActiveTab = useCallback(() => {
    if (activeTab === 'events') {
      void loadEvents(eventsState.offset, eventsState.query);
    } else if (activeTab === 'organizations') {
      void loadOrganizations(organizationsState.offset, organizationsState.query);
    } else if (activeTab === 'fields') {
      void loadFields(fieldsState.offset, fieldsState.query);
    } else {
      void loadUsers(usersState.offset, usersState.query);
    }
  }, [
    activeTab,
    eventsState.offset,
    eventsState.query,
    organizationsState.offset,
    organizationsState.query,
    fieldsState.offset,
    fieldsState.query,
    usersState.offset,
    usersState.query,
    loadEvents,
    loadOrganizations,
    loadFields,
    loadUsers,
  ]);

  const onUsersSearch = useCallback(() => {
    const normalizedQuery = userSearchInput.trim();
    void loadUsers(0, normalizedQuery);
  }, [loadUsers, userSearchInput]);

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 py-8">
        <Container fluid>
          <Paper radius="lg" shadow="md" withBorder p="lg">
            <Group justify="space-between" align="flex-end" mb="sm">
              <div>
                <Title order={2}>Admin Dashboard</Title>
                <Text size="sm" c="dimmed">
                  Internal data explorer with 50-item pages for events, organizations, fields, and users.
                </Text>
              </div>
              <Group gap="xs">
                <Button component={Link} href="/admin/constants" variant="default">
                  Constants
                </Button>
                <Button variant="light" onClick={onRefreshActiveTab} loading={activeState.loading}>
                  Refresh
                </Button>
              </Group>
            </Group>

            <Group gap="xs" mb="md">
              <Badge color="blue" variant="light">Admin</Badge>
              <Text size="sm" c="dimmed">Signed in as {initialAdminEmail}</Text>
            </Group>

            <Tabs value={activeTab} onChange={(value) => setActiveTab((value as AdminTab) || 'events')}>
              <Tabs.List mb="md">
                <Tabs.Tab value="events">Events ({eventsState.total})</Tabs.Tab>
                <Tabs.Tab value="organizations">Organizations ({organizationsState.total})</Tabs.Tab>
                <Tabs.Tab value="fields">Fields ({fieldsState.total})</Tabs.Tab>
                <Tabs.Tab value="users">Users ({usersState.total})</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="events">
                <AdminPanelState
                  loading={eventsState.loading}
                  error={eventsState.error}
                  emptyMessage="No events found."
                  itemCount={eventsState.items.length}
                >
                  <ResponsiveCardGrid>
                    {eventsState.items.map((event) => (
                      <EventCard key={event.$id} event={event} />
                    ))}
                  </ResponsiveCardGrid>
                  <PaginationControls
                    total={eventsState.total}
                    limit={eventsState.limit}
                    offset={eventsState.offset}
                    loading={eventsState.loading}
                    onChange={(nextOffset) => {
                      void loadEvents(nextOffset, eventsState.query);
                    }}
                  />
                </AdminPanelState>
              </Tabs.Panel>

              <Tabs.Panel value="organizations">
                <AdminPanelState
                  loading={organizationsState.loading}
                  error={organizationsState.error}
                  emptyMessage="No organizations found."
                  itemCount={organizationsState.items.length}
                >
                  <ResponsiveCardGrid>
                    {organizationsState.items.map((organization) => (
                      <OrganizationCard key={organization.$id} organization={organization} />
                    ))}
                  </ResponsiveCardGrid>
                  <PaginationControls
                    total={organizationsState.total}
                    limit={organizationsState.limit}
                    offset={organizationsState.offset}
                    loading={organizationsState.loading}
                    onChange={(nextOffset) => {
                      void loadOrganizations(nextOffset, organizationsState.query);
                    }}
                  />
                </AdminPanelState>
              </Tabs.Panel>

              <Tabs.Panel value="fields">
                <AdminPanelState
                  loading={fieldsState.loading}
                  error={fieldsState.error}
                  emptyMessage="No fields found."
                  itemCount={fieldsState.items.length}
                >
                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Field</Table.Th>
                        <Table.Th>Organization</Table.Th>
                        <Table.Th>Location</Table.Th>
                        <Table.Th>ID</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {fieldsState.items.map((field) => (
                        <Table.Tr key={field.$id}>
                          <Table.Td>
                            {field.name || `Field ${field.fieldNumber ?? 'n/a'}`}
                          </Table.Td>
                          <Table.Td>{field.organization?.name ?? 'Unassigned'}</Table.Td>
                          <Table.Td>{field.location || '—'}</Table.Td>
                          <Table.Td>{field.$id}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  <PaginationControls
                    total={fieldsState.total}
                    limit={fieldsState.limit}
                    offset={fieldsState.offset}
                    loading={fieldsState.loading}
                    onChange={(nextOffset) => {
                      void loadFields(nextOffset, fieldsState.query);
                    }}
                  />
                </AdminPanelState>
              </Tabs.Panel>

              <Tabs.Panel value="users">
                <Group gap="sm" mb="md">
                  <TextInput
                    value={userSearchInput}
                    onChange={(event) => setUserSearchInput(event.currentTarget.value)}
                    placeholder="Search by name, username, ID, or email"
                    leftSection={<Search size={16} />}
                    style={{ flex: 1 }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        onUsersSearch();
                      }
                    }}
                  />
                  <Button onClick={onUsersSearch}>Search</Button>
                  <Button
                    variant="default"
                    onClick={() => {
                      setUserSearchInput('');
                      void loadUsers(0, '');
                    }}
                  >
                    Clear
                  </Button>
                </Group>

                <AdminPanelState
                  loading={usersState.loading}
                  error={usersState.error}
                  emptyMessage="No users found."
                  itemCount={usersState.items.length}
                >
                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Username</Table.Th>
                        <Table.Th>Email</Table.Th>
                        <Table.Th>ID</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {usersState.items.map((user) => (
                        <Table.Tr key={user.$id}>
                          <Table.Td>{[user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—'}</Table.Td>
                          <Table.Td>{user.userName || '—'}</Table.Td>
                          <Table.Td>{user.email || '—'}</Table.Td>
                          <Table.Td>{user.$id}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  <PaginationControls
                    total={usersState.total}
                    limit={usersState.limit}
                    offset={usersState.offset}
                    loading={usersState.loading}
                    onChange={(nextOffset) => {
                      void loadUsers(nextOffset, usersState.query);
                    }}
                  />
                </AdminPanelState>
              </Tabs.Panel>
            </Tabs>
          </Paper>
        </Container>
      </div>
    </>
  );
}

type AdminPanelStateProps = {
  loading: boolean;
  error: string | null;
  itemCount: number;
  emptyMessage: string;
  children: ReactNode;
};

function AdminPanelState({ loading, error, itemCount, emptyMessage, children }: AdminPanelStateProps) {
  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }
  if (error) {
    return (
      <Alert color="red" mb="md">
        {error}
      </Alert>
    );
  }
  if (itemCount === 0) {
    return <Text c="dimmed">{emptyMessage}</Text>;
  }
  return <>{children}</>;
}

type PaginationControlsProps = {
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  onChange: (nextOffset: number) => void;
};

function PaginationControls({ total, limit, offset, loading, onChange }: PaginationControlsProps) {
  if (total <= limit) {
    return null;
  }

  const currentPage = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const canGoBack = offset > 0;
  const canGoForward = offset + limit < total;

  return (
    <Group justify="space-between" mt="md">
      <Text size="sm" c="dimmed">
        Page {currentPage} of {pageCount} ({total} total)
      </Text>
      <Group gap="xs">
        <Button
          variant="default"
          disabled={!canGoBack || loading}
          onClick={() => onChange(Math.max(offset - limit, 0))}
        >
          Previous
        </Button>
        <Button
          variant="default"
          disabled={!canGoForward || loading}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </Button>
      </Group>
    </Group>
  );
}
