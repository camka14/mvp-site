import { createHash } from 'node:crypto';
import {
  buildAffiliateHistoricalDatasetInventory,
  planAffiliateSourceEvidenceBackfill,
  type HistoricalDatasetInput,
  type HistoricalDatasetInventoryRow,
  type HistoricalSourceRow,
} from './agentDataset';
import {
  isAffiliateAgentTargetKind,
  stableAgentArtifactSha256,
  type AffiliateAgentTargetKind,
} from './agentContracts';
import { affiliateScrapeMappingSchema, type AffiliateScrapeMapping } from './types';

export type AffiliateGoldCohortMappingMode =
  | 'SELECTOR'
  | 'MANUAL_CANDIDATES'
  | 'NONE';

export type AffiliateGoldCohortDateCoverage =
  | 'SCHEDULED'
  | 'EVERGREEN'
  | 'MIXED'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN';

export type AffiliateGoldCohortCandidate = {
  sourceId: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  targetKind: AffiliateAgentTargetKind;
  sourceStatus: string;
  registrableDomain: string;
  platformFamily: string | null;
  priorEvidenceLabel: HistoricalDatasetInventoryRow['evidenceLabel'];
  mappingId: string | null;
  mappingVersion: number | null;
  mappingMode: AffiliateGoldCohortMappingMode;
  mappingValidated: boolean;
  hasSetupScript: boolean;
  hasReviewedCandidateHistory: boolean;
  hasDetailPage: boolean;
  rendersJavascript: boolean;
  dateCoverage: AffiliateGoldCohortDateCoverage;
  intakeMatchStatus: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';
  intakePlanAction:
    | 'USE_EXISTING_INTAKE'
    | 'REVIEW_AMBIGUOUS_MATCH'
    | 'PROPOSE_INTAKE'
    | 'RECORD_BLOCKED';
  requiredCapturePages: Array<{ url: string; role: string }>;
};

export type AffiliateGoldCohortProposalExample = AffiliateGoldCohortCandidate & {
  scenarioIntent:
    | 'EXECUTABLE_MAPPING'
    | 'BLOCKED_REFUSAL'
    | 'INSUFFICIENT_EVIDENCE_REVIEW'
    | 'CUSTOM_EXTRACTOR_REVIEW';
  approvalStatus: 'UNAPPROVED';
  selectionReasons: string[];
};

export type AffiliateGoldCohortProposal = {
  schemaVersion: 1;
  cohortId: string;
  repositoryCommit: string;
  inventorySha256: string;
  proposalSha256: string;
  examples: AffiliateGoldCohortProposalExample[];
  reservedForLater: Array<{
    sourceId: string;
    sourceKey: string;
    registrableDomain: string;
    reason: string;
  }>;
  lockedDomainAssignments: Array<{
    registrableDomain: string;
    split: 'test';
  }>;
  lockedPlatformFamilies: string[];
  summary: {
    exampleCount: number;
    registrableDomainCount: number;
    targetKinds: Record<string, number>;
    historicalMappingModes: Record<string, number>;
    detailOrJavascriptCount: number;
    refusalOrInsufficiencyCount: number;
    customExtractorReviewCount: number;
    evergreenCount: number;
    scheduledCount: number;
    priorEvidenceLabels: Record<string, number>;
    databaseWrites: 0;
    publicRequests: 0;
  };
  deficits: string[];
  readyToLock: boolean;
};

const affiliateGoldCohortProposalBody = (
  proposal: Pick<
    AffiliateGoldCohortProposal,
    | 'repositoryCommit'
    | 'inventorySha256'
    | 'examples'
    | 'reservedForLater'
    | 'lockedDomainAssignments'
    | 'lockedPlatformFamilies'
    | 'summary'
    | 'deficits'
  >,
) => ({
  repositoryCommit: proposal.repositoryCommit,
  inventorySha256: proposal.inventorySha256,
  examples: proposal.examples,
  reservedForLater: proposal.reservedForLater,
  lockedDomainAssignments: proposal.lockedDomainAssignments,
  lockedPlatformFamilies: proposal.lockedPlatformFamilies,
  summary: proposal.summary,
  deficits: proposal.deficits,
});

