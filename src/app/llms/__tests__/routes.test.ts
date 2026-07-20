/** @jest-environment node */

const renderPublicPageMarkdownMock = jest.fn();

jest.mock('@/server/llmsPage', () => ({
  renderPublicPageMarkdown: renderPublicPageMarkdownMock,
}));

import { GET as getManifest } from '@/app/llms.txt/route';
import { GET as getMarkdownPage } from '@/app/llms/page/route';

describe('LLM route handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves the central manifest as plain text', async () => {
    const response = getManifest();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    await expect(response.text()).resolves.toMatch(/^# BracketIQ\n\n> /);
  });

  it('serves a public page as Markdown', async () => {
    renderPublicPageMarkdownMock.mockResolvedValue('# Terms\n\nPolicy text.');

    const response = await getMarkdownPage(new Request(
      'https://bracket-iq.com/llms/page?path=%2Fterms',
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(renderPublicPageMarkdownMock).toHaveBeenCalledWith(new URL('https://bracket-iq.com/terms'));
    await expect(response.text()).resolves.toBe('# Terms\n\nPolicy text.\n');
  });

  it('uses the source path forwarded by a public companion rewrite', async () => {
    renderPublicPageMarkdownMock.mockResolvedValue('# Discover BracketIQ');

    const response = await getMarkdownPage(new Request(
      'https://bracket-iq.com/discover.md?tab=events&sport=Soccer',
      {
        headers: {
          'x-bracketiq-markdown-path': '/discover?tab=events&sport=Soccer',
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(renderPublicPageMarkdownMock).toHaveBeenCalledWith(
      new URL('https://bracket-iq.com/discover?tab=events&sport=Soccer'),
    );
  });

  it('rejects private and cross-origin source paths', async () => {
    const privateResponse = await getMarkdownPage(new Request(
      'https://bracket-iq.com/llms/page?path=%2Fadmin',
    ));
    const crossOriginResponse = await getMarkdownPage(new Request(
      'https://bracket-iq.com/llms/page?path=%2F%2Fevil.example%2Fterms',
    ));

    expect(privateResponse.status).toBe(404);
    expect(crossOriginResponse.status).toBe(404);
    expect(renderPublicPageMarkdownMock).not.toHaveBeenCalled();
  });
});
