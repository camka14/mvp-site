'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { ExternalLink, Pause, Play, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react';

type Sport = { id: string; name: string };
type DiscoveryRun = { id: string; status: string; createdAt: string };
type Campaign = {
  id: string;
  name: string;
  region: string;
  location?: string | null;
  sportIds: string[];
  sourceTypeHints: string[];
  status: string;
  autoCreateIntakes: boolean;
  searchIntervalMinutes: number;
  maxQueriesPerRun: number;
  maxResultsPerQuery: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  metadata?: { priorityRank?: number } | null;
  statusCounts: Record<string, number>;
  latestRun?: DiscoveryRun | null;
};
type DiscoveryResult = {
  id: string;
  title?: string | null;
  description?: string | null;
  canonicalUrl: string;
  policyKey: string;
  score: number;
  status: string;
  sourceTypeHints: string[];
  sportHints: string[];
  reasonCodes: string[];
  latestQuery: string;
  latestRank: number;
  seenCount: number;
  matchingIntakeId?: string | null;
  matchingSourceId?: string | null;
  matchingOrganizationId?: string | null;
};

type Props = { active: boolean; refreshKey: number; onIntakesChanged?: () => void };
type Notice = { color: 'red' | 'teal' | 'yellow' | 'blue'; title: string; body: string };

const sourceTypeOptions = [
  'CLUB', 'TRYOUT', 'EVENT', 'LEAGUE', 'TOURNAMENT', 'CAMP', 'CLINIC', 'OPEN_PLAY', 'RENTAL', 'DIRECTORY',
];
const resultStatusOptions = [
  { value: '', label: 'All results' },
  ...['NEW', 'REVIEW_REQUIRED', 'INTAKE_CREATED', 'DUPLICATE', 'REJECTED', 'BLOCKED'].map((value) => ({ value, label: value.replace(/_/g, ' ') })),
];
const terminalRunStatuses = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED']);

const readPayload = async (response: Response): Promise<any> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload;
};

const statusColor = (status: string): string => {
  if (['ACTIVE', 'SUCCEEDED', 'INTAKE_CREATED'].includes(status)) return 'teal';
  if (['FAILED', 'BLOCKED', 'REJECTED'].includes(status)) return 'red';
  if (['QUEUED', 'RUNNING', 'NEW'].includes(status)) return 'blue';
  return 'yellow';
};

const emptyForm = () => ({
  name: '', region: '', location: '', sportIds: [] as string[], sourceTypeHints: [] as string[],
  status: 'PAUSED', autoCreateIntakes: true, searchIntervalMinutes: 10080,
  maxQueriesPerRun: 10, maxResultsPerQuery: 10,
});

