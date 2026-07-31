import { parseAffiliateScrapeMapping } from '../types';
import {
  PRO_SKILLS_NYC_HOME_URL,
  PRO_SKILLS_NYC_MAPPING,
  PRO_SKILLS_NYC_MANUAL_CANDIDATES,
  PRO_SKILLS_NYC_SOURCE_EVIDENCE,
} from '../proSkillsBasketballNewYorkCitySource';

describe('Pro Skills Basketball New York City affiliate source', () => {
  it('emits one ongoing CLUB profile and withholds ambiguous city event rows', () => {
    expect(parseAffiliateScrapeMapping(PRO_SKILLS_NYC_MAPPING).kind).toBe('CLUB');
    expect(PRO_SKILLS_NYC_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Pro Skills Basketball New York City',
        sourceUrl: 'https://proskillsbasketball.com/new-york-city/teams/',
        city: 'New York, NY',
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(PRO_SKILLS_NYC_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('other city rows')]),
    );
    expect(PRO_SKILLS_NYC_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(PRO_SKILLS_NYC_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(PRO_SKILLS_NYC_MANUAL_CANDIDATES[0].sourceUrl).toContain(new URL(PRO_SKILLS_NYC_HOME_URL).hostname);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(PRO_SKILLS_NYC_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '0000a3f3-db6b-4a50-92a1-8e7e1fc058e7',
        runId: '167ecacd-32c0-472f-98d0-8915ef69667f',
        complianceStatus: 'ALLOWED',
        runStatus: 'PARTIAL',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(PRO_SKILLS_NYC_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 3 }]),
    );
  });
});
