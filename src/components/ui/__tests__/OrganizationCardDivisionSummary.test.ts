import { formatOrganizationDivisionSummary } from '../OrganizationCard';

describe('formatOrganizationDivisionSummary', () => {
  it('formats a division count and price range', () => {
    expect(formatOrganizationDivisionSummary({
      $id: 'org_1',
      name: 'Summit Soccer Club',
      divisionSummary: { count: 4, minPrice: 12500, maxPrice: 17500 },
    })).toBe('4 divisions · $125–$175');
  });

  it('keeps unspecified division prices distinct from free divisions', () => {
    expect(formatOrganizationDivisionSummary({
      $id: 'org_1',
      name: 'Summit Soccer Club',
      divisionSummary: { count: 2, minPrice: null, maxPrice: null },
    })).toBe('2 divisions · Price not specified');
  });
});
