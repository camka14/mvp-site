import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDomain } from 'tldts';
import {
  affiliateMappingTrainingExampleSchema,
  stableAgentArtifactSha256,
  type AffiliateMappingTrainingExample,
} from './agentContracts';
import { affiliateScrapeMappingSchema } from './types';

type JsonRecord = Record<string, unknown>;

export type HistoricalSourceRow = {
  id: string;
  sourceKey: string;
  name: string;
  listUrl: string;
  baseUrl?: string | null;
  targetKind: string;
  status: string;
  activeMappingId?: string | null;
  organizationId?: string | null;
  organizationWebsite?: string | null;
  metadata?: unknown;
};

export type HistoricalMappingRow = {
  id: string;
  sourceId: string;
  version: number;
  isActive: boolean;
  mapping: unknown;
  validatedAt?: Date | string | null;
};

export type HistoricalIntakePage = {
  url: string;
  canonicalUrl?: string | null;
  role?: string | null;
  robotsStatus?: string | null;
};

export type HistoricalIntakeRun = {
  id: string;
  status: string;
  provider?: string | null;
  finishedAt?: Date | string | null;
};

export type HistoricalIntakeArtifact = {
  runId: string;
  kind: string;
  contentHash: string;
};

export type HistoricalIntakeRow = {
  id: string;
  sourceKey: string;
  baseUrl?: string | null;
  status: string;
  complianceStatus: string;
  affiliateSourceId?: string | null;
  lastRunId?: string | null;
  pages: HistoricalIntakePage[];
  runs: HistoricalIntakeRun[];
  artifacts: HistoricalIntakeArtifact[];
};

export type HistoricalCandidateRow = {
  sourceId: string;
  status: string;
  listingKind: string;
  dedupeKey: string;
  title: string;
  officialActionUrl: string;
  sourceUrl?: string | null;
  startsAt?: Date | string | null;
  city?: string | null;
  venueName?: string | null;
  address?: string | null;
};

export type HistoricalMappingJobRow = {
  intakeId: string;
  status: string;
  finishedAt?: Date | string | null;
  resultSummary?: unknown;
};

export type HistoricalSetupScript = {
  path: string;
  sourceText: string;
};

export type HistoricalDatasetInput = {
  capturedAt: Date;
  environment: 'local' | 'live';
  repositoryCommit: string;
  sources: HistoricalSourceRow[];
  mappings: HistoricalMappingRow[];
  intakes: HistoricalIntakeRow[];
  candidates: HistoricalCandidateRow[];
  mappingJobs: HistoricalMappingJobRow[];
  setupScripts: HistoricalSetupScript[];
};

export type EvidenceMatchMethod =
  | 'AFFILIATE_SOURCE_ID'
  | 'SOURCE_KEY'
  | 'CANONICAL_URL'
  | 'ORGANIZATION_WEBSITE'
  | 'REGISTRABLE_DOMAIN'
  | 'NONE';

export type EvidenceBackfillMatch = {
  status: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';
  method: EvidenceMatchMethod;
  intakeId: string | null;
  candidateIntakeIds: string[];
  reason: string;
};

export type HistoricalDatasetInventoryRow = {
  exampleId: string;
  sourceId: string;
  sourceKey: string;
  sourceName: string;
  targetKind: string;
  sourceStatus: string;
  registrableDomain: string;
  platformFamily: string | null;
  split: 'train' | 'validation' | 'test';
  evidenceLabel: 'FAITHFUL' | 'LEGACY_PARTIAL' | 'STALE' | 'BLOCKED';
  labelReasons: string[];
  mappingId: string | null;
  mappingVersion: number | null;
  mappingHash: string | null;
  mappingValidatedAt: string | null;
  intakeMatch: EvidenceBackfillMatch;
  intakeId: string | null;
  intakeSourceKey: string | null;
  runId: string | null;
  artifactCount: number;
  artifactKinds: string[];
  candidateCounts: Record<string, number>;
  candidateFixtureHash: string | null;
  setupScriptPath: string | null;
  setupScriptHash: string | null;
  trainEligible: boolean;
  trainingExample: AffiliateMappingTrainingExample | null;
};

