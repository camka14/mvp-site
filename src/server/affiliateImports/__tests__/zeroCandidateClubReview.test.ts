import { parseAffiliateScrapeMapping } from '../types';
import {
  createZeroCandidateReviewMapping,
  ZERO_CANDIDATE_REVIEW_ITEM_SELECTOR,
  ZERO_CANDIDATE_REVIEW_SOURCE_KEYS,
} from '../zeroCandidateClubReview';

describe('zero-candidate club review contract', () => {
  it('covers every processed successful zero-candidate source exactly once', () => {
    expect(ZERO_CANDIDATE_REVIEW_SOURCE_KEYS).toHaveLength(25);
    expect(new Set(ZERO_CANDIDATE_REVIEW_SOURCE_KEYS).size).toBe(25);
  });

  it('produces a parseable idempotent no-listings mapping', () => {
    const mapping = parseAffiliateScrapeMapping(
      createZeroCandidateReviewMapping(
        'https://example.org/programs',
        'https://example.org/',
      ),
    );

    expect(mapping).toEqual(expect.objectContaining({
      kind: 'EVENT',
      itemSelector: ZERO_CANDIDATE_REVIEW_ITEM_SELECTOR,
      dedupe: { fields: ['officialActionUrl', 'title'] },
      manualCandidates: [],
    }));
    expect(mapping.fields.officialActionUrl).toEqual(expect.objectContaining({
      mode: 'literal',
      value: 'https://example.org/',
    }));
  });
});
