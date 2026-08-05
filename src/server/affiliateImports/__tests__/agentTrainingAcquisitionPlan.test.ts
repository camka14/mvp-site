/** @jest-environment node */

import {
  buildAffiliateTrainingAcquisitionPlan,
  assertAffiliateTrainingAcquisitionPlan,
  resolveApprovedAffiliateTrainingRecoverySelection,
} from '../agentTrainingAcquisitionPlan';
import {
  buildAffiliateEvidenceCapturePlan,
} from '../agentEvidenceCapturePlan';
import {
  buildAffiliateMappingGoldRelease,
} from '../agentGoldDataset';
import {
  planAffiliateGoldTestCohort,
  type AffiliateGoldCohortCandidate,
} from '../agentGoldCohort';
import { stableAgentArtifactSha256 } from '../agentContracts';

const HASH = 'a'.repeat(64);

const candidate = (
  sourceKey: string,
  registrableDomain: string,
  overrides: Partial<AffiliateGoldCohortCandidate> = {},
): AffiliateGoldCohortCandidate => ({
  sourceId: `source-${sourceKey}`,
  sourceKey,
  sourceName: sourceKey,
  sourceUrl: `https://${registrableDomain}/programs`,
  targetKind: 'EVENT',
  sourceStatus: 'ACTIVE',
  registrableDomain,
  platformFamily: null,
  priorEvidenceLabel: 'LEGACY_PARTIAL',
  mappingId: `mapping-${sourceKey}`,
  mappingVersion: 1,
  mappingMode: 'MANUAL_CANDIDATES',
  mappingValidated: true,
  hasSetupScript: true,
  hasReviewedCandidateHistory: true,
  hasDetailPage: false,
  rendersJavascript: false,
  dateCoverage: 'EVERGREEN',
  intakeMatchStatus: 'MATCHED',
  intakePlanAction: 'USE_EXISTING_INTAKE',
  requiredCapturePages: [{
    url: `https://${registrableDomain}/programs`,
    role: 'LISTING',
  }],
  ...overrides,
});

const heldOutProposal = () => planAffiliateGoldTestCohort({
  candidates: Array.from({ length: 45 }, (_, index) => candidate(
    `held-${index}`,
    `held-${index}.example`,
    {
      targetKind: index < 7 ? 'CLUB' : index < 14 ? 'RENTAL' : 'EVENT',
      mappingMode: index % 2 ? 'MANUAL_CANDIDATES' : 'SELECTOR',
      hasDetailPage: index % 5 === 0,
      priorEvidenceLabel: index === 44 ? 'BLOCKED' : 'LEGACY_PARTIAL',
      dateCoverage: index % 3 === 0 ? 'EVERGREEN' : 'SCHEDULED',
    },
  )),
  repositoryCommit: 'held-commit',
});

const goldExample = (input: {
  exampleId: string;
  sourceKey: string;
  registrableDomain: string;
  split: 'train' | 'validation';
  targetKind: 'EVENT' | 'CLUB' | 'RENTAL';
}) => {
  const listUrl = `https://${input.registrableDomain}/programs`;
  const actionUrl = `https://${input.registrableDomain}/register`;
  const expectedCandidate = {
    listingKind: input.targetKind,
    title: `${input.sourceKey} program`,
    officialActionUrl: actionUrl,
    sourceUrl: listUrl,
    sportName: 'Grass Soccer',
    tags: [],
    venueName: null,
    address: null,
    city: null,
    startsAt: null,
    endsAt: null,
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Ongoing',
    priceText: null,
    divisions: [],
  };
  return {
    schemaVersion: 1,
    exampleId: input.exampleId,
    split: input.split,
    registrableDomain: input.registrableDomain,
    platformFamily: null,
    target: {
      type: 'LISTING_KIND',
      listingKind: input.targetKind,
    },
    evidenceOrigin: 'REAL_CAPTURE',
    evidenceOriginDetails: {
      origin: 'REAL_CAPTURE',
      withheldEvidence: [],
    },
    includedInTraining: input.split === 'train',
    includedInRetrieval: true,
    context: {
      jobId: `job-${input.sourceKey}`,
      intakeId: `intake-${input.sourceKey}`,
      sourceKey: input.sourceKey,
      runId: `run-${input.sourceKey}`,
      policyDisposition: 'ALLOWED',
      targetKindHints: [input.targetKind],
      artifacts: [{
        kind: 'PAGE_HTML',
        sha256: HASH,
        pageUrl: listUrl,
      }],
      instructionsRevision: 'affiliate-source-mapping-contract-v1',
    },
    approvedDraft: {
      schemaVersion: 1,
      intakeId: `intake-${input.sourceKey}`,
      sourceKey: input.sourceKey,
      runId: `run-${input.sourceKey}`,
      policyDisposition: 'ALLOWED',
      implementationMode: 'MANUAL_CANDIDATES',
      listingKind: input.targetKind,
      evidence: [{
        artifactKind: 'PAGE_HTML',
        artifactSha256: HASH,
        pageUrl: listUrl,
        supports: ['title', 'officialActionUrl'],
      }],
      organization: {
        name: input.sourceKey,
        website: `https://${input.registrableDomain}`,
        description: null,
        city: null,
        address: null,
      },
      mapping: {
        kind: input.targetKind,
        listUrl,
        itemSelector: 'body',
        fields: {
          title: {
            selector: 'body',
          },
          officialActionUrl: {
            selector: 'body',
            mode: 'literal',
            value: actionUrl,
          },
        },
        manualCandidates: [{
          title: expectedCandidate.title,
          officialActionUrl: actionUrl,
          sourceUrl: listUrl,
          sportName: expectedCandidate.sportName,
          dateDisplayMode: 'ONGOING',
          dateDisplayText: 'Ongoing',
        }],
      },
      expectedCandidates: [expectedCandidate],
      logo: {
        disposition: 'MISSING',
        artifactSha256: null,
        sourceUrl: null,
      },
      warnings: [],
      unresolvedQuestions: [],
    },
    expectedPersistedCandidates: [expectedCandidate],
    fixturePages: [{
      url: listUrl,
      finalUrl: listUrl,
      statusCode: 200,
      file: 'fixtures/programs.html',
      byteLength: 100,
      sha256: HASH,
    }],
    humanApproval: {
      approvalId: `approval-${input.sourceKey}`,
      approvedByUserId: 'admin-1',
      approvedAt: '2026-07-30T20:00:00.000Z',
    },
  };
};

