import { boldsignService } from '@/lib/boldsignService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';
import { ExecutionMethod } from 'appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

describe('boldsignService', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID = 'server-fn';
    jest.clearAllMocks();
  });

  it('defaults template type to PDF when missing', async () => {
    appwriteModuleMock.functions.createExecution.mockResolvedValue({
      responseBody: JSON.stringify({
        templates: [
          {
            $id: 'tmpl_1',
            organizationId: 'org_1',
            title: 'Waiver',
            signOnce: true,
          },
        ],
      }),
    });

    const templates = await boldsignService.listTemplates('org_1', 'user_1');

    expect(templates).toHaveLength(1);
    expect(templates[0].type).toBe('PDF');
  });

  it('includes type and content when creating TEXT templates', async () => {
    appwriteModuleMock.functions.createExecution.mockResolvedValue({
      responseBody: JSON.stringify({
        template: {
          $id: 'tmpl_text',
          organizationId: 'org_1',
          title: 'Text Waiver',
          signOnce: true,
          type: 'TEXT',
          content: 'Sample waiver text',
        },
      }),
    });

    await boldsignService.createTemplate({
      organizationId: 'org_1',
      userId: 'user_1',
      title: 'Text Waiver',
      signOnce: true,
      type: 'TEXT',
      content: 'Sample waiver text',
    });

    expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        method: ExecutionMethod.POST,
        xpath: '/organizations/org_1/templates',
      }),
    );

    const body = JSON.parse(
      appwriteModuleMock.functions.createExecution.mock.calls[0][0].body,
    );
    expect(body.template).toMatchObject({
      type: 'TEXT',
      content: 'Sample waiver text',
    });
  });
});
