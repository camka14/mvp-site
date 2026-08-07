import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import type { AffiliateApprovalQueueStatus } from './approvalQueue';
import { summarizeAffiliateApprovalQueue } from './approvalQueue';
import type { AffiliateMappingQueueStatus } from './sourceMappingQueueStatus';
import { summarizeAffiliateMappingQueue } from './sourceMappingQueueStatus';
import { AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT } from './codexIngestionResult';

export const AFFILIATE_EVENT_DATETIME_REMEDIATION_COHORT_SUBJECT_TYPE =
  'MAPPING_PRODUCER_REMEDIATION_COHORT';
export const AFFILIATE_EVENT_DATETIME_REMEDIATION_WAITING_STATUS =
  'WAITING_FOR_MAPPING_DRAIN';
export const AFFILIATE_EVENT_DATETIME_REMEDIATION_ENQUEUED_STATUS =
  'ENQUEUED_FOR_MAPPING_REMEDIATION';

const DISPLAY_MODES = ['SCHEDULED', 'DATE_ONLY', 'NO_FIXED_DATE', 'ONGOING'] as const;
type DisplayMode = (typeof DISPLAY_MODES)[number];
type ModeCounts = Record<DisplayMode, number> & { UNKNOWN: number };
type JsonRecord = Record<string, unknown>;
const SUCCESSFUL_INTAKE_RUN_STATUSES = new Set(['SUCCEEDED', 'PARTIAL']);
const CURRENT_CANDIDATE_STATUSES = new Set(['DISCOVERED', 'NEEDS_REVIEW', 'PUBLISHED']);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
);

const recordArray = (value: unknown): JsonRecord[] => (
  Array.isArray(value) ? value.map(recordValue) : []
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(stringValues);
  const single = stringValue(value);
  return single ? [single] : [];
};

const normalizedKind = (value: unknown): string => (
  stringValue(value)?.toUpperCase() ?? ''
);

const validCohortKey = (value: string): string => {
  const key = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(key)) {
    throw new Error('Affiliate event-datetime remediation cohort key is invalid.');
  }
  return key;
};

const validCutoff = (value: Date): Date => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Affiliate event-datetime remediation mapping cutoff is invalid.');
  }
  return value;
};

const sortedMappingJobIds = (value: string[]): string[] => {
  if (!Array.isArray(value)) throw new Error('Expected eligible mapping job IDs are required.');
  const normalized = value.map((id) => id.trim());
  if (normalized.some((id) => !id)) throw new Error('Expected eligible mapping job IDs cannot be empty.');
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Expected eligible mapping job IDs cannot contain duplicates.');
  }
  return normalized.sort();
};

const emptyModeCounts = (): ModeCounts => ({
  SCHEDULED: 0,
  DATE_ONLY: 0,
  NO_FIXED_DATE: 0,
  ONGOING: 0,
  UNKNOWN: 0,
});

const addModeCounts = (target: ModeCounts, source: ModeCounts): void => {
  for (const mode of [...DISPLAY_MODES, 'UNKNOWN' as const]) target[mode] += source[mode];
};

const candidateDisplayMode = (candidate: JsonRecord): keyof ModeCounts => {
  const explicitMode = stringValue(candidate.dateDisplayMode)?.toUpperCase();
  if (explicitMode && DISPLAY_MODES.includes(explicitMode as DisplayMode)) {
    return explicitMode as DisplayMode;
  }
  if (candidate.startsAt) return 'SCHEDULED';
  return 'UNKNOWN';
};

const countCandidateModes = (candidates: JsonRecord[]): ModeCounts => {
  const counts = emptyModeCounts();
  for (const candidate of candidates) counts[candidateDisplayMode(candidate)] += 1;
  return counts;
};

const mappingEventSignals = (mapping: JsonRecord): string[] => {
  const signals: string[] = [];
  const mappingKind = normalizedKind(mapping.kind);
  if (mappingKind === 'EVENT') signals.push('ACTIVE_MAPPING_KIND');
  const manualCandidates = recordArray(mapping.manualCandidates);
  if (manualCandidates.some((candidate) => normalizedKind(candidate.listingKind) === 'EVENT')) {
    signals.push('MANUAL_EVENT_CANDIDATE');
  }
  const serialized = JSON.stringify(mapping);
  if (serialized && /"(?:kind|targetKind|listingKind)"\s*:\s*"EVENT"/i.test(serialized)) {
    signals.push('MAPPING_EVENT_DESCRIPTOR');
  }
  return signals;
};

