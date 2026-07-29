/** @jest-environment node */

import {
  emailMatchesOrganizationDomain,
  organizationDomainPolicyForUrl,
} from '@/server/organizationClaims/domainPolicy';

describe('organization domain policy', () => {
  it('canonicalizes a direct organization website and enables automatic proof methods', () => {
    expect(organizationDomainPolicyForUrl('  www.RiverCitySports.org/programs/?utm_source=test#top  ')).toEqual({
      canonicalUrl: 'https://rivercitysports.org/programs',
      host: 'rivercitysports.org',
      registrableDomain: 'rivercitysports.org',
      isSharedPlatform: false,
      automaticMethods: ['DOMAIN_EMAIL', 'DNS_TXT', 'HTML_META'],
    });
  });

  it('matches work email subdomains by registrable domain', () => {
    const policy = organizationDomainPolicyForUrl('https://registration.club.example.co.uk');

    expect(policy.registrableDomain).toBe('example.co.uk');
    expect(emailMatchesOrganizationDomain('director@example.co.uk', policy)).toBe(true);
    expect(emailMatchesOrganizationDomain('coach@mail.example.co.uk', policy)).toBe(true);
    expect(emailMatchesOrganizationDomain('coach@example.co.uk.attacker.test', policy)).toBe(false);
    expect(emailMatchesOrganizationDomain('coach@other.co.uk', policy)).toBe(false);
  });

  it('normalizes Unicode domains to their ASCII representation', () => {
    const policy = organizationDomainPolicyForUrl('https://www.münchen-sport.de');

    expect(policy.host).toBe('xn--mnchen-sport-dlb.de');
    expect(policy.registrableDomain).toBe('xn--mnchen-sport-dlb.de');
    expect(emailMatchesOrganizationDomain('coach@münchen-sport.de', policy)).toBe(true);
  });

  it.each([
    'https://river-city.leagueapps.com',
    'https://clubs.bluesombrero.com/river-city',
    'https://rivercity.sportsengine.com',
    'https://www.eventbrite.com/o/river-city-sports-123',
    'https://www.facebook.com/rivercitysports',
    'https://app.upperhand.io/customers/river-city-sports',
    'https://gmail.com',
  ])('requires manual review for shared or intermediary platform %s', (url) => {
    const policy = organizationDomainPolicyForUrl(url);

    expect(policy.isSharedPlatform).toBe(true);
    expect(policy.automaticMethods).toEqual([]);
    expect(emailMatchesOrganizationDomain(`owner@${policy.registrableDomain}`, policy)).toBe(false);
  });

  it('rejects generic email providers even if passed through a direct policy object', () => {
    const policy = {
      ...organizationDomainPolicyForUrl('https://rivercitysports.org'),
      registrableDomain: 'gmail.com',
    };

    expect(emailMatchesOrganizationDomain('owner@gmail.com', policy)).toBe(false);
  });

  it.each([
    ['ftp://rivercitysports.org', 'must use http or https'],
    ['https://user:secret@rivercitysports.org', 'must not contain credentials'],
    ['https://rivercitysports.org:8443', 'must use port 80 or 443'],
    ['http://localhost:3000', 'must use a public hostname'],
    ['http://127.0.0.1', 'must use a public hostname'],
    ['https://intranet', 'must use a registrable public domain'],
  ])('rejects an ineligible website URL: %s', (url, message) => {
    expect(() => organizationDomainPolicyForUrl(url)).toThrow(message);
  });

  it.each([
    '',
    'coach',
    '@rivercitysports.org',
    'coach@',
    'coach@@rivercitysports.org',
    'coach@gmail.com',
  ])('rejects ineligible work email %s', (email) => {
    const policy = organizationDomainPolicyForUrl('https://rivercitysports.org');
    expect(emailMatchesOrganizationDomain(email, policy)).toBe(false);
  });
});
