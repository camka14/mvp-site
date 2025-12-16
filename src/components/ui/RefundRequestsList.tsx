"use client";

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { refundRequestService } from '@/lib/refundRequestService';
import type { RefundRequest } from '@/types';
import { eventService } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { organizationService } from '@/lib/organizationService';

type RefundRequestsListProps = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
};

const displayUserName = (user: { firstName?: string; lastName?: string; userName?: string; $id?: string }) => {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (name) return name;
  if (user.userName) return user.userName;
  return user.$id ?? 'User';
};

export default function RefundRequestsList({ organizationId, userId, hostId }: RefundRequestsListProps) {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [eventsById, setEventsById] = useState<Record<string, string>>({});
  const [usersById, setUsersById] = useState<Record<string, string>>({});
  const [organizationsById, setOrganizationsById] = useState<Record<string, string>>({});

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

        const eventIds = Array.from(new Set(results.map((refund) => refund.eventId).filter(Boolean)));
        const userIds = Array.from(
          new Set(
            results
              .flatMap((refund) => [refund.userId, refund.hostId])
              .filter((id): id is string => typeof id === 'string' && Boolean(id)),
          ),
        );
        const organizationIds = Array.from(
          new Set(
            results
              .map((refund) => refund.organizationId)
              .filter((id): id is string => typeof id === 'string' && Boolean(id)),
          ),
        );

        try {
          const [events, users, organizations] = await Promise.all([
            Promise.all(eventIds.map((id) => eventService.getEventById(id))),
            userIds.length ? userService.getUsersByIds(userIds) : Promise.resolve([]),
            organizationIds.length ? organizationService.getOrganizationsByIds(organizationIds) : Promise.resolve([]),
          ]);

          if (isMounted) {
            const eventEntries = events
              .filter((event): event is NonNullable<typeof event> => Boolean(event))
              .map((event) => [event.$id, event.name] as const);
            const userEntries = users.map((user) => [user.$id, displayUserName(user)] as const);
            const orgEntries = organizations.map((org) => [org.$id, org.name] as const);

            if (eventEntries.length) {
              setEventsById((prev) => ({ ...prev, ...Object.fromEntries(eventEntries) }));
            }
            if (userEntries.length) {
              setUsersById((prev) => ({ ...prev, ...Object.fromEntries(userEntries) }));
            }
            if (orgEntries.length) {
              setOrganizationsById((prev) => ({ ...prev, ...Object.fromEntries(orgEntries) }));
            }
          }
        } catch (lookupError) {
          console.error('Failed to hydrate refund request references', lookupError);
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
            {refunds.map((refund) => {
              const eventName = eventsById[refund.eventId] ?? refund.eventId ?? 'Unknown event';
              const requesterName = usersById[refund.userId] ?? refund.userId ?? 'Unknown user';
              const hostName = refund.hostId
                ? usersById[refund.hostId] ?? refund.hostId
                : null;
              const organizationName = refund.organizationId
                ? organizationsById[refund.organizationId] ?? refund.organizationId
                : null;

              return (
                <Table.Tr key={refund.$id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={500}>{eventName}</Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{refund.reason || 'No reason provided'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue">
                      {requesterName}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {hostName ? (
                      <Badge variant="light" color="violet">
                        {hostName}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {organizationName ? (
                      <Badge variant="light" color="green">
                        {organizationName}
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
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