const customExtractorEventSignal = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  if (!serialized || !/custom[_ -]?extractor|extractorregistry/i.test(serialized)) return false;
  return /"(?:kind|targetKind|listingKind|customExtractorTargetKind)"\s*:\s*"EVENT"/i.test(serialized);
};

const sourceEventSignals = (input: {
  source: JsonRecord;
  mappings: JsonRecord[];
  intakes: JsonRecord[];
  mappingJobs: JsonRecord[];
  candidates: JsonRecord[];
}): string[] => {
  const signals: string[] = [];
  if (normalizedKind(input.source.targetKind) === 'EVENT') signals.push('SOURCE_TARGET_KIND');
  for (const mapping of input.mappings) {
    signals.push(...mappingEventSignals(recordValue(mapping.mapping)));
  }
  if (input.intakes.some((intake) => (
    stringValues(intake.targetKindHints).some((kind) => normalizedKind(kind) === 'EVENT')
  ))) {
    signals.push('INTAKE_TARGET_KIND_HINT');
  }
  if (input.candidates.some((candidate) => normalizedKind(candidate.listingKind) === 'EVENT')) {
    signals.push('RECENT_EVENT_CANDIDATE');
  }
  if (
    customExtractorEventSignal(input.source.metadata)
    || input.mappings.some((mapping) => customExtractorEventSignal(mapping.mapping))
    || input.mappingJobs.some((job) => customExtractorEventSignal(job.resultSummary))
  ) {
    signals.push('CUSTOM_EXTRACTOR_REGISTRY');
  }
  return Array.from(new Set(signals));
};

const latestByCreatedAt = (rows: JsonRecord[]): JsonRecord | null => rows
  .slice()
  .sort((left, right) => {
    const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : 0;
    const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : 0;
    return rightTime - leftTime;
  })[0] ?? null;

export type AffiliateEventDateTimeRemediationPackage = {
  sourceId: string;
  sourceKey: string;
  sourceStatus: string;
  mappingId: string | null;
  mappingJobId: string | null;
  mappingJobStatus: string | null;
  intakeId: string | null;
  approvalJobId: string | null;
  candidateCount: number;
  candidateModeCounts: ModeCounts;
  eventCandidateCount: number;
  evergreenCandidateCount: number;
  targetSignals: string[];
  storedEvidence: {
    intakeLastRunId: string | null;
    selectedRunId: string | null;
    selectedRunStatus: string | null;
    pageCount: number;
    artifactCount: number;
    pageHtmlCount: number;
    pageMarkdownCount: number;
  };
  eligible: boolean;
  exclusionReasons: string[];
};

export type AffiliateEventDateTimeRemediationQueueState = {
  mappingQueue: AffiliateMappingQueueStatus;
  approvalQueue: AffiliateApprovalQueueStatus;
  blockers: string[];
};

export type AffiliateEventDateTimeRemediationInventory = {
  schemaVersion: 1;
  cohortKey: string;
  contractRevision: typeof AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT;
  mappingCutoff: string;
  evaluatedAt: string;
  state: 'PREVIEW' | 'ALREADY_ENQUEUED';
  queue: AffiliateEventDateTimeRemediationQueueState;
  eligibleCount: number;
  excludedCount: number;
  candidateCount: number;
  eventCandidateCount: number;
  modeCounts: ModeCounts;
  eligibleMappingJobIds: string[];
  packages: AffiliateEventDateTimeRemediationPackage[];
};

type CohortDependencies = {
  client?: any;
  loadQueueState?: (
    client: any,
    now: Date,
  ) => Promise<AffiliateEventDateTimeRemediationQueueState>;
};

const cohortDb = (client: any = prisma as any) => ({
  approvals: client.affiliateApprovalJobs,
  sources: client.affiliateScrapeSources,
  mappings: client.affiliateScrapeMappings,
  intakes: client.affiliateSourceIntakes,
  runs: client.affiliateScrapeRuns,
  mappingJobs: client.affiliateSourceMappingJobs,
  mappingApprovals: client.affiliateApprovalJobs,
  candidates: client.affiliateImportCandidates,
  pages: client.affiliateSourceIntakePages,
  artifacts: client.affiliateSourceIntakeArtifacts,
  files: client.file,
});

