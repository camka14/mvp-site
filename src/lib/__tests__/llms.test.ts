/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  acceptsMarkdown,
  isPublicMarkdownPath,
  markdownCompanionSourcePath,
} from '@/lib/llmsRouting';
import { buildLlmsTxt } from '@/lib/llms';
import {
  htmlToMarkdown,
  renderOrganizationCatalogMarkdown,
} from '@/server/llmsPage';

describe('LLM-readable site contract', () => {
  it('builds a spec-shaped central manifest with navigation and the affiliate restriction', () => {
    const manifest = buildLlmsTxt();

    expect(manifest).toMatch(/^# BracketIQ\n\n> /);
    expect(manifest).toContain('## Core navigation');
    expect(manifest).toContain('## Product guides');
    expect(manifest).toContain('Sharing those third-party links directly is prohibited');
    expect(manifest).toContain('/event/{eventId}');
    expect(manifest).toContain('/o/{organizationSlug}/events/{eventId}');
    expect(manifest).toContain('teamDivisionTypeIds');
    expect(manifest).toContain('Accept: text/markdown');
    expect(manifest).toContain('https://bracket-iq.com/discover.md');
  });

  it('maps supported companion forms and allows only public source paths', () => {
    expect(markdownCompanionSourcePath('/index.html.md')).toBe('/');
    expect(markdownCompanionSourcePath('/guides/index.html.md')).toBe('/guides');
    expect(markdownCompanionSourcePath('/event/event_1.md')).toBe('/event/event_1');
    expect(markdownCompanionSourcePath('/terms')).toBeNull();

    expect(isPublicMarkdownPath('/event/event_1')).toBe(true);
    expect(isPublicMarkdownPath('/o/river-city/events/event_1')).toBe(true);
    expect(isPublicMarkdownPath('/o/river-city/teams/team_1')).toBe(true);
    expect(isPublicMarkdownPath('/o/river-city/products/product_1')).toBe(true);
    expect(isPublicMarkdownPath('/o/river-city/rentals')).toBe(true);
    expect(isPublicMarkdownPath('/o/river-city/complete')).toBe(false);
    expect(isPublicMarkdownPath('/admin')).toBe(false);
    expect(isPublicMarkdownPath('/profile')).toBe(false);
    expect(isPublicMarkdownPath('/api/events/event_1')).toBe(false);
    expect(acceptsMarkdown('text/html, text/markdown;q=1')).toBe(true);
    expect(acceptsMarkdown('text/html')).toBe(false);
  });

  it('converts semantic HTML while suppressing external destinations when requested', () => {
    const markdown = htmlToMarkdown(`
      <html><head><title>Ignored chrome</title></head><body>
        <nav><a href="/login">Sign in</a></nav>
        <main>
          <h1>Summer Tournament</h1>
          <p>Hosted on <strong>BracketIQ</strong>.</p>
          <ul><li><a href="/event/event_1">Event details</a></li></ul>
          <a href="https://affiliate.example/register">External registration</a>
        </main>
      </body></html>
    `, new URL('https://bracket-iq.com/event/event_1'), { allowExternalLinks: false });

    expect(markdown).toContain('# Summer Tournament');
    expect(markdown).toContain('[Event details](https://bracket-iq.com/event/event_1)');
    expect(markdown).toContain('External registration');
    expect(markdown).not.toContain('affiliate.example');
    expect(markdown).not.toContain('Sign in');
  });

  it('omits affiliate and organization websites from organization Markdown', () => {
    const markdown = renderOrganizationCatalogMarkdown({
      organization: {
        id: 'org_1',
        slug: 'river-city',
        name: 'River City Sports Club',
        description: 'Local sports club.',
        location: 'Portland, OR',
        website: 'https://affiliate.example/club',
        logoUrl: '/logo.png',
        sports: ['Soccer'],
        brandPrimaryColor: '#000000',
        brandAccentColor: '#ffffff',
        publicHeadline: 'River City',
        publicIntroText: 'Find River City programs at https://affiliate.example/club.',
        publicPageEnabled: true,
        publicWidgetsEnabled: true,
        publicCompletionRedirectUrl: null,
      },
      events: [],
      eventPageInfo: { limit: 24, page: 1, offset: 0, hasPrevious: false, hasNext: false },
      teams: [{
        id: 'team_1',
        name: 'Riverside FC',
        sport: 'Soccer',
        division: 'U18',
        imageUrl: '/team.png',
        currentSize: 10,
        teamSize: 14,
        isFull: false,
        openRegistration: true,
        joinPolicy: 'OPEN_REGISTRATION',
        registrationPriceCents: 0,
        affiliateUrl: 'https://affiliate.example/team',
        requiredTemplateIds: [],
        registrationUrl: 'https://affiliate.example/team',
      }],
      rentals: [],
      products: [],
    });

    expect(markdown).toContain('https://bracket-iq.com/o/river-city');
    expect(markdown).toContain('destination is intentionally omitted');
    expect(markdown).not.toContain('affiliate.example');
    expect(markdown).toContain('[third-party destination omitted]');
  });
});