const recordValue = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const isoString = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const canonicalUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
};

export const registrableDomainForUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    const parsed = parseDomain(hostname, { allowPrivateDomains: true });
    return parsed.domain?.toLowerCase() ?? hostname;
  } catch {
    return null;
  }
};

const SHARED_PLATFORM_DOMAINS = new Set([
  'bluesombrero.com',
  'leagueapps.com',
  'sportsengine.com',
  'sportsengine-play.com',
  'square.site',
  'teamsnap.com',
  'teamlinkt.com',
  'wixsite.com',
]);

const sharedPlatformForUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return Array.from(SHARED_PLATFORM_DOMAINS)
      .find((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
      ?? null;
  } catch {
    return null;
  }
};

const intakeUrls = (intake: HistoricalIntakeRow): string[] => [
  intake.baseUrl,
  ...intake.pages.flatMap((page) => [page.url, page.canonicalUrl]),
].map(canonicalUrl).filter((value): value is string => Boolean(value));

const sourceUrls = (source: HistoricalSourceRow): string[] => [
  source.listUrl,
  source.baseUrl,
  source.organizationWebsite,
].map(canonicalUrl).filter((value): value is string => Boolean(value));

const resolvedMatch = (
  candidates: HistoricalIntakeRow[],
  method: EvidenceMatchMethod,
  reason: string,
): EvidenceBackfillMatch | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return {
      status: 'MATCHED',
      method,
      intakeId: candidates[0].id,
      candidateIntakeIds: [candidates[0].id],
      reason,
    };
  }
  return {
    status: 'AMBIGUOUS',
    method,
    intakeId: null,
    candidateIntakeIds: candidates.map((candidate) => candidate.id).sort(),
    reason: `${reason} Multiple intakes matched at the same precedence.`,
  };
};

export const matchHistoricalSourceToIntake = (
  source: HistoricalSourceRow,
  intakes: HistoricalIntakeRow[],
): EvidenceBackfillMatch => {
  const linked = resolvedMatch(
    intakes.filter((intake) => intake.affiliateSourceId === source.id),
    'AFFILIATE_SOURCE_ID',
    'Matched the intake affiliateSourceId to the source id.',
  );
  if (linked) return linked;

  const keyMatch = resolvedMatch(
    intakes.filter((intake) => intake.sourceKey === source.sourceKey),
    'SOURCE_KEY',
    'Matched the exact source key.',
  );
  if (keyMatch) return keyMatch;

  const sourceUrlSet = new Set(sourceUrls(source));
  const urlMatch = resolvedMatch(
    intakes.filter((intake) => intakeUrls(intake).some((url) => sourceUrlSet.has(url))),
    'CANONICAL_URL',
    'Matched an exact canonical source, intake, or page URL.',
  );
  if (urlMatch) return urlMatch;

  const organizationWebsite = canonicalUrl(source.organizationWebsite);
  if (organizationWebsite) {
    const organizationMatch = resolvedMatch(
      intakes.filter((intake) => intakeUrls(intake).includes(organizationWebsite)),
      'ORGANIZATION_WEBSITE',
      'Matched the exact organization website.',
    );
    if (organizationMatch) return organizationMatch;
  }

  const domain = registrableDomainForUrl(source.organizationWebsite ?? source.baseUrl ?? source.listUrl);
  if (!domain) {
    return {
      status: 'UNMATCHED',
      method: 'NONE',
      intakeId: null,
      candidateIntakeIds: [],
      reason: 'The source has no valid URL for domain matching.',
    };
  }
  const sharedPlatform = sharedPlatformForUrl(
    source.organizationWebsite ?? source.baseUrl ?? source.listUrl,
  );
  if (sharedPlatform) {
    return {
      status: 'UNMATCHED',
      method: 'NONE',
      intakeId: null,
      candidateIntakeIds: [],
      reason: `Domain-only matching is disabled for shared platform ${sharedPlatform}.`,
    };
  }
  const domainCandidates = intakes.filter((intake) => (
    intakeUrls(intake).some((url) => registrableDomainForUrl(url) === domain)
  ));
  const domainMatch = resolvedMatch(
    domainCandidates,
    'REGISTRABLE_DOMAIN',
    `Matched the unique registrable domain ${domain}.`,
  );
  return domainMatch ?? {
    status: 'UNMATCHED',
    method: 'NONE',
    intakeId: null,
    candidateIntakeIds: [],
    reason: 'No intake matched the source id, key, URLs, organization website, or domain.',
  };
};

