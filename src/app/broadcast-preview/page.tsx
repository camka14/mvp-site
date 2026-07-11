import BroadcastOverlayRenderer from '@/components/broadcast/BroadcastOverlayRenderer';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG } from '@/server/broadcast/schemas';
import { createEmptyMatchPresentationState } from '@/server/broadcast/presentation';

export const dynamic = 'force-dynamic';

/** Safe fixture retained only for transparent-shell and visual regression QA. */
export default function BroadcastPreviewShellPage() {
  const state = createEmptyMatchPresentationState({
    eventId: 'preview',
    eventName: 'River City Beach Open',
    organizerName: 'River City Sports Club',
    venue: 'Riverside Courts',
  });
  state.status = 'LIVE';
  state.teams[0] = { ...state.teams[0], id: 'summit', displayName: 'Summit United', shortName: 'Summit', abbreviation: 'SUM' };
  state.teams[1] = { ...state.teams[1], id: 'harbor', displayName: 'Harbor Strikers', shortName: 'Harbor', abbreviation: 'HBR' };
  state.score = {
    ...state.score,
    currentSet: 2,
    points: [18, 16],
    setsWon: [1, 0],
    servingTeamId: 'summit',
    sets: [
      { sequence: 1, team1Points: 21, team2Points: 17, target: 21, complete: true, winnerTeamId: 'summit' },
      { sequence: 2, team1Points: 18, team2Points: 16, target: 21, complete: false, winnerTeamId: null },
    ],
  };
  return <BroadcastOverlayRenderer config={DEFAULT_BROADCAST_OVERLAY_CONFIG} state={state} preview />;
}
