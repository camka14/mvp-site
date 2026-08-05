/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { affiliateOrganizationInitialOwnership } from '../organizationOwnership';

describe('affiliate organization ownership initialization', () => {
  it('returns a fresh, unclaimed affiliate state', () => {
    const first = affiliateOrganizationInitialOwnership();
    const second = affiliateOrganizationInitialOwnership();

    expect(first).toEqual({
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'UNCLAIMED',
      claimVerificationLevel: 'NONE',
      claimedAt: null,
      claimedByUserId: null,
      ownershipVerifiedAt: null,
      ownershipVerificationLastCheckedAt: null,
    });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('keeps generated setup scripts and live inserts explicit', () => {
    const generator = readFileSync(path.join(
      process.cwd(),
      'src/server/affiliateImports/agentTemplates/sourceFiles.ts',
    ), 'utf8');
    const sync = readFileSync(path.join(
      process.cwd(),
      'scripts/sync-affiliate-organizations-to-live.ts',
    ), 'utf8');

    expect(generator).toContain('...affiliateOrganizationInitialOwnership()');
    expect(sync).toContain("'originType'");
    expect(sync).toContain("'ownershipStatus'");
    expect(sync).toContain("'claimVerificationLevel'");
    expect(sync).toContain("if (column === 'originType') return 'AFFILIATE_IMPORTED'");
    expect(sync).toContain("if (column === 'ownershipStatus') return 'UNCLAIMED'");
    expect(sync).toContain("if (column === 'claimVerificationLevel') return 'NONE'");
  });
});
