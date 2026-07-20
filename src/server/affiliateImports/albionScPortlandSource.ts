import type { AffiliateScrapeMapping } from './types';

type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const ALBION_SC_PORTLAND_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeSourceKey: 'site-albionscportland-org',
  runId: '938c9063-f10c-484b-87de-146955006ce2',
  runStatus: 'SUCCEEDED',
  provider: 'FIRECRAWL',
  capturedAt: '2026-07-19T23:45:24.214Z',
  pages: [
    {
      url: 'https://www.albionscportland.org/',
      role: 'LISTING',
      robotsStatus: 'ALLOWED',
    },
  ],
  artifactKinds: [
    'PAGE_HTML',
    'PAGE_MARKDOWN',
    'PAGE_LINKS',
    'PAGE_IMAGES',
    'PAGE_BRANDING',
    'PAGE_SCREENSHOT',
    'LOGO_CANDIDATE',
    'ROBOTS',
  ],
} as const;

export const ALBION_SC_PORTLAND_INTAKE_REFRESH_PAGES = [
  'https://www.albionscportland.org/juniors/juniors-program-overview',
  'https://www.albionscportland.org/juniors/juniors-camps/albion-portland-summer-camps',
  'https://www.albionscportland.org/tryouts/tryout-information',
  'https://www.albionscportland.org/aug-16',
] as const;

export const selectFutureAlbionCandidates = (
  candidates: readonly ManualCandidate[],
  referenceDate = new Date(),
  availabilityEndsAtByTitle: Readonly<Record<string, string>> = {},
): ManualCandidate[] => candidates.filter((candidate) => {
  if (!candidate.startsAt) return false;
  const startsAt = Date.parse(candidate.startsAt);
  if (!Number.isFinite(startsAt) || startsAt <= referenceDate.getTime()) return false;

  const availabilityEndsAtText = availabilityEndsAtByTitle[candidate.title];
  if (!availabilityEndsAtText) return true;
  const availabilityEndsAt = Date.parse(availabilityEndsAtText);
  return Number.isFinite(availabilityEndsAt) && availabilityEndsAt > referenceDate.getTime();
});
