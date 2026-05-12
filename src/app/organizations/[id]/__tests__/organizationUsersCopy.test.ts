import { buildOrganizationUsersSubtitle } from '../organizationUsersCopy';

describe('buildOrganizationUsersSubtitle', () => {
  it('uses the organization name in the customers tab subtitle', () => {
    expect(buildOrganizationUsersSubtitle('Sunset Volleyball Club')).toBe(
      'Participant users and registered teams from Sunset Volleyball Club events, plus hosts and staff from rental events using Sunset Volleyball Club fields.',
    );
  });

  it('falls back to a generic organization label when the name is missing', () => {
    expect(buildOrganizationUsersSubtitle('')).toBe(
      "Participant users and registered teams from this organization's events, plus hosts and staff from rental events using its fields.",
    );
  });
});
