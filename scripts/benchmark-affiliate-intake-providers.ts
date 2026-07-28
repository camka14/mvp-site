import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readRepeatedOptions = (name: string): string[] => process.argv.flatMap((value, index) => {
  if (value.startsWith(`${name}=`)) return [value.slice(name.length + 1).trim()];
  if (value === name && process.argv[index + 1]) return [process.argv[index + 1].trim()];
  return [];
}).filter(Boolean);

const safeTimestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');

const excerpt = (value: string, maxLength = 800): string => (
  value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
);

const reportRow = (
  capture: Awaited<ReturnType<import('../src/server/affiliateImports/scrapingDogAffiliateClient').ScrapingDogAffiliateClient['captureSourcePage']>>,
  artifacts: ReturnType<typeof import('../src/server/affiliateImports/affiliateHtmlArtifacts').deriveAffiliateHtmlArtifacts>,
) => ({
  provider: capture.provider,
  requestedUrl: capture.requestedUrl,
  finalUrl: capture.finalUrl,
  renderMode: capture.renderMode,
  elapsedMs: capture.elapsedMs,
  estimatedCredits: capture.estimatedCredits,
  htmlBytes: Buffer.byteLength(capture.rawHtml, 'utf8'),
  markdownCharacters: artifacts.markdown.length,
  textCharacters: artifacts.textContent.length,
  linkCount: artifacts.links.length,
  imageCount: artifacts.images.length,
  logoCandidateCount: artifacts.branding.candidates.length,
  quality: artifacts.quality,
  warnings: capture.warnings,
  markdownExcerpt: excerpt(artifacts.markdown),
});

const main = async () => {
  const [
    { prisma },
    { deriveAffiliateHtmlArtifacts },
    { FirecrawlAffiliateClient },
    { ScrapingDogAffiliateClient },
    { evaluateRobotsPath },
    {
      assertSafePublicUrl,
      fetchBoundedPublicResource,
    },
  ] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/server/affiliateImports/affiliateHtmlArtifacts'),
    import('../src/server/affiliateImports/firecrawlClient'),
    import('../src/server/affiliateImports/scrapingDogAffiliateClient'),
    import('../src/server/affiliateImports/sourceIntakeRobots'),
    import('../src/server/affiliateImports/sourceIntakeUrlSafety'),
  ]);
  try {
    const requestedUrls = readRepeatedOptions('--url');
    const urlsFile = readOption('--urls-file');
    if (urlsFile) {
      const contents = await readFile(path.resolve(urlsFile), 'utf8');
      requestedUrls.push(...contents.split(/\r?\n/).map((value) => value.trim()).filter((value) => value && !value.startsWith('#')));
    }
    const intakeKey = readOption('--intake');
    if (intakeKey) {
      const intake = await (prisma as any).affiliateSourceIntakes.findFirst({
        where: { OR: [{ id: intakeKey }, { sourceKey: intakeKey }] },
        select: { id: true },
      });
      if (!intake) throw new Error(`Affiliate source intake not found: ${intakeKey}`);
      const pages = await (prisma as any).affiliateSourceIntakePages.findMany({
        where: { intakeId: intake.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { url: true },
      });
      requestedUrls.push(...pages.map((page: { url: string }) => page.url));
    }

    const urls = Array.from(new Set(requestedUrls)).slice(0, 20);
    if (!urls.length) {
      throw new Error('Provide --url, --urls-file, or --intake. The benchmark is limited to 20 URLs.');
    }

    const scrapingDog = new ScrapingDogAffiliateClient();
    const compareFirecrawl = process.argv.includes('--compare-firecrawl');
    const firecrawl = compareFirecrawl ? new FirecrawlAffiliateClient() : null;
    const results: Array<Record<string, unknown>> = [];

    for (const url of urls) {
      await assertSafePublicUrl(url);
      const robotsUrl = new URL('/robots.txt', new URL(url).origin).toString();
      let robots: Record<string, unknown>;
      try {
        const response = await fetchBoundedPublicResource(robotsUrl, {
          maxBytes: 512 * 1024,
          timeoutMs: 30_000,
        });
        const robotsText = response.statusCode >= 200 && response.statusCode < 300
          ? response.body.toString('utf8')
          : '';
        const decision = evaluateRobotsPath(robotsText, url);
        robots = {
          url: robotsUrl,
          statusCode: response.statusCode,
          decision,
        };
        if (decision.status === 'DISALLOWED') {
          results.push({ url, robots, status: 'BLOCKED', providers: [] });
          continue;
        }
      } catch (error) {
        results.push({
          url,
          robots: {
            url: robotsUrl,
            status: 'UNCLEAR',
            error: error instanceof Error ? error.message : 'Unknown robots error',
          },
          status: 'WITHHELD',
          providers: [],
        });
        continue;
      }

      const providers: Array<Record<string, unknown>> = [];
      try {
        const capture = await scrapingDog.captureSourcePage(url);
        providers.push(reportRow(capture, deriveAffiliateHtmlArtifacts(capture.rawHtml, capture.finalUrl)));
      } catch (error) {
        providers.push({
          provider: 'SCRAPINGDOG',
          error: error instanceof Error ? error.message : 'Unknown ScrapingDog error',
        });
      }
      if (firecrawl) {
        try {
          const capture = await firecrawl.captureSourcePage(url);
          providers.push(reportRow(capture as any, deriveAffiliateHtmlArtifacts(capture.rawHtml, capture.finalUrl)));
        } catch (error) {
          providers.push({
            provider: 'FIRECRAWL',
            error: error instanceof Error ? error.message : 'Unknown Firecrawl error',
          });
        }
      }
      results.push({ url, robots, status: 'CAPTURED', providers });
    }

    const report = {
      createdAt: new Date().toISOString(),
      readOnly: true,
      compareFirecrawl,
      urls,
      results,
    };
    const outputRoot = path.resolve(
      readOption('--output-dir') ?? path.join('output', 'affiliate-provider-benchmark'),
      safeTimestamp(),
    );
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const markdown = [
      '# Affiliate Intake Provider Benchmark',
      '',
      `Created: ${report.createdAt}`,
      '',
      ...results.flatMap((result) => [
        `## ${String(result.url)}`,
        '',
        `Status: ${String(result.status)}`,
        '',
        ...((result.providers as Array<Record<string, unknown>>) ?? []).flatMap((provider) => [
          `### ${String(provider.provider)}`,
          '',
          provider.error
            ? `Error: ${String(provider.error)}`
            : [
                `- Render: ${String(provider.renderMode)}`,
                `- Estimated credits: ${String(provider.estimatedCredits)}`,
                `- HTML bytes: ${String(provider.htmlBytes)}`,
                `- Markdown characters: ${String(provider.markdownCharacters)}`,
                `- Links: ${String(provider.linkCount)}`,
                `- Logo candidates: ${String(provider.logoCandidateCount)}`,
                '',
                String(provider.markdownExcerpt ?? ''),
              ].join('\n'),
          '',
        ]),
      ]),
    ].join('\n');
    await writeFile(path.join(outputRoot, 'report.md'), `${markdown}\n`, 'utf8');
    console.log(JSON.stringify({ outputRoot, urls: urls.length, results }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:intake:benchmark] failed', error);
  process.exitCode = 1;
});
