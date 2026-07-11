/**
 * The broadcast contract is intentionally independent of the internal Event,
 * Match, Team, and UserData DTOs. Everything sent to an unlisted program
 * overlay must be representable by these narrow, presentation-only types.
 */

export const BROADCAST_OVERLAY_ANCHORS = [
  'TOP_LEFT',
  'TOP_CENTER',
  'TOP_RIGHT',
  'CENTER_LEFT',
  'CENTER',
  'CENTER_RIGHT',
  'BOTTOM_LEFT',
  'BOTTOM_CENTER',
  'BOTTOM_RIGHT',
] as const;

export type BroadcastOverlayAnchor = (typeof BROADCAST_OVERLAY_ANCHORS)[number];

export const BROADCAST_STINGER_KINDS = [
  'MATCH_INTRO',
  'LOCATION',
  'SET_RESULT',
  'MATCH_RESULT',
] as const;

export type BroadcastStingerKind = (typeof BROADCAST_STINGER_KINDS)[number];

export const BROADCAST_OVERLAY_ACTION_TYPES = [
  'OVERLAY_CREATED',
  'OVERLAY_UPDATED',
  'PUBLISHED_CONFIG',
  'MATCH_SELECTED',
  'SCOREBOARD_VISIBILITY_CHANGED',
  'SERVE_CHANGED',
  'TIMEOUT_STATE_CHANGED',
  'STINGER_SHOWN',
  'STINGER_HIDDEN',
  'REPLAY_STATE_CHANGED',
  'MANUAL_OVERRIDE_ENTERED',
  'MANUAL_PRESENTATION_CHANGED',
  'RESUMED_AUTOMATIC',
  'BROADCAST_ACTION_UNDONE',
  'POINT_AWARDED',
  'SET_COMPLETED',
  'MATCH_CHANGED',
  'SNAPSHOT_REFRESH',
  'ACCESS_TOKEN_CREATED',
  'ACCESS_TOKEN_ROTATED',
  'ACCESS_TOKEN_REVOKED',
  'OVERLAY_ARCHIVED',
] as const;

export type BroadcastOverlayActionType = (typeof BROADCAST_OVERLAY_ACTION_TYPES)[number];

export type BroadcastOverlayConfigV1 = {
  version: 1;
  transform: {
    anchor: BroadcastOverlayAnchor;
    x: number;
    y: number;
    scale: number;
    maxWidth: number;
    safeArea: number;
    locked: boolean;
  };
  output: {
    preset: 'HD_1080P' | 'UHD_4K' | 'CUSTOM';
    customWidth: number | null;
    customHeight: number | null;
    performanceMode: boolean;
  };
  display: {
    showTeamLogos: boolean;
    showPlayerNames: boolean;
    showTimer: boolean;
    showSeeds: boolean;
    showCourtSwitchCue: boolean;
  };
  style: {
    surface: 'DARK' | 'LIGHT' | 'GLASS';
    contrastMode: 'AUTO' | 'HIGH';
    teamColorBehavior: 'AUTO' | 'OVERRIDE';
    font: 'ROBOTO_FLEX';
  };
  motion: {
    entrance: 'NONE' | 'FADE' | 'SLIDE';
    scoreChange: 'NONE' | 'PULSE' | 'RISE';
    intensity: 'SUBTLE' | 'STANDARD';
    reducedMotion: boolean;
  };
  teamOverrides: Record<string, {
    displayName?: string;
    shortName?: string;
    abbreviation?: string;
    color?: string;
  }>;
  stingers: {
    defaults: Record<BroadcastStingerKind, boolean>;
    enabledKinds: BroadcastStingerKind[];
  };
};

export type PresentationTeam = {
  id: string;
  displayName: string;
  shortName: string;
  abbreviation: string;
  playerNames: string[];
  logoUrl: string | null;
  accentColor: string;
  foregroundColor: string;
  seed: number | null;
};

export type PresentationSet = {
  sequence: number;
  team1Points: number;
  team2Points: number;
  target: number;
  complete: boolean;
  winnerTeamId: string | null;
};

