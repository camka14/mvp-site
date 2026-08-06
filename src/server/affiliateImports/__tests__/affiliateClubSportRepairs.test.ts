import {
  AFFILIATE_CLUB_SPORT_REPAIRS,
  affiliateClubSportRepairEntries,
} from '../affiliateClubSportRepairs';

const canonicalSports = new Set([
  'Australian Football',
  'Baseball',
  'Basketball',
  'Beach Volleyball',
  'Flag Football',
  'Field Hockey',
  'Football',
  'Futsal',
  'Grass Soccer',
  'Grass Volleyball',
  'Hockey',
  'Indoor Soccer',
  'Indoor Volleyball',
  'Lacrosse',
  'Pickleball',
  'Racquetball',
  'Softball',
  'Table Tennis',
  'Tennis',
  'Ultimate Frisbee',
]);

describe('affiliate club sport repairs', () => {
  it('contains only current canonical sports', () => {
    affiliateClubSportRepairEntries().forEach(([, repair]) => {
      expect(repair.sports.length).toBeGreaterThan(0);
      repair.sports.forEach((sport) => expect(canonicalSports.has(sport)).toBe(true));
    });
  });

  it('splits a composite club label into multiple canonical sports', () => {
    expect(AFFILIATE_CLUB_SPORT_REPAIRS['fe225d92-0d59-4085-8da7-1cb8b91af083'].sports).toEqual([
      'Basketball',
      'Baseball',
      'Football',
      'Grass Soccer',
      'Indoor Volleyball',
    ]);
  });

  it('does not reintroduce blacklisted sports', () => {
    const blacklisted = new Set(['Cheerleading', 'Dance', 'Running', 'Swimming', 'Track and Field', 'Golf']);
    affiliateClubSportRepairEntries().forEach(([, repair]) => {
      repair.sports.forEach((sport) => expect(blacklisted.has(sport)).toBe(false));
    });
  });
});