const platformFamilyFor = (source: HistoricalSourceRow): string | null => {
  const urls = [source.listUrl, source.baseUrl, source.organizationWebsite]
    .filter((value): value is string => Boolean(value));
  for (const value of urls) {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      if (hostname.includes('sportsengine')) return 'SPORTSENGINE';
      if (hostname.includes('leagueapps')) return 'LEAGUEAPPS';
      if (hostname.includes('teamlinkt')) return 'TEAMLINKT';
      if (hostname.includes('teamsnap')) return 'TEAMSNAP';
      if (hostname.includes('wixsite') || hostname.includes('wixstatic')) return 'WIX';
      if (hostname.includes('bluesombrero')) return 'BLUESOMBRERO';
    } catch {
      // Invalid URLs are reported through an empty registrable domain later.
    }
  }
  const parser = stringValue(recordValue(source.metadata)?.parser);
  return parser?.toUpperCase() ?? null;
};

const deterministicHash = (value: string): string => createHash('sha256').update(value).digest('hex');

export const assignHistoricalDomainSplits = (
  domains: string[],
  options: { minimumTestDomains?: number; minimumValidationDomains?: number } = {},
): Map<string, 'train' | 'validation' | 'test'> => {
  const uniqueDomains = Array.from(new Set(domains.filter(Boolean)));
  const ordered = uniqueDomains.sort((left, right) => (
    deterministicHash(left).localeCompare(deterministicHash(right)) || left.localeCompare(right)
  ));
  const minimumTest = Math.min(options.minimumTestDomains ?? 30, ordered.length);
  const remainingAfterTest = Math.max(0, ordered.length - minimumTest);
  const minimumValidation = Math.min(
    options.minimumValidationDomains ?? Math.max(1, Math.floor(ordered.length * 0.15)),
    remainingAfterTest,
  );
  const assignments = new Map<string, 'train' | 'validation' | 'test'>();
  ordered.forEach((domain, index) => {
    if (index < minimumTest) assignments.set(domain, 'test');
    else if (index < minimumTest + minimumValidation) assignments.set(domain, 'validation');
    else assignments.set(domain, 'train');
  });
  return assignments;
};

const setupScriptFor = (
  source: HistoricalSourceRow,
  scripts: HistoricalSetupScript[],
): HistoricalSetupScript | null => {
  const tokens = source.sourceKey.split('-').filter((token) => token.length >= 3);
  return scripts.find((script) => (
    script.sourceText.includes(source.sourceKey)
    || script.sourceText.includes(source.id)
    || tokens.filter((token) => script.path.includes(token)).length >= Math.min(2, tokens.length)
  )) ?? null;
};

const sourceEvidenceFor = (source: HistoricalSourceRow) => (
  recordValue(recordValue(source.metadata)?.sourceEvidence)
);

const approvedHumanFor = (
  jobs: HistoricalMappingJobRow[],
): { approvedByUserId: string; approvedAt: string } | null => {
  for (const job of jobs) {
    if (job.status !== 'APPROVED') continue;
    const approval = recordValue(recordValue(job.resultSummary)?.humanApproval);
    const approvedByUserId = stringValue(approval?.approvedByUserId);
    const approvedAt = isoString(stringValue(approval?.approvedAt) ?? job.finishedAt);
    if (approvedByUserId && approvedAt) return { approvedByUserId, approvedAt };
  }
  return null;
};

const candidateFixtureFor = (candidates: HistoricalCandidateRow[]) => candidates
  .map((candidate) => ({
    listingKind: candidate.listingKind,
    dedupeKey: candidate.dedupeKey,
    title: candidate.title,
    officialActionUrl: candidate.officialActionUrl,
    sourceUrl: candidate.sourceUrl ?? null,
    startsAt: isoString(candidate.startsAt),
    city: candidate.city ?? null,
    venueName: candidate.venueName ?? null,
    address: candidate.address ?? null,
    status: candidate.status,
  }))
  .sort((left, right) => (
    left.dedupeKey.localeCompare(right.dedupeKey)
    || left.title.localeCompare(right.title)
  ));