describe('affiliate training acquisition plan', () => {
  it('plans only missing sources and prioritizes rentals while holding policy failures', () => {
    const capturePlan = buildAffiliateEvidenceCapturePlan({
      candidates: [
        candidate('existing-train', 'existing-train.example'),
        candidate('existing-validation', 'existing-validation.example', {
          targetKind: 'CLUB',
        }),
        candidate('recovery-rental', 'recovery-rental.example', {
          targetKind: 'RENTAL',
          mappingMode: 'SELECTOR',
        }),
        candidate('policy-selector', 'policy-selector.example', {
          mappingMode: 'SELECTOR',
        }),
      ],
      heldOutProposal: heldOutProposal(),
      repositoryCommit: 'capture-commit',
      inventorySha256: 'inventory-hash',
    });
    const goldRelease = buildAffiliateMappingGoldRelease([
      goldExample({
        exampleId: `${capturePlan.capturePlanId}-existing-train`,
        sourceKey: 'existing-train',
        registrableDomain: 'existing-train.example',
        split: 'train',
        targetKind: 'EVENT',
      }),
      goldExample({
        exampleId: `${capturePlan.capturePlanId}-existing-validation`,
        sourceKey: 'existing-validation',
        registrableDomain: 'existing-validation.example',
        split: 'validation',
        targetKind: 'CLUB',
      }),
    ], {
      releaseId: 'gold-v1',
      createdAt: new Date('2026-07-30T21:00:00.000Z'),
      repositoryCommit: 'gold-commit',
    });
    const plan = buildAffiliateTrainingAcquisitionPlan({
      capturePlan,
      captureAudit: {
        cohortId: capturePlan.capturePlanId,
        sources: [
          {
            sourceKey: 'recovery-rental',
            status: 'REVIEW_REQUIRED',
            batches: [{
              prepareAttempts: [{ queueStatus: 'EVIDENCE_MISSING' }],
            }],
          },
          {
            sourceKey: 'policy-selector',
            status: 'REVIEW_REQUIRED',
            batches: [{
              prepareAttempts: [{ queueStatus: 'ROBOTS_REVIEW_REQUIRED' }],
            }],
          },
        ],
      },
      goldRelease,
      sourceGoldReleaseSha256: stableAgentArtifactSha256(goldRelease),
      repositoryCommit: 'current-commit',
    });

    expect(plan.recoveryCandidates).toHaveLength(2);
    expect(plan.recoveryCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKey: 'recovery-rental',
        action: 'CAPTURE_MISSING_EVIDENCE',
        priority: 'P0',
      }),
      expect.objectContaining({
        sourceKey: 'policy-selector',
        action: 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE',
        assignedSplit: null,
        priority: 'P3',
      }),
    ]));
    expect(plan.recoverySummary).toEqual(expect.objectContaining({
      actionableCount: 1,
      policyOrTlsHoldCount: 1,
    }));
    expect(plan.frozenDomainAssignments).toEqual([
      { registrableDomain: 'existing-train.example', split: 'train' },
      { registrableDomain: 'existing-validation.example', split: 'validation' },
    ]);
    expect(plan.readyForTraining).toBe(false);

    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.recoveryCandidates[0].sourceKey = 'changed';
    expect(() => assertAffiliateTrainingAcquisitionPlan(tampered))
      .toThrow('hash does not match');

    const selection = resolveApprovedAffiliateTrainingRecoverySelection(plan, {
      schemaVersion: 1,
      acquisitionPlanId: plan.acquisitionPlanId,
      planSha256: plan.planSha256,
      repositoryCommit: plan.repositoryCommit,
      approvedByUserId: 'admin-1',
      approvedAt: '2026-07-30T22:00:00.000Z',
    });
    expect(selection.recoveryCandidates.map((row) => row.sourceKey))
      .toEqual(['recovery-rental']);
    expect(selection.sourceCapturePlanId).toBe(capturePlan.capturePlanId);

    expect(() => resolveApprovedAffiliateTrainingRecoverySelection(plan, {
      schemaVersion: 1,
      acquisitionPlanId: plan.acquisitionPlanId,
      planSha256: 'wrong',
      repositoryCommit: plan.repositoryCommit,
      approvedByUserId: 'admin-1',
      approvedAt: '2026-07-30T22:00:00.000Z',
    })).toThrow('approval does not match');
  });
});
