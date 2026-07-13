/**
 * Builds a current, evidence-backed readiness report for every local org.
 *
 * Affiliate orgs must have a valid profile/logo/tag set and either a direct
 * scrape source or a published CLUB candidate from a validated directory
 * source. Public clubs additionally need a recent event-and-rental discovery
 * report. This script never mutates the database.
 *
 * Usage:
 *   npm run affiliate:org-readiness
 *   npm run affiliate:org-readiness -- --live
 */
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { affiliateScrapeMappingSchema } from "../src/server/affiliateImports/types";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: false, quiet: true });

const useLive = process.argv.includes("--live");
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE) {
    throw new Error("--live requires DATABASE_URL_LIVE.");
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = "false";
}

const DIRECTORY_SOURCE_IDS = new Set([
  "affiliate_source_oregon_youth_soccer_find_a_club",
  "affiliate_source_ceva_club_directory",
  "affiliate_source_oregon_state_hockey_youth_directory",
]);
const OUTPUT_DIR = path.join(process.cwd(), "output", "affiliate-org-readiness");
const CLUB_DISCOVERY_DIR = path.join(process.cwd(), "output", "affiliate-club-event-discovery");
const LOGO_FIT_REPORT = path.join(process.cwd(), "output", "affiliate-logo-fit", "report.json");

type OrganizationRow = {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  logoId: string | null;
  status: string;
  publicSlug: string | null;
  publicPageEnabled: boolean;
  coordinates: unknown;
};

type SourceRow = {
  id: string;
  organizationId: string | null;
  sourceKey: string;
  name: string;
  targetKind: string;
  status: string;
  activeMappingId: string | null;
  listUrl: string;
  metadata: unknown;
};

type MappingRow = {
  id: string;
  sourceId: string;
  isActive: boolean;
  validatedAt: Date | null;
  mapping: unknown;
};

type RunRow = {
  id: string;
  sourceId: string;
  status: string;
  createdAt: Date;
  finishedAt: Date | null;
  candidateCount: number;
  errorMessage: string | null;
};

type CandidateRow = {
  id: string;
  sourceId: string;
  listingKind: string;
  status: string;
  title: string;
  sourceUrl: string;
  officialActionUrl: string;
  startsAt: Date | null;
  address: string | null;
  city: string | null;
  publishedOrganizationId: string | null;
};

type ClubDiscoveryAudit = {
  generatedAt: string;
  scanKinds: string[];
  source: string;
  club: string;
  organizationId: string;
  website: string;
  robotsAllowed: boolean | null;
  robotsNote: string | null;
  fetchedPages: Array<{ url: string; status: number; title: string | null }>;
  skipped: Array<{ url?: string; reason: string }>;
  candidates: Array<{
    listingKind?: string;
    title: string;
    sourceUrl?: string | null;
    officialActionUrl: string;
    startsAt?: string | null;
    address?: string | null;
    city?: string | null;
    tags?: string[];
  }>;
  reportFile: string;
};

type LogoFitRow = {
  orgId: string;
  sourceWidth: number;
  sourceHeight: number;
  hasAlpha: boolean;
  warnings: string[];
};

type OrgReadiness = {
  organizationId: string;
  name: string;
  scope: "AFFILIATE" | "FIRST_PARTY";
  status: string;
  issues: string[];
  warnings: string[];
  profile: Record<string, unknown>;
  tags: string[];
  sources: Array<Record<string, unknown>>;
  clubCandidates: Array<Record<string, unknown>>;
  discovery: Record<string, unknown> | null;
  content: Record<string, unknown>;
};

const pushMap = <T>(map: Map<string, T[]>, key: string | null | undefined, value: T) => {
  if (!key) return;
  map.set(key, [...(map.get(key) ?? []), value]);
};

const normalizeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
};

