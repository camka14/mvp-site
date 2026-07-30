import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateMappingGoldExampleSchema,
  type AffiliateMappingGoldExample,
} from './agentGoldDataset';
import type { AffiliateMappingJobContext } from './agentModelClient';
import { AffiliateAgentReviewFixtureClient } from './agentReviewFixtureClient';
import { extractAffiliateCandidatesFromPage } from './mappingExtractor';
import {
  buildAffiliateEventTagNames,
  candidateImportRejectionReasons,
  enrichAffiliateCandidatesWithDetailPages,
} from './service';
import {
  isAffiliateAgentTargetKind,
  type AffiliateAgentTargetKind,
  type AffiliateCandidateAssertion,
  type AffiliateSourceDraft,
} from './agentContracts';
import type {
  AffiliateCandidateInput,
  AffiliateDateDisplayMode,
  AffiliateScrapeMapping,
} from './types';

export type AffiliateGoldScenarioIntent =
  | 'EXECUTABLE_MAPPING'
  | 'BLOCKED_REFUSAL'
  | 'INSUFFICIENT_EVIDENCE_REVIEW'
  | 'CUSTOM_EXTRACTOR_REVIEW';

export type AffiliateGoldFixturePage = {
  url: string;
  finalUrl: string;
  statusCode: number;
  file: string;
  byteLength: number;
  sha256: string;
  fetchedAt?: string;
};

export type AffiliateGoldMaterializationInput = {
  cohortId: string;
  proposalSourceKey: string;
  registrableDomain: string;
  platformFamily: string | null;
  split: 'train' | 'validation' | 'test';
  targetKind: AffiliateAgentTargetKind;
  scenarioIntent: AffiliateGoldScenarioIntent;
  context: AffiliateMappingJobContext;
  mapping: AffiliateScrapeMapping | null;
  fixtureDirectory: string;
  fixturePages: AffiliateGoldFixturePage[];
  organization: {
    name: string | null;
    website: string | null;
    description: string | null;
    city: string | null;
    address: string | null;
  };
  approval: {
    approvedByUserId: string;
    approvedAt: string;
    proposalSha256: string;
  };
};

export type AffiliateGoldMaterializationResult = {
  example: AffiliateMappingGoldExample;
  intendedScenario: AffiliateGoldScenarioIntent;
  outcome: AffiliateSourceDraft['implementationMode'];
  extractedCandidateCount: number;
  importableCandidateCount: number;
  evidenceSupportedCandidateCount: number;
  warnings: string[];
};

const nullableText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizedDate = (value: unknown): string | null => {
  const text = nullableText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.map(nullableText).filter((value): value is string => Boolean(value))))
);

const rawExtractedFields = (candidate: AffiliateCandidateInput): Record<string, unknown> => {
  const payload = candidate.rawPayload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const extracted = payload.extractedFields;
  return extracted && typeof extracted === 'object' && !Array.isArray(extracted)
    ? extracted as Record<string, unknown>
    : {};
};

const candidateDivisions = (candidate: AffiliateCandidateInput): string[] => {
  const extracted = rawExtractedFields(candidate);
  const structured = Array.isArray(extracted.divisions)
    ? extracted.divisions.flatMap((division) => {
        if (typeof division === 'string') return [division];
        if (!division || typeof division !== 'object' || Array.isArray(division)) return [];
        return [nullableText((division as Record<string, unknown>).name)];
      })
    : [];
  const divisionText = nullableText(candidate.divisionText)
    ?.split(/[|;,]/)
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  return uniqueStrings([...structured, ...divisionText]);
};

const normalizedDisplayMode = (
  candidate: AffiliateCandidateInput,
  startsAt: string | null,
): AffiliateDateDisplayMode => {
  const value = nullableText(candidate.dateDisplayMode)?.toUpperCase();
  if (value === 'NO_FIXED_DATE' || value === 'ONGOING') return value;
  return startsAt ? 'SCHEDULED' : 'ONGOING';
};

