/** @jest-environment node */

import {
  deriveAffiliateHtmlArtifacts,
  evaluateAffiliateHtmlQuality,
} from '../affiliateHtmlArtifacts';

describe('affiliate HTML artifact derivation', () => {
  it('preserves repeated event cards, prices, links, and table values', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Summer programs</title>
          <meta name="description" content="Official summer leagues and clinics">
          <link rel="canonical" href="/programs">
        </head>
        <body>
          <nav>Home About Contact</nav>
          <main>
            <h1>Summer programs</h1>
            <article class="event-card">
              <h2>Girls U14 Tryouts</h2>
              <p>July 10, 2026 at 6:00 PM</p>
              <a href="/register/u14">Register</a>
            </article>
            <article class="event-card">
              <h2>Girls U16 Tryouts</h2>
              <p>July 11, 2026 at 7:00 PM</p>
              <a href="/register/u16">Register</a>
            </article>
            <table>
              <tr><th>Division</th><th>Price</th></tr>
              <tr><td>U14</td><td>$45</td></tr>
            </table>
          </main>
          <div class="cookie-banner">Accept cookies</div>
        </body>
      </html>
    `;
    const result = deriveAffiliateHtmlArtifacts(html, 'https://club.example.test/home');

    expect(result.markdown).toContain('Girls U14 Tryouts');
    expect(result.markdown).toContain('Girls U16 Tryouts');
    expect(result.markdown).toContain('$45');
    expect(result.markdown).not.toContain('Accept cookies');
    expect(result.links).toEqual([
      'https://club.example.test/register/u14',
      'https://club.example.test/register/u16',
    ]);
    expect(result.inferredCanonicalUrl).toBe('https://club.example.test/programs');
    expect(result.quality.accepted).toBe(true);
  });

  it('extracts official branding evidence from JSON-LD and page metadata', () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/social.png">
          <link rel="icon" href="/favicon.ico">
          <script type="application/ld+json">
            {"@type":"SportsOrganization","name":"Club","logo":"/official-logo.png"}
          </script>
        </head>
        <body>
          <main><h1>Club programs</h1><p>Competitive soccer programs and registration information for local players.</p></main>
        </body>
      </html>
    `;
    const result = deriveAffiliateHtmlArtifacts(html, 'https://club.example.test/');

    expect(result.branding.logo).toBe('https://club.example.test/official-logo.png');
    expect(result.branding.favicon).toBe('https://club.example.test/favicon.ico');
    expect(result.branding.ogImage).toBe('https://club.example.test/social.png');
    expect(result.branding.candidates[0]).toEqual({
      url: 'https://club.example.test/official-logo.png',
      reason: 'JSON-LD organization logo',
    });
  });

  it('rejects an empty JavaScript application shell', () => {
    const quality = evaluateAffiliateHtmlQuality(
      '<html><body><div id="root"></div><script src="/app.js"></script></body></html>',
      'https://app.example.test/events',
    );

    expect(quality.accepted).toBe(false);
    expect(quality.applicationShellSignals).toContain('empty-application-root');
  });

  it('rejects unsafe and non-HTTP extracted URLs', () => {
    const result = deriveAffiliateHtmlArtifacts(`
      <html><body><main>
        <h1>Programs</h1>
        <p>Official program details with enough useful public content for review and mapping.</p>
        <a href="javascript:alert(1)">Bad</a>
        <a href="http://127.0.0.1/private">Private</a>
        <a href="/events">Events</a>
      </main></body></html>
    `, 'https://club.example.test/');

    expect(result.links).toEqual(['https://club.example.test/events']);
  });

  it('falls back to cleaned body content when a page has an empty main shell', () => {
    const result = deriveAffiliateHtmlArtifacts(`
      <html><body>
        <main><div id="application-shell"></div></main>
        <section>
          <h1>2026 Youth Flag Football</h1>
          <p>Registration includes eight games, a jersey, and weekly practices for local players.</p>
          <a href="/registration">Register for $125</a>
        </section>
      </body></html>
    `, 'https://club.example.test/');

    expect(result.textContent).toContain('2026 Youth Flag Football');
    expect(result.markdown).toContain('Register for $125');
    expect(result.quality.meaningfulTextLength).toBe(result.textContent.length);
    expect(result.quality.accepted).toBe(true);
  });

  it('removes unsafe link targets and embedded placeholder images from Markdown', () => {
    const result = deriveAffiliateHtmlArtifacts(`
      <html><body><main>
        <h1>Club registration</h1>
        <p>Official registration details for the upcoming competitive season.</p>
        <a href="javascript:void(0)">Open menu</a>
        <img src="data:image/svg+xml,placeholder" alt="Placeholder">
      </main></body></html>
    `, 'https://club.example.test/');

    expect(result.markdown).toContain('Open menu');
    expect(result.markdown).not.toContain('javascript:');
    expect(result.markdown).not.toContain('data:image');
  });
});
