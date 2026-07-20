import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const isLive = process.argv.includes('--live');
const shouldApply = process.argv.includes('--apply');
const shouldQueue = process.argv.includes('--queue');
const shouldRefresh = process.argv.includes('--refresh');
const retryFailed = process.argv.includes('--retry-failed');

if (isLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const readLimit = (): number | undefined => {
  const raw = process.argv.find((value) => value.startsWith('--limit='))?.split('=')[1];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('--limit must be a positive integer.');
  return parsed;
};

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const isExplicitlyAllowed = (metadata: unknown): boolean => {
  const value = toRecord(metadata);
  return value.robotsAllowed === true
    || value.approvedPublicScrape === true
    || value.scrapingAllowed === true
    || String(value.complianceStatus ?? '').toUpperCase() === 'ALLOWED';
};

const isExplicitlyBlocked = (metadata: unknown): boolean => {
  const value = toRecord(metadata);
  return value.robotsAllowed === false
    || value.policyBlocked === true
    || value.scrapingAllowed === false
    || String(value.complianceStatus ?? '').toUpperCase() === 'BLOCKED';
};

const hostFor = (source: { baseUrl?: string | null; listUrl: string }): string => {
  const hostname = new URL(source.baseUrl?.trim() || source.listUrl).hostname.toLowerCase();
  return hostname.replace(/^www\./, '');
};

const siteSourceKey = (host: string): string => `site-${host}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100);

const normalizedUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

const main = async () => {
  const [{ prisma }, intakeService] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/server/affiliateImports/sourceIntake'),
  ]);
  const db = prisma as any;
  const admin = await db.authUser.findFirst({
    where: { email: { equals: 'samuel.r@razumly.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!admin) throw new Error('samuel.r@razumly.com was not found.');

  const sources = await db.affiliateScrapeSources.findMany({
    where: { status: 'ACTIVE', activeMappingId: { not: null } },
    orderBy: [{ name: 'asc' }, { sourceKey: 'asc' }],
    select: {
      id: true,
      name: true,
      sourceKey: true,
      organizationId: true,
      baseUrl: true,
      listUrl: true,
      targetKind: true,
      metadata: true,
    },
  });
  const organizationIds = Array.from(new Set(
    sources.map((source: any) => source.organizationId).filter(Boolean),
  ));
  const organizations = await db.organizations.findMany({
    where: { id: { in: organizationIds } },
    select: { id: true, name: true, location: true },
  });
  const organizationsById = new Map<string, { name: string; location: string | null }>(
    organizations.map((organization: any) => [organization.id, {
      name: organization.name,
      location: organization.location,
    }]),
  );

  const grouped = new Map<string, any[]>();
  for (const source of sources) {
    const host = hostFor(source);
    grouped.set(host, [...(grouped.get(host) ?? []), source]);
  }
  const groups = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, readLimit());

  const summary = {
    sourceCount: sources.length,
    siteCount: groups.length,
    allowedSites: 0,
    unreviewedSites: 0,
    blockedSites: 0,
    createdOrUpdated: 0,
    queued: 0,
    skippedPreviouslyCaptured: 0,
    failedSites: [] as Array<{ host: string; sourceKeys: string[]; error: string }>,
  };

  for (const [host, siteSources] of groups) {
    try {
    const blocked = siteSources.some((source) => isExplicitlyBlocked(source.metadata));
    const allowed = !blocked && siteSources.every((source) => isExplicitlyAllowed(source.metadata));
    if (blocked) summary.blockedSites += 1;
    else if (allowed) summary.allowedSites += 1;
    else summary.unreviewedSites += 1;

    const organizationIdSet = new Set(siteSources.map((source) => source.organizationId).filter(Boolean));
    const organizationId = organizationIdSet.size === 1 ? Array.from(organizationIdSet)[0] : null;
    const organization = organizationId ? organizationsById.get(organizationId) : null;
    const primarySource = [...siteSources].sort((left, right) => (
      left.sourceKey.length - right.sourceKey.length || left.sourceKey.localeCompare(right.sourceKey)
    ))[0];
    const pageMap = new Map<string, { url: string; role: string; targetKindHints: string[] }>();
    for (const source of siteSources) {
      const kind = String(source.targetKind ?? 'EVENT').toUpperCase();
      const listingUrl = normalizedUrl(source.listUrl);
      const listingHost = new URL(listingUrl).hostname.toLowerCase().replace(/^www\./, '');
      if (listingHost === host) {
        const existing = pageMap.get(listingUrl);
        pageMap.set(listingUrl, {
          url: source.listUrl,
          role: kind === 'RENTAL' ? 'RENTAL' : kind === 'CLUB' ? 'DIRECTORY' : 'LISTING',
          targetKindHints: Array.from(new Set([...(existing?.targetKindHints ?? []), kind])),
        });
      }
      if (source.baseUrl) {
        const homeUrl = normalizedUrl(source.baseUrl);
        if (!pageMap.has(homeUrl)) {
          pageMap.set(homeUrl, { url: source.baseUrl, role: 'HOME', targetKindHints: [kind] });
        }
      }
    }
    const sourceKeys = siteSources.map((source) => source.sourceKey).sort();
    const input = {
      name: organization?.name ?? `${host} approved sources`,
      sourceKey: siteSourceKey(host),
      region: organization?.location ?? null,
      baseUrl: new URL(primarySource.baseUrl?.trim() || primarySource.listUrl).origin,
      targetKindHints: Array.from(new Set(siteSources.map((source) => String(source.targetKind).toUpperCase()))),
      notes: `Bootstrapped from approved affiliate source mappings: ${sourceKeys.join(', ')}`,
      pages: Array.from(pageMap.values()).slice(0, 10),
    };

    if (!shouldApply) continue;
    const intake = await intakeService.createAffiliateSourceIntake(input, admin.id);
    await db.affiliateSourceIntakes.update({
      where: { id: intake.id },
      data: {
        organizationId,
        affiliateSourceId: primarySource.id,
      },
    });
    if (blocked) {
      await intakeService.reviewAffiliateSourceIntakePolicy(intake.id, {
        complianceStatus: 'BLOCKED',
        notes: 'Inherited from an explicit block on an existing approved source mapping.',
      }, admin.id);
    } else if (allowed) {
      await intakeService.reviewAffiliateSourceIntakePolicy(intake.id, {
        complianceStatus: 'ALLOWED',
        notes: 'Inherited from explicit scrape-policy approval metadata on every linked active source. Robots rules are rechecked during capture.',
      }, admin.id);
    }
    summary.createdOrUpdated += 1;

    if (!shouldQueue || !allowed) continue;
    if (retryFailed) {
      const latestRun = await db.affiliateSourceIntakeRuns.findFirst({
        where: { intakeId: intake.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      if (latestRun?.status !== 'FAILED') {
        summary.skippedPreviouslyCaptured += 1;
        continue;
      }
    }
    const existingRun = await db.affiliateSourceIntakeRuns.findFirst({
      where: {
        intakeId: intake.id,
        status: {
          in: retryFailed || shouldRefresh
            ? ['QUEUED', 'RUNNING']
            : ['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL'],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingRun) {
      summary.skippedPreviouslyCaptured += 1;
      continue;
    }
    const pages = await db.affiliateSourceIntakePages.findMany({
      where: { intakeId: intake.id, status: 'ACTIVE' },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
      take: 10,
    });
    await intakeService.queueAffiliateSourceIntakeRun(
      intake.id,
      pages.map((page: any) => page.id),
      admin.id,
    );
    summary.queued += 1;
    } catch (error) {
      summary.failedSites.push({
        host,
        sourceKeys: siteSources.map((source) => source.sourceKey).sort(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    mode: shouldApply ? (isLive ? 'live apply' : 'local apply') : 'dry run',
    queueRequested: shouldQueue,
    ...summary,
  }, null, 2));
  await db.$disconnect();
};

main().catch((error) => {
  console.error('[affiliate:intakes:bootstrap] failed', error);
  process.exitCode = 1;
});
