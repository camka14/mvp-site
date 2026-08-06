import {
  normalizeAffiliateEventDateTime,
  parseAffiliateDateTimeValue,
  parseAffiliateDurationText,
} from '../affiliateDateTime';

describe('affiliate event datetime normalization', () => {
  const referenceDate = new Date('2026-08-01T12:00:00.000Z');

  it('converts a source wall-clock start and duration into stable UTC instants', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026 9:30 PM',
      durationText: '2 Hours 5 Mins',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-08-11T04:30:00.000Z',
      endsAt: '2026-08-11T06:35:00.000Z',
      dateDisplayMode: 'SCHEDULED',
      metadata: {
        startPrecision: 'DATE_TIME',
        timeZone: 'America/Los_Angeles',
        timeZoneEvidence: 'SOURCE_FIELD',
        endDerivation: 'EXPLICIT_DURATION',
        durationText: '2 Hours 5 Mins',
        durationMinutes: 125,
        warnings: [],
      },
    });
  });

  it('keeps date-only input date-only while retaining an ordering instant', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-08-10T07:00:00.000Z',
      endsAt: null,
      dateDisplayMode: 'DATE_ONLY',
      metadata: {
        startPrecision: 'DATE_ONLY',
        endDerivation: 'NONE',
      },
    });
  });

  it('rejects nonexistent and ambiguous local daylight-saving times', () => {
    expect(parseAffiliateDateTimeValue('March 8, 2026 2:30 AM', {
      referenceDate,
      timeZone: 'America/Los_Angeles',
    })).toMatchObject({
      iso: null,
      error: 'NONEXISTENT_LOCAL_TIME',
    });

    expect(parseAffiliateDateTimeValue('November 1, 2026 1:30 AM', {
      referenceDate,
      timeZone: 'America/Los_Angeles',
    })).toMatchObject({
      iso: null,
      error: 'AMBIGUOUS_LOCAL_TIME',
    });
  });

  it('accepts explicit duration units and rejects unsafe durations', () => {
    expect(parseAffiliateDurationText('54 minutes')).toEqual({ minutes: 54, reason: null });
    expect(parseAffiliateDurationText('90 min')).toEqual({ minutes: 90, reason: null });
    expect(parseAffiliateDurationText('1 hour')).toEqual({ minutes: 60, reason: null });
    expect(parseAffiliateDurationText('2 days 5 hours')).toEqual({ minutes: 3180, reason: null });
    expect(parseAffiliateDurationText('0 minutes')).toEqual({ minutes: null, reason: 'NON_POSITIVE' });
    expect(parseAffiliateDurationText('-1 hour')).toEqual({ minutes: null, reason: 'NON_POSITIVE' });
    expect(parseAffiliateDurationText('45 business days')).toEqual({ minutes: null, reason: 'INVALID_FORMAT' });
  });
});