export function assertAffiliateGoldCohortProposalIntegrity(
  value: unknown,
): asserts value is AffiliateGoldCohortProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Cohort proposal must be a JSON object.');
  }
  const proposal = value as Partial<AffiliateGoldCohortProposal>;
  if (
    proposal.schemaVersion !== 1
    || typeof proposal.cohortId !== 'string'
    || typeof proposal.repositoryCommit !== 'string'
    || typeof proposal.inventorySha256 !== 'string'
    || typeof proposal.proposalSha256 !== 'string'
    || !Array.isArray(proposal.examples)
    || !Array.isArray(proposal.reservedForLater)
    || !Array.isArray(proposal.lockedDomainAssignments)
    || !Array.isArray(proposal.lockedPlatformFamilies)
    || !proposal.summary
    || typeof proposal.summary !== 'object'
    || !Array.isArray(proposal.deficits)
    || typeof proposal.readyToLock !== 'boolean'
  ) {
    throw new Error('Cohort proposal is missing required fields.');
  }

  const expectedSha256 = stableAgentArtifactSha256(
    affiliateGoldCohortProposalBody(proposal as AffiliateGoldCohortProposal),
  );
  if (proposal.proposalSha256 !== expectedSha256) {
    throw new Error(
      `Cohort proposal hash mismatch: expected ${expectedSha256}, received ${proposal.proposalSha256}.`,
    );
  }
  const expectedCohortId = `affiliate-mapping-test-${expectedSha256.slice(0, 16)}`;
  if (proposal.cohortId !== expectedCohortId) {
    throw new Error(
      `Cohort proposal id mismatch: expected ${expectedCohortId}, received ${proposal.cohortId}.`,
    );
  }
  if (proposal.readyToLock !== (proposal.deficits.length === 0)) {
    throw new Error('Cohort proposal readiness does not match its recorded deficits.');
  }
}

const validatedCohortRevisionUrl = (value: string, label: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.hash
  ) {
    throw new Error(`${label} must be a public HTTPS URL without credentials or a fragment.`);
  }
  return url;
};

const cohortRevisionHostIdentity = (url: URL): string => (
  url.hostname.toLowerCase().replace(/^www\./, '')
);

export const reviseAffiliateGoldCohortRequiredPage = (input: {
  proposal: AffiliateGoldCohortProposal;
  sourceKey: string;
  fromUrl: string;
  toUrl: string;
  reason: string;
  repositoryCommit: string;
}): AffiliateGoldCohortProposal => {
  assertAffiliateGoldCohortProposalIntegrity(input.proposal);
  const sourceKey = input.sourceKey.trim();
  const reason = input.reason.trim();
  const repositoryCommit = input.repositoryCommit.trim();
  if (!sourceKey) throw new Error('Cohort revision source key is required.');
  if (!reason) throw new Error('Cohort revision reason is required.');
  if (!repositoryCommit) throw new Error('Cohort revision repository commit is required.');

  const fromUrl = validatedCohortRevisionUrl(input.fromUrl, 'Cohort revision source URL');
  const toUrl = validatedCohortRevisionUrl(input.toUrl, 'Cohort revision replacement URL');
  if (fromUrl.toString() === toUrl.toString()) {
    throw new Error('Cohort revision replacement URL must differ from the source URL.');
  }
  if (cohortRevisionHostIdentity(fromUrl) !== cohortRevisionHostIdentity(toUrl)) {
    throw new Error('Cohort revision URLs must remain on the same registrable host.');
  }

  const exampleIndex = input.proposal.examples.findIndex(
    (example) => example.sourceKey === sourceKey,
  );
  if (exampleIndex < 0) {
    throw new Error(`Cohort revision source was not found: ${sourceKey}`);
  }
  const example = input.proposal.examples[exampleIndex];
  const matchingPageIndexes = example.requiredCapturePages.flatMap((page, index) => (
    new URL(page.url).toString() === fromUrl.toString() ? [index] : []
  ));
  if (matchingPageIndexes.length !== 1) {
    throw new Error(
      `Cohort revision expected exactly one required page ${fromUrl.toString()} for ${sourceKey}; found ${matchingPageIndexes.length}.`,
    );
  }
  if (example.requiredCapturePages.some((page, index) => (
    index !== matchingPageIndexes[0]
    && new URL(page.url).toString() === toUrl.toString()
  ))) {
    throw new Error(`Cohort revision replacement page already exists for ${sourceKey}.`);
  }

  const examples = input.proposal.examples.map((candidate, index) => {
    if (index !== exampleIndex) return candidate;
    return {
      ...candidate,
      requiredCapturePages: candidate.requiredCapturePages.map((page, pageIndex) => (
        pageIndex === matchingPageIndexes[0]
          ? { ...page, url: toUrl.toString() }
          : page
      )),
      selectionReasons: [
        ...candidate.selectionReasons,
        `Cohort revision: ${reason}`,
      ],
    };
  });
  const proposalBody = affiliateGoldCohortProposalBody({
    ...input.proposal,
    repositoryCommit,
    examples,
  });
  const proposalSha256 = stableAgentArtifactSha256(proposalBody);
  const revisedProposal: AffiliateGoldCohortProposal = {
    schemaVersion: 1,
    cohortId: `affiliate-mapping-test-${proposalSha256.slice(0, 16)}`,
    ...proposalBody,
    proposalSha256,
    readyToLock: proposalBody.deficits.length === 0,
  };
  assertAffiliateGoldCohortProposalIntegrity(revisedProposal);
  return revisedProposal;
};

