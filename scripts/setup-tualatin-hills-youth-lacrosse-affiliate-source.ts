/**
 * Tualatin Hills Youth Lacrosse / TVYLL member-club directory.
 *
 * Target kind: CLUB directory.
 * Official URL: https://www.tualatinhillsparks.org/624/Youth-Lacrosse
 * Owns source `tualatin-hills-youth-lacrosse-directory`, mapping
 * `affiliate_mapping_tualatin_hills_youth_lacrosse_directory_v1`, source org
 * `affiliate_org_tualatin_hills_park_recreation_district`, and its normalized
 * official seal. Owner: samuel.r@razumly.com.
 *
 * This script is local-only. Without `--scrape` it repairs the source records;
 * with `--scrape` it creates or updates six review-only CLUB candidates. It
 * never publishes candidates and keeps automatic scraping disabled.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import path from "path";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";
import { geocodeAddressToCoordinates } from "../src/server/geocoding";
import { parseTualatinHillsYouthLacrosseDirectory } from "../src/server/affiliateImports/tualatinHillsYouthLacrosseSource";
import type { AffiliateScrapeMapping } from "../src/server/affiliateImports/types";

loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });

type RunAffiliateSourceScrape =
  typeof import("../src/server/affiliateImports/service").runAffiliateSourceScrape;

const OWNER_EMAIL = "samuel.r@razumly.com";
const ORG_ID = "affiliate_org_tualatin_hills_park_recreation_district";
const LOGO_FILE_ID = "affiliate_file_tualatin_hills_park_recreation_district_logo";
const SOURCE_ID = "affiliate_source_tualatin_hills_youth_lacrosse_directory";
const SOURCE_KEY = "tualatin-hills-youth-lacrosse-directory";
const MAPPING_ID =
  "affiliate_mapping_tualatin_hills_youth_lacrosse_directory_v1";
const BASE_URL = "https://www.tualatinhillsparks.org/";
const LIST_URL =
  "https://www.tualatinhillsparks.org/624/Youth-Lacrosse";
const LOGO_SOURCE_URL =
  "https://www.tualatinhillsparks.org/ImageRepository/Document?documentId=1632";
const ORG_ADDRESS = "15707 SW Walker Road, Beaverton, OR 97006";
const PUBLIC_SLUG = "tualatin-hills-park-recreation-district";
const ORGANIZER_DESCRIPTION =
  "Tualatin Hills Park & Recreation District serves the greater Beaverton area with parks, facilities, recreation programs, sports, events, and rentals. Its youth lacrosse page identifies Tualatin Valley Youth Lacrosse League member clubs and directs families to the club that serves their Beaverton School District attendance area.";

const assertLocalDatabase = () => {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is not set.");
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(
      `Refusing to configure ${SOURCE_KEY} outside the local database (host: ${hostname}).`,
    );
  }
};

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
  const normalized = await sharp(input, { animated: false })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "cover" })
    .flatten({ background: "#e7e7e7" })
    .removeAlpha()
    .png()
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  if (
    metadata.width !== 1024 ||
    metadata.height !== 1024 ||
    metadata.hasAlpha
  ) {
    throw new Error("Normalized THPRD logo is not an opaque 1024x1024 PNG.");
  }
  return normalized;
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      "user-agent":
        "BracketIQ source review bot; contact samuel.r@razumly.com",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download the official THPRD seal: ${response.status} ${response.statusText}`,
    );
  }

  const data = await normalizeLogo(
    Buffer.from(await response.arrayBuffer()),
  );
  const { getStorageProvider } = await import("../src/lib/storageProvider");
  const stored = await getStorageProvider().putObject({
    data,
    originalName: "tualatin-hills-park-recreation-district-logo.png",
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
      originalName: "tualatin-hills-park-recreation-district-logo.png",
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
      originalName: "tualatin-hills-park-recreation-district-logo.png",
      mimeType: "image/png",
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates(ORG_ADDRESS);
  if (!coordinates) {
    throw new Error(`Unable to geocode THPRD address: ${ORG_ADDRESS}`);
  }

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Tualatin Hills Park & Recreation District",
      location: "Beaverton, OR",
      address: ORG_ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Lacrosse"],
      enabledFeatures: ["CLUB_TEAMS"],
      status: "LISTED",
      hasStripeAccount: false,
      verificationStatus: "UNVERIFIED",
      verificationReviewStatus: "NONE",
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: "Tualatin Hills youth sports and recreation",
      publicIntroText:
        "Find youth lacrosse member clubs and official district recreation links.",
      taxOrganizationType: "NONPROFIT_OR_ASSOCIATION",
      operatesAthleticFacility: true,
      defaultEventTaxHandling: "EXEMPT_PARTICIPANT_SPORTS",
      defaultRentalTaxHandling: "STRIPE_TAX",
    },
    update: {
      updatedAt: new Date(),
      name: "Tualatin Hills Park & Recreation District",
      location: "Beaverton, OR",
      address: ORG_ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Lacrosse"],
      enabledFeatures: ["CLUB_TEAMS"],
      status: "LISTED",
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: "Tualatin Hills youth sports and recreation",
      publicIntroText:
        "Find youth lacrosse member clubs and official district recreation links.",
      taxOrganizationType: "NONPROFIT_OR_ASSOCIATION",
      operatesAthleticFacility: true,
      defaultEventTaxHandling: "EXEMPT_PARTICIPANT_SPORTS",
      defaultRentalTaxHandling: "STRIPE_TAX",
    },
  });
};

const fetchDirectoryHtml = async () => {
  const response = await fetch(LIST_URL, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "BracketIQ source review bot; contact samuel.r@razumly.com",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch THPRD youth lacrosse page: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
};

const buildMapping = async () => {
  const parsed = parseTualatinHillsYouthLacrosseDirectory(
    await fetchDirectoryHtml(),
  );
  if (parsed.candidates.length !== 6) {
    throw new Error(
      `Expected 6 THPRD youth lacrosse member clubs, found ${parsed.candidates.length}. Review the rendered directory before changing the expected count.`,
    );
  }

  const mapping: AffiliateScrapeMapping = {
    kind: "CLUB",
    listUrl: LIST_URL,
    itemSelector: ".fr-view",
    fields: {
      title: {
        selector: ".fr-view",
        mode: "literal",
        value: "Tualatin Hills Youth Lacrosse Member Clubs",
      },
      officialActionUrl: {
        selector: ".fr-view",
        mode: "literal",
        value: LIST_URL,
      },
    },
    dedupe: { fields: ["officialActionUrl", "title", "city"] },
    manualCandidates: parsed.candidates,
  };
  return { mapping, skippedRows: parsed.skippedRows };
};

const upsertSourceAndMapping = async (
  mapping: AffiliateScrapeMapping,
  skippedRows: Array<{ title: string; href: string; reason: string }>,
) => {
  const sourceData = {
    name: "Tualatin Hills Youth Lacrosse Member Club Directory",
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: "CLUB",
    status: "ACTIVE",
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes:
      "Review-only directory source for six TVYLL member clubs named by THPRD. It creates CLUB candidates only. Each official club website must be reviewed independently before importing tryouts, camps, clinics, registrations, divisions, prices, facilities, or teams.",
    metadata: {
      inspectedAt: "2026-07-19",
      platform: "CivicPlus public directory page",
      robotsAllowed: true,
      robotsNotes:
        "The target /624/Youth-Lacrosse path is not disallowed for User-agent: *. Admin, search, map, support, and current-events paths remain disallowed.",
      renderedMemberClubCount: 6,
      logoSourceUrl: LOGO_SOURCE_URL,
      sourceAddress: ORG_ADDRESS,
      skippedRows,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, sourceKey: SOURCE_KEY, ...sourceData },
    update: sourceData,
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
        "Six manual CLUB candidates parsed from the rendered Member Clubs list. The TVYLL parent link and attendance-boundary link are intentionally excluded.",
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        "Six manual CLUB candidates parsed from the rendered Member Clubs list. The TVYLL parent link and attendance-boundary link are intentionally excluded.",
      validatedAt: new Date(),
    },
  });
};

const main = async () => {
  assertLocalDatabase();
  const shouldScrape = process.argv.includes("--scrape");
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  const { mapping, skippedRows } = await buildMapping();
  await upsertSourceAndMapping(mapping, skippedRows);

  console.log(
    `Configured ${SOURCE_KEY} with ${mapping.manualCandidates?.length ?? 0} club candidates.`,
  );
  console.log(`Skipped ${skippedRows.length} malformed directory rows.`);

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
