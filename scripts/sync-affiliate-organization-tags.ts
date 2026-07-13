import crypto from 'crypto';
import fs from 'fs';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const write = process.argv.includes('--write');
const orgArg = process.argv.find((arg) => arg.startsWith('--org='));
const orgFilter = orgArg ? orgArg.split('=').slice(1).join('=').toLowerCase() : '';

if (useLive) {
  if (!process.env.DATABASE_URL_LIVE) {
    throw new Error('--live requires DATABASE_URL_LIVE.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
}

const SYSTEM_TAGS = [
  { id: 'default_org_tag_club', name: 'Club', slug: 'club' },
  { id: 'default_org_tag_facility', name: 'Facility', slug: 'facility' },
  { id: 'default_org_tag_event_manager', name: 'Event Manager', slug: 'event-manager' },
  { id: 'default_org_tag_league_operator', name: 'League Operator', slug: 'league-operator' },
  { id: 'default_org_tag_tournament_host', name: 'Tournament Host', slug: 'tournament-host' },
  { id: 'default_org_tag_training_provider', name: 'Training Provider', slug: 'training-provider' },
  { id: 'default_org_tag_rental_provider', name: 'Rental Provider', slug: 'rental-provider' },
] as const;

type SystemTagSlug = typeof SYSTEM_TAGS[number]['slug'];

type OrgRow = {
  id: string;
  name: string;
  status: string | null;
  website: string | null;
  publicSlug: string | null;
  description: string | null;
  eventCount: number;
  facilityCount: number;
  teamCount: number;
  sourceTargetKinds: string[];
  sourceText: string;
  candidateKinds: string[];
  candidateText: string;
  eventTypes: string[];
  eventText: string;
  facilityText: string;
};

const outputDir = 'output/affiliate-organization-tags';

const dbUrl = () => {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is missing.');
  }
  if (useLive) {
    return value;
  }
  return value.replace(/\?sslmode=require$/, '');
};

const client = new Client({
  connectionString: dbUrl(),
  ssl: useLive ? { rejectUnauthorized: false } : false,
});

const normalize = (value: unknown) => String(value ?? '').toLowerCase();

const includesAny = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

const splitCompactName = (value: string) => (
  value
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\)+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const arrayFromPg = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  return [];
};

const isClubLike = (org: OrgRow, haystack: string) => (
  org.candidateKinds.includes('CLUB')
  || org.sourceTargetKinds.includes('CLUB')
  || org.id.includes('_club_')
  || includesAny(haystack, [
    /\bclub\b/,
    /\bfc\b/,
    /\bsc\b/,
    /\bvbc\b/,
    /\bacademy\b/,
    /\byouth soccer\b/,
    /\byouth hockey\b/,
    /\byouth football\b/,
    /\byouth baseball\b/,
    /\byouth lacrosse\b/,
    /\bfastpitch\b/,
    /\brush\b/,
    /\btryouts?\b/,
  ])
);

const isFacilityLike = (org: OrgRow, haystack: string) => (
  org.facilityCount > 0
  || org.sourceTargetKinds.includes('RENTAL')
  || org.candidateKinds.includes('RENTAL')
  || includesAny(haystack, [
    /\bfacilit(y|ies)\b/,
    /\brental(s)?\b/,
    /\bparks?\b/,
    /\brecreation\b/,
    /\bcourts?\b/,
    /\bgym\b/,
    /\bice centers?\b/,
    /\bindoor\b/,
    /\bsportsplex\b/,
    /\bschool district\b/,
    /\bcollege\b/,
    /\buniversity\b/,
    /\bbatting\b/,
    /\bcommunity center\b/,
  ])
);