const TARGET_EXAMPLE_COUNT = 35;
const MINIMUM_DOMAIN_COUNT = 30;

const canonicalPublicUrl = (value: string | null | undefined): string | null => {
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

const addCapturePage = (
  pages: Map<string, { url: string; role: string }>,
  value: string | null | undefined,
  role: string,
) => {
  const url = canonicalPublicUrl(value);
  if (url && !pages.has(url)) pages.set(url, { url, role });
};

const mappingForSource = (
  input: HistoricalDatasetInput,
  source: HistoricalSourceRow,
): AffiliateScrapeMapping | null => {
  const mapping = input.mappings.find((candidate) => (
    candidate.sourceId === source.id
    && (
      candidate.id === source.activeMappingId
      || (!source.activeMappingId && candidate.isActive)
    )
  ));
  if (!mapping) return null;
  const parsed = affiliateScrapeMappingSchema.safeParse(mapping.mapping);
  return parsed.success ? parsed.data : null;
};

const dateCoverageFor = (
  mapping: AffiliateScrapeMapping | null,
  targetKind: AffiliateGoldCohortCandidate['targetKind'],
): AffiliateGoldCohortDateCoverage => {
  if (targetKind !== 'EVENT') return 'NOT_APPLICABLE';
  if (!mapping) return 'UNKNOWN';
  const manualCandidates = mapping.manualCandidates ?? [];
  const hasScheduled = Boolean(mapping.fields.startsAt)
    || manualCandidates.some((candidate) => Boolean(candidate.startsAt));
  const hasEvergreen = manualCandidates.some((candidate) => (
    candidate.dateDisplayMode === 'NO_FIXED_DATE'
    || candidate.dateDisplayMode === 'ONGOING'
  ));
  if (hasScheduled && hasEvergreen) return 'MIXED';
  if (hasScheduled) return 'SCHEDULED';
  if (hasEvergreen) return 'EVERGREEN';
  return 'UNKNOWN';
};

const requiredCapturePagesFor = (
  source: HistoricalSourceRow,
  mapping: AffiliateScrapeMapping | null,
  historicalCandidateUrls: Array<{ sourceUrl?: string | null; officialActionUrl: string }>,
  plannedPages: Array<{ url: string; role: string }>,
): Array<{ url: string; role: string }> => {
  const pages = new Map<string, { url: string; role: string }>();
  plannedPages.forEach((page) => addCapturePage(pages, page.url, page.role));
  addCapturePage(pages, source.baseUrl ?? source.organizationWebsite, 'HOME');
  addCapturePage(pages, source.listUrl, 'LISTING');
  mapping?.manualCandidates?.slice(0, 5).forEach((candidate) => {
    addCapturePage(pages, candidate.sourceUrl, 'DETAIL');
    addCapturePage(pages, candidate.officialActionUrl, 'REGISTRATION');
  });
  historicalCandidateUrls.slice(0, 5).forEach((candidate) => {
    addCapturePage(pages, candidate.sourceUrl, 'DETAIL');
    addCapturePage(pages, candidate.officialActionUrl, 'REGISTRATION');
  });
  return Array.from(pages.values()).sort((left, right) => (
    left.role.localeCompare(right.role) || left.url.localeCompare(right.url)
  ));
};

export const buildAffiliateGoldCohortCandidates = (
  input: HistoricalDatasetInput,
): AffiliateGoldCohortCandidate[] => {
  const inventory = buildAffiliateHistoricalDatasetInventory(input);
  const inventoryBySourceId = new Map(inventory.rows.map((row) => [row.sourceId, row]));
  const intakePlanBySourceId = new Map(
    planAffiliateSourceEvidenceBackfill(input.sources, input.intakes, input.mappings)
      .map((row) => [row.sourceId, row]),
  );
  return input.sources.flatMap((source): AffiliateGoldCohortCandidate[] => {
    if (!isAffiliateAgentTargetKind(source.targetKind)) return [];
    if (source.status === 'REPLACED' || source.status === 'ARCHIVED') return [];
    const row = inventoryBySourceId.get(source.id);
    if (!row || row.registrableDomain.startsWith('invalid:')) return [];
    const mapping = mappingForSource(input, source);
    const isBlocked = source.status.includes('BLOCKED') || row.evidenceLabel === 'BLOCKED';
    if (!mapping && !isBlocked) return [];
    const intakePlan = intakePlanBySourceId.get(source.id);
    if (!intakePlan) return [];
    const sourceCandidates = input.candidates.filter((candidate) => candidate.sourceId === source.id);
    return [{
      sourceId: source.id,
      sourceKey: source.sourceKey,
      sourceName: source.name,
      sourceUrl: source.listUrl,
      targetKind: source.targetKind as AffiliateGoldCohortCandidate['targetKind'],
      sourceStatus: source.status,
      registrableDomain: row.registrableDomain,
      platformFamily: row.platformFamily,
      priorEvidenceLabel: row.evidenceLabel,
      mappingId: row.mappingId,
      mappingVersion: row.mappingVersion,
      mappingMode: !mapping
        ? 'NONE'
        : mapping.manualCandidates?.length
          ? 'MANUAL_CANDIDATES'
          : 'SELECTOR',
      mappingValidated: Boolean(row.mappingValidatedAt),
      hasSetupScript: Boolean(row.setupScriptPath),
      hasReviewedCandidateHistory: sourceCandidates.some((candidate) => (
        candidate.status === 'PUBLISHED' || candidate.status === 'DISCOVERED'
      )),
      hasDetailPage: Boolean(mapping?.detailPage),
      rendersJavascript: Boolean(
        mapping?.renderJavascript || mapping?.detailPage?.renderJavascript,
      ),
      dateCoverage: dateCoverageFor(
        mapping,
        source.targetKind as AffiliateGoldCohortCandidate['targetKind'],
      ),
      intakeMatchStatus: row.intakeMatch.status,
      intakePlanAction: intakePlan.action,
      requiredCapturePages: requiredCapturePagesFor(
        source,
        mapping,
        sourceCandidates,
        intakePlan.proposedPages,
      ),
    }];
  }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
};

const deterministicOrderKey = (candidate: AffiliateGoldCohortCandidate): string => (
  createHash('sha256')
    .update(`${candidate.registrableDomain}|${candidate.sourceKey}|${candidate.sourceId}`)
    .digest('hex')
);

const qualityScore = (candidate: AffiliateGoldCohortCandidate): number => (
  Number(candidate.hasSetupScript) * 8
  + Number(candidate.hasReviewedCandidateHistory) * 6
  + Number(candidate.mappingValidated) * 4
  + Number(candidate.intakeMatchStatus === 'MATCHED') * 2
  + Number(candidate.priorEvidenceLabel === 'FAITHFUL') * 2
  + Number(candidate.hasDetailPage || candidate.rendersJavascript)
);

const stableCandidateOrder = (
  left: AffiliateGoldCohortCandidate,
  right: AffiliateGoldCohortCandidate,
): number => (
  qualityScore(right) - qualityScore(left)
  || deterministicOrderKey(left).localeCompare(deterministicOrderKey(right))
  || left.sourceKey.localeCompare(right.sourceKey)
);

const countBy = (values: string[]): Record<string, number> => (
  Object.fromEntries(Array.from(new Set(values)).sort().map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]))
);

