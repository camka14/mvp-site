/**
 * Oregon State Hockey Association Youth Hockey directory.
 *
 * Owns source `oregon-state-hockey-youth-directory`, mapping
 * `affiliate_mapping_oregon_state_hockey_youth_directory_v1`, and source
 * organization `affiliate_org_oregon_state_hockey_association`. Running without
 * `--scrape` only upserts the source org, normalized OSHA logo, source, and
 * mapping. Running with `--scrape` creates or updates DISCOVERED CLUB
 * candidates for admin review.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import path from "path";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";
import type { AffiliateScrapeMapping } from "../src/server/affiliateImports/types";

loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });

type RunAffiliateSourceScrape =
  typeof import("../src/server/affiliateImports/service").runAffiliateSourceScrape;

const OWNER_EMAIL = "samuel.r@razumly.com";
const ORG_ID = "affiliate_org_oregon_state_hockey_association";
const LOGO_FILE_ID = "affiliate_file_oregon_state_hockey_association_logo";
const SOURCE_ID = "affiliate_source_oregon_state_hockey_youth_directory";
const SOURCE_KEY = "oregon-state-hockey-youth-directory";
const MAPPING_ID = "affiliate_mapping_oregon_state_hockey_youth_directory_v1";
const BASE_URL = "https://www.oregonstatehockey.com/";
const LIST_URL = "https://www.oregonstatehockey.com/youth-hockey.html";
const LOGO_SOURCE_URL =
  "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/published/final-osha.png?1695579945";
const PUBLIC_SLUG = "oregon-state-hockey-association";
const ORGANIZER_DESCRIPTION =
  "Oregon State Hockey Association supports youth hockey programs across Oregon and lists local youth hockey organizations, girls hockey, spring and summer development programs, and Team Oregon opportunities.";

const DIRECTORY_ROWS = [
  {
    title: "Rose City Hockey Club",
    region: "Portland Area",
    url: "http://www.rosecityhockeyclub.com/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/rosecity-logo_6.png?1696287810",
    city: "Portland, OR",
    programs: [
      "6U-16U Learn to Play / House Programs",
      "10U Development Team",
      "12/14U Tournament Team",
    ],
  },
  {
    title: "Winterhawks Jr. Hockey",
    region: "Portland Area",
    url: "https://www.winterhawksjrhockey.com/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/jrwinterhawks_3.png",
    city: "Portland, OR",
    programs: [
      "6U-18U Metro League (House/Rec Program)",
      "10U-18U Travel Teams",
      "16/19U Girls A",
    ],
  },
  {
    title: "Bend Rapids Youth Hockey",
    region: "Central Oregon",
    url: "http://www.bendrapidsyouthhockey.org/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/bend-rapids-logo_6.png?1696287777",
    city: "Bend, OR",
    programs: ["8U-18U House/Travel", "16U AA"],
  },
  {
    title: "Lane Amateur Hockey Association",
    region: "Willamette Valley",
    url: "http://www.laha.org/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/eug-jr-gen-logo_10.png?1696287771",
    city: "Eugene, OR",
    programs: ["6U-18U House/Travel"],
  },
  {
    title: "The Rink Exchange",
    region: "Willamette Valley",
    url: "http://www.therinkexchange.com/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/rink-exchange-logo_6.png",
    city: "Eugene, OR",
    programs: ["Ages 4+"],
  },
  {
    title: "Klamath Ice Sports",
    region: "Southern Oregon",
    url: "https://www.klamathicesports.org/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/ice-hawks-logo-final_6.jpg",
    city: "Klamath Falls, OR",
    programs: ["8U-18U House/Travel"],
  },
  {
    title: "Rogue Valley Hockey Association",
    region: "Southern Oregon",
    url: "https://rvhahockey.org/",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/rvha-reign_3.jpg?1696287820",
    city: "Medford, OR",
    programs: ["10U-18U House/Travel"],
  },
  {
    title: "Team Oregon",
    region: "Statewide",
    url: "https://www.oregonstatehockey.com/program-overview.html",
    logoUrl:
      "https://www.oregonstatehockey.com/uploads/1/1/9/5/119503984/editor/teamoregonlogo-fin_15.png",
    city: "Oregon",
    programs: ["12U-19U Tier II / AA travel teams"],
  },
];

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
    .trim({ background: "#ffffff", threshold: 10 })
    .png()
    .toBuffer()
    .catch(async () =>
      sharp(input, { animated: false }).rotate().png().toBuffer(),
    );
  const logo = await sharp(trimmed, { animated: false })
    .resize({ width: 820, height: 820, fit: "inside" })
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
      `Failed to download OSHA logo: ${response.status} ${response.statusText}`,
    );
  }
  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import("../src/lib/storageProvider");
  const stored = await getStorageProvider().putObject({
    data,
    originalName: "oregon-state-hockey-association-logo.png",
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
      originalName: "oregon-state-hockey-association-logo.png",
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
      originalName: "oregon-state-hockey-association-logo.png",
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
      name: "Oregon State Hockey Association",
      location: "Oregon",
      address: "Oregon",
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Hockey"],
      status: "LISTED",
      hasStripeAccount: false,
      verificationStatus: "UNVERIFIED",
      verificationReviewStatus: "NONE",
      coordinates: [-122.6765, 45.5231],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: "Oregon youth hockey programs",
      publicIntroText:
        "Find Oregon State Hockey Association youth hockey clubs and Team Oregon resources.",
      taxOrganizationType: "NONPROFIT_ORGANIZATION",
      operatesAthleticFacility: false,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
    update: {
      updatedAt: new Date(),
      name: "Oregon State Hockey Association",
      location: "Oregon",
      address: "Oregon",
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ["Hockey"],
      status: "LISTED",
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: "Oregon youth hockey programs",
      publicIntroText:
        "Find Oregon State Hockey Association youth hockey clubs and Team Oregon resources.",
      coordinates: [-122.6765, 45.5231],
      operatesAthleticFacility: false,
      defaultEventTaxHandling: "ORGANIZER_COLLECTS",
      defaultRentalTaxHandling: "ORGANIZER_COLLECTS",
    },
  });
};

const buildMapping = (): AffiliateScrapeMapping => ({
  kind: "CLUB",
  listUrl: LIST_URL,
  itemSelector: "body",
  fields: {
    title: {
      selector: "body",
      mode: "literal",
      value: "Oregon State Hockey Youth Hockey Directory",
    },
    officialActionUrl: { selector: "body", mode: "literal", value: LIST_URL },
  },
  dedupe: {
    fields: ["officialActionUrl", "title", "city"],
  },
  manualCandidates: DIRECTORY_ROWS.map((row) => ({
    listingKind: "CLUB",
    title: row.title,
    officialActionUrl: row.url,
    sourceUrl: LIST_URL,
    logoUrl: row.logoUrl,
    logoOriginalName: `${row.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}-logo.png`,
    organizerName: row.title,
    sportName: "Hockey",
    formatLabel: "Youth hockey club",
    city: row.city,
    venueName: row.title,
    address: row.city,
    tags: ["Club", "Youth"],
    dateDisplayMode: "ONGOING",
    dateDisplayText: "Club programs by season",
    scheduleText: `${row.title} is listed by Oregon State Hockey Association under ${row.region}.`,
    participantOptionsText: row.programs.join("; "),
    description: `${row.title} is listed by Oregon State Hockey Association as a ${row.region} youth hockey program. Published programs: ${row.programs.join("; ")}. Use the official club website for current teams, tryouts, camps, registration, and contact information.`,
    warnings: [
      "Directory candidate only. Inspect the official club site before adding teams, tryouts, camps, registrations, or logos.",
    ],
  })),
});

const upsertSourceAndMapping = async (mapping: AffiliateScrapeMapping) => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: "Oregon State Hockey Youth Hockey Directory",
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
        "Manual-candidate directory source for Oregon youth hockey programs listed by Oregon State Hockey Association. It creates CLUB candidates for admin review; individual club websites should be inspected before importing teams, tryouts, camps, registrations, or logos.",
      metadata: {
        inspectedAt: "2026-07-09",
        platform: "Weebly static page",
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
      },
    },
    update: {
      name: "Oregon State Hockey Youth Hockey Directory",
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: "CLUB",
      status: "ACTIVE",
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 43200,
      notes:
        "Manual-candidate directory source for Oregon youth hockey programs listed by Oregon State Hockey Association. It creates CLUB candidates for admin review; individual club websites should be inspected before importing teams, tryouts, camps, registrations, or logos.",
      metadata: {
        inspectedAt: "2026-07-09",
        platform: "Weebly static page",
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
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
        "Manual CLUB candidates generated from the Oregon State Hockey Youth Hockey directory.",
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        "Manual CLUB candidates generated from the Oregon State Hockey Youth Hockey directory.",
      validatedAt: new Date(),
    },
  });
};

const main = async () => {
  const shouldScrape = process.argv.includes("--scrape");
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  const mapping = buildMapping();
  await upsertSourceAndMapping(mapping);

  console.log(
    `Configured ${SOURCE_KEY} with ${mapping.manualCandidates?.length ?? 0} club candidates.`,
  );

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