const loadQueueState = async (
  client: any,
  now: Date,
): Promise<AffiliateEventDateTimeRemediationQueueState> => {
  const db = cohortDb(client);
  const [intakes, mappingJobs, captureRuns, approvalRows] = await Promise.all([
    db.intakes.findMany({ select: { id: true, status: true, complianceStatus: true } }),
    db.mappingJobs.findMany({ select: { id: true, intakeId: true, status: true, leaseExpiresAt: true } }),
    client.affiliateSourceIntakeRuns.findMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, intakeId: true, status: true },
    }),
    db.approvals.findMany({
      select: { id: true, subjectType: true, subjectKey: true, status: true, leaseExpiresAt: true },
    }),
  ]);
  const mappingQueue = summarizeAffiliateMappingQueue({ intakes, jobs: mappingJobs, captureRuns }, now);
  const approvalQueue = summarizeAffiliateApprovalQueue(approvalRows, now);
  const blockers = [
    ...(mappingQueue.claimableJobs > 0 ? ['MAPPING_CLAIMABLE_JOBS'] : []),
    ...(mappingQueue.activeLeases > 0 ? ['MAPPING_ACTIVE_LEASES'] : []),
    ...(mappingQueue.claimedWithoutLease > 0 ? ['MAPPING_CLAIMED_WITHOUT_LEASE'] : []),
    ...(mappingQueue.eligibleReadyIntakesWithoutJob > 0 ? ['READY_INTAKES_WITHOUT_JOBS'] : []),
    ...(mappingQueue.queuedCaptureRuns > 0 || mappingQueue.runningCaptureRuns > 0
      ? ['ALLOWED_CAPTURE_RUNS_ACTIVE']
      : []),
    ...(mappingQueue.reviewRequiredJobs > 0 ? ['MAPPING_REVIEWS_PENDING'] : []),
    ...(approvalQueue.claimableJobs > 0 ? ['APPROVAL_CLAIMABLE_JOBS'] : []),
    ...(approvalQueue.activeLeases > 0 ? ['APPROVAL_ACTIVE_LEASES'] : []),
    ...(approvalQueue.claimedWithoutLease > 0 ? ['APPROVAL_CLAIMED_WITHOUT_LEASE'] : []),
  ];
  return { mappingQueue, approvalQueue, blockers };
};

const findApprovalForMapping = (approvals: JsonRecord[], mappingJobId: string): JsonRecord | null => (
  approvals.find((approval) => (
    approval.subjectType === 'MAPPING_PACKAGE' && approval.subjectKey === mappingJobId
  )) ?? null
);

const sourceEvidenceRunId = (source: JsonRecord): string | null => (
  stringValue(recordValue(recordValue(source.metadata).sourceEvidence).runId)
);

const selectEvidenceRun = (input: {
  source: JsonRecord;
  intake: JsonRecord | null;
  runs: JsonRecord[];
}): JsonRecord | null => {
  const intakeId = stringValue(input.intake?.id);
  if (!intakeId) return null;
  const intakeRuns = input.runs.filter((run) => stringValue(run.intakeId) === intakeId);
  const citedRunId = sourceEvidenceRunId(input.source);
  if (citedRunId) return intakeRuns.find((run) => run.id === citedRunId) ?? null;
  const lastRunId = stringValue(input.intake?.lastRunId);
  if (lastRunId) return intakeRuns.find((run) => run.id === lastRunId) ?? null;
  return latestByCreatedAt(
    intakeRuns.filter((run) => SUCCESSFUL_INTAKE_RUN_STATUSES.has(normalizedKind(run.status))),
  );
};

