'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/layout/Navigation';
import EventCard from '@/components/ui/EventCard';
import OrganizationCard from '@/components/ui/OrganizationCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import {
  organizationVerificationStatusLabel,
  resolveOrganizationVerificationStatus,
} from '@/lib/organizationVerification';
import type { Event, Field, Organization, UserData } from '@/types';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Select,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { Search } from 'lucide-react';

type AdminTab = 'events' | 'organizations' | 'verification' | 'fields' | 'users' | 'chats' | 'moderation';

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
  disabledAt?: string | null;
  disabledByUserId?: string | null;
  disabledReason?: string | null;
};

type AdminChatGroupRow = {
  $id: string;
  name?: string | null;
  userIds: string[];
  hostId: string;
  archivedAt?: string | null;
  archivedReason?: string | null;
  memberUsers?: UserData[];
  lastMessage?: {
    $id?: string;
    body?: string | null;
    sentTime?: string | null;
    removedAt?: string | null;
  } | null;
};

type AdminChatMessageRow = {
  $id: string;
  body?: string | null;
  userId: string;
  sentTime?: string | null;
  removedAt?: string | null;
  removalReason?: string | null;
  sender?: UserData | null;
};

type AdminModerationReportRow = {
  $id: string;
  targetType: 'CHAT_GROUP' | 'EVENT' | 'BLOCK_USER';
  targetId: string;
  targetOwnerUserId?: string | null;
  category?: string | null;
  notes?: string | null;
  status: 'OPEN' | 'IN_REVIEW' | 'ACTIONED' | 'DISMISSED';
  dueAt?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  reporterUserId: string;
  reporter?: UserData | null;
  reviewer?: UserData | null;
  isOverdue?: boolean;
};

type VerificationDraft = {
  reviewStatus: 'NONE' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  reviewNotes: string;
  saving: boolean;
  error: string | null;
};

