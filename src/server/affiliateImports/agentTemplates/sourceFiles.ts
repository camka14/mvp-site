import type { AffiliateSourceDraft } from '../agentContracts';

export type AffiliateGeneratedSourceTemplateInput = {
  draft: AffiliateSourceDraft;
  symbolName: string;
  sourceId: string;
  organizationId: string;
  mappingId: string;
  configImportPathFromSetup: string;
  configImportPathFromTest: string;
};

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const sourceEvidenceFor = (draft: AffiliateSourceDraft) => ({
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  intakeId: draft.intakeId,
  intakeSourceKey: draft.sourceKey,
  runId: draft.runId,
  pages: Array.from(new Map(
    draft.evidence.map((item) => [
      item.pageUrl,
      {
        url: item.pageUrl,
        artifactKinds: Array.from(new Set(
          draft.evidence
            .filter((candidate) => candidate.pageUrl === item.pageUrl)
            .map((candidate) => candidate.artifactKind),
        )).sort(),
      },
    ]),
  ).values()),
  artifacts: draft.evidence
    .map((item) => ({
      kind: item.artifactKind,
      sha256: item.artifactSha256,
      pageUrl: item.pageUrl,
      supports: [...item.supports].sort(),
    }))
    .sort((left, right) => (
      left.kind.localeCompare(right.kind)
      || left.sha256.localeCompare(right.sha256)
    )),
});

export const renderAffiliateGeneratedConfig = (
  input: AffiliateGeneratedSourceTemplateInput,
): string => {
  const { draft, symbolName } = input;
  return `/**
 * Generated from reviewed affiliate source intake evidence.
 *
 * This file contains only the constrained mapping proposal. It does not publish
 * candidates, validate the mapping, enable automation, or create a logo.
 */
import type { AffiliateScrapeMapping } from '../types';

export const ${symbolName}_SOURCE_ID = ${json(input.sourceId)};
export const ${symbolName}_ORGANIZATION_ID = ${json(input.organizationId)};
export const ${symbolName}_MAPPING_ID = ${json(input.mappingId)};
export const ${symbolName}_SOURCE_KEY = ${json(draft.sourceKey)};

export const ${symbolName}_SOURCE_EVIDENCE = ${json(sourceEvidenceFor(draft))} as const;

export const ${symbolName}_ORGANIZATION_DRAFT = ${json(draft.organization)} as const;

export const ${symbolName}_LOGO_EVIDENCE = ${json(draft.logo)} as const;

export const ${symbolName}_EXPECTED_CANDIDATES = ${json(draft.expectedCandidates)} as const;

export const ${symbolName}_MAPPING = ${json(draft.mapping)} satisfies AffiliateScrapeMapping;
`;
};

export const renderAffiliateGeneratedSetup = (
  input: AffiliateGeneratedSourceTemplateInput,
): string => {
  const { draft, symbolName } = input;
  const sports = Array.from(new Set(
    draft.expectedCandidates
      .map((candidate) => candidate.sportName)
      .filter((sport): sport is string => Boolean(sport)),
  )).sort();
  const notes = [
    'Generated from a reviewed affiliate source intake.',
    draft.logo.disposition === 'MISSING'
      ? 'Official logo remains missing and requires human review before publication.'
      : 'Official logo evidence is recorded but the normalized logo file remains a human-reviewed setup step.',
    ...draft.warnings,
  ].join(' ');
  return `/**
 * Generated affiliate source setup for ${draft.sourceKey}.
 *
 * Owns source ${input.sourceId}, mapping ${input.mappingId}, and private source
 * organization ${input.organizationId}. Owner: samuel.r@razumly.com.
 *
 * This script is local-only. Without --scrape it idempotently creates or repairs
 * the private organization, disabled source, and unvalidated mapping. With
 * --scrape it performs one REVIEW-mode scrape; it never publishes candidates.
 * Official logo normalization and rendered-fit review remain manual gates.
 */
import dotenv from 'dotenv';
import {
  ${symbolName}_LOGO_EVIDENCE,
  ${symbolName}_MAPPING,
  ${symbolName}_MAPPING_ID,
  ${symbolName}_ORGANIZATION_DRAFT,
  ${symbolName}_ORGANIZATION_ID,
  ${symbolName}_SOURCE_EVIDENCE,
  ${symbolName}_SOURCE_ID,
  ${symbolName}_SOURCE_KEY,
} from ${json(input.configImportPathFromSetup)};

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('Generated agent setup scripts are local-only until human review.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape =
  typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(\`Owner user \${OWNER_EMAIL} was not found.\`);
  return owner;
};

const upsertPrivateOrganization = async (ownerId: string) => {
  const organization = {
    updatedAt: new Date(),
    name: ${json(draft.organization.name ?? draft.sourceKey)},
    location: ${json(draft.organization.city)},
    address: ${json(draft.organization.address)},
    description: ${json(draft.organization.description)},
    ownerId,
    website: ${json(draft.organization.website)},
    sports: ${json(sports)},
  };
  await (prisma as any).organizations.upsert({
    where: { id: ${symbolName}_ORGANIZATION_ID },
    create: {
      id: ${symbolName}_ORGANIZATION_ID,
      createdAt: new Date(),
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      publicWidgetsEnabled: false,
      publicPageEnabled: false,
      status: 'UNLISTED',
      logoId: null,
      ...organization,
    },
    update: organization,
  });
};

const upsertSourceAndMapping = async () => {
  const source = {
    name: ${json(draft.organization.name ?? draft.sourceKey)},
    sourceKey: ${symbolName}_SOURCE_KEY,
    organizationId: ${symbolName}_ORGANIZATION_ID,
    baseUrl: ${json(draft.organization.website)},
    listUrl: ${json(draft.mapping?.listUrl)},
    targetKind: ${json(draft.listingKind)},
    status: 'ACTIVE',
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: ${json(notes)},
    metadata: {
      sourceEvidence: ${symbolName}_SOURCE_EVIDENCE,
      logoEvidence: ${symbolName}_LOGO_EVIDENCE,
      generatedBy: 'affiliate-mapping-agent',
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: ${symbolName}_SOURCE_ID },
    create: { id: ${symbolName}_SOURCE_ID, activeMappingId: null, ...source },
    update: source,
  });
  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: ${symbolName}_SOURCE_ID },
    data: { isActive: false },
  });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: ${symbolName}_MAPPING_ID },
    create: {
      id: ${symbolName}_MAPPING_ID,
      sourceId: ${symbolName}_SOURCE_ID,
      version: 1,
      isActive: true,
      mapping: ${symbolName}_MAPPING,
      createdByUserId: null,
      notes: 'Generated from stored intake evidence; human validation required.',
      validatedAt: null,
    },
    update: {
      version: 1,
      isActive: true,
      mapping: ${symbolName}_MAPPING,
      notes: 'Generated from stored intake evidence; human validation required.',
      validatedAt: null,
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: ${symbolName}_SOURCE_ID },
    data: { activeMappingId: ${symbolName}_MAPPING_ID, autoScrapeEnabled: false },
  });
};

const main = async () => {
  await loadAppModules();
  const owner = await requireOwner();
  await upsertPrivateOrganization(owner.id);
  await upsertSourceAndMapping();
  console.log(\`Affiliate source ready for local review: \${${symbolName}_SOURCE_KEY}\`);
  if (process.argv.includes('--scrape')) {
    const fixtureDirectory = process.env.AFFILIATE_AGENT_REVIEW_FIXTURE_DIRECTORY?.trim();
    const client = fixtureDirectory
      ? new (
          await import('../src/server/affiliateImports/agentReviewFixtureClient')
        ).AffiliateAgentReviewFixtureClient(fixtureDirectory)
      : undefined;
    const result = await runAffiliateSourceScrape(${symbolName}_SOURCE_ID, {
      importMode: 'REVIEW',
      ...(client ? { client } : {}),
    });
    console.log(JSON.stringify({
      runId: result.run.id,
      candidateCount: result.candidates.length,
      status: result.run.status,
    }, null, 2));
  } else {
    console.log('Re-run with --scrape for one REVIEW-mode scrape. Nothing was published.');
  }
};

main()
  .catch((error) => {
    console.error('[affiliate-generated-setup] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
`;
};