export const affiliateCandidateAssertionFromInput = (
  candidate: AffiliateCandidateInput,
): AffiliateCandidateAssertion => {
  if (!isAffiliateAgentTargetKind(candidate.listingKind)) {
    throw new Error(`Unsupported affiliate-agent candidate kind: ${candidate.listingKind}`);
  }
  const startsAt = normalizedDate(candidate.startsAt);
  const endsAt = normalizedDate(candidate.endsAt);
  const dateDisplayMode = normalizedDisplayMode(candidate, startsAt);
  const dateDisplayText = nullableText(candidate.dateDisplayText)
    ?? nullableText(candidate.scheduleText)
    ?? (dateDisplayMode === 'SCHEDULED' ? null : 'No fixed start date');
  const tags = candidate.listingKind === 'EVENT'
    ? uniqueStrings([...(candidate.tags ?? []), ...buildAffiliateEventTagNames(candidate)])
    : uniqueStrings(candidate.tags ?? []);

  return {
    listingKind: candidate.listingKind,
    title: candidate.title.trim(),
    officialActionUrl: candidate.officialActionUrl,
    sourceUrl: nullableText(candidate.sourceUrl),
    sportName: nullableText(candidate.sportName),
    tags,
    venueName: nullableText(candidate.venueName),
    address: nullableText(candidate.address),
    city: nullableText(candidate.city),
    startsAt,
    endsAt,
    dateDisplayMode,
    dateDisplayText,
    priceText: nullableText(candidate.priceText),
    divisions: candidateDivisions(candidate),
  };
};

const normalizedEvidenceText = (value: string): string => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/&amp;/g, '&')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const evidenceTokens = (value: string): string[] => normalizedEvidenceText(value)
  .split(' ')
  .filter((token) => token.length >= 3)
  .filter((token) => ![
    'and', 'the', 'with', 'for', 'from', 'current', 'program', 'programs',
  ].includes(token));

const canonicalUrlKey = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
};

const urlMatchesFixture = (
  value: string | null | undefined,
  page: AffiliateGoldFixturePage,
): boolean => {
  const text = nullableText(value);
  if (!text) return false;
  try {
    const key = canonicalUrlKey(text);
    return key === canonicalUrlKey(page.url) || key === canonicalUrlKey(page.finalUrl);
  } catch {
    return false;
  }
};

type LoadedFixturePage = AffiliateGoldFixturePage & {
  body: string;
  normalizedBody: string;
};

const loadFixturePages = async (
  directory: string,
  pages: AffiliateGoldFixturePage[],
): Promise<LoadedFixturePage[]> => Promise.all(pages.map(async (page) => {
  const fixtureRoot = path.resolve(directory);
  const fixturePath = path.resolve(fixtureRoot, page.file);
  if (!fixturePath.startsWith(`${fixtureRoot}${path.sep}`)) {
    throw new Error(`Fixture path escapes materialization directory: ${page.file}`);
  }
  const body = await fs.readFile(fixturePath, 'utf8');
  return {
    ...page,
    body,
    normalizedBody: normalizedEvidenceText(body),
  };
}));

const candidateHasCapturedSupport = (
  candidate: AffiliateCandidateInput,
  pages: LoadedFixturePage[],
): boolean => {
  const sourcePages = pages.filter((page) => (
    urlMatchesFixture(candidate.sourceUrl, page)
    || urlMatchesFixture(candidate.officialActionUrl, page)
  ));
  if (!sourcePages.length) return false;

  const titleTokens = evidenceTokens(candidate.title);
  if (!titleTokens.length) return false;
  const matchedTitleTokens = titleTokens.filter((token) => (
    sourcePages.some((page) => page.normalizedBody.includes(token))
  ));
  if (matchedTitleTokens.length / titleTokens.length < 0.5) return false;

  const startsAt = normalizedDate(candidate.startsAt);
  if (!startsAt) return true;
  const dateDisplayTokens = evidenceTokens(nullableText(candidate.dateDisplayText) ?? '');
  if (dateDisplayTokens.length) {
    const matchedDateTokens = dateDisplayTokens.filter((token) => (
      sourcePages.some((page) => page.normalizedBody.includes(token))
    ));
    if (matchedDateTokens.length / dateDisplayTokens.length >= 0.5) return true;
  }
  const date = new Date(startsAt);
  const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  return sourcePages.some((page) => (
    page.normalizedBody.includes(month)
    && page.normalizedBody.includes(String(date.getUTCDate()))
    && page.normalizedBody.includes(String(date.getUTCFullYear()))
  ));
};

