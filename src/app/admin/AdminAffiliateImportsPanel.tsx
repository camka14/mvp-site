'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { ExternalLink, Play, UploadCloud } from 'lucide-react';

type AdminAffiliateSourceRow = {
  $id: string;
  name: string;
  sourceKey: string;
  listUrl: string;
  targetKind: string;
  status: string;
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
  warnings?: string[];
  rawPayload?: Record<string, unknown> | null;
};

type AdminAffiliateImportsPanelProps = {
  active: boolean;
  refreshKey: number;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const openExternal = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default function AdminAffiliateImportsPanel({ active, refreshKey }: AdminAffiliateImportsPanelProps) {
  const [sources, setSources] = useState<AdminAffiliateSourceRow[]>([]);
  const [candidates, setCandidates] = useState<AdminAffiliateCandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapingSourceId, setScrapingSourceId] = useState<string | null>(null);
  const [publishingCandidateId, setPublishingCandidateId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<AdminAffiliateCandidateRow | null>(null);

  const sourceNameById = useMemo(() => (
    new Map(sources.map((source) => [source.$id, source.name]))
  ), [sources]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourcesRes, candidatesRes] = await Promise.all([
        fetch('/api/admin/affiliate-sources', { credentials: 'include' }),
        fetch('/api/admin/affiliate-discoveries', { credentials: 'include' }),
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
  }, []);

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
      await loadData();
    } catch (scrapeError) {
      setError(scrapeError instanceof Error ? scrapeError.message : 'Failed to scrape affiliate source.');
    } finally {
      setScrapingSourceId(null);
    }
  }, [loadData]);

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

  useEffect(() => {
    if (active) {
      void loadData();
    }
  }, [active, loadData, refreshKey]);

  return (
    <Stack gap="lg">
      {error ? (
        <Alert color="red" title="Affiliate import error">
          {error}
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
                  <Badge color={source.status === 'ACTIVE' ? 'teal' : 'gray'} variant="light">
                    {source.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{source.activeMappingId ? 'Active' : 'Missing'}</Table.Td>
                <Table.Td>{formatDateTime(source.lastScrapedAt)}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Play size={14} />}
                      disabled={!source.activeMappingId}
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
          <Title order={3}>Discovered Events And Rentals</Title>
          <Text size="sm" c="dimmed">{candidates.length} candidates</Text>
        </Group>

        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
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
                  <Text fw={600}>{candidate.title}</Text>
                  <Text size="xs" c="dimmed">{[candidate.venueName, candidate.city].filter(Boolean).join(', ') || '-'}</Text>
                </Table.Td>
                <Table.Td>{sourceNameById.get(candidate.sourceId) ?? candidate.sourceId}</Table.Td>
                <Table.Td>{candidate.listingKind}</Table.Td>
                <Table.Td>{candidate.scheduleText || formatDateTime(candidate.startsAt)}</Table.Td>
                <Table.Td>{candidate.priceText || '-'}</Table.Td>
                <Table.Td>
                  <Badge color={candidate.status === 'PUBLISHED' ? 'teal' : 'blue'} variant="light">
                    {candidate.status}
                  </Badge>
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
                      disabled={candidate.status === 'PUBLISHED'}
                      loading={publishingCandidateId === candidate.$id}
                      onClick={() => {
                        void publishCandidate(candidate.$id);
                      }}
                    >
                      Publish
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!candidates.length && !loading ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="dimmed">No discovered affiliate candidates yet.</Text>
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
              <Badge>{selectedCandidate.listingKind}</Badge>
              <Badge color={selectedCandidate.status === 'PUBLISHED' ? 'teal' : 'blue'}>{selectedCandidate.status}</Badge>
            </Group>
            <Text size="sm"><strong>Official link:</strong> {selectedCandidate.officialActionUrl}</Text>
            <Text size="sm"><strong>Source:</strong> {selectedCandidate.sourceUrl}</Text>
            <ScrollArea h={360} type="auto">
              <pre className="whitespace-pre-wrap rounded border bg-gray-50 p-3 text-xs">
                {JSON.stringify(selectedCandidate, null, 2)}
              </pre>
            </ScrollArea>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
