import {
  buildMatchRealtimeMessage,
  publishEventMatchChanges,
  type MatchRealtimeMessage,
} from '@/server/realtime/matchRealtime';

describe('match realtime broadcaster', () => {
  const realtimeGlobal = globalThis as typeof globalThis & {
    __mvpMatchRealtimeBroadcast?: (message: MatchRealtimeMessage) => number;
  };

  afterEach(() => {
    delete realtimeGlobal.__mvpMatchRealtimeBroadcast;
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
  });

  it('is a no-op when the custom server is not running', () => {
    expect(publishEventMatchChanges({
      eventId: 'event_1',
      matches: [{ id: 'match_1' }],
    })).toBe(0);
  });
});
