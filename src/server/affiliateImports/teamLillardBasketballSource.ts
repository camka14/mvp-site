export const TEAM_LILLARD_HOME_URL = 'https://www.teamlillardbasketball.com/';
export const TEAM_LILLARD_ABOUT_URL = 'https://www.teamlillardbasketball.com/about';
export const TEAM_LILLARD_ROBOTS_URL = 'https://www.teamlillardbasketball.com/robots.txt';
export const TEAM_LILLARD_LOGO_SOURCE_URL =
  'https://cdn1.sportngin.com/attachments/logo_graphic/9965/8554/IMG_20180308_074148_487_large.jpg';
export const TEAM_LILLARD_ORG_DESCRIPTION =
  'Team Lillard Basketball is a nonprofit basketball organization that develops student-athletes, builds national exposure, and supports college scholarship opportunities through academic, athletic, and social development.';

export const TEAM_LILLARD_AUTOMATION_POLICY = {
  automatedScrapingAllowed: false,
  reason:
    'The reviewed robots.txt explicitly disallows GPTBot. BracketIQ must not run an automated page scrape, mapping, or scheduled scrape for this source.',
  reviewedPublicPages: [TEAM_LILLARD_HOME_URL, TEAM_LILLARD_ABOUT_URL],
  withheldRows: [
    {
      title: 'Team Lillard tryouts, camps, and teams',
      reason:
        'No current future tryout, camp, or stable roster-level registration target was exposed on the reviewed public pages. Automated collection is also prohibited by the source policy.',
    },
  ],
} as const;
