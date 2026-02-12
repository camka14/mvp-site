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

  it('sends multipart form data for PDF template creation', async () => {
    apiRequestMock.mockResolvedValue({
      createUrl: 'https://app.boldsign.com/template/edit/tmpl_pdf',
      template: {
        $id: 'tmpl_pdf',
        organizationId: 'org_1',
        title: 'PDF Waiver',
        signOnce: true,
        type: 'PDF',
      },
    });

    const file = new File(['pdf-content'], 'waiver.pdf', { type: 'application/pdf' });

    await boldsignService.createTemplate({
      organizationId: 'org_1',
      userId: 'user_1',
      title: 'PDF Waiver',
      signOnce: true,
      type: 'PDF',
      file,
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
        timeoutMs: 60_000,
      }),
    );

    const options = apiRequestMock.mock.calls[0][1];
    const body = options?.body as FormData;
    expect(body.get('type')).toBe('PDF');
    expect(body.get('title')).toBe('PDF Waiver');
    expect(body.get('file')).toBe(file);
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

  it('fetches edit url for existing PDF templates', async () => {
    apiRequestMock.mockResolvedValue({
      editUrl: 'https://app.boldsign.com/template/edit/tmpl_pdf',
    });

    const editUrl = await boldsignService.getTemplateEditUrl({
      organizationId: 'org_1',
      templateDocumentId: 'tmpl_doc_1',
    });

    expect(editUrl).toBe('https://app.boldsign.com/template/edit/tmpl_pdf');
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates/tmpl_doc_1/edit-url',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });
});