type CoverageState = {
  club: number;
  rental: number;
  selector: number;
  manual: number;
  complex: number;
  evergreen: number;
  scheduled: number;
  blocked: number;
};

const coverageState = (
  candidates: AffiliateGoldCohortCandidate[],
): CoverageState => ({
  club: candidates.filter((candidate) => candidate.targetKind === 'CLUB').length,
  rental: candidates.filter((candidate) => candidate.targetKind === 'RENTAL').length,
  selector: candidates.filter((candidate) => candidate.mappingMode === 'SELECTOR').length,
  manual: candidates.filter(
    (candidate) => candidate.mappingMode === 'MANUAL_CANDIDATES',
  ).length,
  complex: candidates.filter(
    (candidate) => candidate.hasDetailPage || candidate.rendersJavascript,
  ).length,
  evergreen: candidates.filter(
    (candidate) => ['EVERGREEN', 'MIXED'].includes(candidate.dateCoverage),
  ).length,
  scheduled: candidates.filter(
    (candidate) => ['SCHEDULED', 'MIXED'].includes(candidate.dateCoverage),
  ).length,
  blocked: candidates.filter((candidate) => candidate.priorEvidenceLabel === 'BLOCKED').length,
});

const requiredCoverage: CoverageState = {
  club: 5,
  rental: 5,
  selector: 12,
  manual: 8,
  complex: 4,
  evergreen: 1,
  scheduled: 1,
  blocked: 1,
};

