import type { AffiliateScrapeMapping } from './types';

/**
 * Shared contract for a source that was reviewed but has no eligible current
 * event or rental rows. The setup scripts still own source-specific evidence
 * and withheld-row reasons.
 */
export const ZERO_CANDIDATE_REVIEW_ITEM_SELECTOR = '[data-no-current-listings]';

export const ZERO_CANDIDATE_REVIEW_SOURCE_KEYS = [
  'axiom-vbc-reviewed-programs',
  'blues-vbc-final-review',
  'cherry-city-juniors-final-review',
  'coast-to-coast-futbol-final-review',
  'crushers-vbc-final-review',
  'eastern-oregon-vbc-reviewed-programs',
  'fc-piamonte-final-review',
  'gorge-juniors-vbc-reviewed-programs',
  'happy-valley-vbc-final-review',
  'lane-amateur-hockey-final-review',
  'lincoln-youth-soccer-final-review',
  'mid-valley-soccer-final-review',
  'oregon-surf-final-review',
  'reynolds-youth-soccer-final-review',
  'rogue-united-fc-final-review',
  'rose-city-hockey-final-review',
  'sherwood-youth-soccer-final-review',
  'siuslaw-youth-soccer-final-review',
  'team-oregon-hockey-final-review',
  'union-county-youth-soccer-final-review',
  'vancouver-vbc-final-review',
  'whk-soccer-final-review',
  'winterhawks-jr-hockey-final-review',
  'woodburn-fc-final-review',
  'yamhill-carlton-soccer-final-review',
] as const;

export const createZeroCandidateReviewMapping = (
  listUrl: string,
  officialActionUrl: string,
): AffiliateScrapeMapping => ({
  kind: 'EVENT',
  listUrl,
  itemSelector: ZERO_CANDIDATE_REVIEW_ITEM_SELECTOR,
  fields: {
    title: { selector: ZERO_CANDIDATE_REVIEW_ITEM_SELECTOR, mode: 'text' },
    officialActionUrl: {
      selector: ZERO_CANDIDATE_REVIEW_ITEM_SELECTOR,
      mode: 'literal',
      value: officialActionUrl,
    },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: [],
});
