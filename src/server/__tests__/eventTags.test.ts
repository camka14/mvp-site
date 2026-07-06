jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  mergeDefaultEventTags,
  normalizeEventTypeTagInputs,
  normalizeEventTagInputs,
  slugifyEventTagName,
  syncEventTags,
  syncEventTypeTagsForEvent,
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

  it('includes tryouts as a default tag option and de-duplicates persisted matches', () => {
    expect(mergeDefaultEventTags([], '').map((tag) => tag.slug)).toEqual(['tryouts']);
    expect(mergeDefaultEventTags([], 'try').map((tag) => tag.slug)).toEqual(['tryouts']);
    expect(mergeDefaultEventTags([
      { id: 'tag_tryouts', name: 'Tryouts', slug: 'tryouts' },
    ], '')).toEqual([
      { id: 'tag_tryouts', name: 'Tryouts', slug: 'tryouts' },
    ]);
    expect(mergeDefaultEventTags([], 'league')).toEqual([]);
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