const countCandidateStatuses = (candidates: HistoricalCandidateRow[]): Record<string, number> => (
  Object.fromEntries(
    Array.from(new Set(candidates.map((candidate) => candidate.status)))
      .sort()
      .map((status) => [
        status,
        candidates.filter((candidate) => candidate.status === status).length,
      ]),
  )
);

const selectedRunFor = (
  source: HistoricalSourceRow,
  intake: HistoricalIntakeRow | null,
): HistoricalIntakeRun | null => {
  if (!intake) return null;
  const evidenceRunId = stringValue(sourceEvidenceFor(source)?.runId);
  if (evidenceRunId) {
    return intake.runs.find((run) => run.id === evidenceRunId) ?? null;
  }
  if (intake.lastRunId) {
    const lastRun = intake.runs.find((run) => run.id === intake.lastRunId);
    if (lastRun) return lastRun;
  }
  return [...intake.runs]
    .filter((run) => ['SUCCEEDED', 'PARTIAL', 'BLOCKED'].includes(run.status))
    .sort((left, right) => (
      (isoString(right.finishedAt) ?? '').localeCompare(isoString(left.finishedAt) ?? '')
    ))[0] ?? null;
};

const buildTrainingExample = (input: {
  rowId: string;
  label: 'FAITHFUL' | 'LEGACY_PARTIAL' | 'STALE' | 'BLOCKED';
  source: HistoricalSourceRow;
  mapping: HistoricalMappingRow | null;
  intake: HistoricalIntakeRow | null;
  run: HistoricalIntakeRun | null;
  artifacts: HistoricalIntakeArtifact[];
  split: 'train' | 'validation' | 'test';
  domain: string;
  platformFamily: string | null;
  candidateFixtureHash: string | null;
  approval: { approvedByUserId: string; approvedAt: string } | null;
}): AffiliateMappingTrainingExample | null => {
  if (!input.intake || !input.run || input.artifacts.length === 0) return null;
  if (input.label !== 'FAITHFUL' && input.label !== 'BLOCKED') return null;
  const mappingHash = input.mapping ? stableAgentArtifactSha256(input.mapping.mapping) : null;
  const draftHash = stableAgentArtifactSha256({
    sourceId: input.source.id,
    mappingHash,
    runId: input.run.id,
    label: input.label,
  });
  const example = {
    schemaVersion: 1 as const,
    exampleId: input.rowId,
    evidenceLabel: input.label,
    input: {
      intakeSourceKey: input.intake.sourceKey,
      runId: input.run.id,
      artifacts: input.artifacts.map((artifact) => ({
        kind: artifact.kind,
        sha256: artifact.contentHash,
      })),
      contextContractVersion: 1,
    },
    output: input.label === 'BLOCKED'
      ? null
      : {
          draftHash,
          approvedMappingHash: mappingHash,
          approvedCandidateFixtureHash: input.candidateFixtureHash,
        },
    correction: null,
    split: input.split,
    registrableDomain: input.domain,
    platformFamily: input.platformFamily,
    humanApproval: input.label === 'FAITHFUL' ? input.approval : null,
  };
  const parsed = affiliateMappingTrainingExampleSchema.safeParse(example);
  return parsed.success ? parsed.data : null;
};