export const renderAffiliateGeneratedTest = (
  input: AffiliateGeneratedSourceTemplateInput,
): string => {
  const { symbolName } = input;
  return `/** @jest-environment node */

import { parseAffiliateScrapeMapping } from '../types';
import {
  ${symbolName}_EXPECTED_CANDIDATES,
  ${symbolName}_MAPPING,
  ${symbolName}_SOURCE_EVIDENCE,
} from ${json(input.configImportPathFromTest)};

describe(${json(`${input.draft.sourceKey} generated affiliate mapping`)}, () => {
  it('matches the current mapping contract and retains intake provenance', () => {
    const parsed = parseAffiliateScrapeMapping(${symbolName}_MAPPING);
    expect(parsed.kind).toBe(${json(input.draft.listingKind)});
    expect(${symbolName}_SOURCE_EVIDENCE.intakeId).toBe(${json(input.draft.intakeId)});
    expect(${symbolName}_SOURCE_EVIDENCE.runId).toBe(${json(input.draft.runId)});
    expect(${symbolName}_SOURCE_EVIDENCE.artifacts.length).toBeGreaterThan(0);
  });

  it('preserves official external candidate links', () => {
    for (const candidate of ${symbolName}_EXPECTED_CANDIDATES) {
      const url = new URL(candidate.officialActionUrl);
      expect(url.hostname).not.toMatch(/(?:^|\\.)bracket-iq\\.com$/);
    }
  });

  it('keeps scheduled dates tied to stored evidence', () => {
    const supported = new Set(
      ${symbolName}_SOURCE_EVIDENCE.artifacts.flatMap((artifact) => artifact.supports),
    );
    ${symbolName}_EXPECTED_CANDIDATES.forEach((candidate, index) => {
      if (!('startsAt' in candidate) || !candidate.startsAt) return;
      expect(
        supported.has('startsAt')
        || supported.has('scheduledDate')
        || supported.has(\`expectedCandidates.\${index}.startsAt\`),
      ).toBe(true);
    });
  });
});
`;
};

export const renderAffiliateRegistryNote = (
  input: AffiliateGeneratedSourceTemplateInput,
): string => {
  const { draft } = input;
  const evidenceKinds = Array.from(new Set(
    draft.evidence.map((item) => item.artifactKind),
  )).sort();
  return `# ${draft.organization.name ?? draft.sourceKey}

- Source key: \`${draft.sourceKey}\`
- Target kind: \`${draft.listingKind}\`
- List URL: ${draft.mapping?.listUrl}
- Status: generated for local review; unvalidated and automation disabled
- Organization id: \`${input.organizationId}\`
- Mapping id/version: \`${input.mappingId}\` / 1
- Intake source key: \`${draft.sourceKey}\`
- Intake id/run id: \`${draft.intakeId}\` / \`${draft.runId}\`
- Stored evidence kinds: ${evidenceKinds.map((kind) => `\`${kind}\``).join(', ')}
- Logo disposition: \`${draft.logo.disposition}\`; official normalization and rendered-fit review remain required
- Known warnings: ${draft.warnings.length ? draft.warnings.join('; ') : 'None recorded'}
`;
};
