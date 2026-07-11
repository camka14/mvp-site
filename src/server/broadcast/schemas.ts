import { z } from 'zod';
import {
  BROADCAST_OVERLAY_ACTION_TYPES,
  BROADCAST_OVERLAY_ANCHORS,
  BROADCAST_STINGER_KINDS,
  type BroadcastOverlayCommand,
  type BroadcastOverlayConfigV1,
  type MatchPresentationStateV1,
} from './types';

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const broadcastOverlayConfigV1Schema = z.object({
  version: z.literal(1),
  transform: z.object({
    anchor: z.enum(BROADCAST_OVERLAY_ANCHORS),
    x: z.number().min(-1).max(1),
    y: z.number().min(-1).max(1),
    scale: z.number().min(0.75).max(1.25),
    maxWidth: z.number().int().min(320).max(1920),
    safeArea: z.number().min(0).max(0.2),
    locked: z.boolean(),
  }).strict(),
  output: z.object({
    preset: z.enum(['HD_1080P', 'UHD_4K', 'CUSTOM']),
    customWidth: z.number().int().min(320).max(7680).nullable(),
    customHeight: z.number().int().min(180).max(4320).nullable(),
    performanceMode: z.boolean(),
  }).strict(),
  display: z.object({
    showTeamLogos: z.boolean(),
    showPlayerNames: z.boolean(),
    showTimer: z.boolean(),
    showSeeds: z.boolean(),
    showCourtSwitchCue: z.boolean(),
  }).strict(),
  style: z.object({
    surface: z.enum(['DARK', 'LIGHT', 'GLASS']),
    contrastMode: z.enum(['AUTO', 'HIGH']),
    teamColorBehavior: z.enum(['AUTO', 'OVERRIDE']),
    font: z.literal('ROBOTO_FLEX'),
  }).strict(),
  motion: z.object({
    entrance: z.enum(['NONE', 'FADE', 'SLIDE']),
    scoreChange: z.enum(['NONE', 'PULSE', 'RISE']),
    intensity: z.enum(['SUBTLE', 'STANDARD']),
    reducedMotion: z.boolean(),
  }).strict(),
  teamOverrides: z.record(z.string(), z.object({
    displayName: boundedString(80).optional(),
    shortName: boundedString(36).optional(),
    abbreviation: boundedString(8).optional(),
    color: hexColor.optional(),
  }).strict()),
  stingers: z.object({
    defaults: z.object({
      MATCH_INTRO: z.boolean(),
      LOCATION: z.boolean(),
      SET_RESULT: z.boolean(),
      MATCH_RESULT: z.boolean(),
    }).strict(),
    enabledKinds: z.array(z.enum(BROADCAST_STINGER_KINDS)).max(BROADCAST_STINGER_KINDS.length),
  }).strict(),
}).strict();

const presentationTeamSchema = z.object({
  id: z.string(),
  displayName: z.string().max(80),
  shortName: z.string().max(36),
  abbreviation: z.string().max(8),
  playerNames: z.array(z.string().max(80)).max(2),
  logoUrl: z.string().max(2048).nullable(),
  accentColor: hexColor,
  foregroundColor: hexColor,
  seed: z.number().int().positive().nullable(),
}).strict();

const presentationSetSchema = z.object({
  sequence: z.number().int().positive(),
  team1Points: z.number().int().nonnegative(),
  team2Points: z.number().int().nonnegative(),
  target: z.number().int().positive(),
  complete: z.boolean(),
  winnerTeamId: z.string().nullable(),
}).strict();

export const matchPresentationStateV1Schema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  status: z.enum(['NO_MATCH', 'SCHEDULED', 'LIVE', 'FINAL', 'UNKNOWN']),
  event: z.object({
    id: z.string(),
    name: z.string().max(160),
    logoUrl: z.string().max(2048).nullable(),
    organizerName: z.string().max(160).nullable(),
    organizerLogoUrl: z.string().max(2048).nullable(),
    venue: z.string().max(240).nullable(),
    court: z.string().max(160).nullable(),
  }).strict(),
  competition: z.object({
    sport: z.string().max(100),
    format: z.string().max(100),
    roundLabel: z.string().max(160).nullable(),
    bestOf: z.number().int().positive(),
    setTargets: z.array(z.number().int().positive()).min(1).max(7),
    winBy: z.number().int().min(1).max(10),
  }).strict(),
  teams: z.tuple([presentationTeamSchema, presentationTeamSchema]),
  score: z.object({
    currentSet: z.number().int().nonnegative(),
    points: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    setsWon: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    sets: z.array(presentationSetSchema).max(7),
    servingTeamId: z.string().nullable(),
    timeoutsRemaining: z.record(z.string(), z.number().int().nonnegative()),
  }).strict(),
  clock: z.object({
    mode: z.enum(['STOPPED', 'RUNNING', 'PAUSED']),
    startedAt: z.string().datetime().nullable(),
    pausedAt: z.string().datetime().nullable(),
    elapsedBeforePauseMs: z.number().int().nonnegative(),
  }).strict(),
  presentation: z.object({
    scoreboardVisible: z.boolean(),
    activeStinger: z.enum(BROADCAST_STINGER_KINDS).nullable(),
    replayState: z.enum(['UNAVAILABLE', 'IDLE', 'SAVED']),
  }).strict(),
  scoringMode: z.enum(['AUTOMATIC', 'MANUAL_OVERRIDE']),
}).strict();

const commandEnvelopeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
});

export const broadcastOverlayCommandSchema = z.discriminatedUnion('type', [
  commandEnvelopeSchema.extend({ type: z.literal('SELECT_MATCH'), matchId: z.string().min(1).nullable() }),
  commandEnvelopeSchema.extend({ type: z.literal('SET_VISIBILITY'), visible: z.boolean() }),
  commandEnvelopeSchema.extend({ type: z.literal('SET_SERVING_TEAM'), eventTeamId: z.string().min(1).nullable() }),
  commandEnvelopeSchema.extend({
    type: z.literal('SET_TIMEOUT_STATE'),
    timeoutsRemaining: z.record(z.string().min(1), z.number().int().min(0).max(9)),
  }),
  commandEnvelopeSchema.extend({ type: z.literal('SHOW_STINGER'), stinger: z.enum(BROADCAST_STINGER_KINDS) }),
  commandEnvelopeSchema.extend({ type: z.literal('HIDE_STINGER') }),
  commandEnvelopeSchema.extend({ type: z.literal('SET_REPLAY_STATE'), replayState: z.enum(['UNAVAILABLE', 'IDLE', 'SAVED']) }),
  commandEnvelopeSchema.extend({ type: z.literal('ENTER_MANUAL_OVERRIDE'), reason: boundedString(500) }),
  commandEnvelopeSchema.extend({
    type: z.literal('APPLY_MANUAL_PRESENTATION_CHANGE'),
    change: z.object({
      score: matchPresentationStateV1Schema.shape.score.partial().optional(),
      presentation: matchPresentationStateV1Schema.shape.presentation.partial().optional(),
      clock: matchPresentationStateV1Schema.shape.clock.partial().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, 'At least one presentation value is required.'),
  }),
  commandEnvelopeSchema.extend({ type: z.literal('RESUME_AUTOMATIC') }),
  commandEnvelopeSchema.extend({ type: z.literal('UNDO_BROADCAST_ACTION'), targetActionId: z.string().min(1) }),
]);

export const broadcastOverlayActionTypeSchema = z.enum(BROADCAST_OVERLAY_ACTION_TYPES);

export const DEFAULT_BROADCAST_OVERLAY_CONFIG: BroadcastOverlayConfigV1 = {
  version: 1,
  transform: {
    anchor: 'TOP_LEFT',
    x: 0.035,
    y: 0.04,
    scale: 1,
    maxWidth: 760,
    safeArea: 0.035,
    locked: false,
  },
  output: {
    preset: 'HD_1080P',
    customWidth: null,
    customHeight: null,
    performanceMode: false,
  },
  display: {
    showTeamLogos: true,
    showPlayerNames: true,
    showTimer: false,
    showSeeds: true,
    showCourtSwitchCue: true,
  },
  style: {
    surface: 'DARK',
    contrastMode: 'AUTO',
    teamColorBehavior: 'AUTO',
    font: 'ROBOTO_FLEX',
  },
  motion: {
    entrance: 'FADE',
    scoreChange: 'PULSE',
    intensity: 'STANDARD',
    reducedMotion: false,
  },
  teamOverrides: {},
  stingers: {
    defaults: {
      MATCH_INTRO: true,
      LOCATION: true,
      SET_RESULT: true,
      MATCH_RESULT: true,
    },
    enabledKinds: [...BROADCAST_STINGER_KINDS],
  },
};

export const parseBroadcastOverlayConfig = (value: unknown): BroadcastOverlayConfigV1 => (
  broadcastOverlayConfigV1Schema.parse(value) as BroadcastOverlayConfigV1
);

export const parseMatchPresentationState = (value: unknown): MatchPresentationStateV1 => (
  matchPresentationStateV1Schema.parse(value) as MatchPresentationStateV1
);

export const parseBroadcastOverlayCommand = (value: unknown): BroadcastOverlayCommand => (
  broadcastOverlayCommandSchema.parse(value) as BroadcastOverlayCommand
);

