'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, Center, Container, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useApp } from '@/app/providers';
import { apiRequest } from '@/lib/apiClient';

type InvitePreview = {
  available: boolean;
  invite: {
    id: string;
    firstName?: string | null;
    expiresAt?: string | null;
    role?: 'PLAYER' | 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';
  };
  team: { id: string; name: string; sport?: string | null; division?: string | null; teamSize?: number | null };
};

export default function TeamInviteClaimPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useApp();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedQuery = useMemo(() => {
    const query = new URLSearchParams();
    ['v', 'e', 's'].forEach((key) => {
      const value = searchParams.get(key);
      if (value) query.set(key, value);
    });
    return query.toString();
  }, [searchParams]);
  const returnPath = `/i/${encodeURIComponent(params.id)}${signedQuery ? `?${signedQuery}` : ''}`;
  const roleLabel = preview?.invite.role === 'MANAGER'
    ? 'manager'
    : preview?.invite.role === 'HEAD_COACH'
      ? 'head coach'
      : preview?.invite.role === 'ASSISTANT_COACH'
        ? 'assistant coach'
        : 'player';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<InvitePreview>(`/api/public/team-invites/${encodeURIComponent(params.id)}?${signedQuery}`);
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setError('This invitation is expired, already used, or unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [params.id, signedQuery]);

  const claim = async () => {
    setClaiming(true);
    setError(null);
    try {
      await apiRequest(`/api/team-invites/${encodeURIComponent(params.id)}/claim?${signedQuery}`, { method: 'POST' });
      router.replace(`/teams/${encodeURIComponent(preview!.team.id)}`);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'The invitation could not be accepted.');
      setClaiming(false);
    }
  };

  if (loading || authLoading) {
    return <Center mih="70vh"><Loader /></Center>;
  }

  return (
    <Container size="xs" py={64}>
      <Paper withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="md">
          <Badge variant="light" style={{ alignSelf: 'flex-start' }}>Team invitation</Badge>
          {preview ? (
            <>
              <div>
                <Title order={1} size="h2">Join {preview.team.name}</Title>
                <Text c="dimmed" mt={4}>{[preview.team.sport, preview.team.division].filter(Boolean).join(' · ')}</Text>
              </div>
              <Text>
                {preview.invite.firstName ? `${preview.invite.firstName}, you` : 'You'} have been invited to join this team as {roleLabel} on BracketIQ.
              </Text>
            </>
          ) : null}
          {error ? <Alert color="red">{error}</Alert> : null}
          {preview && !error ? (
            isAuthenticated ? (
              <Button size="md" onClick={() => { void claim(); }} loading={claiming}>Accept invitation</Button>
            ) : (
              <Stack gap="xs">
                <Button size="md" onClick={() => router.push(`/login?next=${encodeURIComponent(returnPath)}`)}>Sign in to accept</Button>
                <Button variant="light" size="md" onClick={() => router.push(`/login?mode=signup&next=${encodeURIComponent(returnPath)}`)}>Create an account</Button>
              </Stack>
            )
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
}
