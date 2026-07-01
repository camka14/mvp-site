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
  });

  it('deletes affiliate candidates and their backing target rows', async () => {
    prismaMock.affiliateImportCandidates.findUnique.mockResolvedValue({
      id: 'candidate_1',
      title: 'Published affiliate event',
      publishedEventId: 'event_1',
      publishedTeamId: 'team_1',
      publishedFacilityId: 'facility_1',
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
        priceText: '$75 per game',
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
      startsAt: new Date('2026-07-01T18:00:00.000Z'),
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
        priceText: '$850 per team.',
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
        priceText: '$675',
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
        affiliateUrl: 'https://rosecityfutsal.ezfacility.com/Sessions',
        status: 'DRAFT',
      }),
      update: expect.objectContaining({
        organizationId: 'org_rose_city',
        name: 'RCF East: Portland court rentals',
        affiliateUrl: 'https://rosecityfutsal.ezfacility.com/Sessions',
        status: 'DRAFT',
      }),
    });
    expect(prismaMock.affiliateImportCandidates.update).toHaveBeenLastCalledWith({
      where: { id: 'generated_2' },
      data: { publishedFacilityId: 'affiliate_facility_rose_city_futsal_court_rentals_rcf_east_portland_court_rentals' },
    });
  });
});
