/**
 * Portland Reign Basketball affiliate source setup.
 *
 * Owns public org `affiliate_org_portland_reign_basketball`, source
 * `affiliate_source_portland_reign_basketball`, and mapping
 * `affiliate_mapping_portland_reign_basketball_camps_v1`.
 * Official URLs: https://www.pdxreignbasketball.com/ and
 * https://www.pdxreignbasketball.com/camps. Owner: samuel.r@razumly.com.
 * Creates only reviewed future camp EVENT candidates from the public camp form;
 * it creates no CLUB or TEAM candidates. This script is local-only, `--scrape`
 * creates or updates candidates, and auto-scraping remains disabled. It also
 * downloads the official rendered header logo, normalizes it to an opaque
 * square, and assigns it to the public organization.
 */
import dotenv from "dotenv";
import path from "path";
import sharp from "sharp";
import type { Readable } from "stream";
import {
  PORTLAND_REIGN_CAMPS_URL,
  PORTLAND_REIGN_HOME_URL,
  PORTLAND_REIGN_MANUAL_CANDIDATES,
  PORTLAND_REIGN_MAPPING,
  PORTLAND_REIGN_ORG_DESCRIPTION,
  PORTLAND_REIGN_STATIC_PAGE_CLIENT,
  PORTLAND_REIGN_VENUE_ADDRESS,
  PORTLAND_REIGN_WITHHELD_ROWS,
} from "../src/server/affiliateImports/portlandReignBasketballSource";

dotenv.config({ quiet: true });
dotenv.config({
  path: path.join(process.cwd(), ".env.local"),
  override: false,
  quiet: true,
});

if (process.argv.includes("--live")) {
  throw new Error(
    "This Portland Reign Basketball setup is local-only and refuses --live.",
  );
}

type PrismaClientInstance = typeof import("../src/lib/prisma").prisma;
type RunAffiliateSourceScrape =
  typeof import("../src/server/affiliateImports/service").runAffiliateSourceScrape;
type GeocodeAddressToCoordinates =
  typeof import("../src/server/geocoding").geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({ runAffiliateSourceScrape } = await import(
    "../src/server/affiliateImports/service"
  ));
  ({ geocodeAddressToCoordinates } = await import("../src/server/geocoding"));
};

const OWNER_EMAIL = "samuel.r@razumly.com";
const ORG_ID = "affiliate_org_portland_reign_basketball";
const SOURCE_ID = "affiliate_source_portland_reign_basketball";
const SOURCE_KEY = "portland-reign-basketball";
const MAPPING_ID = "affiliate_mapping_portland_reign_basketball_camps_v1";
const PUBLIC_SLUG = "portland-reign-basketball";
const LOGO_FILE_ID = "affiliate_file_portland_reign_basketball_logo";
const LOGO_FILE_NAME = "portland-reign-basketball-logo-square.png";
const LOGO_SOURCE_URL =
  "https://static.wixstatic.com/media/a8ea68_de0cbf6c7e3a4da1a3add955bad35b54~mv2.webp";
const LOGO_BACKGROUND = "#edf1f3";

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
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

const venueCoordinates = async () => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { coordinates: true },
  });

  return (
    (await geocodeAddressToCoordinates(PORTLAND_REIGN_VENUE_ADDRESS)) ??
    existing?.coordinates ??
    null
  );
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  // The official transparent circular badge remains large enough for card
  // crops and small circular icons when centered on this full opaque canvas.
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({
      width: 900,
      height: 900,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 900;
  const height = metadata.height ?? 900;

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: LOGO_BACKGROUND,
    },
  })
    .composite([
      {
        input: logo,
        left: Math.round((1024 - width) / 2),
        top: Math.round((1024 - height) / 2),
      },
    ])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent": "BracketIQ source setup; contact samuel.r@razumly.com",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download Portland Reign logo: ${response.status} ${response.statusText}`,
    );
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const normalizedMetadata = await sharp(data).metadata();
  if (
    normalizedMetadata.width !== 1024 ||
    normalizedMetadata.height !== 1024 ||
    normalizedMetadata.hasAlpha
  ) {
    throw new Error(
      "Portland Reign logo normalization did not produce an opaque 1024x1024 PNG.",
    );
  }

  const { getStorageProvider } = await import("../src/lib/storageProvider");
  const storage = getStorageProvider();
  const existingFile = await (prisma as any).file.findUnique({
    where: { id: LOGO_FILE_ID },
    select: { path: true, bucket: true },
  });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;

  if (existingFile?.path) {
    try {
      const existing = await storage.getObjectStream({
        key: existingFile.path,
        bucket: existingFile.bucket,
      });
      if ((await streamToBuffer(existing.stream)).equals(data)) {
        stored = {
          key: existingFile.path,
          sizeBytes: data.length,
          bucket: existingFile.bucket ?? undefined,
        };
      }
    } catch {
      // The persisted row can outlive local storage; recreate its object below.
    }
  }

  if (!stored) {
    stored = await storage.putObject({
      data,
      originalName: LOGO_FILE_NAME,
      contentType: "image/png",
      organizationId: ORG_ID,
    });
  }

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: LOGO_FILE_NAME,
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
      originalName: LOGO_FILE_NAME,
      mimeType: "image/png",
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });

  return LOGO_FILE_ID;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await venueCoordinates();
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Portland Reign Basketball",
      location: "Portland, OR",
      address: PORTLAND_REIGN_VENUE_ADDRESS,
      description: PORTLAND_REIGN_ORG_DESCRIPTION,
      logoId,
      ownerId,
      website: PORTLAND_REIGN_HOME_URL,
      sports: ["Basketball"],
      status: "LISTED",
      hasStripeAccount: false,
      verificationStatus: "UNVERIFIED",
      verificationReviewStatus: "NONE",
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: "Portland Reign Basketball camps and programs",
      publicIntroText:
        "Review Portland Reign Basketball camps, youth programs, and official registration links.",
      taxOrganizationType: "INDIVIDUAL_OR_CLUB",
      operatesAthleticFacility: true,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
    update: {
      updatedAt: new Date(),
      name: "Portland Reign Basketball",
      location: "Portland, OR",
      address: PORTLAND_REIGN_VENUE_ADDRESS,
      description: PORTLAND_REIGN_ORG_DESCRIPTION,
      logoId,
      ownerId,
      website: PORTLAND_REIGN_HOME_URL,
      sports: ["Basketball"],
      status: "LISTED",
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: "Portland Reign Basketball camps and programs",
      publicIntroText:
        "Review Portland Reign Basketball camps, youth programs, and official registration links.",
      operatesAthleticFacility: true,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
  });
};

