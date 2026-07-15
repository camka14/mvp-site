import {
  clubDivisionLinkScore,
  detectAgeEvidence,
  detectPriceEvidence,
  detectSoccerSkillEvidence,
  isAuditableHtmlContentType,
} from '@/server/clubDivisionSourceAudit';

describe('clubDivisionSourceAudit', () => {
  it('rejects binary documents before evidence extraction', () => {
    expect(isAuditableHtmlContentType('text/html; charset=utf-8')).toBe(true);
    expect(isAuditableHtmlContentType('application/xhtml+xml')).toBe(true);
    expect(isAuditableHtmlContentType('application/pdf')).toBe(false);
    expect(isAuditableHtmlContentType('image/png')).toBe(false);
  });

  it('maps explicit recreational and competitive soccer language to the approved club skills', () => {
    const evidence = detectSoccerSkillEvidence(
      'Our recreational program begins in fall. Competitive teams follow a year-round premier pathway.',
    );

    expect(new Set(evidence.map((row) => row.value))).toEqual(new Set(['rec', 'premier']));
  });

  it('does not infer a soccer skill from generic academy copy', () => {
    expect(detectSoccerSkillEvidence('Summer academy camp and technical training for all players.')).toEqual([]);
  });

  it('extracts source prices as cents with surrounding evidence', () => {
    const evidence = detectPriceEvidence('U10 registration is $1,250.00. Recreational registration costs $185.');

    expect(evidence.map((row) => row.amountCents)).toEqual([125000, 18500]);
    expect(evidence[0].snippet).toContain('U10 registration');
  });

  it('extracts youth age and grade ranges for manual review', () => {
    const evidence = detectAgeEvidence('Programs include U7-U10, 12U-14U, ages 15-18, and 3rd-8th Grade.');

    expect(evidence.map((row) => row.upperAgeId)).toEqual(expect.arrayContaining(['u10', 'u14', 'u18']));
    expect(evidence.find((row) => /3rd/i.test(row.value))?.upperAgeId).toBe('u14');
  });

  it('prioritizes fees and program structure links over news links', () => {
    expect(clubDivisionLinkScore('Club fees', '/fees')).toBeGreaterThan(
      clubDivisionLinkScore('Latest news', '/news'),
    );
  });
});
