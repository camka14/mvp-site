import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { parse as parseDomain } from 'tldts';

export const SHARED_TENANT_HOSTS: ReadonlySet<string> = new Set([
  'leagueapps.com',
  'sportsengine.com',
  'sportsengineprelive.com',
  'teamsnapsites.com',
  'bluesombrero.com',
  'quickscores.com',
  'facilitron.com',
]);

export const SOCIAL_HOSTS: ReadonlySet<string> = new Set([
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  'pinterest.com',
]);

export const INTERMEDIARY_HOSTS: ReadonlySet<string> = new Set([
  'active.com',
  'baseballconnected.com',
  'causeiq.com',
  'eventbrite.com',
  'exposureevents.com',
  'fieldlevel.com',
  'giggster.com',
  'goodrun.app',
  'gotsoccer.com',
  'imleagues.com',
  'meetup.com',
  'mytennislessons.com',
  'myguidechicago.com',
  'peerspace.com',
  'pickleballtournaments.com',
  'playpass.com',
  'playnsports.com',
  'reddit.com',
  'softballconnected.com',
  'teachme.to',
  'teamgenius.com',
  'tenniscircuits.com',
  'ticketmaster.com',
  'tapatalk.com',
  'ussportscamps.com',
  'usetopscore.com',
  'utrsports.net',
  'wikipedia.org',
  'yelp.com',
]);

export const CLAIM_VERIFICATION_SHARED_HOSTS: ReadonlySet<string> = new Set([
  'activecommunities.com',
  'clubautomation.com',
  'courtreserve.com',
  'daxko.com',
  'dbathub.com',
  'jotform.com',
  'playbypoint.com',
  'rentmycampus.com',
  'secure-booker.com',
  'smartsheet.com',
  'sportngin.com',
  'teamlinkt.com',
  'tripleseat.com',
  'upperhand.io',
  'vagaro.com',
  'volleyballlife.com',
]);

export const SEARCH_HOSTS: ReadonlySet<string> = new Set([
  'google.com',
  'bing.com',
  'duckduckgo.com',
  'search.yahoo.com',
]);

export const NON_SOURCE_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'edgar-online.com',
  'sec.gov',
]);

export const GENERIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
]);

const AUTOMATIC_METHODS = ['DOMAIN_EMAIL', 'DNS_TXT', 'HTML_META'] as const;

export type OrganizationDomainPolicy = {
  canonicalUrl: string;
  host: string;
  registrableDomain: string;
  isSharedPlatform: boolean;
  automaticMethods: Array<(typeof AUTOMATIC_METHODS)[number]>;
};

const normalizedHost = (value: string): string => (
  domainToASCII(value.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, ''))
);

export const hostMatchesOrganizationPlatform = (
  host: string,
  candidates: ReadonlySet<string>,
): boolean => {
  const normalized = normalizedHost(host);
  return candidates.has(normalized)
    || Array.from(candidates).some((domain) => normalized.endsWith(`.${domain}`));
};

const isSharedOrganizationPlatform = (host: string): boolean => (
  hostMatchesOrganizationPlatform(host, SHARED_TENANT_HOSTS)
  || hostMatchesOrganizationPlatform(host, SOCIAL_HOSTS)
  || hostMatchesOrganizationPlatform(host, INTERMEDIARY_HOSTS)
  || hostMatchesOrganizationPlatform(host, SEARCH_HOSTS)
  || hostMatchesOrganizationPlatform(host, NON_SOURCE_HOSTS)
  || hostMatchesOrganizationPlatform(host, CLAIM_VERIFICATION_SHARED_HOSTS)
  || hostMatchesOrganizationPlatform(host, GENERIC_EMAIL_DOMAINS)
);

const parseOrganizationUrl = (value: string): URL => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Organization website is required.');
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Organization website must be a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Organization website must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('Organization website must not contain credentials.');
  }
  const host = normalizedHost(url.hostname);
  if (
    !host
    || isIP(host) !== 0
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.home.arpa')
  ) {
    throw new Error('Organization website must use a public hostname.');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('Organization website must use port 80 or 443.');
  }

  url.hostname = host;
  url.hash = '';
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  url.search = '';
  return url;
};

export const organizationDomainPolicyForUrl = (value: string): OrganizationDomainPolicy => {
  const url = parseOrganizationUrl(value);
  const host = normalizedHost(url.hostname);
  const parsed = parseDomain(host, { allowPrivateDomains: true });
  const registrableDomain = normalizedHost(parsed.domain ?? '');
  if (!registrableDomain) {
    throw new Error('Organization website must use a registrable public domain.');
  }

  const isSharedPlatform = isSharedOrganizationPlatform(host);
  return {
    canonicalUrl: url.toString(),
    host,
    registrableDomain,
    isSharedPlatform,
    automaticMethods: isSharedPlatform ? [] : [...AUTOMATIC_METHODS],
  };
};

export const emailMatchesOrganizationDomain = (
  email: string,
  policy: OrganizationDomainPolicy,
): boolean => {
  if (policy.isSharedPlatform) return false;
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1 || normalized.indexOf('@') !== separator) {
    return false;
  }

  const emailHost = normalizedHost(normalized.slice(separator + 1));
  if (!emailHost || isIP(emailHost) !== 0) return false;
  const parsed = parseDomain(emailHost, { allowPrivateDomains: true });
  const emailDomain = normalizedHost(parsed.domain ?? '');
  if (!emailDomain || GENERIC_EMAIL_DOMAINS.has(emailDomain)) return false;
  return emailDomain === policy.registrableDomain;
};
