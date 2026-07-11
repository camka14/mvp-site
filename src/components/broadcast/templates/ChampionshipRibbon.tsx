import type { BroadcastOverlayRendererProps } from '../BroadcastOverlayRenderer';

/** Preview-only template placeholder; it consumes the shared sanitized contract. */
export default function ChampionshipRibbon({ state }: BroadcastOverlayRendererProps) {
  return <div aria-label="Championship Ribbon preview">{state.competition.roundLabel || 'Championship'}</div>;
}

