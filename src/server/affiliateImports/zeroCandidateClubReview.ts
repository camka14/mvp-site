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

export const ZERO_CANDIDATE_REVIEW_ORGANIZATION_IDS = [
  'affiliate_org_ceva_club_directory_axiom_vbc',
  'affiliate_org_ceva_club_directory_blues_vbc',
  'affiliate_org_ceva_club_directory_cherry_city_juniors_vbc',
  'affiliate_org_oregon_youth_soccer_find_a_club_coast_to_coast_futbol_academy',
  'affiliate_org_ceva_club_directory_crushers_vbc',
  'affiliate_org_ceva_club_directory_eastern_oregon_vbc',
  'affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte',
  'affiliate_org_ceva_club_directory_gorge_juniors_vbc',
  'affiliate_org_ceva_club_directory_happy_valley_volleyball_club_hvvc',
  'affiliate_org_oregon_state_hockey_youth_directory_lane_amateur_hockey_association',
  'affiliate_org_oregon_youth_soccer_find_a_club_lincoln_youth_soccer',
  'affiliate_org_oregon_youth_soccer_find_a_club_mid_valley_soccer_club',
  'affiliate_org_oregon_youth_soccer_find_a_club_oregon_surf',
  'affiliate_org_oregon_youth_soccer_find_a_club_reynolds_youth_soccer_club',
  'affiliate_org_oregon_youth_soccer_find_a_club_rogue_united_fc',
  'affiliate_org_oregon_state_hockey_youth_directory_rose_city_hockey_club',
  'affiliate_org_oregon_youth_soccer_find_a_club_sherwood_youth_soccer_club',
  'affiliate_org_oregon_youth_soccer_find_a_club_siuslaw_youth_soccer_association',
  'affiliate_org_oregon_state_hockey_youth_directory_team_oregon',
  'affiliate_org_oregon_youth_soccer_find_a_club_union_county_youth_soccer_association',
  'affiliate_org_ceva_club_directory_vancouver_vbc',
  'affiliate_org_oregon_youth_soccer_find_a_club_whk_soccer_club',
  'affiliate_org_oregon_state_hockey_youth_directory_winterhawks_jr_hockey',
  'affiliate_org_oregon_youth_soccer_find_a_club_woodburn_fc',
  'affiliate_org_oregon_youth_soccer_find_a_club_yamhill_carlton_soccer_club',
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