const buildInventory = async (input: {
  client: any;
  cohortKey: string;
  mappingCutoff: Date;
  now: Date;
  queue: AffiliateEventDateTimeRemediationQueueState;
}): Promise<AffiliateEventDateTimeRemediationInventory> => {
  const db = cohortDb(input.client);
  const [sources, mappings, intakes, runs, mappingJobs, approvals, candidates, pages, artifacts] = await Promise.all([
    db.sources.findMany({
      select: {
        id: true,
        sourceKey: true,
        status: true,
        targetKind: true,
        activeMappingId: true,
        metadata: true,
      },
    }),
    db.mappings.findMany({
      select: { id: true, sourceId: true, createdAt: true, version: true, isActive: true, mapping: true },
    }),
    db.intakes.findMany({
      select: {
        id: true,
        createdAt: true,
        sourceKey: true,
        affiliateSourceId: true,
        status: true,
        targetKindHints: true,
        lastRunId: true,
      },
    }),
    db.runs.findMany({
      select: {
        id: true,
        sourceId: true,
        mappingId: true,
        intakeId: true,
        status: true,
        createdAt: true,
        finishedAt: true,
      },
    }),
    db.mappingJobs.findMany({
      where: { createdAt: { lte: input.mappingCutoff } },
      select: {
        id: true,
        intakeId: true,
        status: true,
        createdAt: true,
        claimedAt: true,
        leaseExpiresAt: true,
        resultSummary: true,
        errorMessage: true,
      },
    }),
    db.mappingApprovals.findMany({
      where: { subjectType: 'MAPPING_PACKAGE' },
      select: { id: true, subjectType: true, subjectKey: true, status: true, decision: true },
    }),
    db.candidates.findMany({
      select: {
        sourceId: true,
        runId: true,
        mappingId: true,
        listingKind: true,
        dateDisplayMode: true,
        startsAt: true,
        status: true,
      },
    }),
    db.pages.findMany({ select: { id: true, intakeId: true } }),
    db.artifacts.findMany({
      select: { id: true, intakeId: true, runId: true, kind: true, fileId: true },
    }),
  ]);
  const artifactFileIds = Array.from(new Set(
    (artifacts as JsonRecord[])
      .map((artifact) => stringValue(artifact.fileId))
      .filter((fileId): fileId is string => Boolean(fileId)),
  ));
  const files = artifactFileIds.length
    ? await db.files.findMany({
        where: { id: { in: artifactFileIds } },
        select: { id: true },
      })
    : [];
  const retainedFileIds = new Set(
    (files as JsonRecord[]).map((file) => stringValue(file.id)).filter((id): id is string => Boolean(id)),
  );

  const intakesById = new Map<string, JsonRecord>();
  const intakesBySourceId = new Map<string, JsonRecord[]>();
  const intakesBySourceKey = new Map<string, JsonRecord[]>();
  for (const intake of intakes as JsonRecord[]) {
    const intakeId = stringValue(intake.id);
    const sourceId = stringValue(intake.affiliateSourceId);
    const sourceKey = stringValue(intake.sourceKey);
    if (intakeId) intakesById.set(intakeId, intake);
    if (sourceId) {
      intakesBySourceId.set(sourceId, [
        ...(intakesBySourceId.get(sourceId) ?? []),
        intake,
      ]);
    }
    if (sourceKey) {
      intakesBySourceKey.set(sourceKey, [
        ...(intakesBySourceKey.get(sourceKey) ?? []),
        intake,
      ]);
    }
  }
  const mappingsBySource = new Map<string, JsonRecord[]>();
  for (const mapping of mappings as JsonRecord[]) {
    const sourceId = stringValue(mapping.sourceId);
    if (!sourceId) continue;
    mappingsBySource.set(sourceId, [...(mappingsBySource.get(sourceId) ?? []), mapping]);
  }
  const candidatesBySource = new Map<string, JsonRecord[]>();
  for (const candidate of candidates as JsonRecord[]) {
    const sourceId = stringValue(candidate.sourceId);
    if (!sourceId) continue;
    candidatesBySource.set(sourceId, [...(candidatesBySource.get(sourceId) ?? []), candidate]);
  }
  const jobsByIntake = new Map<string, JsonRecord[]>();
  for (const job of mappingJobs as JsonRecord[]) {
    const intakeId = stringValue(job.intakeId);
    if (!intakeId) continue;
    jobsByIntake.set(intakeId, [...(jobsByIntake.get(intakeId) ?? []), job]);
  }
  const pagesByIntake = new Map<string, number>();
  for (const page of pages as JsonRecord[]) {
    const intakeId = stringValue(page.intakeId);
    if (intakeId) pagesByIntake.set(intakeId, (pagesByIntake.get(intakeId) ?? 0) + 1);
  }
  const artifactsByIntake = new Map<string, number>();
  for (const artifact of artifacts as JsonRecord[]) {
    const intakeId = stringValue(artifact.intakeId);
    if (intakeId) artifactsByIntake.set(intakeId, (artifactsByIntake.get(intakeId) ?? 0) + 1);
  }

  const packages: AffiliateEventDateTimeRemediationPackage[] = [];
  for (const source of sources as JsonRecord[]) {
    const sourceId = stringValue(source.id);
    const sourceKey = stringValue(source.sourceKey);
    if (!sourceId || !sourceKey) continue;
    const sourceMappings = mappingsBySource.get(sourceId) ?? [];
    const sourceCandidates = candidatesBySource.get(sourceId) ?? [];
    const sourceIntakes = Array.from(new Map([
      ...(intakesBySourceId.get(sourceId) ?? []),
      ...(intakesBySourceKey.get(sourceKey) ?? []),
    ].map((intake) => [stringValue(intake.id) ?? '', intake])).values())
      .filter((intake) => Boolean(stringValue(intake.id)));
    const mapping = sourceMappings.find((candidate) => candidate.id === source.activeMappingId)
      ?? sourceMappings.find((candidate) => candidate.isActive === true)
      ?? latestByCreatedAt(sourceMappings);
    const intakeJobs = sourceIntakes.flatMap((intake) => (
      jobsByIntake.get(stringValue(intake.id) ?? '') ?? []
    ));
    const approvedMappingJob = latestByCreatedAt(
      intakeJobs.filter((job) => job.status === 'APPROVED'),
    );
    const intake = approvedMappingJob
      ? intakesById.get(stringValue(approvedMappingJob.intakeId) ?? '') ?? null
      : latestByCreatedAt(sourceIntakes);
    const currentMappingId = stringValue(mapping?.id);
    const latestSuccessfulRun = currentMappingId
      ? latestByCreatedAt((runs as JsonRecord[]).filter((run) => (
          stringValue(run.sourceId) === sourceId
          && stringValue(run.mappingId) === currentMappingId
          && SUCCESSFUL_INTAKE_RUN_STATUSES.has(normalizedKind(run.status))
          && run.createdAt instanceof Date
          && run.createdAt.getTime() <= input.now.getTime()
        )))
      : null;
    const recentCandidates = latestSuccessfulRun && currentMappingId
      ? sourceCandidates.filter((candidate) => (
          stringValue(candidate.runId) === stringValue(latestSuccessfulRun.id)
          && stringValue(candidate.mappingId) === currentMappingId
          && CURRENT_CANDIDATE_STATUSES.has(normalizedKind(candidate.status))
        ))
      : [];
    const signals = sourceEventSignals({
      source,
      mappings: sourceMappings,
      intakes: sourceIntakes,
      mappingJobs: intakeJobs,
      candidates: recentCandidates,
    });
    const mappingApproval = approvedMappingJob
      ? findApprovalForMapping(approvals as JsonRecord[], stringValue(approvedMappingJob.id) ?? '')
      : null;
    const modeCounts = countCandidateModes(recentCandidates);
    const exclusionReasons: string[] = [];
    if (!signals.length) exclusionReasons.push('NOT_EVENT_PRODUCING');
    if (!mapping) exclusionReasons.push('MISSING_MAPPING_DEFINITION');
    if (!intake) exclusionReasons.push('MISSING_INTAKE');
    if (!approvedMappingJob) exclusionReasons.push('MISSING_APPROVED_MAPPING_JOB');
    if (approvedMappingJob && !mappingApproval) exclusionReasons.push('MISSING_MAPPING_APPROVAL');
    if (mappingApproval && mappingApproval.status !== 'APPROVED') {
      exclusionReasons.push('MAPPING_APPROVAL_NOT_APPROVED');
    }
    const intakeId = stringValue(intake?.id);
    const pageCount = intakeId ? pagesByIntake.get(intakeId) ?? 0 : 0;
    const artifactCount = intakeId ? artifactsByIntake.get(intakeId) ?? 0 : 0;
    const intakeLastRunId = stringValue(intake?.lastRunId);
    const selectedEvidenceRun = selectEvidenceRun({
      source,
      intake,
      runs: runs as JsonRecord[],
    });
    const selectedRunId = stringValue(selectedEvidenceRun?.id);
    const selectedRunStatus = stringValue(selectedEvidenceRun?.status);
    const selectedRunArtifacts = selectedRunId && intakeId
      ? (artifacts as JsonRecord[]).filter((artifact) => (
          stringValue(artifact.intakeId) === intakeId
          && stringValue(artifact.runId) === selectedRunId
          && retainedFileIds.has(stringValue(artifact.fileId) ?? '')
          && ['PAGE_HTML', 'PAGE_MARKDOWN'].includes(normalizedKind(artifact.kind))
        ))
      : [];
    const pageHtmlCount = selectedRunArtifacts.filter(
      (artifact) => normalizedKind(artifact.kind) === 'PAGE_HTML',
    ).length;
    const pageMarkdownCount = selectedRunArtifacts.filter(
      (artifact) => normalizedKind(artifact.kind) === 'PAGE_MARKDOWN',
    ).length;
    if (intake && (
      !selectedEvidenceRun
      || !SUCCESSFUL_INTAKE_RUN_STATUSES.has(normalizedKind(selectedRunStatus))
      || pageHtmlCount + pageMarkdownCount === 0
    )) {
      exclusionReasons.push('MISSING_SUCCESSFUL_PAGE_EVIDENCE');
    }
    const packageRow: AffiliateEventDateTimeRemediationPackage = {
      sourceId,
      sourceKey,
      sourceStatus: stringValue(source.status) ?? 'UNKNOWN',
      mappingId: stringValue(mapping?.id),
      mappingJobId: stringValue(approvedMappingJob?.id),
      mappingJobStatus: stringValue(approvedMappingJob?.status),
      intakeId,
      approvalJobId: stringValue(mappingApproval?.id),
      candidateCount: recentCandidates.length,
      candidateModeCounts: modeCounts,
      eventCandidateCount: recentCandidates.filter(
        (candidate) => normalizedKind(candidate.listingKind) === 'EVENT',
      ).length,
      evergreenCandidateCount: modeCounts.NO_FIXED_DATE + modeCounts.ONGOING,
      targetSignals: signals,
      storedEvidence: {
        intakeLastRunId,
        selectedRunId,
        selectedRunStatus,
        pageCount,
        artifactCount,
        pageHtmlCount,
        pageMarkdownCount,
      },
      eligible: exclusionReasons.length === 0,
      exclusionReasons,
    };
    packages.push(packageRow);
  }

  const eligible = packages.filter((item) => item.eligible);
  const modeCounts = emptyModeCounts();
  for (const packageRow of packages) addModeCounts(modeCounts, packageRow.candidateModeCounts);
  return {
    schemaVersion: 1,
    cohortKey: input.cohortKey,
    contractRevision: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
    mappingCutoff: input.mappingCutoff.toISOString(),
    evaluatedAt: input.now.toISOString(),
    state: 'PREVIEW',
    queue: input.queue,
    eligibleCount: eligible.length,
    excludedCount: packages.length - eligible.length,
    candidateCount: packages.reduce((total, item) => total + item.candidateCount, 0),
    eventCandidateCount: packages.reduce((total, item) => total + item.eventCandidateCount, 0),
    modeCounts,
    eligibleMappingJobIds: eligible
      .map((item) => item.mappingJobId)
      .filter((id): id is string => Boolean(id))
      .sort(),
    packages,
  };
};

