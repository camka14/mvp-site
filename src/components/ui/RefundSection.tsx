import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Paper, Text, Button, Alert, Textarea, Group, Select } from '@mantine/core';
import { Event, Team } from '@/types';
import { paymentService } from '@/lib/paymentService';
import { eventService } from '@/lib/eventService';
import { FamilyChild } from '@/lib/familyService';
import { useApp } from '@/app/providers';
import { formatDisplayDateTime } from '@/lib/dateUtils';

interface RefundSectionProps {
  event: Event;
  userRegistered: boolean;
  linkedChildren?: FamilyChild[];
  onRefundSuccess: () => void;
}

type WithdrawalState = 'participant' | 'waitlist' | 'free_agent';

type WithdrawalTarget = {
  id: string;
  label: string;
  state: WithdrawalState;
  isSelf: boolean;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const uniqueIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeId(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const stateLabel = (state: WithdrawalState): string => {
  switch (state) {
    case 'free_agent':
      return 'Free agent';
    case 'waitlist':
      return 'Waitlist';
    case 'participant':
    default:
      return 'Registered';
  }
};

const firstNonEmptyState = (...states: Array<WithdrawalState | null>): WithdrawalState | null => {
  for (const state of states) {
    if (state) return state;
  }
  return null;
};

export default function RefundSection({
  event,
  userRegistered,
  linkedChildren = [],
  onRefundSuccess,
}: RefundSectionProps) {
  const [loading, setLoading] = useState(false);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const { user } = useApp();

  const participantIds = useMemo(() => {
    const fromEvent = uniqueIds(event.userIds);
    const fromPlayers = Array.isArray(event.players)
      ? event.players
        .map((player) => normalizeId(player?.$id))
        .filter((id): id is string => Boolean(id))
      : [];
    const fromTeams = Array.isArray(event.teams)
      ? event.teams.flatMap((team) => {
        const teamPlayerIds = uniqueIds(team?.playerIds);
        if (teamPlayerIds.length > 0) {
          return teamPlayerIds;
        }
        if (Array.isArray(team?.players)) {
          return team.players
            .map((player) => normalizeId(player?.$id))
            .filter((id): id is string => Boolean(id));
        }
        return [];
      })
      : [];
    return Array.from(new Set([...fromEvent, ...fromPlayers, ...fromTeams]));
  }, [event.players, event.teams, event.userIds]);

  const waitlistIds = useMemo(
    () => uniqueIds(Array.isArray(event.waitListIds) ? event.waitListIds : event.waitList),
    [event.waitList, event.waitListIds],
  );
  const freeAgentIds = useMemo(
    () => uniqueIds(Array.isArray(event.freeAgentIds) ? event.freeAgentIds : event.freeAgents),
    [event.freeAgentIds, event.freeAgents],
  );

  const resolveStateForUser = useCallback((userId: string): WithdrawalState | null => {
    const isParticipant = participantIds.includes(userId);
    const isWaitlisted = waitlistIds.includes(userId);
    const isFreeAgent = freeAgentIds.includes(userId);
    return firstNonEmptyState(
      isParticipant ? 'participant' : null,
      isWaitlisted ? 'waitlist' : null,
      isFreeAgent ? 'free_agent' : null,
    );
  }, [freeAgentIds, participantIds, waitlistIds]);

  const activeChildren = useMemo(
    () => linkedChildren.filter((child) => (child.linkStatus ?? 'active') === 'active'),
    [linkedChildren],
  );

  const targets = useMemo<WithdrawalTarget[]>(() => {
    if (!user?.$id) {
      return [];
    }

    const byId = new Map<string, WithdrawalTarget>();

    const selfState = resolveStateForUser(user.$id) ?? (userRegistered ? 'participant' : null);
    if (selfState) {
      byId.set(user.$id, {
        id: user.$id,
        label: 'My Registration',
        state: selfState,
        isSelf: true,
      });
    }

    activeChildren.forEach((child) => {
      const childId = normalizeId(child.userId);
      if (!childId) {
        return;
      }
      const childState = resolveStateForUser(childId);
      if (!childState) {
        return;
      }
      const childName = `${child.firstName ?? ''} ${child.lastName ?? ''}`.trim() || 'Child';
      byId.set(childId, {
        id: childId,
        label: childName,
        state: childState,
        isSelf: false,
      });
    });

    return Array.from(byId.values()).sort((left, right) => {
      if (left.isSelf && !right.isSelf) return -1;
      if (!left.isSelf && right.isSelf) return 1;
      return left.label.localeCompare(right.label);
    });
  }, [activeChildren, resolveStateForUser, user?.$id, userRegistered]);

  useEffect(() => {
    if (!targets.length) {
      setSelectedTargetId(null);
      return;
    }
    const stillValid = selectedTargetId && targets.some((target) => target.id === selectedTargetId);
    if (!stillValid) {
      setSelectedTargetId(targets[0].id);
    }
  }, [targets, selectedTargetId]);

  useEffect(() => {
    setShowReasonInput(false);
    setRefundReason('');
    setError(null);
  }, [selectedTargetId]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? targets[0] ?? null,
    [selectedTargetId, targets],
  );

  if (!user || !selectedTarget) {
    return null;
  }

  const isHost = user.$id === event.hostId;
  const isFreeForTarget = event.price === 0 || (isHost && selectedTarget.isSelf);

  const now = new Date();
  const eventStart = new Date(event.start);
  const refundBufferHours = Number(event.cancellationRefundHours ?? 0);
  const refundDeadline = new Date(eventStart.getTime() - (refundBufferHours * 60 * 60 * 1000));

  const eventHasStarted = now >= eventStart;
  const isBeforeRefundDeadline = refundBufferHours > 0 && now < refundDeadline;
  const canAutoRefund = !eventHasStarted && isBeforeRefundDeadline;

  const leaveSelectedTarget = async () => {
    if (!selectedTarget) {
      return;
    }

    if (selectedTarget.state === 'free_agent') {
      await eventService.removeFreeAgent(event.$id, selectedTarget.id);
      return;
    }

    if (selectedTarget.state === 'waitlist') {
      await eventService.removeFromWaitlist(event.$id, selectedTarget.id, 'user');
      return;
    }

    let registeredTeam: Team | null = null;
    if (event.teamSignup && selectedTarget.isSelf) {
      const teams = Array.isArray(event.teams) ? event.teams : [];
      registeredTeam = teams.find((team) => {
        if (!team) return false;
        const playerIds = Array.isArray(team.playerIds) ? team.playerIds : [];
        if (playerIds.includes(user.$id)) {
          return true;
        }
        const players = Array.isArray(team.players) ? team.players : [];
        return players.some((player) => player?.$id === user.$id);
      }) ?? null;
    }

    await paymentService.leaveEvent(
      registeredTeam ? undefined : (selectedTarget.isSelf ? user : undefined),
      event,
      registeredTeam ?? undefined,
      undefined,
      undefined,
      selectedTarget.id,
    );
  };

  const handleRefund = async () => {
    if (eventHasStarted) {
      setError('Event has already started. Refunds are no longer available.');
      return;
    }

    if (!canAutoRefund && !refundReason.trim()) {
      setError('Please provide a reason for the refund request');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await paymentService.requestRefund(
        event,
        user,
        canAutoRefund ? undefined : refundReason,
        selectedTarget.id,
      );

      if (result.success) {
        onRefundSuccess();
      } else {
        setError(result.message || 'Refund request failed');
      }
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Refund request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRefund = () => {
    if (eventHasStarted) {
      setError('Event has already started. Refunds are no longer available.');
      return;
    }

    if (canAutoRefund) {
      void handleRefund();
    } else {
      setShowReasonInput(true);
    }
  };

  const handleLeaveAction = async () => {
    setLoading(true);
    setError(null);
    try {
      await leaveSelectedTarget();
      onRefundSuccess();
    } catch (leaveError) {
      const message = leaveError instanceof Error ? leaveError.message : 'Failed to leave event';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const sectionTitle = selectedTarget.state === 'participant' && !isFreeForTarget
    ? 'Refund Options'
    : 'Registration';

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb={8}>{sectionTitle}</Text>

      {targets.length > 1 && (
        <Select
          label="Withdraw profile"
          value={selectedTarget.id}
          onChange={(value) => setSelectedTargetId(value)}
          data={targets.map((target) => ({
            value: target.id,
            label: `${target.label} (${stateLabel(target.state)})`,
          }))}
          mb="sm"
        />
      )}

      <Text size="sm" c="dimmed" mb="sm">
        {selectedTarget.label} is currently in {stateLabel(selectedTarget.state).toLowerCase()} status.
      </Text>

      {error && (
        <Alert color="red" variant="light" mb="sm">{error}</Alert>
      )}

      {selectedTarget.state === 'free_agent' ? (
        <div className="space-y-2">
          <Text size="sm" c="dimmed">Remove this profile from the free agent list.</Text>
          <Button fullWidth color="red" onClick={() => { void handleLeaveAction(); }} loading={loading}>
            Leave Free Agent List
          </Button>
        </div>
      ) : selectedTarget.state === 'waitlist' ? (
        <div className="space-y-2">
          <Text size="sm" c="dimmed">Remove this profile from the waitlist.</Text>
          <Button fullWidth color="red" onClick={() => { void handleLeaveAction(); }} loading={loading}>
            Leave Waitlist
          </Button>
        </div>
      ) : isFreeForTarget ? (
        <div className="space-y-2">
          <Text size="sm" c="dimmed">Leave this event registration.</Text>
          <Button fullWidth color="red" onClick={() => { void handleLeaveAction(); }} loading={loading}>
            Leave Event
          </Button>
        </div>
      ) : eventHasStarted ? (
        <div className="space-y-2">
          <Text size="sm" c="dimmed">
            Event has already started. Refunds are no longer available.
          </Text>
        </div>
      ) : canAutoRefund ? (
        <div className="space-y-2">
          <Text size="sm" c="dimmed">You can get a full refund until {formatDisplayDateTime(refundDeadline)}</Text>
          <Button fullWidth color="green" onClick={() => { void handleRefund(); }} loading={loading}>
            Withdraw and Get Refund
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Text size="sm" c="dimmed">
            Automatic refund period has expired. You can request a refund from the host.
          </Text>

          {!showReasonInput ? (
            <Button fullWidth color="orange" onClick={handleRequestRefund}>Withdraw and Request Refund</Button>
          ) : (
            <div className="space-y-3">
              <Textarea
                label="Reason for refund request *"
                value={refundReason}
                onChange={(eventValue) => setRefundReason(eventValue.currentTarget.value)}
                placeholder="Please explain why you need a refund..."
                minRows={3}
              />
              <Group grow>
                <Button variant="default" onClick={() => setShowReasonInput(false)}>Cancel</Button>
                <Button color="orange" onClick={() => { void handleRefund(); }} disabled={!refundReason.trim()} loading={loading}>
                  Send Request
                </Button>
              </Group>
            </div>
          )}
        </div>
      )}
    </Paper>
  );
}
