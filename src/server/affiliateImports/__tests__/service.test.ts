/** @jest-environment node */

const prismaMock = {
  affiliateImportCandidates: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  affiliateScrapeMappings: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  affiliateScrapeRuns: {
    create: jest.fn(),
    update: jest.fn(),
  },
  affiliateScrapeSources: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  sports: {
    findFirst: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  canonicalTeams: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  facilities: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
};

let idCounter = 0;

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({
  createId: () => {
    idCounter += 1;
    return `generated_${idCounter}`;
  },
}));
jest.mock('@/server/geocoding', () => ({
  geocodeAddressToCoordinates: jest.fn(),
}));

import {
  deleteAffiliateCandidate,
  listAffiliateCandidates,
  publishAffiliateCandidate,
  reclassifyAffiliateCandidate,
  runAffiliateSourceScrape,
} from '@/server/affiliateImports/service';
import { geocodeAddressToCoordinates } from '@/server/geocoding';

const geocodeAddressToCoordinatesMock = jest.mocked(geocodeAddressToCoordinates);

describe('affiliate import service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    idCounter = 0;
    geocodeAddressToCoordinatesMock.mockResolvedValue(null);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.divisions.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.divisions.upsert.mockImplementation(async ({ create }) => create);
    prismaMock.events.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.canonicalTeams.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.facilities.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.organizations.findFirst.mockResolvedValue(null);
    prismaMock.organizations.upsert.mockImplementation(async ({ create, update }) => ({
      ...create,
      ...update,
    }));
    prismaMock.organizations.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('deletes affiliate candidates and their backing target rows', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      title: 'Published affiliate event',
      publishedEventId: 'event_1',
      publishedTeamId: 'team_1',
      publishedFacilityId: 'facility_1',
      publishedOrganizationId: 'club_org_1',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      organizationId: 'source_org_1',
    });
    prismaMock.affiliateImportCandidates.delete.mockResolvedValue({
      id: 'candidate_1',
      title: 'Published affiliate event',
      publishedEventId: 'event_1',
      publishedTeamId: 'team_1',
      publishedFacilityId: 'facility_1',
    });

    const deleted = await deleteAffiliateCandidate('candidate_1');

    expect(deleted.id).toBe('candidate_1');
    expect(prismaMock.divisions.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event_1' } });
    expect(prismaMock.events.deleteMany).toHaveBeenCalledWith({ where: { id: 'event_1' } });
    expect(prismaMock.canonicalTeams.deleteMany).toHaveBeenCalledWith({ where: { id: 'team_1' } });
    expect(prismaMock.facilities.deleteMany).toHaveBeenCalledWith({ where: { id: 'facility_1' } });
    expect(prismaMock.organizations.deleteMany).toHaveBeenCalledWith({ where: { id: 'club_org_1' } });
    expect(prismaMock.affiliateImportCandidates.delete).toHaveBeenCalledWith({
      where: { id: 'candidate_1' },
    });
  });

  it('does not list published affiliate candidates by default', async () => {
    prismaMock.affiliateImportCandidates.findMany.mockResolvedValue([]);

    await listAffiliateCandidates();

    expect(prismaMock.affiliateImportCandidates.findMany).toHaveBeenCalledWith({
      where: {
        NOT: { status: 'PUBLISHED' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });

  it('lists published affiliate candidates only when explicitly requested', async () => {
    prismaMock.affiliateImportCandidates.findMany.mockResolvedValue([]);

    await listAffiliateCandidates({ status: 'published' });

    expect(prismaMock.affiliateImportCandidates.findMany).toHaveBeenCalledWith({
      where: {
        status: 'PUBLISHED',
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });

  it('throws when deleting a missing affiliate candidate', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);

    await expect(deleteAffiliateCandidate('missing_candidate')).rejects.toThrow(
      'Affiliate import candidate not found.',
    );
    expect(prismaMock.affiliateImportCandidates.delete).not.toHaveBeenCalled();
  });

  it('runs manual evergreen mappings without falling back to the body selector candidate', async () => {
    const manualCandidates = [
      {
        title: 'Troutdale Indoor Sports Adult Soccer Leagues',
        officialActionUrl: 'https://www.troutdaleindoorsports.com/adult',
        sourceUrl: 'https://www.troutdaleindoorsports.com/adult',
        sportName: 'Indoor Soccer',
        venueName: 'Troutdale Indoor Sports',
        address: '1255 NE 8th St, Gresham, OR 97030',
        scheduleText: 'No fixed start date. Check the official page for current adult league sessions and availability.',
        dateDisplayMode: 'NO_FIXED_DATE' as const,
        dateDisplayText: 'No fixed start date',
        priceText: '$850 per 8-week team session.',
      },
      {
        title: 'Troutdale Indoor Sports Youth Soccer League',
        officialActionUrl: 'https://www.troutdaleindoorsports.com/youth',
        sourceUrl: 'https://www.troutdaleindoorsports.com/youth',
        sportName: 'Indoor Soccer',
        venueName: 'Troutdale Indoor Sports',
        address: '1255 NE 8th St, Gresham, OR 97030',
        scheduleText: 'No fixed start date. Check the official page for youth league availability.',
        dateDisplayMode: 'NO_FIXED_DATE' as const,
        dateDisplayText: 'No fixed start date',
        priceText: '$530 flat fee per team for 8 games.',
      },
      {
        title: "Troutdale Indoor Sports Men's Basketball League",
        officialActionUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        sourceUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        sportName: 'Basketball',
        venueName: 'Troutdale Indoor Sports',
        address: '1255 NE 8th St, Gresham, OR 97030',
        scheduleText: 'No fixed start date. Check the official page for current basketball league availability.',
        dateDisplayMode: 'NO_FIXED_DATE' as const,
        dateDisplayText: 'No fixed start date',
        priceText: '$850 flat fee per 7-week session.',
      },
      {
        title: 'Troutdale Indoor Sports Indoor Soccer Friendly Match',
        officialActionUrl: 'https://www.troutdaleindoorsports.com/adult',
        sourceUrl: 'https://www.troutdaleindoorsports.com/adult',
        sportName: 'Indoor Soccer',
        venueName: 'Troutdale Indoor Sports',
        address: '1255 NE 8th St, Gresham, OR 97030',
        scheduleText: 'Friendly games available, $75 per game. Call for availability.',
        dateDisplayMode: 'NO_FIXED_DATE' as const,
        dateDisplayText: 'Call for availability',
        priceText: '$75 per game',
      },
      {
        listingKind: 'RENTAL' as const,
        title: 'Troutdale Indoor Sports Field and Court Rentals',
        officialActionUrl: 'https://nattyhatty.com/114/bookings',
        sourceUrl: 'https://nattyhatty.com/114/bookings',
        sportName: 'Indoor sports',
        venueName: 'Troutdale Indoor Sports',
        address: '1255 NE 8th St, Gresham, OR 97030',
        scheduleText: 'Use the official booking calendar for current field and court availability.',
        dateDisplayMode: 'ONGOING' as const,
        dateDisplayText: 'Ongoing rental availability',
      },
    ];
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_troutdale',
      name: 'Troutdale Indoor Sports Programs',
      sourceKey: 'troutdale-indoor-sports-programs',
      activeMappingId: 'mapping_troutdale',
      listUrl: 'https://www.troutdaleindoorsports.com/',
      organizationId: 'org_troutdale',
    });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_troutdale',
      sourceId: 'source_troutdale',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://www.troutdaleindoorsports.com/',
        itemSelector: 'body',
        fields: {
          title: {
            selector: 'body',
            mode: 'literal',
            value: 'Troutdale Indoor Sports Programs',
          },
          officialActionUrl: {
            selector: 'body',
            mode: 'literal',
            value: 'https://www.troutdaleindoorsports.com/',
          },
        },
        dedupe: {
          fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
        },
        manualCandidates,
      },
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_troutdale', ownerId: 'owner_1' });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      ...data,
    }));
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.facilities.upsert.mockImplementation(async ({ create }) => ({ ...create }));
    prismaMock.sports.findFirst.mockImplementation(async ({ where }) => ({
      id: String(where.name.equals).toLowerCase().includes('basketball') ? 'sport_basketball' : 'sport_indoor_soccer',
    }));

    const result = await runAffiliateSourceScrape('source_troutdale', {
      client: {
        fetchPage: async () => ({
          url: 'https://www.troutdaleindoorsports.com/',
          finalUrl: 'https://www.troutdaleindoorsports.com/',
          statusCode: 200,
          fetchedAt: '2026-07-01T12:00:00.000Z',
          body: '<html><body>Troutdale Indoor Sports Programs</body></html>',
        }),
      },
    });

    expect(result.run).toEqual(expect.objectContaining({
      itemCount: 5,
      candidateCount: 5,
      logs: expect.objectContaining({
        rejectedCount: 0,
        createdCandidateCount: 5,
      }),
    }));
    expect(prismaMock.affiliateImportCandidates.create).toHaveBeenCalledTimes(5);
    expect(prismaMock.events.create).toHaveBeenCalledTimes(4);
    expect(prismaMock.facilities.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Troutdale Indoor Sports Adult Soccer Leagues',
        start: new Date('2099-12-31T12:00:00.000Z'),
        end: null,
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'No fixed start date',
        price: 85000,
        priceText: '$850.00',
        description: 'Pricing details: $850 per 8-week team session.',
      }),
    });
    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Troutdale Indoor Sports Indoor Soccer Friendly Match',
        start: new Date('2099-12-31T12:00:00.000Z'),
        end: null,
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Call for availability',
        price: 7500,
        priceText: '$75.00',
        description: 'Pricing details: $75 per game',
      }),
    });
    expect(prismaMock.events.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Troutdale Indoor Sports Programs',
      }),
    });
    expect(prismaMock.facilities.upsert).toHaveBeenCalledWith({
      where: { id: 'affiliate_facility_troutdale_indoor_sports_programs_troutdale_indoor_sports_field_and_court_rentals' },
      create: expect.objectContaining({
        id: 'affiliate_facility_troutdale_indoor_sports_programs_troutdale_indoor_sports_field_and_court_rentals',
        organizationId: 'org_troutdale',
        name: 'Troutdale Indoor Sports Field and Court Rentals',
        location: 'Troutdale Indoor Sports',
        address: '1255 NE 8th St, Gresham, OR 97030',
        affiliateUrl: 'https://nattyhatty.com/114/bookings',
        status: 'DRAFT',
      }),
      update: expect.objectContaining({
        organizationId: 'org_troutdale',
        name: 'Troutdale Indoor Sports Field and Court Rentals',
        affiliateUrl: 'https://nattyhatty.com/114/bookings',
        status: 'DRAFT',
      }),
    });
  });

  it('uses explicit manual candidate divisions when creating affiliate events', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_gpsd',
      name: 'Greater Portland Soccer District',
      sourceKey: 'gpsd-adult-soccer-seasons',
      activeMappingId: 'mapping_gpsd',
      listUrl: 'https://www.gpsdsoccer.com/about/gpsd-seasons',
      organizationId: 'org_gpsd',
    });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_gpsd',
      sourceId: 'source_gpsd',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://www.gpsdsoccer.com/about/gpsd-seasons',
        itemSelector: 'body',
        fields: {
          title: {
            selector: 'body',
            mode: 'literal',
            value: 'GPSD Fall Adult Outdoor Soccer League',
          },
          officialActionUrl: {
            selector: 'body',
            mode: 'literal',
            value: 'https://www.gpsdsoccer.com/team-mgmt/',
          },
        },
        manualCandidates: [
          {
            title: 'GPSD Fall Adult Outdoor Soccer League',
            officialActionUrl: 'https://www.gpsdsoccer.com/team-mgmt/',
            sourceUrl: 'https://www.gpsdsoccer.com/about/gpsd-seasons',
            sportName: 'Grass Soccer',
            dateDisplayMode: 'NO_FIXED_DATE',
            dateDisplayText: 'Seasonal registration',
            priceText: 'From $1,695 per team',
            divisions: [
              {
                name: 'Open',
                gender: 'C',
                ratingType: 'AGE',
                divisionTypeId: '18plus',
                priceCents: 229500,
              },
              {
                name: 'Over 65',
                gender: 'C',
                ratingType: 'AGE',
                divisionTypeId: '65plus',
                priceCents: 169500,
              },
            ],
          },
        ],
      },
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_gpsd', ownerId: 'owner_1' });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      ...data,
    }));
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_soccer' });

    await runAffiliateSourceScrape('source_gpsd', {
      client: {
        fetchPage: async () => ({
          url: 'https://www.gpsdsoccer.com/about/gpsd-seasons',
          finalUrl: 'https://www.gpsdsoccer.com/about/gpsd-seasons',
          statusCode: 200,
          fetchedAt: '2026-07-04T12:00:00.000Z',
          body: '<html><body>GPSD seasons</body></html>',
        }),
      },
    });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'GPSD Fall Adult Outdoor Soccer League',
        price: 169500,
        priceText: '$1695.00 - $2295.00',
        description: 'Pricing details: From $1,695 per team',
        singleDivision: false,
        registrationByDivisionType: true,
        dateDisplayMode: 'NO_FIXED_DATE',
      }),
    });
    expect(prismaMock.divisions.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        name: 'Open',
        price: 229500,
        divisionTypeId: '18plus',
        ratingType: 'AGE',
        gender: 'C',
      }),
    }));
    expect(prismaMock.divisions.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        name: 'Over 65',
        price: 169500,
        divisionTypeId: '65plus',
        ratingType: 'AGE',
        gender: 'C',
      }),
    }));
  });

  it('reclassifies a scraped candidate and creates the matching target draft', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      listingKind: 'EVENT',
      title: 'Community Team Registration',
      sportName: 'Indoor Soccer',
      divisionText: "Men's D3",
      ageGroup: 'Adult 14+',
      participantOptionsText: '20 players',
      officialActionUrl: 'https://example.com/register',
      sourceUrl: 'https://example.com/source',
      status: 'DISCOVERED',
      publishedEventId: 'event_1',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.canonicalTeams.findFirst.mockResolvedValue(null);
    prismaMock.canonicalTeams.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));

    const result = await reclassifyAffiliateCandidate('candidate_1', 'TEAM');

    expect(prismaMock.canonicalTeams.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Example Source Community Team Registration',
        division: "Men's D3",
        divisionTypeId: 'skill_d3_age_14plus',
        visibility: 'ADMIN_ONLY',
        affiliateUrl: 'https://example.com/register',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_1' },
      data: expect.objectContaining({
        listingKind: 'TEAM',
        publishedEventId: null,
        publishedTeamId: expect.any(String),
        publishedFacilityId: null,
      }),
    });
    expect(prismaMock.divisions.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event_1' } });
    expect(prismaMock.events.deleteMany).toHaveBeenCalledWith({ where: { id: 'event_1' } });
    expect(result.candidate.listingKind).toBe('TEAM');
  });

  it('does not reclassify to event when the scraped candidate is missing a source start date', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      listingKind: 'TEAM',
      title: 'Missing Date Event',
      officialActionUrl: 'https://example.com/register',
      sourceUrl: 'https://example.com/source',
      status: 'DISCOVERED',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });

    await expect(reclassifyAffiliateCandidate('candidate_1', 'EVENT')).rejects.toThrow(
      'Affiliate event candidates must include a valid start date from the source.',
    );
    expect(prismaMock.affiliateImportCandidates.update).not.toHaveBeenCalled();
    expect(prismaMock.events.create).not.toHaveBeenCalled();
  });

  it('reclassifies no-fixed-date program candidates into evergreen affiliate events', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      listingKind: 'TEAM',
      title: 'Indoor Soccer Friendly Match',
      sportName: 'Indoor Soccer',
      venueName: 'Troutdale Indoor Sports',
      city: 'Troutdale, OR',
      scheduleText: 'Friendly games available. Call for availability.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Call for availability',
      priceText: '$75 per game',
      officialActionUrl: 'https://example.com/friendly-games',
      sourceUrl: 'https://example.com/source',
      status: 'DISCOVERED',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_indoor_soccer' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));

    const result = await reclassifyAffiliateCandidate('candidate_1', 'EVENT');

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Indoor Soccer Friendly Match',
        start: new Date('2099-12-31T12:00:00.000Z'),
        end: null,
        scheduleText: 'Friendly games available. Call for availability.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Call for availability',
        price: 7500,
        priceText: '$75.00',
        affiliateUrl: 'https://example.com/friendly-games',
        eventType: 'EVENT',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_1' },
      data: expect.objectContaining({
        listingKind: 'EVENT',
        publishedEventId: expect.any(String),
        publishedTeamId: null,
        publishedFacilityId: null,
      }),
    });
    expect(result.candidate.listingKind).toBe('EVENT');
  });

  it('publishes event candidates as real hostless affiliate events', async () => {
    geocodeAddressToCoordinatesMock.mockResolvedValue([-122.387, 45.539]);
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      listingKind: 'EVENT',
      title: "Men's Basketball League",
      organizerName: 'Troutdale Indoor Sports',
      sportName: 'Basketball',
      venueName: 'Troutdale Indoor Sports',
      city: 'Troutdale',
      address: '819 NW Corporate Dr, Troutdale, OR 97060',
      startsAt: new Date('2099-07-01T18:00:00.000Z'),
      endsAt: null,
      timeZone: null,
      scheduleText: 'Friday and Sunday games.',
      priceText: '$850 per team.',
      statusText: 'Confirm current session.',
      officialActionUrl: 'https://www.troutdaleindoorsports.com/baksetball',
      sourceUrl: 'https://www.troutdaleindoorsports.com/baksetball',
      description: 'Indoor basketball league.',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Troutdale Indoor Sports',
      organizationId: 'org_troutdale',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_troutdale' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_basketball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_1' });

    const event = await publishAffiliateCandidate('candidate_1', { publishedByUserId: 'admin_1' });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'generated_1',
        eventType: 'LEAGUE',
        state: 'PUBLISHED',
        hostId: null,
        imageId: null,
        organizationId: 'org_troutdale',
        address: '819 NW Corporate Dr, Troutdale, OR 97060',
        coordinates: [-122.387, 45.539],
        affiliateUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        sourceType: 'AFFILIATE_IMPORT',
        sourceId: 'candidate_1',
        sourceUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        organizerName: 'Troutdale Indoor Sports',
        scheduleText: 'Friday and Sunday games.',
        description: 'Indoor basketball league.\n\nPricing details: $850 per team.',
        priceText: '$850.00',
        statusText: 'Confirm current session.',
        sportId: 'sport_basketball',
      }),
    });
    expect(geocodeAddressToCoordinatesMock).toHaveBeenCalledWith('819 NW Corporate Dr, Troutdale, OR 97060');
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_1' },
      data: {
        status: 'PUBLISHED',
        publishedEventId: 'generated_1',
      },
    });
    expect(event).toEqual(expect.objectContaining({
      id: 'generated_1',
      eventType: 'LEAGUE',
      hostId: null,
      organizationId: 'org_troutdale',
    }));
  });

  it('falls back to venue plus address when the plain affiliate event address does not geocode', async () => {
    geocodeAddressToCoordinatesMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([-122.801, 45.488]);
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_venue_address',
      sourceId: 'source_1',
      listingKind: 'EVENT',
      title: 'Thursday Team Play',
      organizerName: 'Rose City Volleyball',
      sportName: 'Indoor Volleyball',
      venueName: 'Beaverton Hoop YMCA',
      city: 'Beaverton, OR',
      address: '9685 SW Harvest Court',
      startsAt: new Date('2099-07-01T18:00:00.000Z'),
      endsAt: null,
      officialActionUrl: 'https://www.portlandbasketball.com/rosecityvb.php',
      sourceUrl: 'https://www.portlandbasketball.com/rosecityvb.php',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Rose City Volleyball',
      organizationId: 'org_rose_city_volleyball',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_rose_city_volleyball' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_indoor_volleyball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_venue_address' });

    await publishAffiliateCandidate('candidate_venue_address', { publishedByUserId: 'admin_1' });

    expect(geocodeAddressToCoordinatesMock).toHaveBeenNthCalledWith(1, '9685 SW Harvest Court, Beaverton, OR');
    expect(geocodeAddressToCoordinatesMock).toHaveBeenNthCalledWith(2, 'Beaverton Hoop YMCA, 9685 SW Harvest Court, Beaverton, OR');
    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coordinates: [-122.801, 45.488],
      }),
    });
  });

  it('reuses an existing affiliate event occurrence when a later scrape candidate is published', async () => {
    geocodeAddressToCoordinatesMock.mockResolvedValue([-122.539, 45.387]);
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_duplicate',
      sourceId: 'source_1',
      listingKind: 'EVENT',
      title: 'Sunday Open Gym',
      organizerName: 'Rose City Volleyball',
      sportName: 'Indoor Volleyball',
      venueName: 'Columbia Christian School',
      city: 'Portland',
      address: '205 NE 92nd Avenue Portland',
      startsAt: new Date('2099-07-05T21:00:00.000Z'),
      endsAt: null,
      scheduleText: 'Sunday, 2:00 PM.',
      priceText: '$11.00',
      officialActionUrl: 'https://example.com/open-gym',
      sourceUrl: 'https://example.com/source',
      description: 'Traditional open gym.',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Rose City Volleyball',
      organizationId: 'org_rose_city_volleyball',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_rose_city_volleyball' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_indoor_volleyball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing_event',
        state: 'PUBLISHED',
        sourceId: 'candidate_original',
        coordinates: [-122.539, 45.387],
      });
    prismaMock.events.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_duplicate' });

    const event = await publishAffiliateCandidate('candidate_duplicate', { publishedByUserId: 'admin_1' });

    expect(prismaMock.events.create).not.toHaveBeenCalled();
    expect(prismaMock.events.update).toHaveBeenCalledWith({
      where: { id: 'existing_event' },
      data: expect.objectContaining({
        sourceId: 'candidate_original',
        name: 'Sunday Open Gym',
        affiliateUrl: 'https://example.com/open-gym',
        price: 1100,
        state: 'PUBLISHED',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_duplicate' },
      data: {
        status: 'PUBLISHED',
        publishedEventId: 'existing_event',
      },
    });
    expect(event).toEqual(expect.objectContaining({ id: 'existing_event' }));
  });

  it('uses only the scraped source blurb as the event description', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_blurb',
      sourceId: 'source_portland_basketball',
      listingKind: 'EVENT',
      title: '12:00 PM - Zero referees COOPERATIVE game- 54 minutes 5v5 Full Court',
      organizerName: 'Portland Basketball',
      sportName: 'Basketball',
      venueName: 'Columbia Christian School',
      city: 'Portland',
      address: '205 NE 92nd Avenue Portland',
      startsAt: new Date('2099-06-27T19:00:00.000Z'),
      scheduleText: '12:00 PM - Zero referees COOPERATIVE game- 54 minutes 5v5 Full Court',
      priceText: '$13.00',
      statusText: '7 spots available',
      description: 'Regular city league basketball game with referees- male or female welcome- 50 minutes 5v5 Full Court.',
      maxParticipantsText: 'Regular city league basketball game with referees- male or female welcome- 50 minutes 5v5 Full Court.',
      currentParticipantsText: '0',
      spotsRemainingText: '7 spots available',
      officialActionUrl: 'https://www.portlandbasketball.com/picktoplay.php',
      sourceUrl: 'https://www.portlandbasketball.com/picktoplay.php',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_portland_basketball',
      name: 'Portland Basketball',
      organizationId: 'org_portland_basketball',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_portland_basketball' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_basketball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_blurb' });

    await publishAffiliateCandidate('candidate_blurb', { publishedByUserId: 'admin_1' });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Regular city league basketball game with referees- male or female welcome- 50 minutes 5v5 Full Court.',
        scheduleText: '12:00 PM - Zero referees COOPERATIVE game- 54 minutes 5v5 Full Court',
        priceText: '$13.00',
        statusText: '7 spots available',
        maxParticipants: 7,
      }),
    });
  });

  it('parses adult over-age phrases without using event times as ages', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_masters',
      sourceId: 'source_portland_basketball',
      listingKind: 'EVENT',
      title: '6:00 PM - MASTERS GAME- WOMEN of ANY AGE and MEN ages 40 and over',
      organizerName: 'Portland Basketball',
      sportName: 'Basketball',
      venueName: 'Columbia Christian School',
      city: 'Portland',
      address: '205 NE 92nd Avenue, Portland, OR',
      startsAt: new Date('2099-07-01T01:00:00.000Z'),
      endsAt: null,
      divisionText: 'MASTERS GAME',
      officialActionUrl: 'https://www.portlandbasketball.com/picktoplay.php',
      sourceUrl: 'https://www.portlandbasketball.com/picktoplay.php',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_portland_basketball',
      name: 'Portland Basketball',
      organizationId: 'org_portland_basketball',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_portland_basketball' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_basketball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_masters' });

    await publishAffiliateCandidate('candidate_masters', { publishedByUserId: 'admin_1' });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        minAge: 40,
        maxAge: null,
      }),
    });
    expect(prismaMock.events.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        minAge: 6,
      }),
    });
    expect(prismaMock.divisions.upsert).toHaveBeenCalledWith({
      where: { id: 'generated_1__division__c_skill_masters_game_age_40plus' },
      create: expect.objectContaining({
        id: 'generated_1__division__c_skill_masters_game_age_40plus',
        eventId: 'generated_1',
        organizationId: 'org_portland_basketball',
        sportId: 'sport_basketball',
        name: 'MASTERS GAME',
        key: 'c_skill_masters_game_age_40plus',
        divisionTypeId: 'skill_masters_game_age_40plus',
        gender: 'C',
      }),
      update: expect.objectContaining({
        name: 'MASTERS GAME',
        key: 'c_skill_masters_game_age_40plus',
        divisionTypeId: 'skill_masters_game_age_40plus',
        gender: 'C',
      }),
    });
  });

  it('treats x-plus division labels as age divisions', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_lake_oswego_30',
      sourceId: 'source_lake_oswego',
      listingKind: 'EVENT',
      title: "Lake Oswego Summer Adult Basketball League - Men's 30+",
      organizerName: 'Lake Oswego Parks & Recreation',
      sportName: 'Basketball',
      venueName: 'Lake Oswego Recreation and Aquatics Center',
      city: 'Lake Oswego, OR',
      address: '17525 Stafford Rd, Lake Oswego, OR 97034',
      startsAt: new Date('2099-07-12T19:00:00.000Z'),
      endsAt: new Date('2099-09-14T03:00:00.000Z'),
      divisionText: "Men's 30+",
      ageGroup: "Men's 30+",
      priceText: '$101 resident regular per-player fee',
      officialActionUrl: 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search/detail/26642',
      sourceUrl: 'https://www.ci.oswego.or.us/parksrec/adult-basketball-league-0',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_lake_oswego',
      name: 'Lake Oswego Adult Basketball',
      organizationId: 'org_lake_oswego',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_lake_oswego' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_basketball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_lake_oswego_30' });

    await publishAffiliateCandidate('candidate_lake_oswego_30', { publishedByUserId: 'admin_1' });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        minAge: 30,
        maxAge: null,
      }),
    });
    expect(prismaMock.divisions.upsert).toHaveBeenCalledWith({
      where: { id: expect.stringContaining('30plus') },
      create: expect.objectContaining({
        eventId: 'generated_1',
        organizationId: 'org_lake_oswego',
        sportId: 'sport_basketball',
        name: "Men's 30+",
        key: expect.stringContaining('30plus'),
        divisionTypeId: expect.stringContaining('30plus'),
        gender: 'M',
        price: 10100,
        maxParticipants: null,
        ageCutoffLabel: "Men's 30+",
      }),
      update: expect.objectContaining({
        name: "Men's 30+",
        key: expect.stringContaining('30plus'),
        divisionTypeId: expect.stringContaining('30plus'),
        gender: 'M',
        price: 10100,
        maxParticipants: null,
      }),
    });
  });

  it('parses source age ranges into min and max ages', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_eastside_camp',
      sourceId: 'source_eastside',
      listingKind: 'EVENT',
      title: 'All-Sports & Crafts Camp: Ages 5-8',
      organizerName: 'Eastside Timbers',
      sportName: 'Other',
      venueName: 'Oregon Premier Futsal',
      city: 'Clackamas, OR',
      address: '12402 SE Jennifer St, Unit 190, Clackamas, OR 97015',
      startsAt: new Date('2099-07-06T16:00:00.000Z'),
      endsAt: new Date('2099-07-10T19:00:00.000Z'),
      ageGroup: 'Ages 5-8',
      priceText: '$100',
      officialActionUrl: 'https://app.upperhand.io/customers/2207-eastside-timbers-dba-oregon-premier-futsal/events/196365',
      sourceUrl: 'https://www.eastsidetimbers.com/indoorcamps',
      publishedEventId: null,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_eastside',
      name: 'Eastside Indoor Camps at OPF',
      organizationId: 'org_eastside',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_eastside' });
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'Other' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_eastside_camp' });

    await publishAffiliateCandidate('candidate_eastside_camp', { publishedByUserId: 'admin_1' });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sportId: 'Other',
        minAge: 5,
        maxAge: 8,
      }),
    });
  });

  it('requires event sources to be linked to an organization before publishing', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      listingKind: 'EVENT',
      title: 'Affiliate event',
      officialActionUrl: 'https://example.com/register',
      sourceUrl: 'https://example.com/event',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      organizationId: null,
    });

    await expect(publishAffiliateCandidate('candidate_1')).rejects.toThrow(
      'Affiliate source must be linked to a private organization before affiliate rows can be created.',
    );
    expect(prismaMock.events.create).not.toHaveBeenCalled();
  });

  it('requires a source-provided future event start before publishing an affiliate event', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      sourceId: 'source_1',
      listingKind: 'EVENT',
      title: 'Affiliate event',
      startsAt: null,
      officialActionUrl: 'https://example.com/register',
      sourceUrl: 'https://example.com/event',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });

    await expect(publishAffiliateCandidate('candidate_1')).rejects.toThrow(
      'Affiliate event candidates must include a valid start date from the source.',
    );
    expect(prismaMock.events.create).not.toHaveBeenCalled();
  });

  it('skips scraped event candidates with missing or past start dates', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      activeMappingId: 'mapping_1',
      listUrl: 'https://example.com/events',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_1',
      sourceId: 'source_1',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://example.com/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl' },
          startsAt: { selector: '.start', transform: 'dateTime' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.sports.findFirst.mockResolvedValue(null);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://example.com/events',
        finalUrl: 'https://example.com/events',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: `
          <div class="event">
            <span class="title">Future league</span>
            <span class="start">2099-01-01T18:00:00.000Z</span>
            <a href="/future">Register</a>
          </div>
          <div class="event">
            <span class="title">Past league</span>
            <span class="start">2000-01-01T18:00:00.000Z</span>
            <a href="/past">Register</a>
          </div>
          <div class="event">
            <span class="title">Missing date league</span>
            <a href="/missing">Register</a>
          </div>
        `,
      })),
    };

    const result = await runAffiliateSourceScrape('source_1', { client });

    expect(result.candidates).toHaveLength(1);
    expect(prismaMock.affiliateImportCandidates.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.affiliateImportCandidates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Future league',
        startsAt: new Date('2099-01-01T18:00:00.000Z'),
      }),
    });
    expect(prismaMock.events.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.affiliateScrapeRuns.update).toHaveBeenLastCalledWith({
      where: { id: 'run_1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        itemCount: 3,
        candidateCount: 1,
        logs: expect.objectContaining({
          createdCandidateCount: 1,
          updatedCandidateCount: 0,
          rejectedCount: 2,
        }),
      }),
    });
  });

  it('reports existing scraped candidates separately from newly created candidates', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      activeMappingId: 'mapping_1',
      listUrl: 'https://example.com/events',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_1',
      sourceId: 'source_1',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://example.com/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl' },
          startsAt: { selector: '.start', transform: 'dateTime' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_existing',
      publishedEventId: null,
      publishedTeamId: null,
      publishedFacilityId: null,
      status: 'DISCOVERED',
    });
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.sports.findFirst.mockResolvedValue(null);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://example.com/events',
        finalUrl: 'https://example.com/events',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: `
          <div class="event">
            <span class="title">Future league</span>
            <span class="start">2099-01-01T18:00:00.000Z</span>
            <a href="/future">Register</a>
          </div>
        `,
      })),
    };

    await runAffiliateSourceScrape('source_1', { client });

    expect(prismaMock.affiliateImportCandidates.create).not.toHaveBeenCalled();
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_existing' },
      data: expect.objectContaining({
        title: 'Future league',
      }),
    });
    expect(prismaMock.affiliateScrapeRuns.update).toHaveBeenLastCalledWith({
      where: { id: 'run_1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        itemCount: 1,
        candidateCount: 1,
        logs: expect.objectContaining({
          createdCandidateCount: 0,
          updatedCandidateCount: 1,
          rejectedCount: 0,
        }),
      }),
    });
  });

  it('rejects evergreen tryout candidates instead of creating stale affiliate events', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_tryouts',
      name: 'Example Club Tryouts',
      activeMappingId: 'mapping_tryouts',
      listUrl: 'https://example.com/tryouts',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_tryouts',
      sourceId: 'source_tryouts',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://example.com/tryouts',
        itemSelector: 'body',
        fields: {
          title: { selector: 'body', mode: 'literal', value: 'Example tryouts' },
          officialActionUrl: {
            selector: 'body',
            mode: 'literal',
            value: 'https://example.com/tryouts',
          },
        },
        manualCandidates: [
          {
            title: 'Example Club Tryouts',
            officialActionUrl: 'https://example.com/tryouts',
            sourceUrl: 'https://example.com/tryouts',
            sportName: 'Volleyball',
            dateDisplayMode: 'NO_FIXED_DATE',
            dateDisplayText: 'Dates not posted',
            scheduleText: 'Tryouts are not currently up to date.',
          },
        ],
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_tryouts' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_tryouts', ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const result = await runAffiliateSourceScrape('source_tryouts', {
      client: {
        fetchPage: async () => ({
          url: 'https://example.com/tryouts',
          finalUrl: 'https://example.com/tryouts',
          statusCode: 200,
          fetchedAt: '2026-07-06T12:00:00.000Z',
          body: '<html><body>Example Club Tryouts</body></html>',
        }),
      },
    });

    expect(result.candidates).toHaveLength(0);
    expect(prismaMock.affiliateImportCandidates.create).not.toHaveBeenCalled();
    expect(prismaMock.events.create).not.toHaveBeenCalled();
    expect(result.run).toEqual(expect.objectContaining({
      itemCount: 1,
      candidateCount: 0,
      logs: expect.objectContaining({
        rejectedCount: 1,
        rejectionSummary: { 'tryouts cannot be evergreen': 1 },
      }),
    }));
  });

  it('merges configured detail-page fields into scraped candidates before persistence', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      activeMappingId: 'mapping_1',
      listUrl: 'https://example.com/events',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_1',
      sourceId: 'source_1',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://example.com/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: {
            selector: '.register',
            mode: 'attribute',
            attribute: 'href',
            transform: 'absoluteUrl',
          },
          sourceUrl: {
            selector: '.title',
            mode: 'attribute',
            attribute: 'href',
            transform: 'absoluteUrl',
          },
          startsAt: { selector: '.start', transform: 'dateTime' },
        },
        detailPage: {
          urlField: 'sourceUrl',
          requestDelayMs: 0,
          fields: {
            description: { selector: '.description' },
            priceText: { selector: '.price', transform: 'priceText' },
            maxParticipantsText: { selector: '.capacity' },
          },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.sports.findFirst.mockResolvedValue(null);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async ({ url }: { url: string }) => {
        if (url === 'https://example.com/events/future') {
          return {
            url,
            finalUrl: url,
            statusCode: 200,
            fetchedAt: '2026-06-26T00:00:00.000Z',
            body: `
              <article>
                <div class="description">Organizer-provided league details.</div>
                <div class="price">$120.00 per team</div>
                <div class="capacity">16 Teams</div>
              </article>
            `,
          };
        }
        return {
          url: 'https://example.com/events',
          finalUrl: 'https://example.com/events',
          statusCode: 200,
          fetchedAt: '2026-06-26T00:00:00.000Z',
          body: `
            <div class="event">
              <a class="title" href="/events/future">Future league</a>
              <span class="start">2099-01-01T18:00:00.000Z</span>
              <a class="register" href="/register/future">Register</a>
            </div>
          `,
        };
      }),
    };

    await runAffiliateSourceScrape('source_1', { client });

    expect(client.fetchPage).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/events' }));
    expect(client.fetchPage).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/events/future' }));
    expect(prismaMock.affiliateImportCandidates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Future league',
        description: 'Organizer-provided league details.',
        priceText: '$120.00 per team',
        rawPayload: expect.objectContaining({
          detailPage: expect.objectContaining({
            extractedFields: expect.objectContaining({
              maxParticipantsText: '16 Teams',
            }),
          }),
        }),
      }),
    });
    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Organizer-provided league details.\n\nPricing details: $120.00 per team',
        priceText: '$120.00',
        price: 12000,
        maxParticipants: 16,
      }),
    });
  });

  it('keeps source-labeled class rows as individual affiliate events', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      activeMappingId: 'mapping_1',
      listUrl: 'https://example.com/events',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_1',
      sourceId: 'source_1',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://example.com/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: {
            selector: '.register',
            mode: 'attribute',
            attribute: 'href',
            transform: 'absoluteUrl',
          },
          startsAt: { selector: '.start', transform: 'dateTime' },
          formatLabel: { selector: ':scope', mode: 'literal', value: 'class' },
          priceText: { selector: '.price' },
          description: { selector: '.description' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.sports.findFirst.mockResolvedValue(null);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://example.com/events',
        finalUrl: 'https://example.com/events',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: `
          <div class="event">
            <span class="title">Summer Skillz</span>
            <span class="start">2099-07-06T18:00:00.000Z</span>
            <span class="price">Individual Type Price $80.00</span>
            <p class="description">Skill development with league-style games.</p>
            <a class="register" href="/register/skillz">Register</a>
          </div>
        `,
      })),
    };

    await runAffiliateSourceScrape('source_1', { client });

    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Summer Skillz',
        eventType: 'EVENT',
        teamSignup: false,
        teamSizeLimit: 1,
        price: 8000,
      }),
    });
  });

  it('skips scraped event candidates after a source registration deadline has passed', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      name: 'Example Source',
      activeMappingId: 'mapping_1',
      listUrl: 'https://example.com/events',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_1',
      sourceId: 'source_1',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://example.com/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl' },
          startsAt: { selector: '.start', transform: 'dateTime' },
          registrationDeadlineText: { selector: '.deadline' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_1' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_1', ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://example.com/events',
        finalUrl: 'https://example.com/events',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: `
          <div class="event">
            <span class="title">Future league with closed registration</span>
            <span class="start">2099-01-01T18:00:00.000Z</span>
            <span class="deadline">June 21, 2000</span>
            <a href="/future">Register</a>
          </div>
        `,
      })),
    };

    const result = await runAffiliateSourceScrape('source_1', { client });

    expect(result.candidates).toHaveLength(0);
    expect(prismaMock.affiliateImportCandidates.create).not.toHaveBeenCalled();
    expect(prismaMock.events.create).not.toHaveBeenCalled();
    expect(prismaMock.affiliateScrapeRuns.update).toHaveBeenLastCalledWith({
      where: { id: 'run_1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        itemCount: 1,
        candidateCount: 0,
      }),
    });
  });

  it('creates source-derived divisions for scraped affiliate event cards', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_rose_city',
      name: 'Rose City Futsal',
      activeMappingId: 'mapping_rose_city',
      listUrl: 'https://rosecityfutsal.com/registration/',
      organizationId: 'org_rose_city',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_rose_city' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_rose_city',
      sourceId: 'source_rose_city',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://rosecityfutsal.com/registration/',
        itemSelector: '.registration-card',
        itemTextIncludes: ['RCF Summer Adult League', 'Adult League Team'],
        fields: {
          title: { selector: 'h2', required: true },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl', required: true },
          sportName: { selector: ':scope', mode: 'literal', value: 'Indoor Soccer' },
          venueName: { selector: '.venue' },
          priceText: { selector: '.price' },
          description: { selector: '.description' },
          registrationDeadlineText: { selector: '.deadline', regex: 'Registration Deadline:\\s*(.+)$' },
          ageGroup: { selector: '.age' },
          divisionText: { selector: '.level' },
          startsAt: { selector: '.date-range', transform: 'dateTime' },
          endsAt: { selector: '.date-range', transform: 'dateRangeEnd' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_rose_city' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_rose_city', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_indoor_soccer' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.divisions.deleteMany.mockResolvedValue({});
    prismaMock.divisions.upsert.mockImplementation(async ({ create }) => ({ ...create }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://rosecityfutsal.com/registration/',
        finalUrl: 'https://rosecityfutsal.com/registration/',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: `
          <article class="registration-card">
            <h2>Men's D3 - Adult League Team - RCF Summer Adult League</h2>
            <span class="price">$675</span>
            <span class="venue">RCF EAST</span>
            <p class="description">Register a full team for the summer adult league.</p>
            <p class="deadline">Registration Deadline: June 21, 2099</p>
            <span class="age">Adult 14+</span>
            <span class="level">Men's D3</span>
            <span class="date-range">July 6, 2099 - August 23, 2099</span>
            <a href="/register/d3">Register</a>
          </article>
        `,
      })),
    };

    const result = await runAffiliateSourceScrape('source_rose_city', { client });

    expect(result.candidates).toHaveLength(1);
    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Men's D3 - Adult League Team - RCF Summer Adult League",
        eventType: 'LEAGUE',
        description: expect.stringContaining('Register a full team for the summer adult league.'),
        priceText: '$675.00',
        minAge: 14,
        maxAge: null,
        maxParticipants: null,
        singleDivision: false,
        registrationByDivisionType: true,
        teamSignup: true,
        affiliateUrl: 'https://rosecityfutsal.com/register/d3',
      }),
    });
    expect(prismaMock.divisions.upsert).toHaveBeenCalledWith({
      where: { id: 'generated_3__division__m_skill_d3_age_14plus' },
      create: expect.objectContaining({
        id: 'generated_3__division__m_skill_d3_age_14plus',
        eventId: 'generated_3',
        organizationId: 'org_rose_city',
        sportId: 'sport_indoor_soccer',
        name: "Men's D3",
        key: 'm_skill_d3_age_14plus',
        divisionTypeId: 'skill_d3_age_14plus',
        gender: 'M',
        price: 67500,
        maxParticipants: null,
        ageCutoffLabel: 'Adult 14+',
      }),
      update: expect.objectContaining({
        name: "Men's D3",
        key: 'm_skill_d3_age_14plus',
        divisionTypeId: 'skill_d3_age_14plus',
        gender: 'M',
        price: 67500,
        maxParticipants: null,
      }),
    });
  });

  it('treats softball tournament imports as team registrations', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_softball',
      name: 'Portland Metro Softball Association',
      sourceKey: 'portland-softball-current-programs',
      activeMappingId: 'mapping_softball',
      listUrl: 'https://www.portlandsoftball.com/current-programs',
      organizationId: 'affiliate_org_portland_metro_softball_association',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'affiliate_org_portland_metro_softball_association',
      ownerId: 'owner_1',
    });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_softball',
      sourceId: 'source_softball',
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://www.portlandsoftball.com/current-programs',
        itemSelector: '.program',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: '.info', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl', required: true },
          sportName: { selector: ':scope', mode: 'literal', value: 'Softball' },
          priceText: { selector: '.price' },
          description: { selector: '.description' },
          startsAt: { selector: '.start', transform: 'dateTime' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_softball' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_softball', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.sports.findFirst.mockResolvedValue({ id: 'sport_softball' });
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.events.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://www.portlandsoftball.com/current-programs',
        finalUrl: 'https://www.portlandsoftball.com/current-programs',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: `
          <section class="program">
            <h2 class="title">Saving 2nd Base - Fall 2026</h2>
            <p class="description">Coed softball tournament with Men, Women, and Coed divisions, doubleheaders, and a double-elimination playoff.</p>
            <span class="price">$400.00</span>
            <time class="start">2099-09-11T17:00:00.000Z</time>
            <a class="info" href="/current-programs/more-info">More Info</a>
          </section>
        `,
      })),
    };

    const result = await runAffiliateSourceScrape('source_softball', { client });

    expect(result.candidates).toHaveLength(1);
    expect(prismaMock.events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Saving 2nd Base - Fall 2026',
        eventType: 'TOURNAMENT',
        sportId: 'sport_softball',
        priceText: '$400.00',
        teamSignup: true,
        teamSizeLimit: 10,
        affiliateUrl: 'https://www.portlandsoftball.com/current-programs/more-info',
      }),
    });
  });

  it('creates admin-only canonical teams for scraped team candidates', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_teams',
      name: 'Rose City Futsal',
      sourceKey: 'rose-city-futsal-community-teams',
      activeMappingId: 'mapping_teams',
      listUrl: 'https://rosecityfutsal.com/adult-soccer-teams-in-portland/',
      organizationId: 'org_rose_city',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_rose_city', ownerId: 'owner_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_teams',
      sourceId: 'source_teams',
      mapping: {
        kind: 'TEAM',
        listUrl: 'https://rosecityfutsal.com/adult-soccer-teams-in-portland/',
        itemSelector: '.team',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: {
            selector: ':scope',
            mode: 'literal',
            value: 'https://rosecityfutsal.com/registration/?league_type=Community+Team',
            transform: 'absoluteUrl',
          },
          sportName: { selector: ':scope', mode: 'literal', value: 'Indoor Soccer' },
          ageGroup: { selector: ':scope', mode: 'literal', value: 'Adult 14+' },
          divisionText: { selector: ':scope', mode: 'literal', value: "Men's D3" },
          participantOptionsText: { selector: ':scope', mode: 'literal', value: '20 players' },
          startsAt: { selector: '.start', transform: 'dateTime' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_teams' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_teams', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.canonicalTeams.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findFirst.mockResolvedValue(null);
    prismaMock.canonicalTeams.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://rosecityfutsal.com/adult-soccer-teams-in-portland/',
        finalUrl: 'https://rosecityfutsal.com/adult-soccer-teams-in-portland/',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: '<div class="team"><span class="title">Fall 2026</span><span class="start">2099-08-17T00:00:00.000Z</span></div>',
      })),
    };

    const result = await runAffiliateSourceScrape('source_teams', { client });

    expect(result.candidates).toHaveLength(1);
    expect(prismaMock.canonicalTeams.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Rose City Futsal Fall 2026',
        division: "Men's D3",
        divisionTypeId: 'skill_d3_age_14plus',
        sport: 'Indoor Soccer',
        teamSize: 20,
        organizationId: 'org_rose_city',
        createdBy: 'owner_1',
        openRegistration: true,
        joinPolicy: 'OPEN_REGISTRATION',
        visibility: 'ADMIN_ONLY',
        affiliateUrl: 'https://rosecityfutsal.com/registration/?league_type=Community+Team',
        sourceType: 'AFFILIATE_IMPORT',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenLastCalledWith({
      where: { id: 'generated_2' },
      data: { publishedTeamId: 'generated_3' },
    });
  });

  it('publishes affiliate team candidates by making the canonical team public', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_team',
      sourceId: 'source_teams',
      listingKind: 'TEAM',
      title: 'Fall 2026',
      sportName: 'Indoor Soccer',
      divisionText: 'Community Team',
      participantOptionsText: '20 players',
      officialActionUrl: 'https://rosecityfutsal.com/registration/?league_type=Community+Team',
      sourceUrl: 'https://rosecityfutsal.com/adult-soccer-teams-in-portland/',
      publishedTeamId: 'team_existing',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_teams',
      name: 'Rose City Futsal',
      organizationId: 'org_rose_city',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_rose_city', ownerId: 'owner_1' });
    prismaMock.canonicalTeams.findUnique.mockResolvedValue({ id: 'team_existing', visibility: 'ADMIN_ONLY' });
    prismaMock.canonicalTeams.update.mockImplementation(async ({ data }) => ({ id: 'team_existing', ...data }));
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_team' });

    const team = await publishAffiliateCandidate('candidate_team', { publishedByUserId: 'admin_1' });

    expect(prismaMock.canonicalTeams.update).toHaveBeenCalledWith({
      where: { id: 'team_existing' },
      data: expect.objectContaining({
        visibility: 'PUBLIC',
        affiliateUrl: 'https://rosecityfutsal.com/registration/?league_type=Community+Team',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_team' },
      data: {
        status: 'PUBLISHED',
        publishedTeamId: 'team_existing',
      },
    });
    expect(team).toEqual(expect.objectContaining({ id: 'team_existing', visibility: 'PUBLIC' }));
  });

  it('creates unlisted public-page organizations for club scrape candidates', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_clubs',
      name: 'Portland Juniors Clubs',
      sourceKey: 'portland-juniors-clubs',
      activeMappingId: 'mapping_clubs',
      listUrl: 'https://example.com/clubs',
      organizationId: 'source_org',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'source_org',
      ownerId: 'owner_1',
      coordinates: [-122.6765, 45.5231],
    });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_clubs',
      sourceId: 'source_clubs',
      mapping: {
        kind: 'CLUB',
        listUrl: 'https://example.com/clubs',
        itemSelector: '.club',
        fields: {
          title: { selector: '.name' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl' },
          description: { selector: '.description' },
          sportName: { selector: '.club', mode: 'literal', value: 'Volleyball' },
          city: { selector: '.club', mode: 'literal', value: 'Portland, OR' },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_clubs' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_clubs', ...data }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      ...data,
    }));
    geocodeAddressToCoordinatesMock.mockResolvedValue([-122.6800, 45.5200]);

    const result = await runAffiliateSourceScrape('source_clubs', {
      client: {
        fetchPage: async () => ({
          url: 'https://example.com/clubs',
          finalUrl: 'https://example.com/clubs',
          statusCode: 200,
          fetchedAt: '2026-07-06T12:00:00.000Z',
          body: `
            <div class="club">
              <h3 class="name">Portland Juniors Volleyball Club</h3>
              <p class="description">Youth volleyball club with tryouts listed on the official site.</p>
              <a href="/portland-juniors">Website</a>
            </div>
          `,
        }),
      },
    });

    expect(result.candidates).toHaveLength(1);
    expect(prismaMock.organizations.upsert).toHaveBeenCalledWith({
      where: { id: 'affiliate_org_portland_juniors_clubs_portland_juniors_volleyball_club' },
      create: expect.objectContaining({
        id: 'affiliate_org_portland_juniors_clubs_portland_juniors_volleyball_club',
        ownerId: 'owner_1',
        name: 'Portland Juniors Volleyball Club',
        website: 'https://example.com/portland-juniors',
        sports: ['Volleyball'],
        status: 'UNLISTED',
        publicPageEnabled: false,
        publicSlug: 'portland-juniors-volleyball-club',
      }),
      update: expect.objectContaining({
        ownerId: 'owner_1',
        name: 'Portland Juniors Volleyball Club',
        status: 'UNLISTED',
        publicPageEnabled: false,
      }),
    });
    expect(prismaMock.events.create).not.toHaveBeenCalled();
    expect(prismaMock.canonicalTeams.create).not.toHaveBeenCalled();
    expect(prismaMock.facilities.upsert).not.toHaveBeenCalled();
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenLastCalledWith({
      where: { id: 'generated_2' },
      data: { publishedOrganizationId: 'affiliate_org_portland_juniors_clubs_portland_juniors_volleyball_club' },
    });
  });

  it('publishes club candidates by making the imported organization public', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_club',
      sourceId: 'source_clubs',
      listingKind: 'CLUB',
      title: 'Portland Juniors Volleyball Club',
      sportName: 'Volleyball',
      city: 'Portland, OR',
      description: 'Youth volleyball club with tryouts listed on the official site.',
      officialActionUrl: 'https://example.com/portland-juniors',
      sourceUrl: 'https://example.com/clubs',
      publishedOrganizationId: 'affiliate_org_existing',
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_clubs',
      name: 'Portland Juniors Clubs',
      sourceKey: 'portland-juniors-clubs',
      organizationId: 'source_org',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'source_org',
      ownerId: 'owner_1',
      coordinates: [-122.6765, 45.5231],
    });
    prismaMock.affiliateImportCandidates.update.mockResolvedValue({ id: 'candidate_club' });

    const organization = await publishAffiliateCandidate('candidate_club', { publishedByUserId: 'admin_1' });

    expect(prismaMock.organizations.upsert).toHaveBeenCalledWith({
      where: { id: 'affiliate_org_existing' },
      create: expect.objectContaining({
        id: 'affiliate_org_existing',
        status: 'LISTED',
        publicPageEnabled: true,
      }),
      update: expect.objectContaining({
        status: 'LISTED',
        publicPageEnabled: true,
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenCalledWith({
      where: { id: 'candidate_club' },
      data: {
        status: 'PUBLISHED',
        publishedOrganizationId: 'affiliate_org_existing',
      },
    });
    expect(organization).toEqual(expect.objectContaining({
      id: 'affiliate_org_existing',
      status: 'LISTED',
      publicPageEnabled: true,
    }));
  });

  it('creates affiliate facilities for org-linked rental scrape candidates', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_rentals',
      name: 'Rose City Futsal Court Rentals',
      sourceKey: 'rose-city-futsal-court-rentals',
      activeMappingId: 'mapping_rentals',
      listUrl: 'https://rosecityfutsal.com/indoor-soccer-rental-in-portland/',
      organizationId: 'org_rose_city',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_rose_city', ownerId: 'owner_1' });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_rentals',
      sourceId: 'source_rentals',
      mapping: {
        kind: 'RENTAL',
        listUrl: 'https://rosecityfutsal.com/indoor-soccer-rental-in-portland/',
        itemSelector: 'h4',
        fields: {
          title: {
            selector: ':scope',
            valueMap: { 'RCF East: Portland': 'RCF East: Portland court rentals' },
          },
          officialActionUrl: {
            selector: ':scope',
            mode: 'literal',
            value: 'https://rosecityfutsal.ezfacility.com/Sessions',
            transform: 'absoluteUrl',
          },
          venueName: { selector: ':scope' },
          address: {
            selector: ':scope',
            valueMap: { 'RCF East: Portland': '5010 NE Oregon St, Portland, OR 97213' },
          },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_rentals' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_rentals', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.facilities.upsert.mockImplementation(async ({ create }) => ({ ...create }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});
    geocodeAddressToCoordinatesMock.mockResolvedValue([-122.6507, 45.5312]);

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://rosecityfutsal.com/indoor-soccer-rental-in-portland/',
        finalUrl: 'https://rosecityfutsal.com/indoor-soccer-rental-in-portland/',
        statusCode: 200,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        body: '<h4>RCF East: Portland</h4>',
      })),
    };

    await runAffiliateSourceScrape('source_rentals', { client });

    expect(prismaMock.facilities.upsert).toHaveBeenCalledWith({
      where: { id: 'affiliate_facility_rose_city_futsal_court_rentals_rcf_east_portland_court_rentals' },
      create: expect.objectContaining({
        id: 'affiliate_facility_rose_city_futsal_court_rentals_rcf_east_portland_court_rentals',
        organizationId: 'org_rose_city',
        name: 'RCF East: Portland court rentals',
        location: 'RCF East: Portland',
        address: '5010 NE Oregon St, Portland, OR 97213',
        coordinates: [-122.6507, 45.5312],
        affiliateUrl: 'https://rosecityfutsal.ezfacility.com/Sessions',
        status: 'DRAFT',
      }),
      update: expect.objectContaining({
        organizationId: 'org_rose_city',
        name: 'RCF East: Portland court rentals',
        coordinates: [-122.6507, 45.5312],
        affiliateUrl: 'https://rosecityfutsal.ezfacility.com/Sessions',
        status: 'DRAFT',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenLastCalledWith({
      where: { id: 'generated_2' },
      data: { publishedFacilityId: 'affiliate_facility_rose_city_futsal_court_rentals_rcf_east_portland_court_rentals' },
    });
  });

  it('falls back to the source organization coordinates for affiliate rental facilities', async () => {
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_rentals',
      name: 'Cascade Athletic Clubs Gresham Rentals',
      sourceKey: 'cascade-athletic-clubs-gresham-rentals',
      activeMappingId: 'mapping_rentals',
      listUrl: 'https://cascadeac.com/gresham/sports-programs/pickleball/',
      organizationId: 'org_cascade',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_cascade',
      ownerId: 'owner_1',
      coordinates: [-122.4650436, 45.5047844],
    });
    prismaMock.affiliateScrapeMappings.findUnique.mockResolvedValue({
      id: 'mapping_rentals',
      sourceId: 'source_rentals',
      mapping: {
        kind: 'RENTAL',
        listUrl: 'https://cascadeac.com/gresham/sports-programs/pickleball/',
        itemSelector: 'h4',
        fields: {
          title: {
            selector: ':scope',
            valueMap: { 'Pickleball Courts': 'Cascade Athletic Clubs Gresham Pickleball Courts' },
          },
          officialActionUrl: {
            selector: ':scope',
            mode: 'literal',
            value: 'https://cascadeac.clubautomation.com/',
            transform: 'absoluteUrl',
          },
          venueName: {
            selector: ':scope',
            mode: 'literal',
            value: 'Cascade Athletic Clubs Gresham',
          },
          address: {
            selector: ':scope',
            mode: 'literal',
            value: '19201 SE Division St, Gresham, OR 97030',
          },
        },
      },
    });
    prismaMock.affiliateScrapeRuns.create.mockResolvedValue({ id: 'run_rentals' });
    prismaMock.affiliateScrapeRuns.update.mockImplementation(async ({ data }) => ({ id: 'run_rentals', ...data }));
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.create.mockImplementation(async ({ data }) => ({ ...data }));
    prismaMock.affiliateImportCandidates.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.facilities.upsert.mockImplementation(async ({ create }) => ({ ...create }));
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});
    geocodeAddressToCoordinatesMock.mockResolvedValue(null);

    const client = {
      fetchPage: jest.fn(async () => ({
        url: 'https://cascadeac.com/gresham/sports-programs/pickleball/',
        finalUrl: 'https://cascadeac.com/gresham/sports-programs/pickleball/',
        statusCode: 200,
        fetchedAt: '2026-07-04T00:00:00.000Z',
        body: '<h4>Pickleball Courts</h4>',
      })),
    };

    await runAffiliateSourceScrape('source_rentals', { client });

    expect(prismaMock.facilities.upsert).toHaveBeenCalledWith({
      where: { id: 'affiliate_facility_cascade_athletic_clubs_gresham_rentals_cascade_athletic_clubs_gresham_pickleball_courts' },
      create: expect.objectContaining({
        id: 'affiliate_facility_cascade_athletic_clubs_gresham_rentals_cascade_athletic_clubs_gresham_pickleball_courts',
        organizationId: 'org_cascade',
        name: 'Cascade Athletic Clubs Gresham Pickleball Courts',
        address: '19201 SE Division St, Gresham, OR 97030',
        coordinates: [-122.4650436, 45.5047844],
        affiliateUrl: 'https://cascadeac.clubautomation.com/',
      }),
      update: expect.objectContaining({
        coordinates: [-122.4650436, 45.5047844],
        affiliateUrl: 'https://cascadeac.clubautomation.com/',
      }),
    });
  });
});
