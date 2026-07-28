import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

export const AFFILIATE_HTML_EXTRACTOR_VERSION = 'affiliate-html-artifacts-v1';

const NOISE_SELECTORS = [
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'canvas',
  '[hidden]',
  '[aria-hidden="true"]',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="contentinfo"]',
  'nav',
  'footer',
  '.cookie-banner',
  '.cookie-consent',
  '.cookie-notice',
  '#cookie-banner',
  '#cookie-consent',
  '[class*="cookie"][class*="banner"]',
  '[class*="cookie"][class*="consent"]',
  '[class*="social-share"]',
  '[class*="share-buttons"]',
].join(',');

const TRACKING_IMAGE_PATTERN = /(?:spacer|tracking|pixel|transparent)[._-]/i;
const LOGO_SIGNAL_PATTERN = /logo|brand|crest|wordmark|club[-_ ]?mark/i;
const EMPTY_SHELL_PATTERN = /^(?:loading(?:\.\.\.)?|please wait|enable javascript|javascript is required)$/i;

type JsonRecord = Record<string, unknown>;

export type AffiliateHtmlQuality = {
  accepted: boolean;
  score: number;
  reasons: string[];
  meaningfulTextLength: number;
  linkCount: number;
  headingCount: number;
  visibleElementCount: number;
  applicationShellSignals: string[];
};

export type AffiliateBrandingArtifacts = {
  logo: string | null;
  favicon: string | null;
  ogImage: string | null;
  candidates: Array<{ url: string; reason: string }>;
  metadata: Record<string, unknown>;
};

export type AffiliateHtmlArtifacts = {
  markdown: string;
  textContent: string;
  links: string[];
  images: string[];
  branding: AffiliateBrandingArtifacts;
  metadata: Record<string, unknown>;
  inferredCanonicalUrl: string | null;
  quality: AffiliateHtmlQuality;
  extractorVersion: string;
};

const normalizedText = (value: string | null | undefined): string => (
  value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const isUnsafeHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || /^127\./.test(normalized)
    || /^10\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^169\.254\./.test(normalized)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)
    || normalized === '::1';
};

const resolveHttpUrl = (value: string | null | undefined, baseUrl: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username
      || url.password
      || isUnsafeHostname(url.hostname)) {
      return null;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const uniqueStrings = (values: Array<string | null>): string[] => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (!value || seen.has(value)) return [];
    seen.add(value);
    return [value];
  });
};

const removeNoise = (root: ParentNode): void => {
  root.querySelectorAll(NOISE_SELECTORS).forEach((element) => element.remove());
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const style = element.getAttribute('style')?.toLowerCase() ?? '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(style)) element.remove();
  });
};

const metaContent = (document: Document, selectors: string[]): string | null => {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute('content');
    if (value?.trim()) return value.trim();
  }
  return null;
};

const linkHref = (document: Document, selectors: string[]): string | null => {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute('href');
    if (value?.trim()) return value.trim();
  }
  return null;
};

const collectJsonLdLogos = (document: Document, baseUrl: string): Array<{ url: string; reason: string }> => {
  const candidates: Array<{ url: string; reason: string }> = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = recordValue(value);
    if (!Object.keys(record).length) return;
    const type = Array.isArray(record['@type'])
      ? record['@type'].map(String).join(' ')
      : String(record['@type'] ?? '');
    if (/organization|sportsorganization|localbusiness|sportsclub/i.test(type)) {
      const logoValue = typeof record.logo === 'string'
        ? record.logo
        : stringValue(recordValue(record.logo).url);
      const url = resolveHttpUrl(logoValue, baseUrl);
      if (url) candidates.push({ url, reason: 'JSON-LD organization logo' });
    }
    Object.values(record).forEach(visit);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      visit(JSON.parse(script.textContent ?? ''));
    } catch {
      // Invalid third-party JSON-LD is ignored while the raw HTML remains stored.
    }
  });
  return candidates;
};

