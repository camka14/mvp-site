/** @jest-environment node */

const getEventParticipantAggregatesMock = jest.fn();

jest.mock('@/server/events/eventRegistrations', () => ({
  getEventParticipantAggregates: (...args: unknown[]) => getEventParticipantAggregatesMock(...args),
}));

import { withEventAttendeeCounts } from '@/app/api/events/participantCounts';

describe('withEventAttendeeCounts', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('derives affiliate participant counts from source spots remaining text', async () => {
    getEventParticipantAggregatesMock.mockResolvedValue(new Map([
      ['affiliate_event', { participantCount: 0, participantCapacity: 14 }],
    ]));

    const [event] = await withEventAttendeeCounts([
      {
        id: 'affiliate_event',
        sourceType: 'AFFILIATE_IMPORT',
        statusText: '13 spots available',
        maxParticipants: 14,
      },
    ]);

    expect(event).toEqual(expect.objectContaining({
      attendees: 1,
      participantCount: 1,
      participantCapacity: 14,
    }));
  });

  it('keeps zero signed-up affiliate events at zero while preserving capacity', async () => {
    getEventParticipantAggregatesMock.mockResolvedValue(new Map([
      ['affiliate_event', { participantCount: 0, participantCapacity: 7 }],
    ]));

    const [event] = await withEventAttendeeCounts([
      {
        id: 'affiliate_event',
        sourceType: 'AFFILIATE_IMPORT',
        statusText: '7 spots available',
        maxParticipants: 7,
      },
    ]);

    expect(event).toEqual(expect.objectContaining({
      attendees: 0,
      participantCount: 0,
      participantCapacity: 7,
    }));
  });

  it('keeps normal event registration aggregates unchanged', async () => {
    getEventParticipantAggregatesMock.mockResolvedValue(new Map([
      ['normal_event', { participantCount: 3, participantCapacity: 10 }],
    ]));

    const [event] = await withEventAttendeeCounts([
      {
        id: 'normal_event',
        sourceType: null,
        statusText: '7 spots available',
        maxParticipants: 10,
      },
    ]);

    expect(event).toEqual(expect.objectContaining({
      attendees: 3,
      participantCount: 3,
      participantCapacity: 10,
    }));
  });
});
