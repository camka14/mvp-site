import { TextDecoder, TextEncoder } from 'util';
import type { AffiliateScrapeMapping, ScrapedPage } from '../types';

Object.assign(global, { TextDecoder, TextEncoder });

const {
  extractAffiliateCandidatesFromPage,
  extractAffiliateFieldValuesFromPage,
} = require('../mappingExtractor') as typeof import('../mappingExtractor');

describe('extractAffiliateCandidatesFromPage', () => {
  const page: ScrapedPage = {
    url: 'https://example.com/events',
    finalUrl: 'https://example.com/events',
    statusCode: 200,
    fetchedAt: '2026-06-25T20:00:00.000Z',
    body: `
      <section class="event-card">
        <a class="event-title" href="/register/summer-league">Summer League</a>
        <span class="date">2026-07-10T18:00:00-07:00</span>
        <span class="price">$85/team</span>
        <span class="venue">Clear Creek Courts</span>
      </section>
      <section class="event-card">
        <a class="event-title" href="">Missing Link</a>
      </section>
    `,
  };

  const mapping: AffiliateScrapeMapping = {
    kind: 'EVENT',
    listUrl: 'https://example.com/events',
    itemSelector: '.event-card',
    fields: {
      title: { selector: '.event-title', mode: 'text', required: true },
      officialActionUrl: {
        selector: '.event-title',
        mode: 'attribute',
        attribute: 'href',
        transform: 'absoluteUrl',
        required: true,
      },
      startsAt: { selector: '.date', mode: 'text', transform: 'dateTime' },
      priceText: { selector: '.price', mode: 'text' },
      venueName: { selector: '.venue', mode: 'text' },
      organizerName: { selector: ':scope', mode: 'literal', value: 'Example Organizer' },
    },
  };

  it('extracts normalized affiliate candidates from repeated item selectors', () => {
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      listingKind: 'EVENT',
      title: 'Summer League',
      officialActionUrl: 'https://example.com/register/summer-league',
      sourceUrl: 'https://example.com/register/summer-league',
      organizerName: 'Example Organizer',
      priceText: '$85/team',
      venueName: 'Clear Creek Courts',
    });
    expect(candidates[0].startsAt).toBe('2026-07-11T01:00:00.000Z');
  });

  it('uses the scrape year for no-year weekday dates', () => {
    const noYearDatePage: ScrapedPage = {
      ...page,
      fetchedAt: '2026-07-02T18:00:00.000Z',
      body: `
        <section class="event-card">
          <a class="event-title" href="/events/legacy">Legacy Tournament</a>
          <span class="date">Sat, Jul 25</span>
        </section>
      `,
    };

    const candidates = extractAffiliateCandidatesFromPage(noYearDatePage, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].startsAt).toBe('2026-07-25T07:00:00.000Z');
  });

  it('normalizes numeric month/day/two-digit-year dates', () => {
    const numericDatePage: ScrapedPage = {
      ...page,
      body: `
        <section class="event-card">
          <a class="event-title" href="/events/numeric">Numeric Date Tournament</a>
          <span class="date">7/25/26 - 7/26/26</span>
        </section>
      `,
    };

    const candidates = extractAffiliateCandidatesFromPage(numericDatePage, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].startsAt).toBe('2026-07-25T07:00:00.000Z');
  });

  it('maps extracted values through a configured value map', () => {
    const valueMapMapping: AffiliateScrapeMapping = {
      kind: 'RENTAL',
      listUrl: 'https://example.com/rentals',
      itemSelector: '.event-card',
      fields: {
        title: { selector: '.event-title', mode: 'text', required: true },
        officialActionUrl: {
          selector: '.event-title',
          mode: 'text',
          valueMap: {
            'Summer League': 'https://example.com/facilities/summer-league-calendar',
          },
          required: true,
        },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(page, valueMapMapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: 'Summer League',
      officialActionUrl: 'https://example.com/facilities/summer-league-calendar',
    });
  });

  it('extracts configured fields from a detail page', () => {
    const detailPage: ScrapedPage = {
      url: 'https://example.com/events/summer-league',
      finalUrl: 'https://example.com/events/summer-league',
      statusCode: 200,
      fetchedAt: '2026-06-25T20:00:00.000Z',
      body: `
        <main>
          <section class="summary">
            <p>Summer league details from the organizer.</p>
          </section>
          <a class="register" href="/register/summer-league">Register now</a>
          <div class="pricing">Team price $120.00</div>
        </main>
      `,
    };

    const fields = extractAffiliateFieldValuesFromPage(detailPage, {
      description: { selector: '.summary', mode: 'text' },
      officialActionUrl: {
        selector: '.register',
        mode: 'attribute',
        attribute: 'href',
        transform: 'absoluteUrl',
      },
      priceText: { selector: '.pricing', mode: 'text', transform: 'priceText' },
    });

    expect(fields).toEqual({
      description: 'Summer league details from the organizer.',
      officialActionUrl: 'https://example.com/register/summer-league',
      priceText: 'Team price $120.00',
    });
  });

  it('normalizes numeric-only price text when the priceText transform is configured', () => {
    const candidates = extractAffiliateCandidatesFromPage({
      ...page,
      body: `
        <section class="event-card">
          <a class="event-title" href="/events/open-play">Open Play</a>
          <span class="price">14</span>
        </section>
      `,
    }, {
      kind: 'EVENT',
      listUrl: 'https://example.com/events',
      itemSelector: '.event-card',
      fields: {
        title: { selector: '.event-title' },
        officialActionUrl: {
          selector: '.event-title',
          mode: 'attribute',
          attribute: 'href',
          transform: 'absoluteUrl',
        },
        priceText: { selector: '.price', mode: 'text', transform: 'priceText' },
      },
    });

    expect(candidates[0].priceText).toBe('$14.00');
  });

  it('emits approved manual summary candidates when configured', () => {
    const manualMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://example.com/programs',
      itemSelector: 'body',
      fields: {
        title: { selector: 'body' },
        officialActionUrl: { selector: 'body' },
      },
      manualCandidates: [
        {
          title: 'Indoor Soccer Friendly Match',
          officialActionUrl: '/friendly-games',
          sourceUrl: 'https://example.com/programs',
          sportName: 'Indoor Soccer',
          formatLabel: 'Friendly match',
          scheduleText: 'Friendly games available. Call for availability.',
          dateDisplayMode: 'NO_FIXED_DATE',
          dateDisplayText: 'Call for availability',
          priceText: '$75 per game',
        },
        {
          listingKind: 'RENTAL',
          title: 'Field and Court Rentals',
          officialActionUrl: '/bookings',
          sourceUrl: 'https://example.com/programs',
          venueName: 'Indoor Sports Center',
          scheduleText: 'Use the official booking calendar for current availability.',
          dateDisplayMode: 'ONGOING',
          dateDisplayText: 'Ongoing rental availability',
        },
      ],
    };

    const candidates = extractAffiliateCandidatesFromPage(page, manualMapping);

    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'EVENT',
        title: 'Indoor Soccer Friendly Match',
        officialActionUrl: 'https://example.com/friendly-games',
        sourceUrl: 'https://example.com/programs',
        sportName: 'Indoor Soccer',
        formatLabel: 'Friendly match',
        scheduleText: 'Friendly games available. Call for availability.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Call for availability',
        priceText: '$75 per game',
        rawPayload: expect.objectContaining({
          manualSummaryCandidate: true,
        }),
      }),
      expect.objectContaining({
        listingKind: 'RENTAL',
        title: 'Field and Court Rentals',
        officialActionUrl: 'https://example.com/bookings',
        sourceUrl: 'https://example.com/programs',
        venueName: 'Indoor Sports Center',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Ongoing rental availability',
      }),
    ]);
  });

  it('parses explicit and compact date ranges', () => {
    const rangePage: ScrapedPage = {
      ...page,
      body: `
        <table>
          <tbody>
            <tr>
              <td>Summer Series 2026</td>
              <td>July 6, 2026 – August 23, 2026</td>
            </tr>
            <tr>
              <td>Hangover Classic</td>
              <td>January 1-3, 2027</td>
            </tr>
          </tbody>
        </table>
      `,
    };
    const rangeMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://example.com/events',
      itemSelector: 'tr',
      fields: {
        title: { selector: 'td:nth-child(1)', mode: 'text', required: true },
        officialActionUrl: { selector: ':scope', mode: 'literal', value: 'https://example.com/register', required: true },
        startsAt: { selector: 'td:nth-child(2)', mode: 'text', transform: 'dateTime' },
        endsAt: { selector: 'td:nth-child(2)', mode: 'text', transform: 'dateRangeEnd' },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(rangePage, rangeMapping);

    expect(candidates).toEqual([
      expect.objectContaining({
        title: 'Summer Series 2026',
        startsAt: '2026-07-06T07:00:00.000Z',
        endsAt: '2026-08-23T07:00:00.000Z',
      }),
      expect.objectContaining({
        title: 'Hangover Classic',
        startsAt: '2027-01-01T08:00:00.000Z',
        endsAt: '2027-01-03T08:00:00.000Z',
      }),
    ]);
  });

  it('parses ampersand, abbreviated month, and cross-month tournament ranges', () => {
    const rangePage: ScrapedPage = {
      ...page,
      body: `
        <ul>
          <li><a href="/beaverton-4v4">Beaverton 4v4 Tournament June 13 & 14, 2026</a></li>
          <li><a href="/mt-hood">Mt Hood Challenge July 31 – August 9, 2026</a></li>
          <li><a href="/cherry-city">Cherry City Cup Sept 4 – 6, 2026</a></li>
        </ul>
      `,
    };
    const rangeMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://example.com/events',
      itemSelector: 'a',
      itemTextIncludes: ['2026'],
      fields: {
        title: {
          selector: ':scope',
          mode: 'text',
          regex: '^(.+?)\\s+(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec))',
          required: true,
        },
        officialActionUrl: {
          selector: ':scope',
          mode: 'attribute',
          attribute: 'href',
          transform: 'absoluteUrl',
          required: true,
        },
        startsAt: {
          selector: ':scope',
          mode: 'text',
          regex: '((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[A-Za-z]*\\.?\\s+\\d{1,2}.*?\\b20\\d{2}\\b)',
          transform: 'dateTime',
        },
        endsAt: {
          selector: ':scope',
          mode: 'text',
          regex: '((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[A-Za-z]*\\.?\\s+\\d{1,2}.*?\\b20\\d{2}\\b)',
          transform: 'dateRangeEnd',
        },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(rangePage, rangeMapping);

    expect(candidates).toEqual([
      expect.objectContaining({
        title: 'Beaverton 4v4 Tournament',
        startsAt: '2026-06-13T07:00:00.000Z',
        endsAt: '2026-06-14T07:00:00.000Z',
      }),
      expect.objectContaining({
        title: 'Mt Hood Challenge',
        startsAt: '2026-07-31T07:00:00.000Z',
        endsAt: '2026-08-09T07:00:00.000Z',
      }),
      expect.objectContaining({
        title: 'Cherry City Cup',
        startsAt: '2026-09-04T07:00:00.000Z',
        endsAt: '2026-09-06T07:00:00.000Z',
      }),
    ]);
  });

  it('filters registration cards and parses ordinal date ranges without a year', () => {
    const registrationPage: ScrapedPage = {
      ...page,
      fetchedAt: '2026-06-26T18:00:00.000Z',
      body: `
        <article class="registration-card">
          <h2>Men's D3 - Adult League Team - RCF Summer Adult League</h2>
          <p class="price">$675</p>
          <p class="description">Register a full team for the summer adult league.</p>
          <p class="deadline">Registration Deadline: Sunday, June 21st</p>
          <dl>
            <dt>Age:</dt><dd>Adult 14+</dd>
            <dt>Level:</dt><dd>Men's D3</dd>
            <dt>Date Range:</dt><dd>July 6th - August 23rd</dd>
          </dl>
          <a href="/register/d3">Register</a>
        </article>
        <article class="registration-card">
          <h2>Coed Pickup</h2>
          <a href="/register/pickup">Register</a>
        </article>
      `,
    };
    const registrationMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://example.com/registration/',
      itemSelector: '.registration-card',
      itemTextIncludes: ['RCF Summer Adult League', 'Adult League Team'],
      fields: {
        title: { selector: 'h2', required: true },
        officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href', transform: 'absoluteUrl', required: true },
        priceText: { selector: '.price' },
        description: { selector: '.description' },
        registrationDeadlineText: { selector: '.deadline', regex: 'Registration Deadline:\\s*(.+)$' },
        ageGroup: { selector: 'dd:nth-of-type(1)' },
        divisionText: { selector: 'dd:nth-of-type(2)' },
        startsAt: { selector: 'dd:nth-of-type(3)', transform: 'dateTime' },
        endsAt: { selector: 'dd:nth-of-type(3)', transform: 'dateRangeEnd' },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(registrationPage, registrationMapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: "Men's D3 - Adult League Team - RCF Summer Adult League",
      officialActionUrl: 'https://example.com/register/d3',
      priceText: '$675',
      description: 'Register a full team for the summer adult league.',
      registrationDeadlineText: 'Sunday, June 21st',
      ageGroup: 'Adult 14+',
      divisionText: "Men's D3",
      startsAt: '2026-07-06T07:00:00.000Z',
      endsAt: '2026-08-23T07:00:00.000Z',
    });
  });

  it('extracts Portland Basketball blurbs without roster spot counts', () => {
    const pickToPlayPage: ScrapedPage = {
      ...page,
      url: 'https://www.portlandbasketball.com/picktoplay.php',
      finalUrl: 'https://www.portlandbasketball.com/picktoplay.php',
      fetchedAt: '2026-06-26T20:00:00.000Z',
      body: `
        <div class="game-card">
          <div class="game-court-header">
            <h3 class="game-title">12:00 PM - Zero referees COOPERATIVE game- 54 minutes 5v5 Full Court. Columbia Christian School- 205 NE 92nd Avenue Portland</h3>
          </div>
          <div class="game-top-row">
            <div class="game-img-box"><img src="/images/zero_ref_logo.jpg" alt="Logo"></div>
            <div class="game-info-box">
              <div class="price-row">$13.00</div>
              <div class="blurb-text">This is a 54 minute game with a gym supervisor and 14 players divided onto 2 teams.</div>
            </div>
          </div>
          <div class="interaction-area">
            <div class="roster-spots-row">
              <button type="button" class="roster-toggle-btn">View Signed Up Players (1)</button>
              <div class="spot-count spot-green">13 spots available</div>
            </div>
            <div class="signup-area">
              <form method="post" class="signup-form">
                <input type="hidden" name="date[1]" value="2026-06-27 12:00:04">
                <input type="hidden" name="location[1]" value="Zero referees COOPERATIVE game- 54 minutes 5v5 Full Court. Columbia Christian School- 205 NE 92nd Avenue Portland">
                <input type="submit" value="Sign Up" class="submit-btn">
              </form>
            </div>
          </div>
        </div>
      `,
    };
    const pickToPlayMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://www.portlandbasketball.com/picktoplay.php',
      itemSelector: '.game-card:has(form.signup-form)',
      fields: {
        title: { selector: '.game-title', mode: 'text', required: true },
        officialActionUrl: {
          selector: ':scope',
          mode: 'literal',
          value: 'https://www.portlandbasketball.com/picktoplay.php',
          required: true,
          transform: 'absoluteUrl',
        },
        startsAt: {
          selector: 'input[name^="date"]',
          mode: 'attribute',
          attribute: 'value',
          required: true,
          transform: 'dateTime',
        },
        priceText: { selector: '.price-row', mode: 'text' },
        statusText: { selector: '.spot-count', mode: 'text' },
        description: { selector: '.blurb-text', mode: 'text' },
        maxParticipantsText: { selector: '.blurb-text', mode: 'text' },
        currentParticipantsText: {
          selector: '.roster-toggle-btn',
          mode: 'text',
          regex: '\\((\\d+)\\)',
        },
        spotsRemainingText: { selector: '.spot-count', mode: 'text' },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(pickToPlayPage, pickToPlayMapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: '12:00 PM - Zero referees COOPERATIVE game- 54 minutes 5v5 Full Court. Columbia Christian School- 205 NE 92nd Avenue Portland',
      priceText: '$13.00',
      statusText: '13 spots available',
      description: 'This is a 54 minute game with a gym supervisor and 14 players divided onto 2 teams.',
      maxParticipantsText: 'This is a 54 minute game with a gym supervisor and 14 players divided onto 2 teams.',
      currentParticipantsText: '1',
      spotsRemainingText: '13 spots available',
    });
    expect(candidates[0].description).not.toContain('12:00 PM');
    expect(candidates[0].description).not.toContain('$13.00');
    expect(candidates[0].description).not.toContain('13 spots available');
    expect(candidates[0].participantOptionsText).toBeUndefined();
  });

  it('extracts Rose City Volleyball card dates from preceding day sections', () => {
    const volleyballPage: ScrapedPage = {
      ...page,
      url: 'https://www.portlandbasketball.com/rosecityvb.php',
      finalUrl: 'https://www.portlandbasketball.com/rosecityvb.php',
      fetchedAt: '2026-07-01T20:00:00.000Z',
      body: `
        <div class="day-section">Wednesday, July 1st</div>
        <div class="game-card">
          <h3>8:05 PM - TEAM PLAY WEDNESDAYS (Individuals too) Beaverton- Beaverton Hoop YMCA- 9685 SW Harvest Court (2 Hours 5 Mins)</h3>
          <div class="game-flex">
            <div class="game-desc"><strong>$14.00</strong> | Male and female mixed-traditional open gym. Up to 42 players play on 3 nets.</div>
          </div>
          <div class="spot-count spot-green">12 spots available</div>
          <form method="post"><input type="submit" value="Confirm Spot"></form>
          <button class="roster-toggle">View Roster (16)</button>
        </div>
      `,
    };
    const volleyballMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://www.portlandbasketball.com/rosecityvb.php',
      itemSelector: '.game-card:has(form)',
      fields: {
        title: { selector: 'h3', mode: 'text', required: true },
        officialActionUrl: {
          selector: ':scope',
          mode: 'literal',
          value: 'https://www.portlandbasketball.com/rosecityvb.php',
          required: true,
          transform: 'absoluteUrl',
        },
        startsAt: {
          selector: 'h3',
          mode: 'text',
          required: true,
          transform: 'previousDaySectionDateTime',
        },
        priceText: { selector: '.game-desc strong', mode: 'text' },
        description: {
          selector: '.game-desc',
          mode: 'text',
          excludeSelectors: ['strong'],
          regex: '^\\s*\\|?\\s*(.+)$',
        },
        maxParticipantsText: { selector: '.game-desc', mode: 'text' },
        currentParticipantsText: {
          selector: '.roster-toggle',
          mode: 'text',
          regex: '\\((\\d+)\\)',
        },
        spotsRemainingText: { selector: '.spot-count', mode: 'text' },
        sportName: { selector: ':scope', mode: 'literal', value: 'Indoor Volleyball' },
        organizerName: { selector: ':scope', mode: 'literal', value: 'Rose City Volleyball' },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(volleyballPage, volleyballMapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: '8:05 PM - TEAM PLAY WEDNESDAYS (Individuals too) Beaverton- Beaverton Hoop YMCA- 9685 SW Harvest Court (2 Hours 5 Mins)',
      officialActionUrl: 'https://www.portlandbasketball.com/rosecityvb.php',
      startsAt: '2026-07-02T03:05:00.000Z',
      priceText: '$14.00',
      description: 'Male and female mixed-traditional open gym. Up to 42 players play on 3 nets.',
      maxParticipantsText: '$14.00 | Male and female mixed-traditional open gym. Up to 42 players play on 3 nets.',
      currentParticipantsText: '16',
      spotsRemainingText: '12 spots available',
      sportName: 'Indoor Volleyball',
      organizerName: 'Rose City Volleyball',
    });
  });

  it('extracts Telerik postback URLs from TeamSideline-style More Info buttons', () => {
    const teamSidelinePage: ScrapedPage = {
      ...page,
      finalUrl: 'https://www.portlandsoftball.com/current-programs',
      body: `
        <div class="row">
          <div class="col-lg-4"><img class="programImage" src="/program.png" /></div>
          <div class="col-lg-8">
            <p><strong><span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_ProgramNameLabel">4thefallen- Veterans benefit Tournament - Summer 2026</span></strong></p>
            <p>Men's & Women's - July 11th. Coed - July 12th. $400 entry fee.</p>
            <span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_EnrollButton" class="RadButton currentProgramEnrollButton">
              <input value="Register & Pay Here" />
            </span>
            <span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_MoreButton" class="RadButton">
              <input value="More Info" />
            </span>
            <span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_RegistrationStatusLabel">Open</span>
            <span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_RegularRegistrationLabel">Tuesday, March 3, 2026 - Friday, July 3, 2026</span>
            <span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_ProgramDurationLabel">Saturday, July 11, 2026 - Sunday, July 12, 2026</span>
            <span id="ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_RegularRegistrationCostLabel">$400.00</span>
          </div>
        </div>
        <script>
          $create(Telerik.Web.UI.RadButton, {"_postBackReference":"WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions('ctl00$ContentPlaceHolder1$CurrentProgramsControl$ProgramsListView$ctrl2$EnrollButton', '', false, '', '/user/place-order/cart.aspx?d=abc', false, true))","uniqueID":"ctl00$ContentPlaceHolder1$CurrentProgramsControl$ProgramsListView$ctrl2$EnrollButton"}, null, null, $get("ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_EnrollButton"));
          $create(Telerik.Web.UI.RadButton, {"_postBackReference":"WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions('ctl00$ContentPlaceHolder1$CurrentProgramsControl$ProgramsListView$ctrl2$MoreButton', '', false, '', '/sites/portlandsoftball/program/110568/4thefallen-Veterans-benefit-Tournament', false, true))","uniqueID":"ctl00$ContentPlaceHolder1$CurrentProgramsControl$ProgramsListView$ctrl2$MoreButton"}, null, null, $get("ctl00_ContentPlaceHolder1_CurrentProgramsControl_ProgramsListView_ctrl2_MoreButton"));
        </script>
      `,
    };
    const teamSidelineMapping: AffiliateScrapeMapping = {
      kind: 'EVENT',
      listUrl: 'https://www.portlandsoftball.com/current-programs',
      itemSelector: '.row:has(img.programImage)',
      fields: {
        title: { selector: '[id$="_ProgramNameLabel"]', required: true },
        officialActionUrl: {
          selector: '[id$="_MoreButton"]',
          mode: 'attribute',
          attribute: 'id',
          transform: 'telerikPostBackUrl',
          required: true,
        },
        startsAt: { selector: '[id$="_ProgramDurationLabel"]', transform: 'dateTime' },
        endsAt: { selector: '[id$="_ProgramDurationLabel"]', transform: 'dateRangeEnd' },
        priceText: { selector: '[id$="_RegularRegistrationCostLabel"]' },
        statusText: { selector: '[id$="_RegistrationStatusLabel"]' },
        registrationDeadlineText: { selector: '[id$="_RegularRegistrationLabel"]', regex: '[-–]\\s*(.+)$' },
        description: {
          selector: '.col-lg-8',
          excludeSelectors: [
            '[id$="_ProgramNameLabel"]',
            '.RadButton',
            '[id$="_RegistrationInfoPanel"]',
            '[id*="Registration"]',
            '[id$="_ProgramDurationLabel"]',
            '[id$="_RegularRegistrationCostLabel"]',
          ],
        },
        sourceUrl: {
          selector: '[id$="_MoreButton"]',
          mode: 'attribute',
          attribute: 'id',
          transform: 'telerikPostBackUrl',
        },
      },
    };

    const candidates = extractAffiliateCandidatesFromPage(teamSidelinePage, teamSidelineMapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: '4thefallen- Veterans benefit Tournament - Summer 2026',
      officialActionUrl: 'https://www.portlandsoftball.com/sites/portlandsoftball/program/110568/4thefallen-Veterans-benefit-Tournament',
      sourceUrl: 'https://www.portlandsoftball.com/sites/portlandsoftball/program/110568/4thefallen-Veterans-benefit-Tournament',
      priceText: '$400.00',
      statusText: 'Open',
      registrationDeadlineText: 'Friday, July 3, 2026',
      description: "Men's & Women's - July 11th. Coed - July 12th. $400 entry fee.",
      startsAt: '2026-07-11T07:00:00.000Z',
      endsAt: '2026-07-12T07:00:00.000Z',
    });
  });
});
