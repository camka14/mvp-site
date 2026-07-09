/**
 * CEVA Camps affiliate source setup.
 *
 * Owns source `affiliate_source_ceva_camps`, mapping
 * `affiliate_mapping_ceva_camps_v1`, and reuses CEVA source organization
 * `affiliate_org_ceva_region`.
 *
 * Official URL:
 * - https://cevaregion.org/camps/
 *
 * Creates/repairs the CEVA org/logo, source row, and manual future camp
 * candidates from CEVA's public camps page. Safe for local or live DB; use
 * `--live` for live and `--scrape` to create/update discovered candidates.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_ceva_region';
const LOGO_FILE_ID = 'affiliate_file_ceva_region_logo';
const SOURCE_ID = 'affiliate_source_ceva_camps';
const SOURCE_KEY = 'ceva-camps';
const MAPPING_ID = 'affiliate_mapping_ceva_camps_v1';
const BASE_URL = 'https://cevaregion.org/';
const LIST_URL = 'https://cevaregion.org/camps/';
const LOGO_SOURCE_URL = 'https://cevaregion.org/wp-content/uploads/2025/05/ceva_header.png';
const PUBLIC_SLUG = 'columbia-empire-volleyball-association';
const CEVA_DESCRIPTION =
  'Columbia Empire Volleyball Association is the USA Volleyball region serving Oregon and Southwest Washington. CEVA publishes volleyball club, league, championship, camp, clinic, and tryout resources for the region.';

const campDivision = (name: string, key: string, priceCents: number | null, ageCutoffLabel: string) => ({
  name,
  key,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId: 'youth',
  priceCents,
  maxParticipants: null,
  ageCutoffLabel,
  ageCutoffSource: 'CEVA Camps page inspected 2026-07-09.',
});

const candidateBase = {
  listingKind: 'EVENT' as const,
  sourceUrl: LIST_URL,
  organizerName: 'Columbia Empire Volleyball Association',
  sportName: 'Indoor Volleyball',
  timeZone: 'America/Los_Angeles',
  tags: ['Camp'],
};

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'CEVA Camps',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      ...candidateBase,
      title: 'All Around Volleyball Academy Youth Camps - Session 2',
      officialActionUrl: 'https://allaroundvb.net/club/summer',
      formatLabel: 'Youth volleyball camp',
      city: 'Portland, OR',
      venueName: 'PSU Campus Recreation Center',
      address: '1800 SW 6th Ave, Portland, OR 97201',
      startsAt: '2026-08-03T10:00:00-07:00',
      endsAt: '2026-08-06T15:00:00-07:00',
      scheduleText: 'Session 2 runs August 3-6, 2026 from 10:00 AM to 3:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Incoming 5th-8th grade',
      divisionText: 'Incoming 5th-8th grade',
      participantOptionsText: 'Individual camp registration through All Around Volleyball Academy.',
      priceText: '$300',
      description:
        'CEVA lists All Around Volleyball Academy Youth Camps as quality volleyball reps, confidence building, and high-level technical instruction for incoming 5th-8th grade athletes. Session 2 runs August 3-6, 2026 at PSU Campus Recreation Center.',
      divisions: [
        campDivision('Incoming 5th-8th Grade', 'c_youth_5_8', 30000, 'Incoming 5th-8th grade'),
      ],
    },
    {
      ...candidateBase,
      title: 'All Around Volleyball Academy Rain Drops - Session 2',
      officialActionUrl: 'https://allaroundvb.net/club/summer',
      formatLabel: 'Youth volleyball camp',
      city: 'Portland, OR',
      venueName: 'PSU Campus Recreation Center',
      address: '1800 SW 6th Ave, Portland, OR 97201',
      startsAt: '2026-08-03T10:00:00-07:00',
      endsAt: '2026-08-06T15:00:00-07:00',
      scheduleText: 'Session 2 runs August 3-6, 2026 from 10:00 AM to 3:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Incoming 1st-4th grade',
      divisionText: 'Incoming 1st-4th grade',
      participantOptionsText: 'Individual camp registration through All Around Volleyball Academy.',
      priceText: '$300',
      description:
        'CEVA lists Rain Drops as a youth camp designed to spark love for volleyball and build a strong foundation of fundamental skills for incoming 1st-4th grade athletes. Session 2 runs August 3-6, 2026 at PSU Campus Recreation Center.',
      divisions: [
        campDivision('Incoming 1st-4th Grade', 'c_youth_1_4', 30000, 'Incoming 1st-4th grade'),
      ],
    },
    {
      ...candidateBase,
      title: 'All Around Volleyball Academy High School Prep',
      officialActionUrl: 'https://allaroundvb.net/club/summer',
      formatLabel: 'High school prep camp',
      city: 'Portland, OR',
      venueName: 'Multnomah Campus',
      address: '8435 NE Glisan St, Portland, OR 97220',
      startsAt: '2026-07-20T10:00:00-07:00',
      endsAt: '2026-07-23T15:00:00-07:00',
      scheduleText: 'July 20-23, 2026 from 10:00 AM to 3:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Incoming 9th-12th grade',
      divisionText: 'Incoming 9th-12th grade',
      participantOptionsText: 'Individual camp registration through All Around Volleyball Academy.',
      priceText: '$300',
      description:
        'CEVA lists All Around Volleyball Academy High School Prep as technical instruction to sharpen skills and maximize reps before the high school season. The camp runs July 20-23, 2026 at Multnomah Campus.',
      divisions: [
        campDivision('Incoming 9th-12th Grade', 'c_youth_9_12', 30000, 'Incoming 9th-12th grade'),
      ],
      warnings: [
        'CEVA lists the venue as Multnomah Campus without a street address; stored address should be reviewed before publishing.',
      ],
    },
    {
      ...candidateBase,
      title: 'Lewis & Clark College Intermediate/Advanced All-Skills Camp',
      officialActionUrl: 'https://www.ussportscamps.com/volleyball/nike/nike-volleyball-camp-lewis-and-clark-college',
      formatLabel: 'All-skills camp',
      city: 'Portland, OR',
      venueName: 'Pamplin Sports Center, Lewis & Clark College',
      address: '0615 SW Palatine Hill Rd, Portland, OR 97219',
      startsAt: '2026-07-27T09:00:00-07:00',
      endsAt: '2026-07-30T15:00:00-07:00',
      scheduleText: 'July 27-30, 2026 from 9:00 AM to 3:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Entering 9th-12th grade',
      divisionText: 'Entering 9th-12th grade',
      participantOptionsText: 'Individual registration through the official Nike Volleyball Camps page.',
      priceText: null,
      description:
        'CEVA lists the Lewis & Clark College Intermediate/Advanced All-Skills Camp for athletes entering 9th-12th grade at Pamplin Sports Center. The CEVA page provides dates, time, venue, and registration link but does not expose a public price.',
      divisions: [
        campDivision('Entering 9th-12th Grade', 'c_youth_9_12', null, 'Entering 9th-12th grade'),
      ],
    },
    {
      ...candidateBase,
      title: 'Lewis & Clark College Serving & Passing Clinic',
      officialActionUrl: 'https://www.ussportscamps.com/volleyball/nike/nike-volleyball-camp-lewis-and-clark-college',
      tags: ['Clinic'],
      formatLabel: 'Serving and passing clinic',
      city: 'Portland, OR',
      venueName: 'Pamplin Sports Center, Lewis & Clark College',
      address: '0615 SW Palatine Hill Rd, Portland, OR 97219',
      startsAt: '2026-07-31T09:00:00-07:00',
      endsAt: '2026-07-31T15:00:00-07:00',
      scheduleText: 'July 31, 2026 from 9:00 AM to 3:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Ages 9-18',
      divisionText: 'Ages 9-18',
      participantOptionsText: 'Individual registration through the official Nike Volleyball Camps page.',
      priceText: null,
      description:
        'CEVA lists the Lewis & Clark College Serving & Passing Clinic for athletes ages 9-18 at Pamplin Sports Center on July 31, 2026. The CEVA page does not expose a public price.',
      divisions: [
        campDivision('Ages 9-18', 'c_youth_9_18', null, 'Ages 9-18'),
      ],
    },
    {
      ...candidateBase,
      title: 'NPJ Portland Beginner / Intermediate Summer Camps - August Session',
      officialActionUrl: 'https://www.npjvolleyball.com/page/portlandcamps26',
      formatLabel: 'Beginner and intermediate summer camp',
      city: 'Tigard, OR',
      venueName: 'Rose City Futsal West',
      address: '10831 SW Cascade Ave, Tigard, OR 97223',
      startsAt: '2026-08-10T09:00:00-07:00',
      endsAt: '2026-08-13T16:00:00-07:00',
      scheduleText: 'August 10-13, 2026. Beginner camp meets 9:00 AM-12:00 PM; Intermediate camp meets 1:00 PM-4:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Youth volleyball players',
      divisionText: 'Beginner and Intermediate',
      participantOptionsText: 'Individual registration through NPJ Portland.',
      priceText: '$262.50',
      description:
        'CEVA and NPJ list the Portland Beginner / Intermediate Summer Camps at Rose City Futsal West. The August session runs August 10-13, 2026, with beginner players in the morning and intermediate players in the afternoon.',
      divisions: [
        campDivision('Beginner Camp', 'c_beginner', 26250, 'Youth beginner'),
        campDivision('Intermediate Camp', 'c_intermediate', 26250, 'Youth intermediate'),
      ],
    },
    {
      ...candidateBase,
      title: 'NPJ Portland Summer Academy - August Session',
      officialActionUrl: 'https://www.npjvolleyball.com/site?ID=12180',
      tags: ['Clinic'],
      formatLabel: 'Summer academy',
      city: 'Tigard, OR',
      venueName: 'Rose City Futsal West',
      address: '10831 SW Cascade Ave, Tigard, OR 97223',
      startsAt: '2026-08-05T17:00:00-07:00',
      endsAt: '2026-08-28T19:00:00-07:00',
      scheduleText: 'August 5, 7, 12, 14, 19, 21, 26, and 28, 2026 from 5:00 PM to 7:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Youth volleyball players',
      divisionText: 'Summer academy',
      participantOptionsText: 'Individual registration through NPJ Portland.',
      priceText: '$310',
      description:
        'CEVA lists NPJ Portland Summer Academy at Rose City Futsal West with August session dates on August 5, 7, 12, 14, 19, 21, 26, and 28, 2026. The August monthly price is $310; CEVA also notes a $600 combined July/August option.',
      divisions: [
        campDivision('August Summer Academy', 'c_august_academy', 31000, 'Youth volleyball players'),
      ],
    },
    {
      ...candidateBase,
      title: 'NPJ Portland Summer Skill Training - August Session',
      officialActionUrl: 'https://www.npjvolleyball.com/site?ID=12181',
      tags: ['Clinic'],
      formatLabel: 'Skill training clinic',
      city: 'Tigard, OR',
      venueName: 'Rose City Futsal West',
      address: '10831 SW Cascade Ave, Tigard, OR 97223',
      startsAt: '2026-08-06T18:00:00-07:00',
      endsAt: '2026-08-27T20:00:00-07:00',
      scheduleText: 'August 6, 13, 20, and 27, 2026. Attacking and digging meet 6:00-7:00 PM; setting and serve/pass meet 7:00-8:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Youth volleyball players',
      divisionText: 'Attacking, Digging, Setting, Serve & Pass',
      participantOptionsText: 'Individual registration through NPJ Portland.',
      priceText: '$110',
      description:
        'CEVA lists NPJ Portland Summer Skill Training at Rose City Futsal West with August sessions on Thursdays. Skills include attacking, digging, setting, and serve/pass. CEVA lists $110 per session and a $40 drop-in option.',
      divisions: [
        campDivision('August Skill Training', 'c_august_skill_training', 11000, 'Youth volleyball players'),
      ],
    },
    {
      ...candidateBase,
      title: 'NPJ Portland Dave Rubio Skills Camp',
      officialActionUrl:
        'https://www.npjvolleyball.com/site/register/register.aspx?EventId=19041&OpenRegisterDialog=false&IsBulkRegistration=false&DivisionIds=%5b%5d&GradeQuery=%5b%5d',
      tags: ['Camp', 'Clinic'],
      formatLabel: 'Skills camp',
      city: 'Tigard, OR',
      venueName: 'Rose City Futsal West - Forefront Court',
      address: '10831 SW Cascade Ave, Tigard, OR 97223',
      startsAt: '2026-07-13T09:00:00-07:00',
      endsAt: '2026-07-14T13:30:00-07:00',
      scheduleText: 'July 13-14, 2026. Beginner/Intermediate meets 9:00-11:00 AM; Advanced/High Performance meets 11:30 AM-1:30 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Youth volleyball players',
      divisionText: 'Beginner/Intermediate and Advanced/High Performance',
      participantOptionsText: 'Individual registration through NPJ Portland.',
      priceText: '$145',
      description:
        'CEVA lists the NPJ Portland Dave Rubio Skills Camp at Rose City Futsal West - Forefront Court. The camp offers beginner/intermediate and advanced/high-performance training blocks on July 13-14, 2026.',
      divisions: [
        campDivision('Beginner / Intermediate', 'c_beginner_intermediate', 14500, 'Youth volleyball players'),
        campDivision('Advanced / High Performance', 'c_advanced_high_performance', 14500, 'Youth volleyball players'),
      ],
    },
    {
      ...candidateBase,
      title: 'NPJ Portland Skills/Positional Camp',
      officialActionUrl:
        'https://www.npjvolleyball.com/site/register/register.aspx?EventId=19045&OpenRegisterDialog=false&IsBulkRegistration=false&DivisionIds=%5b%5d&GradeQuery=%5b%5d',
      tags: ['Camp', 'Clinic'],
      formatLabel: 'Skills and positional camp',
      city: 'Tigard, OR',
      venueName: 'Rose City Futsal West',
      address: '10831 SW Cascade Ave, Tigard, OR 97223',
      startsAt: '2026-08-17T09:00:00-07:00',
      endsAt: '2026-08-20T16:00:00-07:00',
      scheduleText: 'August 17-20, 2026. Serve/pass and setting meet 9:00 AM-12:00 PM; attacking and digging meet 1:00-4:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Youth volleyball players',
      divisionText: 'Serve & Pass, Setting, Attacking, Digging',
      participantOptionsText: 'Individual registration through NPJ Portland.',
      priceText: '$260',
      description:
        'CEVA lists the NPJ Portland Skills/Positional Camp at Rose City Futsal West. Position groups include serve/pass, setting, attacking, and digging across August 17-20, 2026.',
      divisions: [
        campDivision('Skills / Positional Camp', 'c_skills_positional', 26000, 'Youth volleyball players'),
      ],
    },
    {
      ...candidateBase,
      title: 'Pacific University Youth 4-Day Volleyball Camp',
      officialActionUrl: 'http://boxervbcamps.com/',
      formatLabel: 'Youth volleyball camp',
      city: 'Forest Grove, OR',
      venueName: 'Pacific University',
      address: '2043 College Way, Forest Grove, OR 97116',
      startsAt: '2026-07-20T09:00:00-07:00',
      endsAt: '2026-07-23T15:00:00-07:00',
      scheduleText: 'July 20-23, 2026. CEVA lists this as a four-day camp for players entering 2nd-8th grade.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Entering 2nd-8th grade',
      divisionText: 'Entering 2nd-8th grade',
      participantOptionsText: 'Individual registration through Pacific University Volleyball Camps.',
      priceText: '$175',
      description:
        'CEVA lists Pacific University Youth 4-Day Volleyball Camp as a four-day day camp for players entering 2nd-8th grade. The CEVA page lists the camp at $175.',
      divisions: [
        campDivision('Entering 2nd-8th Grade', 'c_youth_2_8', 17500, 'Entering 2nd-8th grade'),
      ],
    },
    {
      ...candidateBase,
      title: 'Pacific University Elite Prospect Camp Session II',
      officialActionUrl: 'http://boxervbcamps.com/',
      tags: ['Camp', 'Clinic'],
      formatLabel: 'Elite prospect camp',
      city: 'Forest Grove, OR',
      venueName: 'Pacific University',
      address: '2043 College Way, Forest Grove, OR 97116',
      startsAt: '2026-07-24T09:00:00-07:00',
      endsAt: '2026-07-24T15:00:00-07:00',
      scheduleText: 'July 24, 2026. CEVA lists this as a prospect camp for athletes entering 9th grade and up with competitive volleyball experience.',
      dateDisplayMode: 'SCHEDULED',
      ageGroup: 'Entering 9th grade and up',
      divisionText: 'Entering 9th grade and up',
      participantOptionsText: 'Individual registration through Pacific University Volleyball Camps.',
      priceText: '$110',
      description:
        'CEVA lists Pacific University Elite Prospect Camp Session II for athletes entering 9th grade and up with competitive volleyball experience. The CEVA page lists the camp at $110.',
      divisions: [
        campDivision('Entering 9th Grade and Up', 'c_youth_9_plus', 11000, 'Entering 9th grade and up'),
      ],
    },
  ],
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const normalizeLogo = async (input: Buffer) => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: '#ffffff', threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(input, { animated: false }).rotate().png().toBuffer());

  const logo = await sharp(trimmed, { animated: false })
    .resize({ width: 780, height: 780, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download CEVA logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'ceva-region-logo.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'ceva-region-logo.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'ceva-region-logo.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Columbia Empire Volleyball Association',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: CEVA_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.6765, 45.5231],
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'CEVA volleyball clubs and programs',
      publicIntroText: 'Find Columbia Empire Volleyball Association club, league, championship, camp, clinic, and tryout resources.',
      taxOrganizationType: 'NONPROFIT_ORGANIZATION',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Columbia Empire Volleyball Association',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: CEVA_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'CEVA volleyball clubs and programs',
      publicIntroText: 'Find Columbia Empire Volleyball Association club, league, championship, camp, clinic, and tryout resources.',
      coordinates: [-122.6765, 45.5231],
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourceNotes =
    'Manual future-camp source from CEVA Camps. Includes Portland-metro and nearby future rows with source-provided dates, prices, registration links, and venue data; stale/started rows and rows missing source years are intentionally skipped.';

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'CEVA Camps',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'cevaregion.org robots.txt allows public pages and disallows only /wp-admin/ for this source.',
        logoSourceUrl: LOGO_SOURCE_URL,
        skippedRows: [
          'George Fox June 2026 camps are past.',
          'NPJ Portland Beach Club and July Academy started before inspection date 2026-07-09.',
          'Elite Skills Sessions omitted year in its date text.',
          'AthenaVB CEVA blurb did not expose specific dates, prices, or locations.',
          'Bend, Salem, Corvallis, and other non-Portland-metro rows are deferred for a separate broader Oregon pass.',
        ],
      },
    },
    update: {
      name: 'CEVA Camps',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'cevaregion.org robots.txt allows public pages and disallows only /wp-admin/ for this source.',
        logoSourceUrl: LOGO_SOURCE_URL,
        skippedRows: [
          'George Fox June 2026 camps are past.',
          'NPJ Portland Beach Club and July Academy started before inspection date 2026-07-09.',
          'Elite Skills Sessions omitted year in its date text.',
          'AthenaVB CEVA blurb did not expose specific dates, prices, or locations.',
          'Bend, Salem, Corvallis, and other non-Portland-metro rows are deferred for a separate broader Oregon pass.',
        ],
      },
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manual CEVA Camps mapping with future scheduled camp/clinic candidates, compact division prices, tags, venue names, and addresses.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes: 'Manual CEVA Camps mapping with future scheduled camp/clinic candidates, compact division prices, tags, venue names, and addresses.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`CEVA Camps affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${mapping.manualCandidates?.length ?? 0} manual camp candidates configured.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
    console.log(JSON.stringify(result.run.logs, null, 2));
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-ceva-camps-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