const collectBranding = (document: Document, baseUrl: string): AffiliateBrandingArtifacts => {
  const favicon = resolveHttpUrl(linkHref(document, [
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
  ]), baseUrl);
  const ogImage = resolveHttpUrl(metaContent(document, [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
  ]), baseUrl);
  const candidates: Array<{ url: string; reason: string }> = [
    ...collectJsonLdLogos(document, baseUrl),
  ];
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const signal = [
      image.getAttribute('src'),
      image.getAttribute('alt'),
      image.getAttribute('class'),
      image.getAttribute('id'),
      image.getAttribute('data-testid'),
    ].filter(Boolean).join(' ');
    if (!LOGO_SIGNAL_PATTERN.test(signal)) return;
    const url = resolveHttpUrl(image.currentSrc || image.src || image.getAttribute('src'), baseUrl);
    if (url) candidates.push({ url, reason: 'Page image has a logo or brand signal' });
  });
  if (ogImage) candidates.push({ url: ogImage, reason: 'Page Open Graph image' });
  if (favicon) candidates.push({ url: favicon, reason: 'Page favicon' });

  const seen = new Set<string>();
  const deduped = candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
  return {
    logo: deduped.find((candidate) => /logo/i.test(candidate.reason))?.url ?? null,
    favicon,
    ogImage,
    candidates: deduped,
    metadata: {
      manifestUrl: resolveHttpUrl(linkHref(document, ['link[rel="manifest"]']), baseUrl),
      themeColor: metaContent(document, ['meta[name="theme-color"]']),
    },
  };
};

const collectLinks = (document: Document, baseUrl: string): string[] => uniqueStrings(
  Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => resolveHttpUrl(anchor.getAttribute('href'), baseUrl)),
);

const collectImages = (document: Document, baseUrl: string): string[] => uniqueStrings(
  Array.from(document.querySelectorAll<HTMLImageElement>('img'))
    .flatMap((image) => {
      const primary = resolveHttpUrl(image.getAttribute('src'), baseUrl);
      const sourceSet = image.getAttribute('srcset')
        ?.split(',')
        .map((entry) => resolveHttpUrl(entry.trim().split(/\s+/)[0], baseUrl))
        ?? [];
      return [primary, ...sourceSet];
    })
    .filter((value) => !value || !TRACKING_IMAGE_PATTERN.test(value)),
);

const cleanedContentClone = (element: HTMLElement): HTMLElement => {
  const clone = element.cloneNode(true) as HTMLElement;
  removeNoise(clone);
  return clone;
};

const contentRootMetrics = (element: HTMLElement) => ({
  textLength: normalizedText(element.textContent).length,
  visibleElementCount: element.querySelectorAll('p,li,tr,article,section,form,a[href]').length,
  headingCount: element.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
  linkCount: element.querySelectorAll('a[href]').length,
});

const selectContentRoot = (document: Document): HTMLElement | null => {
  if (!document.body) return null;
  const body = cleanedContentClone(document.body);
  const bodyMetrics = contentRootMetrics(body);
  const mainCandidates = Array.from(document.querySelectorAll<HTMLElement>('main,[role="main"]'))
    .map(cleanedContentClone)
    .map((element) => ({ element, metrics: contentRootMetrics(element) }))
    .sort((left, right) => (
      right.metrics.textLength - left.metrics.textLength
      || right.metrics.visibleElementCount - left.metrics.visibleElementCount
    ));
  const bestMain = mainCandidates[0];
  if (!bestMain || bestMain.metrics.textLength < 40) return body;

  const meaningfulShare = bodyMetrics.textLength === 0
    ? 1
    : bestMain.metrics.textLength / bodyMetrics.textLength;
  return meaningfulShare >= 0.15 ? bestMain.element : body;
};

const documentQuality = (document: Document): AffiliateHtmlQuality => {
  const clone = selectContentRoot(document);
  if (!clone) {
    return {
      accepted: false,
      score: 0,
      reasons: ['Document body is missing.'],
      meaningfulTextLength: 0,
      linkCount: 0,
      headingCount: 0,
      visibleElementCount: 0,
      applicationShellSignals: ['missing-body'],
    };
  }
  removeNoise(clone);
  const text = normalizedText(clone.textContent);
  const linkCount = clone.querySelectorAll('a[href]').length;
  const headingCount = clone.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
  const visibleElementCount = clone.querySelectorAll('p,li,tr,article,section,form,a[href]').length;
  const applicationShellSignals: string[] = [];
  if (!text) applicationShellSignals.push('empty-visible-text');
  if (EMPTY_SHELL_PATTERN.test(text)) applicationShellSignals.push('loading-only-text');
  if (clone.querySelector('#root:empty, #app:empty, #__next:empty')) applicationShellSignals.push('empty-application-root');
  const scriptCount = document.querySelectorAll('script').length;
  if (scriptCount >= 8 && text.length < 100) applicationShellSignals.push('script-heavy-empty-shell');

  let score = 0;
  if (text.length >= 1_000) score += 5;
  else if (text.length >= 300) score += 4;
  else if (text.length >= 120) score += 3;
  else if (text.length >= 40) score += 1;
  if (headingCount > 0) score += 1;
  if (linkCount >= 2) score += 1;
  if (visibleElementCount >= 3) score += 1;
  if (metaContent(document, ['meta[name="description"]', 'meta[property="og:description"]'])) score += 1;
  score -= applicationShellSignals.length * 3;

  const accepted = applicationShellSignals.length === 0
    && (text.length >= 120
      || (text.length >= 40 && score >= 4)
      || (headingCount > 0 && linkCount >= 2 && visibleElementCount >= 3));
  const reasons = [
    `${text.length} meaningful text characters.`,
    `${linkCount} links and ${headingCount} headings.`,
    ...(accepted ? ['Static content quality is sufficient.'] : ['Content quality requires JavaScript retry.']),
    ...applicationShellSignals.map((signal) => `Application shell signal: ${signal}.`),
  ];
  return {
    accepted,
    score: Math.max(0, score),
    reasons,
    meaningfulTextLength: text.length,
    linkCount,
    headingCount,
    visibleElementCount,
    applicationShellSignals,
  };
};

