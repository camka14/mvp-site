const refreshBroadcastPresentationForEventMock = jest.fn();

jest.mock('@/server/broadcast/presentation', () => ({
  refreshBroadcastPresentationForEvent: (...args: unknown[]) => refreshBroadcastPresentationForEventMock(...args),
}));

import {
  buildMatchRealtimeRedisEnvelope,
  buildMatchRealtimeMessage,
  publishEventMatchChanges,
  type MatchRealtimeMessage,
} from '@/server/realtime/matchRealtime';

describe('match realtime broadcaster', () => {
  const realtimeGlobal = globalThis as typeof globalThis & {
    __mvpMatchRealtimeBroadcast?: (message: MatchRealtimeMessage) => number;
    __mvpMatchRealtimeOriginId?: string;
  };
  const originalRedisDisabled = process.env.REDIS_DISABLED;

  beforeEach(() => {
    process.env.REDIS_DISABLED = 'true';
    refreshBroadcastPresentationForEventMock.mockReset();
    refreshBroadcastPresentationForEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete realtimeGlobal.__mvpMatchRealtimeBroadcast;
    delete realtimeGlobal.__mvpMatchRealtimeOriginId;
    if (originalRedisDisabled === undefined) {
      delete process.env.REDIS_DISABLED;
    } else {
      process.env.REDIS_DISABLED = originalRedisDisabled;
    }
  });

  it('builds a normalized match changed message', () => {
    expect(buildMatchRealtimeMessage({
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
      deleted: [' match_2 ', '', 'match_2'],
      sentAt: '2026-05-12T00:00:00.000Z',
    })).toEqual({
      type: 'match.changed',
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
      deleted: ['match_2'],
      sentAt: '2026-05-12T00:00:00.000Z',
    });
  });

  it('wraps match changed messages in a Redis envelope with an origin id', () => {
    const message = buildMatchRealtimeMessage({
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
      sentAt: '2026-05-12T00:00:00.000Z',
    });
    const envelope = buildMatchRealtimeRedisEnvelope(message, 'server_1');

    expect(envelope).toMatchObject({
      version: 1,
      originId: 'server_1',
      message,
    });
    expect(new Date(envelope.sentAt).toString()).not.toBe('Invalid Date');
  });

  it('publishes through the process-local websocket broadcaster when present', () => {
    const received: MatchRealtimeMessage[] = [];
    realtimeGlobal.__mvpMatchRealtimeBroadcast = (message) => {
      received.push(message);
      return 2;
    };

    expect(publishEventMatchChanges({
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
      deleted: ['match_2'],
    })).toBe(2);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: 'match.changed',
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
      deleted: ['match_2'],
    });
    expect(refreshBroadcastPresentationForEventMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      changedMatchIds: ['match_1', 'match_2'],
      reason: 'MATCH_DELETE',
    });
  });

  it('is a no-op when the custom server is not running', () => {
    expect(publishEventMatchChanges({
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
    })).toBe(0);
  });
});
