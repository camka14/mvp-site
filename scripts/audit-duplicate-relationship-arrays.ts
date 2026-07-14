/**
 * Audits the two persisted relationship arrays retired by DATA-007.
 *
 * The database transaction is explicitly read-only. Detailed IDs are written
 * only to an ignored file under output/data007; stdout contains aggregate
 * counts suitable for an operator log.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { resolvePrismaPgPoolConfig } from '../src/lib/prismaConfig';

const { Client } = pg;

const ARTIFACT_DIRECTORY = path.join('output', 'data007');
const VALID_DISPOSITION = 'STALE_CONFIRMED' as const;

type AuditCliOptions = {
  strict: boolean;
  outputPath: string | null;
  classificationsPath: string | null;
};

export type StaleClassificationEntry = {
  userId: string;
  legacyTeamId: string;
  canonicalTeamId: string;
  disposition: typeof VALID_DISPOSITION;
  reviewedAt: string;
  reviewedBy: string;
  reason: string;
};

export type ClassificationIssue = {
  index: number | null;
  reason: string;
};

export type ParsedClassificationLedger = {
  entries: StaleClassificationEntry[];
  invalidEntries: ClassificationIssue[];
};

export type LegacyOnlyLiveTeamLink = {
  userId: string;
  legacyTeamId: string;
  canonicalTeamId: string;
};

export type ClassificationReconciliation = {
  classified: LegacyOnlyLiveTeamLink[];
  unclassified: LegacyOnlyLiveTeamLink[];
  invalidEntries: ClassificationIssue[];
};

export type DuplicateRelationshipAuditInput = {
  organizations: Array<{ id: string; productIds: string[] | null }>;
  products: Array<{ id: string; organizationId: string }>;
  users: Array<{ id: string; teamIds: string[] | null }>;
  canonicalTeams: Array<{ id: string }>;
  eventTeams: Array<{ id: string; parentTeamId: string | null }>;
  teamRegistrations: Array<{ userId: string; teamId: string; status: string }>;
  teamStaffAssignments: Array<{ userId: string; teamId: string; status: string }>;
};

type ProductAudit = {
  exactOrganizations: number;
  normalizedOnlyIds: number;
  legacyOnlyOrphanIds: number;
  legacyForeignOwnerIds: number;
  details: {
    normalizedOnly: Array<{ organizationId: string; productId: string }>;
    legacyOnlyOrphans: Array<{ organizationId: string; productId: string }>;
    legacyForeignOwners: Array<{
      organizationId: string;
      productId: string;
      actualOrganizationId: string;
    }>;
  };
};

type UserTeamAudit = {
  exactUsers: number;
  normalizedOnlyLinks: number;
  legacyOnlyLiveTeamLinks: number;
  classifiedStaleLiveTeamLinks: number;
  unclassifiedLegacyOnlyLiveTeamLinks: number;
  contradictedLinks: number;
  orphanIds: number;
  invalidClassificationEntries: number;
  details: {
    normalizedOnly: Array<{ userId: string; canonicalTeamId: string }>;
    legacyOnlyLive: LegacyOnlyLiveTeamLink[];
    classifiedStale: LegacyOnlyLiveTeamLink[];
    unclassified: LegacyOnlyLiveTeamLink[];
    contradicted: LegacyOnlyLiveTeamLink[];
    orphans: Array<{ userId: string; legacyTeamId: string }>;
    invalidClassifications: ClassificationIssue[];
  };
};

export type DuplicateRelationshipAuditReport = {
  version: 1;
  generatedAt: string;
  columnsPresent: boolean;
  alreadyRemoved?: true;
  products?: ProductAudit;
  userTeams?: UserTeamAudit;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(normalizeId).filter((value): value is string => Boolean(value)))).sort();
};

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const compareTeamLinks = (left: LegacyOnlyLiveTeamLink, right: LegacyOnlyLiveTeamLink): number => (
  compareStrings(left.userId, right.userId)
  || compareStrings(left.canonicalTeamId, right.canonicalTeamId)
  || compareStrings(left.legacyTeamId, right.legacyTeamId)
);

const sameStringSets = (left: Set<string>, right: Set<string>): boolean => (
  left.size === right.size && [...left].every((value) => right.has(value))
);

const classificationKey = (
  value: Pick<StaleClassificationEntry, 'userId' | 'legacyTeamId' | 'canonicalTeamId'>,
): string => `${value.userId}\u0000${value.legacyTeamId}\u0000${value.canonicalTeamId}`;

const takeOptionValue = (args: string[], index: number, option: string): string => {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a path.`);
  }
  return value;
};

export const parseAuditCliArgs = (args: string[]): AuditCliOptions => {
  let strict = false;
  let outputPath: string | null = null;
  let classificationsPath: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--strict') {
      if (strict) throw new Error('--strict may be provided only once.');
      strict = true;
      continue;
    }
    if (argument === '--output') {
      if (outputPath !== null) throw new Error('--output may be provided only once.');
      outputPath = takeOptionValue(args, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--classifications') {
      if (classificationsPath !== null) throw new Error('--classifications may be provided only once.');
      classificationsPath = takeOptionValue(args, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { strict, outputPath, classificationsPath };
};

export const resolveData007ArtifactPath = (input: string, cwd = process.cwd()): string => {
  const artifactRoot = path.resolve(cwd, ARTIFACT_DIRECTORY);
  const resolved = path.resolve(cwd, input);
  if (resolved === artifactRoot || !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new Error(`Artifact paths must be files inside ${ARTIFACT_DIRECTORY}/.`);
  }
  return resolved;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readRequiredString = (
  value: Record<string, unknown>,
  key: string,
  options: { preserveWhitespace?: boolean } = {},
): string | null => {
  const raw = value[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  if (!options.preserveWhitespace && raw !== raw.trim()) return null;
  return options.preserveWhitespace ? raw : raw.trim();
};

export const parseClassificationLedger = (value: unknown): ParsedClassificationLedger => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    return {
      entries: [],
      invalidEntries: [{ index: null, reason: 'Ledger must contain version 1 and an entries array.' }],
    };
  }

  const entries: StaleClassificationEntry[] = [];
  const invalidEntries: ClassificationIssue[] = [];
  const seenKeys = new Set<string>();

  value.entries.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      invalidEntries.push({ index, reason: 'Entry must be an object.' });
      return;
    }

    const userId = readRequiredString(candidate, 'userId');
    const legacyTeamId = readRequiredString(candidate, 'legacyTeamId', { preserveWhitespace: true });
    const canonicalTeamId = readRequiredString(candidate, 'canonicalTeamId');
    const reviewedAt = readRequiredString(candidate, 'reviewedAt');
    const reviewedBy = readRequiredString(candidate, 'reviewedBy');
    const reason = readRequiredString(candidate, 'reason');
    const disposition = candidate.disposition;

    if (!userId || !legacyTeamId || !canonicalTeamId || !reviewedAt || !reviewedBy || !reason) {
      invalidEntries.push({ index, reason: 'Entry is missing a required non-empty string.' });
      return;
    }
    if (disposition !== VALID_DISPOSITION) {
      invalidEntries.push({ index, reason: `Disposition must be ${VALID_DISPOSITION}.` });
      return;
    }
    if (!Number.isFinite(Date.parse(reviewedAt))) {
      invalidEntries.push({ index, reason: 'reviewedAt must be an ISO-compatible timestamp.' });
      return;
    }

    const entry: StaleClassificationEntry = {
      userId,
      legacyTeamId,
      canonicalTeamId,
      disposition,
      reviewedAt,
      reviewedBy,
      reason,
    };
    const key = classificationKey(entry);
    if (seenKeys.has(key)) {
      invalidEntries.push({ index, reason: 'Duplicate classification key.' });
      return;
    }
    seenKeys.add(key);
    entries.push(entry);
  });

  return { entries, invalidEntries };
};

export const reconcileClassifications = (
  currentLinks: LegacyOnlyLiveTeamLink[],
  ledger: ParsedClassificationLedger,
): ClassificationReconciliation => {
  const currentByKey = new Map(
    currentLinks
      .slice()
      .sort(compareTeamLinks)
      .map((link) => [classificationKey(link), link]),
  );
  const classifiedKeys = new Set<string>();
  const invalidEntries = [...ledger.invalidEntries];

  ledger.entries.forEach((entry, index) => {
    const key = classificationKey(entry);
    if (!currentByKey.has(key)) {
      invalidEntries.push({
        index,
        reason: 'Classification does not match a current legacy-only live-team link.',
      });
      return;
    }
    classifiedKeys.add(key);
  });

  const classified: LegacyOnlyLiveTeamLink[] = [];
  const unclassified: LegacyOnlyLiveTeamLink[] = [];
  currentByKey.forEach((link, key) => {
    (classifiedKeys.has(key) ? classified : unclassified).push(link);
  });

  return {
    classified: classified.sort(compareTeamLinks),
    unclassified: unclassified.sort(compareTeamLinks),
    invalidEntries,
  };
};

const buildProductAudit = (
  organizations: DuplicateRelationshipAuditInput['organizations'],
  products: DuplicateRelationshipAuditInput['products'],
): ProductAudit => {
  const organizationRows = new Map(organizations.map((row) => [row.id, row]));
  const productOwnerById = new Map(products.map((row) => [row.id, row.organizationId]));
  const normalizedByOrganization = new Map<string, Set<string>>();
  products.forEach((product) => {
    const ids = normalizedByOrganization.get(product.organizationId) ?? new Set<string>();
    ids.add(product.id);
    normalizedByOrganization.set(product.organizationId, ids);
  });

  const normalizedOnly: ProductAudit['details']['normalizedOnly'] = [];
  const legacyOnlyOrphans: ProductAudit['details']['legacyOnlyOrphans'] = [];
  const legacyForeignOwners: ProductAudit['details']['legacyForeignOwners'] = [];
  let exactOrganizations = 0;

  const organizationIds = Array.from(new Set([
    ...organizationRows.keys(),
    ...normalizedByOrganization.keys(),
  ])).sort(compareStrings);

  organizationIds.forEach((organizationId) => {
    const legacyIds = new Set(normalizeIdList(organizationRows.get(organizationId)?.productIds));
    const normalizedIds = normalizedByOrganization.get(organizationId) ?? new Set<string>();

    normalizedIds.forEach((productId) => {
      if (!legacyIds.has(productId)) normalizedOnly.push({ organizationId, productId });
    });

    legacyIds.forEach((productId) => {
      const actualOrganizationId = productOwnerById.get(productId);
      if (!actualOrganizationId) {
        legacyOnlyOrphans.push({ organizationId, productId });
      } else if (actualOrganizationId !== organizationId) {
        legacyForeignOwners.push({ organizationId, productId, actualOrganizationId });
      }
    });

    if (
      organizationRows.has(organizationId)
      && sameStringSets(legacyIds, normalizedIds)
      && ![...legacyIds].some((productId) => productOwnerById.get(productId) !== organizationId)
    ) {
      exactOrganizations += 1;
    }
  });

  const byOrganizationAndProduct = <T extends { organizationId: string; productId: string }>(left: T, right: T) => (
    compareStrings(left.organizationId, right.organizationId) || compareStrings(left.productId, right.productId)
  );
  normalizedOnly.sort(byOrganizationAndProduct);
  legacyOnlyOrphans.sort(byOrganizationAndProduct);
  legacyForeignOwners.sort(byOrganizationAndProduct);

  return {
    exactOrganizations,
    normalizedOnlyIds: normalizedOnly.length,
    legacyOnlyOrphanIds: legacyOnlyOrphans.length,
    legacyForeignOwnerIds: legacyForeignOwners.length,
    details: { normalizedOnly, legacyOnlyOrphans, legacyForeignOwners },
  };
};

const chooseRawLegacyId = (rawIds: string[], canonicalTeamId: string): string => (
  rawIds
    .slice()
    .sort((left, right) => {
      const leftIsDirect = left.trim() === canonicalTeamId ? 0 : 1;
      const rightIsDirect = right.trim() === canonicalTeamId ? 0 : 1;
      return leftIsDirect - rightIsDirect || compareStrings(left, right);
    })[0] ?? canonicalTeamId
);

const buildUserTeamAudit = (
  input: Pick<
    DuplicateRelationshipAuditInput,
    'users' | 'canonicalTeams' | 'eventTeams' | 'teamRegistrations' | 'teamStaffAssignments'
  >,
  ledger: ParsedClassificationLedger,
): UserTeamAudit => {
  const usersById = new Map(input.users.map((row) => [row.id, row]));
  const canonicalTeamIds = new Set(input.canonicalTeams.map((row) => row.id));
  const eventTeamParents = new Map(input.eventTeams.map((row) => [row.id, normalizeId(row.parentTeamId)]));
  const activeByUser = new Map<string, Set<string>>();
  const contradictedByUser = new Map<string, Set<string>>();

  [...input.teamRegistrations, ...input.teamStaffAssignments].forEach((row) => {
    const userId = normalizeId(row.userId);
    const teamId = normalizeId(row.teamId);
    const status = normalizeId(row.status)?.toUpperCase();
    if (!userId || !teamId || !status) return;
    if (status === 'ACTIVE') {
      const teams = activeByUser.get(userId) ?? new Set<string>();
      teams.add(teamId);
      activeByUser.set(userId, teams);
    } else if (status === 'LEFT' || status === 'REMOVED') {
      const teams = contradictedByUser.get(userId) ?? new Set<string>();
      teams.add(teamId);
      contradictedByUser.set(userId, teams);
    }
  });

  const normalizedOnly: UserTeamAudit['details']['normalizedOnly'] = [];
  const legacyOnlyLive: LegacyOnlyLiveTeamLink[] = [];
  const contradicted: LegacyOnlyLiveTeamLink[] = [];
  const orphans: UserTeamAudit['details']['orphans'] = [];
  let exactUsers = 0;

  const userIds = Array.from(new Set([...usersById.keys(), ...activeByUser.keys()])).sort(compareStrings);
  userIds.forEach((userId) => {
    const activeTeamIds = activeByUser.get(userId) ?? new Set<string>();
    const legacyRawIds = Array.isArray(usersById.get(userId)?.teamIds)
      ? usersById.get(userId)!.teamIds!
      : [];
    const legacyRawByCanonical = new Map<string, string[]>();
    const orphanRawByNormalizedId = new Map<string, string>();

    legacyRawIds.forEach((rawValue) => {
      if (typeof rawValue !== 'string') return;
      const normalized = normalizeId(rawValue);
      if (!normalized) return;
      const eventParent = eventTeamParents.get(normalized);
      const canonicalTeamId = canonicalTeamIds.has(normalized)
        ? normalized
        : (eventParent && canonicalTeamIds.has(eventParent) ? eventParent : null);
      if (!canonicalTeamId) {
        if (!orphanRawByNormalizedId.has(normalized)) orphanRawByNormalizedId.set(normalized, rawValue);
        return;
      }
      const rawIds = legacyRawByCanonical.get(canonicalTeamId) ?? [];
      if (!rawIds.includes(rawValue)) rawIds.push(rawValue);
      legacyRawByCanonical.set(canonicalTeamId, rawIds);
    });

    const legacyCanonicalIds = new Set(legacyRawByCanonical.keys());
    activeTeamIds.forEach((canonicalTeamId) => {
      if (!legacyCanonicalIds.has(canonicalTeamId)) normalizedOnly.push({ userId, canonicalTeamId });
    });

    legacyCanonicalIds.forEach((canonicalTeamId) => {
      if (activeTeamIds.has(canonicalTeamId)) return;
      const link = {
        userId,
        legacyTeamId: chooseRawLegacyId(legacyRawByCanonical.get(canonicalTeamId) ?? [], canonicalTeamId),
        canonicalTeamId,
      };
      if (contradictedByUser.get(userId)?.has(canonicalTeamId)) contradicted.push(link);
      else legacyOnlyLive.push(link);
    });

    orphanRawByNormalizedId.forEach((legacyTeamId) => orphans.push({ userId, legacyTeamId }));
    if (
      usersById.has(userId)
      && sameStringSets(activeTeamIds, legacyCanonicalIds)
      && orphanRawByNormalizedId.size === 0
    ) {
      exactUsers += 1;
    }
  });

  normalizedOnly.sort((left, right) => (
    compareStrings(left.userId, right.userId) || compareStrings(left.canonicalTeamId, right.canonicalTeamId)
  ));
  legacyOnlyLive.sort(compareTeamLinks);
  contradicted.sort(compareTeamLinks);
  orphans.sort((left, right) => (
    compareStrings(left.userId, right.userId) || compareStrings(left.legacyTeamId, right.legacyTeamId)
  ));

  const reconciliation = reconcileClassifications(legacyOnlyLive, ledger);
  return {
    exactUsers,
    normalizedOnlyLinks: normalizedOnly.length,
    legacyOnlyLiveTeamLinks: legacyOnlyLive.length,
    classifiedStaleLiveTeamLinks: reconciliation.classified.length,
    unclassifiedLegacyOnlyLiveTeamLinks: reconciliation.unclassified.length,
    contradictedLinks: contradicted.length,
    orphanIds: orphans.length,
    invalidClassificationEntries: reconciliation.invalidEntries.length,
    details: {
      normalizedOnly,
      legacyOnlyLive,
      classifiedStale: reconciliation.classified,
      unclassified: reconciliation.unclassified,
      contradicted,
      orphans,
      invalidClassifications: reconciliation.invalidEntries,
    },
  };
};

export const buildDuplicateRelationshipAudit = (
  input: DuplicateRelationshipAuditInput,
  ledger: ParsedClassificationLedger = { entries: [], invalidEntries: [] },
  generatedAt = new Date().toISOString(),
): DuplicateRelationshipAuditReport => ({
  version: 1,
  generatedAt,
  columnsPresent: true,
  products: buildProductAudit(input.organizations, input.products),
  userTeams: buildUserTeamAudit(input, ledger),
});

const loadAuditRows = async (client: InstanceType<typeof Client>): Promise<DuplicateRelationshipAuditInput | null> => {
  const columnResult = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (
        (table_name = 'Organizations' AND column_name = 'productIds')
        OR (table_name = 'UserData' AND column_name = 'teamIds')
      )
    ORDER BY table_name, column_name
  `);
  const presentColumns = new Set(
    columnResult.rows.map((row) => `${String(row.table_name)}.${String(row.column_name)}`),
  );
  if (presentColumns.size === 0) return null;
  if (
    !presentColumns.has('Organizations.productIds')
    || !presentColumns.has('UserData.teamIds')
    || presentColumns.size !== 2
  ) {
    throw new Error('DATA-007 columns are in an inconsistent partially removed state.');
  }

  const [organizations, products, users, canonicalTeams, eventTeams, teamRegistrations, teamStaffAssignments] = await Promise.all([
    client.query('SELECT "id", COALESCE("productIds", ARRAY[]::TEXT[]) AS "productIds" FROM "Organizations" ORDER BY "id"'),
    client.query('SELECT "id", "organizationId" FROM "Products" ORDER BY "id"'),
    client.query('SELECT "id", COALESCE("teamIds", ARRAY[]::TEXT[]) AS "teamIds" FROM "UserData" ORDER BY "id"'),
    client.query('SELECT "id" FROM "Teams" ORDER BY "id"'),
    client.query('SELECT "id", "parentTeamId" FROM "EventTeams" ORDER BY "id"'),
    client.query('SELECT "userId", "teamId", "status"::TEXT AS "status" FROM "TeamRegistrations" ORDER BY "userId", "teamId"'),
    client.query('SELECT "userId", "teamId", "status"::TEXT AS "status" FROM "TeamStaffAssignments" ORDER BY "userId", "teamId", "role"'),
  ]);

  return {
    organizations: organizations.rows,
    products: products.rows,
    users: users.rows,
    canonicalTeams: canonicalTeams.rows,
    eventTeams: eventTeams.rows,
    teamRegistrations: teamRegistrations.rows,
    teamStaffAssignments: teamStaffAssignments.rows,
  } as DuplicateRelationshipAuditInput;
};

const readClassificationLedger = async (filePath: string | null): Promise<ParsedClassificationLedger> => {
  if (!filePath) return { entries: [], invalidEntries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown read error';
    throw new Error(`Unable to read classification ledger: ${message}`);
  }
  return parseClassificationLedger(parsed);
};

const writeReport = async (filePath: string, report: DuplicateRelationshipAuditReport): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

const summarizeReport = (report: DuplicateRelationshipAuditReport) => {
  if (!report.columnsPresent) {
    return {
      columnsPresent: false,
      alreadyRemoved: true,
    };
  }
  return {
    columnsPresent: true,
    products: {
      exactOrganizations: report.products?.exactOrganizations ?? 0,
      normalizedOnlyIds: report.products?.normalizedOnlyIds ?? 0,
      legacyOnlyOrphanIds: report.products?.legacyOnlyOrphanIds ?? 0,
      legacyForeignOwnerIds: report.products?.legacyForeignOwnerIds ?? 0,
    },
    userTeams: {
      exactUsers: report.userTeams?.exactUsers ?? 0,
      normalizedOnlyLinks: report.userTeams?.normalizedOnlyLinks ?? 0,
      legacyOnlyLiveTeamLinks: report.userTeams?.legacyOnlyLiveTeamLinks ?? 0,
      classifiedStaleLiveTeamLinks: report.userTeams?.classifiedStaleLiveTeamLinks ?? 0,
      unclassifiedLegacyOnlyLiveTeamLinks: report.userTeams?.unclassifiedLegacyOnlyLiveTeamLinks ?? 0,
      contradictedLinks: report.userTeams?.contradictedLinks ?? 0,
      orphanIds: report.userTeams?.orphanIds ?? 0,
      invalidClassificationEntries: report.userTeams?.invalidClassificationEntries ?? 0,
    },
  };
};

const run = async (): Promise<number> => {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '.env.local', override: false, quiet: true });

  const options = parseAuditCliArgs(process.argv.slice(2));
  const outputPath = options.outputPath
    ? resolveData007ArtifactPath(options.outputPath)
    : null;
  const classificationsPath = options.classificationsPath
    ? resolveData007ArtifactPath(options.classificationsPath)
    : null;
  const ledger = await readClassificationLedger(classificationsPath);
  const client = new Client(resolvePrismaPgPoolConfig());
  let transactionOpen = false;

  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    const input = await loadAuditRows(client);
    const report: DuplicateRelationshipAuditReport = input
      ? buildDuplicateRelationshipAudit(input, ledger)
      : {
          version: 1,
          generatedAt: new Date().toISOString(),
          columnsPresent: false,
          alreadyRemoved: true,
        };
    await client.query('COMMIT');
    transactionOpen = false;

    if (outputPath) await writeReport(outputPath, report);
    console.log(JSON.stringify(summarizeReport(report), null, 2));
    if (outputPath) console.log(`Detailed report written to ${path.relative(process.cwd(), outputPath)}.`);

    if (
      options.strict
      && report.columnsPresent
      && (
        (report.userTeams?.unclassifiedLegacyOnlyLiveTeamLinks ?? 0) > 0
        || (report.userTeams?.invalidClassificationEntries ?? 0) > 0
      )
    ) {
      return 2;
    }
    return 0;
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
};

if (require.main === module) {
  run()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`Duplicate relationship audit failed: ${message}`);
      process.exitCode = 1;
    });
}
