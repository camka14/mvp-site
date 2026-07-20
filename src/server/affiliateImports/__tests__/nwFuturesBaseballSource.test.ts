import { parseAffiliateScrapeMapping } from '../types';
import {
  NW_FUTURES_BASEBALL_ADDRESS,
  NW_FUTURES_BASEBALL_LOGO_SOURCE_URL,
  NW_FUTURES_BASEBALL_MANUAL_CANDIDATES,
  NW_FUTURES_BASEBALL_MAPPING,
} from '../nwFuturesBaseballSource';

describe('NW Futures Baseball affiliate source', () => {
  it('keeps the public club and only the remaining future 2026 summer camps', () => {
    const mapping = parseAffiliateScrapeMapping(NW_FUTURES_BASEBALL_MAPPING);
    const candidates = mapping.manualCandidates ?? [];
    const clubs = candidates.filter((candidate) => candidate.listingKind === 'CLUB');
    const events = candidates.filter((candidate) => candidate.listingKind === 'EVENT');

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(5);
    expect(clubs).toHaveLength(1);
    expect(events).toHaveLength(4);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(events.map((candidate) => candidate.startsAt)).toEqual([
      '2026-07-20T09:00:00-07:00',
      '2026-07-27T09:00:00-07:00',
      '2026-08-03T09:00:00-07:00',
      '2026-08-10T09:00:00-07:00',
    ]);
  });

  it('preserves the source-stated venue, current price, and youth age division', () => {
    const events = NW_FUTURES_BASEBALL_MANUAL_CANDIDATES.filter(
      (candidate) => candidate.listingKind === 'EVENT',
    );

    expect(events.every((candidate) => candidate.address === NW_FUTURES_BASEBALL_ADDRESS)).toBe(true);
    expect(events.every((candidate) => candidate.priceText === '$225 per player')).toBe(true);
    expect(events.every((candidate) => candidate.tags?.includes('Camp'))).toBe(true);
    expect(events.every((candidate) => candidate.divisions?.[0]?.ageCutoffLabel === 'Ages 6-12')).toBe(true);
    expect(events.every((candidate) => candidate.divisions?.[0]?.priceCents === 22500)).toBe(true);
    expect(NW_FUTURES_BASEBALL_LOGO_SOURCE_URL).toContain('NW-Futures-Logo-Final.png');
  });

  it('uses stable candidate identities for local repeat runs', () => {
    expect(NW_FUTURES_BASEBALL_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(NW_FUTURES_BASEBALL_MANUAL_CANDIDATES.map((candidate) => `${candidate.title}|${candidate.startsAt ?? ''}`)).toEqual([
      'NW Futures Baseball|',
      'NW Futures Baseball Summer Camp - July 20-24|2026-07-20T09:00:00-07:00',
      'NW Futures Baseball Summer Camp - July 27-31|2026-07-27T09:00:00-07:00',
      'NW Futures Baseball Summer Camp - August 3-7|2026-08-03T09:00:00-07:00',
      'NW Futures Baseball Summer Camp - August 10-14|2026-08-10T09:00:00-07:00',
    ]);
  });
});
