type BuildOrganizationEventCreateUrlParams = {
  eventId: string;
  organizationId?: string | null;
  templateId?: string | null;
  skipTemplatePrompt?: boolean;
};

export const buildOrganizationEventCreateUrl = (
  params: BuildOrganizationEventCreateUrlParams,
): string => {
  const eventId = params.eventId.trim();
  const organizationId = params.organizationId?.trim() ?? '';
  const templateId = params.templateId?.trim() ?? '';
  const query = new URLSearchParams({
    create: '1',
    mode: 'edit',
    tab: 'details',
  });

  if (organizationId.length > 0) {
    query.set('orgId', organizationId);
    query.set('hostOrgId', organizationId);
  }

  if (templateId.length > 0) {
    query.set('templateId', templateId);
  }

  if (params.skipTemplatePrompt) {
    query.set('skipTemplatePrompt', '1');
  }

  return `/events/${eventId}/schedule?${query.toString()}`;
};
