/**
 * Records final evidence-backed zero-row reviews for direct club websites that
 * did not publish an eligible future standalone event or facility rental.
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

type ReviewDefinition = {
  key: string;
  organizationId: string;
  organizationName: string;
  website: string;
  location: string;
  organizationTags: string[];
  sourcePages: string[];
  reviewReason: string;
  robotsAllowed: boolean | null;
};

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({ runAffiliateSourceScrape } = await import("../src/server/affiliateImports/service"));
  ({ syncOrganizationTags } = await import("../src/server/organizationTags"));
};

const OWNER_EMAIL = "samuel.r@razumly.com";
const REVIEWED_AT = "2026-07-10";
const CEVA_DIRECTORY = "https://cevaregion.org/clubdirectory/";

const reviews: ReviewDefinition[] = [
  {
    key: "blues-vbc-final-review",
    organizationId: "affiliate_org_ceva_club_directory_blues_vbc",
    organizationName: "Blues VBC",
    website: "https://bluesvbclub.usetopscore.com/",
    location: "Portland, OR",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: [CEVA_DIRECTORY, "https://bluesvbclub.usetopscore.com/", "https://bluesvbclub.com/"],
    reviewReason: "CEVA identifies the TopScore site as the club website, but both official hostnames returned HTTP 503 during review and the directory publishes no current tryout or registration row.",
    robotsAllowed: true,
  },
  {
    key: "cherry-city-juniors-final-review",
    organizationId: "affiliate_org_ceva_club_directory_cherry_city_juniors_vbc",
    organizationName: "Cherry City Juniors VBC",
    website: "https://cherrycityjrsvb.sportngin.com/",
    location: "The Dalles, OR",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: ["https://cherrycityjrsvb.sportngin.com/", "https://cherrycityjrsvb.sportngin.com/register/form/682679572"],
    reviewReason: "The only public registration is for the 2025-26 season and says all tryouts were held November 16, 2025, so it is past.",
    robotsAllowed: true,
  },
  {
    key: "coast-to-coast-futbol-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_coast_to_coast_futbol_academy",
    organizationName: "Coast to Coast Futbol Academy",
    website: "https://ccfutbolacademy.com/",
    location: "Klamath Falls, OR",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: ["https://ccfutbolacademy.com/", "https://playmetrics.com/"],
    reviewReason: "The official site promotes a 2026-27 player tryout waitlist and says a second tryout will occur in November, but it publishes no exact future date, time, or standalone event row.",
    robotsAllowed: true,
  },
  {
    key: "crushers-vbc-final-review",
    organizationId: "affiliate_org_ceva_club_directory_crushers_vbc",
    organizationName: "Crushers VBC",
    website: "https://www.sportsengine.com/org/crushers-volleyball-club",
    location: "St. Helens, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: [
      "https://www.sportsengine.com/org/crushers-volleyball-club",
      "https://www.sportsengine.com/org/crushers-volleyball-club/program/12u-power-league",
      "https://www.sportsengine.com/org/crushers-volleyball-club/program/14u-power-league",
      "https://www.sportsengine.com/org/crushers-volleyball-club/program/16u-power-league",
    ],
    reviewReason: "The public SportsEngine program rows are historical 2022-23 Power League seasons and no current future-dated registration is published.",
    robotsAllowed: true,
  },
  {
    key: "fc-piamonte-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte",
    organizationName: "FC Piamonte",
    website: "https://www.fcpiamonte.org/",
    location: "Vancouver, WA / Portland metro",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://www.fcpiamonte.org/", "https://www.fcpiamonte.org/Default.aspx?tabid=1069925"],
    reviewReason: "The active Sports Connect rows are 2026-27 team/player season registrations whose season began March 2, 2026; they are not imported as future standalone events and teams remain out of scope.",
    robotsAllowed: true,
  },
  {
    key: "happy-valley-vbc-final-review",
    organizationId: "affiliate_org_ceva_club_directory_happy_valley_volleyball_club_hvvc",
    organizationName: "Happy Valley Volleyball Club (HVVC)",
    website: "https://www.hvvcvolleyballclub.com/",
    location: "Happy Valley, OR",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: [
      "https://www.hvvcvolleyballclub.com/",
      "https://www.hvvcvolleyballclub.com/program-open-gyms/",
      "https://www.hvvcvolleyballclub.com/events/",
      "https://hvvc.leagueapps.com/clubteams/4797399-hvvc-tryouts-25-26",
    ],
    reviewReason: "Open-gym dates are published only through Instagram and the linked tryout registration is explicitly for 2025-26; the official site publishes no exact future standalone row.",
    robotsAllowed: true,
  },
  {
    key: "lane-amateur-hockey-final-review",
    organizationId: "affiliate_org_oregon_state_hockey_youth_directory_lane_amateur_hockey_association",
    organizationName: "Lane Amateur Hockey Association",
    website: "https://www.laha.org/",
    location: "Eugene, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: [
      "https://www.laha.org/",
      "https://www.laha.org/2025-2026-season-registration/",
      "https://www.laha.org/ice-cup-10u-12u/",
      "https://www.laha.org/tournaments/",
    ],
    reviewReason: "The published youth season ended in March 2026 and the Ice Cup occurred February 13-16, 2026; no 2026-27 season or future tournament row is posted.",
    robotsAllowed: true,
  },
  {
    key: "lincoln-youth-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_lincoln_youth_soccer",
    organizationName: "Lincoln Youth Soccer",
    website: "https://lincolnyouthsoccer.org/",
    location: "Portland, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: [
      "https://lincolnyouthsoccer.org/",
      "https://lincolnyouthsoccer.org/camp-classes/",
      "https://lincolnyouthsoccer.org/register-now/",
      "https://lincolnyouthsoccer.org/lys-select-2026-2027-intent-to-play-registration-now-open-register-today/",
    ],
    reviewReason: "The site has current Select player-interest registration, but no exact future event start date, camp date, or public facility rental offering is published.",
    robotsAllowed: true,
  },
  {
    key: "lower-columbia-elite-final-review",
    organizationId: "affiliate_org_ceva_club_directory_lower_columbia_elite_vbc",
    organizationName: "Lower Columbia Elite VBC",
    website: CEVA_DIRECTORY,
    location: "Longview, WA",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: [CEVA_DIRECTORY, "https://www.lowercolumbiaelite.us/"],
    reviewReason: "The official club domain did not resolve during review and the authoritative CEVA entry publishes no current event or registration link, so the directory is retained as the public fallback.",
    robotsAllowed: null,
  },
  {
    key: "mid-valley-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_mid_valley_soccer_club",
    organizationName: "Mid Valley Soccer Club",
    website: "https://www.midvalleysoccerclub.org/",
    location: "Keizer, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://www.midvalleysoccerclub.org/", "https://www.midvalleysoccerclub.org/Default.aspx?tabid=1435541"],
    reviewReason: "The program page publishes general seasonal formats and prices but no source-provided future season start date or standalone event row.",
    robotsAllowed: true,
  },
  {
    key: "oregon-surf-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_oregon_surf",
    organizationName: "Oregon Surf",
    website: "https://oregonsurf.org/",
    location: "Portland, OR",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: ["https://oregonsurf.org/", "https://oregonsurf.org/tryout/", "https://oregonsurf.org/program-overview/"],
    reviewReason: "The active 2026-27 player-interest page describes full-year team programs, not a future-dated tryout or standalone event; no public facility rental is offered.",
    robotsAllowed: true,
  },
  {
    key: "reynolds-youth-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_reynolds_youth_soccer_club",
    organizationName: "Reynolds Youth Soccer Club",
    website: "https://tshq.bluesombrero.com/Default.aspx?tabid=2276526",
    location: "Portland, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://tshq.bluesombrero.com/Default.aspx?tabid=2276526", "https://tshq.bluesombrero.com/Default.aspx?tabid=2276532"],
    reviewReason: "The official Available Programs page explicitly says no programs or divisions are currently displayed.",
    robotsAllowed: true,
  },
  {
    key: "rogue-united-fc-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_rogue_united_fc",
    organizationName: "Rogue United FC",
    website: "https://rogueunitedfc.com/",
    location: "Central Point, OR",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: ["https://rogueunitedfc.com/", "https://rogueunitedfc.com/2026-27-season-competitive-tryouts/", "https://rogueunitedfc.com/upcoming-events/"],
    reviewReason: "The 2026-27 tryout page lists only May and June sessions and says rosters were finalized before July 1; all published tryout dates are past.",
    robotsAllowed: true,
  },
  {
    key: "sherwood-youth-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_sherwood_youth_soccer_club",
    organizationName: "Sherwood Youth Soccer Club",
    website: "https://www.sherwoodsoccer.org/",
    location: "Sherwood, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://www.sherwoodsoccer.org/", "https://www.sherwoodsoccer.org/Default.aspx?tabid=854290", "https://www.sherwoodsoccer.org/Default.aspx?tabid=1309073"],
    reviewReason: "The fall program says practices start in August but gives no exact future start date; linked summer camps are third-party offerings and no public club rental is advertised.",
    robotsAllowed: true,
  },
  {
    key: "siuslaw-youth-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_siuslaw_youth_soccer_association",
    organizationName: "Siuslaw Youth Soccer Association",
    website: "https://www.siuslawsoccer.com/siuslawysa",
    location: "Florence, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://www.siuslawsoccer.com/siuslawysa", "https://www.siuslawsoccer.com/Default.aspx?tabid=1626738"],
    reviewReason: "The official Available Programs page explicitly says no programs or divisions are currently displayed.",
    robotsAllowed: true,
  },
  {
    key: "team-oregon-hockey-final-review",
    organizationId: "affiliate_org_oregon_state_hockey_youth_directory_team_oregon",
    organizationName: "Team Oregon",
    website: "https://www.oregonstatehockey.com/program-overview.html",
    location: "Oregon",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: [
      "https://www.oregonstatehockey.com/program-overview.html",
      "https://www.oregonstatehockey.com/development-camps.html",
      "https://www.oregonstatehockey.com/18u-team-oregon-tryouts.html",
    ],
    reviewReason: "The 2026 development camp occurred February 6-8 and no future Team Oregon tryout date or current registration row is published.",
    robotsAllowed: true,
  },
  {
    key: "union-county-youth-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_union_county_youth_soccer_association",
    organizationName: "Union County Youth Soccer Association",
    website: "https://leagues.bluesombrero.com/Default.aspx?tabid=1439776",
    location: "La Grande, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://leagues.bluesombrero.com/Default.aspx?tabid=1439776", "https://leagues.bluesombrero.com/Default.aspx?tabid=1439782"],
    reviewReason: "The 2026 Summer recreational season began June 29, registration closed June 8, and the source publishes no later future-starting standalone event.",
    robotsAllowed: true,
  },
  {
    key: "vancouver-vbc-final-review",
    organizationId: "affiliate_org_ceva_club_directory_vancouver_vbc",
    organizationName: "Vancouver VBC",
    website: "https://vancouvervolleyballclub.teamsnapsites.com/",
    location: "Vancouver, WA",
    organizationTags: ["Club", "Training Provider"],
    sourcePages: [
      "https://vancouvervolleyballclub.teamsnapsites.com/",
      "https://vancouvervolleyballclub.teamsnapsites.com/registration/",
      "https://vancouvervolleyballclub.teamsnapsites.com/program-info/",
    ],
    reviewReason: "The registration page is for the 2025-26 club season and its tryout form; no 2026-27 exact future tryout date is published.",
    robotsAllowed: true,
  },
  {
    key: "whk-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_whk_soccer_club",
    organizationName: "WHK Soccer Club",
    website: "https://www.whksoccer.org/",
    location: "Portland, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://www.whksoccer.org/", "https://www.whksoccer.org/programs", "https://www.whksoccer.org/register", "https://www.whksoccer.org/facilities"],
    reviewReason: "The current site publishes general program, registration, and field information but no exact future event date or public facility rental action.",
    robotsAllowed: true,
  },
  {
    key: "woodburn-fc-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_woodburn_fc",
    organizationName: "WOODBURN FC",
    website: "https://clubs.bluesombrero.com/default.aspx?portalid=50644",
    location: "Woodburn, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: [
      "https://clubs.bluesombrero.com/default.aspx?portalid=50644",
      "https://clubs.bluesombrero.com/Default.aspx?tabid=1432993",
      "https://dt5602vnjxv0c.cloudfront.net/portals/50644/images/screenshot%202026-03-29%20at%202.52.30%E2%80%AFpm.png",
    ],
    reviewReason: "The official 2026-27 tryout schedule image lists May 4-15 sessions, all of which are past; no later future event is published.",
    robotsAllowed: true,
  },
  {
    key: "winterhawks-jr-hockey-final-review",
    organizationId: "affiliate_org_oregon_state_hockey_youth_directory_winterhawks_jr_hockey",
    organizationName: "Winterhawks Jr. Hockey",
    website: "https://www.winterhawksjrhockey.com/",
    location: "Portland, OR",
    organizationTags: ["Club", "League Operator"],
    sourcePages: ["https://www.winterhawksjrhockey.com/", "https://www.oregonstatehockey.com/youth-hockey.html"],
    reviewReason: "The official club site returned HTTP 525 during repeated review attempts and the OSHA directory publishes no current future-dated event row.",
    robotsAllowed: null,
  },
  {
    key: "yamhill-carlton-soccer-final-review",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_yamhill_carlton_soccer_club",
    organizationName: "Yamhill Carlton Soccer Club",
    website: "https://www.ycsoccerclub.com/",
    location: "Carlton, OR",
    organizationTags: ["Club", "League Operator", "Training Provider"],
    sourcePages: ["https://www.ycsoccerclub.com/", "https://www.ycsoccerclub.com/programs-events", "https://www.ycsoccerclub.com/registration-info"],
    reviewReason: "The published Spring 2026 programming is past and the site says fall registration is opening soon without an exact future program start date.",
    robotsAllowed: true,
  },
];

const selectedReviews = (() => {
  const flag = process.argv.find((argument) => argument.startsWith("--club="));
  if (!flag) return reviews;
  const value = flag.slice("--club=".length).trim().toLowerCase();
  return reviews.filter((review) => (
    review.key.toLowerCase().includes(value)
    || review.organizationName.toLowerCase().includes(value)
  ));
})();

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: "<html><body><main>No eligible current source-backed listings.</main></body></html>",
    fetchedAt: new Date().toISOString(),
  }),
};

const sourceId = (review: ReviewDefinition) => `affiliate_source_${review.key.replace(/-/g, "_")}`;
const mappingId = (review: ReviewDefinition) => `affiliate_mapping_${review.key.replace(/-/g, "_")}_v1`;

const setupReview = async (review: ReviewDefinition, ownerId: string) => {
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: review.organizationId },
    select: { logoId: true },
  });
  if (!organization?.logoId) throw new Error(`${review.organizationName} must have an official logo before source setup.`);
  if (!await (prisma as any).file.findUnique({ where: { id: organization.logoId }, select: { id: true } })) {
    throw new Error(`${review.organizationName} references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: review.organizationId },
    data: {
      ownerId,
      website: review.website,
      location: review.location,
      status: "LISTED",
      publicPageEnabled: true,
      updatedAt: new Date(),
    },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: review.organizationId },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(review.organizationId, Array.from(new Set([
    ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
    ...review.organizationTags,
  ])), prisma);

  const id = sourceId(review);
  const activeMappingId = mappingId(review);
  const mapping: AffiliateScrapeMapping = {
    kind: "EVENT",
    listUrl: review.sourcePages[0] ?? review.website,
    itemSelector: "[data-no-current-listings]",
    fields: {
      title: { selector: "[data-no-current-listings]", mode: "text" },
      officialActionUrl: { selector: "[data-no-current-listings]", mode: "literal", value: review.website },
    },
    dedupe: { fields: ["officialActionUrl", "title"] },
    manualCandidates: [],
  };
  const sourcePayload = {
    name: `${review.organizationName} Final Current Programs Review`,
    sourceKey: review.key,
    organizationId: review.organizationId,
    baseUrl: review.website,
    listUrl: review.sourcePages[0] ?? review.website,
    targetKind: "EVENT",
    status: "ACTIVE",
    activeMappingId,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: "Manual source review with no eligible future standalone event or facility rental candidates.",
    metadata: {
      inspectedAt: REVIEWED_AT,
      robotsAllowed: review.robotsAllowed,
      strategy: "manual-reviewed-no-current-listings",
      sourcePages: review.sourcePages,
      skippedRows: review.sourcePages.map((url) => ({ url, reason: review.reviewReason })),
      reviewReason: review.reviewReason,
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({ where: { id }, create: { id, ...sourcePayload }, update: sourcePayload });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: id }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: id, version: 1 } },
    create: {
      id: activeMappingId,
      sourceId: id,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: `Verified final no-current-listings review for ${review.organizationName}.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: `Verified final no-current-listings review for ${review.organizationName}.`,
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id }, data: { activeMappingId } });

  if (process.argv.includes("--scrape")) {
    const result = await runAffiliateSourceScrape(id, { client: staticPageClient });
    console.log(`${review.organizationName}: scrape ${result.run.id} saved ${result.candidates.length} candidate(s).`);
  } else {
    console.log(`${review.organizationName}: final review ready; re-run with --scrape to record the zero-row run.`);
  }
};

const main = async () => {
  await loadAppModules();
  if (selectedReviews.length === 0) throw new Error("No final direct club review matched --club.");
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  for (const review of selectedReviews) await setupReview(review, owner.id);
};

main()
  .catch((error) => {
    console.error("[setup-remaining-direct-club-reviews] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
