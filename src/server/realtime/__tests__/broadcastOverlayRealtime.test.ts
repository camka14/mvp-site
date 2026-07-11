jest.mock('@/lib/redis', () => ({
  getRedisClient: jest.fn(),
  getRedisKeyPrefix: jest.fn(() => 'bracketiq'),
}));

import { getRedisClient, type RedisClient } from '@/lib/redis';
import {
  buildBroadcastOverlayRealtimeRedisEnvelope,
  buildBroadcastOverlayStateMessage,
  parseBroadcastOverlayRealtimeMessage,
  publishBroadcastOverlayRevocation,
  publishBroadcastOverlayState,
  type BroadcastOverlayRealtimeRedisEnvelope,
} from '@/server/realtime/broadcastOverlayRealtime';
import type {
  BroadcastOverlayRealtimeMessage,
  MatchPresentationStateV1,
} from '@/server/broadcast/types';

const mockedGetRedisClient = getRedisClient as jest.MockedFunction<typeof getRedisClient>;

const buildState = (revision = 4): MatchPresentationStateV1 => ({
  version: 1,
  revision,
  status: 'LIVE',
  event: {
    id: 'event_1',
    name: 'Beach Open',
    logoUrl: null,
    organizerName: null,
    organizerLogoUrl: null,
    venue: 'Harbor Courts',
    court: 'Court 1',
  },
  competition: {
    sport: 'Beach Volleyball',
    format: 'Best of three',
    roundLabel: 'Final',
    bestOf: 3,
    setTargets: [21, 21, 15],
    winBy: 2,
  },
  teams: [
    {
      id: 'team_1',
      displayName: 'Harbor Strikers',
      shortName: 'Harbor',
      abbreviation: 'HBR',
      playerNames: ['Alex Rivera', 'Morgan Lee'],
      logoUrl: null,
      accentColor: '#124A9A',
      foregroundColor: '#FFFFFF',
      seed: 1,
    },
    {
      id: 'team_2',
      displayName: 'Cascade Crew',
      shortName: 'Cascade',
      abbreviation: 'CSC',
      playerNames: ['Taylor Kim', 'Jordan Chen'],
      logoUrl: null,
      accentColor: '#8D1C1C',
      foregroundColor: '#FFFFFF',
      seed: 2,
    },
  ],
  score: {
    currentSet: 1,
    points: [12, 10],
    setsWon: [0, 0],
    sets: [{
      sequence: 1,
      team1Points: 12,
      team2Points: 10,
      target: 21,
      complete: false,
      winnerTeamId: null,
    }],
    servingTeamId: 'team_1',
    timeoutsRemaining: {},
  },
  clock: {
    mode: 'RUNNING',
    startedAt: '2026-07-11T05:35:00.000Z',
    pausedAt: null,
    elapsedBeforePauseMs: 0,
  },
  presentation: {
    scoreboardVisible: true,
    activeStinger: null,
    replayState: 'IDLE',
  },
  scoringMode: 'AUTOMATIC',
});

describe('broadcast overlay realtime broadcaster', () => {
  const realtimeGlobal = globalThis as typeof globalThis & {
    __mvpBroadcastOverlayRealtimeBroadcast?: (message: BroadcastOverlayRealtimeMessage) => number;
    __mvpBroadcastOverlayRealtimeOriginId?: string;
  };
  const originalRedisDisabled = process.env.REDIS_DISABLED;

  beforeEach(() => {
    process.env.REDIS_DISABLED = 'true';
    mockedGetRedisClient.mockResolvedValue(null);
  });

  afterEach(() => {
    mockedGetRedisClient.mockReset();
    delete realtimeGlobal.__mvpBroadcastOverlayRealtimeBroadcast;
    delete realtimeGlobal.__mvpBroadcastOverlayRealtimeOriginId;
    if (originalRedisDisabled === undefined) {
      delete process.env.REDIS_DISABLED;
    } else {
      process.env.REDIS_DISABLED = originalRedisDisabled;
    }
  });

  it('builds a narrow revisioned state message', () => {
    expect(buildBroadcastOverlayStateMessage({
      overlayId: ' overlay_1 ',
      state: buildState(),
      event: { type: 'POINT_AWARDED', animate: true },
    })).toEqual({
      type: 'overlay.state',
      overlayId: 'overlay_1',
      revision: 4,
      state: buildState(),
      event: { type: 'POINT_AWARDED', animate: true },
    });
  });

  it('rejects messages outside the presentation-only contract', () => {
    expect(() => parseBroadcastOverlayRealtimeMessage({
      type: 'overlay.state',
      overlayId: 'overlay_1',
      revision: 3,
      state: buildState(4),
      event: { type: 'SNAPSHOT', animate: true },
      rawMatch: { players: [{ email: 'private@example.test' }] },
    })).toThrow();
  });

  it('wraps state messages in a Redis envelope with an origin id', () => {
    const message = buildBroadcastOverlayStateMessage({
      overlayId: 'overlay_1',
      state: buildState(),
      event: { type: 'SNAPSHOT', animate: false },
    });
    const envelope = buildBroadcastOverlayRealtimeRedisEnvelope(message, 'server_1');

    expect(envelope).toMatchObject<Partial<BroadcastOverlayRealtimeRedisEnvelope>>({
      version: 1,
      originId: 'server_1',
      message,
    });
    expect(new Date(envelope.sentAt).toString()).not.toBe('Invalid Date');
  });

  it('fans validated messages out through Redis when configured', async () => {
    const publish = jest.fn<Promise<number>, [string, string]>().mockResolvedValue(1);
    mockedGetRedisClient.mockResolvedValue({ publish } as unknown as RedisClient);

    const message = buildBroadcastOverlayStateMessage({
      overlayId: 'overlay_1',
      state: buildState(),
      event: { type: 'POINT_AWARDED', animate: true },
    });
    publishBroadcastOverlayState({
      overlayId: 'overlay_1',
      state: buildState(),
      event: { type: 'POINT_AWARDED', animate: true },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      'bracketiq:realtime:broadcast-overlays',
      expect.stringMatching(/^\{"version":1,/),
    );
    expect(JSON.parse(publish.mock.calls[0][1])).toMatchObject({
      originId: expect.any(String),
      message,
    });
  });

  it('publishes state through the process-local broadcaster when present', () => {
    const received: BroadcastOverlayRealtimeMessage[] = [];
    realtimeGlobal.__mvpBroadcastOverlayRealtimeBroadcast = (message) => {
      received.push(message);
      return 2;
    };

    expect(publishBroadcastOverlayState({
      overlayId: 'overlay_1',
      state: buildState(),
      event: { type: 'POINT_AWARDED', animate: true },
    })).toBe(2);
    expect(received).toEqual([{
      type: 'overlay.state',
      overlayId: 'overlay_1',
      revision: 4,
      state: buildState(),
      event: { type: 'POINT_AWARDED', animate: true },
    }]);
  });

  it('publishes revocations through the same local broadcaster', () => {
    const received: BroadcastOverlayRealtimeMessage[] = [];
    realtimeGlobal.__mvpBroadcastOverlayRealtimeBroadcast = (message) => {
      received.push(message);
      return 1;
    };

    expect(publishBroadcastOverlayRevocation({
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
    })).toBe(1);
    expect(received).toEqual([{
      type: 'overlay.revoked',
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
    }]);
  });

  it('is a no-op locally when the custom server is not running', () => {
    expect(publishBroadcastOverlayState({
      overlayId: 'overlay_1',
      state: buildState(),
      event: { type: 'SNAPSHOT', animate: false },
    })).toBe(0);
  });
});
