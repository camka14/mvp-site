import { TextDecoder, TextEncoder } from 'util';
import type { AffiliateScrapeMapping, ScrapedPage } from '../types';

Object.assign(global, { TextDecoder, TextEncoder });

const { extractAffiliateCandidatesFromPage } = require('../mappingExtractor') as typeof import('../mappingExtractor');

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
});
