/**
 * Synchronizes local affiliate organization profiles, current logo files, and
 * organization-tag assignments to the live database.
 *
 * The local database remains the source of truth. The command is dry-run by
 * default and requires `--apply` before it writes to DigitalOcean Spaces or the
 * live database. Existing live logo objects are reused even when their original
 * local upload files have been cleaned up. It never deletes live organizations
 * or published content.
 *
 * Usage:
 *   npm run affiliate:orgs:sync-live
 *   npm run affiliate:orgs:sync-live -- --apply
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const apply = process.argv.includes('--apply');
const consolidateDuplicates = process.argv.includes('--consolidate-duplicates');
const OWNER_EMAIL = 'samuel.r@razumly.com';
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'affiliate-org-live-sync');
const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT?.trim() || 'uploads');

const ORGANIZATION_COLUMNS = [
  'id',
  'createdAt',
  'updatedAt',
  'name',
  'location',
  'address',
  'description',
  'logoId',
  'ownerId',
  'website',
  'sports',
  'enabledFeatures',
  'status',
  'hasStripeAccount',
  'verificationStatus',
  'verifiedAt',
  'verificationReviewStatus',
  'verificationReviewNotes',
  'verificationReviewUpdatedAt',
  'coordinates',
  'publicSlug',
  'publicPageEnabled',
  'publicWidgetsEnabled',
  'brandPrimaryColor',
  'brandAccentColor',
  'publicHeadline',
  'publicIntroText',
  'embedAllowedDomains',
  'publicCompletionRedirectUrl',
  'taxOrganizationType',
  'operatesAthleticFacility',
  'defaultEventTaxHandling',
  'defaultRentalTaxHandling',
  'taxResponsibilityAcceptedAt',
  'taxResponsibilityAcceptedByUserId',
  'taxResponsibilityAgreementVersion',
] as const;

type OrganizationColumn = typeof ORGANIZATION_COLUMNS[number];
type OrganizationRow = Record<OrganizationColumn, unknown> & {
  id: string;
  name: string;
  logoId: string;
  publicSlug: string | null;
};

type FileRow = {
  id: string;
  uploaderId: string | null;
  organizationId: string | null;
  bucket: string | null;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  path: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type TagRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  slug: string;
  isSystem: boolean;
};

type TagAssignmentRow = {
  id: string;
  createdAt: Date;
  organizationId: string;
  tagId: string;
  tagNameSnapshot: string;
};

type LiveOrganizationRow = {
  id: string;
  name: string;
  website: string | null;
  logoId: string | null;
  publicSlug: string | null;
  publicPageEnabled: boolean;
  status: string;
};

type OrganizationReference = {
  tableName: string;
  count: number;
};

type DuplicateOrganizationPlan = {
  duplicateId: string;
  targetId: string;
  name: string;
  publicSlug: string;
  references: OrganizationReference[];
  publishedCandidateCount: number;
};

type StoredLogo = {
  bucket: string;
  path: string;
  sizeBytes: number;
};

const requireUrl = (name: 'DATABASE_URL' | 'DATABASE_URL_LIVE'): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
};

const withoutSslMode = (value: string): string => {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
};

const localClient = new Client({
  connectionString: withoutSslMode(requireUrl('DATABASE_URL')),
  ssl: false,
});

const liveClient = new Client({
  connectionString: withoutSslMode(requireUrl('DATABASE_URL_LIVE')),
  ssl: { rejectUnauthorized: false },
});

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const normalizeWebsite = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
};

const normalizeName = (value: unknown): string => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tableExists = async (client: Client, tableName: string): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return result.rows[0]?.exists === true;
};

const resolveLocalLogoPath = (relativePath: string): string => {
  const absolutePath = path.resolve(LOCAL_STORAGE_ROOT, relativePath);
  const relativeToRoot = path.relative(LOCAL_STORAGE_ROOT, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Invalid local logo path: ${relativePath}`);
  }
  return absolutePath;
};

const loadLocalState = async () => {
  const organizationResult = await localClient.query<OrganizationRow>(
    `SELECT ${ORGANIZATION_COLUMNS.map(quoteIdentifier).join(', ')}
     FROM "Organizations"
     WHERE id LIKE 'affiliate_org_%'
     ORDER BY name ASC, id ASC`,
  );
  const organizations = organizationResult.rows;
  const logoIds = organizations.map((organization) => organization.logoId);
  const fileResult = await localClient.query<FileRow>(
    `SELECT id, "uploaderId", "organizationId", bucket, "originalName", "mimeType",
            "sizeBytes", path, "createdAt", "updatedAt"
     FROM "File"
     WHERE id = ANY($1::text[])`,
    [logoIds],
  );

  const tagSchemaAvailable = await tableExists(localClient, 'OrganizationTags')
    && await tableExists(localClient, 'OrganizationTagAssignments');
  const tags = tagSchemaAvailable
    ? (await localClient.query<TagRow>(
      `SELECT id, "createdAt", "updatedAt", name, slug, "isSystem"
       FROM "OrganizationTags"
       WHERE id IN (
         SELECT DISTINCT "tagId"
         FROM "OrganizationTagAssignments"
         WHERE "organizationId" = ANY($1::text[])
       )
       ORDER BY name ASC`,
      [organizations.map((organization) => organization.id)],
    )).rows
    : [];
  const assignments = tagSchemaAvailable
    ? (await localClient.query<TagAssignmentRow>(
      `SELECT id, "createdAt", "organizationId", "tagId", "tagNameSnapshot"
       FROM "OrganizationTagAssignments"
       WHERE "organizationId" = ANY($1::text[])
       ORDER BY "organizationId", "createdAt", id`,
      [organizations.map((organization) => organization.id)],
    )).rows
    : [];

  return { organizations, files: fileResult.rows, tags, assignments, tagSchemaAvailable };
};

const loadLiveSummary = async (
  organizationIds: string[],
  publicSlugs: string[],
  localLogoIds: string[],
) => {
  const organizationResult = await liveClient.query<LiveOrganizationRow>(
    `SELECT id, name, website, "logoId", "publicSlug", "publicPageEnabled", status
     FROM "Organizations"
     WHERE id = ANY($1::text[]) OR "publicSlug" = ANY($2::text[])`,
    [organizationIds, publicSlugs],
  );
  const fileResult = await liveClient.query<FileRow>(
    `SELECT id, "uploaderId", "organizationId", bucket, "originalName", "mimeType",
            "sizeBytes", path, "createdAt", "updatedAt"
     FROM "File"
     WHERE id = ANY($1::text[])`,
    [localLogoIds],
  );
  return { organizations: organizationResult.rows, files: fileResult.rows };
};

const loadOrganizationReferences = async (organizationId: string): Promise<OrganizationReference[]> => {
  const tableResult = await liveClient.query<{ tableName: string }>(
    `SELECT table_name AS "tableName"
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = 'organizationId'
       AND table_name NOT IN ('Organizations', 'OrganizationTagAssignments', 'File')
     ORDER BY table_name`,
  );
  const references: OrganizationReference[] = [];
  for (const { tableName } of tableResult.rows) {
    const result = await liveClient.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM ${quoteIdentifier(tableName)}
       WHERE "organizationId" = $1`,
      [organizationId],
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) references.push({ tableName, count });
  }
  return references;
};

const buildDuplicatePlan = async (
  localOrganization: OrganizationRow,
  duplicate: LiveOrganizationRow,
): Promise<DuplicateOrganizationPlan> => {
  const namesMatch = normalizeName(localOrganization.name) === normalizeName(duplicate.name);
  const localWebsite = normalizeWebsite(localOrganization.website);
  const duplicateWebsite = normalizeWebsite(duplicate.website);
  const websitesMatch = !localWebsite || !duplicateWebsite || localWebsite === duplicateWebsite;
  if (!duplicate.id.startsWith('affiliate_org_') || !namesMatch || !websitesMatch) {
    throw new Error(
      `Refusing to consolidate unrelated slug owner ${duplicate.id} into ${localOrganization.id}.`,
    );
  }
  const candidateResult = await liveClient.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM "AffiliateImportCandidates"
     WHERE "publishedOrganizationId" = $1`,
    [duplicate.id],
  );
  return {
    duplicateId: duplicate.id,
    targetId: localOrganization.id,
    name: localOrganization.name,
    publicSlug: localOrganization.publicSlug ?? '',
    references: await loadOrganizationReferences(duplicate.id),
    publishedCandidateCount: Number(candidateResult.rows[0]?.count ?? 0),
  };
};

const uploadLogos = async (
  files: FileRow[],
  liveFilesById: Map<string, FileRow>,
): Promise<{ storedById: Map<string, StoredLogo>; uploaded: number; reused: number }> => {
  process.env.STORAGE_PROVIDER = 'spaces';
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const storedById = new Map<string, StoredLogo>();
  let uploaded = 0;
  let reused = 0;

  for (const file of files) {
    const existing = liveFilesById.get(file.id);
    if (existing?.bucket && existing.path && existing.sizeBytes === file.sizeBytes) {
      const head = await storage.headObject({ key: existing.path, bucket: existing.bucket });
      if (head.exists) {
        storedById.set(file.id, {
          bucket: existing.bucket,
          path: existing.path,
          sizeBytes: existing.sizeBytes ?? head.sizeBytes ?? 0,
        });
        reused += 1;
        continue;
      }
    }

    const localPath = resolveLocalLogoPath(file.path);
    const data = await fs.readFile(localPath);
    if (!apply) {
      storedById.set(file.id, {
        bucket: process.env.DO_SPACES_BUCKET ?? 'mvp-storage',
        path: file.path,
        sizeBytes: data.length,
      });
      uploaded += 1;
      continue;
    }

    const stored = await storage.putObject({
      data,
      originalName: file.originalName,
      contentType: file.mimeType ?? 'image/png',
      organizationId: file.organizationId ?? undefined,
    });
    if (!stored.bucket) throw new Error(`Spaces upload for ${file.id} did not return a bucket.`);
    storedById.set(file.id, {
      bucket: stored.bucket,
      path: stored.key,
      sizeBytes: stored.sizeBytes,
    });
    uploaded += 1;
  }

  return { storedById, uploaded, reused };
};

const writeLiveState = async (
  organizations: OrganizationRow[],
  files: FileRow[],
  storedLogos: Map<string, StoredLogo>,
  tags: TagRow[],
  assignments: TagAssignmentRow[],
  liveOwnerId: string,
  duplicatePlans: DuplicateOrganizationPlan[],
) => {
  await liveClient.query('BEGIN');
  try {
    for (const plan of duplicatePlans) {
      await liveClient.query(
        `UPDATE "Organizations"
         SET "publicSlug" = NULL, "publicPageEnabled" = false, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [plan.duplicateId],
      );
    }

    for (const file of files) {
      const stored = storedLogos.get(file.id);
      if (!stored) throw new Error(`Missing uploaded logo result for ${file.id}.`);
      await liveClient.query(
        `INSERT INTO "File"
          (id, "uploaderId", "organizationId", bucket, "originalName", "mimeType", "sizeBytes", path, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           "uploaderId" = EXCLUDED."uploaderId",
           "organizationId" = EXCLUDED."organizationId",
           bucket = EXCLUDED.bucket,
           "originalName" = EXCLUDED."originalName",
           "mimeType" = EXCLUDED."mimeType",
           "sizeBytes" = EXCLUDED."sizeBytes",
           path = EXCLUDED.path,
           "updatedAt" = CURRENT_TIMESTAMP`,
        [
          file.id,
          liveOwnerId,
          file.organizationId,
          stored.bucket,
          file.originalName,
          file.mimeType ?? 'image/png',
          stored.sizeBytes,
          stored.path,
          file.createdAt,
        ],
      );
    }

    const insertColumns = ORGANIZATION_COLUMNS.map(quoteIdentifier).join(', ');
    const placeholders = ORGANIZATION_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');
    const updateColumns = ORGANIZATION_COLUMNS
      .filter((column) => column !== 'id' && column !== 'createdAt')
      .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
      .join(', ');
    for (const organization of organizations) {
      const values = ORGANIZATION_COLUMNS.map((column) => {
        if (column === 'ownerId') return liveOwnerId;
        if (column === 'updatedAt') return new Date();
        if (column === 'coordinates' && organization[column] != null) {
          return JSON.stringify(organization[column]);
        }
        return organization[column];
      });
      await liveClient.query(
        `INSERT INTO "Organizations" (${insertColumns})
         VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${updateColumns}`,
        values,
      );
    }

    for (const plan of duplicatePlans) {
      for (const reference of plan.references) {
        await liveClient.query(
          `UPDATE ${quoteIdentifier(reference.tableName)}
           SET "organizationId" = $1
           WHERE "organizationId" = $2`,
          [plan.targetId, plan.duplicateId],
        );
      }
      await liveClient.query(
        `UPDATE "AffiliateImportCandidates"
         SET "publishedOrganizationId" = $1, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "publishedOrganizationId" = $2`,
        [plan.targetId, plan.duplicateId],
      );
      await liveClient.query(
        `DELETE FROM "OrganizationTagAssignments" WHERE "organizationId" = $1`,
        [plan.duplicateId],
      );
      const remainingReferences = await loadOrganizationReferences(plan.duplicateId);
      const remainingCandidates = await liveClient.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM "AffiliateImportCandidates"
         WHERE "publishedOrganizationId" = $1`,
        [plan.duplicateId],
      );
      if (remainingReferences.length || Number(remainingCandidates.rows[0]?.count ?? 0) > 0) {
        throw new Error(`Duplicate ${plan.duplicateId} still has references after relink.`);
      }
      await liveClient.query(`DELETE FROM "Organizations" WHERE id = $1`, [plan.duplicateId]);
    }

    for (const tag of tags) {
      await liveClient.query(
        `INSERT INTO "OrganizationTags" (id, "createdAt", "updatedAt", name, slug, "isSystem")
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           "updatedAt" = CURRENT_TIMESTAMP,
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           "isSystem" = EXCLUDED."isSystem"`,
        [tag.id, tag.createdAt, tag.name, tag.slug, tag.isSystem],
      );
    }

    const organizationIds = organizations.map((organization) => organization.id);
    await liveClient.query(
      `DELETE FROM "OrganizationTagAssignments" WHERE "organizationId" = ANY($1::text[])`,
      [organizationIds],
    );
    for (const assignment of assignments) {
      await liveClient.query(
        `INSERT INTO "OrganizationTagAssignments"
          (id, "createdAt", "organizationId", "tagId", "tagNameSnapshot")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("organizationId", "tagId") DO UPDATE SET
           "tagNameSnapshot" = EXCLUDED."tagNameSnapshot"`,
        [
          assignment.id,
          assignment.createdAt,
          assignment.organizationId,
          assignment.tagId,
          assignment.tagNameSnapshot,
        ],
      );
    }

    await liveClient.query('COMMIT');
  } catch (error) {
    await liveClient.query('ROLLBACK');
    throw error;
  }
};

const main = async () => {
  await Promise.all([localClient.connect(), liveClient.connect()]);
  const localState = await loadLocalState();
  if (!localState.organizations.length) throw new Error('No local affiliate organizations were found.');
  if (localState.organizations.some((organization) => !organization.logoId)) {
    throw new Error('Every local affiliate organization must have a logo before live sync.');
  }
  if (localState.files.length !== localState.organizations.length) {
    throw new Error(
      `Expected one logo file per org, found ${localState.files.length} files for ${localState.organizations.length} orgs.`,
    );
  }
  const liveTagSchemaAvailable = await tableExists(liveClient, 'OrganizationTags')
    && await tableExists(liveClient, 'OrganizationTagAssignments');
  const ownerResult = await liveClient.query<{ id: string }>(
    `SELECT id FROM "AuthUser" WHERE email = $1 LIMIT 1`,
    [OWNER_EMAIL],
  );
  const liveOwnerId = ownerResult.rows[0]?.id;
  if (!liveOwnerId) throw new Error(`Live owner ${OWNER_EMAIL} was not found.`);

  const publicSlugs = localState.organizations
    .map((organization) => organization.publicSlug)
    .filter((slug): slug is string => Boolean(slug));
  const liveState = await loadLiveSummary(
    localState.organizations.map((organization) => organization.id),
    publicSlugs,
    localState.files.map((file) => file.id),
  );
  const localIds = new Set(localState.organizations.map((organization) => organization.id));
  const slugConflicts = liveState.organizations.filter((organization) => (
    organization.publicSlug
    && !localIds.has(organization.id)
    && publicSlugs.includes(organization.publicSlug)
  ));
  const localBySlug = new Map(
    localState.organizations
      .filter((organization) => organization.publicSlug)
      .map((organization) => [organization.publicSlug as string, organization]),
  );
  const duplicatePlans: DuplicateOrganizationPlan[] = [];
  for (const duplicate of slugConflicts) {
    const localOrganization = duplicate.publicSlug ? localBySlug.get(duplicate.publicSlug) : null;
    if (!localOrganization) throw new Error(`No local target found for slug conflict ${duplicate.id}.`);
    duplicatePlans.push(await buildDuplicatePlan(localOrganization, duplicate));
  }
  if (duplicatePlans.length && !consolidateDuplicates) {
    throw new Error(
      `Live public slug conflicts require --consolidate-duplicates: ${JSON.stringify(duplicatePlans)}`,
    );
  }

  const liveFilesById = new Map(liveState.files.map((file) => [file.id, file]));
  const logoResult = await uploadLogos(localState.files, liveFilesById);
  const existingIds = new Set(liveState.organizations.map((organization) => organization.id));
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    localAffiliateOrganizations: localState.organizations.length,
    liveMatchingOrganizationsBefore: localState.organizations.filter((organization) => existingIds.has(organization.id)).length,
    organizationsToCreate: localState.organizations.filter((organization) => !existingIds.has(organization.id)).length,
    organizationsToUpdate: localState.organizations.filter((organization) => existingIds.has(organization.id)).length,
    localLogoFiles: localState.files.length,
    logoObjectsToUpload: logoResult.uploaded,
    logoObjectsReused: logoResult.reused,
    organizationTags: localState.tags.length,
    organizationTagAssignments: localState.assignments.length,
    localTagSchemaAvailable: localState.tagSchemaAvailable,
    liveTagSchemaAvailable,
    duplicateOrganizationsToConsolidate: duplicatePlans,
    ownerEmail: OWNER_EMAIL,
  };
  console.log(JSON.stringify(report, null, 2));

  if (apply) {
    if (!localState.tagSchemaAvailable || !liveTagSchemaAvailable) {
      throw new Error('Organization tag tables must exist locally and live before applying the sync.');
    }
    await writeLiveState(
      localState.organizations,
      localState.files,
      logoResult.storedById,
      localState.tags,
      localState.assignments,
      liveOwnerId,
      duplicatePlans,
    );

    const verification = await liveClient.query<{
      organizations: number;
      logos: number;
      assignments: number;
    }>(
      `SELECT
         count(DISTINCT o.id)::int AS organizations,
         count(DISTINCT f.id)::int AS logos,
         count(DISTINCT a.id)::int AS assignments
       FROM "Organizations" o
       LEFT JOIN "File" f ON f.id = o."logoId"
       LEFT JOIN "OrganizationTagAssignments" a ON a."organizationId" = o.id
       WHERE o.id = ANY($1::text[])`,
      [localState.organizations.map((organization) => organization.id)],
    );
    Object.assign(report, { verification: verification.rows[0] });
    console.log(JSON.stringify({ verification: verification.rows[0] }, null, 2));
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${apply ? 'apply' : 'dry-run'}-${Date.now()}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Report: ${outputPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([localClient.end(), liveClient.end()]);
  });
