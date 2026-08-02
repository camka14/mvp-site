'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
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
  rationale?: string | null;
  blockingIssues: string[];
  hasSelectedLogo: boolean;
};

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

export default function AdminAffiliateMappingReviewPanel({ active, refreshKey, onReviewIntake }: Props) {
  const [jobs, setJobs] = useState<HumanReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <Title order={3}>Mapping jobs requiring human review</Title>
          <Text size="sm" c="dimmed">
            These jobs are terminal and cannot be claimed by either agent. Review the stored evidence before deciding whether the source can be repaired.
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

      <ScrollArea type="auto">
        <Table striped highlightOnHover withTableBorder withColumnBorders miw={1180}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Details</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Marked</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((job) => (
              <Table.Tr key={job.jobId}>
                <Table.Td>
                  <Text fw={600}>{job.intakeName}</Text>
                  <Text size="xs" c="dimmed">{job.sourceKey}</Text>
                  {job.region ? <Text size="xs" c="dimmed">{job.region}</Text> : null}
                  <Group gap={4} mt={4}>
                    <Badge size="xs" color="red" variant="light">Human review</Badge>
                    {job.hasSelectedLogo ? <Badge size="xs" color="teal" variant="light">Logo selected</Badge> : null}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} maw={300}>
                    {(job.reasonCodes.length ? job.reasonCodes : ['UNSPECIFIED']).map((reason) => (
                      <Badge key={reason} size="xs" color="orange" variant="light">
                        {labelForReason(reason)}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td maw={440}>
                  <Stack gap={4}>
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
                      Evidence
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
            ))}
            {!jobs.length && !loading && !error ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="dimmed">No mapping jobs currently require human review.</Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