export default function AdminAffiliateSourceDiscoveryPanel({ active, refreshKey, onIntakesChanged }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [minScoreFilter, setMinScoreFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorOpened, setEditorOpened] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const hasActiveRuns = useMemo(() => campaigns.some((campaign) => (
    campaign.latestRun && !terminalRunStatuses.has(campaign.latestRun.status)
  )), [campaigns]);
  const sportNameById = useMemo(() => new Map(sports.map((sport) => [sport.id, sport.name])), [sports]);

  const loadCampaigns = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    try {
      const payload = await readPayload(await fetch('/api/admin/affiliate-source-discovery', { credentials: 'include' }));
      setCampaigns(Array.isArray(payload.campaigns) ? payload.campaigns : []);
      setSports(Array.isArray(payload.sports) ? payload.sports : []);
    } catch (error) {
      setNotice({ color: 'red', title: 'Discovery unavailable', body: error instanceof Error ? error.message : 'Failed to load campaigns.' });
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  const loadResults = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (campaignFilter) params.set('campaignId', campaignFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (sourceTypeFilter) params.set('sourceType', sourceTypeFilter);
    if (sportFilter) params.set('sportHint', sportFilter);
    if (domainFilter.trim()) params.set('policyKey', domainFilter.trim());
    if (minScoreFilter.trim()) params.set('minScore', minScoreFilter.trim());
    if (appliedSearch) params.set('query', appliedSearch);
    try {
      const payload = await readPayload(await fetch(`/api/admin/affiliate-source-discovery/results?${params}`, { credentials: 'include' }));
      setResults(Array.isArray(payload.rows) ? payload.rows : []);
      setResultTotal(Number(payload.total ?? 0));
      setSelectedResultIds((current) => current.filter((id) => payload.rows?.some((row: DiscoveryResult) => row.id === id)));
    } catch (error) {
      setNotice({ color: 'red', title: 'Results unavailable', body: error instanceof Error ? error.message : 'Failed to load results.' });
    }
  }, [appliedSearch, campaignFilter, domainFilter, minScoreFilter, page, sourceTypeFilter, sportFilter, statusFilter]);

  useEffect(() => {
    if (active) void loadCampaigns();
  }, [active, loadCampaigns, refreshKey]);
  useEffect(() => {
    if (active) void loadResults();
  }, [active, loadResults, refreshKey]);
  useEffect(() => {
    if (!active || !hasActiveRuns) return undefined;
    const timer = window.setInterval(() => void Promise.all([loadCampaigns(false), loadResults()]), 3000);
    return () => window.clearInterval(timer);
  }, [active, hasActiveRuns, loadCampaigns, loadResults]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpened(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setForm({
      name: campaign.name,
      region: campaign.region,
      location: campaign.location ?? '',
      sportIds: campaign.sportIds,
      sourceTypeHints: campaign.sourceTypeHints,
      status: campaign.status,
      autoCreateIntakes: campaign.autoCreateIntakes,
      searchIntervalMinutes: campaign.searchIntervalMinutes,
      maxQueriesPerRun: campaign.maxQueriesPerRun,
      maxResultsPerQuery: campaign.maxResultsPerQuery,
    });
    setEditorOpened(true);
  };

  const saveCampaign = async () => {
    setSaving(true);
    try {
      const response = await fetch(editingId
        ? `/api/admin/affiliate-source-discovery/${encodeURIComponent(editingId)}`
        : '/api/admin/affiliate-source-discovery', {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, location: form.location || null }),
      });
      await readPayload(response);
      setEditorOpened(false);
      setNotice({ color: 'teal', title: 'Campaign saved', body: `${form.name} is ${form.status.toLowerCase()}.` });
      await loadCampaigns(false);
    } catch (error) {
      setNotice({ color: 'red', title: 'Campaign not saved', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const runCampaign = async (campaign: Campaign) => {
    setSaving(true);
    try {
      await readPayload(await fetch(`/api/admin/affiliate-source-discovery/${encodeURIComponent(campaign.id)}/runs`, {
        method: 'POST', credentials: 'include',
      }));
      setNotice({ color: 'blue', title: 'Discovery queued', body: `${campaign.name} will run in queue order.` });
      await loadCampaigns(false);
    } catch (error) {
      setNotice({ color: 'red', title: 'Discovery not queued', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCampaign = async (campaign: Campaign) => {
    const nextStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setSaving(true);
    try {
      await readPayload(await fetch(`/api/admin/affiliate-source-discovery/${encodeURIComponent(campaign.id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...campaign, status: nextStatus }),
      }));
      await loadCampaigns(false);
    } catch (error) {
      setNotice({ color: 'red', title: 'Campaign not updated', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const resultAction = async (result: DiscoveryResult, action: 'PROMOTE' | 'REJECT' | 'RETRY_CLASSIFICATION') => {
    setSaving(true);
    try {
      const response = action === 'PROMOTE'
        ? await fetch(`/api/admin/affiliate-source-discovery/results/${encodeURIComponent(result.id)}/promote`, { method: 'POST', credentials: 'include' })
        : await fetch(`/api/admin/affiliate-source-discovery/results/${encodeURIComponent(result.id)}`, {
          method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
        });
      await readPayload(response);
      setNotice({ color: action === 'REJECT' ? 'yellow' : 'teal', title: 'Result updated', body: action === 'PROMOTE' ? 'Source intake created.' : 'Discovery result updated.' });
      await Promise.all([loadResults(), loadCampaigns(false)]);
      if (action === 'PROMOTE') onIntakesChanged?.();
    } catch (error) {
      setNotice({ color: 'red', title: 'Result not updated', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const bulkAction = async (action: 'PROMOTE' | 'REJECT') => {
    if (!selectedResultIds.length) return;
    setSaving(true);
    try {
      await readPayload(await fetch('/api/admin/affiliate-source-discovery/results', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultIds: selectedResultIds, action }),
      }));
      setSelectedResultIds([]);
      await Promise.all([loadResults(), loadCampaigns(false)]);
      if (action === 'PROMOTE') onIntakesChanged?.();
    } catch (error) {
      setNotice({ color: 'red', title: 'Bulk action failed', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const addResultToExistingIntake = async (result: DiscoveryResult) => {
    const intakeId = window.prompt('Enter the existing source intake ID to receive this page:')?.trim();
    if (!intakeId) return;
    setSaving(true);
    try {
      await readPayload(await fetch(
        `/api/admin/affiliate-source-discovery/results/${encodeURIComponent(result.id)}/promote`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intakeId }),
        },
      ));
      setNotice({ color: 'teal', title: 'Page added', body: `The result was added to intake ${intakeId}.` });
      await loadResults();
      onIntakesChanged?.();
    } catch (error) {
      setNotice({ color: 'red', title: 'Page not added', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const blockResultDomain = async (result: DiscoveryResult) => {
    if (!window.confirm(`Block ${result.policyKey} from discovery and intake capture?`)) return;
    setSaving(true);
    try {
      await readPayload(await fetch(
        `/api/admin/affiliate-source-discovery/policies/${encodeURIComponent(result.policyKey)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'BLOCKED',
            restrictionNotes: 'Blocked from the source discovery review queue by an administrator.',
          }),
        },
      ));
      setNotice({ color: 'yellow', title: 'Domain blocked', body: `${result.policyKey} will not be captured.` });
      await loadResults();
    } catch (error) {
      setNotice({ color: 'red', title: 'Domain not blocked', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const allVisibleSelected = results.length > 0 && results.every((row) => selectedResultIds.includes(row.id));

  return <>
    <Paper withBorder radius="md" p="md" mb="md">
      <Group justify="space-between" mb="sm" align="flex-start">
        <div>
          <Title order={3}>Source Discovery</Title>
          <Text size="sm" c="dimmed">Search campaigns collect official source leads. Unknown domains still require policy review before capture.</Text>
        </div>
        <Group gap="xs">
          {loading ? <Loader size="sm" /> : null}
          <Button size="xs" leftSection={<Plus size={14} />} onClick={openCreate}>New Campaign</Button>
        </Group>
      </Group>
      {notice ? <Alert mb="sm" color={notice.color} title={notice.title} withCloseButton onClose={() => setNotice(null)}>{notice.body}</Alert> : null}
      <ScrollArea type="auto">
        <Table withTableBorder striped highlightOnHover miw={1050}>
          <Table.Thead><Table.Tr>
            <Table.Th>Campaign</Table.Th><Table.Th>Coverage</Table.Th><Table.Th>Cadence</Table.Th>
            <Table.Th>Results</Table.Th><Table.Th>Latest run</Table.Th><Table.Th>Actions</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {campaigns.map((campaign) => <Table.Tr key={campaign.id}>
              <Table.Td>
                <Text fw={600}>{campaign.metadata?.priorityRank ? `#${campaign.metadata.priorityRank} ${campaign.name}` : campaign.name}</Text>
                <Badge size="xs" color={statusColor(campaign.status)}>{campaign.status}</Badge>
              </Table.Td>
              <Table.Td><Text size="sm">{campaign.region}</Text><Text size="xs" c="dimmed">{campaign.sportIds.map((id) => sportNameById.get(id) ?? id).join(', ')}</Text><Text size="xs" c="dimmed">{campaign.sourceTypeHints.join(', ')}</Text></Table.Td>
              <Table.Td><Text size="sm">Every {Math.round(campaign.searchIntervalMinutes / 1440)} day(s)</Text><Text size="xs" c="dimmed">{campaign.maxQueriesPerRun} queries, {campaign.maxResultsPerQuery} results each</Text><Text size="xs" c="dimmed">Next: {campaign.nextRunAt ? new Date(campaign.nextRunAt).toLocaleString() : 'Not scheduled'}</Text></Table.Td>
              <Table.Td><Group gap={4}>{Object.entries(campaign.statusCounts ?? {}).map(([status, count]) => <Badge key={status} size="xs" color={statusColor(status)} variant="light">{status.replace(/_/g, ' ')} {count}</Badge>)}</Group></Table.Td>
              <Table.Td>{campaign.latestRun ? <Stack gap={2}><Badge size="xs" color={statusColor(campaign.latestRun.status)}>{campaign.latestRun.status}</Badge><Text size="xs" c="dimmed">{new Date(campaign.latestRun.createdAt).toLocaleString()}</Text></Stack> : 'Never'}</Table.Td>
              <Table.Td><Group gap="xs" wrap="nowrap">
                <Button size="compact-xs" variant="default" onClick={() => openEdit(campaign)}>Edit</Button>
                <Button size="compact-xs" variant="light" leftSection={<Play size={12} />} loading={saving && campaign.latestRun?.status === 'QUEUED'} onClick={() => void runCampaign(campaign)}>Run</Button>
                <Button size="compact-xs" variant="subtle" leftSection={campaign.status === 'ACTIVE' ? <Pause size={12} /> : <Play size={12} />} onClick={() => void toggleCampaign(campaign)}>{campaign.status === 'ACTIVE' ? 'Pause' : 'Enable'}</Button>
              </Group></Table.Td>
            </Table.Tr>)}
            {!campaigns.length && !loading ? <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">No discovery campaigns configured.</Text></Table.Td></Table.Tr> : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>

    <Paper withBorder radius="md" p="md" mb="md">
      <Group justify="space-between" mb="sm" align="flex-end">
        <Group align="flex-end" gap="xs" wrap="wrap">
          <Select label="Campaign" data={[{ value: '', label: 'All campaigns' }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]} value={campaignFilter} onChange={(value) => { setCampaignFilter(value ?? ''); setPage(1); }} w={220} />
          <Select label="Status" data={resultStatusOptions} value={statusFilter} onChange={(value) => { setStatusFilter(value ?? ''); setPage(1); }} w={180} />
          <Select label="Source type" clearable data={sourceTypeOptions.map((value) => ({ value, label: value.replace(/_/g, ' ') }))} value={sourceTypeFilter || null} onChange={(value) => { setSourceTypeFilter(value ?? ''); setPage(1); }} w={160} />
          <Select label="Sport" clearable searchable data={sports.map((sport) => ({ value: sport.id, label: sport.name }))} value={sportFilter || null} onChange={(value) => { setSportFilter(value ?? ''); setPage(1); }} w={170} />
          <TextInput label="Minimum score" type="number" min={0} max={100} value={minScoreFilter} onChange={(event) => { setMinScoreFilter(event.currentTarget.value); setPage(1); }} w={120} />
          <TextInput label="Domain" placeholder="example.com" value={domainFilter} onChange={(event) => { setDomainFilter(event.currentTarget.value); setPage(1); }} w={170} />
          <TextInput label="Search results" value={searchText} onChange={(event) => setSearchText(event.currentTarget.value)} rightSection={<Search size={15} />} onKeyDown={(event) => { if (event.key === 'Enter') { setAppliedSearch(searchText.trim()); setPage(1); } }} w={260} />
          <Button variant="default" onClick={() => { setAppliedSearch(searchText.trim()); setPage(1); }}>Search</Button>
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed">{resultTotal} results</Text>
          <Button size="xs" variant="default" leftSection={<Trash2 size={14} />} disabled={!selectedResultIds.length} onClick={() => void bulkAction('REJECT')}>Reject Selected</Button>
          <Button size="xs" leftSection={<Upload size={14} />} disabled={!selectedResultIds.length} onClick={() => void bulkAction('PROMOTE')}>Create Intakes</Button>
        </Group>
      </Group>
      <ScrollArea type="auto"><Table withTableBorder striped highlightOnHover miw={1200}>
        <Table.Thead><Table.Tr>
          <Table.Th w={44}><Checkbox aria-label="Select visible discovery results" checked={allVisibleSelected} onChange={(event) => setSelectedResultIds(event.currentTarget.checked ? results.map((row) => row.id) : [])} /></Table.Th>
          <Table.Th>Result</Table.Th><Table.Th>Classification</Table.Th><Table.Th>Score</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {results.map((result) => <Table.Tr key={result.id}>
            <Table.Td><Checkbox aria-label={`Select ${result.title ?? result.canonicalUrl}`} checked={selectedResultIds.includes(result.id)} onChange={(event) => setSelectedResultIds((current) => event.currentTarget.checked ? [...current, result.id] : current.filter((id) => id !== result.id))} /></Table.Td>
            <Table.Td><Text fw={600} lineClamp={1}>{result.title || result.policyKey}</Text><Text component="a" href={result.canonicalUrl} target="_blank" rel="noreferrer" size="xs" c="blue" lineClamp={1}>{result.canonicalUrl}</Text><Text size="xs" c="dimmed" lineClamp={1}>{result.latestQuery}</Text></Table.Td>
            <Table.Td><Group gap={4}>{result.sourceTypeHints.map((type) => <Badge key={type} size="xs" variant="light">{type.replace(/_/g, ' ')}</Badge>)}</Group><Text size="xs" c="dimmed" lineClamp={1}>{result.reasonCodes.join(', ') || 'No signals'}</Text></Table.Td>
            <Table.Td><Text fw={700}>{result.score}</Text><Text size="xs" c="dimmed">Seen {result.seenCount}x</Text></Table.Td>
            <Table.Td><Badge color={statusColor(result.status)}>{result.status.replace(/_/g, ' ')}</Badge><Text size="xs" c="dimmed">{result.policyKey}</Text>{result.matchingIntakeId ? <Text size="xs" c="dimmed">Intake: {result.matchingIntakeId}</Text> : null}{result.matchingSourceId ? <Text size="xs" c="dimmed">Source: {result.matchingSourceId}</Text> : null}{result.matchingOrganizationId ? <Text size="xs" c="dimmed">Organization: {result.matchingOrganizationId}</Text> : null}</Table.Td>
            <Table.Td><Group gap="xs" wrap="nowrap">
              {['NEW', 'REVIEW_REQUIRED'].includes(result.status) ? <Button size="compact-xs" leftSection={<Upload size={12} />} onClick={() => void resultAction(result, 'PROMOTE')}>Intake</Button> : null}
              {['NEW', 'REVIEW_REQUIRED'].includes(result.status) ? <Button size="compact-xs" variant="default" onClick={() => void addResultToExistingIntake(result)}>Add page</Button> : null}
              {result.status !== 'BLOCKED' ? <Button size="compact-xs" color="orange" variant="subtle" onClick={() => void blockResultDomain(result)}>Block domain</Button> : null}
              {result.status !== 'REJECTED' ? <Button size="compact-xs" color="red" variant="subtle" onClick={() => void resultAction(result, 'REJECT')}>Reject</Button> : <Button size="compact-xs" variant="subtle" leftSection={<RefreshCw size={12} />} onClick={() => void resultAction(result, 'RETRY_CLASSIFICATION')}>Review</Button>}
              <Button component="a" href={result.canonicalUrl} target="_blank" rel="noreferrer" size="compact-xs" variant="default" px={6} aria-label="Open source"><ExternalLink size={12} /></Button>
            </Group></Table.Td>
          </Table.Tr>)}
          {!results.length ? <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">No discovery results match these filters.</Text></Table.Td></Table.Tr> : null}
        </Table.Tbody>
      </Table></ScrollArea>
      {resultTotal > 25 ? <Group justify="flex-end" mt="sm"><Pagination total={Math.ceil(resultTotal / 25)} value={page} onChange={setPage} /></Group> : null}
    </Paper>

    <Modal opened={editorOpened} onClose={() => setEditorOpened(false)} title={editingId ? 'Edit discovery campaign' : 'New discovery campaign'} size="lg">
      <Stack>
        <TextInput label="Campaign name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))} required />
        <TextInput label="Region" placeholder="Portland, Oregon metropolitan area" value={form.region} onChange={(event) => setForm((current) => ({ ...current, region: event.currentTarget.value }))} required />
        <TextInput label="Search location hint" placeholder="Portland, Oregon" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.currentTarget.value }))} />
        <MultiSelect label="Sports" searchable data={sports.map((sport) => ({ value: sport.id, label: sport.name }))} value={form.sportIds} onChange={(sportIds) => setForm((current) => ({ ...current, sportIds }))} required />
        <MultiSelect label="Source types" data={sourceTypeOptions} value={form.sourceTypeHints} onChange={(sourceTypeHints) => setForm((current) => ({ ...current, sourceTypeHints }))} required />
        <Group grow>
          <NumberInput label="Cadence in days" min={1} max={365} value={Math.round(form.searchIntervalMinutes / 1440)} onChange={(value) => setForm((current) => ({ ...current, searchIntervalMinutes: Math.max(1, Number(value) || 1) * 1440 }))} />
          <NumberInput label="Queries per run" min={1} max={50} value={form.maxQueriesPerRun} onChange={(value) => setForm((current) => ({ ...current, maxQueriesPerRun: Number(value) || 1 }))} />
          <NumberInput label="Results per query" min={1} max={20} value={form.maxResultsPerQuery} onChange={(value) => setForm((current) => ({ ...current, maxResultsPerQuery: Number(value) || 1 }))} />
        </Group>
        <Switch label="Automatically create high-confidence intakes" checked={form.autoCreateIntakes} onChange={(event) => setForm((current) => ({ ...current, autoCreateIntakes: event.currentTarget.checked }))} />
        <Select label="Campaign state" data={[{ value: 'PAUSED', label: 'Paused' }, { value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }]} value={form.status} onChange={(status) => setForm((current) => ({ ...current, status: status ?? 'PAUSED' }))} allowDeselect={false} />
        <Group justify="flex-end"><Button variant="default" onClick={() => setEditorOpened(false)}>Cancel</Button><Button loading={saving} disabled={!form.name.trim() || !form.region.trim() || !form.sportIds.length || !form.sourceTypeHints.length} onClick={() => void saveCampaign()}>Save Campaign</Button></Group>
      </Stack>
    </Modal>
  </>;
}
