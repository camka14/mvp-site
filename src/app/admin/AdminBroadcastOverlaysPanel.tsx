'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Copy, Eye, Radio, RotateCw, Send, Settings2 } from 'lucide-react';
import BroadcastControlRoom from '@/components/broadcast/BroadcastControlRoom';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG, parseBroadcastOverlayConfig } from '@/server/broadcast/schemas';
import type { BroadcastOverlayConfigV1, MatchPresentationStateV1 } from '@/server/broadcast/types';

type AdminEventOption = { $id: string; name?: string | null; organizationId?: string | null };
type OverlayRow = {
  id: string;
  name: string;
  status: string;
  eventId: string;
  draftConfig: unknown;
  publishedConfig: unknown | null;
  publishedConfigRevision: number;
  state: OverlayState | null;
};
type OverlayState = {
  id: string;
  revision: number;
  activeMatchId: string | null;
  scoringMode: string;
  presentationState: MatchPresentationStateV1;
};
type MatchOption = { id?: string; $id?: string; matchId?: number; team1?: { name?: string }; team2?: { name?: string } };

type AdminBroadcastOverlaysPanelProps = {
  active: boolean;
  refreshKey: number;
};

const ADMIN_EVENTS_PAGE_SIZE = 50;
const OVERLAY_STATE_REFRESH_INTERVAL_MS = 1_500;

const asConfig = (value: unknown): BroadcastOverlayConfigV1 => {
  try {
    return parseBroadcastOverlayConfig(value);
  } catch {
    return DEFAULT_BROADCAST_OVERLAY_CONFIG;
  }
};

const requestId = (): string => crypto.randomUUID();

