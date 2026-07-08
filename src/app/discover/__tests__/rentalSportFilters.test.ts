import {
  organizationMatchesSports,
  rentalResourceMatchesSports,
} from '@/app/discover/rentalSportFilters';
import type { Field, Organization } from '@/types';

const buildOrganization = (sports: string[] = []): Organization => ({
  $id: 'org_1',
  name: 'River City Sports Club',
  sports,
});

const buildField = (sportIds?: string[]): Field => ({
  $id: 'field_1',
  name: 'Court 1',
  location: '',
  lat: 0,
  long: 0,
  sportIds,
});

describe('rental sport filters', () => {
  it('matches organizations by configured sports', () => {
    expect(organizationMatchesSports(buildOrganization(['Basketball']), ['basketball'])).toBe(true);
    expect(organizationMatchesSports(buildOrganization(['Basketball']), ['Pickleball'])).toBe(false);
  });

  it('prefers resource sports for rental resource filtering', () => {
    const organization = buildOrganization(['Basketball']);
    const field = buildField(['Pickleball']);

    expect(rentalResourceMatchesSports({ organization, field }, ['Pickleball'])).toBe(true);
    expect(rentalResourceMatchesSports({ organization, field }, ['Basketball'])).toBe(false);
  });

  it('falls back to organization sports when a resource has no sports', () => {
    const organization = buildOrganization(['Indoor Soccer']);
    const field = buildField([]);

    expect(rentalResourceMatchesSports({ organization, field }, ['Indoor Soccer'])).toBe(true);
  });
});
