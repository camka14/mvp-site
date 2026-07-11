import type { BroadcastOverlayRendererProps } from '../BroadcastOverlayRenderer';

/** Preview-only template placeholder; it consumes the shared sanitized contract. */
export default function CenterCourt({ state }: BroadcastOverlayRendererProps) {
  return <div aria-label="Center Court preview">{state.event.name}</div>;
}

