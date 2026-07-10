/**
 * CEVA Club Directory.
 *
 * Owns source `ceva-club-directory`, mapping
 * `affiliate_mapping_ceva_club_directory_v1`, and CEVA source organization
 * `affiliate_org_ceva_region`. Running without `--scrape` only upserts the
 * source org, normalized CEVA logo, source, and mapping. Running with `--scrape`
 * creates or updates DISCOVERED CLUB candidates and unpublished organization
 * targets for admin review.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { JSDOM } from "jsdom";
import path from "path";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";
import type { AffiliateScrapeMapping } from "../src/server/affiliateImports/types";

loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });

type RunAffiliateSourceScrape =
  typeof import("../src/server/affiliateImports/service").runAffiliateSourceScrape;

const OWNER_EMAIL = "samuel.r@razumly.com";
const ORG_ID = "affiliate_org_ceva_region";
const LOGO_FILE_ID = "affiliate_file_ceva_region_logo";
const SOURCE_ID = "affiliate_source_ceva_club_directory";
const SOURCE_KEY = "ceva-club-directory";
const MAPPING_ID = "affiliate_mapping_ceva_club_directory_v1";
const BASE_URL = "https://cevaregion.org/";
const LIST_URL = "https://cevaregion.org/clubdirectory/";
const LOGO_SOURCE_URL =
  "https://cevaregion.org/wp-content/uploads/2025/05/ceva_header.png";
const PUBLIC_SLUG = "columbia-empire-volleyball-association";
const ORGANIZER_DESCRIPTION =
  "Columbia Empire Volleyball Association is the USA Volleyball region serving Oregon and Southwest Washington. CEVA sanctions junior club volleyball, power league play, regional championships, camps, tryouts, and club directory resources.";

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const normalizeClubName = (value: string) =>
  normalizeWhitespace(value.replace(/([A-Za-z0-9])\)+(?=[A-Za-z0-9])/g, "$1 "));

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

const normalizeLogo = async (input: Buffer) => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: "#ffffff", threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () =>
      sharp(input, { animated: false }).rotate().png().toBuffer(),
    );

  const logo = await sharp(trimmed, { animated: false })
    .resize({
      width: 780,
      height: 780,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download CEVA logo: ${response.status} ${response.statusText}`,
    );
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import("../src/lib/storageProvider");
  const stored = await getStorageProvider().putObject({
    data,
    originalName: "ceva-region-logo.png",
    contentType: "image/png",
    organizationId: ORG_ID,
  });

  return (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: "ceva-region-logo.png",
      mimeType: "image/png",
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: "ceva-region-logo.png",
      mimeType: "image/png",
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
      name: "Columbia Empire Volleyball Association",
      location: "Portland, OR",
      address: "Portland, OR",
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Indoor Volleyball"],
      status: "LISTED",
      hasStripeAccount: false,
      verificationStatus: "UNVERIFIED",
      verificationReviewStatus: "NONE",
      coordinates: [-122.6765, 45.5231],
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: "CEVA volleyball clubs and programs",
      publicIntroText:
        "Find Columbia Empire Volleyball Association club, league, championship, camp, and tryout resources.",
      taxOrganizationType: "NONPROFIT_ORGANIZATION",
      operatesAthleticFacility: false,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
    update: {
      updatedAt: new Date(),
      name: "Columbia Empire Volleyball Association",
      location: "Portland, OR",
      address: "Portland, OR",
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Indoor Volleyball"],
      status: "LISTED",
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: "CEVA volleyball clubs and programs",
      publicIntroText:
        "Find Columbia Empire Volleyball Association club, league, championship, camp, and tryout resources.",
      coordinates: [-122.6765, 45.5231],
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
      `Failed to fetch CEVA Club Directory page: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
};

const parseTitle = (rawTitle: string) => {
  const parts = normalizeWhitespace(rawTitle).split(/\s+[–—-]\s+/);
  if (parts.length < 2) {
    return null;
  }
  return {
    title: normalizeClubName(parts[0]),
    location: parts.slice(1).join(" - ").trim(),
  };
};

const extractField = (text: string, label: string, nextLabels: string[]) => {
  const escapedNext = nextLabels
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(
    `${label}:\\s*(.*?)(?=\\s+(?:${escapedNext}):|$)`,
    "i",
  );
  return normalizeWhitespace(regex.exec(text)?.[1] ?? "");
};

const normalizeWebsite = (href: string) => {
  try {
    const url = new URL(href, LIST_URL);
    if (!/^https?:$/.test(url.protocol)) {
      return null;
    }
    if (
      /(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)twitter\.com$|(^|\.)x\.com$/i.test(
        url.hostname,
      )
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const parseDirectoryCandidates = (html: string) => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const skippedRows: Array<{ title: string; reason: string }> = [];
  const seen = new Set<string>();
  const candidates: NonNullable<AffiliateScrapeMapping["manualCandidates"]> =
    [];

  for (const heading of Array.from(
    doc.querySelectorAll("h3.wp-block-heading"),
  )) {
    const parsedTitle = parseTitle(heading.textContent ?? "");
    if (!parsedTitle?.title || !parsedTitle.location) {
      continue;
    }

    const blockTextParts: string[] = [];
    const blockLinks: Array<{ text: string; href: string }> = [];
    let sibling = heading.nextElementSibling;
    while (sibling && !sibling.matches("h3.wp-block-heading")) {
      blockTextParts.push(normalizeWhitespace(sibling.textContent ?? ""));
      blockLinks.push(
        ...Array.from(sibling.querySelectorAll("a[href]")).map((link) => ({
          text: normalizeWhitespace(link.textContent ?? ""),
          href: link.getAttribute("href") ?? "",
        })),
      );
      sibling = sibling.nextElementSibling;
    }

    const website =
      blockLinks
        .map((link) => ({ ...link, normalized: normalizeWebsite(link.href) }))
        .find((link) => /^Club Website$/i.test(link.text) && link.normalized)
        ?.normalized ??
      blockLinks.map((link) => normalizeWebsite(link.href)).find(Boolean) ??
      null;

    const blockText = blockTextParts.join(" ");
    const designation = extractField(blockText, "Designation", [
      "Age Groups",
      "Contact",
      "Club Website",
    ]);
    const ageGroups = extractField(blockText, "Age Groups", [
      "Contact",
      "Club Website",
    ]);
    const officialActionUrl = website ?? LIST_URL;
    const dedupe = `${parsedTitle.title.toLowerCase()}|${parsedTitle.location.toLowerCase()}|${officialActionUrl.toLowerCase()}`;
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);

    const tags = ["Club"];
    if (/girls/i.test(designation)) tags.push("Girls");
    if (/boys/i.test(designation)) tags.push("Boys");
    const warnings = [
      "Directory candidate only. Inspect the official club site before adding teams, tryouts, camps, clinics, registrations, or logos.",
    ];
    if (!website) {
      warnings.push(
        "CEVA directory did not expose an official club website link; use the CEVA directory as the outbound source until a better official URL is found.",
      );
      skippedRows.push({
        title: parsedTitle.title,
        reason: "missing official club website link",
      });
    }

    const detailPieces = [
      designation ? `Designation: ${designation}.` : "",
      ageGroups ? `Age groups: ${ageGroups}.` : "",
    ].filter(Boolean);

    candidates.push({
      listingKind: "CLUB",
      title: parsedTitle.title,
      officialActionUrl,
      sourceUrl: LIST_URL,
      organizerName: parsedTitle.title,
      sportName: "Indoor Volleyball",
      formatLabel: designation || "Junior volleyball club",
      city: parsedTitle.location,
      venueName: parsedTitle.title,
      address: parsedTitle.location,
      tags,
      dateDisplayMode: "ONGOING",
      dateDisplayText: "Club programs by season",
      scheduleText: `${parsedTitle.title} is listed in CEVA's club directory for ${parsedTitle.location}.`,
      participantOptionsText:
        detailPieces.join(" ") ||
        "Junior volleyball club programs, teams, tryouts, camps, or registrations may be available on the official club site.",
      description: [
        `${parsedTitle.title} is listed by Columbia Empire Volleyball Association as a volleyball club in ${parsedTitle.location}.`,
        ...detailPieces,
        "Use the official club website or CEVA directory listing for current team, tryout, camp, registration, and contact information.",
      ].join(" "),
      warnings,
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
        value: "CEVA Club Directory",
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
  skippedRows: Array<{ title: string; reason: string }>,
) => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: "CEVA Club Directory",
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
        "Manual-candidate directory source for Columbia Empire Volleyball Association member clubs. It creates discovered CLUB candidates and unpublished public organization targets for admin review; individual club websites should be inspected before importing teams, tryouts, camps, clinics, registrations, or logos.",
      metadata: {
        inspectedAt: "2026-07-09",
        platform: "WordPress directory page",
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
        skippedRows,
      },
    },
    update: {
      name: "CEVA Club Directory",
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: "CLUB",
      status: "ACTIVE",
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 43200,
      notes:
        "Manual-candidate directory source for Columbia Empire Volleyball Association member clubs. It creates discovered CLUB candidates and unpublished public organization targets for admin review; individual club websites should be inspected before importing teams, tryouts, camps, clinics, registrations, or logos.",
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
        "Manual candidates generated from CEVA club directory rows. Missing official club website links are retained as warnings and use the CEVA directory URL until a better official URL is found.",
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        "Manual candidates generated from CEVA club directory rows. Missing official club website links are retained as warnings and use the CEVA directory URL until a better official URL is found.",
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
    `${skippedRows.length} candidates did not expose an official club website link.`,
  );
  skippedRows.slice(0, 10).forEach((row) => {
    console.log(`- review ${row.title}: ${row.reason}`);
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