const coverageContribution = (
  candidate: AffiliateGoldCohortCandidate,
  current: CoverageState,
): number => {
  let contribution = 0;
  if (current.club < requiredCoverage.club && candidate.targetKind === 'CLUB') contribution += 12;
  if (current.rental < requiredCoverage.rental && candidate.targetKind === 'RENTAL') contribution += 12;
  if (current.selector < requiredCoverage.selector && candidate.mappingMode === 'SELECTOR') {
    contribution += 7;
  }
  if (
    current.manual < requiredCoverage.manual
    && candidate.mappingMode === 'MANUAL_CANDIDATES'
  ) {
    contribution += 7;
  }
  if (
    current.complex < requiredCoverage.complex
    && (candidate.hasDetailPage || candidate.rendersJavascript)
  ) {
    contribution += 10;
  }
  if (
    current.evergreen < requiredCoverage.evergreen
    && ['EVERGREEN', 'MIXED'].includes(candidate.dateCoverage)
  ) {
    contribution += 8;
  }
  if (
    current.scheduled < requiredCoverage.scheduled
    && ['SCHEDULED', 'MIXED'].includes(candidate.dateCoverage)
  ) {
    contribution += 8;
  }
  if (
    current.blocked < requiredCoverage.blocked
    && candidate.priorEvidenceLabel === 'BLOCKED'
  ) {
    contribution += 20;
  }
  return contribution;
};

const unmetCoverage = (coverage: CoverageState): boolean => (
  Object.entries(requiredCoverage).some(([key, required]) => (
    coverage[key as keyof CoverageState] < required
  ))
);

const reasonsFor = (
  candidate: AffiliateGoldCohortCandidate,
  scenarioIntent: AffiliateGoldCohortProposalExample['scenarioIntent'],
): string[] => {
  const reasons = [
    `Covers ${candidate.targetKind} target behavior.`,
    `Represents the historical ${candidate.mappingMode} mapping mode.`,
  ];
  if (candidate.hasSetupScript) reasons.push('Has a durable setup script for comparison.');
  if (candidate.mappingValidated) reasons.push('Has a historically validated mapping for comparison.');
  if (candidate.hasReviewedCandidateHistory) {
    reasons.push('Has candidate history that can accelerate human gold review.');
  }
  if (candidate.hasDetailPage) reasons.push('Exercises detail-page fetching.');
  if (candidate.rendersJavascript) reasons.push('Exercises JavaScript-rendered evidence.');
  if (['EVERGREEN', 'MIXED'].includes(candidate.dateCoverage)) {
    reasons.push('Covers evergreen date-display behavior.');
  }
  if (['SCHEDULED', 'MIXED'].includes(candidate.dateCoverage)) {
    reasons.push('Covers source-evidenced scheduled dates.');
  }
  if (scenarioIntent === 'BLOCKED_REFUSAL') {
    reasons.push('Requires a safe policy refusal with no executable mapping.');
  }
  if (scenarioIntent === 'INSUFFICIENT_EVIDENCE_REVIEW') {
    reasons.push('Reserved for a real incomplete-evidence fail-closed review.');
  }
  if (scenarioIntent === 'CUSTOM_EXTRACTOR_REVIEW') {
    reasons.push('Reserved for human confirmation that the bounded mapping contract is insufficient.');
  }
  return reasons;
};

