"use client";

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { refundRequestService } from '@/lib/refundRequestService';
import type { RefundRequest } from '@/types';

type RefundRequestsListProps = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
};

export default function RefundRequestsList({ organizationId, userId, hostId }: RefundRequestsListProps) {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const hasFilter = useMemo(() => Boolean(organizationId || userId || hostId), [organizationId, userId, hostId]);

  useEffect(() => {
    let isMounted = true;

    const loadRefunds = async () => {
      if (!hasFilter) {
        setError('No filter provided to load refund requests.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const results = await refundRequestService.listRefundRequests({ organizationId, userId, hostId });
        if (isMounted) {
          setRefunds(results);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load refund requests';
        if (isMounted) {
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRefunds();

    return () => {
      isMounted = false;
    };
  }, [organizationId, userId, hostId, hasFilter]);

  const title = useMemo(() => {
    if (organizationId) return 'Organization Refund Requests';
    if (hostId) return 'Hosted Event Refund Requests';
    return 'Your Refund Requests';
  }, [organizationId, hostId]);

  const handleStatusChange = async (refundId: string, status: 'APPROVED' | 'REJECTED') => {
    setProcessingId(refundId);
    setActionError(null);
    try {
      const updated = await refundRequestService.updateRefundStatus(refundId, status);
      setRefunds((prev) => prev.map((refund) => (refund.$id === refundId ? { ...refund, status: updated.status } : refund)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update refund request';
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case 'APPROVED':
        return 'green';
      case 'REJECTED':
        return 'red';
      default:
        return 'yellow';
    }
  };

  const canTakeAction = (refund: RefundRequest) => {
    if (organizationId) return true;
    if (hostId && refund.hostId && refund.hostId === hostId) return true;
    return false;
  };

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <div>
          <Title order={4}>{title}</Title>
          <Text size="sm" c="dimmed">
            View refund requests filtered by the current context.
          </Text>
        </div>
        {loading && <Loader size="sm" />}
      </Group>

      {error && (
        <Alert color="red" mb="sm" data-testid="refund-error">
          {error}
        </Alert>
      )}

      {actionError && (
        <Alert color="red" mb="sm" data-testid="refund-action-error">
          {actionError}
        </Alert>
      )}

      {!loading && !error && refunds.length === 0 && (
        <Text size="sm" c="dimmed">
          No refund requests found.
        </Text>
      )}

      {!loading && !error && refunds.length > 0 && (
        <Table highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Event</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Requested By</Table.Th>
              <Table.Th>Host</Table.Th>
              <Table.Th>Organization</Table.Th>
              <Table.Th>Requested At</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {refunds.map((refund) => (
              <Table.Tr key={refund.$id}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text fw={500}>{refund.eventId || 'Unknown event'}</Text>
                    <Text size="xs" c="dimmed">
                      ID: {refund.$id}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{refund.reason || 'No reason provided'}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color="blue">
                    {refund.userId || 'Unknown user'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {refund.hostId ? (
                    <Badge variant="light" color="violet">
                      {refund.hostId}
                    </Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {refund.organizationId ? (
                    <Badge variant="light" color="green">
                      {refund.organizationId}
                    </Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {refund.$createdAt ? new Date(refund.$createdAt).toLocaleString() : 'Unknown'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={statusColor(refund.status)}>
                    {refund.status ?? 'WAITING'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {canTakeAction(refund) ? (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        disabled={(refund.status && refund.status !== 'WAITING') || processingId === refund.$id}
                        loading={processingId === refund.$id}
                        onClick={() => handleStatusChange(refund.$id, 'APPROVED')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        disabled={(refund.status && refund.status !== 'WAITING') || processingId === refund.$id}
                        loading={processingId === refund.$id}
                        onClick={() => handleStatusChange(refund.$id, 'REJECTED')}
                      >
                        Deny
                      </Button>
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