const candidateIdentity = (candidate: AffiliateCandidateAssertion): string => [
  candidate.listingKind,
  candidate.officialActionUrl,
  candidate.title.toLowerCase(),
  candidate.startsAt ?? '',
].join('|');

const candidateContainsForbiddenTrainingData = (
  candidate: AffiliateCandidateInput,
): boolean => {
  const serialized = JSON.stringify(candidate);
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized)
    || /\b(?:sk-|AKIA)[A-Za-z0-9_-]{12,}/.test(serialized)
    || /[?&](?:x-amz-[^=]*|sig|signature|token|api[_-]?key|access[_-]?key|auth)=[^&\s"]+/i.test(
      serialized,
    )
  );
};

const evidenceForDraft = (
  context: AffiliateMappingJobContext,
  fixturePages: AffiliateGoldFixturePage[],
  expectedCandidates: AffiliateCandidateAssertion[],
  implementationMode: AffiliateSourceDraft['implementationMode'],
  mapping: AffiliateScrapeMapping | null,
): AffiliateSourceDraft['evidence'] => {
  const fixtureByHash = new Map(fixturePages.map((page) => [page.sha256, page]));
  if (
    implementationMode === 'BLOCKED'
    || implementationMode === 'INSUFFICIENT_EVIDENCE'
    || implementationMode === 'CUSTOM_EXTRACTOR_REQUIRED'
  ) {
    const artifact = context.artifacts[0];
    return artifact ? [{
      artifactKind: artifact.kind,
      artifactSha256: artifact.sha256,
      pageUrl: artifact.pageUrl,
      supports: ['policyDisposition', 'implementationMode'],
    }] : [];
  }

  return context.artifacts
    .filter((artifact) => fixtureByHash.has(artifact.sha256))
    .map((artifact) => {
      const page = fixtureByHash.get(artifact.sha256)!;
      const supports = ['mapping', 'organization'];
      expectedCandidates.forEach((candidate, index) => {
        if (
          urlMatchesFixture(candidate.sourceUrl, page)
          || urlMatchesFixture(candidate.officialActionUrl, page)
        ) {
          supports.push(
            `expectedCandidates.${index}.title`,
            `expectedCandidates.${index}.officialActionUrl`,
          );
          if (candidate.startsAt) supports.push(`expectedCandidates.${index}.startsAt`);
        }
      });
      mapping?.manualCandidates?.forEach((candidate, index) => {
        if (
          candidate.startsAt
          && (
            urlMatchesFixture(candidate.sourceUrl, page)
            || urlMatchesFixture(candidate.officialActionUrl, page)
          )
        ) {
          supports.push(`mapping.manualCandidates.${index}.startsAt`);
        }
      });
      return {
        artifactKind: artifact.kind,
        artifactSha256: artifact.sha256,
        pageUrl: artifact.pageUrl,
        supports: uniqueStrings(supports),
      };
    });
};

const refusalModeFor = (
  intent: AffiliateGoldScenarioIntent,
  policyDisposition: AffiliateMappingJobContext['policyDisposition'],
): AffiliateSourceDraft['implementationMode'] | null => {
  if (policyDisposition === 'BLOCKED' || intent === 'BLOCKED_REFUSAL') return 'BLOCKED';
  if (policyDisposition !== 'ALLOWED') return 'INSUFFICIENT_EVIDENCE';
  if (intent === 'INSUFFICIENT_EVIDENCE_REVIEW') return 'INSUFFICIENT_EVIDENCE';
  if (intent === 'CUSTOM_EXTRACTOR_REVIEW') return 'CUSTOM_EXTRACTOR_REQUIRED';
  return null;
};

