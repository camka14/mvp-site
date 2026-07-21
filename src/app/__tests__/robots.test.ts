import robots from '../robots';

describe('robots', () => {
  it('points crawlers at the sitemap and disallows app-only surfaces', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(result.sitemap).toBe('https://bracket-iq.com/sitemap.xml');
    expect(rules).toMatchObject({
      userAgent: '*',
    });
    expect(rules?.allow).toEqual(
      expect.arrayContaining(['/api/files/', '/api/avatars/']),
    );
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(['/api/', '/admin', '/discover', '/login', '/out/']),
    );
  });
});
