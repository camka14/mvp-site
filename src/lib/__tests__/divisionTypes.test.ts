import {
  cleanDivisionDisplayName,
  getDivisionTypeOptionsForSport,
  getGlobalAgeDivisionTypeOptions,
  getSkillDivisionTypeOptionsForSport,
  getSportAgeCutoffRule,
  inferDivisionDetails,
  normalizeDivisionTypeIds,
} from '@/lib/divisionTypes';

describe('divisionTypes age alignment', () => {
  it('adds adult age options for sports that use U-based age groups', () => {
    const uSystemSports = ['Soccer', 'Volleyball', 'Hockey', 'Softball', 'Basketball'];

    uSystemSports.forEach((sport) => {
      const ageNames = getDivisionTypeOptionsForSport(sport)
        .filter((option) => option.ratingType === 'AGE')
        .map((option) => option.name);

      expect(ageNames).toEqual(expect.arrayContaining([
        '14+',
        '15+',
        '16+',
        '17+',
        '18+',
        '25+',
        '35+',
        '45+',
      ]));
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

  it('keeps ordinal team labels out of the strict volleyball skill catalog', () => {
    expect(getSkillDivisionTypeOptionsForSport('Indoor Volleyball').map((option) => option.id)).not.toEqual(
      expect.arrayContaining(['first_team', 'second_team', 'third_team', 'fourth_team', 'fifth_team']),
    );
  });

  it('supports team tiers published by volleyball clubs', () => {
    expect(getSkillDivisionTypeOptionsForSport('Indoor Volleyball').map((option) => option.id)).toEqual(
      expect.arrayContaining(['competitive', 'premier', 'local', 'national', 'regional', 'gold', 'elite', 'select', 'developmental']),
    );
  });

  it('supports a strict open fallback for general hockey programs', () => {
    expect(getSkillDivisionTypeOptionsForSport('Hockey')).toContainEqual({ id: 'open', name: 'Open' });
  });

  it('exposes sport-specific youth ages through the shared filter catalog', () => {
    const globalAgeIds = getGlobalAgeDivisionTypeOptions().map((option) => option.id);

    expect(globalAgeIds).toEqual(expect.arrayContaining(['u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u20']));
    expect(new Set(globalAgeIds).size).toBe(globalAgeIds.length);
  });

  it('uses ultimate frisbee division and cutoff defaults', () => {
    const options = getDivisionTypeOptionsForSport('Ultimate Frisbee');
    const ageNames = options
      .filter((option) => option.ratingType === 'AGE')
      .map((option) => option.name);
    const skillNames = options
      .filter((option) => option.ratingType === 'SKILL')
      .map((option) => option.name);

    expect(ageNames).toEqual(expect.arrayContaining(['U14', 'U17', 'U20', '33+', '55+']));
    expect(skillNames).toEqual(expect.arrayContaining(['Recreational', 'Club', 'Masters', 'Open']));
    expect(getSportAgeCutoffRule('Ultimate Frisbee')).toEqual(expect.objectContaining({
      sportKey: 'ultimate',
      label: 'June 1',
    }));
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

  it('normalizes explicit and legacy division type ids into persisted age and skill ids', () => {
    expect(normalizeDivisionTypeIds({
      divisionTypeId: 'skill_competitive_age_u14',
    })).toEqual({
      divisionTypeId: 'skill_competitive_age_u14',
      skillDivisionTypeId: 'competitive',
      ageDivisionTypeId: 'u14',
    });

    expect(normalizeDivisionTypeIds({
      divisionTypeId: 'u12',
      ratingType: 'AGE',
      skillDivisionTypeId: 'rec',
    })).toEqual({
      divisionTypeId: 'skill_rec_age_u12',
      skillDivisionTypeId: 'rec',
      ageDivisionTypeId: 'u12',
    });
  });
});
