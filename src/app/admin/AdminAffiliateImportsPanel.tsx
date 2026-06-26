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
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { ExternalLink, Play, Trash2, UploadCloud } from 'lucide-react';

type AdminAffiliateSourceRow = {
  $id: string;
  name: string;
  sourceKey: string;
  listUrl: string;
  targetKind: string;
  status: string;
  organizationId?: string | null;
  activeMappingId?: string | null;
  lastScrapeRunId?: string | null;
  lastScrapedAt?: string | null;
};

type AdminAffiliateCandidateRow = {
  $id: string;
  sourceId: string;
  listingKind: string;
  status: string;
  title: string;
  city?: string | null;
  venueName?: string | null;
  startsAt?: string | null;
  scheduleText?: string | null;
  priceText?: string | null;
  officialActionUrl: string;
  sourceUrl: string;
  publishedEventId?: string | null;
  publishedTeamId?: string | null;
  publishedFacilityId?: string | null;
  warnings?: string[];
  rawPayload?: Record<string, unknown> | null;
};

type AdminAffiliateScrapeRunRow = {
  itemCount?: number | null;
  candidateCount?: number | null;
  logs?: {
    createdCandidateCount?: number;
    updatedCandidateCount?: number;
    rejectedCount?: number;
    rejectionSummary?: Record<string, number>;
  } | null;
};

type LastScrapeResult = {
  sourceName: string;
  itemCount: number;
  candidateCount: number;
  createdCandidateCount: number;
  updatedCandidateCount: number;
  rejectedCount: number;
  rejectionSummary: Record<string, number>;
};

type AdminAffiliateImportsPanelProps = {
  active: boolean;
  refreshKey: number;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return 'Not specified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const formatOptionalText = (value?: string | null): string => {
  if (typeof value !== 'string') return 'Not specified';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : 'Not specified';
};

const stringifyCandidateForReview = (candidate: AdminAffiliateCandidateRow): string => (
  JSON.stringify(candidate, (_key, value) => (value === null ? 'Not specified' : value), 2)
);

const openExternal = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const hasPublishedTarget = (candidate: AdminAffiliateCandidateRow): boolean => {
  const kind = String(candidate.listingKind ?? '').toUpperCase();
  if (kind === 'EVENT') return Boolean(candidate.publishedEventId);
  if (kind === 'TEAM') return Boolean(candidate.publishedTeamId);
  if (kind === 'RENTAL') return Boolean(candidate.publishedFacilityId);
  return false;
};

const publishedTargetLabel = (candidate: AdminAffiliateCandidateRow): string | null => {
  const kind = String(candidate.listingKind ?? '').toUpperCase();
  if (kind === 'EVENT' && candidate.publishedEventId) return 'Event created';
  if (kind === 'TEAM' && candidate.publishedTeamId) return 'Team created';
  if (kind === 'RENTAL' && candidate.publishedFacilityId) return 'Facility created';
  return null;
};

const numberFromUnknown = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const listingKindOptions = [
  { value: 'EVENT', label: 'Event' },
  { value: 'TEAM', label: 'Team' },
  { value: 'RENTAL', label: 'Rental' },
];

const candidateStatusViewOptions = [
  { value: 'DISCOVERED', label: 'Discovered' },
  { value: 'PUBLISHED', label: 'Published' },
];

const normalizeListingKindValue = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'EVENT' || normalized === 'TEAM' || normalized === 'RENTAL'
    ? normalized
    : 'EVENT';
};

const scrapeResultMessage = (result: LastScrapeResult): string => {
  const hasDetailedCandidateCounts = result.createdCandidateCount + result.updatedCandidateCount > 0
    || result.candidateCount === 0;
  const pieces = [
    `${result.itemCount} item${result.itemCount === 1 ? '' : 's'} found`,
  ];
  if (hasDetailedCandidateCounts) {
    pieces.push(`${result.createdCandidateCount} new`);
    pieces.push(`${result.updatedCandidateCount} existing updated`);
  } else {
    pieces.push(`${result.candidateCount} candidate${result.candidateCount === 1 ? '' : 's'} saved`);
  }
  if (result.rejectedCount > 0) {
    const reasons = Object.entries(result.rejectionSummary)
      .map(([reason, count]) => `${reason} (${count})`)
      .join(', ');
    pieces.push(`${result.rejectedCount} rejected${reasons ? `: ${reasons}` : ''}`);
  }
  return pieces.join(' • ');
};

