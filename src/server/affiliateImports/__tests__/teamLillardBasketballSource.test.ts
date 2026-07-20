import {
  TEAM_LILLARD_ABOUT_URL,
  TEAM_LILLARD_AUTOMATION_POLICY,
  TEAM_LILLARD_HOME_URL,
  TEAM_LILLARD_LOGO_SOURCE_URL,
  TEAM_LILLARD_ORG_DESCRIPTION,
  TEAM_LILLARD_ROBOTS_URL,
} from '../teamLillardBasketballSource';

describe('Team Lillard Basketball affiliate source', () => {
  it('records the explicit no-automation policy instead of creating a scrape mapping', () => {
    expect(TEAM_LILLARD_AUTOMATION_POLICY.automatedScrapingAllowed).toBe(false);
    expect(TEAM_LILLARD_AUTOMATION_POLICY.reason).toContain('GPTBot');
    expect(TEAM_LILLARD_AUTOMATION_POLICY.reviewedPublicPages).toEqual([
      TEAM_LILLARD_HOME_URL,
      TEAM_LILLARD_ABOUT_URL,
    ]);
    expect(TEAM_LILLARD_ROBOTS_URL).toBe(`${TEAM_LILLARD_HOME_URL}robots.txt`);
  });

  it('keeps the public profile grounded in official source material without inventing a location or event', () => {
    expect(TEAM_LILLARD_ORG_DESCRIPTION).toContain('nonprofit basketball organization');
    expect(TEAM_LILLARD_LOGO_SOURCE_URL).toContain('sportngin.com');
    expect(TEAM_LILLARD_AUTOMATION_POLICY.withheldRows).toEqual([
      expect.objectContaining({
        title: 'Team Lillard tryouts, camps, and teams',
        reason: expect.stringContaining('No current future'),
      }),
    ]);
  });
});
