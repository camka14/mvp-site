'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import { apiRequest } from '@/lib/apiClient';
import type { Match, Team } from '@/types';

type MatchRosterEntry = {
  id: string | null;
  source: 'BASE' | 'TEMPORARY' | string;
  status: 'ACTIVE' | 'REMOVED' | string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  email: string | null;
  noAccount?: boolean;
};

type MatchRosterResponse = {
  rosters?: Array<{
    eventTeamId: string;
    entries: MatchRosterEntry[];
  }>;
  roster?: {
    eventTeamId: string;
    entries: MatchRosterEntry[];
  };
  allowMatchRosterEdits?: boolean;
  allowTemporaryMatchPlayers?: boolean;
};

type MatchRosterModalProps = {
  opened: boolean;
  eventId: string | null;
  match: Match | null;
  team: Team | null;
  onClose: () => void;
};

const entryName = (entry: MatchRosterEntry): string => (
  [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim()
  || entry.userName
  || entry.email
  || entry.userId
  || 'Temporary player'
);

const isCompletedMatch = (match: Match | null): boolean => {
  const status = String(match?.status ?? '').toUpperCase();
  const resultType = String(match?.resultType ?? '').toUpperCase();
  return status === 'COMPLETE' || status === 'CANCELLED' || resultType === 'FORFEIT' || Boolean(match?.actualEnd);
};

export default function MatchRosterModal({
  opened,
  eventId,
  match,
  team,
  onClose,
}: MatchRosterModalProps) {
  const [entries, setEntries] = useState<MatchRosterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [linkEmailByEntryId, setLinkEmailByEntryId] = useState<Record<string, string>>({});
  const eventTeamId = team?.$id ?? null;
  const completed = isCompletedMatch(match);

  const endpoint = useMemo(() => {
    if (!eventId || !match?.$id) return null;
    return `/api/events/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(match.$id)}/roster`;
  }, [eventId, match?.$id]);

  const loadRoster = async () => {
    if (!endpoint || !eventTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<MatchRosterResponse>(endpoint);
      const roster = response.roster ?? response.rosters?.find((row) => row.eventTeamId === eventTeamId);
      setEntries(roster?.entries ?? []);
    } catch (err) {
      console.error('Failed to load match roster', err);
      setError('Failed to load match roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) {
      void loadRoster();
    } else {
      setEntries([]);
      setError(null);
      setFirstName('');
      setLastName('');
      setEmail('');
      setLinkEmailByEntryId({});
    }
  }, [opened, endpoint, eventTeamId]);

  const submitOperation = async (body: Record<string, unknown>) => {
    if (!endpoint || !eventTeamId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<MatchRosterResponse>(endpoint, {
        method: 'POST',
        body: {
          eventTeamId,
          ...body,
        },
      });
      setEntries(response.roster?.entries ?? entries);
    } catch (err) {
      console.error('Failed to update match roster', err);
      setError(err instanceof Error ? err.message : 'Failed to update match roster.');
    } finally {
      setSaving(false);
    }
  };

  const addTemporaryPlayer = async () => {
    await submitOperation({
      addPlayer: {
        firstName,
        lastName,
        email: email.trim() || undefined,
      },
    });
    setFirstName('');
    setLastName('');
    setEmail('');
  };

  const linkTemporaryEntry = async (entry: MatchRosterEntry) => {
    if (!entry.id) return;
    const linkEmail = linkEmailByEntryId[entry.id]?.trim() || entry.email?.trim() || undefined;
    await submitOperation({
      addPlayer: {
        entryId: entry.id,
        email: linkEmail,
      },
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={team?.name ? `${team.name} match roster` : 'Match roster'}
      centered
      size="lg"
    >
      <Stack gap="md">
        {error && <Text c="red" size="sm">{error}</Text>}
        <Stack gap="xs">
          {loading ? (
            <Text size="sm" c="dimmed">Loading roster...</Text>
          ) : entries.length ? entries.map((entry) => {
            const removed = String(entry.status).toUpperCase() === 'REMOVED';
            const temporary = entry.source === 'TEMPORARY';
            const linkKey = entry.id ?? '';
            return (
              <Paper key={`${entry.source}:${entry.userId ?? entry.id ?? entry.email}`} withBorder p="sm" radius="sm" opacity={removed ? 0.55 : 1}>
                <Stack gap="xs">
                  <Group justify="space-between" gap="sm" wrap="nowrap">
                    <Group gap="xs" style={{ minWidth: 0 }}>
                      <Text fw={600} style={{ minWidth: 0 }}>{entryName(entry)}</Text>
                      {temporary && <Badge variant="light">Temporary</Badge>}
                      {entry.noAccount && <Badge color="yellow" variant="light">No account</Badge>}
                      {removed && <Badge color="red" variant="light">Removed</Badge>}
                    </Group>
                    {!completed && !temporary && entry.userId && (
                      <Button
                        size="xs"
                        variant={removed ? 'light' : 'subtle'}
                        color={removed ? 'green' : 'red'}
                        loading={saving}
                        onClick={() => submitOperation(removed
                          ? { restorePlayer: { userId: entry.userId } }
                          : { removePlayer: { userId: entry.userId } })}
                      >
                        {removed ? 'Add' : 'Remove'}
                      </Button>
                    )}
                  </Group>
                  {temporary && !entry.userId && entry.id && (
                    <Group align="flex-end" gap="xs">
                      <TextInput
                        label="Link email"
                        placeholder="player@example.com"
                        value={linkEmailByEntryId[linkKey] ?? entry.email ?? ''}
                        onChange={(event) => setLinkEmailByEntryId((current) => ({
                          ...current,
                          [linkKey]: event.currentTarget.value,
                        }))}
                        style={{ flex: 1 }}
                      />
                      <Button size="xs" loading={saving} onClick={() => linkTemporaryEntry(entry)}>
                        Link
                      </Button>
                    </Group>
                  )}
                </Stack>
              </Paper>
            );
          }) : (
            <Text size="sm" c="dimmed">No roster entries found.</Text>
          )}
        </Stack>
        {!completed && (
          <Paper withBorder p="sm" radius="sm">
            <Stack gap="xs">
              <Text fw={700} size="sm">Add temporary player</Text>
              <Group grow align="flex-end">
                <TextInput label="First name" value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} />
                <TextInput label="Last name" value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} />
              </Group>
              <Group align="flex-end">
                <TextInput
                  label="Email"
                  placeholder="Optional"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button loading={saving} disabled={!firstName.trim() || !lastName.trim()} onClick={addTemporaryPlayer}>
                  Add Player
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
}
