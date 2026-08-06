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

  it('preserves DATE_ONLY for a stored ordering instant', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: '2026-08-10T07:00:00.000Z',
      dateDisplayMode: 'DATE_ONLY',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-08-10T07:00:00.000Z',
      endsAt: null,
      dateDisplayMode: 'DATE_ONLY',
      metadata: { startPrecision: 'DATE_ONLY' },
    });
  });

  it('uses the trailing clock time for a range end', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026 9:30 PM - 11:35 PM',
      endsAt: 'August 10, 2026 9:30 PM - 11:35 PM',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-08-11T04:30:00.000Z',
      endsAt: '2026-08-11T06:35:00.000Z',
      metadata: { endDerivation: 'EXPLICIT_END', warnings: [] },
    });
  });

  it('infers the start year before the trailing year in a cross-year range', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'December 31 - January 2, 2027',
      endsAt: 'December 31 - January 2, 2027',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-12-31T08:00:00.000Z',
      endsAt: '2027-01-02T08:00:00.000Z',
      metadata: { warnings: [] },
    });
  });

  it('keeps a yearless cross-year range in the reference year pair', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'December 31 - January 2',
      endsAt: 'December 31 - January 2',
      timeZone: 'America/Los_Angeles',
      referenceDate: new Date('2026-12-15T12:00:00.000Z'),
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-12-31T08:00:00.000Z',
      endsAt: '2027-01-02T08:00:00.000Z',
    });
  });

  it('keeps an active yearless cross-year range anchored in early January', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'December 31 - January 2',
      endsAt: 'December 31 - January 2',
      timeZone: 'America/Los_Angeles',
      referenceDate: new Date('2027-01-01T12:00:00.000Z'),
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-12-31T08:00:00.000Z',
      endsAt: '2027-01-02T08:00:00.000Z',
    });
  });

  it('rolls no-year January dates into the next year at a December boundary', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'January 5, 9:00 PM',
      timeZone: 'America/Los_Angeles',
      referenceDate: new Date('2026-12-15T12:00:00.000Z'),
    });

    expect(normalized.startsAt).toBe('2027-01-06T05:00:00.000Z');
  });

  it('rejects timezone abbreviations as ambiguous timezone evidence', () => {
    expect(parseAffiliateDateTimeValue('August 10, 2026 9:00 PM', {
      referenceDate,
      timeZone: 'CST',
    })).toMatchObject({
      iso: null,
      error: 'INVALID_TIME_ZONE',
      timeZoneEvidence: 'NONE',
    });
  });

  it('rejects invalid timezone fields even when the source includes an explicit offset', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: '2026-08-10T21:00:00-05:00',
      timeZone: 'CST',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-08-11T02:00:00.000Z',
      metadata: {
        timeZone: null,
        timeZoneEvidence: 'EXPLICIT_OFFSET',
        warnings: ['start:INVALID_TIME_ZONE'],
      },
    });
  });

  it('accepts multi-segment IANA timezone names', () => {
    expect(parseAffiliateDateTimeValue('August 10, 2026 9:00 PM', {
      referenceDate,
      timeZone: 'America/Indiana/Indianapolis',
    })).toMatchObject({
      iso: '2026-08-11T01:00:00.000Z',
      error: null,
      timeZoneEvidence: 'IANA_TIME_ZONE',
    });
  });

  it('parses same-month ranges joined with and', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'June 13 and 14, 2026',
      endsAt: 'June 13 and 14, 2026',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-06-13T07:00:00.000Z',
      endsAt: '2026-06-14T07:00:00.000Z',
      metadata: { warnings: [] },
    });
  });

  it('does not roll an ordinary past no-year date into the next year', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'July 25, 9:00 PM',
      timeZone: 'America/Los_Angeles',
      referenceDate: new Date('2026-08-06T12:00:00.000Z'),
    });

    expect(normalized.startsAt).toBe('2026-07-26T04:00:00.000Z');
  });

  it('rolls an overnight clock range into the next local day', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026 11:00 PM - 1:00 AM',
      endsAt: 'August 10, 2026 11:00 PM - 1:00 AM',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-08-11T06:00:00.000Z',
      endsAt: '2026-08-11T08:00:00.000Z',
      metadata: { warnings: [] },
    });
  });

  it('derives date-only display mode from date-only source evidence', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026',
      dateDisplayMode: 'SCHEDULED',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized.dateDisplayMode).toBe('DATE_ONLY');
  });

  it('keeps a source-provided clock visible despite an explicit DATE_ONLY mode', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026 9:30 PM',
      dateDisplayMode: 'DATE_ONLY',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      dateDisplayMode: 'SCHEDULED',
      metadata: {
        warnings: ['dateDisplayMode:DATE_ONLY_CONFLICTS_WITH_SOURCE_TIME'],
      },
    });
  });

  it('limits duration fallback for date-only and invalid explicit ends', () => {
    const dateOnlyMinutes = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026',
      durationText: '90 minutes',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });
    expect(dateOnlyMinutes).toMatchObject({
      endsAt: null,
      metadata: { endDerivation: 'NONE' },
    });

    const dateOnlyDays = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026',
      durationText: '1 day',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });
    expect(dateOnlyDays).toMatchObject({
      endsAt: '2026-08-11T07:00:00.000Z',
      metadata: { endDerivation: 'EXPLICIT_DURATION' },
    });

    const invalidExplicitEnd = normalizeAffiliateEventDateTime({
      startsAt: 'August 10, 2026 9:30 PM',
      endsAt: 'not a date',
      durationText: '90 minutes',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });
    expect(invalidExplicitEnd).toMatchObject({
      endsAt: null,
      metadata: {
        endDerivation: 'NONE',
        warnings: expect.arrayContaining(['end:INVALID_DATE']),
      },
    });
  });

  it('adds whole-day date-only durations as calendar days across DST', () => {
    const normalized = normalizeAffiliateEventDateTime({
      startsAt: 'March 8, 2026',
      durationText: '1 day',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });

    expect(normalized).toMatchObject({
      startsAt: '2026-03-08T08:00:00.000Z',
      endsAt: '2026-03-09T07:00:00.000Z',
      metadata: { endDerivation: 'EXPLICIT_DURATION' },
    });

    const storedDateOnly = normalizeAffiliateEventDateTime({
      startsAt: '2026-03-08T08:00:00.000Z',
      dateDisplayMode: 'DATE_ONLY',
      durationText: '1 day',
      timeZone: 'America/Los_Angeles',
      referenceDate,
    });
    expect(storedDateOnly.endsAt).toBe('2026-03-09T07:00:00.000Z');
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
