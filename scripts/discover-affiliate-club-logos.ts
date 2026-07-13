/**
 * Discovers official logos for directory-imported affiliate club organizations.
 *
 * Default mode is audit-only. Use --write to store normalized 1024px opaque PNG
 * logos and assign Organizations.logoId. The script only inspects official club
 * websites already stored on org rows; directory-only rows are reported for
 * manual review instead of receiving generated placeholders.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { JSDOM, VirtualConsole } from 'jsdom';
import sharp from 'sharp';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const write = process.argv.includes('--write');
const force = process.argv.includes('--force');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const orgArg = process.argv.find((arg) => arg.startsWith('--org='));
const minScoreArg = process.argv.find((arg) => arg.startsWith('--min-score='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const orgFilter = orgArg ? orgArg.split('=').slice(1).join('=').toLowerCase() : '';
const minScore = minScoreArg ? Number(minScoreArg.split('=')[1]) : 45;

if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; BracketIQ club logo review; +mailto:samuel.r@razumly.com)';
const SIZE = 1024;
const OUTPUT_DIR = path.resolve(process.cwd(), 'output/affiliate-club-logo-discovery');
const FETCH_TIMEOUT_MS = 12_000;

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type StorageProviderInstance = ReturnType<typeof import('../src/lib/storageProvider').getStorageProvider>;

type ClubOrg = {
  id: string;
  name: string;
  website: string | null;
  logoId: string | null;
};

type ImageCandidate = {
  url: string;
  source: string;
  score: number;
  reason: string[];
};

type ReportRow = {
  orgId: string;
  name: string;
  website: string | null;
  status: 'updated' | 'would-update' | 'skipped' | 'failed';
  logoId?: string;
  candidateUrl?: string;
  source?: string;
  reason: string;
  candidates?: ImageCandidate[];
};

let prisma: PrismaClientInstance | undefined;
let storage: StorageProviderInstance | undefined;

const directoryUrls = new Set([
  'https://cevaregion.org/clubdirectory/',
  'https://www.oregonyouthsoccer.org/find-a-club/',
  'https://rugbyoregon.com/find-a-team-26/',
  'https://www.oregonstatehockey.com/youth-hockey.html',
  'https://www.tvyfl.org/member',
  'https://www.pdxfastpitch.com/travel-teams-or.html',
]);

const directoryPrefixes = [
  'affiliate_org_oregon_youth_soccer_find_a_club_',
  'affiliate_org_ceva_club_directory_',
  'affiliate_org_oregon_state_hockey_youth_directory_',
  'affiliate_org_rugby_oregon_find_a_team_',
  'affiliate_org_tvyfl_member_associations_',
  'affiliate_org_pdx_fastpitch_oregon_travel_teams_',
];

const normalizeWebsite = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const orgTokens = (name: string): string[] => (
  name
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !['club', 'soccer', 'volleyball', 'academy', 'association', 'vbc', 'the', 'and', 'fc'].includes(token))
);

const isDirectoryWebsite = (website: string | null): boolean => {
  const normalized = normalizeWebsite(website);
  return !normalized || directoryUrls.has(normalized);
};

const fetchText = async (url: string): Promise<string | null> => {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return response.text();
};

const fetchRenderedCandidates = async (url: string, orgName: string): Promise<ImageCandidate[]> => {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1365, height: 900 },
        userAgent: USER_AGENT,
      });
      await page.goto(url, { waitUntil: 'networkidle', timeout: FETCH_TIMEOUT_MS * 2 });
      const rendered = await page.evaluate(() => {
        const images = [...document.images].map((element) => {
          const nearestHeader = element.closest('header, nav, [class*="header" i], [id*="header" i], [class*="logo" i], [id*="logo" i]');
          return {
            src: element.currentSrc || element.src,
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
            className: String(element.getAttribute('class') ?? ''),
            id: element.getAttribute('id'),
            width: element.naturalWidth,
            height: element.naturalHeight,
            inHeader: Boolean(nearestHeader),
            headerHtml: nearestHeader?.outerHTML.slice(0, 500) ?? '',
          };
        });
        const backgrounds = [...document.querySelectorAll('*')].flatMap((element) => {
          const style = getComputedStyle(element);
          const value = style.backgroundImage;
          if (!value || value === 'none') return [];
          return [{
            value,
            className: String(element.getAttribute('class') ?? ''),
            id: element.getAttribute('id'),
          }];
        });
        return { images, backgrounds };
      });
      const candidates = new Map<string, ImageCandidate>();
      const tokens = orgTokens(orgName);
      for (const image of rendered.images) {
        const label = [
          image.alt,
          image.title,
          image.className,
          image.id,
          image.inHeader ? image.headerHtml : '',
          image.width && image.height ? `${image.width}x${image.height}` : '',
        ].filter(Boolean).join(' ');
        addCandidate(candidates, resolveUrl(image.src, url), label, image.inHeader ? 'rendered-header-img' : 'rendered-img', tokens);
      }
      for (const background of rendered.backgrounds) {
        const matches = [...background.value.matchAll(/url\((['"]?)(.*?)\1\)/g)];
        for (const match of matches) {
          const label = `${background.className} ${background.id ?? ''} ${background.value}`;
          addCandidate(candidates, resolveUrl(match[2], url), label, 'rendered-css-url', tokens);
        }
      }
      return [...candidates.values()]
        .filter((candidate) => candidate.score >= 18)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    } finally {
      await browser.close();
    }
  } catch {
    return [];
  }
};

const fetchBuffer = async (url: string): Promise<Buffer | null> => {
  const response = await fetch(url, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
};

const imageFetchVariants = (candidateUrl: string): string[] => {
  const variants: string[] = [];
  try {
    const url = new URL(candidateUrl);
    if (url.hostname === 'static.wixstatic.com' && url.pathname.includes('/media/') && url.pathname.includes('/v1/')) {
      const fullSize = new URL(url.toString());
      fullSize.pathname = url.pathname.split('/v1/')[0] ?? url.pathname;
      fullSize.search = '';
      variants.push(fullSize.toString());
    }
    if (url.hostname === 'resized-images.azureedge.net') {
      const fullWidth = new URL(url.toString());
      fullWidth.search = '';
      fullWidth.searchParams.set('w', '1024');
      variants.push(fullWidth.toString());
    }
    if (url.hostname === 'd36m266ykvepgv.cloudfront.net') {
      const sizeMatch = url.pathname.match(/\/s-(\d+)-(\d+)\//);
      if (sizeMatch) {
        const sourceWidth = Number(sizeMatch[1]);
        const sourceHeight = Number(sizeMatch[2]);
        if (sourceWidth > 0 && sourceHeight > 0) {
          const width = 900;
          const height = Math.max(1, Math.round((width * sourceHeight) / sourceWidth));
          const fullWidth = new URL(url.toString());
          fullWidth.pathname = url.pathname.replace(/\/s-\d+-\d+\//, `/s-${width}-${height}/`);
          variants.push(fullWidth.toString());
        }
      }
    }
    if (/\.wsimg\.com$/.test(url.hostname) && url.pathname.includes('/:')) {
      const original = new URL(url.toString());
      original.pathname = url.pathname.split('/:')[0] ?? url.pathname;
      original.search = '';
      variants.push(original.toString());
    }
  } catch {
    // Fall back to the source URL below.
  }
  variants.push(candidateUrl);
  return [...new Set(variants)];
};

const robotsAllows = async (targetUrl: string): Promise<boolean> => {
  try {
    const url = new URL(targetUrl);
    const robotsUrl = `${url.origin}/robots.txt`;
    const text = await fetchText(robotsUrl);
    if (!text) return true;
    const pathName = `${url.pathname || '/'}${url.search || ''}`;
    let applies = false;
    let disallowed: string[] = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;
      const [keyRaw, ...rest] = line.split(':');
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') {
        applies = value === '*' || value.toLowerCase().includes('bracketiq');
        continue;
      }
      if (applies && key === 'disallow' && value) {
        disallowed.push(value);
      }
      if (applies && key === 'allow' && value && pathName.startsWith(value)) {
        disallowed = disallowed.filter((rule) => rule !== value);
      }
    }
    return !disallowed.some((rule) => rule === '/' || pathName.startsWith(rule));
  } catch {
    return true;
  }
};

const resolveUrl = (value: string | null | undefined, baseUrl: string): string | null => {
  if (!value) return null;
  const first = value.split(',')[0]?.trim().split(/\s+/)[0];
  if (!first || first.startsWith('data:') || first.startsWith('blob:')) return null;
  try {
    const url = new URL(first, baseUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const imagePenalty = (url: string, label: string): number => {
  const value = `${url} ${label}`.toLowerCase();
  let penalty = 0;
  if (/(hero|banner|background|bg-|photo|gallery|team-photo|player|coach|field|court|camp|clinic)/.test(value)) penalty -= 30;
  if (/(facebook|instagram|youtube|twitter|x-logo|linkedin|social|avatar|profile)/.test(value)) penalty -= 45;
  if (/(favicon|touch-icon|apple-touch-icon)/.test(value)) penalty -= 8;
  if (/(logo-default|default-logo|placeholder|pwa-app\/logo-default|generic-logo)/.test(value)) penalty -= 80;
  if (/\.(ico)(\?|$)/.test(value)) penalty -= 20;
  return penalty;
};

const scoreCandidate = (candidateUrl: string, label: string, source: string, tokens: string[]): ImageCandidate => {
  const value = `${candidateUrl} ${label}`.toLowerCase();
  const reason: string[] = [];
  let score = 10;

  if (/(logo|crest|badge|brand|emblem|shield)/.test(value)) {
    score += 55;
    reason.push('logo-like label/url');
  }
  if (source === 'meta') {
    score += 18;
    reason.push('metadata image');
  }
  if (source === 'json-ld') {
    score += 25;
    reason.push('json-ld logo');
  }
  if (source === 'header-img') {
    score += 35;
    reason.push('header image');
  }
  if (source === 'rendered-header-img') {
    score += 42;
    reason.push('rendered header image');
  }
  if (source === 'rendered-css-url') {
    score += 20;
    reason.push('rendered css image');
  }
  if (source === 'link-icon') {
    score += 8;
    reason.push('site icon');
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    if (value.includes(token)) matchedTokens += 1;
  }
  if (matchedTokens > 0) {
    score += Math.min(35, matchedTokens * 10);
    reason.push(`matches ${matchedTokens} org token${matchedTokens === 1 ? '' : 's'}`);
  }

  const penalty = imagePenalty(candidateUrl, label);
  if (penalty) {
    score += penalty;
    reason.push(`penalty ${penalty}`);
  }

  return { url: candidateUrl, source, score, reason };
};

const addCandidate = (
  candidates: Map<string, ImageCandidate>,
  candidateUrl: string | null,
  label: string,
  source: string,
  tokens: string[],
) => {
  if (!candidateUrl) return;
  const scored = scoreCandidate(candidateUrl, label, source, tokens);
  const existing = candidates.get(scored.url);
  if (!existing || scored.score > existing.score) {
    candidates.set(scored.url, scored);
  }
};

const extractCandidates = (html: string, baseUrl: string, orgName: string): ImageCandidate[] => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {
    // Some builders emit nested @media CSS that jsdom logs noisily. We only need DOM nodes.
  });
  const dom = new JSDOM(html, { virtualConsole });
  const document = dom.window.document;
  const candidates = new Map<string, ImageCandidate>();
  const tokens = orgTokens(orgName);

  document.querySelectorAll('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"]').forEach((element) => {
    addCandidate(candidates, resolveUrl(element.getAttribute('content'), baseUrl), element.outerHTML, 'meta', tokens);
  });

  document.querySelectorAll('link[rel]').forEach((element) => {
    const rel = element.getAttribute('rel')?.toLowerCase() ?? '';
    if (!/(icon|apple-touch-icon|mask-icon)/.test(rel)) return;
    addCandidate(candidates, resolveUrl(element.getAttribute('href'), baseUrl), element.outerHTML, 'link-icon', tokens);
  });

  document.querySelectorAll('img').forEach((element) => {
    const nearestHeader = element.closest('header, nav, [class*="header" i], [id*="header" i], [class*="logo" i], [id*="logo" i]');
    const source = nearestHeader ? 'header-img' : 'img';
    const label = [
      element.getAttribute('alt'),
      element.getAttribute('title'),
      element.getAttribute('class'),
      element.getAttribute('id'),
      element.getAttribute('aria-label'),
      nearestHeader ? nearestHeader.outerHTML.slice(0, 500) : '',
    ].filter(Boolean).join(' ');
    const attrs = [
      element.getAttribute('src'),
      element.getAttribute('data-src'),
      element.getAttribute('data-lazy-src'),
      element.getAttribute('data-original'),
      element.getAttribute('srcset'),
      element.getAttribute('data-srcset'),
    ];
    for (const attr of attrs) {
      addCandidate(candidates, resolveUrl(attr, baseUrl), label, source, tokens);
    }
  });

  document.querySelectorAll('[style]').forEach((element) => {
    const style = element.getAttribute('style') ?? '';
    const matches = [...style.matchAll(/url\((['"]?)(.*?)\1\)/g)];
    for (const match of matches) {
      addCandidate(candidates, resolveUrl(match[2], baseUrl), `${element.getAttribute('class') ?? ''} ${style}`, 'css-url', tokens);
    }
  });

  document.querySelectorAll('script[type="application/ld+json"]').forEach((element) => {
    try {
      const raw = element.textContent?.trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const logo = node?.logo?.url ?? node?.logo;
        const image = node?.image?.url ?? node?.image;
        addCandidate(candidates, resolveUrl(logo, baseUrl), element.textContent ?? '', 'json-ld', tokens);
        addCandidate(candidates, resolveUrl(image, baseUrl), element.textContent ?? '', 'json-ld', tokens);
      }
    } catch {
      // Ignore malformed source JSON-LD.
    }
  });

  return [...candidates.values()]
    .filter((candidate) => candidate.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};

const bestUsableImage = async (candidates: ImageCandidate[]): Promise<{ candidate: ImageCandidate; source: Buffer } | null> => {
  for (const candidate of candidates) {
    for (const imageUrl of imageFetchVariants(candidate.url)) {
      const source = await fetchBuffer(imageUrl).catch(() => null);
      if (!source) continue;
      const metadata = await sharp(source, { animated: false }).metadata().catch(() => null);
      if (!metadata?.width || !metadata?.height) continue;
      const maxSide = Math.max(metadata.width, metadata.height);
      if (maxSide < 64) continue;
      const area = metadata.width * metadata.height;
      if (area < 4096) continue;
      const scoreWithSize = candidate.score + Math.min(25, Math.floor(maxSide / 80));
      if (scoreWithSize < 45) continue;
      const reason = imageUrl === candidate.url
        ? candidate.reason
        : [...candidate.reason, 'used full-size official asset variant'];
      return { candidate: { ...candidate, url: imageUrl, score: scoreWithSize, reason }, source };
    }
  }
  return null;
};

const chooseLogoBackground = async (base: Buffer): Promise<string> => {
  const { data, info } = await sharp(base, { animated: false })
    .ensureAlpha()
    .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visible = 0;
  let luminanceTotal = 0;
  let darkPixels = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = data[index + 3] ?? 255;
    if (alpha < 32) continue;
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    visible += 1;
    luminanceTotal += luminance;
    if (luminance < 96) darkPixels += 1;
  }
  if (!visible) return '#ffffff';
  const averageLuminance = luminanceTotal / visible;
  const darkRatio = darkPixels / visible;
  return averageLuminance > 210 && darkRatio < 0.15 ? '#172033' : '#ffffff';
};

const normalizeLogo = async (org: ClubOrg, source: Buffer): Promise<Buffer> => {
  const base = await sharp(source, { animated: false }).rotate().png().toBuffer();
  const background = await chooseLogoBackground(base);
  const trimmed = await sharp(base)
    .trim({ threshold: 12 })
    .flatten({ background })
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(base).flatten({ background }).png().toBuffer());
  const metadata = await sharp(trimmed).metadata();
  const width = metadata.width ?? 760;
  const height = metadata.height ?? 760;
  const aspectRatio = width / height;
  const target = aspectRatio >= 1.7
    ? { width: 850, height: 620 }
    : aspectRatio <= 0.7
      ? { width: 620, height: 850 }
      : { width: 790, height: 790 };
  const logo = await sharp(trimmed)
    .resize({ width: target.width, height: target.height, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const logoMetadata = await sharp(logo).metadata();
  const logoWidth = logoMetadata.width ?? target.width;
  const logoHeight = logoMetadata.height ?? target.height;
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background,
    },
  })
    .composite([{
      input: logo,
      top: Math.round((SIZE - logoHeight) / 2),
      left: Math.round((SIZE - logoWidth) / 2),
    }])
    .png()
    .toBuffer();
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  storage = getStorageProvider();
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const loadClubOrgs = async (): Promise<ClubOrg[]> => {
  const rows = await (prisma as any).organizations.findMany({
    where: {
      OR: directoryPrefixes.map((prefix) => ({ id: { startsWith: prefix } })),
      ...(force ? {} : { logoId: null }),
    },
    select: { id: true, name: true, website: true, logoId: true },
    orderBy: { name: 'asc' },
  });
  return (rows as ClubOrg[])
    .filter((org) => !orgFilter || org.name.toLowerCase().includes(orgFilter) || org.id.toLowerCase().includes(orgFilter))
    .slice(0, limit ?? rows.length);
};

const storeLogo = async (ownerId: string, org: ClubOrg, image: Buffer): Promise<string> => {
  const hash = crypto.createHash('sha1').update(image).digest('hex').slice(0, 12);
  const fileId = `${org.id}_logo_square_${hash}`;
  const stored = await storage!.putObject({
    data: image,
    originalName: `${org.id.replace(/^affiliate_org_/, '')}-logo-square.png`,
    contentType: 'image/png',
    organizationId: org.id,
  });
  await (prisma as any).file.upsert({
    where: { id: fileId },
    create: {
      id: fileId,
      uploaderId: ownerId,
      organizationId: org.id,
      bucket: stored.bucket ?? null,
      originalName: `${org.id.replace(/^affiliate_org_/, '')}-logo-square.png`,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: org.id,
      bucket: stored.bucket ?? null,
      originalName: `${org.id.replace(/^affiliate_org_/, '')}-logo-square.png`,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  await (prisma as any).organizations.update({
    where: { id: org.id },
    data: { logoId: fileId, updatedAt: new Date() },
  });
  return fileId;
};

const processOrg = async (ownerId: string, org: ClubOrg): Promise<ReportRow> => {
  const website = normalizeWebsite(org.website);
  if (isDirectoryWebsite(website)) {
    return {
      orgId: org.id,
      name: org.name,
      website,
      status: 'skipped',
      reason: 'Stored website is missing or points to a directory page; manual official-site lookup required.',
    };
  }
  if (!await robotsAllows(website!)) {
    return {
      orgId: org.id,
      name: org.name,
      website,
      status: 'skipped',
      reason: 'robots.txt disallows the official website path.',
    };
  }
  const html = await fetchText(website!).catch(() => null);
  let candidates = html ? extractCandidates(html, website!, org.name) : [];
  let best = candidates.length ? await bestUsableImage(candidates) : null;
  if (!best || !html) {
    const renderedCandidates = await fetchRenderedCandidates(website!, org.name);
    const combined = new Map<string, ImageCandidate>();
    for (const candidate of [...candidates, ...renderedCandidates]) {
      const existing = combined.get(candidate.url);
      if (!existing || candidate.score > existing.score) {
        combined.set(candidate.url, candidate);
      }
    }
    candidates = [...combined.values()].sort((a, b) => b.score - a.score).slice(0, 10);
    best = await bestUsableImage(candidates);
  }
  if (!best) {
    return {
      orgId: org.id,
      name: org.name,
      website,
      status: html ? 'skipped' : 'failed',
      reason: html
        ? 'No usable official logo/image candidate found.'
        : 'Official website did not return HTML and rendered fallback found no usable candidate.',
      candidates,
    };
  }
  if (best.candidate.score < minScore) {
    return {
      orgId: org.id,
      name: org.name,
      website,
      status: 'skipped',
      candidateUrl: best.candidate.url,
      source: best.candidate.source,
      reason: `Best candidate score ${best.candidate.score} is below --min-score=${minScore}.`,
      candidates,
    };
  }
  const normalized = await normalizeLogo(org, best.source);
  const wouldFileId = `${org.id}_logo_square_${crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12)}`;
  if (!write) {
    return {
      orgId: org.id,
      name: org.name,
      website,
      status: 'would-update',
      logoId: wouldFileId,
      candidateUrl: best.candidate.url,
      source: best.candidate.source,
      reason: `Best candidate score ${best.candidate.score}: ${best.candidate.reason.join(', ') || 'ranked official image'}`,
      candidates,
    };
  }
  const logoId = await storeLogo(ownerId, org, normalized);
  return {
    orgId: org.id,
    name: org.name,
    website,
    status: 'updated',
    logoId,
    candidateUrl: best.candidate.url,
    source: best.candidate.source,
    reason: `Stored best candidate score ${best.candidate.score}: ${best.candidate.reason.join(', ') || 'ranked official image'}`,
    candidates,
  };
};

const main = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await loadAppModules();
  const owner = await requireOwner();
  const orgs = await loadClubOrgs();
  const report: ReportRow[] = [];

  console.log(`${write ? '[write]' : '[dry-run]'} inspecting ${orgs.length} directory club orgs${orgFilter ? ` matching ${orgFilter}` : ''}.`);
  for (const org of orgs) {
    try {
      const row = await processOrg(owner.id, org);
      report.push(row);
      console.log(`${row.status.padEnd(12)} ${org.name} - ${row.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.push({
        orgId: org.id,
        name: org.name,
        website: org.website,
        status: 'failed',
        reason: message,
      });
      console.warn(`failed      ${org.name} - ${message}`);
    }
  }

  const summary = report.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const outputPath = path.join(OUTPUT_DIR, `${useLive ? 'live' : 'local'}-${Date.now()}.json`);
  await fs.writeFile(outputPath, JSON.stringify({ summary, report }, null, 2));
  console.log(`Summary: ${JSON.stringify(summary)}`);
  console.log(`Wrote ${outputPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
