'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { ExternalLink, Eye, RefreshCw } from 'lucide-react';

type HumanReviewRow = {
  jobId: string;
  intakeId: string;
  intakeName: string;
  sourceKey: string;
  region?: string | null;
  baseUrl?: string | null;
  intakeStatus: string;
  complianceStatus: string;
  attemptCount: number;
  markedAt: string;
  errorMessage?: string | null;
  source?: string | null;
  requestedNextAction?: string | null;
  reasonCodes: string[];
  sourceSportLabels: string[];
  rationale?: string | null;
  blockingIssues: string[];
  hasSelectedLogo: boolean;
  reviewOwner: 'USER' | 'MAPPING_AGENT' | 'SYSTEM';
  reviewQuestion: string;
  recommendedAction: string;
};

type ReviewFilter = HumanReviewRow['reviewOwner'] | 'ALL';

type Props = {
  active: boolean;
  refreshKey: number;
  onReviewIntake: (intakeId: string) => void;
};

const readPayload = async (response: Response): Promise<any> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload;
};

const labelForReason = (value: string): string => (
  value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase())
);

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const reviewOwnerPresentation = {
  USER: { label: 'Your decision', color: 'red' },
  MAPPING_AGENT: { label: 'Agent repair', color: 'orange' },
  SYSTEM: { label: 'System repair', color: 'violet' },
} as const;

export default function AdminAffiliateMappingReviewPanel({ active, refreshKey, onReviewIntake }: Props) {
  const [jobs, setJobs] = useState<HumanReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('USER');

  const ownerCounts = useMemo(() => ({
    USER: jobs.filter((job) => job.reviewOwner === 'USER').length,
    MAPPING_AGENT: jobs.filter((job) => job.reviewOwner === 'MAPPING_AGENT').length,
    SYSTEM: jobs.filter((job) => job.reviewOwner === 'SYSTEM').length,
  }), [jobs]);
  const visibleJobs = useMemo(() => (
    reviewFilter === 'ALL' ? jobs : jobs.filter((job) => job.reviewOwner === reviewFilter)
  ), [jobs, reviewFilter]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readPayload(await fetch('/api/admin/affiliate-mapping-reviews', {
        credentials: 'include',
      }));
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load human-review jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void loadJobs();
  }, [active, loadJobs, refreshKey]);

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm" align="flex-start">
        <div>
          <Title order={3}>Terminal mapping review queue</Title>
          <Text size="sm" c="dimmed">
            This queue separates source decisions from agent repairs and system handoff failures.
          </Text>
        </div>
        <Group gap="xs">
          {loading ? <Loader size="sm" /> : null}
          <Button
            size="xs"
            variant="default"
            leftSection={<RefreshCw size={14} />}
            disabled={loading}
            onClick={() => void loadJobs()}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {error ? <Alert color="red" title="Human-review queue unavailable" mb="sm">{error}</Alert> : null}

      <Alert color="blue" title="What needs your review?" mb="sm">
        Only items marked <strong>Your decision</strong> need a source or evidence decision from you.
        Agent repair items contain mapping instructions. System repair items describe infrastructure failures and do not require a source judgment.
      </Alert>

      <Group mb="sm" justify="space-between" align="flex-end">
        <Select
          label="Show review items"
          value={reviewFilter}
          onChange={(value) => setReviewFilter((value as ReviewFilter | null) ?? 'USER')}
          data={[
            { value: 'USER', label: `Needs your decision (${ownerCounts.USER})` },
            { value: 'MAPPING_AGENT', label: `Agent repair (${ownerCounts.MAPPING_AGENT})` },
            { value: 'SYSTEM', label: `System repair (${ownerCounts.SYSTEM})` },
            { value: 'ALL', label: `All terminal items (${jobs.length})` },
          ]}
          w={280}
        />
        <Group gap="xs">
          <Badge color="red" variant="light">Your decision: {ownerCounts.USER}</Badge>
          <Badge color="orange" variant="light">Agent repair: {ownerCounts.MAPPING_AGENT}</Badge>
          <Badge color="violet" variant="light">System repair: {ownerCounts.SYSTEM}</Badge>
        </Group>
      </Group>

      <ScrollArea type="auto">
        <Table striped highlightOnHover withTableBorder withColumnBorders miw={1400}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Question and next action</Table.Th>
              <Table.Th>Recorded concern</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Marked</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleJobs.map((job) => {
              const owner = reviewOwnerPresentation[job.reviewOwner];
              return (
                <Table.Tr key={job.jobId}>
                <Table.Td>
                  <Text fw={600}>{job.intakeName}</Text>
                  <Text size="xs" c="dimmed">{job.sourceKey}</Text>
                  {job.region ? <Text size="xs" c="dimmed">{job.region}</Text> : null}
                  <Group gap={4} mt={4}>
                    <Badge size="xs" color="gray" variant="light">Terminal</Badge>
                    {job.hasSelectedLogo ? <Badge size="xs" color="teal" variant="light">Logo selected</Badge> : null}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge color={owner.color} variant="light">{owner.label}</Badge>
                </Table.Td>
                <Table.Td maw={400}>
                  <Stack gap={6}>
                    <Text size="sm" fw={600}>{job.reviewQuestion}</Text>
                    <Text size="xs" c="dimmed">{job.recommendedAction}</Text>
                  </Stack>
                </Table.Td>
                <Table.Td maw={440}>
                  <Stack gap={6}>
                    <Group gap={4} maw={380}>
                      {(job.reasonCodes.length ? job.reasonCodes : ['UNSPECIFIED']).map((reason) => (
                        <Badge key={reason} size="xs" color="orange" variant="light">
                          {labelForReason(reason)}
                        </Badge>
                      ))}
                    </Group>
                    {job.sourceSportLabels.length ? (
                      <Text size="sm" fw={600}>Source sport: {job.sourceSportLabels.join(', ')}</Text>
                    ) : null}
                    {job.rationale ? <Text size="sm">{job.rationale}</Text> : null}
                    {job.blockingIssues.map((issue) => (
                      <Text key={issue} size="xs" c="dimmed">• {issue}</Text>
                    ))}
                    {!job.rationale && !job.blockingIssues.length ? (
                      <Text size="sm" c="dimmed">{job.errorMessage || 'No structured explanation was recorded.'}</Text>
                    ) : null}
                  </Stack>
                </Table.Td>
                <Table.Td>{job.attemptCount}</Table.Td>
                <Table.Td>{formatDateTime(job.markedAt)}</Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Eye size={14} />}
                      onClick={() => onReviewIntake(job.intakeId)}
                    >
                      View evidence
                    </Button>
                    {job.baseUrl ? (
                      <Button
                        component="a"
                        href={job.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        size="xs"
                        variant="default"
                        leftSection={<ExternalLink size={14} />}
                      >
                        Source
                      </Button>
                    ) : null}
                  </Group>
                </Table.Td>
                </Table.Tr>
              );
            })}
            {!visibleJobs.length && !loading && !error ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="dimmed">
                    {jobs.length
                      ? 'No items match this review owner. Choose another filter to inspect the remaining terminal items.'
                      : 'No mapping jobs currently require human review.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
