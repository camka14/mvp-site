import { buildOrganizationEventCreateUrl } from '@/lib/eventCreateNavigation';

describe('buildOrganizationEventCreateUrl', () => {
  it('builds a create-event URL with organization context', () => {
    const result = buildOrganizationEventCreateUrl({
      eventId: 'event_1',
      organizationId: 'org_1',
    });

    expect(result).toBe(
      '/events/event_1/schedule?create=1&mode=edit&tab=details&orgId=org_1&hostOrgId=org_1',
    );
  });

  it('adds template and prompt flags when requested', () => {
    const result = buildOrganizationEventCreateUrl({
      eventId: 'event_2',
      organizationId: 'org_2',
      templateId: 'template_9',
      skipTemplatePrompt: true,
    });

    expect(result).toBe(
      '/events/event_2/schedule?create=1&mode=edit&tab=details&orgId=org_2&hostOrgId=org_2&templateId=template_9&skipTemplatePrompt=1',
    );
  });
});