export const buildAffiliateHistoricalDatasetInventory = (
  input: HistoricalDatasetInput,
): {
  schemaVersion: 1;
  capturedAt: string;
  environment: 'local' | 'live';
  repositoryCommit: string;
  rows: HistoricalDatasetInventoryRow[];
  trainingExamples: AffiliateMappingTrainingExample[];
  summary: {
    total: number;
    byEvidenceLabel: Record<string, number>;
    bySplit: Record<string, number>;
    trainEligible: number;
  };
} => {
  const domains = input.sources.map((source) => (
    registrableDomainForUrl(source.organizationWebsite ?? source.baseUrl ?? source.listUrl)
    ?? `invalid:${source.sourceKey}`
  ));
  const splitAssignments = assignHistoricalDomainSplits(domains);
  const rows = input.sources
    .map((source): HistoricalDatasetInventoryRow => {
      const mapping = input.mappings.find((candidateMapping) => (
        candidateMapping.sourceId === source.id
        && (
          candidateMapping.id === source.activeMappingId
          || (!source.activeMappingId && candidateMapping.isActive)
        )
      )) ?? null;
      const intakeMatch = matchHistoricalSourceToIntake(source, input.intakes);
      const intake = intakeMatch.intakeId
        ? input.intakes.find((candidateIntake) => candidateIntake.id === intakeMatch.intakeId) ?? null
        : null;
      const run = selectedRunFor(source, intake);
      const artifacts = run && intake
        ? intake.artifacts
          .filter((artifact) => artifact.runId === run.id)
          .sort((left, right) => (
            left.kind.localeCompare(right.kind)
            || left.contentHash.localeCompare(right.contentHash)
          ))
        : [];
      const candidates = input.candidates.filter((candidateRow) => candidateRow.sourceId === source.id);
      const candidateFixture = candidateFixtureFor(candidates);
      const candidateFixtureHash = candidates.length
        ? stableAgentArtifactSha256(candidateFixture)
        : null;
      const sourceJobs = intake
        ? input.mappingJobs.filter((job) => job.intakeId === intake.id)
        : [];
      const approval = approvedHumanFor(sourceJobs);
      const setupScript = setupScriptFor(source, input.setupScripts);
      const sourceEvidence = sourceEvidenceFor(source);
      const evidenceMatches = Boolean(
        intake
        && run
        && stringValue(sourceEvidence?.intakeSourceKey) === intake.sourceKey
        && stringValue(sourceEvidence?.runId) === run.id,
      );
      const artifactKinds = Array.from(new Set(artifacts.map((artifact) => artifact.kind))).sort();
      const hasPrimaryPageEvidence = (
        artifactKinds.includes('PAGE_HTML')
        || artifactKinds.includes('PAGE_MARKDOWN')
      );
      const hasPolicyEvidence = artifactKinds.includes('ROBOTS')
        || artifactKinds.includes('POLICY_NOTE');
      const hasApprovedJob = sourceJobs.some((job) => job.status === 'APPROVED');
      const hasPublishedCandidate = candidates.some((candidateRow) => (
        candidateRow.status === 'PUBLISHED'
      ));
      const labelReasons: string[] = [];
      let evidenceLabel: HistoricalDatasetInventoryRow['evidenceLabel'];

      if (
        source.status.includes('BLOCKED')
        || intake?.complianceStatus === 'BLOCKED'
        || run?.status === 'BLOCKED'
      ) {
        evidenceLabel = 'BLOCKED';
        labelReasons.push('The source or matched intake has an explicit blocked policy state.');
      } else if (source.status === 'REPLACED' || source.status === 'ARCHIVED') {
        evidenceLabel = 'STALE';
        labelReasons.push(`The source status is ${source.status}.`);
      } else {
        const faithfulChecks = [
          [Boolean(mapping?.isActive), 'No active mapping is linked.'],
          [Boolean(mapping?.validatedAt), 'The active mapping has no validation timestamp.'],
          [intakeMatch.status === 'MATCHED', 'No unambiguous intake match exists.'],
          [intake?.complianceStatus === 'ALLOWED', 'The matched intake is not policy-approved.'],
          [Boolean(run && ['SUCCEEDED', 'PARTIAL'].includes(run.status)), 'No successful stored run is selected.'],
          [evidenceMatches, 'Source metadata does not cite the matched intake and run.'],
          [hasPrimaryPageEvidence, 'The selected run lacks stored HTML or Markdown.'],
          [hasPolicyEvidence, 'The selected run lacks robots or policy evidence.'],
          [hasApprovedJob, 'No approved mapping job is linked to the intake.'],
          [Boolean(approval), 'The approved mapping job lacks identifiable human approval metadata.'],
          [hasPublishedCandidate, 'No published candidate demonstrates reviewed output.'],
          [Boolean(setupScript), 'No durable checked-in setup script was matched.'],
        ] as const;
        const failures = faithfulChecks
          .filter(([passed]) => !passed)
          .map(([, reason]) => reason);
        if (failures.length === 0) {
          evidenceLabel = 'FAITHFUL';
          labelReasons.push('Mapping, evidence, output, setup code, and human approval are provenance-linked.');
        } else {
          evidenceLabel = 'LEGACY_PARTIAL';
          labelReasons.push(...failures);
        }
      }

      const domain = registrableDomainForUrl(
        source.organizationWebsite ?? source.baseUrl ?? source.listUrl,
      ) ?? `invalid:${source.sourceKey}`;
      const split = splitAssignments.get(domain) ?? 'train';
      const rowId = stableAgentArtifactSha256({
        sourceId: source.id,
        mappingId: mapping?.id ?? null,
        intakeId: intake?.id ?? null,
        runId: run?.id ?? null,
        evidenceLabel,
      });
      const platformFamily = platformFamilyFor(source);
      const trainingExample = buildTrainingExample({
        rowId,
        label: evidenceLabel,
        source,
        mapping,
        intake,
        run,
        artifacts,
        split,
        domain,
        platformFamily,
        candidateFixtureHash,
        approval,
      });

      return {
        exampleId: rowId,
        sourceId: source.id,
        sourceKey: source.sourceKey,
        sourceName: source.name,
        targetKind: source.targetKind,
        sourceStatus: source.status,
        registrableDomain: domain,
        platformFamily,
        split,
        evidenceLabel,
        labelReasons,
        mappingId: mapping?.id ?? null,
        mappingVersion: mapping?.version ?? null,
        mappingHash: mapping ? stableAgentArtifactSha256(mapping.mapping) : null,
        mappingValidatedAt: isoString(mapping?.validatedAt),
        intakeMatch,
        intakeId: intake?.id ?? null,
        intakeSourceKey: intake?.sourceKey ?? null,
        runId: run?.id ?? null,
        artifactCount: artifacts.length,
        artifactKinds,
        candidateCounts: countCandidateStatuses(candidates),
        candidateFixtureHash,
        setupScriptPath: setupScript?.path ?? null,
        setupScriptHash: setupScript
          ? createHash('sha256').update(setupScript.sourceText).digest('hex')
          : null,
        trainEligible: Boolean(trainingExample && split === 'train'),
        trainingExample,
      };
    })
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

  const trainingExamples = rows
    .map((row) => row.trainingExample)
    .filter((example): example is AffiliateMappingTrainingExample => Boolean(example));
  const countBy = (values: string[]) => Object.fromEntries(
    Array.from(new Set(values)).sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
  return {
    schemaVersion: 1,
    capturedAt: input.capturedAt.toISOString(),
    environment: input.environment,
    repositoryCommit: input.repositoryCommit,
    rows,
    trainingExamples,
    summary: {
      total: rows.length,
      byEvidenceLabel: countBy(rows.map((row) => row.evidenceLabel)),
      bySplit: countBy(rows.map((row) => row.split)),
      trainEligible: rows.filter((row) => row.trainEligible).length,
    },
  };
};

export type EvidenceBackfillPlanRow = {
  sourceId: string;
  sourceKey: string;
  sourceName: string;
  match: EvidenceBackfillMatch;
  action: 'USE_EXISTING_INTAKE' | 'REVIEW_AMBIGUOUS_MATCH' | 'PROPOSE_INTAKE' | 'RECORD_BLOCKED';
  proposedPages: Array<{ url: string; role: string }>;
};

export const planAffiliateSourceEvidenceBackfill = (
  sources: HistoricalSourceRow[],
  intakes: HistoricalIntakeRow[],
  mappings: HistoricalMappingRow[],
): EvidenceBackfillPlanRow[] => sources.map((source) => {
  const match = matchHistoricalSourceToIntake(source, intakes);
  if (source.status.includes('BLOCKED')) {
    return {
      sourceId: source.id,
      sourceKey: source.sourceKey,
      sourceName: source.name,
      match,
      action: 'RECORD_BLOCKED' as const,
      proposedPages: [],
    };
  }
  if (match.status === 'MATCHED') {
    return {
      sourceId: source.id,
      sourceKey: source.sourceKey,
      sourceName: source.name,
      match,
      action: 'USE_EXISTING_INTAKE' as const,
      proposedPages: [],
    };
  }
  if (match.status === 'AMBIGUOUS') {
    return {
      sourceId: source.id,
      sourceKey: source.sourceKey,
      sourceName: source.name,
      match,
      action: 'REVIEW_AMBIGUOUS_MATCH' as const,
      proposedPages: [],
    };
  }
  const mapping = mappings.find((candidate) => (
    candidate.sourceId === source.id
    && (candidate.id === source.activeMappingId || (!source.activeMappingId && candidate.isActive))
  ));
  const parsedMapping = mapping ? affiliateScrapeMappingSchema.safeParse(mapping.mapping) : null;
  const proposed = new Map<string, { url: string; role: string }>();
  const addPage = (url: string | null | undefined, role: string) => {
    const canonical = canonicalUrl(url);
    if (canonical && !proposed.has(canonical)) proposed.set(canonical, { url: canonical, role });
  };
  addPage(source.baseUrl ?? source.organizationWebsite, 'HOME');
  addPage(source.listUrl, 'LISTING');
  if (parsedMapping?.success) {
    parsedMapping.data.manualCandidates?.slice(0, 5).forEach((candidate) => {
      addPage(candidate.sourceUrl ?? candidate.officialActionUrl, 'DETAIL');
      addPage(candidate.officialActionUrl, 'REGISTRATION');
    });
  }
  return {
    sourceId: source.id,
    sourceKey: source.sourceKey,
    sourceName: source.name,
    match,
    action: 'PROPOSE_INTAKE' as const,
    proposedPages: Array.from(proposed.values()),
  };
}).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

type HistoricalDatasetPrisma = {
  affiliateScrapeSources: { findMany(args: unknown): Promise<Array<{
    id: string;
    sourceKey: string;
    name: string;
    listUrl: string;
    baseUrl?: string | null;
    targetKind: string;
    status: string;
    activeMappingId?: string | null;
    organizationId?: string | null;
    metadata?: unknown;
  }>> };
  affiliateScrapeMappings: { findMany(args: unknown): Promise<HistoricalMappingRow[]> };
  affiliateSourceIntakes: { findMany(args: unknown): Promise<Array<{
    id: string;
    sourceKey: string;
    baseUrl?: string | null;
    status: string;
    complianceStatus: string;
    affiliateSourceId?: string | null;
    lastRunId?: string | null;
  }>> };
  affiliateSourceIntakePages: { findMany(args: unknown): Promise<Array<HistoricalIntakePage & {
    intakeId: string;
  }>> };
  affiliateSourceIntakeRuns: { findMany(args: unknown): Promise<Array<HistoricalIntakeRun & {
    intakeId: string;
  }>> };
  affiliateSourceIntakeArtifacts: {
    findMany(args: unknown): Promise<Array<HistoricalIntakeArtifact & { intakeId: string }>>;
  };
  affiliateImportCandidates: { findMany(args: unknown): Promise<HistoricalCandidateRow[]> };
  affiliateSourceMappingJobs: { findMany(args: unknown): Promise<HistoricalMappingJobRow[]> };
  organizations: { findMany(args: unknown): Promise<Array<{ id: string; website?: string | null }>> };
};

const historicalSetupScriptPattern = /^setup-.*\.ts$/;

export const readHistoricalSetupScripts = async (
  scriptsDirectory = path.join(process.cwd(), 'scripts'),
): Promise<HistoricalSetupScript[]> => {
  const entries = await fs.readdir(scriptsDirectory, { withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile() && historicalSetupScriptPattern.test(entry.name))
    .map((entry) => path.join(scriptsDirectory, entry.name))
    .sort();
  return Promise.all(paths.map(async (scriptPath) => ({
    path: path.posix.join('scripts', path.basename(scriptPath)),
    sourceText: await fs.readFile(scriptPath, 'utf8'),
  })));
};

export const collectAffiliateHistoricalDatasetInput = async (input: {
  prisma: HistoricalDatasetPrisma;
  environment: 'local' | 'live';
  repositoryCommit: string;
  capturedAt?: Date;
  scriptsDirectory?: string;
}): Promise<HistoricalDatasetInput> => {
  const [
    sourceRows,
    mappings,
    intakeRows,
    pages,
    runs,
    artifacts,
    candidates,
    mappingJobs,
    setupScripts,
  ] = await Promise.all([
    input.prisma.affiliateScrapeSources.findMany({
      select: {
        id: true,
        sourceKey: true,
        name: true,
        listUrl: true,
        baseUrl: true,
        targetKind: true,
        status: true,
        activeMappingId: true,
        organizationId: true,
        metadata: true,
      },
      orderBy: { sourceKey: 'asc' },
    }),
    input.prisma.affiliateScrapeMappings.findMany({
      select: {
        id: true,
        sourceId: true,
        version: true,
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
        baseUrl: true,
        status: true,
        complianceStatus: true,
        affiliateSourceId: true,
        lastRunId: true,
      },
      orderBy: { sourceKey: 'asc' },
    }),
    input.prisma.affiliateSourceIntakePages.findMany({
      select: {
        intakeId: true,
        url: true,
        canonicalUrl: true,
        role: true,
        robotsStatus: true,
      },
      orderBy: [{ intakeId: 'asc' }, { url: 'asc' }],
    }),
    input.prisma.affiliateSourceIntakeRuns.findMany({
      select: {
        intakeId: true,
        id: true,
        status: true,
        provider: true,
        finishedAt: true,
      },
      orderBy: [{ intakeId: 'asc' }, { createdAt: 'desc' }],
    }),
    input.prisma.affiliateSourceIntakeArtifacts.findMany({
      select: {
        intakeId: true,
        runId: true,
        kind: true,
        contentHash: true,
      },
      orderBy: [{ intakeId: 'asc' }, { runId: 'asc' }, { kind: 'asc' }],
    }),
    input.prisma.affiliateImportCandidates.findMany({
      select: {
        sourceId: true,
        status: true,
        listingKind: true,
        dedupeKey: true,
        title: true,
        officialActionUrl: true,
        sourceUrl: true,
        startsAt: true,
        city: true,
        venueName: true,
        address: true,
      },
      orderBy: [{ sourceId: 'asc' }, { dedupeKey: 'asc' }],
    }),
    input.prisma.affiliateSourceMappingJobs.findMany({
      select: {
        intakeId: true,
        status: true,
        finishedAt: true,
        resultSummary: true,
      },
      orderBy: [{ intakeId: 'asc' }, { createdAt: 'desc' }],
    }),
    readHistoricalSetupScripts(input.scriptsDirectory),
  ]);

  const organizationIds = Array.from(new Set(
    sourceRows
      .map((source) => source.organizationId)
      .filter((id): id is string => Boolean(id)),
  ));
  const organizations = organizationIds.length
    ? await input.prisma.organizations.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, website: true },
      })
    : [];
  const websiteByOrganizationId = new Map(
    organizations.map((organization) => [organization.id, organization.website ?? null]),
  );

  return {
    capturedAt: input.capturedAt ?? new Date(),
    environment: input.environment,
    repositoryCommit: input.repositoryCommit,
    sources: sourceRows.map((source) => ({
      ...source,
      organizationWebsite: source.organizationId
        ? websiteByOrganizationId.get(source.organizationId) ?? null
        : null,
    })),
    mappings,
    intakes: intakeRows.map((intake) => ({
      ...intake,
      pages: pages.filter((page) => page.intakeId === intake.id).map((page) => ({
        url: page.url,
        canonicalUrl: page.canonicalUrl,
        role: page.role,
        robotsStatus: page.robotsStatus,
      })),
      runs: runs.filter((run) => run.intakeId === intake.id).map((run) => ({
        id: run.id,
        status: run.status,
        provider: run.provider,
        finishedAt: run.finishedAt,
      })),
      artifacts: artifacts
        .filter((artifact) => artifact.intakeId === intake.id)
        .map((artifact) => ({
          runId: artifact.runId,
          kind: artifact.kind,
          contentHash: artifact.contentHash,
        })),
    })),
    candidates,
    mappingJobs,
    setupScripts,
  };
};

export const renderJsonLines = (rows: unknown[]): string => (
  rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : ''
);
