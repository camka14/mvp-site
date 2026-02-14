/** @jest-environment node */

import {
  createEmbeddedTemplateFromPdf,
  getEmbeddedSignLink,
  getEmbeddedTemplateEditUrl,
  getTemplateRoles,
  sendDocumentFromTemplate,
} from '@/lib/boldsignServer';

describe('boldsignServer', () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      BOLDSIGN_API_KEY: 'test-boldsign-key',
      BOLDSIGN_API_BASE_URL: 'https://api.boldsign.com',
    };
    (global as any).fetch = fetchMock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates embedded template url from uploaded pdf bytes', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          templateId: 'tmpl_123',
          createUrl: 'https://app.boldsign.com/template/edit/tmpl_123',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await createEmbeddedTemplateFromPdf({
      fileBytes: Buffer.from('test-pdf-content'),
      title: 'League Waiver',
    });

    expect(result.templateId).toBe('tmpl_123');
    expect(result.createUrl).toContain('/template/edit/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1/template/createEmbeddedTemplateUrl');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ 'X-API-KEY': 'test-boldsign-key' }),
    );
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload.Files[0]).toMatch(/^data:application\/pdf;base64,/);
    expect(payload.Roles).toEqual([{ Name: 'Participant', Index: 1 }]);
  });

  it('creates embedded template url with multiple preset roles', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          templateId: 'tmpl_multi',
          createUrl: 'https://app.boldsign.com/template/edit/tmpl_multi',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await createEmbeddedTemplateFromPdf({
      fileBytes: Buffer.from('test-pdf-content'),
      title: 'Child Consent',
      roles: [
        { signerRole: 'Parent/Guardian', signerContext: 'parent_guardian' },
        { signerRole: 'Child', signerContext: 'child' },
      ],
    });

    expect(result.roles).toEqual([
      expect.objectContaining({ roleIndex: 1, signerRole: 'Parent/Guardian' }),
      expect.objectContaining({ roleIndex: 2, signerRole: 'Child' }),
    ]);
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload.Roles).toEqual([
      { Name: 'Parent/Guardian', Index: 1 },
      { Name: 'Child', Index: 2 },
    ]);
  });

  it('falls back to default role when template properties response has no roles', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ roles: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const roles = await getTemplateRoles('tmpl_123');
    expect(roles).toEqual([{ roleIndex: 1, signerRole: 'Participant', signerContext: 'participant' }]);
  });

  it('creates a document from template and fetches embedded sign link', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ documentId: 'doc_789' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ signLink: 'https://app.boldsign.com/sign/doc_789' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const sent = await sendDocumentFromTemplate({
      templateId: 'tmpl_123',
      signerEmail: 'player@example.com',
      signerName: 'Player One',
      roleIndex: 1,
    });
    const link = await getEmbeddedSignLink({
      documentId: sent.documentId,
      signerEmail: 'player@example.com',
      redirectUrl: 'https://localhost:3000/discover',
    });

    expect(sent.documentId).toBe('doc_789');
    expect(link.signLink).toContain('/sign/doc_789');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches embedded template edit url', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ editUrl: 'https://app.boldsign.com/template/edit/tmpl_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await getEmbeddedTemplateEditUrl({
      templateId: 'tmpl_123',
    });

    expect(result.editUrl).toContain('/template/edit/tmpl_123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1/template/getEmbeddedTemplateEditUrl');
  });
});
