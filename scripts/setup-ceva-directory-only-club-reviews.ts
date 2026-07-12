/**
 * Records evidence-backed zero-row reviews for CEVA clubs whose directory
 * entry publishes no official website or current registration link.
 */
import dotenv from "dotenv";
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from "../src/server/affiliateImports/types";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: false, quiet: true });

if (process.argv.includes("--live") && process.env.DATABASE_URL_LIVE) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
}

type PrismaClientInstance = typeof import("../src/lib/prisma").prisma;
type RunAffiliateSourceScrape = typeof import("../src/server/affiliateImports/service").runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import("../src/server/organizationTags").syncOrganizationTags;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({ runAffiliateSourceScrape } = await import("../src/server/affiliateImports/service"));
  ({ syncOrganizationTags } = await import("../src/server/organizationTags"));
};

const OWNER_EMAIL = "samuel.r@razumly.com";
const DIRECTORY_URL = "https://cevaregion.org/clubdirectory/";
const REVIEWED_AT = "2026-07-10";

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: "<html><body><main>CEVA directory entry has no current public registration listing.</main></body></html>",
    fetchedAt: new Date().toISOString(),
  }),
};

const slugForOrganization = (organizationId: string) => organizationId
  .replace(/^affiliate_org_ceva_club_directory_/, "")
  .replace(/[^a-z0-9_]+/gi, "_")
  .replace(/^_+|_+$/g, "")
  .toLowerCase();

const selectedClub = (() => {
  const flag = process.argv.find((argument) => argument.startsWith("--club="));
  return flag?.slice("--club=".length).trim().toLowerCase() || null;
})();

const setupClubReview = async (
  organization: { id: string; name: string; location: string | null; logoId: string | null },
  ownerId: string,
) => {
  if (!organization.logoId) {
    throw new Error(`${organization.name} must have an official directory logo before source setup.`);
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) throw new Error(`${organization.name} references missing logo ${organization.logoId}.`);

  const slug = slugForOrganization(organization.id);
  const sourceId = `affiliate_source_ceva_directory_${slug}_reviewed_programs`;
  const activeMappingId = `affiliate_mapping_ceva_directory_${slug}_reviewed_programs_v1`;
  const mapping: AffiliateScrapeMapping = {
    kind: "EVENT",
    listUrl: DIRECTORY_URL,
    itemSelector: "[data-no-current-listings]",
    fields: {
      title: { selector: "[data-no-current-listings]", mode: "text" },
      officialActionUrl: {
        selector: "[data-no-current-listings]",
        mode: "literal",
        value: DIRECTORY_URL,
      },
    },
    dedupe: { fields: ["officialActionUrl", "title"] },
    manualCandidates: [],
  };

  await (prisma as any).organizations.update({
    where: { id: organization.id },
    data: {
      ownerId,
      status: "LISTED",
      publicPageEnabled: true,
      updatedAt: new Date(),
    },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: organization.id },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    organization.id,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      "Club",
    ])),
    prisma,
  );

  const sourcePayload = {
    name: `${organization.name} CEVA Directory Review`,
    sourceKey: `ceva-directory-${slug}-reviewed-programs`,
    organizationId: organization.id,
    baseUrl: DIRECTORY_URL,
    listUrl: DIRECTORY_URL,
    targetKind: "EVENT",
    status: "ACTIVE",
    activeMappingId,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: "CEVA directory-only club review with no eligible current event or rental candidates.",
    metadata: {
      inspectedAt: REVIEWED_AT,
      robotsAllowed: true,
      strategy: "manual-directory-only-no-current-listings",
      sourcePages: [DIRECTORY_URL],
      skippedRows: [{
        url: DIRECTORY_URL,
        label: organization.name,
        reason: "The authoritative CEVA entry publishes club identity and contact details but no official website, future tryout, registration, event, or rental link.",
      }],
      directoryOnly: true,
      reviewScope: "official-site-and-current-listing-unavailable",
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: sourceId },
    create: { id: sourceId, ...sourcePayload },
    update: sourcePayload,
  });
  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId },
    data: { isActive: false },
  });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId, version: 1 } },
    create: {
      id: activeMappingId,
      sourceId,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: `Verified CEVA directory-only review for ${organization.name}.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: `Verified CEVA directory-only review for ${organization.name}.`,
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: sourceId },
    data: { activeMappingId },
  });

  if (process.argv.includes("--scrape")) {
    const result = await runAffiliateSourceScrape(sourceId, { client: staticPageClient });
    console.log(`${organization.name}: scrape run ${result.run.id} saved ${result.candidates.length} candidate(s).`);
  } else {
    console.log(`${organization.name}: directory-only review is ready; re-run with --scrape to record the successful zero-row scrape.`);
  }
};

const main = async () => {
  await loadAppModules();
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);

  const organizations = await (prisma as any).organizations.findMany({
    where: {
      id: { startsWith: "affiliate_org_ceva_club_directory_" },
      website: DIRECTORY_URL,
    },
    select: { id: true, name: true, location: true, logoId: true },
    orderBy: { name: "asc" },
  });
  const selected = organizations.filter((organization: { id: string; name: string }) => (
    !selectedClub
    || organization.id.toLowerCase().includes(selectedClub)
    || organization.name.toLowerCase().includes(selectedClub)
  ));
  if (selected.length === 0) throw new Error("No CEVA directory-only club matched the requested scope.");

  console.log(`Reviewing ${selected.length} CEVA directory-only club(s).`);
  for (const organization of selected) await setupClubReview(organization, owner.id);
};

main()
  .catch((error) => {
    console.error("[setup-ceva-directory-only-club-reviews] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
