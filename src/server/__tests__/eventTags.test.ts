jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  mergeDefaultEventTags,
  normalizeEventTypeTagInputs,
  normalizeEventTagInputs,
  slugifyEventTagName,
  syncEventTags,
  syncEventTypeTagsForEvent,
  withActiveEventCountsForTags,
} from '@/server/eventTags';

describe('event tag helpers', () => {
  it('normalizes typed tag input and de-duplicates by slug', () => {
    expect(normalizeEventTagInputs([
      '  League  ',
      { name: 'league' },
      { label: 'Pickup Game' },
      '',
      null,
    ])).toEqual(['League', 'Pickup Game']);
    expect(slugifyEventTagName('Pickup Game!')).toBe('pickup-game');
  });

  it('syncs required event type tags while removing stale event type tags', () => {
    expect(normalizeEventTypeTagInputs(['Pickup', 'Tournament'], { eventType: 'LEAGUE' }))
      .toEqual(['Pickup', 'League']);
    expect(normalizeEventTypeTagInputs(['Pickup', 'League'], { eventType: 'EVENT' }))
      .toEqual(['Pickup']);
    expect(normalizeEventTypeTagInputs(['Pickup', 'League']))
      .toEqual(['Pickup', 'League']);
  });

  it('returns persisted tag options only and de-duplicates persisted matches', () => {
    expect(mergeDefaultEventTags([], '').map((tag) => tag.slug)).toEqual([]);
    expect(mergeDefaultEventTags([], 'try').map((tag) => tag.slug)).toEqual([]);
    expect(mergeDefaultEventTags([
      { id: 'tag_tryouts', name: 'Tryouts', slug: 'tryouts', eventCount: 4 },
      { id: 'tag_tryouts_duplicate', name: 'Tryouts', slug: 'tryouts', eventCount: 1 },
    ], '')).toEqual([
      { id: 'tag_tryouts', name: 'Tryouts', slug: 'tryouts', eventCount: 4 },
    ]);
    expect(mergeDefaultEventTags([], 'league')).toEqual([]);
  });

  it('labels tag options with active event counts', async () => {
    const now = new Date('2026-07-07T12:00:00Z');
    const client = {
      eventTagAssignments: {
        findMany: jest.fn(async () => [
          { tagId: 'tag_tryouts', eventId: 'event_active_1' },
          { tagId: 'tag_tryouts', eventId: 'event_active_1' },
          { tagId: 'tag_tryouts', eventId: 'event_ended' },
          { tagId: 'tag_clinic', eventId: 'event_active_2' },
          { tagId: 'tag_clinic', eventId: 'event_private' },
        ]),
      },
      events: {
        findMany: jest.fn(async () => [
          { id: 'event_active_1' },
          { id: 'event_active_2' },
        ]),
      },
    };

    const tags = await withActiveEventCountsForTags([
      { id: 'tag_tryouts', name: 'Tryouts', slug: 'tryouts' },
      { id: 'tag_clinic', name: 'Clinic', slug: 'clinic' },
    ], client as any, now);

    expect(client.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        archivedAt: null,
        OR: [
          { state: 'PUBLISHED' },
          { state: null },
        ],
      }),
      select: { id: true },
    }));
    expect(tags).toEqual([
      { id: 'tag_tryouts', name: 'Tryouts', slug: 'tryouts', eventCount: 1 },
      { id: 'tag_clinic', name: 'Clinic', slug: 'clinic', eventCount: 1 },
    ]);
  });

  it('reuses tags by slug and syncs event assignments', async () => {
    const client = {
      eventTags: {
        upsert: jest.fn(async (args) => ({
          id: args.where.slug === 'league' ? 'tag_league' : 'tag_pickup',
          name: args.update.name,
          slug: args.where.slug,
        })),
      },
      eventTagAssignments: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const tags = await syncEventTags(
      'event_1',
      ['League', { name: 'league' }, { name: 'Pickup Game' }],
      client as any,
    );

    expect(client.eventTags.upsert).toHaveBeenCalledTimes(2);
    expect(client.eventTags.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { slug: 'league' },
      update: { name: 'League' },
    }));
    expect(tags.map((tag) => tag.id)).toEqual(['tag_league', 'tag_pickup']);
    expect(client.eventTagAssignments.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        tagId: { notIn: ['tag_league', 'tag_pickup'] },
      },
    });
    expect(client.eventTagAssignments.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          eventId: 'event_1',
          tagId: 'tag_league',
          tagNameSnapshot: 'League',
        }),
        expect.objectContaining({
          eventId: 'event_1',
          tagId: 'tag_pickup',
          tagNameSnapshot: 'Pickup Game',
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('recovers when concurrent custom tag creation hits an existing slug', async () => {
    const uniqueSlugError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const client = {
      eventTags: {
        upsert: jest.fn(async () => {
          throw uniqueSlugError;
        }),
        findUnique: jest.fn(async (args) => ({
          id: 'tag_pickup',
          name: 'Pickup Game',
          slug: args.where.slug,
        })),
      },
      eventTagAssignments: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const tags = await syncEventTags('event_1', ['Pickup Game'], client as any);

    expect(client.eventTags.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'pickup-game' },
    }));
    expect(client.eventTags.findUnique).toHaveBeenCalledWith({
      where: { slug: 'pickup-game' },
    });
    expect(tags).toEqual([
      { id: 'tag_pickup', name: 'Pickup Game', slug: 'pickup-game', isSystem: false },
    ]);
    expect(client.eventTagAssignments.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({
          eventId: 'event_1',
          tagId: 'tag_pickup',
          tagNameSnapshot: 'Pickup Game',
        }),
      ],
      skipDuplicates: true,
    }));
  });

  it('clears assignments when the event has no tags', async () => {
    const client = {
      eventTags: {
        upsert: jest.fn(),
      },
      eventTagAssignments: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await syncEventTags('event_1', [], client as any);

    expect(client.eventTagAssignments.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event_1' } });
    expect(client.eventTagAssignments.createMany).not.toHaveBeenCalled();
  });

  it('preserves custom tags while syncing event type assignments from existing tags', async () => {
    const client = {
      eventTags: {
        findMany: jest.fn(async () => [
          { id: 'tag_pickup', name: 'Pickup', slug: 'pickup' },
          { id: 'tag_league', name: 'League', slug: 'league' },
        ]),
        upsert: jest.fn(async (args) => ({
          id: args.where.slug === 'tournament' ? 'tag_tournament' : 'tag_pickup',
          name: args.update.name,
          slug: args.where.slug,
        })),
      },
      eventTagAssignments: {
        findMany: jest.fn(async () => [
          { eventId: 'event_1', tagId: 'tag_pickup' },
          { eventId: 'event_1', tagId: 'tag_league' },
        ]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const tags = await syncEventTypeTagsForEvent('event_1', 'TOURNAMENT', client as any);

    expect(tags.map((tag) => tag.slug)).toEqual(['pickup', 'tournament']);
    expect(client.eventTagAssignments.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        tagId: { notIn: ['tag_pickup', 'tag_tournament'] },
      },
    });
  });
});