type ModerationDraft = {
  status: AdminModerationReportRow['status'];
  reviewNotes: string;
  saving: boolean;
  error: string | null;
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
  const [verificationState, setVerificationState] =
    useState<PageState<Organization>>(() => initialPageState<Organization>());
  const [fieldsState, setFieldsState] = useState<PageState<AdminFieldRow>>(() => initialPageState<AdminFieldRow>());
  const [usersState, setUsersState] = useState<PageState<AdminUserRow>>(() => initialPageState<AdminUserRow>(''));
  const [chatsState, setChatsState] = useState<PageState<AdminChatGroupRow>>(() => initialPageState<AdminChatGroupRow>(''));
  const [moderationState, setModerationState] =
    useState<PageState<AdminModerationReportRow>>(() => initialPageState<AdminModerationReportRow>(''));
  const [verificationDrafts, setVerificationDrafts] = useState<Record<string, VerificationDraft>>({});
  const [moderationDrafts, setModerationDrafts] = useState<Record<string, ModerationDraft>>({});
  const [userSearchInput, setUserSearchInput] = useState('');
  const [selectedChatGroupId, setSelectedChatGroupId] = useState<string | null>(null);
  const [selectedChatGroup, setSelectedChatGroup] = useState<AdminChatGroupRow | null>(null);
  const [selectedChatMessages, setSelectedChatMessages] = useState<AdminChatMessageRow[]>([]);
  const [selectedChatLoading, setSelectedChatLoading] = useState(false);
  const [selectedChatError, setSelectedChatError] = useState<string | null>(null);

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

  const loadVerifications = useCallback(async (offset = 0, query = verificationState.query) => {
    setVerificationState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/organization-verifications?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load verification queue.');
      }
      setVerificationState({
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
      setVerificationState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load verification queue.',
      }));
    }
  }, [verificationState.query]);

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

  const loadChats = useCallback(async (offset = 0, query = chatsState.query) => {
    setChatsState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/chat-groups?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load chat groups.');
      }
      setChatsState({
        items: Array.isArray(payload.groups) ? payload.groups : [],
        total: Number(payload.total ?? 0),
        limit: Number(payload.limit ?? DEFAULT_LIMIT),
        offset: Number(payload.offset ?? 0),
        loading: false,
        loaded: true,
        error: null,
        query: normalizedQuery,
      });
    } catch (error) {
      setChatsState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load chat groups.',
      }));
    }
  }, [chatsState.query]);

  const loadModeration = useCallback(async (offset = 0, query = moderationState.query) => {
    setModerationState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      });
      const normalizedQuery = query.trim();
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery);
      }
      const res = await fetch(`/api/admin/moderation?${params.toString()}`, { credentials: 'include' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load moderation queue.');
      }
      setModerationState({
        items: Array.isArray(payload.reports) ? payload.reports : [],
        total: Number(payload.total ?? 0),
        limit: Number(payload.limit ?? DEFAULT_LIMIT),
        offset: Number(payload.offset ?? 0),
        loading: false,
        loaded: true,
        error: null,
        query: normalizedQuery,
      });
    } catch (error) {
      setModerationState((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load moderation queue.',
      }));
    }
  }, [moderationState.query]);

  const loadSelectedChat = useCallback(async (chatGroupId: string) => {
    setSelectedChatGroupId(chatGroupId);
    setSelectedChatLoading(true);
    setSelectedChatError(null);
    try {
      const res = await fetch(`/api/admin/chat-groups/${encodeURIComponent(chatGroupId)}/messages`, {
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load chat inspector.');
      }
      setSelectedChatGroup(payload.group ?? null);
      setSelectedChatMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (error) {
      setSelectedChatGroup(null);
      setSelectedChatMessages([]);
      setSelectedChatError(error instanceof Error ? error.message : 'Failed to load chat inspector.');
    } finally {
      setSelectedChatLoading(false);
    }
  }, []);

  const getModerationDraft = useCallback((report: AdminModerationReportRow): ModerationDraft => (
    moderationDrafts[report.$id] ?? {
      status: report.status,
      reviewNotes: report.reviewNotes ?? '',
      saving: false,
      error: null,
    }
  ), [moderationDrafts]);

  const updateModerationDraft = useCallback((report: AdminModerationReportRow, patch: Partial<ModerationDraft>) => {
    setModerationDrafts((previous) => ({
      ...previous,
      [report.$id]: {
        ...getModerationDraft(report),
        ...patch,
      },
    }));
  }, [getModerationDraft]);

  const saveModerationReview = useCallback(async (report: AdminModerationReportRow) => {
    const draft = getModerationDraft(report);
    updateModerationDraft(report, { saving: true, error: null });
    try {
      const res = await fetch(`/api/admin/moderation/${report.$id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: draft.status,
          reviewNotes: draft.reviewNotes,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save moderation review.');
      }
      updateModerationDraft(report, { saving: false, error: null });
      await loadModeration(moderationState.offset, moderationState.query);
    } catch (error) {
      updateModerationDraft(report, {
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to save moderation review.',
      });
    }
  }, [
    getModerationDraft,
    loadModeration,
    moderationState.offset,
    moderationState.query,
    updateModerationDraft,
  ]);

  const moderateChatArchive = useCallback(async (chatGroupId: string) => {
    const res = await fetch(`/api/admin/chat-groups/${encodeURIComponent(chatGroupId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ archived: true, reason: 'ADMIN_ARCHIVE' }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to archive chat group.');
    }
  }, []);

  const removeModeratedMessage = useCallback(async (messageId: string) => {
    const res = await fetch(`/api/admin/messages/${encodeURIComponent(messageId)}/remove`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to remove message.');
    }
  }, []);

  const setUserSuspension = useCallback(async (userId: string, disabled: boolean) => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/suspend`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ disabled }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || `Failed to ${disabled ? 'suspend' : 'restore'} user.`);
    }
  }, []);

  const moderateEvent = useCallback(async (eventId: string) => {
    const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/moderation`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'UNPUBLISH' }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to unpublish event.');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'events' && !eventsState.loaded) {
      void loadEvents(0);
    }
    if (activeTab === 'organizations' && !organizationsState.loaded) {
      void loadOrganizations(0);
    }
    if (activeTab === 'verification' && !verificationState.loaded) {
      void loadVerifications(0);
    }
    if (activeTab === 'fields' && !fieldsState.loaded) {
      void loadFields(0);
    }
    if (activeTab === 'users' && !usersState.loaded) {
      void loadUsers(0, usersState.query);
    }
    if (activeTab === 'chats' && !chatsState.loaded) {
      void loadChats(0, chatsState.query);
    }
    if (activeTab === 'moderation' && !moderationState.loaded) {
      void loadModeration(0, moderationState.query);
    }
  }, [
    activeTab,
    chatsState.loaded,
    chatsState.query,
    eventsState.loaded,
    fieldsState.loaded,
    loadChats,
    organizationsState.loaded,
    loadModeration,
    moderationState.loaded,
    moderationState.query,
    verificationState.loaded,
    usersState.loaded,
    usersState.query,
    loadEvents,
    loadOrganizations,
    loadVerifications,
    loadFields,
    loadUsers,
  ]);

  const activeState = useMemo(() => {
    if (activeTab === 'events') return eventsState;
    if (activeTab === 'organizations') return organizationsState;
    if (activeTab === 'verification') return verificationState;
    if (activeTab === 'fields') return fieldsState;
    if (activeTab === 'chats') return chatsState;
    if (activeTab === 'moderation') return moderationState;
    return usersState;
  }, [activeTab, chatsState, eventsState, fieldsState, moderationState, organizationsState, verificationState, usersState]);

  const onRefreshActiveTab = useCallback(() => {
    if (activeTab === 'events') {
      void loadEvents(eventsState.offset, eventsState.query);
    } else if (activeTab === 'organizations') {
      void loadOrganizations(organizationsState.offset, organizationsState.query);
    } else if (activeTab === 'verification') {
      void loadVerifications(verificationState.offset, verificationState.query);
    } else if (activeTab === 'fields') {
      void loadFields(fieldsState.offset, fieldsState.query);
    } else if (activeTab === 'chats') {
      void loadChats(chatsState.offset, chatsState.query);
    } else if (activeTab === 'moderation') {
      void loadModeration(moderationState.offset, moderationState.query);
    } else {
      void loadUsers(usersState.offset, usersState.query);
    }
  }, [
    activeTab,
    chatsState.offset,
    chatsState.query,
    eventsState.offset,
    eventsState.query,
    fieldsState.offset,
    fieldsState.query,
    loadChats,
    loadEvents,
    loadFields,
    loadModeration,
    loadOrganizations,
    loadUsers,
    moderationState.offset,
    moderationState.query,
    organizationsState.offset,
    organizationsState.query,
    usersState.offset,
    usersState.query,
    verificationState.offset,
    verificationState.query,
    loadVerifications,
  ]);

  const onUsersSearch = useCallback(() => {
    const normalizedQuery = userSearchInput.trim();
    void loadUsers(0, normalizedQuery);
  }, [loadUsers, userSearchInput]);

  const getVerificationDraft = useCallback((organization: Organization): VerificationDraft => (
    verificationDrafts[organization.$id] ?? {
      reviewStatus: organization.verificationReviewStatus ?? 'NONE',
      reviewNotes: organization.verificationReviewNotes ?? '',
      saving: false,
      error: null,
    }
  ), [verificationDrafts]);

  const updateVerificationDraft = useCallback((
    organization: Organization,
    patch: Partial<VerificationDraft>,
  ) => {
    setVerificationDrafts((previous) => ({
      ...previous,
      [organization.$id]: {
        ...getVerificationDraft(organization),
        ...patch,
      },
    }));
  }, [getVerificationDraft]);

  const saveVerificationReview = useCallback(async (organization: Organization) => {
    const draft = getVerificationDraft(organization);
    updateVerificationDraft(organization, { saving: true, error: null });
    try {
      const res = await fetch(`/api/admin/organization-verifications/${organization.$id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewStatus: draft.reviewStatus,
          reviewNotes: draft.reviewNotes,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save verification review.');
      }
      updateVerificationDraft(organization, { saving: false, error: null });
      await Promise.all([
        loadVerifications(verificationState.offset, verificationState.query),
        loadOrganizations(organizationsState.offset, organizationsState.query),
      ]);
    } catch (error) {
      updateVerificationDraft(organization, {
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to save verification review.',
      });
    }
  }, [
    getVerificationDraft,
    loadOrganizations,
    loadVerifications,
    organizationsState.offset,
    organizationsState.query,
    updateVerificationDraft,
    verificationState.offset,
    verificationState.query,
  ]);

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
                <Tabs.Tab value="verification">Verification ({verificationState.total})</Tabs.Tab>
                <Tabs.Tab value="fields">Fields ({fieldsState.total})</Tabs.Tab>
                <Tabs.Tab value="users">Users ({usersState.total})</Tabs.Tab>
                <Tabs.Tab value="chats">Chats ({chatsState.total})</Tabs.Tab>
                <Tabs.Tab value="moderation">Moderation ({moderationState.total})</Tabs.Tab>
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

              <Tabs.Panel value="verification">
                <AdminPanelState
                  loading={verificationState.loading}
                  error={verificationState.error}
                  emptyMessage="No organizations currently need verification review."
                  itemCount={verificationState.items.length}
                >
                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Organization</Table.Th>
                        <Table.Th>Verification</Table.Th>
                        <Table.Th>Review</Table.Th>
                        <Table.Th>Notes</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {verificationState.items.map((organization) => {
                        const draft = getVerificationDraft(organization);
                        const verificationStatus = resolveOrganizationVerificationStatus(organization);
                        return (
                          <Table.Tr key={organization.$id}>
                            <Table.Td>
                              <div>
                                <Text fw={600}>{organization.name}</Text>
                                <Text size="xs" c="dimmed">{organization.$id}</Text>
                              </div>
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                color={verificationStatus === 'VERIFIED' ? 'teal' : verificationStatus === 'ACTION_REQUIRED' ? 'yellow' : verificationStatus === 'LEGACY_CONNECTED' ? 'blue' : 'gray'}
                                variant="light"
                              >
                                {organizationVerificationStatusLabel(verificationStatus)}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Select
                                value={draft.reviewStatus}
                                data={[
                                  { value: 'NONE', label: 'None' },
                                  { value: 'OPEN', label: 'Open' },
                                  { value: 'IN_PROGRESS', label: 'In progress' },
                                  { value: 'RESOLVED', label: 'Resolved' },
                                ]}
                                onChange={(value) => {
                                  updateVerificationDraft(organization, {
                                    reviewStatus: (value as VerificationDraft['reviewStatus'] | null) ?? 'NONE',
                                  });
                                }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Textarea
                                minRows={2}
                                autosize
                                value={draft.reviewNotes}
                                onChange={(event) => {
                                  updateVerificationDraft(organization, {
                                    reviewNotes: event.currentTarget.value,
                                  });
                                }}
                                error={draft.error ?? undefined}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                loading={draft.saving}
                                onClick={() => {
                                  void saveVerificationReview(organization);
                                }}
                              >
                                Save
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                  <PaginationControls
                    total={verificationState.total}
                    limit={verificationState.limit}
                    offset={verificationState.offset}
                    loading={verificationState.loading}
                    onChange={(nextOffset) => {
                      void loadVerifications(nextOffset, verificationState.query);
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
                        <Table.Th>Status</Table.Th>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {usersState.items.map((user) => (
                        <Table.Tr key={user.$id}>
                          <Table.Td>{[user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—'}</Table.Td>
                          <Table.Td>{user.userName || '—'}</Table.Td>
                          <Table.Td>{user.email || '—'}</Table.Td>
                          <Table.Td>
                            {user.disabledAt ? (
                              <Badge color="red" variant="light">Suspended</Badge>
                            ) : (
                              <Badge color="teal" variant="light">Active</Badge>
                            )}
                          </Table.Td>
                          <Table.Td>{user.$id}</Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              variant={user.disabledAt ? 'default' : 'light'}
                              color={user.disabledAt ? 'gray' : 'red'}
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await setUserSuspension(user.$id, !user.disabledAt);
                                    await loadUsers(usersState.offset, usersState.query);
                                  } catch (error) {
                                    window.alert(error instanceof Error ? error.message : 'Unable to update user status.');
                                  }
                                })();
                              }}
                            >
                              {user.disabledAt ? 'Restore' : 'Suspend'}
                            </Button>
                          </Table.Td>
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

              <Tabs.Panel value="chats">
                <AdminPanelState
                  loading={chatsState.loading}
                  error={chatsState.error}
                  emptyMessage="No chat groups found."
                  itemCount={chatsState.items.length}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                    <div>
                      <Table striped highlightOnHover withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Chat</Table.Th>
                            <Table.Th>Members</Table.Th>
                            <Table.Th>Last Message</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Actions</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {chatsState.items.map((group) => (
                            <Table.Tr key={group.$id}>
                              <Table.Td>
                                <div>
                                  <Text fw={600}>{group.name?.trim() || 'Untitled chat'}</Text>
                                  <Text size="xs" c="dimmed">{group.$id}</Text>
                                </div>
                              </Table.Td>
                              <Table.Td>{group.memberUsers?.length ?? group.userIds.length} members</Table.Td>
                              <Table.Td>
                                {group.lastMessage ? (
                                  <div>
                                    <Text size="sm" lineClamp={2}>{group.lastMessage.body || 'No message body'}</Text>
                                    <Text size="xs" c="dimmed">{formatAdminDateTime(group.lastMessage.sentTime)}</Text>
                                  </div>
                                ) : (
                                  <Text size="sm" c="dimmed">No messages</Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {group.archivedAt ? (
                                  <div>
                                    <Badge color="yellow" variant="light">Archived</Badge>
                                    <Text size="xs" c="dimmed" mt={4}>
                                      {group.archivedReason || 'No reason recorded'}
                                    </Text>
                                  </div>
                                ) : (
                                  <Badge color="teal" variant="light">Active</Badge>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Button
                                    size="xs"
                                    variant={selectedChatGroupId === group.$id ? 'filled' : 'light'}
                                    onClick={() => {
                                      void loadSelectedChat(group.$id);
                                    }}
                                  >
                                    Inspect
                                  </Button>
                                  {!group.archivedAt ? (
                                    <Button
                                      size="xs"
                                      color="yellow"
                                      variant="default"
                                      onClick={() => {
                                        void (async () => {
                                          try {
                                            await moderateChatArchive(group.$id);
                                            await Promise.all([
                                              loadChats(chatsState.offset, chatsState.query),
                                              selectedChatGroupId === group.$id ? loadSelectedChat(group.$id) : Promise.resolve(),
                                            ]);
                                          } catch (error) {
                                            window.alert(error instanceof Error ? error.message : 'Unable to archive chat.');
                                          }
                                        })();
                                      }}
                                    >
                                      Archive
                                    </Button>
                                  ) : null}
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                      <PaginationControls
                        total={chatsState.total}
                        limit={chatsState.limit}
                        offset={chatsState.offset}
                        loading={chatsState.loading}
                        onChange={(nextOffset) => {
                          void loadChats(nextOffset, chatsState.query);
                        }}
                      />
                    </div>

                    <Paper withBorder p="md" radius="md">
                      <Group justify="space-between" align="flex-start" mb="sm">
                        <div>
                          <Title order={4}>Chat Inspector</Title>
                          <Text size="sm" c="dimmed">
                            Review messages and act without removing moderation evidence.
                          </Text>
                        </div>
                        {selectedChatGroup?.archivedAt ? (
                          <Badge color="yellow" variant="light">Archived</Badge>
                        ) : selectedChatGroup ? (
                          <Badge color="teal" variant="light">Active</Badge>
                        ) : null}
                      </Group>

                      {selectedChatLoading ? (
                        <Group justify="center" py="xl">
                          <Loader size="sm" />
                        </Group>
                      ) : selectedChatError ? (
                        <Alert color="red">{selectedChatError}</Alert>
                      ) : selectedChatGroup ? (
                        <>
                          <Text fw={600}>{selectedChatGroup.name?.trim() || 'Untitled chat'}</Text>
                          <Text size="xs" c="dimmed" mb="md">{selectedChatGroup.$id}</Text>
                          <Text size="sm" fw={600} mb={4}>Members</Text>
                          <Text size="sm" c="dimmed" mb="md">
                            {(selectedChatGroup.memberUsers ?? []).map((member) => (
                              [member.firstName, member.lastName].filter(Boolean).join(' ').trim() || member.userName || member.$id
                            )).join(', ') || 'No members'}
                          </Text>

                          <Table striped highlightOnHover withTableBorder withColumnBorders>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Sender</Table.Th>
                                <Table.Th>Message</Table.Th>
                                <Table.Th>Sent</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Actions</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {selectedChatMessages.map((message) => {
                                const senderName = message.sender
                                  ? ([message.sender.firstName, message.sender.lastName].filter(Boolean).join(' ').trim()
                                    || message.sender.userName
                                    || message.sender.$id)
                                  : message.userId;

                                return (
                                  <Table.Tr key={message.$id}>
                                    <Table.Td>
                                      <div>
                                        <Text size="sm">{senderName}</Text>
                                        <Text size="xs" c="dimmed">{message.userId}</Text>
                                      </div>
                                    </Table.Td>
                                    <Table.Td>
                                      <Text size="sm" lineClamp={4}>{message.body || 'No message body'}</Text>
                                      {message.removalReason ? (
                                        <Text size="xs" c="dimmed" mt={4}>{message.removalReason}</Text>
                                      ) : null}
                                    </Table.Td>
                                    <Table.Td>{formatAdminDateTime(message.sentTime)}</Table.Td>
                                    <Table.Td>
                                      {message.removedAt ? (
                                        <Badge color="red" variant="light">Removed</Badge>
                                      ) : (
                                        <Badge color="teal" variant="light">Visible</Badge>
                                      )}
                                    </Table.Td>
                                    <Table.Td>
                                      <Group gap="xs">
                                        {!message.removedAt ? (
                                          <Button
                                            size="xs"
                                            color="red"
                                            variant="light"
                                            onClick={() => {
                                              void (async () => {
                                                try {
                                                  await removeModeratedMessage(message.$id);
                                                  await Promise.all([
                                                    loadSelectedChat(selectedChatGroup.$id),
                                                    loadModeration(moderationState.offset, moderationState.query),
                                                  ]);
                                                } catch (error) {
                                                  window.alert(error instanceof Error ? error.message : 'Unable to remove message.');
                                                }
                                              })();
                                            }}
                                          >
                                            Remove
                                          </Button>
                                        ) : null}
                                        <Button
                                          size="xs"
                                          variant="default"
                                          onClick={() => {
                                            void (async () => {
                                              try {
                                                await setUserSuspension(message.userId, true);
                                                await loadUsers(usersState.offset, usersState.query);
                                              } catch (error) {
                                                window.alert(error instanceof Error ? error.message : 'Unable to suspend user.');
                                              }
                                            })();
                                          }}
                                        >
                                          Suspend
                                        </Button>
                                      </Group>
                                    </Table.Td>
                                  </Table.Tr>
                                );
                              })}
                            </Table.Tbody>
                          </Table>
                        </>
                      ) : (
                        <Text c="dimmed">Select a chat group to inspect its messages.</Text>
                      )}
                    </Paper>
                  </div>
                </AdminPanelState>
              </Tabs.Panel>

              <Tabs.Panel value="moderation">
                <AdminPanelState
                  loading={moderationState.loading}
                  error={moderationState.error}
                  emptyMessage="No moderation reports found."
                  itemCount={moderationState.items.length}
                >
                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Target</Table.Th>
                        <Table.Th>Reporter</Table.Th>
                        <Table.Th>Due</Table.Th>
                        <Table.Th>Review</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {moderationState.items.map((report) => {
                        const draft = getModerationDraft(report);
                        const reporterName = report.reporter
                          ? ([report.reporter.firstName, report.reporter.lastName].filter(Boolean).join(' ').trim()
                            || report.reporter.userName
                            || report.reporter.$id)
                          : report.reporterUserId;

                        return (
                          <Table.Tr key={report.$id}>
                            <Table.Td>
                              <div>
                                <Group gap="xs" mb={4}>
                                  <Badge color="blue" variant="light">{report.targetType}</Badge>
                                  <Badge
                                    color={
                                      report.status === 'ACTIONED'
                                        ? 'teal'
                                        : report.status === 'DISMISSED'
                                          ? 'gray'
                                          : report.status === 'IN_REVIEW'
                                            ? 'yellow'
                                            : 'red'
                                    }
                                    variant="light"
                                  >
                                    {report.status}
                                  </Badge>
                                  {report.isOverdue ? <Badge color="red">Overdue</Badge> : null}
                                </Group>
                                <Text size="sm" fw={600}>{report.category || 'Uncategorized'}</Text>
                                <Text size="xs" c="dimmed">{report.targetId}</Text>
                                {report.notes ? (
                                  <Text size="sm" mt={4} lineClamp={3}>{report.notes}</Text>
                                ) : null}
                              </div>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{reporterName}</Text>
                              <Text size="xs" c="dimmed">{report.reporterUserId}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{formatAdminDateTime(report.dueAt)}</Text>
                              {report.reviewedAt ? (
                                <Text size="xs" c="dimmed">Reviewed {formatAdminDateTime(report.reviewedAt)}</Text>
                              ) : null}
                            </Table.Td>
                            <Table.Td>
                              <Select
                                value={draft.status}
                                data={[
                                  { value: 'OPEN', label: 'Open' },
                                  { value: 'IN_REVIEW', label: 'In review' },
                                  { value: 'ACTIONED', label: 'Actioned' },
                                  { value: 'DISMISSED', label: 'Dismissed' },
                                ]}
                                onChange={(value) => {
                                  updateModerationDraft(report, {
                                    status: (value as AdminModerationReportRow['status'] | null) ?? 'OPEN',
                                  });
                                }}
                              />
                              <Textarea
                                mt="xs"
                                minRows={2}
                                autosize
                                value={draft.reviewNotes}
                                onChange={(event) => {
                                  updateModerationDraft(report, {
                                    reviewNotes: event.currentTarget.value,
                                  });
                                }}
                                error={draft.error ?? undefined}
                              />
                              <Button
                                mt="xs"
                                size="xs"
                                loading={draft.saving}
                                onClick={() => {
                                  void saveModerationReview(report);
                                }}
                              >
                                Save
                              </Button>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                {report.targetType === 'CHAT_GROUP' ? (
                                  <>
                                    <Button
                                      size="xs"
                                      variant="light"
                                      onClick={() => {
                                        setActiveTab('chats');
                                        void loadSelectedChat(report.targetId);
                                      }}
                                    >
                                      Open chat
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="default"
                                      color="yellow"
                                      onClick={() => {
                                        void (async () => {
                                          try {
                                            await moderateChatArchive(report.targetId);
                                            await Promise.all([
                                              loadChats(chatsState.offset, chatsState.query),
                                              loadModeration(moderationState.offset, moderationState.query),
                                            ]);
                                          } catch (error) {
                                            window.alert(error instanceof Error ? error.message : 'Unable to archive chat.');
                                          }
                                        })();
                                      }}
                                    >
                                      Archive chat
                                    </Button>
                                  </>
                                ) : null}
                                {report.targetType === 'EVENT' ? (
                                  <Button
                                    size="xs"
                                    variant="default"
                                    color="yellow"
                                    onClick={() => {
                                      void (async () => {
                                        try {
                                          await moderateEvent(report.targetId);
                                          await loadModeration(moderationState.offset, moderationState.query);
                                        } catch (error) {
                                          window.alert(error instanceof Error ? error.message : 'Unable to unpublish event.');
                                        }
                                      })();
                                    }}
                                  >
                                    Unpublish event
                                  </Button>
                                ) : null}
                                {report.targetOwnerUserId ? (
                                  <Button
                                    size="xs"
                                    color="red"
                                    variant="light"
                                    onClick={() => {
                                      void (async () => {
                                        try {
                                          await setUserSuspension(report.targetOwnerUserId as string, true);
                                          await Promise.all([
                                            loadUsers(usersState.offset, usersState.query),
                                            loadModeration(moderationState.offset, moderationState.query),
                                          ]);
                                        } catch (error) {
                                          window.alert(error instanceof Error ? error.message : 'Unable to suspend user.');
                                        }
                                      })();
                                    }}
                                  >
                                    Suspend user
                                  </Button>
                                ) : null}
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                  <PaginationControls
                    total={moderationState.total}
                    limit={moderationState.limit}
                    offset={moderationState.offset}
                    loading={moderationState.loading}
                    onChange={(nextOffset) => {
                      void loadModeration(nextOffset, moderationState.query);
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

function formatAdminDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