export default function AdminAffiliateImportsPanel({ active, refreshKey }: AdminAffiliateImportsPanelProps) {
  const [sources, setSources] = useState<AdminAffiliateSourceRow[]>([]);
  const [candidates, setCandidates] = useState<AdminAffiliateCandidateRow[]>([]);
  const [candidateStatusView, setCandidateStatusView] = useState<'DISCOVERED' | 'PUBLISHED'>('DISCOVERED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapingSourceId, setScrapingSourceId] = useState<string | null>(null);
  const [publishingCandidateId, setPublishingCandidateId] = useState<string | null>(null);
  const [deletingCandidateId, setDeletingCandidateId] = useState<string | null>(null);
  const [classifyingCandidateId, setClassifyingCandidateId] = useState<string | null>(null);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<AdminAffiliateCandidateRow | null>(null);
  const [lastScrapeResult, setLastScrapeResult] = useState<LastScrapeResult | null>(null);

  const sourceNameById = useMemo(() => (
    new Map(sources.map((source) => [source.$id, source.name]))
  ), [sources]);

  const selectedCandidateIdSet = useMemo(() => (
    new Set(selectedCandidateIds)
  ), [selectedCandidateIds]);

  const selectedCandidates = useMemo(() => (
    candidates.filter((candidate) => selectedCandidateIdSet.has(candidate.$id))
  ), [candidates, selectedCandidateIdSet]);

  const publishableSelectedCandidates = useMemo(() => (
    selectedCandidates.filter((candidate) => !(candidate.status === 'PUBLISHED' && hasPublishedTarget(candidate)))
  ), [selectedCandidates]);

  const allCandidatesSelected = candidates.length > 0 && selectedCandidateIds.length === candidates.length;
  const someCandidatesSelected = selectedCandidateIds.length > 0 && selectedCandidateIds.length < candidates.length;
  const candidateActionInProgress = bulkPublishing || bulkDeleting || Boolean(classifyingCandidateId);

  const sourceNeedsOrganization = (source: AdminAffiliateSourceRow): boolean => (
    String(source.targetKind ?? '').toUpperCase() !== 'RENTAL'
    && !source.organizationId
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourcesRes, candidatesRes] = await Promise.all([
        fetch('/api/admin/affiliate-sources', { credentials: 'include' }),
        fetch(`/api/admin/affiliate-discoveries?status=${encodeURIComponent(candidateStatusView)}`, { credentials: 'include' }),
      ]);
      const [sourcesPayload, candidatesPayload] = await Promise.all([
        sourcesRes.json().catch(() => ({})),
        candidatesRes.json().catch(() => ({})),
      ]);
      if (!sourcesRes.ok) {
        throw new Error(sourcesPayload?.error || 'Failed to load affiliate sources.');
      }
      if (!candidatesRes.ok) {
        throw new Error(candidatesPayload?.error || 'Failed to load affiliate discoveries.');
      }
      setSources(Array.isArray(sourcesPayload.sources) ? sourcesPayload.sources : []);
      setCandidates(Array.isArray(candidatesPayload.candidates) ? candidatesPayload.candidates : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load affiliate imports.');
    } finally {
      setLoading(false);
    }
  }, [candidateStatusView]);

  const scrapeSource = useCallback(async (sourceId: string) => {
    setScrapingSourceId(sourceId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/affiliate-sources/${encodeURIComponent(sourceId)}/scrape`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to scrape affiliate source.');
      }
      const run = payload?.run as AdminAffiliateScrapeRunRow | undefined;
      const logs = run?.logs && typeof run.logs === 'object' ? run.logs : null;
      setLastScrapeResult({
        sourceName: sourceNameById.get(sourceId) ?? sourceId,
        itemCount: numberFromUnknown(run?.itemCount),
        candidateCount: numberFromUnknown(run?.candidateCount),
        createdCandidateCount: numberFromUnknown(logs?.createdCandidateCount),
        updatedCandidateCount: numberFromUnknown(logs?.updatedCandidateCount),
        rejectedCount: numberFromUnknown(logs?.rejectedCount),
        rejectionSummary: logs?.rejectionSummary && typeof logs.rejectionSummary === 'object'
          ? logs.rejectionSummary
          : {},
      });
      await loadData();
    } catch (scrapeError) {
      setError(scrapeError instanceof Error ? scrapeError.message : 'Failed to scrape affiliate source.');
    } finally {
      setScrapingSourceId(null);
    }
  }, [loadData, sourceNameById]);

  const publishCandidate = useCallback(async (candidateId: string) => {
    setPublishingCandidateId(candidateId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/affiliate-discoveries/${encodeURIComponent(candidateId)}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to publish affiliate discovery.');
      }
      await loadData();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish affiliate discovery.');
    } finally {
      setPublishingCandidateId(null);
    }
  }, [loadData]);

  const reclassifyCandidate = useCallback(async (candidate: AdminAffiliateCandidateRow, listingKind: string | null) => {
    const nextKind = normalizeListingKindValue(listingKind);
    if (nextKind === normalizeListingKindValue(candidate.listingKind)) {
      return;
    }

    setClassifyingCandidateId(candidate.$id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/affiliate-discoveries/${encodeURIComponent(candidate.$id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingKind: nextKind }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to reclassify affiliate discovery.');
      }
      const updatedCandidate = payload?.candidate as AdminAffiliateCandidateRow | undefined;
      if (updatedCandidate?.$id) {
        setCandidates((current) => current.map((entry) => (
          entry.$id === updatedCandidate.$id ? updatedCandidate : entry
        )));
        setSelectedCandidate((current) => (
          current?.$id === updatedCandidate.$id ? updatedCandidate : current
        ));
      }
      await loadData();
    } catch (classifyError) {
      setError(classifyError instanceof Error ? classifyError.message : 'Failed to reclassify affiliate discovery.');
    } finally {
      setClassifyingCandidateId(null);
    }
  }, [loadData]);

  const publishSelectedCandidates = useCallback(async () => {
    if (!publishableSelectedCandidates.length) {
      return;
    }

    setBulkPublishing(true);
    setError(null);
    try {
      for (const candidate of publishableSelectedCandidates) {
        const res = await fetch(`/api/admin/affiliate-discoveries/${encodeURIComponent(candidate.$id)}/publish`, {
          method: 'POST',
          credentials: 'include',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || `Failed to publish "${candidate.title}".`);
        }
      }
      setSelectedCandidateIds([]);
      await loadData();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish selected affiliate discoveries.');
    } finally {
      setBulkPublishing(false);
    }
  }, [loadData, publishableSelectedCandidates]);

  const deleteCandidate = useCallback(async (candidate: AdminAffiliateCandidateRow) => {
    const confirmed = window.confirm(`Delete "${candidate.title}" from discovered affiliate candidates?`);
    if (!confirmed) {
      return;
    }

    setDeletingCandidateId(candidate.$id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/affiliate-discoveries/${encodeURIComponent(candidate.$id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to delete affiliate discovery.');
      }
      setSelectedCandidate((current) => (current?.$id === candidate.$id ? null : current));
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete affiliate discovery.');
    } finally {
      setDeletingCandidateId(null);
    }
  }, [loadData]);

  const deleteSelectedCandidates = useCallback(async () => {
    if (!selectedCandidates.length) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedCandidates.length} selected affiliate candidate${selectedCandidates.length === 1 ? '' : 's'}?`);
    if (!confirmed) {
      return;
    }

    setBulkDeleting(true);
    setError(null);
    try {
      for (const candidate of selectedCandidates) {
        const res = await fetch(`/api/admin/affiliate-discoveries/${encodeURIComponent(candidate.$id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || `Failed to delete "${candidate.title}".`);
        }
      }
      setSelectedCandidate((current) => (
        current && selectedCandidateIdSet.has(current.$id) ? null : current
      ));
      setSelectedCandidateIds([]);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete selected affiliate discoveries.');
    } finally {
      setBulkDeleting(false);
    }
  }, [loadData, selectedCandidateIdSet, selectedCandidates]);

  const toggleCandidateSelection = useCallback((candidateId: string, checked: boolean) => {
    setSelectedCandidateIds((current) => {
      if (checked) {
        return current.includes(candidateId) ? current : [...current, candidateId];
      }
      return current.filter((id) => id !== candidateId);
    });
  }, []);

  const toggleAllCandidateSelection = useCallback((checked: boolean) => {
    setSelectedCandidateIds(checked ? candidates.map((candidate) => candidate.$id) : []);
  }, [candidates]);

  useEffect(() => {
    if (active) {
      void loadData();
    }
  }, [active, loadData, refreshKey]);

  useEffect(() => {
    const candidateIds = new Set(candidates.map((candidate) => candidate.$id));
    setSelectedCandidateIds((current) => current.filter((candidateId) => candidateIds.has(candidateId)));
  }, [candidates]);

  return (
    <Stack gap="lg">
      {error ? (
        <Alert color="red" title="Affiliate import error">
          {error}
        </Alert>
      ) : null}

      {lastScrapeResult ? (
        <Alert
          color={lastScrapeResult.candidateCount > 0 ? 'teal' : 'yellow'}
          title={`Last scrape: ${lastScrapeResult.sourceName}`}
        >
          {scrapeResultMessage(lastScrapeResult)}
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="sm">
          <div>
            <Title order={3}>Sources</Title>
            <Text size="sm" c="dimmed">Saved mappings are configured in the database after manual ScrapingDog inspection.</Text>
          </div>
          {loading ? <Loader size="sm" /> : null}
        </Group>

        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th>Kind</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Mapping</Table.Th>
              <Table.Th>Last scraped</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sources.map((source) => (
              <Table.Tr key={source.$id}>
                <Table.Td>
                  <Text fw={600}>{source.name}</Text>
                  <Text size="xs" c="dimmed">{source.sourceKey}</Text>
                </Table.Td>
                <Table.Td>{source.targetKind}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Badge color={source.status === 'ACTIVE' ? 'teal' : 'gray'} variant="light">
                      {source.status}
                    </Badge>
                    {sourceNeedsOrganization(source) ? (
                      <Badge color="orange" variant="light">Org missing</Badge>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td>{source.activeMappingId ? 'Active' : 'Missing'}</Table.Td>
                <Table.Td>{formatDateTime(source.lastScrapedAt)}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Play size={14} />}
                      disabled={!source.activeMappingId || sourceNeedsOrganization(source)}
                      loading={scrapingSourceId === source.$id}
                      onClick={() => {
                        void scrapeSource(source.$id);
                      }}
                    >
                      Scrape
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<ExternalLink size={14} />}
                      onClick={() => openExternal(source.listUrl)}
                    >
                      Source
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!sources.length && !loading ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="dimmed">No affiliate sources configured.</Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="sm">
          <Title order={3}>Discovered Events, Teams And Rentals</Title>
          <Group gap="xs">
            <SegmentedControl
              size="xs"
              data={candidateStatusViewOptions}
              value={candidateStatusView}
              onChange={(value) => {
                const nextView = value === 'PUBLISHED' ? 'PUBLISHED' : 'DISCOVERED';
                setCandidateStatusView(nextView);
                setSelectedCandidateIds([]);
                setSelectedCandidate(null);
              }}
            />
            <Text size="sm" c="dimmed">
              {selectedCandidateIds.length ? `${selectedCandidateIds.length} selected • ` : ''}
              {candidates.length} candidates
            </Text>
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<Trash2 size={14} />}
              disabled={!selectedCandidates.length || candidateActionInProgress}
              loading={bulkDeleting}
              onClick={() => {
                void deleteSelectedCandidates();
              }}
            >
              Delete Selected
            </Button>
            <Button
              size="xs"
              color="teal"
              leftSection={<UploadCloud size={14} />}
              disabled={!publishableSelectedCandidates.length || candidateActionInProgress}
              loading={bulkPublishing}
              onClick={() => {
                void publishSelectedCandidates();
              }}
            >
              Publish Selected
            </Button>
          </Group>
        </Group>

        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={48}>
                <Checkbox
                  aria-label="Select all candidates"
                  checked={allCandidatesSelected}
                  indeterminate={someCandidatesSelected}
                  disabled={!candidates.length || candidateActionInProgress}
                  onChange={(event) => toggleAllCandidateSelection(event.currentTarget.checked)}
                />
              </Table.Th>
              <Table.Th>Candidate</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Kind</Table.Th>
              <Table.Th>Schedule</Table.Th>
              <Table.Th>Price</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {candidates.map((candidate) => (
              <Table.Tr key={candidate.$id}>
                <Table.Td>
                  <Checkbox
                    aria-label={`Select ${candidate.title}`}
                    checked={selectedCandidateIdSet.has(candidate.$id)}
                    disabled={candidateActionInProgress}
                    onChange={(event) => toggleCandidateSelection(candidate.$id, event.currentTarget.checked)}
                  />
                </Table.Td>
                <Table.Td>
                  <Text fw={600}>{candidate.title}</Text>
                  <Text size="xs" c="dimmed">{[candidate.venueName, candidate.city].filter(Boolean).join(', ') || 'Not specified'}</Text>
                </Table.Td>
                <Table.Td>{sourceNameById.get(candidate.sourceId) ?? candidate.sourceId}</Table.Td>
                <Table.Td>
                  <Select
                    aria-label={`Classify ${candidate.title}`}
                    data={listingKindOptions}
                    value={normalizeListingKindValue(candidate.listingKind)}
                    size="xs"
                    w={110}
                    allowDeselect={false}
                    disabled={candidateActionInProgress || publishingCandidateId === candidate.$id || deletingCandidateId === candidate.$id}
                    comboboxProps={{ withinPortal: true }}
                    onChange={(value) => {
                      void reclassifyCandidate(candidate, value);
                    }}
                  />
                </Table.Td>
                <Table.Td>{candidate.scheduleText || formatDateTime(candidate.startsAt)}</Table.Td>
                <Table.Td>{formatOptionalText(candidate.priceText)}</Table.Td>
                <Table.Td>
                  <Badge color={candidate.status === 'PUBLISHED' ? 'teal' : 'blue'} variant="light">
                    {candidate.status}
                  </Badge>
                  {publishedTargetLabel(candidate) ? (
                    <Text size="xs" c="dimmed">{publishedTargetLabel(candidate)}</Text>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="default" onClick={() => setSelectedCandidate(candidate)}>
                      View
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<ExternalLink size={14} />}
                      onClick={() => openExternal(candidate.officialActionUrl)}
                    >
                      Link
                    </Button>
                    <Button
                      size="xs"
                      color="teal"
                      leftSection={<UploadCloud size={14} />}
                      disabled={(candidate.status === 'PUBLISHED' && hasPublishedTarget(candidate)) || deletingCandidateId === candidate.$id || candidateActionInProgress}
                      loading={publishingCandidateId === candidate.$id}
                      onClick={() => {
                        void publishCandidate(candidate.$id);
                      }}
                    >
                      Publish
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      leftSection={<Trash2 size={14} />}
                      disabled={publishingCandidateId === candidate.$id || candidateActionInProgress}
                      loading={deletingCandidateId === candidate.$id}
                      onClick={() => {
                        void deleteCandidate(candidate);
                      }}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!candidates.length && !loading ? (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text size="sm" c="dimmed">
                    {candidateStatusView === 'PUBLISHED'
                      ? 'No published affiliate candidates yet.'
                      : 'No discovered affiliate candidates yet.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal
        opened={Boolean(selectedCandidate)}
        onClose={() => setSelectedCandidate(null)}
        title={selectedCandidate?.title ?? 'Affiliate discovery'}
        size="xl"
      >
        {selectedCandidate ? (
          <Stack gap="sm">
            <Group gap="xs">
              <Select
                aria-label="Classify selected candidate"
                data={listingKindOptions}
                value={normalizeListingKindValue(selectedCandidate.listingKind)}
                size="xs"
                w={130}
                allowDeselect={false}
                disabled={candidateActionInProgress || publishingCandidateId === selectedCandidate.$id || deletingCandidateId === selectedCandidate.$id}
                comboboxProps={{ withinPortal: true }}
                onChange={(value) => {
                  void reclassifyCandidate(selectedCandidate, value);
                }}
              />
              <Badge color={selectedCandidate.status === 'PUBLISHED' ? 'teal' : 'blue'}>{selectedCandidate.status}</Badge>
            </Group>
            <Text size="sm"><strong>Official link:</strong> {selectedCandidate.officialActionUrl}</Text>
            <Text size="sm"><strong>Source:</strong> {selectedCandidate.sourceUrl}</Text>
            <ScrollArea h={360} type="auto">
              <pre className="whitespace-pre-wrap rounded border bg-gray-50 p-3 text-xs">
                {stringifyCandidateForReview(selectedCandidate)}
              </pre>
            </ScrollArea>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setSelectedCandidate(null)}>
                Close
              </Button>
              <Button
                color="red"
                leftSection={<Trash2 size={14} />}
                disabled={publishingCandidateId === selectedCandidate.$id}
                loading={deletingCandidateId === selectedCandidate.$id}
                onClick={() => {
                  void deleteCandidate(selectedCandidate);
                }}
              >
                Delete Candidate
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