export const planAffiliateGoldTestCohort = (input: {
  candidates: AffiliateGoldCohortCandidate[];
  repositoryCommit: string;
  inventorySha256?: string;
}): AffiliateGoldCohortProposal => {
  const repositoryCommit = input.repositoryCommit.trim();
  if (!repositoryCommit) throw new Error('Repository commit is required for a cohort proposal.');
  const candidates = input.candidates
    .filter((candidate) => isAffiliateAgentTargetKind(candidate.targetKind))
    .sort(stableCandidateOrder);
  const selectable = candidates;
  const selected = new Map<string, AffiliateGoldCohortCandidate>();

  while (
    selected.size < TARGET_EXAMPLE_COUNT
    && unmetCoverage(coverageState(Array.from(selected.values())))
  ) {
    const currentCoverage = coverageState(Array.from(selected.values()));
    const selectedDomains = new Set(
      Array.from(selected.values()).map((candidate) => candidate.registrableDomain),
    );
    const next = selectable
      .filter((candidate) => !selected.has(candidate.sourceId))
      .map((candidate) => ({
        candidate,
        contribution: coverageContribution(candidate, currentCoverage),
        newDomain: !selectedDomains.has(candidate.registrableDomain),
      }))
      .filter((entry) => entry.contribution > 0)
      .sort((left, right) => (
        right.contribution - left.contribution
        || Number(right.newDomain) - Number(left.newDomain)
        || stableCandidateOrder(left.candidate, right.candidate)
      ))[0]?.candidate;
    if (!next) break;
    selected.set(next.sourceId, next);
  }

  while (
    selected.size < TARGET_EXAMPLE_COUNT
    && new Set(Array.from(selected.values()).map((candidate) => candidate.registrableDomain)).size
      < MINIMUM_DOMAIN_COUNT
  ) {
    const selectedDomains = new Set(
      Array.from(selected.values()).map((candidate) => candidate.registrableDomain),
    );
    const next = selectable.find((candidate) => (
      !selected.has(candidate.sourceId)
      && !selectedDomains.has(candidate.registrableDomain)
    ));
    if (!next) break;
    selected.set(next.sourceId, next);
  }

  for (const candidate of selectable) {
    if (selected.size >= TARGET_EXAMPLE_COUNT) break;
    if (!selected.has(candidate.sourceId)) selected.set(candidate.sourceId, candidate);
  }

  const selectedCandidates = Array.from(selected.values()).sort((left, right) => (
    left.sourceKey.localeCompare(right.sourceKey)
  ));
  const customExtractorIds = new Set(
    selectedCandidates
      .filter((candidate) => (
        candidate.priorEvidenceLabel !== 'BLOCKED'
        && (candidate.hasDetailPage || candidate.rendersJavascript)
      ))
      .sort(stableCandidateOrder)
      .slice(0, 2)
      .map((candidate) => candidate.sourceId),
  );
  const insufficientIds = new Set(
    selectedCandidates
      .filter((candidate) => (
        candidate.priorEvidenceLabel !== 'BLOCKED'
        && !customExtractorIds.has(candidate.sourceId)
      ))
      .sort((left, right) => (
        Number(left.intakeMatchStatus === 'MATCHED')
          - Number(right.intakeMatchStatus === 'MATCHED')
        || Number(left.priorEvidenceLabel === 'FAITHFUL')
          - Number(right.priorEvidenceLabel === 'FAITHFUL')
        || qualityScore(left) - qualityScore(right)
        || stableCandidateOrder(left, right)
      ))
      .slice(0, Math.max(
        0,
        5 - selectedCandidates.filter(
          (candidate) => candidate.priorEvidenceLabel === 'BLOCKED',
        ).length,
      ))
      .map((candidate) => candidate.sourceId),
  );

  const examples = selectedCandidates.map((candidate): AffiliateGoldCohortProposalExample => {
    const scenarioIntent = candidate.priorEvidenceLabel === 'BLOCKED'
      ? 'BLOCKED_REFUSAL'
      : customExtractorIds.has(candidate.sourceId)
        ? 'CUSTOM_EXTRACTOR_REVIEW'
        : insufficientIds.has(candidate.sourceId)
          ? 'INSUFFICIENT_EVIDENCE_REVIEW'
          : 'EXECUTABLE_MAPPING';
    return {
      ...candidate,
      scenarioIntent,
      approvalStatus: 'UNAPPROVED',
      selectionReasons: reasonsFor(candidate, scenarioIntent),
    };
  });
  const summary = {
    exampleCount: examples.length,
    registrableDomainCount: new Set(
      examples.map((example) => example.registrableDomain),
    ).size,
    targetKinds: countBy(examples.map((example) => example.targetKind)),
    historicalMappingModes: countBy(examples.map((example) => example.mappingMode)),
    detailOrJavascriptCount: examples.filter(
      (example) => example.hasDetailPage || example.rendersJavascript,
    ).length,
    refusalOrInsufficiencyCount: examples.filter((example) => (
      example.scenarioIntent === 'BLOCKED_REFUSAL'
      || example.scenarioIntent === 'INSUFFICIENT_EVIDENCE_REVIEW'
    )).length,
    customExtractorReviewCount: examples.filter(
      (example) => example.scenarioIntent === 'CUSTOM_EXTRACTOR_REVIEW',
    ).length,
    evergreenCount: examples.filter(
      (example) => ['EVERGREEN', 'MIXED'].includes(example.dateCoverage),
    ).length,
    scheduledCount: examples.filter(
      (example) => ['SCHEDULED', 'MIXED'].includes(example.dateCoverage),
    ).length,
    priorEvidenceLabels: countBy(examples.map((example) => example.priorEvidenceLabel)),
    databaseWrites: 0 as const,
    publicRequests: 0 as const,
  };
  const deficits: string[] = [];
  const requireCount = (label: string, actual: number, required: number) => {
    if (actual < required) deficits.push(`${label}: required ${required}, found ${actual}.`);
  };
  requireCount('test examples', summary.exampleCount, TARGET_EXAMPLE_COUNT);
  requireCount('registrable domains', summary.registrableDomainCount, MINIMUM_DOMAIN_COUNT);
  requireCount('CLUB examples', summary.targetKinds.CLUB ?? 0, 5);
  requireCount('RENTAL examples', summary.targetKinds.RENTAL ?? 0, 5);
  requireCount('selector mappings', summary.historicalMappingModes.SELECTOR ?? 0, 12);
  requireCount(
    'manual-candidate mappings',
    summary.historicalMappingModes.MANUAL_CANDIDATES ?? 0,
    8,
  );
  requireCount('detail-page or JavaScript cases', summary.detailOrJavascriptCount, 4);
  requireCount('blocked or insufficient-evidence cases', summary.refusalOrInsufficiencyCount, 5);
  requireCount('custom-extractor review cases', summary.customExtractorReviewCount, 2);
  requireCount('evergreen cases', summary.evergreenCount, 1);
  requireCount('scheduled cases', summary.scheduledCount, 1);

  const lockedDomainAssignments = Array.from(new Set(
    examples.map((example) => example.registrableDomain),
  )).sort().map((registrableDomain) => ({
    registrableDomain,
    split: 'test' as const,
  }));
  const lockedPlatformFamilies = Array.from(new Set(
    examples
      .map((example) => example.platformFamily)
      .filter((family): family is string => Boolean(family)),
  )).sort();
  const inventorySha256 = input.inventorySha256
    ?? stableAgentArtifactSha256(candidates);
  const proposalBody = affiliateGoldCohortProposalBody({
    repositoryCommit,
    inventorySha256,
    examples,
    reservedForLater: [],
    lockedDomainAssignments,
    lockedPlatformFamilies,
    summary,
    deficits,
  });
  const proposalSha256 = stableAgentArtifactSha256(proposalBody);
  return {
    schemaVersion: 1,
    cohortId: `affiliate-mapping-test-${proposalSha256.slice(0, 16)}`,
    ...proposalBody,
    proposalSha256,
    readyToLock: deficits.length === 0,
  };
};
