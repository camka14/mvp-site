import { buildDivisionDiscoveryWhere } from '@/server/divisionDiscovery';

describe('buildDivisionDiscoveryWhere', () => {
  it('places every event division filter on one Prisma division predicate', () => {
    expect(buildDivisionDiscoveryWhere({
      scope: 'EVENT',
      sports: ['soccer'],
      genders: ['F'],
      skillDivisionTypeIds: ['competitive'],
      ageDivisionTypeIds: ['u14'],
      priceMin: 2500,
      priceMax: 8000,
    })).toEqual(expect.objectContaining({
      scope: 'EVENT',
      status: 'ACTIVE',
      eventId: { not: null },
      sportId: { in: ['soccer'] },
      gender: { in: ['F'] },
      skillDivisionTypeId: { in: ['competitive'] },
      ageDivisionTypeId: { in: ['u14'] },
      price: { gte: 2500, lte: 8000 },
    }));
  });

  it('returns null when no division filter is active', () => {
    expect(buildDivisionDiscoveryWhere({ scope: 'ORGANIZATION' })).toBeNull();
  });
});
