import { buildOrganizationUsersSubtitle } from '../organizationUsersCopy';

describe('buildOrganizationUsersSubtitle', () => {
  it('uses the organization name in the users tab subtitle', () => {
    expect(buildOrganizationUsersSubtitle('Sunset Volleyball Club')).toBe(
      'Members from Sunset Volleyball Club events, plus hosts and staff from rental events using Sunset Volleyball Club fields.',
    );
  });

  it('falls back to a generic organization label when the name is missing', () => {
    expect(buildOrganizationUsersSubtitle('')).toBe(
      "Members from this organization's events, plus hosts and staff from rental events using its fields.",
    );
  });
});
