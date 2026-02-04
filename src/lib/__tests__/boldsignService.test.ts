import { boldsignService } from '@/lib/boldsignService';
import { apiRequest } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('boldsignService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('includes type and content when creating TEXT templates', async () => {
    apiRequestMock.mockResolvedValue({
      template: {
        $id: 'tmpl_text',
        organizationId: 'org_1',
        title: 'Text Waiver',
        signOnce: true,
        type: 'TEXT',
        content: 'Sample waiver text',
      },
    });

    await boldsignService.createTemplate({
      organizationId: 'org_1',
      userId: 'user_1',
      title: 'Text Waiver',
      signOnce: true,
      type: 'TEXT',
      content: 'Sample waiver text',
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          userId: 'user_1',
          template: expect.objectContaining({
            type: 'TEXT',
            content: 'Sample waiver text',
          }),
        }),
      }),
    );
  });
});