const storedInventory = (cohort: JsonRecord, decision: JsonRecord): AffiliateEventDateTimeRemediationInventory => ({
  schemaVersion: 1,
  cohortKey: stringValue(decision.cohortKey) ?? stringValue(cohort.subjectKey) ?? '',
  contractRevision: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
  mappingCutoff: stringValue(decision.mappingCutoff) ?? '',
  evaluatedAt: stringValue(decision.enqueuedAt) ?? stringValue(cohort.updatedAt) ?? new Date(0).toISOString(),
  state: 'ALREADY_ENQUEUED',
  queue: recordValue(decision.queue) as AffiliateEventDateTimeRemediationQueueState,
  eligibleCount: Number(decision.eligibleCount ?? 0),
  excludedCount: Number(decision.excludedCount ?? 0),
  candidateCount: Number(decision.candidateCount ?? 0),
  eventCandidateCount: Number(decision.eventCandidateCount ?? 0),
  modeCounts: {
    ...emptyModeCounts(),
    ...recordValue(decision.modeCounts),
  } as ModeCounts,
  eligibleMappingJobIds: stringValues(decision.eligibleMappingJobIds),
  packages: [],
});

export const previewAffiliateEventDateTimeRemediationCohort = async (
  input: { cohortKey: string; mappingCutoff: Date; now?: Date },
  dependencies: CohortDependencies = {},
): Promise<AffiliateEventDateTimeRemediationInventory> => {
  const cohortKey = validCohortKey(input.cohortKey);
  const mappingCutoff = validCutoff(input.mappingCutoff);
  const now = input.now ?? new Date();
  const client = dependencies.client ?? prisma as any;
  const db = cohortDb(client);
  const existing = await db.approvals.findUnique({
    where: {
      subjectType_subjectKey: {
        subjectType: AFFILIATE_EVENT_DATETIME_REMEDIATION_COHORT_SUBJECT_TYPE,
        subjectKey: cohortKey,
      },
    },
  });
  if (existing?.status === AFFILIATE_EVENT_DATETIME_REMEDIATION_ENQUEUED_STATUS) {
    return storedInventory(existing, recordValue(existing.decision));
  }
  const queue = await (dependencies.loadQueueState ?? loadQueueState)(client, now);
  return buildInventory({ client, cohortKey, mappingCutoff, now, queue });
};