const csvCell = (value: unknown) => {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

const loadLatestClubDiscoveryAudits = async () => {
  const latestByOrg = new Map<string, ClubDiscoveryAudit>();
  let files: string[] = [];
  try {
    files = (await fs.readdir(CLUB_DISCOVERY_DIR)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return latestByOrg;
  }

  for (const file of files) {
    const report = await readJson<{
      generatedAt?: string;
      source?: string;
      scanKinds?: string[];
      audits?: Omit<ClubDiscoveryAudit, "generatedAt" | "source" | "scanKinds" | "reportFile">[];
    }>(path.join(CLUB_DISCOVERY_DIR, file));
    if (!report?.generatedAt || !report.audits) continue;
    for (const audit of report.audits) {
      const next: ClubDiscoveryAudit = {
        ...audit,
        generatedAt: report.generatedAt,
        source: report.source ?? "unknown",
        scanKinds: report.scanKinds ?? ["EVENT"],
        reportFile: file,
      };
      const existing = latestByOrg.get(audit.organizationId);
      if (!existing || new Date(next.generatedAt) > new Date(existing.generatedAt)) {
        latestByOrg.set(audit.organizationId, next);
      }
    }
  }
  return latestByOrg;
};

const main = async () => {
  const { prisma } = await import("../src/lib/prisma");
  const [
    organizations,
    files,
    orgTagRows,
    sources,
    mappings,
    runs,
    candidates,
    events,
    eventTagAssignments,
    facilities,
    clubDiscoveryByOrg,
    logoFitRows,
  ] = await Promise.all([
    (prisma as any).organizations.findMany({
      select: {
        id: true,
        name: true,
        website: true,
        description: true,
        logoId: true,
        status: true,
        publicSlug: true,
        publicPageEnabled: true,
        coordinates: true,
      },
      orderBy: { name: "asc" },
    }) as Promise<OrganizationRow[]>,
    (prisma as any).file.findMany({ select: { id: true } }) as Promise<Array<{ id: string }>>,
    (prisma as any).$queryRawUnsafe(`
      select a."organizationId", t.name
      from "OrganizationTagAssignments" a
      join "OrganizationTags" t on t.id = a."tagId"
      order by a."organizationId", t.name
    `) as Promise<Array<{ organizationId: string; name: string }>>,
    (prisma as any).affiliateScrapeSources.findMany({ orderBy: { id: "asc" } }) as Promise<SourceRow[]>,
    (prisma as any).affiliateScrapeMappings.findMany({ orderBy: { id: "asc" } }) as Promise<MappingRow[]>,
    (prisma as any).affiliateScrapeRuns.findMany({ orderBy: [{ sourceId: "asc" }, { createdAt: "desc" }] }) as Promise<RunRow[]>,
    (prisma as any).affiliateImportCandidates.findMany({ orderBy: { createdAt: "asc" } }) as Promise<CandidateRow[]>,
    (prisma as any).events.findMany({
      where: { sourceType: "AFFILIATE_IMPORT" },
      select: { id: true, organizationId: true, affiliateUrl: true, archivedAt: true },
    }) as Promise<Array<{ id: string; organizationId: string | null; affiliateUrl: string | null; archivedAt: Date | null }>>,
    (prisma as any).eventTagAssignments.findMany({ select: { eventId: true } }) as Promise<Array<{ eventId: string }>>,
    (prisma as any).facilities.findMany({
      where: { affiliateUrl: { not: null } },
      select: { id: true, organizationId: true, affiliateUrl: true, coordinates: true },
    }) as Promise<Array<{ id: string; organizationId: string; affiliateUrl: string | null; coordinates: unknown }>>,
    loadLatestClubDiscoveryAudits(),
    readJson<LogoFitRow[]>(LOGO_FIT_REPORT).then((rows) => rows ?? []),
  ]);

  const fileIds = new Set(files.map((file) => file.id));
  const tagsByOrg = new Map<string, string[]>();
  orgTagRows.forEach((row) => pushMap(tagsByOrg, row.organizationId, row.name));
  const sourcesByOrg = new Map<string, SourceRow[]>();
  sources.forEach((source) => pushMap(sourcesByOrg, source.organizationId, source));
  const mappingById = new Map(mappings.map((mapping) => [mapping.id, mapping]));
  const runsBySource = new Map<string, RunRow[]>();
  runs.forEach((run) => pushMap(runsBySource, run.sourceId, run));
  const candidatesBySource = new Map<string, CandidateRow[]>();
  const candidatesByPublishedOrg = new Map<string, CandidateRow[]>();
  candidates.forEach((candidate) => {
    pushMap(candidatesBySource, candidate.sourceId, candidate);
    pushMap(candidatesByPublishedOrg, candidate.publishedOrganizationId, candidate);
  });
  const eventTagIds = new Set(eventTagAssignments.map((assignment) => assignment.eventId));
  const eventsByOrg = new Map<string, typeof events>();
  events.forEach((event) => pushMap(eventsByOrg, event.organizationId, event));
  const facilitiesByOrg = new Map<string, typeof facilities>();
  facilities.forEach((facility) => pushMap(facilitiesByOrg, facility.organizationId, facility));
  const logoFitByOrg = new Map(logoFitRows.map((row) => [row.orgId, row]));

  const sourceEvidence = (source: SourceRow) => {
    const mapping = source.activeMappingId ? mappingById.get(source.activeMappingId) : null;
    const mappingValidation = mapping
      ? affiliateScrapeMappingSchema.safeParse(mapping.mapping)
      : null;
    const sourceRuns = runsBySource.get(source.id) ?? [];
    const latestRun = sourceRuns[0] ?? null;
    const successfulRun = sourceRuns.find((run) => run.status === "SUCCEEDED") ?? null;
    return {
      id: source.id,
      key: source.sourceKey,
      name: source.name,
      targetKind: source.targetKind,
      status: source.status,
      listUrl: source.listUrl,
      activeMappingId: source.activeMappingId,
      activeMappingExists: Boolean(mapping),
      activeMappingEnabled: mapping?.isActive === true,
      mappingValidatedAt: mapping?.validatedAt?.toISOString() ?? null,
      mappingShapeValid: mappingValidation?.success === true,
      latestRunId: latestRun?.id ?? null,
      latestRunStatus: latestRun?.status ?? null,
      latestRunError: latestRun?.errorMessage ?? null,
      successfulRunId: successfulRun?.id ?? null,
      candidateCount: (candidatesBySource.get(source.id) ?? []).length,
    };
  };

  const rows: OrgReadiness[] = [];
  for (const organization of organizations) {
    const isAffiliate = organization.id.startsWith("affiliate_org_");
    const issues: string[] = [];
    const warnings: string[] = [];
    const tags = tagsByOrg.get(organization.id) ?? [];
    const orgSources = sourcesByOrg.get(organization.id) ?? [];
    const orgCandidates = candidatesByPublishedOrg.get(organization.id) ?? [];
    const clubCandidates = orgCandidates.filter((candidate) => candidate.listingKind === "CLUB");
    const orgEvents = eventsByOrg.get(organization.id) ?? [];
    const orgFacilities = facilitiesByOrg.get(organization.id) ?? [];
    const sourceDetails = orgSources.map(sourceEvidence);
    const hasCompletedManualCoverage = orgSources.some((source) => {
      const metadata = source.metadata && typeof source.metadata === "object"
        ? source.metadata as { strategy?: unknown; sourcePages?: unknown }
        : null;
      const strategy = typeof metadata?.strategy === "string" ? metadata.strategy : "";
      const evidence = sourceEvidence(source);
      return strategy.startsWith("manual-")
        && Array.isArray(metadata?.sourcePages)
        && metadata.sourcePages.length > 0
        && evidence.activeMappingExists
        && evidence.activeMappingEnabled
        && evidence.mappingValidatedAt !== null
        && evidence.mappingShapeValid
        && evidence.successfulRunId !== null;
    });
    const logoFit = logoFitByOrg.get(organization.id) ?? null;

    if (isAffiliate) {
      if (!organization.website) issues.push("missing_official_website");
      if (!organization.description?.trim()) issues.push("missing_description");
      if (!organization.logoId) issues.push("missing_logo_id");
      else if (!fileIds.has(organization.logoId)) issues.push("broken_logo_file_reference");
      if (tags.length === 0) issues.push("missing_organization_tags");
      if (!logoFit) issues.push("logo_not_in_fit_review");
      else {
        if (logoFit.warnings.length > 0) issues.push("logo_fit_warnings");
        if (logoFit.hasAlpha) issues.push("logo_has_transparency");
        if (logoFit.sourceWidth !== 1024 || logoFit.sourceHeight !== 1024) {
          issues.push("logo_not_1024_square");
        }
      }

      if (orgSources.length === 0 && clubCandidates.length === 0) {
        issues.push("no_direct_source_or_directory_candidate");
      }

      const requiredSourceIds = new Set([
        ...orgSources.filter((source) => source.status === "ACTIVE").map((source) => source.id),
        ...clubCandidates.map((candidate) => candidate.sourceId),
      ]);
      for (const sourceId of requiredSourceIds) {
        const source = sources.find((item) => item.id === sourceId);
        if (!source) {
          issues.push(`missing_source:${sourceId}`);
          continue;
        }
        const evidence = sourceEvidence(source);
        if (!evidence.activeMappingExists) issues.push(`missing_active_mapping:${sourceId}`);
        else {
          if (!evidence.activeMappingEnabled) issues.push(`inactive_mapping:${sourceId}`);
          if (!evidence.mappingValidatedAt) issues.push(`unvalidated_mapping:${sourceId}`);
          if (!evidence.mappingShapeValid) issues.push(`invalid_mapping_shape:${sourceId}`);
        }
        if (!evidence.successfulRunId) issues.push(`no_successful_scrape:${sourceId}`);
        if (evidence.latestRunStatus === "FAILED") issues.push(`latest_scrape_failed:${sourceId}`);
      }

      if (clubCandidates.length > 0) {
        if (organization.status !== "LISTED" || !organization.publicPageEnabled || !organization.publicSlug) {
          issues.push("club_not_publicly_discoverable");
        }
        if (clubCandidates.some((candidate) => candidate.status !== "PUBLISHED")) {
          issues.push("club_candidate_not_published");
        }

        const discovery = clubDiscoveryByOrg.get(organization.id);
        if (!discovery) {
          issues.push("missing_club_event_rental_discovery_pass");
        } else {
          if (!discovery.scanKinds.includes("EVENT") || !discovery.scanKinds.includes("RENTAL")) {
            issues.push("club_discovery_did_not_cover_events_and_rentals");
          }
          if (discovery.robotsAllowed === false) {
            warnings.push(`policy_blocked:${discovery.robotsNote ?? "robots.txt"}`);
          }
          const severeSkips = discovery.skipped.filter(({ reason }) =>
            /missing official club website|homepage fetch failed|HTTP (?:4\d\d|5\d\d)|generic (?:programs page|page title) needs manual mapping|multi-program page needs manual mapping/i.test(reason),
          );
          if (
            severeSkips.length > 0
            && discovery.candidates.length === 0
            && !hasCompletedManualCoverage
          ) {
            issues.push("club_discovery_needs_manual_followup");
          }

          const savedCandidates = orgSources
            .flatMap((source) => candidatesBySource.get(source.id) ?? []);
          const savedUrls = new Set(savedCandidates.flatMap((candidate) => [
            normalizeUrl(candidate.sourceUrl),
            normalizeUrl(candidate.officialActionUrl),
          ]).filter((value): value is string => Boolean(value)));
          const unsaved = discovery.candidates.filter((candidate) => {
            const sourceUrl = normalizeUrl(candidate.sourceUrl);
            const actionUrl = normalizeUrl(candidate.officialActionUrl);
            return !savedUrls.has(sourceUrl ?? "") && !savedUrls.has(actionUrl ?? "");
          });
          if (unsaved.length > 0) issues.push("discovered_candidates_not_saved_for_review");
          if (discovery.candidates.some((candidate) =>
            candidate.listingKind === "RENTAL" && !candidate.address,
          )) {
            issues.push("discovered_rental_missing_street_address");
          }
          if (discovery.candidates.some((candidate) =>
            (candidate.listingKind ?? "EVENT") === "EVENT" && (!candidate.tags || candidate.tags.length === 0),
          )) {
            issues.push("discovered_event_missing_tags");
          }
        }
      }

      if (orgEvents.some((event) => !event.affiliateUrl)) {
        issues.push("published_affiliate_event_missing_url");
      }
      if (orgEvents.some((event) => !eventTagIds.has(event.id))) {
        issues.push("published_affiliate_event_missing_tags");
      }
      if (orgFacilities.some((facility) => !facility.affiliateUrl)) {
        issues.push("published_affiliate_facility_missing_url");
      }
      if (orgFacilities.some((facility) => !facility.coordinates)) {
        issues.push("published_affiliate_facility_missing_coordinates");
      }
    }

    const discovery = clubDiscoveryByOrg.get(organization.id) ?? null;
    const hasReviewCandidates = orgSources.some((source) =>
      (candidatesBySource.get(source.id) ?? []).some((candidate) => candidate.status === "DISCOVERED"),
    );
    const status = !isAffiliate
      ? "FIRST_PARTY_NOT_IN_AFFILIATE_SCOPE"
      : issues.length > 0
        ? "NEEDS_WORK"
        : hasReviewCandidates
          ? "READY_WITH_REVIEW_CANDIDATES"
          : orgEvents.length > 0 || orgFacilities.length > 0
            ? "READY_WITH_PUBLISHED_CONTENT"
            : "READY_NO_CURRENT_LISTINGS";

    rows.push({
      organizationId: organization.id,
      name: organization.name,
      scope: isAffiliate ? "AFFILIATE" : "FIRST_PARTY",
      status,
      issues: Array.from(new Set(issues)).sort(),
      warnings: Array.from(new Set(warnings)).sort(),
      profile: {
        website: organization.website,
        descriptionPresent: Boolean(organization.description?.trim()),
        logoId: organization.logoId,
        logoFileExists: Boolean(organization.logoId && fileIds.has(organization.logoId)),
        logoFit,
        publicStatus: organization.status,
        publicSlug: organization.publicSlug,
        publicPageEnabled: organization.publicPageEnabled,
      },
      tags,
      sources: sourceDetails,
      clubCandidates: clubCandidates.map((candidate) => ({
        id: candidate.id,
        sourceId: candidate.sourceId,
        status: candidate.status,
        title: candidate.title,
      })),
      discovery: discovery
        ? {
          generatedAt: discovery.generatedAt,
          reportFile: discovery.reportFile,
          scanKinds: discovery.scanKinds,
          robotsAllowed: discovery.robotsAllowed,
          fetchedPageCount: discovery.fetchedPages.length,
          candidateCount: discovery.candidates.length,
          candidates: discovery.candidates,
          skipped: discovery.skipped,
        }
        : null,
      content: {
        publishedAffiliateEvents: orgEvents.length,
        publishedAffiliateFacilities: orgFacilities.length,
        discoveredCandidates: orgSources.reduce(
          (sum, source) => sum + (candidatesBySource.get(source.id) ?? []).filter((candidate) => candidate.status === "DISCOVERED").length,
          0,
        ),
      },
    });
  }

  const affiliateRows = rows.filter((row) => row.scope === "AFFILIATE");
  const statusCounts = Object.fromEntries(
    Array.from(new Set(rows.map((row) => row.status))).sort().map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
  );
  const issueCounts = Object.fromEntries(
    Array.from(new Set(affiliateRows.flatMap((row) => row.issues))).sort().map((issue) => [
      issue,
      affiliateRows.filter((row) => row.issues.includes(issue)).length,
    ]),
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    database: useLive ? "live" : "local",
    totalOrganizations: rows.length,
    affiliateOrganizations: affiliateRows.length,
    firstPartyOrganizations: rows.length - affiliateRows.length,
    readyAffiliateOrganizations: affiliateRows.filter((row) => row.status !== "NEEDS_WORK").length,
    needsWorkAffiliateOrganizations: affiliateRows.filter((row) => row.status === "NEEDS_WORK").length,
    statusCounts,
    issueCounts,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const prefix = useLive ? "live" : "local";
  await fs.writeFile(path.join(OUTPUT_DIR, `${prefix}-current.json`), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, `${prefix}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`);

  const csvHeaders = [
    "organizationId",
    "name",
    "scope",
    "status",
    "issues",
    "warnings",
    "tags",
    "sourceCount",
    "clubCandidateCount",
    "eventCount",
    "facilityCount",
    "discoveryCandidateCount",
    "discoveryReport",
  ];
  const csv = [
    csvHeaders.map(csvCell).join(","),
    ...rows.map((row) => [
      row.organizationId,
      row.name,
      row.scope,
      row.status,
      row.issues,
      row.warnings,
      row.tags,
      row.sources.length,
      row.clubCandidates.length,
      row.content.publishedAffiliateEvents,
      row.content.publishedAffiliateFacilities,
      row.discovery?.candidateCount ?? 0,
      row.discovery?.reportFile ?? "",
    ].map(csvCell).join(",")),
  ].join("\n");
  await fs.writeFile(path.join(OUTPUT_DIR, `${prefix}-current.csv`), `${csv}\n`);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${path.join(OUTPUT_DIR, `${prefix}-current.json`)}`);
  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
