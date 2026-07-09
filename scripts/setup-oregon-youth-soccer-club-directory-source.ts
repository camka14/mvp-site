/**
 * Oregon Youth Soccer Find-a-Club directory.
 *
 * Owns source `oregon-youth-soccer-find-a-club`, mapping
 * `affiliate_mapping_oregon_youth_soccer_find_a_club_v1`, and reuses the OYSA
 * source organization/logo from `setup-oregon-youth-soccer-affiliate-source.ts`.
 * Running without `--scrape` only upserts the source and mapping. Running with
 * `--scrape` creates or updates DISCOVERED CLUB candidates and unpublished
 * organization targets for admin review.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { JSDOM } from "jsdom";
import path from "path";
import { prisma } from "../src/lib/prisma";
import type { AffiliateScrapeMapping } from "../src/server/affiliateImports/types";

loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });

type RunAffiliateSourceScrape =
  typeof import("../src/server/affiliateImports/service").runAffiliateSourceScrape;

const OWNER_EMAIL = "samuel.r@razumly.com";
const ORG_ID = "affiliate_org_oregon_youth_soccer";
const LOGO_FILE_ID = "affiliate_file_oregon_youth_soccer_logo";
const SOURCE_ID = "affiliate_source_oregon_youth_soccer_find_a_club";
const SOURCE_KEY = "oregon-youth-soccer-find-a-club";
const MAPPING_ID = "affiliate_mapping_oregon_youth_soccer_find_a_club_v1";
const BASE_URL = "https://www.oregonyouthsoccer.org/";
const LIST_URL = "https://www.oregonyouthsoccer.org/find-a-club/";
const LOGO_SOURCE_URL =
  "https://www.oregonyouthsoccer.org/wp-content/uploads/sites/279/2024/03/OYSA-Main-Shield-LOGO2.png";
const PUBLIC_SLUG = "oregon-youth-soccer-association";
const ORGANIZER_DESCRIPTION =
  "Oregon Youth Soccer Association is a statewide youth soccer organization that supports Oregon member clubs, leagues, tournaments, coaching, refereeing, and player programs. Its Find-a-Club directory lists member youth soccer clubs around Oregon with official club website links.";

const decodeHtml = (value: string) => {
  const dom = JSDOM.fragment(value);
  return dom.textContent?.replace(/\s+/g, " ").trim() ?? "";
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download OYSA logo: ${response.status} ${response.statusText}`,
    );
  }

  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/png";
  const { getStorageProvider } = await import("../src/lib/storageProvider");
  const stored = await getStorageProvider().putObject({
    data,
    originalName: "oregon-youth-soccer-logo.png",
    contentType,
    organizationId: ORG_ID,
  });

  return (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: "oregon-youth-soccer-logo.png",
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: "oregon-youth-soccer-logo.png",
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Oregon Youth Soccer Association",
      location: "Beaverton, OR",
      address: "Beaverton, OR",
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Grass Soccer"],
      status: "LISTED",
      hasStripeAccount: false,
      verificationStatus: "UNVERIFIED",
      verificationReviewStatus: "NONE",
      coordinates: [-122.8037, 45.4871],
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: "Oregon Youth Soccer Association clubs and programs",
      publicIntroText:
        "Find sanctioned tournaments, member-club programs, and official OYSA links.",
      taxOrganizationType: "NONPROFIT_ORGANIZATION",
      operatesAthleticFacility: false,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
    update: {
      updatedAt: new Date(),
      name: "Oregon Youth Soccer Association",
      location: "Beaverton, OR",
      address: "Beaverton, OR",
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Grass Soccer"],
      status: "LISTED",
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: "Oregon Youth Soccer Association clubs and programs",
      publicIntroText:
        "Find sanctioned tournaments, member-club programs, and official OYSA links.",
      coordinates: [-122.8037, 45.4871],
      operatesAthleticFacility: false,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
  });
};

const fetchDirectoryHtml = async () => {
  const response = await fetch(LIST_URL, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "BracketIQ source review bot; contact samuel.r@razumly.com",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OYSA Find-a-Club page: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
};

const regionAt = (
  headings: Array<{ index: number; region: string }>,
  index: number,
) => {
  const previousHeadings = headings.filter((item) => item.index < index);
  const heading = previousHeadings[previousHeadings.length - 1];
  return heading?.region ?? "Oregon";
};

const parseDirectoryCandidates = (html: string) => {
  const entryStart = html.indexOf('<div class="entry-content');
  const entryEnd = html.indexOf("</article>", entryStart);
  const entryHtml =
    entryStart >= 0 && entryEnd > entryStart
      ? html.slice(entryStart, entryEnd)
      : html;
  const headingMatches = Array.from(
    entryHtml.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi),
  );
  const headings = headingMatches.map((match) => ({
    index: match.index ?? 0,
    region:
      decodeHtml(match[1] ?? "")
        .replace(/^Member Clubs$/i, "")
        .trim() || "Oregon",
  }));
  const linkRegex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a\b|<br\s*\/?>|<\/p>|<\/div>)/gi;
  const skippedRows: Array<{ title: string; href: string; reason: string }> =
    [];
  const seen = new Set<string>();
  const candidates: NonNullable<AffiliateScrapeMapping["manualCandidates"]> =
    [];

  for (const match of entryHtml.matchAll(linkRegex)) {
    const rawHref = match[1] ?? "";
    const title = decodeHtml(match[2] ?? "");
    const trailingText = decodeHtml(match[3] ?? "");
    const city =
      /[–—-]\s*(.+)$/.exec(trailingText)?.[1]?.replace(/\s+/g, " ").trim() ??
      "";
    if (!title || !city) {
      skippedRows.push({
        title: title || "(missing title)",
        href: rawHref,
        reason: "missing title or city",
      });
      continue;
    }

    let officialActionUrl: string;
    try {
      officialActionUrl = new URL(rawHref, LIST_URL).toString();
    } catch {
      skippedRows.push({ title, href: rawHref, reason: "invalid URL" });
      continue;
    }

    const officialUrl = new URL(officialActionUrl);
    if (!/^https?:$/.test(officialUrl.protocol)) {
      skippedRows.push({ title, href: rawHref, reason: "non-http URL" });
      continue;
    }
    if (officialUrl.hostname.includes("stopbloodnow.com")) {
      skippedRows.push({
        title,
        href: rawHref,
        reason: "source directory contains malformed stopbloodnow.com URL",
      });
      continue;
    }

    const dedupe = `${title.toLowerCase()}|${officialActionUrl.toLowerCase()}`;
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);
    const region = regionAt(headings, match.index ?? 0);
    const normalizedCity = /\bOR\b|Oregon/i.test(city) ? city : `${city}, OR`;

    candidates.push({
      listingKind: "CLUB",
      title,
      officialActionUrl,
      sourceUrl: LIST_URL,
      organizerName: title,
      sportName: "Grass Soccer",
      formatLabel: "Youth soccer club",
      city: normalizedCity,
      venueName: title,
      address: normalizedCity,
      dateDisplayMode: "ONGOING",
      dateDisplayText: "Club programs by season",
      scheduleText: `${title} is listed in the OYSA ${region} region member-club directory.`,
      participantOptionsText:
        "Youth soccer club programs, teams, tryouts, camps, or registrations may be available on the official club site.",
      description: `${title} is listed by Oregon Youth Soccer Association as a member youth soccer club in ${normalizedCity}. Use the official club website for current team, tryout, camp, registration, and contact information.`,
      warnings: [
        "Directory candidate only. Inspect the official club site before adding teams, tryouts, camps, or registrations.",
      ],
    });
  }

  return {
    candidates: candidates.sort((a, b) => a.title.localeCompare(b.title)),
    skippedRows,
  };
};

const buildMapping = async () => {
  const html = await fetchDirectoryHtml();
  const parsed = parseDirectoryCandidates(html);
  const mapping: AffiliateScrapeMapping = {
    kind: "CLUB",
    listUrl: LIST_URL,
    itemSelector: "body",
    fields: {
      title: {
        selector: "body",
        mode: "literal",
        value: "Oregon Youth Soccer Find-a-Club Directory",
      },
      officialActionUrl: {
        selector: "body",
        mode: "literal",
        value: LIST_URL,
      },
    },
    dedupe: {
      fields: ["officialActionUrl", "title", "city"],
    },
    manualCandidates: parsed.candidates,
  };

  return { mapping, skippedRows: parsed.skippedRows };
};

const upsertSourceAndMapping = async (
  mapping: AffiliateScrapeMapping,
  skippedRows: Array<{ title: string; href: string; reason: string }>,
) => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: "Oregon Youth Soccer Find-a-Club Directory",
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: "CLUB",
      status: "ACTIVE",
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 43200,
      notes:
        "Manual-candidate directory source for OYSA member clubs. It creates discovered CLUB candidates and unpublished public organization targets for admin review; individual club websites should be inspected before importing teams, tryouts, camps, or registrations.",
      metadata: {
        inspectedAt: "2026-07-09",
        platform: "WordPress directory page",
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
        skippedRows,
      },
    },
    update: {
      name: "Oregon Youth Soccer Find-a-Club Directory",
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: "CLUB",
      status: "ACTIVE",
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 43200,
      notes:
        "Manual-candidate directory source for OYSA member clubs. It creates discovered CLUB candidates and unpublished public organization targets for admin review; individual club websites should be inspected before importing teams, tryouts, camps, or registrations.",
      metadata: {
        inspectedAt: "2026-07-09",
        platform: "WordPress directory page",
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
        skippedRows,
      },
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      notes:
        "Manual candidates generated from OYSA Find-a-Club member club rows. Suspicious malformed links are skipped in source metadata.",
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        "Manual candidates generated from OYSA Find-a-Club member club rows. Suspicious malformed links are skipped in source metadata.",
      validatedAt: new Date(),
    },
  });
};

const main = async () => {
  const shouldScrape = process.argv.includes("--scrape");
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  const { mapping, skippedRows } = await buildMapping();
  await upsertSourceAndMapping(mapping, skippedRows);

  console.log(
    `Configured ${SOURCE_KEY} with ${mapping.manualCandidates?.length ?? 0} club candidates.`,
  );
  console.log(
    `Skipped ${skippedRows.length} malformed or incomplete directory rows.`,
  );
  skippedRows.slice(0, 10).forEach((row) => {
    console.log(`- skipped ${row.title}: ${row.reason}`);
  });

  if (shouldScrape) {
    const {
      runAffiliateSourceScrape,
    }: { runAffiliateSourceScrape: RunAffiliateSourceScrape } = await import(
      "../src/server/affiliateImports/service"
    );
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidates saved.`,
    );
    console.log(JSON.stringify(result.run.logs, null, 2));
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
