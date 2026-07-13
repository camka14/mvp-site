/**
 * Makes club-like affiliate organizations discoverable public org pages.
 *
 * Default mode is dry-run against the local DB. Use --apply to write changes and
 * --live to target DATABASE_URL_LIVE.
 *
 * Static mode repairs curated public org pages listed below.
 * Dynamic mode publishes generated CLUB candidate orgs that already have the
 * required public profile data:
 *
 *   npm run affiliate:clubs:publish-orgs -- --all-club-candidates
 *   npm run affiliate:clubs:publish-orgs -- --all-club-candidates --source=oysa --apply
 *   npm run affiliate:clubs:publish-orgs -- --all-club-candidates --relink-canonical-duplicates --delete-duplicate-orgs
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const allClubCandidates = process.argv.includes('--all-club-candidates');
const relinkCanonicalDuplicates = process.argv.includes('--relink-canonical-duplicates');
const deleteDuplicateOrgs = process.argv.includes('--delete-duplicate-orgs');
const sourceArg = process.argv
  .find((arg) => arg.startsWith('--source='))
  ?.slice('--source='.length)
  .trim()
  .toLowerCase() || 'all';

if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;

type DynamicClubOrgRow = {
  candidateId: string;
  candidateStatus: string;
  candidateTitle: string;
  sourceId: string;
  organizationId: string;
  name: string;
  website: string | null;
  description: string | null;
  logoId: string | null;
  logoFileId: string | null;
  publicSlug: string | null;
  publicPageEnabled: boolean;
  status: string;
  publicHeadline: string | null;
  publicIntroText: string | null;
};

type ExistingOrganizationSummary = {
  id: string;
  name: string;
  website: string | null;
  status: string;
  publicPageEnabled: boolean;
};

type OrganizationReference = {
  tableName: string;
  count: number;
};

type ClubOrgPublicPage = {
  id: string;
  slug: string;
  name: string;
  location: string;
  website: string;
  description: string;
  publicHeadline: string;
  publicIntroText: string;
};

const clubOrgPages: ClubOrgPublicPage[] = [
  {
    id: 'affiliate_org_portland_city_united',
    slug: 'portland-city-united-soccer-club',
    name: 'Portland City United Soccer Club',
    location: 'Portland, OR',
    website: 'https://www.pcusc.org/',
    description: 'Portland City United Soccer Club is a Portland youth soccer club serving U5-U19 players with teams, academies, camps, leagues, tournaments, ECNL RL and Pre-ECNL RL pathways, financial aid, and training facilities at Buckman Field Complex and Portland Christian High School.',
    publicHeadline: 'Portland City United Soccer Club programs',
    publicIntroText: 'Find PCU teams, academies, camps, tournaments, and current registration opportunities.',
  },
  {
    id: 'affiliate_org_united_pdx',
    slug: 'united-pdx',
    name: 'United PDX',
    location: 'Portland, OR',
    website: 'https://www.unitedpdx.com/',
    description: 'United PDX is a Portland youth soccer club offering U8-U10 Youth Development Academy, U11-U18/19 academy pathways, recreational soccer, camps, college ID opportunities, and year-round player development programs.',
    publicHeadline: 'United PDX programs',
    publicIntroText: 'Find United PDX academy programs, recreational soccer, camps, and registration opportunities.',
  },
  {
    id: 'affiliate_org_eastside_timbers',
    slug: 'eastside-timbers',
    name: 'Eastside Timbers',
    location: 'Portland, OR',
    website: 'https://www.eastsidetimbers.com/',
    description: 'Eastside Timbers is a youth soccer club and program operator serving East Multnomah and Clackamas Counties. The organization runs recreational soccer, competitive programs, camps, training, field rentals, and indoor futsal programs through Oregon Premier Futsal.',
    publicHeadline: 'Eastside Timbers programs',
    publicIntroText: 'Find Eastside Timbers recreation, camps, training, field rentals, and indoor soccer opportunities.',
  },
  {
    id: 'affiliate_org_soccer_chance_academy',
    slug: 'soccer-chance-academy-portland',
    name: 'Soccer Chance Academy Portland',
    location: 'Portland, OR',
    website: 'https://soccerchanceacademy.us/',
    description: 'Soccer Chance Academy Portland is a youth soccer academy offering player development, academy programs, camps, futsal training, tournaments such as Oregon Super Cup, and soccer education programs for players in the Portland metro area.',
    publicHeadline: 'Soccer Chance Academy Portland programs',
    publicIntroText: 'Find Soccer Chance Academy tournaments, camps, academy programs, and registration links.',
  },
  {
    id: 'affiliate_org_oregon_youth_soccer',
    slug: 'oregon-youth-soccer-association',
    name: 'Oregon Youth Soccer Association',
    location: 'Beaverton, OR',
    website: 'https://www.oregonyouthsoccer.org/',
    description: 'Oregon Youth Soccer Association is a statewide youth soccer organization that supports Oregon member clubs, leagues, tournaments, coaching, refereeing, and player programs. Its sanctioned tournament directory lists approved youth soccer competitions hosted around Oregon.',
    publicHeadline: 'Oregon Youth Soccer Association programs',
    publicIntroText: 'Find sanctioned youth soccer tournaments, member-club programs, and official OYSA links.',
  },
  {
    id: 'affiliate_org_portland_youth_soccer_association',
    slug: 'portland-youth-soccer-association',
    name: 'Portland Youth Soccer Association',
    location: 'Portland, OR',
    website: 'https://sports.bluesombrero.com/Default.aspx?tabid=272293',
    description: 'Portland Youth Soccer Association supports Portland-area youth soccer clubs and leagues, including recreational and competitive play, seasonal registration, schedules, field information, coaching resources, and official league administration.',
    publicHeadline: 'Portland Youth Soccer Association programs',
    publicIntroText: 'Find Portland youth soccer league information, registration links, fields, and member-club resources.',
  },
  {
    id: 'affiliate_org_timbers_army_fc',
    slug: 'timbers-army-fc',
    name: 'Timbers Army FC',
    location: 'Portland, OR',
    website: 'https://107ist.org/107ist/community/timbers-army-fc',
    description: 'Timbers Army FC is a 107IST community soccer network for Timbers Army, Riveters, and 107IST members. It supports team managers and players across non-aggressive 7v7, outdoor, indoor, and futsal leagues in the Portland metro area.',
    publicHeadline: 'Timbers Army FC community teams',
    publicIntroText: 'Find Timbers Army FC team information, league participation details, and official community links.',
  },
  {
    id: 'affiliate_org_03_international_badminton',
    slug: '03-international-badminton-club',
    name: '03 International Badminton Club',
    location: 'Beaverton, OR',
    website: 'https://www.03intlbadminton.net/',
    description: '03 International Badminton Club is a Beaverton badminton facility offering court rentals, youth and adult training, summer camps, tournaments, memberships, and team programs.',
    publicHeadline: '03 International Badminton Club programs',
    publicIntroText: 'Find 03 International Badminton court rentals, classes, camps, tournaments, and training links.',
  },
  {
    id: 'affiliate_org_8th_street_athletics',
    slug: '8th-street-athletics',
    name: '8th Street Athletics',
    location: 'Gresham, OR',
    website: 'https://www.8thstreetacademy.org/athletics',
    description: '8th Street Athletics is the athletics program at 8th Street Academy in Gresham, offering youth sports programs and gym rental for volleyball, basketball, and pickleball use.',
    publicHeadline: '8th Street Athletics programs',
    publicIntroText: 'Find 8th Street Athletics youth sports programs, camps, and gym rental links.',
  },
  {
    id: 'affiliate_org_cascade_athletic_clubs_gresham',
    slug: 'cascade-athletic-clubs-gresham',
    name: 'Cascade Athletic Clubs Gresham',
    location: 'Gresham, OR',
    website: 'https://cascadeac.com/gresham/sports-programs/',
    description: 'Cascade Athletic Clubs Gresham is a multi-sport athletic club with basketball, pickleball, racquetball, tennis, swimming, fitness, youth programs, court reservations, and club sports programming.',
    publicHeadline: 'Cascade Athletic Clubs Gresham programs',
    publicIntroText: 'Find Cascade Gresham sports programs, court reservations, youth programs, and club links.',
  },
  {
    id: 'affiliate_org_oregon_badminton_academy',
    slug: 'oregon-badminton-academy',
    name: 'Oregon Badminton Academy',
    location: 'Beaverton, OR',
    website: 'https://orbadminton.com/',
    description: 'Oregon Badminton Academy is a Beaverton badminton facility offering court reservations, open play, youth and adult coaching, camps, tournaments, corporate events, and team events.',
    publicHeadline: 'Oregon Badminton Academy programs',
    publicIntroText: 'Find Oregon Badminton Academy court reservations, open play, coaching, camps, and tournament links.',
  },
  {
    id: 'affiliate_org_recs_pickleball',
    slug: 'recs-pickleball',
    name: 'RECS Pickleball',
    location: 'Clackamas, OR',
    website: 'https://wearerecs.com/',
    description: 'RECS Pickleball operates indoor pickleball clubs in Clackamas and Tualatin with court reservations, group play, clinics, lessons, mixers, round robins, tournaments, events, and private group rentals.',
    publicHeadline: 'RECS Pickleball programs',
    publicIntroText: 'Find RECS Pickleball open play, leagues, lessons, events, tournaments, court reservations, and rentals.',
  },
];

let prisma: PrismaClientInstance | undefined;

const CLUB_SOURCE_IDS_BY_ALIAS: Record<string, string[] | null> = {
  all: null,
  directories: [
    'affiliate_source_oregon_youth_soccer_find_a_club',
    'affiliate_source_ceva_club_directory',
    'affiliate_source_oregon_state_hockey_youth_directory',
  ],
  oysa: ['affiliate_source_oregon_youth_soccer_find_a_club'],
  ceva: ['affiliate_source_ceva_club_directory'],
  hockey: ['affiliate_source_oregon_state_hockey_youth_directory'],
};

const CANONICAL_ORG_ID_BY_DUPLICATE_ORG_ID: Record<string, string> = {
  affiliate_org_ceva_club_directory_ajaxvb: 'affiliate_org_athena_ajax_volleyball',
  affiliate_org_ceva_club_directory_ajaxvb_bend: 'affiliate_org_athena_ajax_volleyball',
  affiliate_org_ceva_club_directory_athenavb: 'affiliate_org_athena_ajax_volleyball',
  affiliate_org_ceva_club_directory_athenavb_bend: 'affiliate_org_athena_ajax_volleyball',
  affiliate_org_oregon_youth_soccer_find_a_club_eastside_timbers_and_thorns_fc:
    'affiliate_org_eastside_timbers',
  affiliate_org_ceva_club_directory_nw_elite_vbc: 'affiliate_org_nw_elite_volleyball_club',
  affiliate_org_ceva_club_directory_portland_chaos_vbc:
    'affiliate_org_portland_chaos_volleyball_club',
  affiliate_org_oregon_youth_soccer_find_a_club_portland_city_united_soccer_club:
    'affiliate_org_portland_city_united',
  affiliate_org_ceva_club_directory_portland_vbc: 'affiliate_org_portland_volleyball_club',
  affiliate_org_oregon_youth_soccer_find_a_club_soccer_chance_academy:
    'affiliate_org_soccer_chance_academy',
  affiliate_org_oregon_youth_soccer_find_a_club_united_pdx: 'affiliate_org_united_pdx',
};

const normalizeWebsiteKey = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.protocol = 'https:';
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
};

const normalizeOrganizationName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(volleyball|soccer|football|club|academy)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

let organizationReferenceTables: string[] | null = null;

const findOrganizationReferences = async (organizationId: string): Promise<OrganizationReference[]> => {
  if (!organizationReferenceTables) {
    const rows = (await (prisma as any).$queryRawUnsafe(
      `
        select table_name as "tableName"
        from information_schema.columns
        where table_schema = 'public'
          and column_name = 'organizationId'
          and table_name not in ('Organizations', 'OrganizationTagAssignments', 'File')
        order by table_name
      `,
    )) as Array<{ tableName: string }>;
    organizationReferenceTables = rows.map((row) => row.tableName);
  }

  const references: OrganizationReference[] = [];
  for (const tableName of organizationReferenceTables) {
    const result = (await (prisma as any).$queryRawUnsafe(
      `select count(*)::int as count from ${quoteIdentifier(tableName)} where "organizationId" = $1`,
      organizationId,
    )) as Array<{ count: number }>;
    const count = Number(result[0]?.count ?? 0);
    if (count > 0) {
      references.push({ tableName, count });
    }
  }
  return references;
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
};

const claimSlug = async (desiredSlug: string, orgId: string): Promise<string> => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { publicSlug: desiredSlug },
    select: {
      id: true,
      name: true,
      status: true,
      publicPageEnabled: true,
      website: true,
    },
  });
  if (!existing || existing.id === orgId) {
    return desiredSlug;
  }
  if (existing.publicPageEnabled === true || existing.status === 'LISTED') {
    throw new Error(`Public slug ${desiredSlug} is already owned by active org ${existing.id} (${existing.name}).`);
  }
  console.log(`[reclaim-slug] ${desiredSlug} from disabled org ${existing.id}`);
  if (apply) {
    await (prisma as any).organizations.update({
      where: { id: existing.id },
      data: {
        updatedAt: new Date(),
        publicSlug: null,
        publicPageEnabled: false,
      },
    });
  }
  return desiredSlug;
};

const slugifyForPublicSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'club';

const nextAvailableSlug = async (baseValue: string, orgId: string) => {
  const baseSlug = slugifyForPublicSlug(baseValue);
  for (let index = 0; index < 50; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const existing = await (prisma as any).organizations.findUnique({
      where: { publicSlug: slug },
      select: { id: true },
    });
    if (!existing || existing.id === orgId) {
      return slug;
    }
  }
  throw new Error(`Unable to find available public slug for ${baseValue}.`);
};

const publishDynamicClubCandidates = async () => {
  const selectedSourceIds = CLUB_SOURCE_IDS_BY_ALIAS[sourceArg];
  if (selectedSourceIds === undefined) {
    throw new Error(
      `Unknown --source=${sourceArg}. Use all, directories, oysa, ceva, or hockey.`,
    );
  }

  const sourcePredicate = selectedSourceIds
    ? 'and c."sourceId" = any($1::text[])'
    : '';
  const rows = (await (prisma as any).$queryRawUnsafe(
    `
      select
        c.id as "candidateId",
        c.status as "candidateStatus",
        c.title as "candidateTitle",
        c."sourceId",
        o.id as "organizationId",
        o.name,
        o.website,
        o.description,
        o."logoId",
        f.id as "logoFileId",
        o."publicSlug",
        o."publicPageEnabled",
        o.status,
        o."publicHeadline",
        o."publicIntroText"
      from "AffiliateImportCandidates" c
      join "Organizations" o on o.id = c."publishedOrganizationId"
      left join "File" f on f.id = o."logoId"
      where c."listingKind" = 'CLUB'
        and c."publishedOrganizationId" is not null
        ${sourcePredicate}
      order by lower(o.name), c.id
    `,
    ...(selectedSourceIds ? [selectedSourceIds] : []),
  )) as DynamicClubOrgRow[];
  const allOrganizations = (await (prisma as any).organizations.findMany({
    select: {
      id: true,
      name: true,
      website: true,
      status: true,
      publicPageEnabled: true,
    },
  })) as ExistingOrganizationSummary[];
  const organizationById = new Map(allOrganizations.map((organization) => [organization.id, organization]));
  const canonicalOrgsByWebsite = new Map<string, ExistingOrganizationSummary[]>();
  for (const organization of allOrganizations) {
    if (organization.status !== 'LISTED' && organization.publicPageEnabled !== true) {
      continue;
    }
    const key = normalizeWebsiteKey(organization.website);
    if (key) {
      canonicalOrgsByWebsite.set(key, [
        ...(canonicalOrgsByWebsite.get(key) ?? []),
        organization,
      ]);
    }
  }

  const candidateRowsByOrganizationId = new Map<string, DynamicClubOrgRow[]>();
  for (const row of rows) {
    candidateRowsByOrganizationId.set(row.organizationId, [
      ...(candidateRowsByOrganizationId.get(row.organizationId) ?? []),
      row,
    ]);
  }

  const seenOrgIds = new Set<string>();
  const readyRows: DynamicClubOrgRow[] = [];
  const canonicalLinks: Array<{
    row: DynamicClubOrgRow;
    canonicalOrg: ExistingOrganizationSummary;
  }> = [];
  const blocked: Array<{ name: string; organizationId: string; reason: string }> = [];

  for (const row of rows) {
    if (seenOrgIds.has(row.organizationId)) {
      continue;
    }
    seenOrgIds.add(row.organizationId);
    const missing = [
      !row.website ? 'website' : null,
      !row.description ? 'description' : null,
      !row.logoId ? 'logoId' : null,
      row.logoId && !row.logoFileId ? 'logo file' : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      blocked.push({
        name: row.name,
        organizationId: row.organizationId,
        reason: `missing ${missing.join(', ')}`,
      });
      continue;
    }
    const websiteKey = normalizeWebsiteKey(row.website);
    const explicitCanonicalOrgId = CANONICAL_ORG_ID_BY_DUPLICATE_ORG_ID[row.organizationId];
    const explicitCanonicalOrg = explicitCanonicalOrgId
      ? organizationById.get(explicitCanonicalOrgId)
      : null;
    const websiteMatches = websiteKey
      ? (canonicalOrgsByWebsite.get(websiteKey) ?? []).filter(
        (organization) => organization.id !== row.organizationId,
      )
      : [];
    const sameNameWebsiteMatches = websiteMatches.filter(
      (organization) => normalizeOrganizationName(organization.name) === normalizeOrganizationName(row.name),
    );
    const canonicalOrg = explicitCanonicalOrg
      ?? (sameNameWebsiteMatches.length === 1 ? sameNameWebsiteMatches[0] : null);
    const isAlreadyPublic = row.status === 'LISTED' && row.publicPageEnabled === true;
    if (!isAlreadyPublic && canonicalOrg && canonicalOrg.id !== row.organizationId) {
      if (relinkCanonicalDuplicates) {
        canonicalLinks.push({ row, canonicalOrg });
        continue;
      }
      blocked.push({
        name: row.name,
        organizationId: row.organizationId,
        reason: `canonical public org already exists for website: ${canonicalOrg.name} (${canonicalOrg.id})`,
      });
      continue;
    }
    readyRows.push(row);
  }

  let updatedOrganizations = 0;
  let updatedCandidates = 0;
  let relinkedCandidates = 0;
  let deletedDuplicateOrganizations = 0;
  for (const row of readyRows) {
    const candidateRows = candidateRowsByOrganizationId.get(row.organizationId) ?? [row];
    const candidateIds = candidateRows.map((candidate) => candidate.candidateId);
    const publicSlug =
      row.publicSlug ?? (await nextAvailableSlug(row.name || row.candidateTitle, row.organizationId));
    const organizationNeedsUpdate =
      row.status !== 'LISTED' ||
      row.publicPageEnabled !== true ||
      !row.publicSlug ||
      !row.publicHeadline ||
      !row.publicIntroText;
    const candidateNeedsUpdate = candidateRows.some(
      (candidate) => candidate.candidateStatus !== 'PUBLISHED',
    );

    console.log(
      `${organizationNeedsUpdate || candidateNeedsUpdate ? '[publish]' : '[ok]'} ${row.name} -> /o/${publicSlug}`,
    );

    if (!apply) {
      continue;
    }

    if (organizationNeedsUpdate) {
      await (prisma as any).organizations.update({
        where: { id: row.organizationId },
        data: {
          updatedAt: new Date(),
          status: 'LISTED',
          publicPageEnabled: true,
          publicSlug,
          publicHeadline: row.publicHeadline ?? row.name,
          publicIntroText: row.publicIntroText ?? row.description,
        },
      });
      updatedOrganizations += 1;
    }

    if (candidateNeedsUpdate) {
      const result = await (prisma as any).affiliateImportCandidates.updateMany({
        where: {
          id: { in: candidateIds },
          status: { not: 'PUBLISHED' },
        },
        data: {
          updatedAt: new Date(),
          status: 'PUBLISHED',
        },
      });
      updatedCandidates += result.count;
    }
  }

  blocked.forEach((item) => {
    console.warn(`[blocked] ${item.name} (${item.organizationId}): ${item.reason}`);
  });

  for (const { row, canonicalOrg } of canonicalLinks) {
    const candidateRows = candidateRowsByOrganizationId.get(row.organizationId) ?? [row];
    const candidateIds = candidateRows.map((candidate) => candidate.candidateId);
    console.log(
      `[relink] ${row.name} (${row.organizationId}) -> ${canonicalOrg.name} (${canonicalOrg.id})`,
    );
    if (!apply) {
      continue;
    }

    const relinkResult = await (prisma as any).affiliateImportCandidates.updateMany({
      where: { id: { in: candidateIds } },
      data: {
        updatedAt: new Date(),
        status: 'PUBLISHED',
        publishedOrganizationId: canonicalOrg.id,
      },
    });
    relinkedCandidates += relinkResult.count;

    if (!deleteDuplicateOrgs) {
      continue;
    }

    const remainingCandidates = await (prisma as any).affiliateImportCandidates.count({
      where: { publishedOrganizationId: row.organizationId },
    });
    const references = await findOrganizationReferences(row.organizationId);
    if (remainingCandidates > 0 || references.length > 0) {
      console.warn(
        `[skip-delete] ${row.name} still has dependencies: ${JSON.stringify({ remainingCandidates, references })}`,
      );
      continue;
    }

    await (prisma as any).organizationTagAssignments.deleteMany({
      where: { organizationId: row.organizationId },
    });
    await (prisma as any).organizations.delete({
      where: { id: row.organizationId },
    });
    if (row.logoId) {
      const otherLogoUsers = await (prisma as any).organizations.count({
        where: { logoId: row.logoId },
      });
      if (otherLogoUsers === 0) {
        await (prisma as any).file.deleteMany({
          where: {
            id: row.logoId,
            organizationId: row.organizationId,
          },
        });
      }
    }
    deletedDuplicateOrganizations += 1;
  }

  console.log(
    `${apply ? 'Applied' : 'Dry run'} dynamic club publish: ${readyRows.length} ready, ${updatedOrganizations} orgs updated, ${updatedCandidates} candidates updated, ${relinkedCandidates} candidates relinked, ${deletedDuplicateOrganizations} duplicate orgs deleted, ${blocked.length} blocked, ${canonicalLinks.length} canonical duplicate(s).`,
  );
};

const main = async () => {
  await loadAppModules();

  if (allClubCandidates) {
    await publishDynamicClubCandidates();
    return;
  }

  const rows = await (prisma as any).organizations.findMany({
    where: { id: { in: clubOrgPages.map((org) => org.id) } },
    select: {
      id: true,
      name: true,
      status: true,
      publicSlug: true,
      publicPageEnabled: true,
      website: true,
      description: true,
    },
    orderBy: { name: 'asc' },
  });
  const existingById = new Map<string, Record<string, any>>(
    rows.map((row: any) => [String(row.id), row]),
  );

  let missing = 0;
  let updated = 0;
  for (const org of clubOrgPages) {
    const existing = existingById.get(org.id);
    if (!existing) {
      missing += 1;
      console.warn(`[missing] ${org.id} (${org.name})`);
      continue;
    }

    const slug = await claimSlug(org.slug, org.id);
    const data = {
      updatedAt: new Date(),
      name: org.name,
      location: org.location,
      website: org.website,
      description: org.description,
      status: 'LISTED',
      publicSlug: slug,
      publicPageEnabled: true,
      publicHeadline: org.publicHeadline,
      publicIntroText: org.publicIntroText,
    };

    const needsUpdate = existing.name !== data.name
      || existing.status !== data.status
      || existing.publicSlug !== data.publicSlug
      || existing.publicPageEnabled !== data.publicPageEnabled
      || existing.website !== data.website
      || existing.description !== data.description;

    console.log(`${needsUpdate ? '[update]' : '[ok]'} ${org.name} -> /o/${slug}`);
    if (needsUpdate && apply) {
      await (prisma as any).organizations.update({
        where: { id: org.id },
        data,
      });
      updated += 1;
    }
  }

  console.log(`${apply ? 'Applied' : 'Dry run'} complete: ${updated} updated, ${missing} missing.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
