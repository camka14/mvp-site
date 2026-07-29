/**
 * Classifies organization ownership without mutating by default.
 *
 * Usage:
 *   npm run affiliate:org-claims:audit
 *   npm run affiliate:org-claims:audit -- --org=<organization-id>
 *   npm run affiliate:org-claims:audit -- --write
 *   npm run affiliate:org-claims:audit -- --live
 *   npm run affiliate:org-claims:audit -- --live --write
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { classifyOrganizationClaimState } from '../src/server/organizationClaims/classification';
import { organizationDomainPolicyForUrl } from '../src/server/organizationClaims/domainPolicy';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const shouldWrite = process.argv.includes('--write');
const organizationArg = process.argv.find((argument) => argument.startsWith('--org='));
const organizationIdFilter = organizationArg?.slice('--org='.length).trim() || null;

if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('--live requires DATABASE_URL_LIVE.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'affiliate-organization-claims');
const MANAGEMENT_TYPES = new Set(['HOST', 'STAFF']);

type UrlEvidence = {
  url: string;
  source: string;
  priority: number;
  eligibleForPrimary: boolean;
};

type DirectDomainEvidence = UrlEvidence & {
  canonicalUrl: string;
  host: string;
  registrableDomain: string;
};

type AuditRow = {
  organizationId: string;
  organizationName: string;
  currentOriginType: string;
  currentOwnershipStatus: string;
  originType: 'FIRST_PARTY' | 'AFFILIATE_IMPORTED';
  ownershipStatus: 'UNCLAIMED' | 'CLAIMED' | 'REVIEW_REQUIRED';
  legacyClaimMethod: 'LEGACY_OWNER' | null;
  ownerAccountExists: boolean;
  ownerIsRazumlyAdmin: boolean;
  externalManagementCount: number;
  directDomains: string[];
  sharedPlatforms: string[];
  invalidUrlCount: number;
  primaryDomain: string | null;
  primaryDomainUrl: string | null;
  primaryDomainSource: string | null;
  reasons: string[];
  organizationChanged: boolean;
  domainChanged: boolean;
  legacyClaimCreated: boolean;
};

const pushMap = <T>(map: Map<string, T[]>, key: string | null | undefined, value: T): void => {
  if (!key) return;
  map.set(key, [...(map.get(key) ?? []), value]);
};

const deterministicId = (prefix: string, ...parts: string[]): string => (
  `${prefix}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)}`
);

const csvCell = (value: unknown): string => {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

const organizationDataChanged = (
  organization: {
    originType: string;
    ownershipStatus: string;
    claimedAt: Date | null;
    claimedByUserId: string | null;
    claimVerificationLevel: string;
    ownershipVerifiedAt: Date | null;
    ownershipVerificationLastCheckedAt: Date | null;
    ownerId: string;
  },
  classification: ReturnType<typeof classifyOrganizationClaimState>,
): boolean => {
  if (
    organization.originType !== classification.originType
    || organization.ownershipStatus !== classification.ownershipStatus
  ) {
    return true;
  }
  if (classification.legacyClaimMethod === 'LEGACY_OWNER') {
    return !organization.claimedAt
      || organization.claimedByUserId !== organization.ownerId
      || organization.claimVerificationLevel !== 'NONE'
      || Boolean(
        organization.ownershipVerifiedAt
        || organization.ownershipVerificationLastCheckedAt,
      );
  }
  if (classification.originType === 'AFFILIATE_IMPORTED') {
    return Boolean(
      organization.claimedAt
      || organization.claimedByUserId
      || organization.claimVerificationLevel !== 'NONE'
      || organization.ownershipVerifiedAt
      || organization.ownershipVerificationLastCheckedAt,
    );
  }
  return false;
};

const main = async (): Promise<void> => {
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
    staffMembers,
    managementPermissionRows,
    existingDomains,
    existingLegacyClaims,
  ] = await Promise.all([
    prisma.organizations.findMany({
      where: organizationWhere,
      select: {
        id: true,
        createdAt: true,
        name: true,
        ownerId: true,
        website: true,
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
    prisma.affiliateScrapeSources.findMany({
      select: { organizationId: true, baseUrl: true, listUrl: true },
    }),
    prisma.affiliateImportCandidates.findMany({
      where: { publishedOrganizationId: { not: null } },
      select: { publishedOrganizationId: true, listingKind: true, officialActionUrl: true },
    }),
    prisma.events.findMany({
      where: {
        organizationId: { not: null },
        OR: [{ sourceType: 'AFFILIATE_IMPORT' }, { affiliateUrl: { notIn: [''] } }],
      },
      select: { organizationId: true, sourceUrl: true, affiliateUrl: true },
    }),
    prisma.canonicalTeams.findMany({
      where: {
        organizationId: { not: null },
        OR: [{ sourceType: 'AFFILIATE_IMPORT' }, { affiliateUrl: { notIn: [''] } }],
      },
      select: { organizationId: true, sourceUrl: true, affiliateUrl: true },
    }),
    prisma.facilities.findMany({
      where: { affiliateUrl: { notIn: [''] } },
      select: { organizationId: true, affiliateUrl: true },
    }),
    prisma.staffMembers.findMany({
      select: { organizationId: true, userId: true, types: true, roleId: true },
    }),
    prisma.organizationRolePermissions.findMany({
      where: { permission: 'organization.manage' },
      select: { organizationRoleId: true },
    }),
    prisma.organizationDomains.findMany({
      select: {
        id: true,
        organizationId: true,
        url: true,
        host: true,
        registrableDomain: true,
        source: true,
        isPrimary: true,
        isSharedPlatform: true,
      },
    }),
    prisma.organizationClaims.findMany({
      where: { method: 'LEGACY_OWNER', status: 'APPROVED' },
      select: { id: true, organizationId: true, claimantUserId: true },
    }),
  ]);

  if (organizationIdFilter && organizations.length === 0) {
    throw new Error(`Organization ${organizationIdFilter} was not found.`);
  }

  const affiliateOrganizationIds = new Set<string>();
  const evidenceByOrganization = new Map<string, UrlEvidence[]>();
  const addEvidence = (
    organizationId: string | null | undefined,
    url: string | null | undefined,
    source: string,
    priority: number,
    eligibleForPrimary: boolean,
  ): void => {
    if (!organizationId || !url?.trim()) return;
    affiliateOrganizationIds.add(organizationId);
    pushMap(evidenceByOrganization, organizationId, {
      url: url.trim(),
      source,
      priority,
      eligibleForPrimary,
    });
  };

  sources.forEach((source) => {
    if (!source.organizationId) return;
    affiliateOrganizationIds.add(source.organizationId);
    addEvidence(source.organizationId, source.baseUrl, 'AFFILIATE_SOURCE_BASE_URL', 1, true);
    addEvidence(source.organizationId, source.listUrl, 'AFFILIATE_SOURCE_LIST_URL', 8, false);
  });
  candidates.forEach((candidate) => {
    if (!candidate.publishedOrganizationId) return;
    affiliateOrganizationIds.add(candidate.publishedOrganizationId);
    addEvidence(
      candidate.publishedOrganizationId,
      candidate.officialActionUrl,
      'AFFILIATE_CANDIDATE_OFFICIAL_ACTION',
      3,
      candidate.listingKind === 'CLUB',
    );
  });
  events.forEach((event) => {
    if (!event.organizationId) return;
    affiliateOrganizationIds.add(event.organizationId);
    addEvidence(event.organizationId, event.sourceUrl, 'AFFILIATE_EVENT_SOURCE_URL', 4, true);
    addEvidence(event.organizationId, event.affiliateUrl, 'AFFILIATE_EVENT_ACTION_URL', 6, false);
  });
  teams.forEach((team) => {
    if (!team.organizationId) return;
    affiliateOrganizationIds.add(team.organizationId);
    addEvidence(team.organizationId, team.sourceUrl, 'AFFILIATE_TEAM_SOURCE_URL', 5, true);
    addEvidence(team.organizationId, team.affiliateUrl, 'AFFILIATE_TEAM_ACTION_URL', 7, false);
  });
  facilities.forEach((facility) => {
    affiliateOrganizationIds.add(facility.organizationId);
    addEvidence(facility.organizationId, facility.affiliateUrl, 'AFFILIATE_FACILITY_ACTION_URL', 9, false);
  });
  organizations.forEach((organization) => {
    if (affiliateOrganizationIds.has(organization.id)) {
      addEvidence(organization.id, organization.website, 'ORGANIZATION_WEBSITE', 0, true);
    }
  });

  const managementRoleIds = new Set(managementPermissionRows.map((row) => row.organizationRoleId));
  const managementStaffByOrganization = new Map<string, typeof staffMembers>();
  staffMembers.forEach((staffMember) => {
    const legacyManager = staffMember.types.some((type) => MANAGEMENT_TYPES.has(type.toUpperCase()));
    if (legacyManager || (staffMember.roleId && managementRoleIds.has(staffMember.roleId))) {
      pushMap(managementStaffByOrganization, staffMember.organizationId, staffMember);
    }
  });

  const relevantUserIds = uniqueSorted([
    ...organizations.map((organization) => organization.ownerId),
    ...Array.from(managementStaffByOrganization.values()).flat().map((staffMember) => staffMember.userId),
  ]);
  const adminResults = await mapWithConcurrency(
    relevantUserIds,
    12,
    async (userId) => [userId, await evaluateRazumlyAdminAccess(userId)] as const,
  );
  const adminStatusByUserId = new Map(adminResults);
  const domainsByOrganization = new Map<string, typeof existingDomains>();
  existingDomains.forEach((domain) => pushMap(domainsByOrganization, domain.organizationId, domain));
  const legacyClaimsByOrganization = new Map(existingLegacyClaims.map((claim) => [claim.organizationId, claim]));

  const rows: AuditRow[] = [];
  for (const organization of organizations) {
    const isAffiliate = affiliateOrganizationIds.has(organization.id);
    const externalManagementUserIds = (managementStaffByOrganization.get(organization.id) ?? [])
      .filter((staffMember) => !adminStatusByUserId.get(staffMember.userId)?.allowed)
      .map((staffMember) => staffMember.userId);
    const directEvidence: DirectDomainEvidence[] = [];
    const sharedPlatforms: string[] = [];
    let invalidUrlCount = 0;
    for (const evidence of evidenceByOrganization.get(organization.id) ?? []) {
      try {
        const policy = organizationDomainPolicyForUrl(evidence.url);
        if (policy.isSharedPlatform) {
          sharedPlatforms.push(policy.registrableDomain);
          continue;
        }
        if (evidence.eligibleForPrimary) {
          directEvidence.push({
            ...evidence,
            canonicalUrl: policy.canonicalUrl,
            host: policy.host,
            registrableDomain: policy.registrableDomain,
          });
        }
      } catch {
        invalidUrlCount += 1;
      }
    }

    directEvidence.sort((left, right) => (
      left.priority - right.priority
      || left.canonicalUrl.localeCompare(right.canonicalUrl)
    ));
    const directDomains = uniqueSorted(directEvidence.map((evidence) => evidence.registrableDomain));
    const classification = classifyOrganizationClaimState({
      isAffiliate,
      ownerAccountExists: adminStatusByUserId.get(organization.ownerId)?.reason !== 'missing_user',
      ownerIsRazumlyAdmin: Boolean(adminStatusByUserId.get(organization.ownerId)?.allowed),
      externalManagementUserIds,
      directRegistrableDomains: directDomains,
    });
    const primaryEvidence = classification.primaryDomain
      ? directEvidence.find((evidence) => evidence.registrableDomain === classification.primaryDomain) ?? null
      : null;
    const currentPrimary = (domainsByOrganization.get(organization.id) ?? [])
      .find((domain) => domain.isPrimary) ?? null;
    const desiredDomainChanged = Boolean(primaryEvidence) && (
      !currentPrimary
      || currentPrimary.url !== primaryEvidence?.canonicalUrl
      || currentPrimary.host !== primaryEvidence?.host
      || currentPrimary.registrableDomain !== primaryEvidence?.registrableDomain
      || currentPrimary.source !== primaryEvidence?.source
      || currentPrimary.isSharedPlatform
    );
    const desiredOrganizationChanged = organizationDataChanged(organization, classification);
    const existingLegacyClaim = legacyClaimsByOrganization.get(organization.id);
    const shouldCreateLegacyClaim = classification.legacyClaimMethod === 'LEGACY_OWNER'
      && (!existingLegacyClaim || existingLegacyClaim.claimantUserId !== organization.ownerId);
    const claimedAt = organization.claimedAt ?? organization.createdAt ?? new Date();

    if (shouldWrite && (desiredOrganizationChanged || desiredDomainChanged || shouldCreateLegacyClaim)) {
      await prisma.$transaction(async (transaction) => {
        await transaction.organizations.update({
          where: { id: organization.id },
          data: classification.legacyClaimMethod === 'LEGACY_OWNER'
            ? {
              originType: classification.originType,
              ownershipStatus: classification.ownershipStatus,
              claimedAt,
              claimedByUserId: organization.ownerId,
              claimVerificationLevel: 'NONE',
              ownershipVerifiedAt: null,
              ownershipVerificationLastCheckedAt: null,
            }
            : classification.originType === 'AFFILIATE_IMPORTED'
              ? {
                originType: classification.originType,
                ownershipStatus: classification.ownershipStatus,
                claimedAt: null,
                claimedByUserId: null,
                claimVerificationLevel: 'NONE',
                ownershipVerifiedAt: null,
                ownershipVerificationLastCheckedAt: null,
              }
              : {
                originType: classification.originType,
                ownershipStatus: classification.ownershipStatus,
              },
        });

        if (primaryEvidence && desiredDomainChanged) {
          await transaction.organizationDomains.updateMany({
            where: { organizationId: organization.id, isPrimary: true },
            data: { isPrimary: false },
          });
          await transaction.organizationDomains.upsert({
            where: {
              organizationId_host: {
                organizationId: organization.id,
                host: primaryEvidence.host,
              },
            },
            create: {
              id: deterministicId('org_domain', organization.id, primaryEvidence.host),
              organizationId: organization.id,
              url: primaryEvidence.canonicalUrl,
              host: primaryEvidence.host,
              registrableDomain: primaryEvidence.registrableDomain,
              source: primaryEvidence.source,
              isPrimary: true,
              isSharedPlatform: false,
            },
            update: {
              url: primaryEvidence.canonicalUrl,
              registrableDomain: primaryEvidence.registrableDomain,
              source: primaryEvidence.source,
              isPrimary: true,
              isSharedPlatform: false,
            },
          });
        }

        if (shouldCreateLegacyClaim) {
          await transaction.organizationClaims.create({
            data: {
              id: deterministicId('org_claim_legacy', organization.id, organization.ownerId),
              organizationId: organization.id,
              claimantUserId: organization.ownerId,
              requestType: 'INITIAL_CLAIM',
              status: 'APPROVED',
              method: 'LEGACY_OWNER',
              verificationLevel: 'NONE',
              submittedAt: claimedAt,
              decidedAt: claimedAt,
              acceptedAt: claimedAt,
              userDecisionMessage: 'Existing owner preserved during affiliate ownership backfill.',
            },
          });
        }
      });
    }

    rows.push({
      organizationId: organization.id,
      organizationName: organization.name,
      currentOriginType: organization.originType,
      currentOwnershipStatus: organization.ownershipStatus,
      originType: classification.originType,
      ownershipStatus: classification.ownershipStatus,
      legacyClaimMethod: classification.legacyClaimMethod,
      ownerAccountExists: adminStatusByUserId.get(organization.ownerId)?.reason !== 'missing_user',
      ownerIsRazumlyAdmin: Boolean(adminStatusByUserId.get(organization.ownerId)?.allowed),
      externalManagementCount: uniqueSorted(externalManagementUserIds).length,
      directDomains,
      sharedPlatforms: uniqueSorted(sharedPlatforms),
      invalidUrlCount,
      primaryDomain: classification.primaryDomain,
      primaryDomainUrl: primaryEvidence?.canonicalUrl ?? null,
      primaryDomainSource: primaryEvidence?.source ?? null,
      reasons: classification.reasons,
      organizationChanged: desiredOrganizationChanged,
      domainChanged: desiredDomainChanged,
      legacyClaimCreated: shouldCreateLegacyClaim,
    });
  }

  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.ownershipStatus] = (result[row.ownershipStatus] ?? 0) + 1;
    return result;
  }, {});
  const affectedOrganizationIds = rows
    .filter((row) => row.organizationChanged || row.domainChanged || row.legacyClaimCreated)
    .map((row) => row.organizationId);
  const stableDigest = createHash('sha256')
    .update(JSON.stringify(rows.map((row) => ({
      organizationId: row.organizationId,
      originType: row.originType,
      ownershipStatus: row.ownershipStatus,
      primaryDomain: row.primaryDomain,
      reasons: row.reasons,
    }))))
    .digest('hex');
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    database: useLive ? 'live' : 'local',
    mode: shouldWrite ? 'write' : 'dry-run',
    organizationIdFilter,
    counts,
    affectedOrganizationIds,
    stableDigest,
    rows,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const baseName = `${stamp}-${useLive ? 'live' : 'local'}-${shouldWrite ? 'write' : 'dry-run'}`;
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, `${baseName}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(
      path.join(OUTPUT_DIR, `${baseName}.csv`),
      [
        [
          'organizationId',
          'organizationName',
          'originType',
          'ownershipStatus',
          'ownerAccountExists',
          'ownerIsRazumlyAdmin',
          'externalManagementCount',
          'directDomains',
          'sharedPlatforms',
          'primaryDomain',
          'reasons',
          'organizationChanged',
          'domainChanged',
          'legacyClaimCreated',
        ].map(csvCell).join(','),
        ...rows.map((row) => [
          row.organizationId,
          row.organizationName,
          row.originType,
          row.ownershipStatus,
          row.ownerAccountExists,
          row.ownerIsRazumlyAdmin,
          row.externalManagementCount,
          row.directDomains,
          row.sharedPlatforms,
          row.primaryDomain,
          row.reasons,
          row.organizationChanged,
          row.domainChanged,
          row.legacyClaimCreated,
        ].map(csvCell).join(',')),
      ].join('\n').concat('\n'),
      'utf8',
    ),
  ]);

  console.log(JSON.stringify({
    database: report.database,
    mode: report.mode,
    organizations: rows.length,
    counts,
    affectedOrganizationIds,
    stableDigest,
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
