jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  mergeOrganizationTags,
  normalizeOrganizationTagInputs,
  resolveSystemOrganizationTagIdsBySlugs,
  slugifyOrganizationTagName,
  syncOrganizationTags,
  withListedOrganizationCountsForTags,
} from '@/server/organizationTags';

describe('organization tag helpers', () => {
  it('normalizes typed tag input and de-duplicates by slug', () => {
    expect(normalizeOrganizationTagInputs([
      '  Facility  ',
      { name: 'facility' },
      { label: 'Event Manager' },
      '',
      null,
    ])).toEqual(['Facility', 'Event Manager']);
    expect(slugifyOrganizationTagName('Event Manager!')).toBe('event-manager');
  });

  it('returns persisted tag options only and de-duplicates persisted matches', () => {
    expect(mergeOrganizationTags([], '').map((tag) => tag.slug)).toEqual([]);
    expect(mergeOrganizationTags([
      { id: 'tag_facility', name: 'Facility', slug: 'facility', organizationCount: 4 },
      { id: 'tag_facility_duplicate', name: 'Facility', slug: 'facility', organizationCount: 1 },
    ], '')).toEqual([
      { id: 'tag_facility', name: 'Facility', slug: 'facility', organizationCount: 4 },
    ]);
  });

  it('labels tag options with listed organization counts', async () => {
    const client = {
      organizationTagAssignments: {
        findMany: jest.fn(async () => [
          { tagId: 'tag_facility', organizationId: 'org_listed_1' },
          { tagId: 'tag_facility', organizationId: 'org_listed_1' },
          { tagId: 'tag_facility', organizationId: 'org_unlisted' },
          { tagId: 'tag_club', organizationId: 'org_listed_2' },
        ]),
      },
      organizations: {
        findMany: jest.fn(async () => [
          { id: 'org_listed_1' },
          { id: 'org_listed_2' },
        ]),
      },
    };

    const tags = await withListedOrganizationCountsForTags([
      { id: 'tag_facility', name: 'Facility', slug: 'facility' },
      { id: 'tag_club', name: 'Club', slug: 'club' },
    ], client as any);

    expect(client.organizations.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['org_listed_1', 'org_unlisted', 'org_listed_2'] },
        status: 'LISTED',
      },
      select: { id: true },
    });
    expect(tags).toEqual([
      { id: 'tag_facility', name: 'Facility', slug: 'facility', organizationCount: 1 },
      { id: 'tag_club', name: 'Club', slug: 'club', organizationCount: 1 },
    ]);
  });

  it('reuses tags by slug and syncs organization assignments', async () => {
    const client = {
      organizationTags: {
        upsert: jest.fn(async (args) => ({
          id: args.where.slug === 'facility' ? 'tag_facility' : 'tag_club',
          name: args.update.name,
          slug: args.where.slug,
        })),
      },
      organizationTagAssignments: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const tags = await syncOrganizationTags(
      'org_1',
      ['Facility', { name: 'facility' }, { name: 'Club' }],
      client as any,
    );

    expect(client.organizationTags.upsert).toHaveBeenCalledTimes(2);
    expect(tags.map((tag) => tag.id)).toEqual(['tag_facility', 'tag_club']);
    expect(client.organizationTagAssignments.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        tagId: { notIn: ['tag_facility', 'tag_club'] },
      },
    });
    expect(client.organizationTagAssignments.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          organizationId: 'org_1',
          tagId: 'tag_facility',
          tagNameSnapshot: 'Facility',
        }),
        expect.objectContaining({
          organizationId: 'org_1',
          tagId: 'tag_club',
          tagNameSnapshot: 'Club',
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('recovers when concurrent custom tag creation hits an existing slug', async () => {
    const uniqueSlugError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const client = {
      organizationTags: {
        upsert: jest.fn(async () => {
          throw uniqueSlugError;
        }),
        findUnique: jest.fn(async (args) => ({
          id: 'tag_facility',
          name: 'Facility',
          slug: args.where.slug,
        })),
      },
      organizationTagAssignments: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const tags = await syncOrganizationTags('org_1', ['Facility'], client as any);

    expect(client.organizationTags.findUnique).toHaveBeenCalledWith({
      where: { slug: 'facility' },
    });
    expect(tags).toEqual([
      { id: 'tag_facility', name: 'Facility', slug: 'facility', isSystem: false },
    ]);
  });

  it('resolves only system tags for filter slugs', async () => {
    const client = {
      organizationTags: {
        findMany: jest.fn(async () => [
          { id: 'tag_facility' },
        ]),
      },
    };

    const tagIds = await resolveSystemOrganizationTagIdsBySlugs(['Facility', 'custom'], client as any);

    expect(client.organizationTags.findMany).toHaveBeenCalledWith({
      where: {
        slug: { in: ['facility', 'custom'] },
        isSystem: true,
      },
      select: { id: true },
    });
    expect(tagIds).toEqual(['tag_facility']);
  });
});
