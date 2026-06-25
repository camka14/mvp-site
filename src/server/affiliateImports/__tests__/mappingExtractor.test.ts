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
      priceText: '$85/team',
      venueName: 'Clear Creek Courts',
    });
    expect(candidates[0].startsAt).toBe('2026-07-11T01:00:00.000Z');
  });
});
