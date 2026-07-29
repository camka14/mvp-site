import fs from 'node:fs/promises';
import path from 'node:path';
import { affiliateScrapeMappingSchema } from './types';

type JsonRecord = Record<string, unknown>;

export type AffiliateAgentBaselineSourceRow = {
  id: string;
  sourceKey: string;
  targetKind: string;
  status: string;
  activeMappingId?: string | null;
  metadata?: unknown;
};

export type AffiliateAgentBaselineMappingRow = {
  id: string;
  sourceId: string;
  isActive: boolean;
  mapping: unknown;
  validatedAt?: Date | string | null;
};

export type AffiliateAgentBaselineIntakeRow = {
  id: string;
  sourceKey: string;
  status: string;
  complianceStatus: string;
  affiliateSourceId?: string | null;
  lastRunId?: string | null;
};

export type AffiliateAgentBaselineCountGroup = {
  status: string;
  count: number;
};

export type AffiliateAgentBaselineArtifactGroup = {
  intakeId: string;
  kind: string;
  count: number;
};

export type AffiliateMappingAgentBaselineInput = {
  capturedAt: Date;
  environment: 'local' | 'live';
  sources: AffiliateAgentBaselineSourceRow[];
  mappings: AffiliateAgentBaselineMappingRow[];
  intakes: AffiliateAgentBaselineIntakeRow[];
  artifactGroups: AffiliateAgentBaselineArtifactGroup[];
  candidateStatusGroups: AffiliateAgentBaselineCountGroup[];
  mappingJobStatusGroups: AffiliateAgentBaselineCountGroup[];
  setupScripts: string[];
};