const draftFor = (input: {
  materialization: AffiliateGoldMaterializationInput;
  implementationMode: AffiliateSourceDraft['implementationMode'];
  mapping: AffiliateScrapeMapping | null;
  expectedCandidates: AffiliateCandidateAssertion[];
  warnings: string[];
}): AffiliateSourceDraft => {
  const { materialization, implementationMode, mapping, expectedCandidates, warnings } = input;
  const executable = implementationMode === 'GENERIC_MAPPING'
    || implementationMode === 'MANUAL_CANDIDATES';
  return {
    schemaVersion: 1,
    intakeId: materialization.context.intakeId,
    sourceKey: materialization.context.sourceKey,
    runId: materialization.context.runId,
    policyDisposition: implementationMode === 'BLOCKED'
      ? 'BLOCKED'
      : materialization.context.policyDisposition,
    implementationMode,
    listingKind: executable ? materialization.targetKind : null,
    evidence: evidenceForDraft(
      materialization.context,
      materialization.fixturePages,
      expectedCandidates,
      implementationMode,
      mapping,
    ),
    organization: materialization.organization,
    mapping: executable ? mapping : null,
    expectedCandidates: executable ? expectedCandidates : [],
    logo: {
      disposition: 'MANUAL_REVIEW',
      artifactSha256: null,
      sourceUrl: null,
    },
    warnings,
    unresolvedQuestions: executable
      ? []
      : ['Human review is required before this source can produce persisted candidates.'],
  };
};

