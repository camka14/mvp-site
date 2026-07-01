import { resolveOrganizationEventCreationState } from '../organizationEventCreation';

describe('resolveOrganizationEventCreationState', () => {
  it('allows organization event creation for managers when no resources exist', () => {
    expect(
      resolveOrganizationEventCreationState({
        canManageEvents: true,
        organizationFieldCount: 0,
      }),
    ).toEqual({
      canCreateOrganizationEvents: true,
      createEventHelperText: null,
    });
  });

  it('blocks organization event creation when the viewer cannot manage events', () => {
    expect(
      resolveOrganizationEventCreationState({
        canManageEvents: false,
        organizationFieldCount: 3,
      }),
    ).toEqual({
      canCreateOrganizationEvents: false,
      createEventHelperText: null,
    });
  });
});