const inferTags = (org: OrgRow): SystemTagSlug[] => {
  const tags = new Set<SystemTagSlug>();
  const name = splitCompactName(org.name);
  const clubHaystack = normalize([
    name,
    org.id,
    org.website,
    org.publicSlug,
    org.description,
    org.candidateKinds.join(' '),
  ].join(' '));
  const outputHaystack = normalize([
    name,
    org.id,
    org.website,
    org.publicSlug,
    org.sourceText,
    org.eventText,
    org.facilityText,
    org.sourceTargetKinds.join(' '),
    org.eventTypes.join(' '),
  ].join(' '));
  const facilityHaystack = normalize([
    name,
    org.id,
    org.website,
    org.publicSlug,
  ].join(' '));

  if (isClubLike(org, clubHaystack)) {
    tags.add('club');
  }

  if (isFacilityLike(org, facilityHaystack)) {
    tags.add('facility');
    tags.add('rental-provider');
  }

  if (
    org.eventCount > 0
    || org.sourceTargetKinds.includes('EVENT')
    || org.candidateKinds.includes('EVENT')
  ) {
    tags.add('event-manager');
  }

  if (
    org.eventTypes.includes('LEAGUE')
    || org.eventTypes.includes('WEEKLY_EVENT')
    || includesAny(outputHaystack, [/\bleagues?\b/, /\bweekly\b/, /\bseason\b/, /\bopen play\b/, /\bopen gym\b/])
  ) {
    tags.add('league-operator');
  }

  if (
    org.eventTypes.includes('TOURNAMENT')
    || includesAny(outputHaystack, [/\btournaments?\b/, /\bcup\b/, /\bclassic\b/, /\bchampionships?\b/, /\bshowcase\b/])
  ) {
    tags.add('tournament-host');
  }

  if (
    includesAny(outputHaystack, [
      /\btryouts?\b/,
      /\bcamps?\b/,
      /\bclinics?\b/,
      /\btraining\b/,
      /\bacademy\b/,
      /\bclasses\b/,
      /\blessons?\b/,
      /\bskills?\b/,
      /\bdevelopment\b/,
    ])
    || includesAny(clubHaystack, [/\bacademy\b/, /\btraining\b/])
  ) {
    tags.add('training-provider');
  }

  if (tags.size === 0 && org.id.startsWith('affiliate_org_')) {
    tags.add('event-manager');
  }

  return Array.from(tags).sort();
};

const makeAssignmentId = (organizationId: string, tagId: string) => (
  `org_tag_${crypto.createHash('sha1').update(`${organizationId}:${tagId}`).digest('hex').slice(0, 24)}`
);

const loadOrganizations = async (): Promise<OrgRow[]> => {
  const { rows } = await client.query(`
    SELECT
      o.id,
      o.name,
      o.status,
      o.website,
      o."publicSlug",
      o.description,
      COALESCE(event_counts.count, 0)::int AS "eventCount",
      COALESCE(facility_counts.count, 0)::int AS "facilityCount",
      COALESCE(team_counts.count, 0)::int AS "teamCount",
      COALESCE(source_counts.kinds, ARRAY[]::text[]) AS "sourceTargetKinds",
      COALESCE(source_counts.text, '') AS "sourceText",
      COALESCE(candidate_counts.kinds, ARRAY[]::text[]) AS "candidateKinds",
      COALESCE(candidate_counts.text, '') AS "candidateText",
      COALESCE(event_counts.types, ARRAY[]::text[]) AS "eventTypes",
      COALESCE(event_counts.text, '') AS "eventText",
      COALESCE(facility_counts.text, '') AS "facilityText"
    FROM "Organizations" o
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS count,
        array_agg(DISTINCT e."eventType"::text) FILTER (WHERE e."eventType" IS NOT NULL) AS types,
        string_agg(concat_ws(' ', e.name, e.description, e."scheduleText", e."statusText", e."sourceUrl", e."affiliateUrl"), ' ') AS text
      FROM "Events" e
      WHERE e."organizationId" = o.id AND e."affiliateUrl" IS NOT NULL
    ) event_counts ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS count,
        string_agg(concat_ws(' ', f.name, f.location, f.address, f."affiliateUrl"), ' ') AS text
      FROM "Facilities" f
      WHERE f."organizationId" = o.id AND f."affiliateUrl" IS NOT NULL
    ) facility_counts ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS count
      FROM "Teams" t
      WHERE t."organizationId" = o.id AND t."affiliateUrl" IS NOT NULL
    ) team_counts ON true
    LEFT JOIN LATERAL (
      SELECT
        array_agg(DISTINCT s."targetKind") FILTER (WHERE s."targetKind" IS NOT NULL) AS kinds,
        string_agg(concat_ws(' ', s.name, s."sourceKey", s."targetKind", s.notes, s."listUrl", s."baseUrl"), ' ') AS text
      FROM "AffiliateScrapeSources" s
      WHERE s."organizationId" = o.id
    ) source_counts ON true
    LEFT JOIN LATERAL (
      SELECT
        array_agg(DISTINCT c."listingKind") FILTER (WHERE c."listingKind" IS NOT NULL) AS kinds,
        string_agg(concat_ws(' ', c.title, c."listingKind", c."sportName", c."formatLabel", c."participantOptionsText", c."statusText", c.description, c."sourceUrl", c."officialActionUrl"), ' ') AS text
      FROM "AffiliateImportCandidates" c
      WHERE c."publishedOrganizationId" = o.id
    ) candidate_counts ON true
    WHERE o.id LIKE 'affiliate_org_%'
    ORDER BY o.name ASC
  `);

  return rows
    .map((row) => ({
      ...row,
      name: row.name ?? row.id,
      sourceTargetKinds: arrayFromPg(row.sourceTargetKinds),
      candidateKinds: arrayFromPg(row.candidateKinds),
      eventTypes: arrayFromPg(row.eventTypes),
    }))
    .filter((row) => {
      if (!orgFilter) return true;
      return normalize(`${row.id} ${row.name} ${row.website ?? ''}`).includes(orgFilter);
    }) as OrgRow[];
};