export const materializeAffiliateMappingGoldExample = async (
  input: AffiliateGoldMaterializationInput,
): Promise<AffiliateGoldMaterializationResult> => {
  const warnings: string[] = [];
  let extractedCandidateCount = 0;
  let importableCandidateCount = 0;
  let evidenceSupportedCandidateCount = 0;
  let expectedCandidates: AffiliateCandidateAssertion[] = [];
  let approvedMapping = input.mapping;
  let implementationMode = refusalModeFor(
    input.scenarioIntent,
    input.context.policyDisposition,
  );

  if (!implementationMode) {
    if (
      !input.mapping
      || input.mapping.kind !== input.targetKind
      || !isAffiliateAgentTargetKind(input.mapping.kind)
    ) {
      implementationMode = 'INSUFFICIENT_EVIDENCE';
      warnings.push('The locked mapping is missing or does not match the supported target kind.');
    } else {
      try {
        const client = new AffiliateAgentReviewFixtureClient(input.fixtureDirectory);
        const listPage = await client.fetchPage({
          url: input.mapping.listUrl,
          renderJavascript: input.mapping.renderJavascript,
          waitMs: input.mapping.waitMs,
        });
        const extracted = extractAffiliateCandidatesFromPage(listPage, input.mapping);
        const enriched = await enrichAffiliateCandidatesWithDetailPages(
          extracted,
          input.mapping,
          client,
        );
        extractedCandidateCount = enriched.length;
        const currentCandidates = enriched.filter((candidate) => (
          candidate.listingKind === input.targetKind
          && isAffiliateAgentTargetKind(candidate.listingKind)
          && candidateImportRejectionReasons(candidate, new Date(input.approval.approvedAt)).length === 0
        ));
        const importable = currentCandidates.filter((candidate) => (
          !candidateContainsForbiddenTrainingData(candidate)
        ));
        const unsafeCandidateCount = currentCandidates.length - importable.length;
        if (unsafeCandidateCount > 0) {
          warnings.push(
            `Excluded ${unsafeCandidateCount} candidate(s) containing private or credentialed data.`,
          );
        }
        importableCandidateCount = importable.length;
        const loadedFixtures = await loadFixturePages(input.fixtureDirectory, input.fixturePages);
        let supported = importable.filter((candidate) => (
          candidateHasCapturedSupport(candidate, loadedFixtures)
        ));
        if (input.targetKind === 'CLUB' && supported.length > 1) {
          supported = supported.slice(0, 1);
          warnings.push('CLUB materialization retained one organization identity and excluded program-like rows.');
        }
        if (input.mapping.manualCandidates?.length) {
          const supportedSourceIndexes = new Set(supported.flatMap((candidate) => {
            const sourceIndex = candidate.rawPayload?.sourceIndex;
            return typeof sourceIndex === 'number' && Number.isInteger(sourceIndex)
              ? [sourceIndex]
              : [];
          }));
          const supportedManualCandidates = input.mapping.manualCandidates.filter(
            (_candidate, index) => supportedSourceIndexes.has(index),
          );
          approvedMapping = {
            ...input.mapping,
            manualCandidates: supportedManualCandidates,
          };
          const removedCount = input.mapping.manualCandidates.length
            - supportedManualCandidates.length;
          if (removedCount > 0) {
            warnings.push(
              `Pruned ${removedCount} stale or unsupported manual candidate(s) from the approved mapping.`,
            );
          }
        }
        evidenceSupportedCandidateCount = supported.length;
        expectedCandidates = Array.from(new Map(
          supported.map(affiliateCandidateAssertionFromInput)
            .map((candidate) => [candidateIdentity(candidate), candidate]),
        ).values());
        if (!expectedCandidates.length) {
          implementationMode = 'INSUFFICIENT_EVIDENCE';
          warnings.push(
            'The exact captured fixtures produced no current, importable, evidence-supported candidate.',
          );
        } else {
          implementationMode = approvedMapping?.manualCandidates?.length
            ? 'MANUAL_CANDIDATES'
            : 'GENERIC_MAPPING';
        }
      } catch (error) {
        implementationMode = 'INSUFFICIENT_EVIDENCE';
        warnings.push(
          `Exact fixture execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const approvedDraft = draftFor({
    materialization: input,
    implementationMode,
    mapping: approvedMapping,
    expectedCandidates,
    warnings,
  });
  const isExecutable = implementationMode === 'GENERIC_MAPPING'
    || implementationMode === 'MANUAL_CANDIDATES';
  const target = isExecutable
    ? {
        type: 'LISTING_KIND' as const,
        listingKind: input.targetKind,
      }
    : {
        type: 'REFUSAL' as const,
        refusalClass: implementationMode as (
          'BLOCKED' | 'INSUFFICIENT_EVIDENCE' | 'CUSTOM_EXTRACTOR_REQUIRED'
        ),
      };
  const example = affiliateMappingGoldExampleSchema.parse({
    schemaVersion: 1,
    exampleId: `${input.cohortId}-${input.proposalSourceKey}`,
    split: input.split,
    registrableDomain: input.registrableDomain,
    platformFamily: input.platformFamily,
    target,
    evidenceOrigin: 'REAL_CAPTURE',
    evidenceOriginDetails: {
      origin: 'REAL_CAPTURE',
      withheldEvidence: [],
    },
    includedInTraining: input.split === 'train',
    includedInRetrieval: input.split !== 'test',
    context: input.context,
    approvedDraft,
    expectedPersistedCandidates: isExecutable ? expectedCandidates : [],
    fixturePages: input.fixturePages,
    humanApproval: {
      approvalId: `${input.cohortId}:${input.proposalSourceKey}:${input.approval.proposalSha256}`,
      approvedByUserId: input.approval.approvedByUserId,
      approvedAt: input.approval.approvedAt,
    },
  });

  return {
    example,
    intendedScenario: input.scenarioIntent,
    outcome: implementationMode,
    extractedCandidateCount,
    importableCandidateCount,
    evidenceSupportedCandidateCount,
    warnings,
  };
};
