'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BroadcastOverlayConfigV1,
  BroadcastOverlayRealtimeEvent,
  MatchPresentationStateV1,
} from '@/server/broadcast/types';

export type PresentationConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'revoked' | 'error';

type SnapshotPayload = {
  config: BroadcastOverlayConfigV1;
  state: MatchPresentationStateV1;
};

const SNAPSHOT_RECONCILIATION_INTERVAL_MS = 1_500;

const getCapabilityFromHash = (): string | null => {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
  return token?.trim() || null;
};

const websocketUrl = (ticket: string): string => {
  const url = new URL('/api/realtime/broadcast-overlays', window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
};

export function usePresentationStream(overlayId: string) {
  const [config, setConfig] = useState<BroadcastOverlayConfigV1 | null>(null);
  const [state, setState] = useState<MatchPresentationStateV1 | null>(null);
  const [event, setEvent] = useState<BroadcastOverlayRealtimeEvent | null>(null);
  const [connection, setConnection] = useState<PresentationConnectionState>('idle');
  const latestRevision = useRef(-1);
  const socketRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const disposedRef = useRef(false);
  const revokedRef = useRef(false);
  const capabilityRef = useRef<string | null>(null);

  const loadSnapshot = useCallback(async (): Promise<SnapshotPayload | null> => {
    const token = capabilityRef.current;
    if (!token) return null;
    const response = await fetch(`/api/public/broadcast-overlays/${encodeURIComponent(overlayId)}/snapshot`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401) {
        revokedRef.current = true;
        setConnection('revoked');
      }
      throw new Error('Overlay snapshot is unavailable.');
    }
    const payload = await response.json() as SnapshotPayload;
    if (!payload?.state || !payload?.config) throw new Error('Overlay snapshot is invalid.');
    latestRevision.current = payload.state.revision;
    setConfig(payload.config);
    setState(payload.state);
    setEvent({ type: 'SNAPSHOT', animate: false });
    return payload;
  }, [overlayId]);

  const scheduleReconnect = useCallback(() => {
    if (disposedRef.current || revokedRef.current) return;
    if (reconnectTimerRef.current !== null) return;
    retryCountRef.current += 1;
    const delay = Math.min(10_000, 450 * (2 ** Math.min(retryCountRef.current, 5)));
    setConnection('reconnecting');
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectRef.current?.();
    }, delay);
  }, []);

  const connect = useCallback(async () => {
    if (disposedRef.current || !capabilityRef.current) return;
    try {
      setConnection(retryCountRef.current ? 'reconnecting' : 'connecting');
      await loadSnapshot();
      if (disposedRef.current || !capabilityRef.current) return;
      const ticketResponse = await fetch(`/api/public/broadcast-overlays/${encodeURIComponent(overlayId)}/stream-token`, {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${capabilityRef.current}` },
      });
      if (!ticketResponse.ok) {
        if (ticketResponse.status === 401) {
          revokedRef.current = true;
          setConnection('revoked');
        }
        throw new Error('Overlay stream ticket is unavailable.');
      }
      const { ticket } = await ticketResponse.json() as { ticket?: string };
      if (!ticket) throw new Error('Overlay stream ticket is invalid.');
      const socket = new WebSocket(websocketUrl(ticket));
      socketRef.current = socket;
      socket.onopen = () => {
        retryCountRef.current = 0;
        setConnection('connected');
      };
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as {
            type?: string;
            overlayId?: string;
            revision?: number;
            state?: MatchPresentationStateV1;
            event?: BroadcastOverlayRealtimeEvent;
            accessTokenId?: string;
          };
          if (payload.overlayId !== overlayId) return;
          if (payload.type === 'overlay.revoked') {
            revokedRef.current = true;
            setConnection('revoked');
            socket.close();
            return;
          }
          if (payload.type !== 'overlay.state' || !payload.state || typeof payload.revision !== 'number') return;
          if (payload.revision <= latestRevision.current) return;
          if (payload.revision > latestRevision.current + 1) {
            void loadSnapshot().catch(() => scheduleReconnect());
            return;
          }
          latestRevision.current = payload.revision;
          setState(payload.state);
          setEvent(payload.event ?? { type: 'SNAPSHOT', animate: false });
        } catch {
          // Ignore malformed socket payloads; the next snapshot reconciles state.
        }
      };
      socket.onclose = () => {
        if (!disposedRef.current && !revokedRef.current) scheduleReconnect();
      };
      socket.onerror = () => socket.close();
    } catch {
      if (!disposedRef.current && !revokedRef.current) scheduleReconnect();
    }
  }, [loadSnapshot, overlayId, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
    return () => {
      if (connectRef.current === connect) connectRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    capabilityRef.current = getCapabilityFromHash();
    revokedRef.current = false;
    if (!capabilityRef.current) {
      setConnection('error');
      return undefined;
    }
    disposedRef.current = false;
    void connect();
    // Keep the program output correct when the score write originated in a
    // separate process that cannot fan out over this browser source's socket.
    // The protected snapshot rebuilds automatic scores from official match data.
    const reconciliationTimer = window.setInterval(() => {
      void loadSnapshot().catch(() => undefined);
    }, SNAPSHOT_RECONCILIATION_INTERVAL_MS);
    return () => {
      disposedRef.current = true;
      window.clearInterval(reconciliationTimer);
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  return { config, state, event, connection };
}
