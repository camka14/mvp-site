/** @jest-environment node */

import {
  mergeAffiliateOrganizationSports,
  repairAffiliateSportLabel,
} from '../affiliateSportRepair';

const catalog = [
  'Australian Football',
  'Badminton',
  'Baseball',
  'Basketball',
  'Beach Soccer',
  'Beach Volleyball',
  'Field Hockey',
  'Flag Football',
  'Football',
  'Grass Soccer',
  'Hockey',
  'Indoor Soccer',
  'Indoor Volleyball',
  'Lacrosse',
  'Pickleball',
  'Softball',
  'Tennis',
];

describe('affiliate sport repair', () => {
  it.each([
    ['Baseball & Fastpitch Softball', ['Baseball', 'Softball']],
    ['Australian Rules Football', ['Australian Football']],
    ['American Football', ['Football']],
    ['Ice Hockey', ['Hockey']],
  ])('maps %s to current canonical sports', (source, expected) => {
    expect(repairAffiliateSportLabel(source, catalog)).toEqual(expect.objectContaining({
      canRepair: true,
      canonicalSportNames: expected,
    }));
  });

  it.each(['Soccer', 'Volleyball'])('leaves generic %s unresolved without guessing a surface', (source) => {
    expect(repairAffiliateSportLabel(source, [...catalog, 'Soccer', 'Volleyball'])).toEqual(expect.objectContaining({
      canRepair: false,
      canonicalSportNames: [],
    }));
  });

  it('splits a composite label while excluding blacklisted sports', () => {
    expect(repairAffiliateSportLabel(
      'Baseball, Softball, Soccer, Lacrosse, Field Hockey, Cheerleading, and Badminton',
      catalog,
    )).toEqual(expect.objectContaining({
      canRepair: true,
      canonicalSportNames: ['Baseball', 'Softball', 'Lacrosse', 'Field Hockey', 'Badminton'],
      excludedBlacklistedSportNames: ['Cheerleading'],
    }));
  });

  it('does not turn a vague other-sports phrase into the Other catalog row', () => {
    expect(repairAffiliateSportLabel('Baseball, Softball, and other field sports', catalog)).toEqual(expect.objectContaining({
      canRepair: true,
      canonicalSportNames: ['Baseball', 'Softball'],
    }));
  });

  it.each(['Multi-sport', 'Field sports', 'Padel', 'Cheerleading and Dance'])('leaves %s unresolved', (source) => {
    expect(repairAffiliateSportLabel(source, catalog)).toEqual(expect.objectContaining({
      canRepair: false,
      canonicalSportNames: [],
    }));
  });

  it('merges repaired sports with the organization catalog without losing valid sports', () => {
    expect(mergeAffiliateOrganizationSports(
      ['Tennis', 'Legacy Sport', 'Basketball'],
      ['Indoor Volleyball', 'Tennis'],
      catalog,
    )).toEqual(['Tennis', 'Basketball', 'Indoor Volleyball']);
  });
});