const asNumber = (value: string | number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function AdminBroadcastOverlaysPanel({ active, refreshKey }: AdminBroadcastOverlaysPanelProps) {
  const [events, setEvents] = useState<AdminEventOption[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayRow[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayRow | null>(null);
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [draftConfig, setDraftConfig] = useState<BroadcastOverlayConfigV1>(DEFAULT_BROADCAST_OVERLAY_CONFIG);
  const [overlayName, setOverlayName] = useState('Beach Court Scorebug');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [programUrl, setProgramUrl] = useState<string | null>(null);
  const [lastBroadcastActionId, setLastBroadcastActionId] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.$id === eventId) ?? null,
    [eventId, events],
  );
  const eventOptions = useMemo(() => events.map((event) => ({
    value: event.$id,
    label: event.name?.trim() || event.$id,
  })), [events]);
  const matchOptions = useMemo(() => matches.map((match) => {
    const id = match.id ?? match.$id ?? '';
    const teamLabel = [match.team1?.name, match.team2?.name].filter(Boolean).join(' vs ');
    return { value: id, label: teamLabel || `Match ${match.matchId ?? id}` };
  }).filter((option) => option.value), [matches]);

  const loadEvents = useCallback(async () => {
    const eventsById = new Map<string, AdminEventOption>();
    let offset = 0;
    let total = 0;

    do {
      const response = await fetch(`/api/admin/events?limit=${ADMIN_EVENTS_PAGE_SIZE}&offset=${offset}`, { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to load events.');

      const pageEvents = Array.isArray(payload.events) ? payload.events as AdminEventOption[] : [];
      pageEvents.forEach((event) => eventsById.set(event.$id, event));
      total = Number.isFinite(payload.total) ? Math.max(Math.trunc(payload.total), 0) : offset + pageEvents.length;
      offset += pageEvents.length;

      if (pageEvents.length === 0) break;
    } while (offset < total);

    const nextEvents = Array.from(eventsById.values());
    setEvents(nextEvents);
    setEventId((current) => current && nextEvents.some((event) => event.$id === current) ? current : nextEvents[0]?.$id ?? null);
  }, []);

  const loadOverlays = useCallback(async (nextEventId: string) => {
    const response = await fetch(`/api/events/${encodeURIComponent(nextEventId)}/broadcast-overlays`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Unable to load broadcast overlays.');
    const nextOverlays = Array.isArray(payload.overlays) ? payload.overlays as OverlayRow[] : [];
    setOverlays(nextOverlays);
    const nextSelected = nextOverlays.find((overlay) => overlay.id === selectedOverlayId) ?? nextOverlays[0] ?? null;
    setSelectedOverlayId(nextSelected?.id ?? null);
    setSelectedOverlay(nextSelected);
    setDraftConfig(asConfig(nextSelected?.draftConfig ?? DEFAULT_BROADCAST_OVERLAY_CONFIG));
  }, [selectedOverlayId]);

  const refreshOverlayState = useCallback(async (nextEventId: string) => {
    const response = await fetch(`/api/events/${encodeURIComponent(nextEventId)}/broadcast-overlays`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Unable to refresh broadcast score state.');
    const nextOverlays = Array.isArray(payload.overlays) ? payload.overlays as OverlayRow[] : [];
    setOverlays(nextOverlays);
    setSelectedOverlay((current) => {
      const overlayId = current?.id ?? selectedOverlayId;
      const refreshed = nextOverlays.find((overlay) => overlay.id === overlayId) ?? null;
      if (!refreshed || !current) return refreshed ?? current;
      // Preserve unsaved styling/name edits while the live score state updates.
      return { ...current, status: refreshed.status, state: refreshed.state };
    });
  }, [selectedOverlayId]);

  const loadMatches = useCallback(async (nextEventId: string) => {
    const response = await fetch(`/api/events/${encodeURIComponent(nextEventId)}/matches`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Unable to load event matches.');
    setMatches(Array.isArray(payload.matches) ? payload.matches as MatchOption[] : []);
  }, []);

  const reload = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      await loadEvents();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load broadcast overlay data.');
    } finally {
      setLoading(false);
    }
  }, [active, loadEvents]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);

  useEffect(() => {
    if (!active || !eventId) return;
    setLoading(true);
    setError(null);
    void Promise.all([loadOverlays(eventId), loadMatches(eventId)])
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load the event overlay workspace.'))
      .finally(() => setLoading(false));
  }, [active, eventId, loadMatches, loadOverlays, refreshKey]);

  useEffect(() => {
    if (!active || !eventId) return undefined;
    const refreshTimer = window.setInterval(() => {
      void refreshOverlayState(eventId).catch(() => undefined);
    }, OVERLAY_STATE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, [active, eventId, refreshOverlayState]);

  const previewScoreSignature = useMemo(() => {
    const score = selectedOverlay?.state?.presentationState.score;
    if (!score) return 'no-score';
    return [
      score.currentSet,
      ...score.points,
      ...score.sets.flatMap((set) => [set.sequence, set.team1Points, set.team2Points, set.complete ? 1 : 0]),
    ].join('-');
  }, [selectedOverlay?.state?.presentationState]);

  const chooseOverlay = (overlayId: string | null) => {
    const overlay = overlays.find((candidate) => candidate.id === overlayId) ?? null;
    setSelectedOverlayId(overlay?.id ?? null);
    setSelectedOverlay(overlay);
    setDraftConfig(asConfig(overlay?.draftConfig ?? DEFAULT_BROADCAST_OVERLAY_CONFIG));
    setProgramUrl(null);
    setLastBroadcastActionId(null);
  };

  const persistDraft = async () => {
    if (!eventId || !selectedOverlay) throw new Error('Select an overlay before saving draft styling.');
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/broadcast-overlays/${encodeURIComponent(selectedOverlay.id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: selectedOverlay.name, draftConfig }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Unable to save draft styling.');
    await loadOverlays(eventId);
  };

  const saveDraft = async () => {
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      setNotice('Draft styling saved. The live overlay remains unchanged until you publish.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the draft.');
    } finally {
      setSaving(false);
    }
  };

  const createOverlay = async () => {
    if (!eventId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/broadcast-overlays`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: overlayName, draftConfig }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to create the overlay.');
      setSelectedOverlayId(payload.overlay?.id ?? null);
      setNotice('Overlay created as a draft. Select a match, style it, then publish.');
      await loadOverlays(eventId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create the overlay.');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!eventId || !selectedOverlay) return;
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/broadcast-overlays/${encodeURIComponent(selectedOverlay.id)}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to publish the overlay.');
      setNotice('Compact Scorebug is live. Create a program capability when you are ready to add it to OBS.');
      await loadOverlays(eventId);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish the overlay.');
    } finally {
      setSaving(false);
    }
  };

  const runCommand = async (command: Record<string, unknown>): Promise<string | null> => {
    if (!eventId || !selectedOverlay?.state) return null;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/broadcast-overlays/${encodeURIComponent(selectedOverlay.id)}/commands`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...command, expectedRevision: selectedOverlay.state.revision, requestId: requestId() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Broadcast command failed.');
      const nextState: OverlayState = { ...selectedOverlay.state, revision: payload.state.revision, presentationState: payload.state };
      const nextOverlay = { ...selectedOverlay, state: nextState };
      setSelectedOverlay(nextOverlay);
      setOverlays((current) => current.map((overlay) => overlay.id === nextOverlay.id ? nextOverlay : overlay));
      const actionId = typeof payload.action?.id === 'string' ? payload.action.id : null;
      if (actionId) setLastBroadcastActionId(actionId);
      return actionId;
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'Broadcast command failed.');
      await loadOverlays(eventId);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createProgramCapability = async () => {
    if (!eventId || !selectedOverlay) return;
    if (selectedOverlay.status !== 'PUBLISHED') {
      setError('Publish the overlay before creating an OBS Program URL.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/broadcast-overlays/${encodeURIComponent(selectedOverlay.id)}/access-tokens`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'OBS Program Overlay' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token) throw new Error(payload?.error || 'Unable to create the program capability.');
      setProgramUrl(`${window.location.origin}/overlay/${encodeURIComponent(selectedOverlay.id)}#token=${payload.token}`);
      setNotice('Copy this unlisted Program URL directly into OBS. It is shown once and is not saved in this browser workspace.');
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : 'Unable to create the program capability.');
    } finally {
      setSaving(false);
    }
  };

  const activeMatchId = selectedOverlay?.state?.activeMatchId ?? null;
  const previewMode = selectedOverlay?.status === 'PUBLISHED' ? 'live' : 'draft';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={3}>Broadcast Overlays</Title>
          <Text size="sm" c="dimmed">Create a protected beach-volleyball Program Overlay for an OBS Browser Source. The Program output has no admin controls or app chrome.</Text>
        </div>
        <Badge color="orange" variant="light">Pilot: Compact Scorebug</Badge>
      </Group>

      {error ? <Alert color="red" title="Broadcast overlay issue">{error}</Alert> : null}
      {notice ? <Alert color="blue" title="Broadcast overlay update" withCloseButton onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Select label="Event" data={eventOptions} value={eventId} onChange={setEventId} searchable placeholder="Choose an event" />
          <TextInput label="New overlay name" value={overlayName} onChange={(event) => setOverlayName(event.currentTarget.value)} />
          <Button mt={{ base: 0, md: 24 }} leftSection={<Radio size={16} />} loading={saving} disabled={!eventId} onClick={() => void createOverlay()}>
            Create overlay
          </Button>
        </SimpleGrid>
      </Paper>

      {loading ? <Group justify="center" py="xl"><Loader size="sm" /></Group> : null}
      {eventId && !loading ? (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Text fw={700}>Studio</Text>
                {selectedOverlay ? <Badge color={selectedOverlay.status === 'PUBLISHED' ? 'green' : 'gray'}>{selectedOverlay.status}</Badge> : null}
              </Group>
              <Stack gap="sm">
                <Select
                  label="Overlay"
                  data={overlays.map((overlay) => ({ value: overlay.id, label: `${overlay.name} · ${overlay.status}` }))}
                  value={selectedOverlayId}
                  onChange={chooseOverlay}
                  placeholder="Create an overlay to begin"
                />
                {selectedOverlay ? (
                  <>
                    <Select
                      label="Active match"
                      data={[{ value: '', label: 'No match selected' }, ...matchOptions]}
                      value={activeMatchId ?? ''}
                      onChange={(value) => void runCommand({ type: 'SELECT_MATCH', matchId: value || null })}
                      placeholder="Choose a match"
                    />
                    <Divider label="Content" labelPosition="center" />
                    <SimpleGrid cols={2}>
                      <Switch label="Team logos" checked={draftConfig.display.showTeamLogos} onChange={(event) => setDraftConfig((current) => ({ ...current, display: { ...current.display, showTeamLogos: event.currentTarget.checked } }))} />
                      <Switch label="Player names" checked={draftConfig.display.showPlayerNames} onChange={(event) => setDraftConfig((current) => ({ ...current, display: { ...current.display, showPlayerNames: event.currentTarget.checked } }))} />
                      <Switch label="Elapsed timer" checked={draftConfig.display.showTimer} onChange={(event) => setDraftConfig((current) => ({ ...current, display: { ...current.display, showTimer: event.currentTarget.checked } }))} />
                      <Switch label="Seeds" checked={draftConfig.display.showSeeds} onChange={(event) => setDraftConfig((current) => ({ ...current, display: { ...current.display, showSeeds: event.currentTarget.checked } }))} />
                    </SimpleGrid>
                    <Divider label="Position and output" labelPosition="center" />
                    <SimpleGrid cols={2}>
                      <Select
                        label="Anchor"
                        value={draftConfig.transform.anchor}
                        data={['TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'CENTER_LEFT', 'CENTER', 'CENTER_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT']}
                        onChange={(anchor) => anchor && setDraftConfig((current) => ({ ...current, transform: { ...current.transform, anchor: anchor as BroadcastOverlayConfigV1['transform']['anchor'] } }))}
                      />
                      <Select
                        label="Surface"
                        value={draftConfig.style.surface}
                        data={['DARK', 'LIGHT', 'GLASS']}
                        onChange={(surface) => surface && setDraftConfig((current) => ({ ...current, style: { ...current.style, surface: surface as BroadcastOverlayConfigV1['style']['surface'] } }))}
                      />
                    </SimpleGrid>
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                      <NumberInput
                        label="Horizontal offset"
                        suffix="%"
                        min={-100}
                        max={100}
                        step={0.5}
                        disabled={draftConfig.transform.locked}
                        value={draftConfig.transform.x * 100}
                        onChange={(value) => setDraftConfig((current) => ({ ...current, transform: { ...current.transform, x: asNumber(value, current.transform.x * 100) / 100 } }))}
                      />
                      <NumberInput
                        label="Vertical offset"
                        suffix="%"
                        min={-100}
                        max={100}
                        step={0.5}
                        disabled={draftConfig.transform.locked}
                        value={draftConfig.transform.y * 100}
                        onChange={(value) => setDraftConfig((current) => ({ ...current, transform: { ...current.transform, y: asNumber(value, current.transform.y * 100) / 100 } }))}
                      />
                      <NumberInput
                        label="Scale"
                        suffix="%"
                        min={75}
                        max={125}
                        step={1}
                        disabled={draftConfig.transform.locked}
                        value={draftConfig.transform.scale * 100}
                        onChange={(value) => setDraftConfig((current) => ({ ...current, transform: { ...current.transform, scale: asNumber(value, current.transform.scale * 100) / 100 } }))}
                      />
                    </SimpleGrid>
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                      <NumberInput
                        label="Safe area"
                        suffix="%"
                        min={0}
                        max={20}
                        step={0.5}
                        value={draftConfig.transform.safeArea * 100}
                        onChange={(value) => setDraftConfig((current) => ({ ...current, transform: { ...current.transform, safeArea: asNumber(value, current.transform.safeArea * 100) / 100 } }))}
                      />
                      <NumberInput
                        label="Maximum width"
                        suffix=" px"
                        min={320}
                        max={1920}
                        step={10}
                        value={draftConfig.transform.maxWidth}
                        onChange={(value) => setDraftConfig((current) => ({ ...current, transform: { ...current.transform, maxWidth: Math.round(asNumber(value, current.transform.maxWidth)) } }))}
                      />
                      <Select
                        label="Output preset"
                        value={draftConfig.output.preset}
                        data={[
                          { value: 'HD_1080P', label: '1920 × 1080' },
                          { value: 'UHD_4K', label: '3840 × 2160' },
                        ]}
                        onChange={(preset) => preset && setDraftConfig((current) => ({ ...current, output: { ...current.output, preset: preset as BroadcastOverlayConfigV1['output']['preset'] } }))}
                      />
                    </SimpleGrid>
                    <Group
                      tabIndex={draftConfig.transform.locked ? -1 : 0}
                      onKeyDown={(event) => {
                        if (draftConfig.transform.locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                        event.preventDefault();
                        const step = event.shiftKey ? 0.01 : 0.005;
                        setDraftConfig((current) => ({
                          ...current,
                          transform: {
                            ...current.transform,
                            x: Math.max(-1, Math.min(1, current.transform.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))),
                            y: Math.max(-1, Math.min(1, current.transform.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))),
                          },
                        }));
                      }}
                    >
                      <Switch
                        label="Lock position"
                        checked={draftConfig.transform.locked}
                        onChange={(event) => setDraftConfig((current) => ({ ...current, transform: { ...current.transform, locked: event.currentTarget.checked } }))}
                      />
                      <Text size="xs" c="dimmed">Focus here and use arrow keys to nudge by 0.5%, or Shift + arrow for 1%.</Text>
                    </Group>
                    <Checkbox label="Reduced-motion / low-effects output" checked={draftConfig.motion.reducedMotion} onChange={(event) => setDraftConfig((current) => ({ ...current, motion: { ...current.motion, reducedMotion: event.currentTarget.checked }, output: { ...current.output, performanceMode: event.currentTarget.checked } }))} />
                    <Group justify="space-between">
                      <Button variant="default" leftSection={<Settings2 size={16} />} loading={saving} onClick={() => void saveDraft()}>Save draft</Button>
                      <Button color="green" leftSection={<Send size={16} />} loading={saving} onClick={() => void publish()}>Publish changes</Button>
                    </Group>
                  </>
                ) : <Text size="sm" c="dimmed">Select an event and create an overlay to enter the Studio.</Text>}
              </Stack>
            </Paper>

            {selectedOverlay?.state ? (
              <Stack gap="xs">
                <Select
                  label="Serving team"
                  data={[{ value: '', label: 'No serving indicator' }, ...selectedOverlay.state.presentationState.teams.filter((team) => team.id).map((team) => ({ value: team.id, label: team.displayName }))]}
                  value={selectedOverlay.state.presentationState.score.servingTeamId ?? ''}
                  disabled={saving}
                  onChange={(value) => void runCommand({ type: 'SET_SERVING_TEAM', eventTeamId: value || null })}
                />
                <BroadcastControlRoom
                  state={selectedOverlay.state}
                  disabled={saving}
                  lastActionId={lastBroadcastActionId}
                  onCommand={runCommand}
                />
              </Stack>
            ) : null}
          </Stack>

          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Text fw={700}>Exact program preview</Text>
                <Badge variant="light">{previewMode === 'live' ? 'Live config' : 'Draft config'}</Badge>
              </Group>
              {selectedOverlay ? (
                <iframe
                  title="Broadcast overlay preview"
                  src={`/broadcast-preview/${encodeURIComponent(selectedOverlay.id)}?mode=${previewMode}&score=${encodeURIComponent(previewScoreSignature)}`}
                  style={{ width: '100%', aspectRatio: '16 / 9', border: 0, background: 'linear-gradient(135deg, #334155, #0f172a)' }}
                />
              ) : <Text size="sm" c="dimmed">The preview uses the same isolated renderer as the OBS Program Overlay.</Text>}
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text fw={700} mb="xs">OBS Program Overlay</Text>
              <Text size="sm" c="dimmed" mb="sm">Set the OBS Base Canvas and Browser Source viewport to 1920×1080, use Transform → Fit to Screen, place the source above the camera, paste the unlisted Program URL, and leave refresh-on-scene-activation off for stable state.</Text>
              <Group>
                <Button leftSection={<Eye size={16} />} disabled={!selectedOverlay || selectedOverlay.status !== 'PUBLISHED'} loading={saving} onClick={() => void createProgramCapability()}>
                  Create Program URL
                </Button>
                {programUrl ? <Button variant="default" leftSection={<Copy size={16} />} onClick={() => void navigator.clipboard.writeText(programUrl)}>Copy URL</Button> : null}
              </Group>
              {programUrl ? <TextInput mt="sm" label="One-time Program URL" value={programUrl} readOnly /> : null}
              <Text size="xs" c="dimmed" mt="sm">Run the Control Room separately as an authenticated browser tab or OBS custom dock. Replay-buffer controls are available only when OBS exposes its browser-dock bridge.</Text>
            </Paper>
            <Button variant="subtle" leftSection={<RotateCw size={15} />} onClick={() => void reload()}>Reload broadcast workspace</Button>
          </Stack>
        </SimpleGrid>
      ) : null}
      {selectedEvent ? <Text size="xs" c="dimmed">Event ownership is checked by the manager APIs for {selectedEvent.name || selectedEvent.$id}; the Admin tab is only the pilot entry point.</Text> : null}
    </Stack>
  );
}