const recordValue = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const countStrings = (values: string[]): Record<string, number> => (
  values.reduce<Record<string, number>>((counts, value) => {
    const key = value.trim() || 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {})
);

const sortedRecord = (value: Record<string, number>): Record<string, number> => (
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
);

const countGroups = (groups: AffiliateAgentBaselineCountGroup[]) => {
  const unsorted: Record<string, number> = {};
  for (const group of groups) {
    const key = group.status.trim() || 'UNKNOWN';
    unsorted[key] = (unsorted[key] ?? 0) + group.count;
  }
  const byStatus = sortedRecord(unsorted);
  return {
    total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
    byStatus,
  };
};

const hasSourceEvidence = (metadata: unknown): boolean => {
  const sourceEvidence = recordValue(recordValue(metadata)?.sourceEvidence);
  return Boolean(
    sourceEvidence
    && typeof sourceEvidence.intakeSourceKey === 'string'
    && sourceEvidence.intakeSourceKey.trim()
    && typeof sourceEvidence.runId === 'string'
    && sourceEvidence.runId.trim(),
  );
};

const mappingModeFor = (mapping: unknown): 'manualCandidates' | 'selectors' | 'invalid' => {
  const parsed = affiliateScrapeMappingSchema.safeParse(mapping);
  if (!parsed.success) return 'invalid';
  if (parsed.data.manualCandidates?.length) return 'manualCandidates';
  return 'selectors';
};

export const buildAffiliateMappingAgentBaseline = (
  input: AffiliateMappingAgentBaselineInput,
) => {
  const activeMappings = input.mappings.filter((mapping) => mapping.isActive);
  const mappingModes = countStrings(activeMappings.map((mapping) => mappingModeFor(mapping.mapping)));
  const linkedSourceIds = new Set(
    input.intakes
      .map((intake) => intake.affiliateSourceId?.trim())
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  );
  const intakesWithArtifacts = new Set(input.artifactGroups.map((group) => group.intakeId));
  const artifactKinds: Record<string, number> = {};
  for (const group of input.artifactGroups) {
    artifactKinds[group.kind] = (artifactKinds[group.kind] ?? 0) + group.count;
  }

  return {
    schemaVersion: 1,
    capturedAt: input.capturedAt.toISOString(),
    environment: input.environment,
    readOnly: true,
    publicRequests: 0,
    databaseWrites: 0,
    sources: {
      total: input.sources.length,
      active: input.sources.filter((source) => source.status === 'ACTIVE').length,
      byStatus: sortedRecord(countStrings(input.sources.map((source) => source.status))),
      byTargetKind: sortedRecord(countStrings(input.sources.map((source) => source.targetKind))),
      withActiveMappingId: input.sources.filter((source) => Boolean(source.activeMappingId)).length,
      withSourceEvidence: input.sources.filter((source) => hasSourceEvidence(source.metadata)).length,
      linkedToIntake: input.sources.filter((source) => linkedSourceIds.has(source.id)).length,
    },
    mappings: {
      total: input.mappings.length,
      active: activeMappings.length,
      validatedActive: activeMappings.filter((mapping) => Boolean(mapping.validatedAt)).length,
      modes: {
        manualCandidates: mappingModes.manualCandidates ?? 0,
        selectors: mappingModes.selectors ?? 0,
        invalid: mappingModes.invalid ?? 0,
      },
    },
    intakes: {
      total: input.intakes.length,
      byStatus: sortedRecord(countStrings(input.intakes.map((intake) => intake.status))),
      byComplianceStatus: sortedRecord(countStrings(
        input.intakes.map((intake) => intake.complianceStatus),
      )),
      linkedToAffiliateSource: input.intakes.filter((intake) => Boolean(intake.affiliateSourceId)).length,
      withSelectedRun: input.intakes.filter((intake) => Boolean(intake.lastRunId)).length,
      withStoredArtifacts: intakesWithArtifacts.size,
    },
    artifacts: {
      total: Object.values(artifactKinds).reduce((sum, count) => sum + count, 0),
      byKind: sortedRecord(artifactKinds),
    },
    candidates: countGroups(input.candidateStatusGroups),
    mappingJobs: countGroups(input.mappingJobStatusGroups),
    setupScripts: {
      total: input.setupScripts.length,
      files: [...input.setupScripts].sort(),
    },
  };
};

const setupScriptPattern = /^setup-.*(?:affiliate-source|current-programs-source|club-reviews|club-directory-source)\.ts$/;

export const listAffiliateSetupScripts = async (
  scriptsDirectory = path.join(process.cwd(), 'scripts'),
): Promise<string[]> => {
  const entries = await fs.readdir(scriptsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && setupScriptPattern.test(entry.name))
    .map((entry) => path.posix.join('scripts', entry.name))
    .sort();
};

type BaselinePrisma = {
  affiliateScrapeSources: { findMany(args: unknown): Promise<AffiliateAgentBaselineSourceRow[]> };
  affiliateScrapeMappings: { findMany(args: unknown): Promise<AffiliateAgentBaselineMappingRow[]> };
  affiliateSourceIntakes: { findMany(args: unknown): Promise<AffiliateAgentBaselineIntakeRow[]> };
  affiliateSourceIntakeArtifacts: {
    groupBy(args: unknown): Promise<Array<{
      intakeId: string;
      kind: string;
      _count: { _all: number };
    }>>;
  };
  affiliateImportCandidates: {
    groupBy(args: unknown): Promise<Array<{ status: string; _count: { _all: number } }>>;
  };
  affiliateSourceMappingJobs: {
    groupBy(args: unknown): Promise<Array<{ status: string; _count: { _all: number } }>>;
  };
};

export const collectAffiliateMappingAgentBaseline = async (input: {
  prisma: BaselinePrisma;
  environment: 'local' | 'live';
  capturedAt?: Date;
  scriptsDirectory?: string;
}) => {
  const [
    sources,
    mappings,
    intakes,
    artifactRows,
    candidateRows,
    mappingJobRows,
    setupScripts,
  ] = await Promise.all([
    input.prisma.affiliateScrapeSources.findMany({
      select: {
        id: true,
        sourceKey: true,
        targetKind: true,
        status: true,
        activeMappingId: true,
        metadata: true,
      },
      orderBy: { sourceKey: 'asc' },
    }),
    input.prisma.affiliateScrapeMappings.findMany({
      select: {
        id: true,
        sourceId: true,
        isActive: true,
        mapping: true,
        validatedAt: true,
      },
      orderBy: [{ sourceId: 'asc' }, { version: 'asc' }],
    }),
    input.prisma.affiliateSourceIntakes.findMany({
      select: {
        id: true,
        sourceKey: true,
        status: true,
        complianceStatus: true,
        affiliateSourceId: true,
        lastRunId: true,
      },
      orderBy: { sourceKey: 'asc' },
    }),
    input.prisma.affiliateSourceIntakeArtifacts.groupBy({
      by: ['intakeId', 'kind'],
      _count: { _all: true },
    }),
    input.prisma.affiliateImportCandidates.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    input.prisma.affiliateSourceMappingJobs.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    listAffiliateSetupScripts(input.scriptsDirectory),
  ]);

  return buildAffiliateMappingAgentBaseline({
    capturedAt: input.capturedAt ?? new Date(),
    environment: input.environment,
    sources,
    mappings,
    intakes,
    artifactGroups: artifactRows.map((row) => ({
      intakeId: row.intakeId,
      kind: row.kind,
      count: row._count._all,
    })),
    candidateStatusGroups: candidateRows.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    mappingJobStatusGroups: mappingJobRows.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    setupScripts,
  });
};