const ensureSystemTags = async () => {
  for (const tag of SYSTEM_TAGS) {
    await client.query(`
      INSERT INTO "OrganizationTags" ("id", "createdAt", "updatedAt", "name", "slug", "isSystem")
      VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3, true)
      ON CONFLICT ("slug") DO UPDATE
      SET "name" = EXCLUDED."name", "isSystem" = true, "updatedAt" = CURRENT_TIMESTAMP
    `, [tag.id, tag.name, tag.slug]);
  }
};

const main = async () => {
  await client.connect();
  await ensureSystemTags();
  const organizations = await loadOrganizations();
  const tagBySlug = new Map(SYSTEM_TAGS.map((tag) => [tag.slug, tag]));
  const assignments = organizations.map((org) => ({
    organization: org,
    tagSlugs: inferTags(org),
  }));

  if (write) {
    const organizationIds = assignments.map(({ organization }) => organization.id);
    if (organizationIds.length) {
      await client.query(`
        DELETE FROM "OrganizationTagAssignments" a
        USING "OrganizationTags" t
        WHERE a."tagId" = t.id
          AND t."isSystem" = true
          AND a."organizationId" = ANY($1::text[])
      `, [organizationIds]);
    }

    for (const { organization, tagSlugs } of assignments) {
      for (const slug of tagSlugs) {
        const tag = tagBySlug.get(slug);
        if (!tag) continue;
        await client.query(`
          INSERT INTO "OrganizationTagAssignments" ("id", "createdAt", "organizationId", "tagId", "tagNameSnapshot")
          VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4)
          ON CONFLICT ("organizationId", "tagId") DO UPDATE
          SET "tagNameSnapshot" = EXCLUDED."tagNameSnapshot"
        `, [makeAssignmentId(organization.id, tag.id), organization.id, tag.id, tag.name]);
      }
    }
  }

  const summary = assignments.reduce<Record<string, number>>((acc, assignment) => {
    for (const slug of assignment.tagSlugs) {
      acc[slug] = (acc[slug] ?? 0) + 1;
    }
    return acc;
  }, {});

  const rows = assignments.map(({ organization, tagSlugs }) => ({
    id: organization.id,
    name: organization.name,
    status: organization.status,
    website: organization.website,
    eventCount: organization.eventCount,
    facilityCount: organization.facilityCount,
    teamCount: organization.teamCount,
    sourceTargetKinds: organization.sourceTargetKinds,
    candidateKinds: organization.candidateKinds,
    eventTypes: organization.eventTypes,
    tags: tagSlugs,
  }));

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = `${outputDir}/${useLive ? 'live' : 'local'}-${new Date().toISOString().replace(/[:.]/g, '-')}${write ? '-write' : '-dry-run'}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), write, useLive, summary, rows }, null, 2)}\n`);

  console.log(`${write ? '[write]' : '[dry-run]'} tagged ${assignments.length} affiliate orgs.`);
  console.table(Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)).map(([tag, count]) => ({ tag, count })));
  console.log(`Report: ${outputPath}`);
  await client.end();
};

main().catch(async (error) => {
  console.error(error);
  await client.end().catch(() => undefined);
  process.exitCode = 1;
});
