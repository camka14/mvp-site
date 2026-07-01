type OrganizationEventCreationState = {
  canCreateOrganizationEvents: boolean;
  createEventHelperText: string | null;
};

type OrganizationEventCreationParams = {
  canManageEvents: boolean;
  organizationFieldCount: number;
};

export const resolveOrganizationEventCreationState = (
  params: OrganizationEventCreationParams,
): OrganizationEventCreationState => ({
  canCreateOrganizationEvents: params.canManageEvents,
  createEventHelperText: null,
});
