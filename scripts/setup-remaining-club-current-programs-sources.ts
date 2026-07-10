/**
 * Source-backed current programs found during the final club review pass.
 * Every manual candidate below has a future source date and an official action
 * URL. Team-only registrations and programs that already started are excluded.
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
type ManualCandidate = NonNullable<AffiliateScrapeMapping["manualCandidates"]>[number];
type ManualDivision = NonNullable<ManualCandidate["divisions"]>[number];

type SourceDefinition = {
  key: string;
  organizationId: string;
  organizationName: string;
  website: string;
  listUrl: string;
  location: string;
  organizationTags: string[];
  sourcePages: string[];
  skippedRows: Array<{ url?: string; label?: string; reason: string }>;
  candidates: ManualCandidate[];
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
const TZ = "America/Los_Angeles";

const openDivision = (priceCents?: number): ManualDivision => ({
  name: "Open",
  key: "c_skill_open",
  gender: "C",
  ratingType: "SKILL",
  divisionTypeId: "open",
  ...(priceCents == null ? {} : { priceCents }),
});

const ageDivision = (
  name: string,
  key: string,
  gender: "M" | "F" | "C",
  divisionTypeId: string,
  priceCents: number,
  ageCutoffLabel: string,
  ageCutoffSource: string,
): ManualDivision => ({
  name,
  key,
  gender,
  ratingType: "AGE",
  divisionTypeId,
  priceCents,
  ageCutoffLabel,
  ageCutoffSource,
});

const event = (candidate: ManualCandidate): ManualCandidate => ({
  listingKind: "EVENT",
  timeZone: TZ,
  dateDisplayMode: "SCHEDULED",
  participantOptionsText: "Individual player registration",
  ...candidate,
});

const LOSC_HOME = "https://losc.org/";
const LOSC_CAMPS = "https://losc.org/camps";
const LOSC_REGISTER = "https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01NTItMTc0MzI4MjMyNXxVa3lqeVN1VXVER3FncVNBblJYZXZzRTVBWkE3RS85M2FmTjlvMGYzTjljPQ%3D%3D&program_id=53542";
const PNW_HOME = "https://www.pnwvolleyballclub.com/";
const PNW_PROGRAMS = "https://www.pnwvolleyballclub.com/page/show/7335914-programs";
const PNW_INDOOR_REGISTER = "https://pnwvolleyballclub.sportngin.com/register/form/026272708";
const PELADA_HOME = "https://www.peladafootballacademy.org/";
const PELADA_PROGRAMS = "https://www.peladafootballacademy.org/programs/";
const PELADA_REGISTER = "https://www.peladafootballacademy.org/register/";
const PELADA_RESOURCES = "https://www.peladafootballacademy.org/resources/";
const OCSC_HOME = "https://www.ocsoccerclub.org/";
const OCSC_REGISTER = "https://www.ocsoccerclub.org/Default.aspx?tabid=2105850";
const OCSC_FIELDS = "https://www.ocsoccerclub.org/Default.aspx?tabid=2105848";
const KINGTIDE_HOME = "https://www.kingtidevolleyball.com/";
const KINGTIDE_CAMP_FLYER = "https://www.kingtidevolleyball.com/_files/ugd/f8d3ef_4aaf301a3efb44df8f6fc99456d8f588.pdf";

const ocscDivisions: ManualDivision[] = [
  ageDivision("Pre-K Coed", "c_grade_pre_k", "C", "u5", 11300, "Pre-K", OCSC_REGISTER),
  ageDivision("Kindergarten Coed", "c_grade_k", "C", "u6", 11300, "Kindergarten", OCSC_REGISTER),
  ageDivision("1st Grade Boys", "m_grade_1", "M", "u7", 11300, "1st grade", OCSC_REGISTER),
  ageDivision("1st Grade Girls", "f_grade_1", "F", "u7", 11300, "1st grade", OCSC_REGISTER),
  ageDivision("2nd Grade Boys", "m_grade_2", "M", "u8", 11300, "2nd grade", OCSC_REGISTER),
  ageDivision("2nd Grade Girls", "f_grade_2", "F", "u8", 11300, "2nd grade", OCSC_REGISTER),
  ageDivision("3rd Grade Boys", "m_grade_3", "M", "u9", 14300, "3rd grade", OCSC_REGISTER),
  ageDivision("3rd Grade Girls", "f_grade_3", "F", "u9", 14300, "3rd grade", OCSC_REGISTER),
  ageDivision("4th Grade Boys", "m_grade_4", "M", "u10", 14300, "4th grade", OCSC_REGISTER),
  ageDivision("4th Grade Girls", "f_grade_4", "F", "u10", 14300, "4th grade", OCSC_REGISTER),
  ageDivision("5th Grade Boys", "m_grade_5", "M", "u11", 14300, "5th grade", OCSC_REGISTER),
  ageDivision("5th Grade Girls", "f_grade_5", "F", "u11", 14300, "5th grade", OCSC_REGISTER),
  ageDivision("6th Grade Boys", "m_grade_6", "M", "u12", 14300, "6th grade", OCSC_REGISTER),
  ageDivision("6th Grade Girls", "f_grade_6", "F", "u12", 14300, "6th grade", OCSC_REGISTER),
  ageDivision("7th Grade Boys", "m_grade_7", "M", "u13", 14300, "7th grade", OCSC_REGISTER),
  ageDivision("7th Grade Girls", "f_grade_7", "F", "u13", 14300, "7th grade", OCSC_REGISTER),
  ageDivision("8th Grade Boys", "m_grade_8", "M", "u14", 14300, "8th grade", OCSC_REGISTER),
  ageDivision("8th Grade Girls", "f_grade_8", "F", "u14", 14300, "8th grade", OCSC_REGISTER),
  ageDivision("High School Freshman/Sophomore Coed", "c_grade_hs_fr_so", "C", "u19", 15300, "9th-10th grade", OCSC_REGISTER),
  ageDivision("High School Junior/Senior Coed", "c_grade_hs_jr_sr", "C", "u19", 15300, "11th-12th grade", OCSC_REGISTER),
];

const definitions: SourceDefinition[] = [
  {
    key: "kingtide-vbc-current-programs",
    organizationId: "affiliate_org_ceva_club_directory_kingtide_vbc",
    organizationName: "Kingtide VBC",
    website: KINGTIDE_HOME,
    listUrl: KINGTIDE_HOME,
    location: "Portland, OR",
    organizationTags: ["Club", "Event Manager", "Training Provider"],
    sourcePages: [KINGTIDE_HOME, KINGTIDE_CAMP_FLYER],
    skippedRows: [
      { url: KINGTIDE_HOME, label: "2026 girls club tryouts", reason: "The site promotes registration but does not publish a club-specific future tryout date in page text." },
      { url: KINGTIDE_HOME, label: "Jackson Reed-Winter Clinic", reason: "The January-February 2026 clinic is past." },
    ],
    candidates: [event({
      title: "Kingtide Volleyball Camp with Hawai'i Rainbow Warriors",
      officialActionUrl: KINGTIDE_HOME,
      sourceUrl: KINGTIDE_CAMP_FLYER,
      organizerName: "Kingtide VBC",
      sportName: "Indoor Volleyball",
      formatLabel: "Volleyball camp",
      city: "Portland, OR",
      venueName: "Greater Portland location to be announced",
      startsAt: "2026-08-01T00:00:00-07:00",
      endsAt: "2026-08-02T23:59:00-07:00",
      scheduleText: "August 1-2, 2026. The official camp flyer does not publish session times or a street address.",
      dateDisplayText: "August 1-2, 2026",
      ageGroup: "Boys and girls",
      divisionText: "Boys and girls divisions",
      description: "Kingtide Volleyball hosts a two-day camp featuring University of Hawai'i Rainbow Warriors coach Chad Giesseman and 2026 NCAA Tournament MVP Louis Sakanoko. The official flyer says registration is open with limited spots.",
      tags: ["Camp"],
      divisions: [openDivision()],
      warnings: ["The official flyer does not specify a price, session time, or exact Portland-area venue; verify those details before publishing."],
    })],
  },
  {
    key: "lake-oswego-soccer-current-camps",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_lake_oswego_soccer_club",
    organizationName: "Lake Oswego Soccer Club",
    website: LOSC_HOME,
    listUrl: LOSC_CAMPS,
    location: "Lake Oswego, OR",
    organizationTags: ["Club", "Event Manager", "Training Provider"],
    sourcePages: [LOSC_HOME, LOSC_CAMPS, LOSC_REGISTER],
    skippedRows: [
      { url: LOSC_CAMPS, reason: "Camp sessions that started on or before July 10, 2026 are intentionally excluded." },
      { url: LOSC_CAMPS, label: "Spring Break Camp", reason: "The March 23-26, 2026 camp is past." },
    ],
    candidates: [
      event({
        title: "LOSC Shooting and Finishing Camp - July 2026",
        officialActionUrl: LOSC_REGISTER,
        sourceUrl: LOSC_CAMPS,
        organizerName: "Lake Oswego Soccer Club",
        sportName: "Grass Soccer",
        formatLabel: "Soccer skills camp",
        city: "Lake Oswego, OR",
        venueName: "Hazelia Field",
        startsAt: "2026-07-13T10:00:00-07:00",
        endsAt: "2026-07-16T12:00:00-07:00",
        scheduleText: "July 13-16, 2026, daily from 10:00 AM to 12:00 PM at Hazelia Field.",
        dateDisplayText: "July 13-16, 2026",
        description: "A focused Lake Oswego Soccer Club camp for attacking players to improve movement, positioning, ball striking, and finishing under pressure through game-realistic repetitions.",
        tags: ["Camp", "Clinic"],
        divisions: [openDivision()],
        warnings: ["The official page does not publish a separate price for this specialized camp."],
      }),
      event({
        title: "LOSC Summer Soccer Camp - July 13-17, 2026",
        officialActionUrl: LOSC_REGISTER,
        sourceUrl: LOSC_CAMPS,
        organizerName: "Lake Oswego Soccer Club",
        sportName: "Grass Soccer",
        formatLabel: "Summer soccer camp",
        city: "Lake Oswego, OR",
        venueName: "Hazelia Field",
        startsAt: "2026-07-13T09:00:00-07:00",
        endsAt: "2026-07-17T12:30:00-07:00",
        scheduleText: "July 13-17, 2026, daily from 9:00 AM to 12:30 PM at Hazelia Field.",
        dateDisplayText: "July 13-17, 2026",
        priceText: "$195",
        description: "A five-day Lake Oswego Soccer Club summer camp staffed by experienced club and local high-school coaches for recreational and advanced players.",
        tags: ["Camp"],
        divisions: [openDivision(19500)],
      }),
      event({
        title: "LOSC Summer Soccer Camp - July 20-24, 2026",
        officialActionUrl: LOSC_REGISTER,
        sourceUrl: LOSC_CAMPS,
        organizerName: "Lake Oswego Soccer Club",
        sportName: "Grass Soccer",
        formatLabel: "Summer soccer camp",
        city: "Lake Oswego, OR",
        venueName: "East Waluga Park",
        startsAt: "2026-07-20T09:00:00-07:00",
        endsAt: "2026-07-24T12:30:00-07:00",
        scheduleText: "July 20-24, 2026, daily from 9:00 AM to 12:30 PM at East Waluga Park.",
        dateDisplayText: "July 20-24, 2026",
        priceText: "$195",
        description: "A five-day Lake Oswego Soccer Club summer camp staffed by experienced club and local high-school coaches for recreational and advanced players.",
        tags: ["Camp"],
        divisions: [openDivision(19500)],
      }),
      event({
        title: "LOSC Position Specific Soccer Camp - July 2026",
        officialActionUrl: LOSC_REGISTER,
        sourceUrl: LOSC_CAMPS,
        organizerName: "Lake Oswego Soccer Club",
        sportName: "Grass Soccer",
        formatLabel: "Position-specific soccer camp",
        city: "Lake Oswego, OR",
        venueName: "East Waluga Park",
        startsAt: "2026-07-27T10:00:00-07:00",
        endsAt: "2026-07-30T12:00:00-07:00",
        scheduleText: "July 27-30, 2026, daily from 10:00 AM to 12:00 PM at East Waluga Park.",
        dateDisplayText: "July 27-30, 2026",
        description: "Lake Oswego Soccer Club coaches provide position-specific technical drills and game simulations for goalkeepers, midfielders, strikers, and other field roles.",
        tags: ["Camp", "Clinic"],
        divisions: [openDivision()],
        warnings: ["The official page does not publish a separate price for this specialized camp."],
      }),
      event({
        title: "LOSC Shooting and Finishing Camp - August 2026",
        officialActionUrl: LOSC_REGISTER,
        sourceUrl: LOSC_CAMPS,
        organizerName: "Lake Oswego Soccer Club",
        sportName: "Grass Soccer",
        formatLabel: "Soccer skills camp",
        city: "Lake Oswego, OR",
        venueName: "Hazelia Field",
        startsAt: "2026-08-03T10:00:00-07:00",
        endsAt: "2026-08-06T12:00:00-07:00",
        scheduleText: "August 3-6, 2026, daily from 10:00 AM to 12:00 PM at Hazelia Field.",
        dateDisplayText: "August 3-6, 2026",
        description: "A focused Lake Oswego Soccer Club camp for attacking players to improve movement, positioning, ball striking, and finishing under pressure through game-realistic repetitions.",
        tags: ["Camp", "Clinic"],
        divisions: [openDivision()],
        warnings: ["The official page does not publish a separate price for this specialized camp."],
      }),
    ],
  },
  {
    key: "pnw-vbc-current-programs",
    organizationId: "affiliate_org_ceva_club_directory_pnw_vbc",
    organizationName: "PNW VBC",
    website: PNW_HOME,
    listUrl: PNW_PROGRAMS,
    location: "Vancouver, WA",
    organizationTags: ["Club", "Event Manager", "Training Provider"],
    sourcePages: [PNW_HOME, PNW_PROGRAMS, PNW_INDOOR_REGISTER],
    skippedRows: [
      { url: PNW_PROGRAMS, label: "Summer Outdoor Camp", reason: "The June 29-July 1, 2026 camp is past." },
      { url: PNW_PROGRAMS, label: "Sand Volleyball Clinic", reason: "The clinic started June 1, 2026 and is not imported after its start." },
      { url: PNW_PROGRAMS, label: "Summer Clinic", reason: "The clinic started June 23, 2026 and is not imported after its start." },
    ],
    candidates: [event({
      title: "PNW VBC Summer Indoor Volleyball Camp",
      officialActionUrl: PNW_INDOOR_REGISTER,
      sourceUrl: PNW_PROGRAMS,
      organizerName: "PNW VBC",
      sportName: "Indoor Volleyball",
      formatLabel: "Indoor volleyball camp",
      city: "Vancouver, WA",
      venueName: "Venue to be announced",
      startsAt: "2026-07-27T18:00:00-07:00",
      endsAt: "2026-07-29T20:00:00-07:00",
      scheduleText: "July 27-29, 2026, daily from 6:00 PM to 8:00 PM. The official program page lists the location as TBD.",
      dateDisplayText: "July 27-29, 2026",
      ageGroup: "Youth players",
      divisionText: "Beginner and intermediate",
      priceText: "$150",
      description: "A three-day indoor volleyball camp for beginner players and intermediate athletes with at least two years of club experience. The registration includes a camp T-shirt.",
      tags: ["Camp"],
      divisions: [
        { name: "Beginner", key: "c_skill_beginner", gender: "C", ratingType: "SKILL", divisionTypeId: "beginner", priceCents: 15000 },
        { name: "Intermediate", key: "c_skill_intermediate", gender: "C", ratingType: "SKILL", divisionTypeId: "intermediate", priceCents: 15000 },
      ],
      warnings: ["The official program page lists the camp location as TBD; resolve the venue before publishing."],
    })],
  },
  {
    key: "pelada-football-academy-current-programs",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_pelada_football_academy",
    organizationName: "Pelada Football Academy",
    website: PELADA_HOME,
    listUrl: PELADA_HOME,
    location: "Eugene, OR",
    organizationTags: ["Club", "Event Manager", "Training Provider"],
    sourcePages: [PELADA_HOME, PELADA_PROGRAMS, PELADA_REGISTER, PELADA_RESOURCES],
    skippedRows: [
      { url: PELADA_HOME, label: "World Cup 2026 All Day Camp", reason: "The July 6-9, 2026 camp is past." },
      { url: PELADA_PROGRAMS, label: "Summer Foundations Academy", reason: "The program started before the July 10 review and is not imported after its start." },
      { url: PELADA_PROGRAMS, label: "Tournament teams", reason: "These are player placements onto Pelada teams for third-party tournaments, not standalone events owned by Pelada." },
    ],
    candidates: [
      event({
        title: "Pelada Goalkeeping Clinic",
        officialActionUrl: PELADA_REGISTER,
        sourceUrl: PELADA_HOME,
        organizerName: "Pelada Football Academy",
        sportName: "Grass Soccer",
        formatLabel: "Goalkeeping clinic",
        city: "Eugene, OR",
        venueName: "Marist Catholic High School",
        address: "1900 Kingsley Rd, Eugene, OR 97401",
        startsAt: "2026-07-21T09:00:00-07:00",
        endsAt: "2026-07-24T13:00:00-07:00",
        scheduleText: "July 21-24, 2026, daily from 9:00 AM to 1:00 PM at Marist Catholic High School.",
        dateDisplayText: "July 21-24, 2026",
        ageGroup: "U8-U19",
        divisionText: "U8-U19",
        priceText: "$175",
        description: "A four-day Pelada Football Academy clinic covering goalkeeper positioning, shot-stopping, and distribution, with opportunities to participate in goal-scoring exercises.",
        tags: ["Clinic"],
        divisions: [ageDivision("U8-U19", "c_age_u19", "C", "u19", 17500, "U8-U19", PELADA_PROGRAMS)],
      }),
      event({
        title: "Pelada Finishing Clinic",
        officialActionUrl: PELADA_REGISTER,
        sourceUrl: PELADA_HOME,
        organizerName: "Pelada Football Academy",
        sportName: "Grass Soccer",
        formatLabel: "Finishing clinic",
        city: "Eugene, OR",
        venueName: "Marist Catholic High School",
        address: "1900 Kingsley Rd, Eugene, OR 97401",
        startsAt: "2026-07-21T09:00:00-07:00",
        endsAt: "2026-07-24T13:00:00-07:00",
        scheduleText: "July 21-24, 2026, daily from 9:00 AM to 1:00 PM at Marist Catholic High School.",
        dateDisplayText: "July 21-24, 2026",
        ageGroup: "U8-U19",
        divisionText: "U8-U19",
        priceText: "$175",
        description: "A four-day Pelada Football Academy clinic focused on creating scoring chances, finishing technique, and high-repetition shooting games.",
        tags: ["Clinic"],
        divisions: [ageDivision("U8-U19", "c_age_u19", "C", "u19", 17500, "U8-U19", PELADA_PROGRAMS)],
      }),
      event({
        title: "Pelada Fall Team Camp",
        officialActionUrl: PELADA_REGISTER,
        sourceUrl: PELADA_HOME,
        organizerName: "Pelada Football Academy",
        sportName: "Grass Soccer",
        formatLabel: "Preseason soccer camp",
        city: "Eugene, OR",
        venueName: "Ascot Park / Monroe Middle School",
        startsAt: "2026-08-17T09:00:00-07:00",
        endsAt: "2026-08-20T14:00:00-07:00",
        scheduleText: "August 17-20, 2026, daily from 9:00 AM to 2:00 PM at Ascot Park / Monroe Middle School.",
        dateDisplayText: "August 17-20, 2026",
        ageGroup: "U8-U19",
        divisionText: "U8-U19",
        priceText: "$200",
        description: "A four-day Pelada Football Academy preseason camp for fall teams and players covering attacking, defending, technical work, and tactical themes.",
        tags: ["Camp"],
        divisions: [ageDivision("U8-U19", "c_age_u19", "C", "u19", 20000, "U8-U19", PELADA_PROGRAMS)],
        warnings: ["The official source names Ascot Park / Monroe Middle School but does not publish a street address on the program page."],
      }),
    ],
  },
  {
    key: "oregon-city-soccer-current-programs",
    organizationId: "affiliate_org_oregon_youth_soccer_find_a_club_oregon_city_soccer_club",
    organizationName: "Oregon City Soccer Club",
    website: OCSC_HOME,
    listUrl: OCSC_REGISTER,
    location: "Oregon City, OR",
    organizationTags: ["Club", "Event Manager", "League Operator"],
    sourcePages: [OCSC_HOME, OCSC_REGISTER, OCSC_FIELDS],
    skippedRows: [
      { url: OCSC_FIELDS, reason: "The club publishes field locations for its programs, not public facility rental offerings." },
    ],
    candidates: [event({
      title: "Oregon City Soccer Club Fall 2026 Soccer",
      officialActionUrl: OCSC_REGISTER,
      sourceUrl: OCSC_REGISTER,
      organizerName: "Oregon City Soccer Club",
      sportName: "Grass Soccer",
      formatLabel: "Fall recreational soccer league",
      city: "Oregon City, OR",
      venueName: "Oregon City Soccer Club fields",
      startsAt: "2026-09-10T00:00:00-07:00",
      endsAt: "2026-10-31T23:59:00-07:00",
      scheduleText: "Pre-K plays Thursday evenings beginning September 10; Kindergarten plays Friday evenings beginning September 11; 1st grade through high school play Saturdays beginning September 12. All divisions end by October 31, 2026.",
      dateDisplayText: "September 10-October 31, 2026",
      ageGroup: "Pre-K-12th grade",
      divisionText: "Pre-K through high school boys, girls, and coed divisions",
      priceText: "$113-$153",
      statusText: "Registration closes August 2, 2026 at 11:59 PM.",
      registrationDeadlineText: "August 2, 2026 at 11:59 PM",
      description: "Oregon City Soccer Club's Fall 2026 recreational season includes local Pre-K through high-school divisions. The source publishes division-specific game days and prices; club program pages identify total player costs after registration, field-maintenance, and parks fees.",
      tags: ["League"],
      divisions: ocscDivisions,
      warnings: ["Games use multiple Oregon City fields; the candidate uses the club's city-level location and should not imply every game is at one facility."],
    })],
  },
];

const selectedDefinition = (() => {
  const flag = process.argv.find((argument) => argument.startsWith("--club="));
  if (!flag) return definitions;
  const value = flag.slice("--club=".length).trim().toLowerCase();
  return definitions.filter((definition) => (
    definition.key.toLowerCase().includes(value)
    || definition.organizationName.toLowerCase().includes(value)
  ));
})();

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: "<html><body><main>Source-backed manual candidates.</main></body></html>",
    fetchedAt: new Date().toISOString(),
  }),
};

const sourceId = (definition: SourceDefinition) => `affiliate_source_${definition.key.replace(/-/g, "_")}`;
const mappingId = (definition: SourceDefinition) => `affiliate_mapping_${definition.key.replace(/-/g, "_")}_v1`;

const setupDefinition = async (definition: SourceDefinition, ownerId: string) => {
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: definition.organizationId },
    select: { logoId: true },
  });
  if (!organization?.logoId) throw new Error(`${definition.organizationName} must have an official logo before source setup.`);
  if (!await (prisma as any).file.findUnique({ where: { id: organization.logoId }, select: { id: true } })) {
    throw new Error(`${definition.organizationName} references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: definition.organizationId },
    data: {
      ownerId,
      website: definition.website,
      location: definition.location,
      status: "LISTED",
      publicPageEnabled: true,
      updatedAt: new Date(),
    },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: definition.organizationId },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(definition.organizationId, Array.from(new Set([
    ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
    ...definition.organizationTags,
  ])), prisma);

  const id = sourceId(definition);
  const activeMappingId = mappingId(definition);
  const mapping: AffiliateScrapeMapping = {
    kind: "EVENT",
    listUrl: definition.listUrl,
    itemSelector: "body",
    fields: {
      title: { selector: "body", mode: "literal", value: `${definition.organizationName} current programs` },
      officialActionUrl: { selector: "body", mode: "literal", value: definition.website },
    },
    dedupe: { fields: ["officialActionUrl", "title", "startsAt"] },
    manualCandidates: definition.candidates,
  };
  const sourcePayload = {
    name: `${definition.organizationName} Current Programs`,
    sourceKey: definition.key,
    organizationId: definition.organizationId,
    baseUrl: definition.website,
    listUrl: definition.listUrl,
    targetKind: "EVENT",
    status: "ACTIVE",
    activeMappingId,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: "Manual source-backed mapping for current future-dated club programs.",
    metadata: {
      inspectedAt: REVIEWED_AT,
      robotsAllowed: true,
      strategy: "manual-current-programs",
      sourcePages: definition.sourcePages,
      skippedRows: definition.skippedRows,
      expectedCandidateCount: definition.candidates.length,
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id },
    create: { id, ...sourcePayload },
    update: sourcePayload,
  });
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
      notes: `Verified current-program mapping for ${definition.organizationName}.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: `Verified current-program mapping for ${definition.organizationName}.`,
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id }, data: { activeMappingId } });

  console.log(`${definition.organizationName}: source ready with ${definition.candidates.length} candidate(s).`);
  if (process.argv.includes("--scrape")) {
    const result = await runAffiliateSourceScrape(id, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(`  scrape ${result.run.id}: saved ${result.candidates.length}, created ${logs?.createdCandidateCount ?? "n/a"}, updated ${logs?.updatedCandidateCount ?? "n/a"}, rejected ${logs?.rejectedCount ?? "n/a"}.`);
  }
};

const main = async () => {
  await loadAppModules();
  if (selectedDefinition.length === 0) throw new Error("No current-program club matched --club.");
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  for (const definition of selectedDefinition) await setupDefinition(definition, owner.id);
};

main()
  .catch((error) => {
    console.error("[setup-remaining-club-current-programs-sources] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