const sourceMetadata = {
  inspectedAt: "2026-07-15",
  robotsAllowed: true,
  robotsNote:
    "pdxreignbasketball.com/robots.txt allows public crawling and disallows only the lightbox query pattern for normal user agents.",
  termsNote:
    "The inspected Terms & Conditions and Privacy Policy pages contain Wix template boilerplate; no source-specific anti-bot or no-scraping restriction was found.",
  renderingRequired: true,
  renderingNote:
    "The Wix camp registration form was rendered to verify the date groups, registration options, prices, and action URL.",
  logoStatus: "VERIFIED_OFFICIAL",
  officialLogoSourcePageUrl: PORTLAND_REIGN_HOME_URL,
  officialLogoSourceUrl: LOGO_SOURCE_URL,
  logoSourceType:
    "Official Portland Reign header image named Reign Logo.webp, served through the official Wix site.",
  logoSourceDimensions: "554x554 transparent WebP inspected 2026-07-15.",
  logoNormalizedFormat: "opaque-1024-square-png",
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    "The official circular badge is transparency-trimmed, centered at a 900px safe area, and flattened onto one full light canvas so card crops, detail headers, list icons, and map markers do not inherit transparent corners.",
  cadence: "weekly",
  cadenceIntervalMinutes: 10080,
  sourceActionUrl: PORTLAND_REIGN_CAMPS_URL,
  withheldRows: PORTLAND_REIGN_WITHHELD_ROWS,
};

const upsertSourceAndMapping = async () => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: "Portland Reign Basketball",
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: PORTLAND_REIGN_HOME_URL,
      listUrl: PORTLAND_REIGN_CAMPS_URL,
      targetKind: "EVENT",
      status: "ACTIVE",
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        "Public Portland Reign source. Creates only reviewed future camp event candidates from the official registration form; no club or team candidates are created.",
      metadata: sourceMetadata,
    },
    update: {
      name: "Portland Reign Basketball",
      organizationId: ORG_ID,
      baseUrl: PORTLAND_REIGN_HOME_URL,
      listUrl: PORTLAND_REIGN_CAMPS_URL,
      targetKind: "EVENT",
      status: "ACTIVE",
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        "Public Portland Reign source. Creates only reviewed future camp event candidates from the official registration form; no club or team candidates are created.",
      metadata: sourceMetadata,
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
      mapping: PORTLAND_REIGN_MAPPING,
      createdByUserId: null,
      notes:
        "Manual Portland Reign future camp mapping from the rendered public Wix registration form reviewed July 15, 2026.",
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: PORTLAND_REIGN_MAPPING,
      notes:
        "Manual Portland Reign future camp mapping from the rendered public Wix registration form reviewed July 15, 2026.",
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes("--scrape");
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);

  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(
    `Portland Reign Basketball affiliate source ready: ${SOURCE_KEY}`,
  );
  console.log(
    `${PORTLAND_REIGN_MANUAL_CANDIDATES.length} future camp candidate(s) configured.`,
  );
  console.log(
    `${PORTLAND_REIGN_WITHHELD_ROWS.length} row(s) withheld: past, undated, or without a stable roster-level action target.`,
  );
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, {
      client: PORTLAND_REIGN_STATIC_PAGE_CLIENT,
    });
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved ` +
        `(created ${logs?.createdCandidateCount ?? "n/a"}, updated ${logs?.updatedCandidateCount ?? "n/a"}, rejected ${logs?.rejectedCount ?? "n/a"}).`,
    );
  } else {
    console.log(
      "Re-run with --scrape to create or update the future camp candidates.",
    );
  }
};

main()
  .catch((error) => {
    console.error(
      "[setup-portland-reign-basketball-affiliate-source] failed",
      error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
