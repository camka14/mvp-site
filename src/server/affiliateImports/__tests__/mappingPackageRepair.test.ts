/** @jest-environment node */

import { affiliateMappingProducerRepairEligibility } from '../mappingPackageRepair';

describe('affiliate mapping producer repair eligibility', () => {
  const base = {
    approvalStatus: 'REJECTED',
    mappingStatus: 'FAILED',
    resultSummary: {},
  };

  it('requeues packages whose setup scripts refuse guarded live application', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['The setup script explicitly refuses --live and cannot be applied by the guarded reviewer.'],
      },
    })).toEqual({
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'LIVE_SETUP_UNSUPPORTED',
    });
  });

  it('requeues packages rejected because event location failures were treated as package failures', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        rationale: 'Candidate event coordinates were missing for two extracted events.',
      },
    }).repairReason).toBe('EVENT_LOCATION_PACKAGE_REJECTION');
  });

  it('does not recycle unrelated package defects', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: { blockingIssues: ['The official logo is not supported by stored evidence.'] },
    })).toEqual({
      eligible: false,
      reason: 'unrelated-producer-defect',
      repairReason: null,
    });
  });
});
