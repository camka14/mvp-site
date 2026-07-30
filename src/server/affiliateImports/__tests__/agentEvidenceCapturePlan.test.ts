/** @jest-environment node */

import {
  assertAffiliateEvidenceCapturePlan,
  buildAffiliateEvidenceCapturePlan,
  resolveAffiliateEvidenceCaptureSelection,
  type AffiliateEvidenceCaptureApproval,
} from '../agentEvidenceCapturePlan';
import {
  planAffiliateGoldTestCohort,
  type AffiliateGoldCohortCandidate,
} from '../agentGoldCohort';

const candidate = (
  sourceKey: string,
  registrableDomain: string,
  overrides: Partial<AffiliateGoldCohortCandidate> = {},
): AffiliateGoldCohortCandidate => ({
  sourceId: `source-${sourceKey}`,
  sourceKey,
  sourceName: sourceKey,
  sourceUrl: `https://${registrableDomain}/events`,
  targetKind: 'EVENT',
  sourceStatus: 'ACTIVE',
  registrableDomain,
  platformFamily: null,
  priorEvidenceLabel: 'LEGACY_PARTIAL',
  mappingId: `mapping-${sourceKey}`,
  mappingVersion: 1,
  mappingMode: 'SELECTOR',
  mappingValidated: true,
  hasSetupScript: true,
  hasReviewedCandidateHistory: true,
  hasDetailPage: false,
  rendersJavascript: false,
  dateCoverage: 'SCHEDULED',
  intakeMatchStatus: 'MATCHED',
  intakePlanAction: 'USE_EXISTING_INTAKE',
  requiredCapturePages: [{
    url: `https://${registrableDomain}/events`,
    role: 'LISTING',
  }],
  ...overrides,
});

const heldOutProposal = () => planAffiliateGoldTestCohort({
  candidates: Array.from({ length: 45 }, (_, index) => candidate(
    `test-${index}`,
    `test-${index}.example`,
    {
      targetKind: index === 0 || index === 1
        ? 'TEAM'
        : index < 8
          ? 'CLUB'
          : index < 15
            ? 'RENTAL'
            : 'EVENT',
      mappingMode: index % 2 ? 'MANUAL_CANDIDATES' : 'SELECTOR',
      hasDetailPage: index % 5 === 0,
      platformFamily: index === 2 ? 'BLUESOMBRERO' : null,
      priorEvidenceLabel: index === 44 ? 'BLOCKED' : 'LEGACY_PARTIAL',
      dateCoverage: index % 3 === 0 ? 'EVERGREEN' : 'SCHEDULED',
    },
  )),
  repositoryCommit: 'test-commit',
});

describe('affiliate evidence capture plan', () => {
  it('excludes held-out domains and platform families without weakening deficits', () => {
    const heldOut = heldOutProposal();
    const plan = buildAffiliateEvidenceCapturePlan({
      candidates: [
        candidate('held-domain', heldOut.lockedDomainAssignments[0].registrableDomain),
        candidate('held-platform', 'other.example', {
          platformFamily: 'BLUESOMBRERO',
        }),
        candidate('held-evidence-domain', 'safe-primary.example', {
          requiredCapturePages: [{
            url: `https://${heldOut.lockedDomainAssignments[1].registrableDomain}/register`,
            role: 'REGISTRATION',
          }],
        }),
        candidate('held-evidence-platform', 'safe-platform-primary.example', {
          requiredCapturePages: [{
            url: 'https://other.bluesombrero.com/register',
            role: 'REGISTRATION',
          }],
        }),
        candidate('safe-team', 'safe-team.example', { targetKind: 'TEAM' }),
        candidate('safe-rental', 'safe-rental.example', { targetKind: 'RENTAL' }),
      ],
      heldOutProposal: heldOut,
      repositoryCommit: 'capture-commit',
      inventorySha256: 'inventory-hash',
    });

    expect(plan.examples.map((example) => example.sourceKey)).toEqual([
      'safe-rental',
      'safe-team',
    ]);
    expect(plan.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKey: 'held-domain', reason: 'HELD_OUT_DOMAIN' }),
      expect.objectContaining({ sourceKey: 'held-platform', reason: 'HELD_OUT_PLATFORM_FAMILY' }),
      expect.objectContaining({
        sourceKey: 'held-evidence-domain',
        reason: 'HELD_OUT_EVIDENCE_DOMAIN',
      }),
      expect.objectContaining({
        sourceKey: 'held-evidence-platform',
        reason: 'HELD_OUT_EVIDENCE_PLATFORM_FAMILY',
      }),
    ]));
    expect(plan.readyToCapture).toBe(true);
    expect(plan.readyForMinimumCorpus).toBe(false);
    expect(plan.deficits).toEqual(expect.arrayContaining([
      expect.stringContaining('real executable examples: required 95'),
      expect.stringContaining('TEAM examples across train and validation: required 2'),
      expect.stringContaining('RENTAL examples across train and validation: required 11'),
    ]));
  });

  it('detects plan tampering and resolves an approved training selection', () => {
    const plan = buildAffiliateEvidenceCapturePlan({
      candidates: [candidate('safe', 'safe.example')],
      heldOutProposal: heldOutProposal(),
      repositoryCommit: 'capture-commit',
      inventorySha256: 'inventory-hash',
    });
    const approval: AffiliateEvidenceCaptureApproval = {
      schemaVersion: 1,
      capturePlanId: plan.capturePlanId,
      planSha256: plan.planSha256,
      repositoryCommit: plan.repositoryCommit,
      approvedByUserId: 'user-1',
      approvedAt: '2026-07-30T00:00:00.000Z',
    };
    expect(resolveAffiliateEvidenceCaptureSelection(plan, approval)).toEqual(
      expect.objectContaining({
        selectionId: plan.capturePlanId,
        approvedByUserId: 'user-1',
      }),
    );

    const changed = JSON.parse(JSON.stringify(plan));
    changed.examples[0].sourceKey = 'changed';
    expect(() => assertAffiliateEvidenceCapturePlan(changed))
      .toThrow('plan hash does not match');
  });
});