export type MatchPresentationStateV1 = {
  version: 1;
  revision: number;
  status: 'NO_MATCH' | 'SCHEDULED' | 'LIVE' | 'FINAL' | 'UNKNOWN';
  event: {
    id: string;
    name: string;
    logoUrl: string | null;
    organizerName: string | null;
    organizerLogoUrl: string | null;
    venue: string | null;
    court: string | null;
  };
  competition: {
    sport: string;
    format: string;
    roundLabel: string | null;
    bestOf: number;
    setTargets: number[];
    winBy: number;
  };
  teams: [PresentationTeam, PresentationTeam];
  score: {
    currentSet: number;
    points: [number, number];
    setsWon: [number, number];
    sets: PresentationSet[];
    servingTeamId: string | null;
    timeoutsRemaining: Record<string, number>;
  };
  clock: {
    mode: 'STOPPED' | 'RUNNING' | 'PAUSED';
    startedAt: string | null;
    pausedAt: string | null;
    elapsedBeforePauseMs: number;
  };
  presentation: {
    scoreboardVisible: boolean;
    activeStinger: BroadcastStingerKind | null;
    replayState: 'UNAVAILABLE' | 'IDLE' | 'SAVED';
  };
  scoringMode: 'AUTOMATIC' | 'MANUAL_OVERRIDE';
};

export type BroadcastOverlayCommand =
  | { type: 'SELECT_MATCH'; expectedRevision: number; requestId: string; matchId: string | null }
  | { type: 'SET_VISIBILITY'; expectedRevision: number; requestId: string; visible: boolean }
  | { type: 'SET_SERVING_TEAM'; expectedRevision: number; requestId: string; eventTeamId: string | null }
  | { type: 'SET_TIMEOUT_STATE'; expectedRevision: number; requestId: string; timeoutsRemaining: Record<string, number> }
  | { type: 'SHOW_STINGER'; expectedRevision: number; requestId: string; stinger: BroadcastStingerKind }
  | { type: 'HIDE_STINGER'; expectedRevision: number; requestId: string }
  | { type: 'SET_REPLAY_STATE'; expectedRevision: number; requestId: string; replayState: 'UNAVAILABLE' | 'IDLE' | 'SAVED' }
  | { type: 'ENTER_MANUAL_OVERRIDE'; expectedRevision: number; requestId: string; reason: string }
  | {
    type: 'APPLY_MANUAL_PRESENTATION_CHANGE';
    expectedRevision: number;
    requestId: string;
    change: Partial<Pick<MatchPresentationStateV1, 'score' | 'presentation' | 'clock'>>;
  }
  | { type: 'RESUME_AUTOMATIC'; expectedRevision: number; requestId: string }
  | { type: 'UNDO_BROADCAST_ACTION'; expectedRevision: number; requestId: string; targetActionId: string };

export type BroadcastOverlayAction = {
  id: string;
  overlayId: string;
  organizationId: string | null;
  eventId: string;
  matchId: string | null;
  accessTokenId: string | null;
  actorUserId: string | null;
  actorKind: 'USER' | 'SYSTEM' | 'TOKEN';
  actionType: BroadcastOverlayActionType;
  baseRevision: number | null;
  presentationRevision: number;
  requestId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type BroadcastOverlayRealtimeEvent = {
  type: BroadcastOverlayActionType | 'SNAPSHOT';
  animate: boolean;
};

export type BroadcastOverlayRealtimeMessage =
  | { type: 'overlay.subscribed'; overlayId: string; revision: number }
  | {
    type: 'overlay.state';
    overlayId: string;
    revision: number;
    state: MatchPresentationStateV1;
    event: BroadcastOverlayRealtimeEvent;
  }
  | { type: 'overlay.revoked'; overlayId: string; accessTokenId: string };

export type BroadcastOverlaySocketTicket = {
  overlayId: string;
  accessTokenId: string;
  scope: 'broadcast-overlay-read';
};