export const applyAffiliateEventDateTimeRemediationCohort = async (input: {
  cohortKey: string;
  mappingCutoff: Date;
  expectedEligibleCount: number;
  expectedExcludedCount: number;
  expectedEligibleMappingJobIds: string[];
  operatorIdentity: string;
  now?: Date;
}, dependencies: CohortDependencies = {}) => {
  const cohortKey = validCohortKey(input.cohortKey);
  const mappingCutoff = validCutoff(input.mappingCutoff);
  const expectedEligibleMappingJobIds = sortedMappingJobIds(input.expectedEligibleMappingJobIds);
  const operatorIdentity = input.operatorIdentity.trim();
  if (!operatorIdentity) throw new Error('Affiliate event-datetime remediation operator identity is required.');
  if (!Number.isInteger(input.expectedEligibleCount) || input.expectedEligibleCount < 0) {
    throw new Error('Expected eligible cohort count is invalid.');
  }
  if (!Number.isInteger(input.expectedExcludedCount) || input.expectedExcludedCount < 0) {
    throw new Error('Expected excluded cohort count is invalid.');
  }
  const now = input.now ?? new Date();
  const client = dependencies.client ?? prisma as any;
  return client.$transaction(async (transaction: any) => {
    const db = cohortDb(transaction);
    const compoundWhere = {
      subjectType_subjectKey: {
        subjectType: AFFILIATE_EVENT_DATETIME_REMEDIATION_COHORT_SUBJECT_TYPE,
        subjectKey: cohortKey,
      },
    };
    const existing = await db.approvals.findUnique({ where: compoundWhere });
    if (existing?.status === AFFILIATE_EVENT_DATETIME_REMEDIATION_ENQUEUED_STATUS) {
      return storedInventory(existing, recordValue(existing.decision));
    }
    if (existing && existing.status !== AFFILIATE_EVENT_DATETIME_REMEDIATION_WAITING_STATUS) {
      throw new Error(`Affiliate event-datetime remediation cohort has unsupported status ${existing.status}.`);
    }
    const queue = await (dependencies.loadQueueState ?? loadQueueState)(transaction, now);
    if (queue.blockers.length) {
      throw new Error(`Affiliate event-datetime remediation cohort is blocked: ${queue.blockers.join(', ')}.`);
    }
    const inventory = await buildInventory({ client: transaction, cohortKey, mappingCutoff, now, queue });
    if (
      inventory.eligibleCount !== input.expectedEligibleCount
      || inventory.excludedCount !== input.expectedExcludedCount
    ) {
      throw new Error(
        `Affiliate event-datetime remediation cohort counts changed. Expected ${input.expectedEligibleCount} eligible and ${input.expectedExcludedCount} excluded, received ${inventory.eligibleCount} eligible and ${inventory.excludedCount} excluded.`,
      );
    }
    if (JSON.stringify(inventory.eligibleMappingJobIds) !== JSON.stringify(expectedEligibleMappingJobIds)) {
      throw new Error(
        `Affiliate event-datetime remediation cohort mapping job IDs changed. Expected [${expectedEligibleMappingJobIds.join(', ')}], received [${inventory.eligibleMappingJobIds.join(', ')}].`,
      );
    }
    const control = existing ?? await db.approvals.create({
      data: {
        id: createId(),
        subjectType: AFFILIATE_EVENT_DATETIME_REMEDIATION_COHORT_SUBJECT_TYPE,
        subjectKey: cohortKey,
        status: AFFILIATE_EVENT_DATETIME_REMEDIATION_WAITING_STATUS,
        decision: {
          schemaVersion: 1,
          cohortKey,
          contractRevision: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
          mappingCutoff: mappingCutoff.toISOString(),
          armedAt: now.toISOString(),
          operatorIdentity,
        },
      },
    });

    for (const packageRow of inventory.packages.filter((item) => item.eligible)) {
      const mappingJob = await db.mappingJobs.findUnique({ where: { id: packageRow.mappingJobId } });
      if (
        !mappingJob
        || mappingJob.status !== 'APPROVED'
        || mappingJob.leaseExpiresAt !== null
        || mappingJob.createdAt > mappingCutoff
      ) {
        throw new Error(`Affiliate mapping job ${packageRow.mappingJobId} changed before cohort enqueue.`);
      }
      const approval = await db.approvals.findUnique({
        where: {
          subjectType_subjectKey: {
            subjectType: 'MAPPING_PACKAGE',
            subjectKey: packageRow.mappingJobId,
          },
        },
      });
      if (!approval || approval.status !== 'APPROVED' || approval.leaseExpiresAt !== null) {
        throw new Error(`Affiliate mapping approval ${packageRow.approvalJobId} changed before cohort enqueue.`);
      }
      const intake = await db.intakes.findUnique({ where: { id: packageRow.intakeId } });
      if (!intake || intake.status !== 'PROMOTED') {
        throw new Error(`Affiliate source intake ${packageRow.intakeId} changed before cohort enqueue.`);
      }
      const envelope = recordValue(mappingJob.resultSummary);
      const repairHistory = recordArray(envelope.mappingRepairHistory);
      const fullReviewHistory = recordArray(envelope.mappingFullReviewHistory);
      const queuedAt = now.toISOString();
      const updateResult = await db.mappingJobs.updateMany({
        where: { id: mappingJob.id, status: 'APPROVED', leaseExpiresAt: null },
        data: {
          status: 'QUEUED',
          claimedAt: null,
          leaseExpiresAt: null,
          workerId: null,
          branch: null,
          commit: null,
          errorMessage: null,
          finishedAt: null,
          resultSummary: {
            ...envelope,
            cohortKey,
            remediationContext: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
            remediationContexts: [AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT],
            mappingFullReviewHistory: [...fullReviewHistory, {
              cohortKey,
              queuedAt,
              repairHistoryStartIndex: repairHistory.length,
              priorMappingStatus: mappingJob.status,
              priorMappingErrorMessage: mappingJob.errorMessage,
              priorApprovalJobId: approval.id,
              priorApprovalStatus: approval.status,
              priorDecision: approval.decision,
            }],
            mappingRepairHistory: [...repairHistory, {
              cohortKey,
              remediationContext: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
              queuedAt,
              repairReason: 'EVENT_DATETIME_REVIEW_REQUIRED',
              repairReasons: ['EVENT_DATETIME_REVIEW_REQUIRED'],
              priorMappingStatus: mappingJob.status,
              priorMappingErrorMessage: mappingJob.errorMessage,
              approvalJobId: approval.id,
              approvalStatus: approval.status,
              decision: 'DEFER',
              rationale: 'Review every event occurrence under the event-datetime-v1 remediation contract.',
              blockingIssues: [
                'Verify timezone evidence, start precision, end derivation, duration handling, DST behavior, title-clock consistency, and evergreen classification.',
              ],
            }],
          },
        },
      });
      if (updateResult.count !== 1) {
        throw new Error(`Affiliate mapping job ${mappingJob.id} changed during cohort enqueue.`);
      }
      const intakeUpdate = await db.intakes.updateMany({
        where: { id: intake.id, status: 'PROMOTED' },
        data: { status: 'READY_FOR_MAPPING' },
      });
      if (intakeUpdate.count !== 1) {
        throw new Error(`Affiliate source intake ${intake.id} changed during cohort enqueue.`);
      }
      const approvalUpdate = await db.approvals.updateMany({
        where: { id: approval.id, status: 'APPROVED', leaseExpiresAt: null },
        data: {
          status: 'DEFERRED',
          claimedAt: null,
          leaseExpiresAt: null,
          reviewerId: null,
          decision: {
            decision: 'DEFER',
            nextAction: 'PRODUCER_REPAIR',
            cohortKey,
            operatorIdentity,
            reasonCodes: ['EVENT_DATETIME_REVIEW_REQUIRED'],
            rationale: 'The event-datetime remediation cohort requires a fresh producer review.',
          },
          errorMessage: null,
          finishedAt: now,
        },
      });
      if (approvalUpdate.count !== 1) {
        throw new Error(`Affiliate mapping approval ${approval.id} changed during cohort enqueue.`);
      }
    }

    const decision = {
      schemaVersion: 1,
      cohortKey,
      contractRevision: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
      mappingCutoff: inventory.mappingCutoff,
      armedAt: now.toISOString(),
      enqueuedAt: now.toISOString(),
      operatorIdentity,
      eligibleCount: inventory.eligibleCount,
      excludedCount: inventory.excludedCount,
      candidateCount: inventory.candidateCount,
      eventCandidateCount: inventory.eventCandidateCount,
      targetKind: 'EVENT',
      finalEnqueueCount: inventory.eligibleCount,
      modeCounts: inventory.modeCounts,
      eligibleMappingJobIds: inventory.eligibleMappingJobIds,
      queue: inventory.queue,
    };
    await db.approvals.update({
      where: { id: control.id },
      data: {
        status: AFFILIATE_EVENT_DATETIME_REMEDIATION_ENQUEUED_STATUS,
        decision,
        errorMessage: null,
        finishedAt: now,
      },
    });
    return {
      ...inventory,
      state: 'ENQUEUED' as const,
    };
  });
};
