'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { apiRequest } from '@/lib/apiClient';

export type AdminFeedbackItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: 'BUG' | 'IDEA' | 'GENERAL';
  status: 'NEW' | 'IN_REVIEW' | 'PLANNED' | 'CLOSED';
  message: string;
  additionalContext: string | null;
  submitterUserId: string | null;
  allowContact: boolean;
  contactEmail: string | null;
  sourcePath: string | null;
  userAgent: string | null;
  clientContext: Record<string, unknown>;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNotes: string | null;
};

type FeedbackListResponse = {
  items: AdminFeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const statusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'CLOSED', label: 'Closed' },
];

const typeOptions = [
  { value: 'BUG', label: 'Bug' },
  { value: 'IDEA', label: 'Idea' },
  { value: 'GENERAL', label: 'General' },
];

const formatFeedbackType = (type: AdminFeedbackItem['type']): string => (
  type === 'BUG' ? 'Bug' : type === 'IDEA' ? 'Idea' : 'General'
);

const isSafeInternalPath = (path: string | null): path is string => (
  Boolean(path && path.startsWith('/') && !path.startsWith('//') && !path.includes('?') && !path.includes('#'))
);

export type AdminFeedbackPanelProps = {
  active: boolean;
  initialId?: string | null;
  openCount?: number;
  onOpenCountChange?: () => void;
};

export default function AdminFeedbackPanel({
  active,
  initialId,
  openCount,
  onOpenCountChange,
}: AdminFeedbackPanelProps) {
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [type, setType] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminFeedbackItem | null>(null);
  const [draftStatus, setDraftStatus] = useState<AdminFeedbackItem['status']>('NEW');
  const [draftNotes, setDraftNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadFeedback = useCallback(async (nextPage = 1, queryOverride = appliedQuery) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '25' });
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (queryOverride.trim()) params.set('query', queryOverride.trim());
      if (nextPage === 1 && initialId) params.set('id', initialId);
      const result = await apiRequest<FeedbackListResponse>(`/api/admin/feedback?${params.toString()}`);
      setItems(Array.isArray(result?.items) ? result.items : []);
      setTotal(Number(result?.total ?? 0));
      setPage(Number(result?.page ?? nextPage));
      setTotalPages(Number(result?.totalPages ?? 0));
      if (initialId) {
        const initialItem = (Array.isArray(result?.items) ? result.items : []).find((item) => item.id === initialId);
        if (initialItem) setSelected(initialItem);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load feedback.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, initialId, status, type]);

  useEffect(() => {
    if (active) void loadFeedback(1);
  }, [active, loadFeedback]);

  useEffect(() => {
    if (!selected) return;
    setDraftStatus(selected.status);
    setDraftNotes(selected.reviewNotes ?? '');
    setSaveMessage(null);
  }, [selected]);

  const derivedOpenCount = useMemo(
    () => items.filter((item) => item.status === 'NEW' || item.status === 'IN_REVIEW').length,
    [items],
  );

  const saveSelected = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const result = await apiRequest<{ item: AdminFeedbackItem }>(
        `/api/admin/feedback/${encodeURIComponent(selected.id)}`,
        {
          method: 'PATCH',
          body: { status: draftStatus, reviewNotes: draftNotes },
        },
      );
      setSelected(result.item);
      setItems((current) => current.map((item) => item.id === result.item.id ? result.item : item));
      setSaveMessage('Feedback updated.');
      onOpenCountChange?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update feedback.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={3}>Feedback</Title>
          <Text size="sm" c="dimmed">Review reports, ideas, and general product feedback.</Text>
        </div>
        <Badge color="blue" variant="light">Open: {openCount ?? derivedOpenCount}</Badge>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Group align="flex-end" wrap="wrap">
          <Select label="Type" placeholder="All types" clearable data={typeOptions} value={type} onChange={setType} />
          <Select label="Status" placeholder="All statuses" clearable data={statusOptions} value={status} onChange={setStatus} />
          <TextInput label="Search" placeholder="Message, email, or user ID" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
          <Button onClick={() => { setAppliedQuery(query); void loadFeedback(1, query); }}>Apply filters</Button>
        </Group>
      </Paper>

      {error ? <Alert color="red">{error}</Alert> : null}
      {saveMessage ? <Alert color="teal">{saveMessage}</Alert> : null}

      {loading ? (
        <Group justify="center" py="xl"><Loader /></Group>
      ) : items.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed">No feedback matches these filters.</Text>
        </Paper>
      ) : (
        <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Created</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Message</Table.Th>
                <Table.Th>Contact</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
                  <Table.Td>{new Date(item.createdAt).toLocaleString()}</Table.Td>
                  <Table.Td>{formatFeedbackType(item.type)}</Table.Td>
                  <Table.Td>{statusOptions.find((option) => option.value === item.status)?.label ?? item.status}</Table.Td>
                  <Table.Td><Text lineClamp={2} maw={460}>{item.message}</Text></Table.Td>
                  <Table.Td>{item.allowContact ? 'Permitted' : 'Not permitted'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {totalPages > 1 ? (
        <Group justify="space-between">
          <Text size="sm" c="dimmed">{total} total submissions</Text>
          <Pagination value={page} onChange={(nextPage) => { void loadFeedback(nextPage); }} total={totalPages} />
        </Group>
      ) : null}

      <Drawer
        opened={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Feedback details"
        position="right"
        size="min(100vw, 620px)"
      >
        {selected ? (
          <Stack gap="md">
            <Group justify="space-between">
              <Badge>{formatFeedbackType(selected.type)}</Badge>
              <Text size="xs" c="dimmed" ff="monospace">{selected.id}</Text>
            </Group>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{selected.message}</Text>
            {selected.additionalContext ? (
              <div>
                <Text size="xs" fw={700} c="dimmed">Additional context</Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{selected.additionalContext}</Text>
              </div>
            ) : null}
            <Stack gap={4}>
              <Text size="sm"><strong>Source:</strong>{' '}
                {isSafeInternalPath(selected.sourcePath) ? <Link href={selected.sourcePath}>{selected.sourcePath}</Link> : selected.sourcePath || 'Not provided'}
              </Text>
              <Text size="sm"><strong>Submitter:</strong> {selected.submitterUserId || 'Guest'}</Text>
              <Text size="sm"><strong>Contact:</strong> {selected.allowContact ? selected.contactEmail || 'No email provided' : 'Not permitted'}</Text>
              <Text size="sm"><strong>User agent:</strong> {selected.userAgent || 'Not provided'}</Text>
              <Text size="sm"><strong>Client context:</strong> {JSON.stringify(selected.clientContext)}</Text>
            </Stack>
            <Select label="Status" data={statusOptions} value={draftStatus} onChange={(value) => setDraftStatus((value as AdminFeedbackItem['status']) || 'NEW')} />
            <Textarea label="Review notes" minRows={5} maxLength={5000} value={draftNotes} onChange={(event) => setDraftNotes(event.currentTarget.value)} />
            <Button onClick={() => { void saveSelected(); }} loading={saving}>Save review</Button>
          </Stack>
        ) : null}
      </Drawer>
    </Stack>
  );
}
