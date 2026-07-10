const prismaMock = {
  organizationTags: {
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

const { GET } = require('@/app/api/organization-tags/route');

describe('/api/organization-tags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizationTags.findMany.mockResolvedValue([
      {
        id: 'default_org_tag_facility',
        name: 'Facility',
        slug: 'facility',
        isSystem: true,
      },
    ]);
  });

  it('filters to system tags for discovery filter options', async () => {
    const response = await GET({
      nextUrl: new URL('http://localhost/api/organization-tags?filterOnly=true'),
    } as any);
    const body = await response.json();

    expect(prismaMock.organizationTags.findMany).toHaveBeenCalledWith({
      where: { isSystem: true },
      orderBy: { name: 'asc' },
    });
    expect(body.tags).toEqual([
      {
        id: 'default_org_tag_facility',
        name: 'Facility',
        slug: 'facility',
        isSystem: true,
        organizationCount: 0,
      },
    ]);
  });

  it('keeps full tag options available for organization create and edit', async () => {
    await GET({
      nextUrl: new URL('http://localhost/api/organization-tags'),
    } as any);

    expect(prismaMock.organizationTags.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
    });
  });
});
