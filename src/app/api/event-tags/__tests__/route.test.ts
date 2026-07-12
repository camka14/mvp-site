const prismaMock = {
  eventTags: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const { GET } = require('@/app/api/event-tags/route');

describe('/api/event-tags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.eventTags.findMany.mockResolvedValue([
      {
        id: 'default_tag_tryouts',
        name: 'Tryouts',
        slug: 'tryouts',
        isSystem: true,
      },
    ]);
  });

  it('filters to system tags for discovery filter options', async () => {
    const response = await GET({
      nextUrl: new URL('http://localhost/api/event-tags?filterOnly=true'),
    } as any);
    const body = await response.json();

    expect(prismaMock.eventTags.findMany).toHaveBeenCalledWith({
      where: { isSystem: true },
      orderBy: { name: 'asc' },
    });
    expect(body.tags).toEqual([
      {
        id: 'default_tag_tryouts',
        name: 'Tryouts',
        slug: 'tryouts',
        isSystem: true,
        eventCount: 0,
      },
    ]);
  });

  it('keeps full tag options available for event create and edit', async () => {
    await GET({
      nextUrl: new URL('http://localhost/api/event-tags'),
    } as any);

    expect(prismaMock.eventTags.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
    });
  });
});
