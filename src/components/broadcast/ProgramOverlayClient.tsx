'use client';

import BroadcastOverlayRenderer from './BroadcastOverlayRenderer';
import { usePresentationStream } from './usePresentationStream';

export default function ProgramOverlayClient({ overlayId }: { overlayId: string }) {
  const { config, state, event } = usePresentationStream(overlayId);
  if (!config || !state) {
    // OBS should remain transparent during initial connection or a recoverable
    // reconnect. Errors deliberately never become an on-air database message.
    return <main aria-label="BracketIQ Program Overlay" style={{ width: '100vw', height: '100vh', background: 'transparent' }} />;
  }
  return <BroadcastOverlayRenderer config={config} state={state} event={event} />;
}

