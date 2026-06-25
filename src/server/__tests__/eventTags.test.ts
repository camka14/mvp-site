jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  normalizeEventTagInputs,
  slugifyEventTagName,
  syncEventTags,
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
});
