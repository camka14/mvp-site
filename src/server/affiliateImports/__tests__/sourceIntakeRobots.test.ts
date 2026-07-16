/** @jest-environment node */

import { evaluateRobotsPath } from '@/server/affiliateImports/sourceIntakeRobots';

describe('affiliate source intake robots evaluation', () => {
  it('allows paths without a matching disallow rule', () => {
    expect(evaluateRobotsPath('User-agent: *\nDisallow: /private', 'https://example.com/events')).toEqual({
      status: 'ALLOWED',
      matchedRule: null,
      userAgent: '*',
    });
  });

  it('uses the longest matching rule and prefers allow on ties', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /events',
      'Allow: /events/public',
      'Disallow: /events/public/private',
    ].join('\n');

    expect(evaluateRobotsPath(robots, 'https://example.com/events/public/list')).toEqual(expect.objectContaining({
      status: 'ALLOWED',
      matchedRule: 'allow: /events/public',
    }));
    expect(evaluateRobotsPath(robots, 'https://example.com/events/public/private/list')).toEqual(expect.objectContaining({
      status: 'DISALLOWED',
      matchedRule: 'disallow: /events/public/private',
    }));
  });

  it('honors the specific BracketIQ user-agent group instead of wildcard rules', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /',
      'User-agent: BracketIQ-Affiliate-Intake',
      'Allow: /events',
      'Disallow: /admin',
    ].join('\n');

    expect(evaluateRobotsPath(robots, 'https://example.com/events')).toEqual(expect.objectContaining({
      status: 'ALLOWED',
      userAgent: 'bracketiq-affiliate-intake',
    }));
  });

  it('supports wildcard and end-anchored rules', () => {
    const robots = 'User-agent: *\nDisallow: /*?preview=true$';
    expect(evaluateRobotsPath(robots, 'https://example.com/events?preview=true').status).toBe('DISALLOWED');
    expect(evaluateRobotsPath(robots, 'https://example.com/events?preview=true&public=1').status).toBe('ALLOWED');
  });
});
