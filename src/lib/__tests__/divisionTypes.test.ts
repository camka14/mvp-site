import {
  getDivisionTypeOptionsForSport,
  inferDivisionDetails,
} from '@/lib/divisionTypes';

describe('divisionTypes age alignment', () => {
  it('adds adult age options for sports that use U-based age groups', () => {
    const uSystemSports = ['Soccer', 'Volleyball', 'Hockey', 'Softball', 'Basketball'];

    uSystemSports.forEach((sport) => {
      const ageNames = getDivisionTypeOptionsForSport(sport)
        .filter((option) => option.ratingType === 'AGE')
        .map((option) => option.name);

      expect(ageNames).toEqual(expect.arrayContaining(['18+', '30+', '40+']));
    });
  });

  it('uses U-prefix age labels consistently for U-based sports', () => {
    const volleyballAgeNames = getDivisionTypeOptionsForSport('Volleyball')
      .filter((option) => option.ratingType === 'AGE')
      .map((option) => option.name);
    const hockeyAgeNames = getDivisionTypeOptionsForSport('Hockey')
      .filter((option) => option.ratingType === 'AGE')
      .map((option) => option.name);

    expect(volleyballAgeNames).toContain('U12');
    expect(volleyballAgeNames).not.toContain('12U');
    expect(hockeyAgeNames).toContain('U8');
    expect(hockeyAgeNames).not.toContain('8U');
  });

  it('humanizes legacy trailing-U ids with U-prefix format', () => {
    const inferred = inferDivisionDetails({
      identifier: 'c_age_12u',
      sportInput: null,
    });

    expect(inferred.divisionTypeName).toBe('U12');
  });
});
