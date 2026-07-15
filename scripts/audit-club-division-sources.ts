/**
 * Audits official club websites for source-backed division skills and prices.
 *
 * The script is read-only. It checks robots.txt, fetches the official homepage
 * and likely program/fee links, and writes evidence to output for manual review.
 * It never assigns a skill or price directly to a division.
 *
 * Examples:
 *   npm run affiliate:clubs:audit-divisions -- --sport="Grass Soccer" --limit=20
 *   npm run affiliate:clubs:audit-divisions -- --club="Eastside Timbers"
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  clubDivisionLinkScore,
  detectAgeEvidence,
  detectPriceEvidence,
  detectSoccerSkillEvidence,
  isAuditableHtmlContentType,
} from '../src/server/clubDivisionSourceAudit';

dotenv.config({ path: '.env', override: false, quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const USER_AGENT = 'BracketIQ club division source review; contact samuel.r@razumly.com';
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'club-division-source-audit');
const FETCH_TIMEOUT_MS = 18_000;
const DEFAULT_MAX_PAGES = 6;
const DIRECTORY_HOSTS = new Set([
  'cevaregion.org',
  'www.cevaregion.org',
  'oregonyouthsoccer.org',
  'www.oregonyouthsoccer.org',
]);

type RobotsRule = { type: 'allow' | 'disallow'; value: string };
type PageResult = {
  url: string;
  finalUrl: string;
  status: number;
  title: string | null;
  text: string;
  html: string;
  usedScrapingDog: boolean;
};

const args = new Map<string, string | boolean>();
for (const rawArg of process.argv.slice(2)) {
  if (!rawArg.startsWith('--')) continue;
  const [key, ...rest] = rawArg.slice(2).split('=');
  args.set(key, rest.length ? rest.join('=') : true);
}

const sportFilter = typeof args.get('sport') === 'string' ? String(args.get('sport')).trim().toLowerCase() : '';
const clubFilter = typeof args.get('club') === 'string' ? String(args.get('club')).trim().toLowerCase() : '';
const limit = Math.max(1, Number(args.get('limit') ?? Number.MAX_SAFE_INTEGER));
const maxPages = Math.max(1, Number(args.get('max-pages') ?? DEFAULT_MAX_PAGES));
const concurrency = Math.max(1, Math.min(8, Number(args.get('concurrency') ?? 4)));
const virtualConsole = new VirtualConsole();

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const fetchText = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
        'user-agent': USER_AGENT,
      },
    });
    return {
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type'),
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const documentText = (html: string, url: string): { title: string | null; text: string } => {
  const dom = new JSDOM(html, { url, virtualConsole });
  dom.window.document.querySelectorAll('script, style, noscript, svg').forEach((node) => node.remove());
  return {
    title: normalizeWhitespace(dom.window.document.title || '') || null,
    text: normalizeWhitespace(dom.window.document.body?.textContent ?? ''),
  };
};

const fetchPage = async (url: string): Promise<PageResult> => {
  let direct: Awaited<ReturnType<typeof fetchText>> | null = null;
  try {
    direct = await fetchText(url);
  } catch {
    direct = null;
  }
  if (direct && direct.status < 400 && isAuditableHtmlContentType(direct.contentType)) {
    const parsed = documentText(direct.body, direct.finalUrl);
    if (parsed.text.length >= 350) {
      return { url, ...direct, html: direct.body, ...parsed, usedScrapingDog: false };
    }
  }

  const { ScrapingDogClient } = await import('../src/server/affiliateImports/scrapingDogClient');
  const scraped = await new ScrapingDogClient().fetchPage({ url, renderJavascript: true, waitMs: 2500 });
  const parsed = documentText(scraped.body, scraped.finalUrl ?? url);
  return {
    url,
    finalUrl: scraped.finalUrl ?? url,
    status: scraped.statusCode ?? 200,
    html: scraped.body,
    ...parsed,
    usedScrapingDog: true,
  };
};

const parseRobotsRules = (robotsText: string): RobotsRule[] => {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow') && value) {
      current.rules.push({ type: key, value });
    }
  }
  return groups.filter((group) => group.agents.includes('*')).flatMap((group) => group.rules);
};

const ruleMatches = (rule: string, pathAndSearch: string): boolean => {
  if (rule === '/') return true;
  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(pathAndSearch);
};

const auditRobots = async (url: string) => {
  const target = new URL(url);
  try {
    const response = await fetchText(`${target.origin}/robots.txt`);
    if (response.status >= 400) return { allowed: true, note: `robots.txt returned ${response.status}` };
    const matching = parseRobotsRules(response.body)
      .filter((rule) => ruleMatches(rule.value, `${target.pathname}${target.search}`))
      .sort((left, right) => right.value.replace(/\*/g, '').length - left.value.replace(/\*/g, '').length)[0];
    if (!matching) return { allowed: true, note: 'no matching robots rule' };
    return { allowed: matching.type === 'allow', note: `${matching.type}: ${matching.value}` };
  } catch (error) {
    return { allowed: null, note: `robots check failed: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const likelyLinks = (page: PageResult): Array<{ url: string; label: string; score: number }> => {
  const dom = new JSDOM(page.html, { url: page.finalUrl, virtualConsole });
  const origin = new URL(page.finalUrl).origin;
  const seen = new Set<string>();
  return Array.from(dom.window.document.querySelectorAll('a[href]'))
    .map((anchor) => {
      const label = normalizeWhitespace(anchor.textContent ?? '');
      try {
        const target = new URL(anchor.getAttribute('href') ?? '', page.finalUrl);
        target.hash = '';
        return { url: target.toString(), label, score: clubDivisionLinkScore(label, target.toString()) };
      } catch {
        return null;
      }
    })
    .filter((row): row is { url: string; label: string; score: number } => Boolean(row))
    .filter((row) => {
      if (/\.(?:pdf|jpe?g|png|gif|webp|zip)(?:$|\?)/i.test(row.url)) return false;
      if (row.score <= 0 || new URL(row.url).origin !== origin || seen.has(row.url)) return false;
      seen.add(row.url);
      return true;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, maxPages - 1));
};

const mapWithConcurrency = async <T, R>(values: T[], worker: (value: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]);
    }
  });
  await Promise.all(runners);
  return results;
};

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const clubTag = await prisma.organizationTags.findFirst({ where: { slug: 'club' }, select: { id: true } });
  const tagAssignments = clubTag
    ? await prisma.organizationTagAssignments.findMany({ where: { tagId: clubTag.id }, select: { organizationId: true } })
    : [];
  const featureOrganizations = await prisma.organizations.findMany({
    where: { enabledFeatures: { has: 'CLUB_TEAMS' } },
    select: { id: true },
  });
  const organizationIds = [...new Set([
    ...tagAssignments.map((row) => row.organizationId),
    ...featureOrganizations.map((row) => row.id),
  ])];
  const organizations = await prisma.organizations.findMany({
    where: {
      id: { in: organizationIds },
      ...(clubFilter ? { name: { contains: clubFilter, mode: 'insensitive' as const } } : {}),
      ...(sportFilter ? { sports: { has: sportFilter.replace(/\b\w/g, (char) => char.toUpperCase()) } } : {}),
    },
    orderBy: { name: 'asc' },
    take: limit,
    select: { id: true, name: true, website: true, sports: true, status: true },
  });
  const divisions = await prisma.divisions.findMany({
    where: { scope: 'ORGANIZATION', status: 'ACTIVE', organizationId: { in: organizations.map((row) => row.id) } },
    orderBy: [{ organizationId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      organizationId: true,
      name: true,
      sportId: true,
      gender: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
      price: true,
      sourceUrl: true,
      lastVerifiedAt: true,
    },
  });
  const divisionsByOrganization = new Map<string, typeof divisions>();
  for (const division of divisions) {
    const rows = divisionsByOrganization.get(division.organizationId!) ?? [];
    rows.push(division);
    divisionsByOrganization.set(division.organizationId!, rows);
  }

  let completed = 0;
  const audits = await mapWithConcurrency(organizations, async (organization) => {
    const website = organization.website?.trim() ?? '';
    const base = {
      organizationId: organization.id,
      organizationName: organization.name,
      website,
      sports: organization.sports,
      existingDivisions: divisionsByOrganization.get(organization.id) ?? [],
    };
    if (!website) return { ...base, status: 'missing_website', pages: [], evidence: { skills: [], ages: [], prices: [] } };
    let target: URL;
    try {
      target = new URL(website);
    } catch {
      return { ...base, status: 'invalid_website', pages: [], evidence: { skills: [], ages: [], prices: [] } };
    }
    if (DIRECTORY_HOSTS.has(target.hostname)) {
      return { ...base, status: 'directory_only', pages: [], evidence: { skills: [], ages: [], prices: [] } };
    }
    const rootRobots = await auditRobots(website);
    if (rootRobots.allowed === false) {
      return { ...base, status: 'robots_blocked', robots: rootRobots, pages: [], evidence: { skills: [], ages: [], prices: [] } };
    }
    try {
      const home = await fetchPage(website);
      const pages = [home];
      for (const link of likelyLinks(home)) {
        const robots = await auditRobots(link.url);
        if (robots.allowed === false) continue;
        try {
          pages.push(await fetchPage(link.url));
        } catch {
          // The final report keeps the successful pages and remains read-only.
        }
      }
      const isSoccer = organization.sports.some((sport) => /soccer/i.test(sport));
      const skillEvidence = isSoccer
        ? pages.flatMap((page) => detectSoccerSkillEvidence(page.text).map((row) => ({ ...row, url: page.finalUrl })))
        : [];
      const ageEvidence = pages.flatMap((page) => detectAgeEvidence(page.text).map((row) => ({ ...row, url: page.finalUrl })));
      const priceEvidence = pages.flatMap((page) => detectPriceEvidence(page.text).map((row) => ({ ...row, url: page.finalUrl })));
      completed += 1;
      console.log(`[${completed}/${organizations.length}] ${organization.name}: ${pages.length} page(s), ${skillEvidence.length} skill, ${ageEvidence.length} age, ${priceEvidence.length} price evidence`);
      return {
        ...base,
        status: 'reviewed',
        robots: rootRobots,
        pages: pages.map((page) => ({
          url: page.url,
          finalUrl: page.finalUrl,
          title: page.title,
          status: page.status,
          usedScrapingDog: page.usedScrapingDog,
        })),
        evidence: { skills: skillEvidence, ages: ageEvidence, prices: priceEvidence },
      };
    } catch (error) {
      completed += 1;
      console.log(`[${completed}/${organizations.length}] ${organization.name}: failed`);
      return {
        ...base,
        status: 'fetch_failed',
        robots: rootRobots,
        error: error instanceof Error ? error.message : String(error),
        pages: [],
        evidence: { skills: [], ages: [], prices: [] },
      };
    }
  });

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = sportFilter ? sportFilter.replace(/[^a-z0-9]+/g, '-') : 'all-sports';
  const outputPath = path.join(OUTPUT_DIR, `${stamp}-${suffix}.json`);
  await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), audits }, null, 2));
  console.log(`Wrote ${audits.length} club audit(s) to ${outputPath}`);
  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