const createTurndown = (): TurndownService => {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  service.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (content) => ` ${normalizedText(content)} |`,
  });
  service.addRule('tableRow', {
    filter: 'tr',
    replacement: (content) => `\n|${content.trim()}\n`,
  });
  service.addRule('usefulLineBreak', {
    filter: 'br',
    replacement: () => '\n',
  });
  service.addRule('dropTrackingImages', {
    filter: (node) => node.nodeName === 'IMG'
      && (
        /^(?:data|javascript):/i.test((node as HTMLElement).getAttribute('src') ?? '')
        || TRACKING_IMAGE_PATTERN.test((node as HTMLElement).getAttribute('src') ?? '')
      ),
    replacement: () => '',
  });
  service.addRule('dropUnsafeLinks', {
    filter: (node) => node.nodeName === 'A'
      && /^(?:data|javascript):/i.test((node as HTMLElement).getAttribute('href') ?? ''),
    replacement: (content) => content,
  });
  return service;
};

const createDocument = (rawHtml: string, requestedUrl: string): Document => (
  new JSDOM(rawHtml, {
    url: requestedUrl,
    contentType: 'text/html',
    runScripts: undefined,
    resources: undefined,
  }).window.document
);

export const evaluateAffiliateHtmlQuality = (
  rawHtml: string,
  requestedUrl: string,
): AffiliateHtmlQuality => {
  if (!rawHtml.trim()) {
    return {
      accepted: false,
      score: 0,
      reasons: ['HTML response is empty.'],
      meaningfulTextLength: 0,
      linkCount: 0,
      headingCount: 0,
      visibleElementCount: 0,
      applicationShellSignals: ['empty-html'],
    };
  }
  try {
    return documentQuality(createDocument(rawHtml, requestedUrl));
  } catch (error) {
    return {
      accepted: false,
      score: 0,
      reasons: [`HTML parsing failed: ${error instanceof Error ? error.message : 'unknown error'}`],
      meaningfulTextLength: 0,
      linkCount: 0,
      headingCount: 0,
      visibleElementCount: 0,
      applicationShellSignals: ['parse-failure'],
    };
  }
};

export const deriveAffiliateHtmlArtifacts = (
  rawHtml: string,
  requestedUrl: string,
): AffiliateHtmlArtifacts => {
  const document = createDocument(rawHtml, requestedUrl);
  const quality = documentQuality(document);
  const links = collectLinks(document, requestedUrl);
  const images = collectImages(document, requestedUrl);
  const branding = collectBranding(document, requestedUrl);
  const canonical = resolveHttpUrl(linkHref(document, ['link[rel="canonical"]']), requestedUrl)
    ?? resolveHttpUrl(metaContent(document, ['meta[property="og:url"]']), requestedUrl);
  const metadata = {
    title: normalizedText(document.title) || null,
    description: metaContent(document, ['meta[name="description"]', 'meta[property="og:description"]']),
    canonicalUrl: canonical,
    ogType: metaContent(document, ['meta[property="og:type"]']),
    locale: document.documentElement.lang?.trim() || null,
    extractorVersion: AFFILIATE_HTML_EXTRACTOR_VERSION,
  };

  const contentRoot = selectContentRoot(document);
  if (!contentRoot) throw new Error('Captured HTML does not contain a document body.');
  const textContent = normalizedText(contentRoot.textContent);
  const markdown = createTurndown()
    .turndown(contentRoot.innerHTML)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    markdown,
    textContent,
    links,
    images,
    branding,
    metadata,
    inferredCanonicalUrl: canonical,
    quality,
    extractorVersion: AFFILIATE_HTML_EXTRACTOR_VERSION,
  };
};
