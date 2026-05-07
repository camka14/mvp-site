import {
  cleanDivisionDisplayName,
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

    expect(inferred.divisionTypeName).toBe('CoEd Open U12');
  });

  it('derives clean labels from composite skill and age division ids', () => {
    const inferred = inferDivisionDetails({
      identifier: 'event_1__division__c_skill_open_age_18plus',
      sportInput: 'Volleyball',
    });

    expect(inferred.divisionTypeId).toBe('skill_open_age_18plus');
    expect(inferred.divisionTypeName).toBe('CoEd Open 18+');
    expect(inferred.defaultName).toBe('CoEd Open 18+');
  });

  it('ignores legacy metadata fallback labels for composite divisions', () => {
    const inferred = inferDivisionDetails({
      identifier: 'event_1__division__c_skill_bb_age_18plus',
      sportInput: 'Volleyball',
      fallbackName: 'CoEd Skill BB AGE 18plus',
    });

    expect(inferred.divisionTypeId).toBe('skill_bb_age_18plus');
    expect(inferred.divisionTypeName).toBe('CoEd BB 18+');
    expect(inferred.defaultName).toBe('CoEd BB 18+');
  });

  it('normalizes legacy composite separators to spaces', () => {
    expect(cleanDivisionDisplayName('Open / 18+', 'fallback')).toBe('Open 18+');
    expect(cleanDivisionDisplayName('Open • 18+', 'fallback')).toBe('Open 18+');
  });
});
