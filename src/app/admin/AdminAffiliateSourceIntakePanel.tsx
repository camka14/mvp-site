'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Image,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { ExternalLink, Eye, FileUp, Plus, Search, ShieldCheck } from 'lucide-react';
import AdminAffiliateSourceDiscoveryPanel from './AdminAffiliateSourceDiscoveryPanel';

type IntakeRun = {
  id: string;
  status: string;
  createdAt: string;
  capturedPageCount?: number | null;
  discoveredUrlCount?: number | null;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

type IntakeRow = {
  id: string;
  name: string;
  sourceKey: string;
  region?: string | null;
  status: string;
  complianceStatus: string;
  targetKindHints?: string[];
  suggestedClassification?: { type?: string; confidence?: number; reasons?: string[] } | null;
  pageCount: number;
  artifactCount: number;
  latestRun?: IntakeRun | null;
};

type IntakePage = {
  id: string;
  url: string;
  role: string;
  status: string;
  discoverySource: string;
  robotsStatus: string;
  robotsNotes?: string | null;
};

type IntakeArtifact = {
  id: string;
  kind: string;
  mimeType?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

type IntakeContext = {
  intake: IntakeRow & {
    complianceTermsUrl?: string | null;
    complianceNotes?: string | null;
    selectedLogoArtifactId?: string | null;
  };
  pages: IntakePage[];
  runs: IntakeRun[];
  selectedRunId?: string | null;
  artifacts: IntakeArtifact[];
  policyKey?: string | null;
  domainPolicy?: {
    status: string;
    reviewedAt?: string | null;
    expiresAt?: string | null;
    robotsSummary?: string | null;
    restrictionNotes?: string | null;
    evidence?: {
      likelyTermsUrls?: string[];
      robotsUrl?: string;
      robotsError?: string;
      reviewHistory?: Array<{
        reviewedAt?: string;
        status?: string;
        previousStatus?: string | null;
        restrictionNotes?: string | null;
      }>;
    } | null;
  } | null;
  relatedDiscoveryResults?: Array<{ id: string; title?: string | null; canonicalUrl: string; score: number; status: string }>;
};

type Props = { active: boolean; refreshKey: number };
type Message = { color: 'red' | 'teal' | 'yellow' | 'blue'; title: string; body: string };

const targetKindOptions = ['EVENT', 'RENTAL', 'CLUB', 'TEAM'];
const pageRoleOptions = ['HOME', 'LISTING', 'DETAIL', 'REGISTRATION', 'RENTAL', 'DIRECTORY', 'POLICY', 'LOGO'];
const terminalRunStatuses = new Set(['SUCCEEDED', 'PARTIAL', 'BLOCKED', 'FAILED']);

const artifactUrl = (intakeId: string, artifactId: string): string => (
  `/api/admin/affiliate-intakes/${encodeURIComponent(intakeId)}/artifacts/${encodeURIComponent(artifactId)}`
);

const readPayload = async (response: Response): Promise<any> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload;
};

const statusColor = (value: string): string => {
  if (['READY', 'ALLOWED', 'SUCCEEDED', 'APPROVED'].includes(value)) return 'teal';
  if (['BLOCKED', 'FAILED'].includes(value)) return 'red';
  if (['QUEUED', 'RUNNING'].includes(value)) return 'blue';
  return 'yellow';
};

export default function AdminAffiliateSourceIntakePanel({ active, refreshKey }: Props) {
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [createOpened, setCreateOpened] = useState(false);
  const [bulkOpened, setBulkOpened] = useState(false);
  const [reviewOpened, setReviewOpened] = useState(false);
  const [policyOpened, setPolicyOpened] = useState(false);
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [context, setContext] = useState<IntakeContext | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [markdownPreview, setMarkdownPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [urls, setUrls] = useState('');
  const [targetKinds, setTargetKinds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [policyStatus, setPolicyStatus] = useState('ALLOWED');
  const [policyTermsUrl, setPolicyTermsUrl] = useState('');
  const [policyNotes, setPolicyNotes] = useState('');

  const hasActiveRuns = useMemo(() => intakes.some((intake) => (
    intake.latestRun && !terminalRunStatuses.has(intake.latestRun.status)
  )), [intakes]);

  const loadIntakes = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    try {
      const payload = await readPayload(await fetch('/api/admin/affiliate-intakes', { credentials: 'include' }));
      setIntakes(Array.isArray(payload.intakes) ? payload.intakes : []);
    } catch (error) {
      setMessage({ color: 'red', title: 'Source intake error', body: error instanceof Error ? error.message : 'Failed to load source intakes.' });
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  const loadContext = useCallback(async (intakeId: string, runId?: string | null) => {
    const query = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    const payload = await readPayload(await fetch(
      `/api/admin/affiliate-intakes/${encodeURIComponent(intakeId)}${query}`,
      { credentials: 'include' },
    ));
    setContext(payload);
    setSelectedIntakeId(intakeId);
    setSelectedPageIds((current) => {
      const valid = new Set((payload.pages ?? []).map((page: IntakePage) => page.id));
      const retained = current.filter((id) => valid.has(id));
      return retained.length ? retained : (payload.pages ?? []).slice(0, 10).map((page: IntakePage) => page.id);
    });
    const markdown = (payload.artifacts ?? []).find((artifact: IntakeArtifact) => artifact.kind === 'PAGE_MARKDOWN');
    if (markdown) {
      const response = await fetch(artifactUrl(intakeId, markdown.id), { credentials: 'include' });
      setMarkdownPreview(response.ok ? await response.text() : '');
    } else {
      setMarkdownPreview('');
    }
    return payload as IntakeContext;
  }, []);

  useEffect(() => {
    if (active) void loadIntakes();
  }, [active, loadIntakes, refreshKey]);

  useEffect(() => {
    if (!active || !hasActiveRuns) return undefined;
    const timer = window.setInterval(() => {
      void loadIntakes(false);
      if (selectedIntakeId && reviewOpened) void loadContext(selectedIntakeId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [active, hasActiveRuns, loadContext, loadIntakes, reviewOpened, selectedIntakeId]);

  const createIntake = async () => {
    const pages = urls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).map((url, index) => ({
      url,
      role: index === 0 ? 'HOME' : 'LISTING',
      targetKindHints: targetKinds,
    }));
    setSaving(true);
    try {
      await readPayload(await fetch('/api/admin/affiliate-intakes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, region, notes, targetKindHints: targetKinds, pages }),
      }));
      setCreateOpened(false);
      setName(''); setRegion(''); setUrls(''); setTargetKinds([]); setNotes('');
      setMessage({ color: 'teal', title: 'Source added', body: 'The site is ready for policy review.' });
      await loadIntakes(false);
    } catch (error) {
      setMessage({ color: 'red', title: 'Source not added', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const importIntakes = async () => {
    setSaving(true);
    try {
      const payload = await readPayload(await fetch('/api/admin/affiliate-intakes/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bulkText }),
      }));
      setBulkOpened(false);
      setBulkText('');
      setMessage({
        color: payload.rejected?.length || payload.parseRejected?.length ? 'yellow' : 'teal',
        title: 'Bulk intake complete',
        body: `${payload.created ?? 0} created, ${payload.updated ?? 0} updated, ${(payload.rejected?.length ?? 0) + (payload.parseRejected?.length ?? 0)} rejected.`,
      });
      await loadIntakes(false);
    } catch (error) {
      setMessage({ color: 'red', title: 'Bulk intake failed', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const openPolicy = async (intake: IntakeRow) => {
    setSaving(true);
    try {
      const payload = await loadContext(intake.id);
      setPolicyStatus(payload.intake.complianceStatus === 'BLOCKED' ? 'BLOCKED' : 'ALLOWED');
      setPolicyTermsUrl(payload.intake.complianceTermsUrl ?? '');
      setPolicyNotes(payload.intake.complianceNotes ?? '');
      setPolicyOpened(true);
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    if (!selectedIntakeId) return;
    setSaving(true);
    try {
      await readPayload(await fetch(`/api/admin/affiliate-intakes/${encodeURIComponent(selectedIntakeId)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: { complianceStatus: policyStatus, termsUrl: policyTermsUrl, notes: policyNotes } }),
      }));
      setPolicyOpened(false);
      setMessage({ color: policyStatus === 'ALLOWED' ? 'teal' : 'yellow', title: 'Policy review saved', body: `Source marked ${policyStatus.toLowerCase()}.` });
      await loadIntakes(false);
    } catch (error) {
      setMessage({ color: 'red', title: 'Policy review failed', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const openReview = async (intakeId: string) => {
    setSaving(true);
    try {
      await loadContext(intakeId);
      setReviewOpened(true);
    } catch (error) {
      setMessage({ color: 'red', title: 'Review unavailable', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const queueInspection = async () => {
    if (!selectedIntakeId) return;
    setSaving(true);
    try {
      await readPayload(await fetch(`/api/admin/affiliate-intakes/${encodeURIComponent(selectedIntakeId)}/inspect`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds: selectedPageIds }),
      }));
      setMessage({ color: 'blue', title: 'Inspection queued', body: 'The worker will process the selected pages in queue order.' });
      await Promise.all([loadIntakes(false), loadContext(selectedIntakeId)]);
    } catch (error) {
      setMessage({ color: 'red', title: 'Inspection not queued', body: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      setSaving(false);
    }
  };

  const changePageRole = async (page: IntakePage, role: string | null) => {
    if (!selectedIntakeId || !role) return;
    await readPayload(await fetch(`/api/admin/affiliate-intakes/${encodeURIComponent(selectedIntakeId)}/pages`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: page.url, role }),
    }));
    await loadContext(selectedIntakeId);
  };

  const selectLogo = async (artifactId: string) => {
    if (!selectedIntakeId) return;
    await readPayload(await fetch(`/api/admin/affiliate-intakes/${encodeURIComponent(selectedIntakeId)}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedLogoArtifactId: artifactId }),
    }));
    await loadContext(selectedIntakeId);
  };

  const logoArtifacts = context?.artifacts.filter((artifact) => artifact.kind === 'LOGO_CANDIDATE') ?? [];
  const screenshotArtifacts = context?.artifacts.filter((artifact) => artifact.kind === 'PAGE_SCREENSHOT') ?? [];

  return (
    <>
      <AdminAffiliateSourceDiscoveryPanel
        active={active}
        refreshKey={refreshKey}
        onIntakesChanged={() => {
          void loadIntakes(false);
        }}
      />
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="sm" align="flex-start">
          <div>
            <Title order={3}>Source Intake</Title>
            <Text size="sm" c="dimmed">Capture source evidence first. Mapping and publication remain separate reviewed steps.</Text>
          </div>
          <Group gap="xs">
            {loading ? <Loader size="sm" /> : null}
            <Button size="xs" variant="default" leftSection={<FileUp size={14} />} onClick={() => setBulkOpened(true)}>Import</Button>
            <Button size="xs" leftSection={<Plus size={14} />} onClick={() => setCreateOpened(true)}>Add Source</Button>
          </Group>
        </Group>
        {message ? <Alert mb="sm" color={message.color} title={message.title} withCloseButton onClose={() => setMessage(null)}>{message.body}</Alert> : null}
        <ScrollArea type="auto">
          <Table striped highlightOnHover withTableBorder miw={1050}>
            <Table.Thead><Table.Tr>
              <Table.Th>Source</Table.Th><Table.Th>Region</Table.Th><Table.Th>Pages</Table.Th>
              <Table.Th>Policy</Table.Th><Table.Th>Suggested type</Table.Th><Table.Th>Latest run</Table.Th><Table.Th>Actions</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {intakes.map((intake) => (
                <Table.Tr key={intake.id}>
                  <Table.Td><Text fw={600}>{intake.name}</Text><Text size="xs" c="dimmed">{intake.sourceKey}</Text></Table.Td>
                  <Table.Td>{intake.region || 'Not specified'}</Table.Td>
                  <Table.Td>{intake.pageCount}</Table.Td>
                  <Table.Td><Badge color={statusColor(intake.complianceStatus)} variant="light">{intake.complianceStatus}</Badge></Table.Td>
                  <Table.Td>{intake.suggestedClassification?.type || 'Not inspected'}</Table.Td>
                  <Table.Td>
                    {intake.latestRun ? <Stack gap={2}><Badge color={statusColor(intake.latestRun.status)}>{intake.latestRun.status}</Badge><Text size="xs" c="dimmed">{new Date(intake.latestRun.createdAt).toLocaleString()}</Text></Stack> : 'Never'}
                  </Table.Td>
                  <Table.Td><Group gap="xs" wrap="nowrap">
                    <Button size="xs" variant="default" leftSection={<ShieldCheck size={14} />} loading={saving && selectedIntakeId === intake.id} onClick={() => void openPolicy(intake)}>Policy</Button>
                    <Button size="xs" variant="light" leftSection={<Eye size={14} />} onClick={() => void openReview(intake.id)}>Review</Button>
                  </Group></Table.Td>
                </Table.Tr>
              ))}
              {!intakes.length && !loading ? <Table.Tr><Table.Td colSpan={7}><Text size="sm" c="dimmed">No source intake records yet.</Text></Table.Td></Table.Tr> : null}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal opened={createOpened} onClose={() => setCreateOpened(false)} title="Add affiliate source" size="lg">
        <Stack>
          <TextInput label="Source or organization name" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
          <TextInput label="Region" placeholder="San Francisco Bay Area" value={region} onChange={(event) => setRegion(event.currentTarget.value)} />
          <MultiSelect label="Expected listing kinds" data={targetKindOptions} value={targetKinds} onChange={setTargetKinds} searchable />
          <Textarea label="Public URLs" description="One related URL per line. The first is treated as the home page." minRows={5} value={urls} onChange={(event) => setUrls(event.currentTarget.value)} required />
          <Textarea label="Notes" minRows={3} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
          <Group justify="flex-end"><Button variant="default" onClick={() => setCreateOpened(false)}>Cancel</Button><Button loading={saving} disabled={!name.trim() || !urls.trim()} onClick={() => void createIntake()}>Add Source</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={bulkOpened} onClose={() => setBulkOpened(false)} title="Bulk source intake" size="lg">
        <Stack>
          <Text size="sm" c="dimmed">Use Name and URL columns. Optional columns: Source Key, Region, Kinds, Role, Notes. Repeated names/source keys become related pages.</Text>
          <FileInput label="CSV or TSV file" accept=".csv,.tsv,.txt" clearable onChange={(file) => { if (file) void file.text().then(setBulkText); }} />
          <Textarea label="CSV or TSV" minRows={12} value={bulkText} onChange={(event) => setBulkText(event.currentTarget.value)} />
          <Group justify="flex-end"><Button variant="default" onClick={() => setBulkOpened(false)}>Cancel</Button><Button loading={saving} disabled={!bulkText.trim()} onClick={() => void importIntakes()}>Import Sources</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={policyOpened} onClose={() => setPolicyOpened(false)} title="Source policy review" size="lg">
        <Stack>
          {context?.policyKey ? <Paper withBorder p="sm">
            <Text size="xs" c="dimmed">Reusable policy scope</Text>
            <Text fw={600}>{context.policyKey}</Text>
            {context.domainPolicy?.robotsSummary ? <Text size="sm" mt={4}>{context.domainPolicy.robotsSummary}</Text> : null}
            {context.domainPolicy?.expiresAt ? <Text size="xs" c="dimmed">Expires {new Date(context.domainPolicy.expiresAt).toLocaleDateString()}</Text> : null}
            {context.relatedDiscoveryResults?.length ? <Text size="xs" c="dimmed" mt={4}>{context.relatedDiscoveryResults.length} discovery result(s) inherit this exact policy decision.</Text> : null}
            {context.domainPolicy?.evidence?.reviewHistory?.length ? <Stack gap={3} mt="sm">
              <Text size="xs" fw={600}>Prior decisions</Text>
              {context.domainPolicy.evidence.reviewHistory.slice(-5).reverse().map((entry, index) => <Text key={`${entry.reviewedAt ?? 'review'}-${index}`} size="xs" c="dimmed">
                {entry.reviewedAt ? new Date(entry.reviewedAt).toLocaleString() : 'Unknown date'}: {entry.previousStatus ? `${entry.previousStatus} to ` : ''}{entry.status ?? 'Unknown'}{entry.restrictionNotes ? ` - ${entry.restrictionNotes}` : ''}
              </Text>)}
            </Stack> : null}
          </Paper> : null}
          <Select label="Decision" data={[{ value: 'ALLOWED', label: 'Allowed to inspect' }, { value: 'BLOCKED', label: 'Do not inspect' }, { value: 'NEEDS_REVIEW', label: 'Needs more review' }]} value={policyStatus} onChange={(value) => setPolicyStatus(value ?? 'NEEDS_REVIEW')} allowDeselect={false} />
          <TextInput label="Terms or policy URL" value={policyTermsUrl} onChange={(event) => setPolicyTermsUrl(event.currentTarget.value)} />
          <Textarea label="Review notes" description="Record robots, terms, visible anti-bot text, permission, and scope constraints." minRows={6} value={policyNotes} onChange={(event) => setPolicyNotes(event.currentTarget.value)} />
          <Group justify="flex-end"><Button variant="default" onClick={() => setPolicyOpened(false)}>Cancel</Button><Button loading={saving} onClick={() => void savePolicy()}>Save Review and Queue Allowed Intake</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={reviewOpened} onClose={() => setReviewOpened(false)} title={context?.intake.name ?? 'Source evidence'} size="90%">
        {context ? <Stack>
          <Group justify="space-between">
            <Group gap="xs"><Badge color={statusColor(context.intake.complianceStatus)}>{context.intake.complianceStatus}</Badge><Badge variant="light">{context.intake.status}</Badge></Group>
            <Button leftSection={<Search size={15} />} loading={saving} disabled={context.intake.complianceStatus !== 'ALLOWED' || !selectedPageIds.length} onClick={() => void queueInspection()}>Inspect Selected</Button>
          </Group>
          <ScrollArea type="auto"><Table withTableBorder striped miw={900}>
            <Table.Thead><Table.Tr><Table.Th w={48}>Use</Table.Th><Table.Th>URL</Table.Th><Table.Th>Role</Table.Th><Table.Th>Robots</Table.Th><Table.Th>Found by</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{context.pages.map((page) => <Table.Tr key={page.id}>
              <Table.Td><Checkbox name={`affiliate-intake-page-${page.id}`} aria-label={`Use ${page.url}`} checked={selectedPageIds.includes(page.id)} disabled={!selectedPageIds.includes(page.id) && selectedPageIds.length >= 10} onChange={(event) => setSelectedPageIds((current) => event.currentTarget.checked ? [...current, page.id] : current.filter((id) => id !== page.id))} /></Table.Td>
              <Table.Td><Text component="a" href={page.url} target="_blank" rel="noreferrer" size="sm" c="blue" lineClamp={2}>{page.url}</Text></Table.Td>
              <Table.Td><Select name={`affiliate-intake-role-${page.id}`} aria-label={`Role for ${page.url}`} size="xs" data={pageRoleOptions} value={page.role} allowDeselect={false} onChange={(role) => void changePageRole(page, role)} /></Table.Td>
              <Table.Td><Badge color={statusColor(page.robotsStatus)} variant="light">{page.robotsStatus}</Badge>{page.robotsNotes ? <Text size="xs" c="dimmed" lineClamp={2}>{page.robotsNotes}</Text> : null}</Table.Td>
              <Table.Td>{page.discoverySource}</Table.Td>
            </Table.Tr>)}</Table.Tbody>
          </Table></ScrollArea>
          <Group align="flex-start" grow>
            <Paper withBorder p="sm"><Title order={4} mb="xs">Screenshots</Title><Group>{screenshotArtifacts.map((artifact) => <Image key={artifact.id} src={artifactUrl(context.intake.id, artifact.id)} alt="Captured source page" w={180} h={120} fit="cover" radius="sm" />)}{!screenshotArtifacts.length ? <Text size="sm" c="dimmed">No screenshots captured.</Text> : null}</Group></Paper>
            <Paper withBorder p="sm"><Title order={4} mb="xs">Logo candidates</Title><Group>{logoArtifacts.map((artifact) => <Stack key={artifact.id} gap={4}><Image src={artifactUrl(context.intake.id, artifact.id)} alt="Logo candidate" w={100} h={100} fit="contain" radius="sm" /><Button size="compact-xs" variant={context.intake.selectedLogoArtifactId === artifact.id ? 'filled' : 'light'} onClick={() => void selectLogo(artifact.id)}>{context.intake.selectedLogoArtifactId === artifact.id ? 'Selected' : 'Select'}</Button></Stack>)}{!logoArtifacts.length ? <Text size="sm" c="dimmed">No logo candidates captured.</Text> : null}</Group></Paper>
          </Group>
          <Paper withBorder p="sm"><Title order={4} mb="xs">Markdown preview</Title><ScrollArea h={240}><pre className="whitespace-pre-wrap text-xs">{markdownPreview || 'No markdown captured.'}</pre></ScrollArea></Paper>
          <Paper withBorder p="sm"><Group justify="space-between" mb="xs"><Title order={4}>Stored artifacts</Title><Text size="sm" c="dimmed">{context.artifacts.length} files</Text></Group><Group gap="xs">{context.artifacts.map((artifact) => <Button key={artifact.id} component="a" href={artifactUrl(context.intake.id, artifact.id)} target="_blank" rel="noreferrer" size="compact-xs" variant="default" rightSection={<ExternalLink size={12} />}>{artifact.kind}</Button>)}</Group></Paper>
        </Stack> : <Loader />}
      </Modal>
    </>
  );
}
