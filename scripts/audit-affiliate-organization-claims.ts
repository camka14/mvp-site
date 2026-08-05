/**
 * Audits and repairs the historical false ownership defaults on affiliate
 * organizations. The command is read-only unless --write is present. A write
 * also requires the exact digest from a reviewed dry-run report.
 *
 * Usage:
 *   npm run affiliate:org-claims:audit
 *   npm run affiliate:org-claims:audit -- --org=<organization-id>
 *   npm run affiliate:org-claims:audit -- --write --expected-digest=<sha256>
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import {
  classifyOwnershipRepair,
  type OwnershipRepairAction,
  type OwnershipRepairInput,
  type OwnershipRepairReason,
} from '../src/server/organizationClaims/ownershipRepair';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error(
    '--live is no longer supported. Run this command in the approved runtime environment with its DATABASE_URL.',
  );
}

const shouldWrite = process.argv.includes('--write');
const organizationArg = process.argv.find((argument) => argument.startsWith('--org='));
const organizationIdFilter = organizationArg?.slice('--org='.length).trim() || null;
const digestArg = process.argv.find((argument) => argument.startsWith('--expected-digest='));
const expectedDigest = digestArg?.slice('--expected-digest='.length).trim().toLowerCase() || null;
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'affiliate-organization-claims');
const REPAIR_LOCK_NAME = 'bracketiq:affiliate-organization-ownership-repair:v1';

type AffiliateEvidenceReason =
  | 'AFFILIATE_SOURCE_CONFIGURATION'
  | 'PUBLISHED_AFFILIATE_CANDIDATE'
  | 'AFFILIATE_EVENT'
  | 'AFFILIATE_TEAM'
  | 'AFFILIATE_FACILITY';

type OwnershipFields = {
  originType: string;
  ownershipStatus: string;
  claimedAt: Date | null;
  claimedByUserId: string | null;
  claimVerificationLevel: string;
  ownershipVerifiedAt: Date | null;
  ownershipVerificationLastCheckedAt: Date | null;
};

type AuditOrganization = OwnershipFields & {
  id: string;
  name: string;
  ownerId: string;
};

type AuditRow = {
  organizationId: string;
  organizationName: string;
  affiliateEvidenceReasons: AffiliateEvidenceReason[];
  ownerIsRazumlyAdmin: boolean;
  claimCount: number;
  ownershipClaimEventCount: number;
  domainCount: number;
  primaryDomainHost: string | null;
  current: OwnershipFields;
  desired: OwnershipFields;
  action: OwnershipRepairAction;
  reasons: OwnershipRepairReason[];
};

type RepairAuditRow = AuditRow & {
  currentOwnerId: string;
};

type RollbackRow = {
  organizationId: string;
  ownerId: string;
  original: OwnershipFields;
};

const pushEvidence = (
  map: Map<string, Set<AffiliateEvidenceReason>>,
  organizationId: string | null | undefined,
  reason: AffiliateEvidenceReason,
): void => {
  if (!organizationId) return;
  const values = map.get(organizationId) ?? new Set<AffiliateEvidenceReason>();
  values.add(reason);
  map.set(organizationId, values);
};

const countByOrganization = (rows: Array<{ organizationId: string }>): Map<string, number> => {
  const counts = new Map<string, number>();
  rows.forEach(({ organizationId }) => {
    counts.set(organizationId, (counts.get(organizationId) ?? 0) + 1);
  });
  return counts;
};

const csvCell = (value: unknown): string => {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const serializeDate = (value: Date | string | null): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const stableOwnershipFields = (value: OwnershipFields) => ({
  originType: value.originType,
  ownershipStatus: value.ownershipStatus,
  claimedAt: serializeDate(value.claimedAt),
  claimedByUserId: value.claimedByUserId,
  claimVerificationLevel: value.claimVerificationLevel,
  ownershipVerifiedAt: serializeDate(value.ownershipVerifiedAt),
  ownershipVerificationLastCheckedAt: serializeDate(value.ownershipVerificationLastCheckedAt),
});

const repairInputFor = (
  organization: AuditOrganization,
  input: {
    hasAffiliateEvidence: boolean;
    ownerIsRazumlyAdmin: boolean;
    claimCount: number;
    ownershipClaimEventCount: number;
  },
): OwnershipRepairInput => ({
  hasAffiliateEvidence: input.hasAffiliateEvidence,
  originType: organization.originType,
  ownershipStatus: organization.ownershipStatus,
  claimedAt: organization.claimedAt,
  claimedByUserId: organization.claimedByUserId,
  claimVerificationLevel: organization.claimVerificationLevel,
  ownershipVerifiedAt: organization.ownershipVerifiedAt,
  ownershipVerificationLastCheckedAt: organization.ownershipVerificationLastCheckedAt,
  ownerIsRazumlyAdmin: input.ownerIsRazumlyAdmin,
  claimCount: input.claimCount,
  ownershipClaimEventCount: input.ownershipClaimEventCount,
});

const desiredOwnershipFields = (organization: AuditOrganization, action: OwnershipRepairAction): OwnershipFields => (
  action === 'REPAIR_FALSE_DEFAULT_CLAIM'
    ? {
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'UNCLAIMED',
      claimedAt: null,
      claimedByUserId: null,
      claimVerificationLevel: 'NONE',
      ownershipVerifiedAt: null,
      ownershipVerificationLastCheckedAt: null,
    }
    : {
      originType: organization.originType,
      ownershipStatus: organization.ownershipStatus,
      claimedAt: organization.claimedAt,
      claimedByUserId: organization.claimedByUserId,
      claimVerificationLevel: organization.claimVerificationLevel,
      ownershipVerifiedAt: organization.ownershipVerifiedAt,
      ownershipVerificationLastCheckedAt: organization.ownershipVerificationLastCheckedAt,
    }
);

const databaseFingerprint = (databaseUrl: string): string => {
  const parsed = new URL(databaseUrl);
  const port = parsed.port || '5432';
  const databaseName = parsed.pathname.replace(/^\//, '') || '(default)';
  return `${parsed.hostname}:${port}/${databaseName}`;
};

const reportDigest = (rows: RepairAuditRow[]): string => createHash('sha256')
  .update(JSON.stringify(rows.map((row) => ({
    organizationId: row.organizationId,
    currentOwnerId: row.currentOwnerId,
    affiliateEvidenceReasons: row.affiliateEvidenceReasons,
    ownerIsRazumlyAdmin: row.ownerIsRazumlyAdmin,
    claimCount: row.claimCount,
    ownershipClaimEventCount: row.ownershipClaimEventCount,
    current: stableOwnershipFields(row.current),
    action: row.action,
    reasons: row.reasons,
  }))))
  .digest('hex');

const writeReportFiles = async (
  baseName: string,
  report: Record<string, unknown> & { rows: AuditRow[] },
): Promise<void> => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(OUTPUT_DIR, `${baseName}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    ),
    fs.writeFile(
      path.join(OUTPUT_DIR, `${baseName}.csv`),
      [
        [
          'organizationId',
          'organizationName',
          'affiliateEvidenceReasons',
          'originType',
          'ownershipStatus',
          'ownerIsRazumlyAdmin',
          'claimCount',
          'ownershipClaimEventCount',
          'domainCount',
          'primaryDomainHost',
          'action',
          'reasons',
        ].map(csvCell).join(','),
        ...report.rows.map((row) => [
          row.organizationId,
          row.organizationName,
          row.affiliateEvidenceReasons,
          row.current.originType,
          row.current.ownershipStatus,
          row.ownerIsRazumlyAdmin,
          row.claimCount,
          row.ownershipClaimEventCount,
          row.domainCount,
          row.primaryDomainHost,
          row.action,
          row.reasons,
        ].map(csvCell).join(',')),
      ].join('\n').concat('\n'),
      'utf8',
    ),
  ]);
};

const repairRows = async (
  databaseUrl: string,
  candidates: RepairAuditRow[],
): Promise<{ repaired: string[]; skippedStateChanged: string[]; rollback: RollbackRow[] }> => {
  const client = new Client({ connectionString: databaseUrl });
  const repaired: string[] = [];
  const skippedStateChanged: string[] = [];
  const rollback: RollbackRow[] = [];
  await client.connect();
  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [REPAIR_LOCK_NAME],
    );
    if (!lockResult.rows[0]?.acquired) {
      throw new Error('Another affiliate ownership repair is running.');
    }

    for (const candidate of candidates) {
      await client.query('BEGIN');
      try {
        const locked = await client.query<AuditOrganization>(
          `SELECT id, name, "ownerId", "originType", "ownershipStatus", "claimedAt",
                  "claimedByUserId", "claimVerificationLevel", "ownershipVerifiedAt",
                  "ownershipVerificationLastCheckedAt"
             FROM "Organizations"
            WHERE id = $1
            FOR UPDATE`,
          [candidate.organizationId],
        );
        const organization = locked.rows[0];
        if (!organization || organization.ownerId !== candidate.currentOwnerId) {
          skippedStateChanged.push(candidate.organizationId);
          await client.query('ROLLBACK');
          continue;
        }
        const history = await client.query<{
          claimCount: number;
          eventCount: number;
          hasAffiliateEvidence: boolean;
        }>(
          `SELECT
             (SELECT count(*)::int FROM "OrganizationClaims" WHERE "organizationId" = $1) AS "claimCount",
             (SELECT count(*)::int FROM "OrganizationClaimEvents" WHERE "organizationId" = $1) AS "eventCount",
             (
               EXISTS (SELECT 1 FROM "AffiliateScrapeSources" WHERE "organizationId" = $1)
               OR EXISTS (SELECT 1 FROM "AffiliateImportCandidates" WHERE "publishedOrganizationId" = $1)
               OR EXISTS (
                 SELECT 1 FROM "Events"
                  WHERE "organizationId" = $1
                    AND ("sourceType" = 'AFFILIATE_IMPORT' OR COALESCE("affiliateUrl", '') <> '')
               )
               OR EXISTS (
                 SELECT 1 FROM "Teams"
                  WHERE "organizationId" = $1
                    AND ("sourceType" = 'AFFILIATE_IMPORT' OR COALESCE("affiliateUrl", '') <> '')
               )
               OR EXISTS (
                 SELECT 1 FROM "Facilities"
                  WHERE "organizationId" = $1 AND COALESCE("affiliateUrl", '') <> ''
               )
             ) AS "hasAffiliateEvidence"`,
          [candidate.organizationId],
        );
        const decision = classifyOwnershipRepair(repairInputFor(organization, {
          hasAffiliateEvidence: Boolean(history.rows[0]?.hasAffiliateEvidence),
          ownerIsRazumlyAdmin: candidate.ownerIsRazumlyAdmin,
          claimCount: Number(history.rows[0]?.claimCount ?? 0),
          ownershipClaimEventCount: Number(history.rows[0]?.eventCount ?? 0),
        }));
        if (decision.action !== 'REPAIR_FALSE_DEFAULT_CLAIM') {
          skippedStateChanged.push(candidate.organizationId);
          await client.query('ROLLBACK');
          continue;
        }
        const update = await client.query(
          `UPDATE "Organizations"
              SET "originType" = 'AFFILIATE_IMPORTED',
                  "ownershipStatus" = 'UNCLAIMED',
                  "claimedAt" = NULL,
                  "claimedByUserId" = NULL,
                  "claimVerificationLevel" = 'NONE',
                  "ownershipVerifiedAt" = NULL,
                  "ownershipVerificationLastCheckedAt" = NULL,
                  "updatedAt" = NOW()
            WHERE id = $1
              AND "ownerId" = $2
              AND "originType" = 'FIRST_PARTY'
              AND "ownershipStatus" = 'CLAIMED'
              AND "claimedAt" IS NULL
              AND "claimedByUserId" IS NULL
              AND "claimVerificationLevel" = 'NONE'
              AND "ownershipVerifiedAt" IS NULL
              AND "ownershipVerificationLastCheckedAt" IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM "OrganizationClaims" WHERE "organizationId" = $1
              )
              AND NOT EXISTS (
                SELECT 1 FROM "OrganizationClaimEvents" WHERE "organizationId" = $1
              )
              AND (
                EXISTS (SELECT 1 FROM "AffiliateScrapeSources" WHERE "organizationId" = $1)
                OR EXISTS (SELECT 1 FROM "AffiliateImportCandidates" WHERE "publishedOrganizationId" = $1)
                OR EXISTS (
                  SELECT 1 FROM "Events"
                   WHERE "organizationId" = $1
                     AND ("sourceType" = 'AFFILIATE_IMPORT' OR COALESCE("affiliateUrl", '') <> '')
                )
                OR EXISTS (
                  SELECT 1 FROM "Teams"
                   WHERE "organizationId" = $1
                     AND ("sourceType" = 'AFFILIATE_IMPORT' OR COALESCE("affiliateUrl", '') <> '')
                )
                OR EXISTS (
                  SELECT 1 FROM "Facilities"
                   WHERE "organizationId" = $1 AND COALESCE("affiliateUrl", '') <> ''
                )
              )
          RETURNING id`,
          [candidate.organizationId, organization.ownerId],
        );
        if (update.rowCount !== 1) {
          skippedStateChanged.push(candidate.organizationId);
          await client.query('ROLLBACK');
          continue;
        }
        rollback.push({
          organizationId: candidate.organizationId,
          ownerId: organization.ownerId,
          original: {
            originType: organization.originType,
            ownershipStatus: organization.ownershipStatus,
            claimedAt: organization.claimedAt,
            claimedByUserId: organization.claimedByUserId,
            claimVerificationLevel: organization.claimVerificationLevel,
            ownershipVerifiedAt: organization.ownershipVerifiedAt,
            ownershipVerificationLastCheckedAt: organization.ownershipVerificationLastCheckedAt,
          },
        });
        await client.query('COMMIT');
        repaired.push(candidate.organizationId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return { repaired, skippedStateChanged, rollback };
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [REPAIR_LOCK_NAME]).catch(() => undefined);
    await client.end();
  }
};

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (shouldWrite && !expectedDigest) {
    throw new Error('--write requires --expected-digest=<sha256> from a reviewed dry run.');
  }
  if (expectedDigest && !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error('--expected-digest must be a 64-character SHA-256 digest.');
  }

  const [{ prisma }, { evaluateRazumlyAdminAccess }] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/server/razumlyAdmin'),
  ]);
  const organizationWhere = organizationIdFilter ? { id: organizationIdFilter } : undefined;
  const [
    organizations,
    sources,
    candidates,
    events,
    teams,
    facilities,
    claims,
    claimEvents,
    domains,
  ] = await Promise.all([
    prisma.organizations.findMany({
      where: organizationWhere,
      select: {
        id: true,
        name: true,
        ownerId: true,
        originType: true,
        ownershipStatus: true,
        claimedAt: true,
        claimedByUserId: true,
        claimVerificationLevel: true,
        ownershipVerifiedAt: true,
        ownershipVerificationLastCheckedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.affiliateScrapeSources.findMany({ select: { organizationId: true } }),
    prisma.affiliateImportCandidates.findMany({
      where: { publishedOrganizationId: { not: null } },
      select: { publishedOrganizationId: true },
    }),
    prisma.events.findMany({
      where: {
        organizationId: { not: null },
        OR: [{ sourceType: 'AFFILIATE_IMPORT' }, { affiliateUrl: { notIn: [''] } }],
      },
      select: { organizationId: true },
    }),
    prisma.canonicalTeams.findMany({
      where: {
        organizationId: { not: null },
        OR: [{ sourceType: 'AFFILIATE_IMPORT' }, { affiliateUrl: { notIn: [''] } }],
      },
      select: { organizationId: true },
    }),
    prisma.facilities.findMany({
      where: { affiliateUrl: { notIn: [''] } },
      select: { organizationId: true },
    }),
    prisma.organizationClaims.findMany({ select: { organizationId: true } }),
    prisma.organizationClaimEvents.findMany({ select: { organizationId: true } }),
    prisma.organizationDomains.findMany({
      select: { organizationId: true, host: true, isPrimary: true },
    }),
  ]);

  if (organizationIdFilter && organizations.length === 0) {
    throw new Error(`Organization ${organizationIdFilter} was not found.`);
  }

  const evidenceByOrganization = new Map<string, Set<AffiliateEvidenceReason>>();
  sources.forEach((row) => pushEvidence(
    evidenceByOrganization,
    row.organizationId,
    'AFFILIATE_SOURCE_CONFIGURATION',
  ));
  candidates.forEach((row) => pushEvidence(
    evidenceByOrganization,
    row.publishedOrganizationId,
    'PUBLISHED_AFFILIATE_CANDIDATE',
  ));
  events.forEach((row) => pushEvidence(evidenceByOrganization, row.organizationId, 'AFFILIATE_EVENT'));
  teams.forEach((row) => pushEvidence(evidenceByOrganization, row.organizationId, 'AFFILIATE_TEAM'));
  facilities.forEach((row) => pushEvidence(
    evidenceByOrganization,
    row.organizationId,
    'AFFILIATE_FACILITY',
  ));

  const claimCounts = countByOrganization(claims);
  const eventCounts = countByOrganization(claimEvents);
  const domainsByOrganization = new Map<string, typeof domains>();
  domains.forEach((domain) => {
    domainsByOrganization.set(domain.organizationId, [
      ...(domainsByOrganization.get(domain.organizationId) ?? []),
      domain,
    ]);
  });
  const affiliateOrganizations = organizations.filter((organization) => (
    evidenceByOrganization.has(organization.id)
  ));
  const adminResults = await Promise.all(affiliateOrganizations.map(async (organization) => [
    organization.ownerId,
    await evaluateRazumlyAdminAccess(organization.ownerId),
  ] as const));
  const adminByUserId = new Map(adminResults);

  const rows: RepairAuditRow[] = affiliateOrganizations.map((organization) => {
    const affiliateEvidenceReasons = Array.from(
      evidenceByOrganization.get(organization.id) ?? [],
    ).sort() as AffiliateEvidenceReason[];
    const ownerIsRazumlyAdmin = Boolean(adminByUserId.get(organization.ownerId)?.allowed);
    const claimCount = claimCounts.get(organization.id) ?? 0;
    const ownershipClaimEventCount = eventCounts.get(organization.id) ?? 0;
    const decision = classifyOwnershipRepair(repairInputFor(organization, {
      hasAffiliateEvidence: true,
      ownerIsRazumlyAdmin,
      claimCount,
      ownershipClaimEventCount,
    }));
    const organizationDomains = domainsByOrganization.get(organization.id) ?? [];
    return {
      organizationId: organization.id,
      organizationName: organization.name,
      currentOwnerId: organization.ownerId,
      affiliateEvidenceReasons,
      ownerIsRazumlyAdmin,
      claimCount,
      ownershipClaimEventCount,
      domainCount: organizationDomains.length,
      primaryDomainHost: organizationDomains.find((domain) => domain.isPrimary)?.host ?? null,
      current: desiredOwnershipFields(organization, 'PRESERVE'),
      desired: desiredOwnershipFields(organization, decision.action),
      action: decision.action,
      reasons: decision.reasons,
    };
  });

  const digest = reportDigest(rows);
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const targetFingerprint = databaseFingerprint(databaseUrl);
  const counts = rows.reduce<Record<OwnershipRepairAction, number>>((result, row) => {
    result[row.action] += 1;
    return result;
  }, {
    REPAIR_FALSE_DEFAULT_CLAIM: 0,
    PRESERVE: 0,
    MANUAL_REVIEW: 0,
  });
  const reportRows: AuditRow[] = rows.map(({ currentOwnerId: _currentOwnerId, ...row }) => row);
  const report = {
    generatedAt,
    databaseFingerprint: targetFingerprint,
    mode: shouldWrite ? 'write' : 'dry-run',
    organizationIdFilter,
    digest,
    counts,
    repairableOrganizationIds: rows
      .filter((row) => row.action === 'REPAIR_FALSE_DEFAULT_CLAIM')
      .map((row) => row.organizationId),
    rows: reportRows,
  };
  const baseName = `${stamp}-${shouldWrite ? 'write' : 'dry-run'}`;
  await writeReportFiles(baseName, report);

  if (shouldWrite && expectedDigest !== digest) {
    throw new Error(
      `Ownership audit digest changed. Expected ${expectedDigest}; current digest is ${digest}. No rows changed.`,
    );
  }

  let writeResult = { repaired: [] as string[], skippedStateChanged: [] as string[] };
  if (shouldWrite) {
    const candidatesToRepair = rows.filter((row) => row.action === 'REPAIR_FALSE_DEFAULT_CLAIM');
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${baseName}-pre-change-rollback.json`),
      `${JSON.stringify({
        generatedAt,
        databaseFingerprint: targetFingerprint,
        sourceDigest: digest,
        rows: candidatesToRepair.map((row) => ({
          organizationId: row.organizationId,
          ownerId: row.currentOwnerId,
          original: stableOwnershipFields(row.current),
        })),
      }, null, 2)}\n`,
      'utf8',
    );
    const result = await repairRows(databaseUrl, candidatesToRepair);
    writeResult = {
      repaired: result.repaired,
      skippedStateChanged: result.skippedStateChanged,
    };
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${baseName}-rollback.json`),
      `${JSON.stringify({
        generatedAt,
        databaseFingerprint: targetFingerprint,
        sourceDigest: digest,
        rows: result.rollback.map((row) => ({
          ...row,
          original: stableOwnershipFields(row.original),
        })),
      }, null, 2)}\n`,
      'utf8',
    );
  }

  console.log(JSON.stringify({
    databaseFingerprint: targetFingerprint,
    mode: report.mode,
    affiliateOrganizations: rows.length,
    counts,
    digest,
    repaired: writeResult.repaired.length,
    skippedStateChanged: writeResult.skippedStateChanged.length,
    reportBaseName: baseName,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('../src/lib/prisma');
    await prisma.$disconnect();
  });
