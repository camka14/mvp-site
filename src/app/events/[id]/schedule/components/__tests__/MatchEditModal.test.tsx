import { actualMatchTimePayload } from '../MatchEditModal';

describe('actualMatchTimePayload', () => {
  it('maps actual match times to API-safe strings', () => {
    expect(actualMatchTimePayload(
      new Date('2026-04-19T10:05:00.000Z'),
      new Date('2026-04-19T10:55:00.000Z'),
    )).toEqual({
      actualStart: '2026-04-19T10:05:00.000Z',
      actualEnd: '2026-04-19T10:55:00.000Z',
    });
  });

  it('keeps cleared actual match times as null', () => {
    expect(actualMatchTimePayload(null, null)).toEqual({
      actualStart: null,
      actualEnd: null,
    });
  });
});
