/**
 * Club affiliate event discovery.
 *
 * Scans published affiliate CLUB candidates for official club websites, checks
 * robots.txt, follows likely tryout/camp/clinic/event links, and optionally
 * creates normal unpublished EVENT affiliate candidates for admin review.
 *
 * Safe defaults:
 * - dry-run unless `--write` is passed
 * - skips directory-only/social URLs
 * - skips robots-disallowed pages
 * - skips stale or undated tryouts/events
 *
 * Examples:
 *   npm run affiliate:clubs:discover-events -- --limit=20
 *   npm run affiliate:clubs:discover-events -- --source=oysa --write
 *   npm run affiliate:clubs:discover-events -- --club="Portland City"
 */

import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { JSDOM, VirtualConsole } from "jsdom";
import type { AffiliateScrapeMapping } from "../src/server/affiliateImports/types";
import { parseVenueAddressFromLocationText } from "../src/server/affiliateImports/mappingExtractor";

dotenv.config({ path: ".env", override: false, quiet: true });
dotenv.config({ path: ".env.local", override: false, quiet: true });

if (process.argv.includes("--live")) {
  if (!process.env.DATABASE_URL_LIVE) {
    throw new Error("--live requires DATABASE_URL_LIVE.");
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
}

const USER_AGENT = "BracketIQ club source review bot; contact samuel.r@razumly.com";
const FETCH_TIMEOUT_MS = 18_000;
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_PAGES_PER_CLUB = 5;
const OUTPUT_DIR = path.join(process.cwd(), "output", "affiliate-club-event-discovery");

type ClubRow = {
  candidateId: string;
  title: string;
  officialActionUrl: string;
  sourceId: string;
  sportName: string | null;
  city: string | null;
  venueName: string | null;
  address: string | null;
  publishedOrganizationId: string;
  organizationName: string | null;
  organizationWebsite: string | null;
  reviewedSourceUrls: string[];
};

type RobotsRule = {
  type: "allow" | "disallow";
  value: string;
};

type DiscoveryCandidate = NonNullable<AffiliateScrapeMapping["manualCandidates"]>[number];

type PageResult = {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  text: string;
  title: string | null;
  discoveryLabel: string | null;
};

type ClubAudit = {
  club: string;
  organizationId: string;
  website: string;
  robotsAllowed: boolean | null;
  robotsNote: string | null;
  fetchedPages: Array<{ url: string; status: number; title: string | null }>;
  skipped: Array<{ url?: string; reason: string }>;
  candidates: DiscoveryCandidate[];
  wroteSourceId?: string;
  wroteRunId?: string;
  savedCandidateCount?: number;
};

type OrganizationSummary = {
  id: string;
  name: string | null;
  website: string | null;
};

const REVIEWED_DISCOVERY_EXCLUSIONS = new Map<string, Map<string, string>>([
  [
    "affiliate_org_oregon_youth_soccer_find_a_club_illinois_valley_youth_soccer_league",
    new Map([
      [
        "https://begreat4kids.com/facility-rental/",
        "parent Boys & Girls Clubs rental page is not attributable to the Illinois Valley soccer org",
      ],
    ]),
  ],
]);

const args = new Map<string, string | boolean>();
for (const rawArg of process.argv.slice(2)) {
  if (!rawArg.startsWith("--")) continue;
  const [key, ...rest] = rawArg.slice(2).split("=");
  args.set(key, rest.length ? rest.join("=") : true);
}

const shouldWrite = args.has("write");
const sourceArg = String(args.get("source") ?? "all").toLowerCase();
const clubFilter = typeof args.get("club") === "string" ? String(args.get("club")).toLowerCase() : "";
const limit = Number(args.get("limit") ?? DEFAULT_LIMIT);
const maxPagesPerClub = Number(args.get("max-pages") ?? DEFAULT_MAX_PAGES_PER_CLUB);
const now = new Date();
const virtualConsole = new VirtualConsole();

const DIRECTORY_SOURCE_IDS = [
  "affiliate_source_oregon_youth_soccer_find_a_club",
  "affiliate_source_ceva_club_directory",
  "affiliate_source_oregon_state_hockey_youth_directory",
];

const sourceIdsByAlias: Record<string, string[] | null> = {
  all: null,
  directories: DIRECTORY_SOURCE_IDS,
  oysa: ["affiliate_source_oregon_youth_soccer_find_a_club"],
  ceva: ["affiliate_source_ceva_club_directory"],
  hockey: ["affiliate_source_oregon_state_hockey_youth_directory"],
};

const selectedSourceIds = sourceArg === "direct" ? [] : sourceIdsByAlias[sourceArg];
if (selectedSourceIds === undefined) {
  throw new Error(`Unknown --source=${sourceArg}. Use all, directories, direct, oysa, ceva, or hockey.`);
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const textContent = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&#x2013;/g, "-")
    .replace(/&#8212;|&#x2014;/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeComparableUrl = (value: string) => {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
};

const sourceStreetAddress = (address: string | null, city: string | null) => {
  const normalizedAddress = normalizeWhitespace(address ?? "");
  const normalizedCity = normalizeWhitespace(city ?? "");
  if (!normalizedAddress || normalizedAddress.toLowerCase() === normalizedCity.toLowerCase()) {
    return null;
  }
  if (/\b(event|read more|loading|full court|road game|street soccer)\b/i.test(normalizedAddress)) {
    return null;
  }
  return /\d/.test(normalizedAddress) ? normalizedAddress : null;
};

const isDirectoryOrSocialUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const isKnownDirectoryPage = (
      (hostname === "oregonyouthsoccer.org" && pathname === "/find-a-club")
      || (hostname === "cevaregion.org" && pathname === "/clubdirectory")
      || (hostname === "oregonstatehockey.com" && pathname === "/youth-hockey.html")
    );
    if (isKnownDirectoryPage) return true;
    return [
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "x.com",
      "youtube.com",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
};

const fetchText = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT,
      },
    });
    return {
      status: response.status,
      finalUrl: response.url,
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const parseRobotsRules = (robotsText: string) => {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (current && (key === "allow" || key === "disallow")) {
      current.rules.push({ type: key, value });
    }
  }

  return groups
    .filter((group) => group.agents.includes("*"))
    .flatMap((group) => group.rules)
    .filter((rule) => rule.value.length > 0);
};

const ruleMatches = (rule: string, pathAndSearch: string) => {
  if (rule === "/") return true;
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(pathAndSearch);
};

const auditRobots = async (url: string) => {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  try {
    const response = await fetchText(robotsUrl);
    if (response.status >= 400) {
      return { allowed: true, note: `robots.txt returned ${response.status}` };
    }
    const pathAndSearch = `${target.pathname}${target.search}`;
    const matching = parseRobotsRules(response.body)
      .filter((rule) => ruleMatches(rule.value, pathAndSearch))
      .sort((a, b) => b.value.replace(/\*/g, "").length - a.value.replace(/\*/g, "").length)[0];
    if (!matching) return { allowed: true, note: "no matching robots rule" };
    return {
      allowed: matching.type === "allow",
      note: `${matching.type}: ${matching.value}`,
    };
  } catch (error) {
    return {
      allowed: null,
      note: `robots check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const fetchPage = async (url: string, discoveryLabel: string | null = null): Promise<PageResult> => {
  const response = await fetchText(url);
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i
      .exec(response.body)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? null;
  return {
    url,
    finalUrl: response.finalUrl,
    status: response.status,
    html: response.body,
    text: textContent(response.body),
    title,
    discoveryLabel,
  };
};

const linkScore = (text: string, href: string) => {
  const value = `${text} ${href}`.toLowerCase();
  let score = 0;
  if (/\btry[-\s]?outs?\b|\bevaluations?\b/.test(value)) score += 100;
  if (/\b(rentals?|book(?:ing)?|reserve|facility|facilities|courts?|fields?|gyms?)\b/.test(value)) score += 90;
  if (/\bcamps?\b/.test(value)) score += 80;
  if (/\bclinics?\b|\bclasses?\b|\btraining\b|\bacademy\b/.test(value)) score += 75;
  if (/\btournaments?\b|\bevents?\b|\bschedule\b/.test(value)) score += 60;
  if (/\bregister\b|\bregistration\b|\bsign[-\s]?up\b|\bprograms?\b/.test(value)) score += 35;
  if (/\bprivacy\b|\bterms\b|\bdonate\b|\bsponsors?\b|\bnews\b|\bstore\b/.test(value)) score -= 80;
  return score;
};

const extractLikelyLinks = (page: PageResult) => {
  const dom = new JSDOM(page.html, { url: page.finalUrl, virtualConsole });
  const baseOrigin = new URL(page.finalUrl).origin;
  const seen = new Set<string>();
  return Array.from(dom.window.document.querySelectorAll("a[href]"))
    .map((link) => {
      const text = normalizeWhitespace(link.textContent ?? "");
      const href = link.getAttribute("href") ?? "";
      try {
        const url = new URL(href, page.finalUrl);
        url.hash = "";
        return { text, url: url.toString(), score: linkScore(text, url.toString()) };
      } catch {
        return null;
      }
    })
    .filter((item): item is { text: string; url: string; score: number } => Boolean(item))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      const parsed = new URL(item.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (item.score <= 0) return false;
      return parsed.origin === baseOrigin;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, maxPagesPerClub - 1));
};

const extractRegistrationUrl = (page: PageResult) => {
  const dom = new JSDOM(page.html, { url: page.finalUrl, virtualConsole });
  const links = Array.from(dom.window.document.querySelectorAll("a[href]"))
    .map((link) => {
      const text = normalizeWhitespace(link.textContent ?? "");
      const href = link.getAttribute("href") ?? "";
      try {
        return { text, url: new URL(href, page.finalUrl).toString(), score: linkScore(text, href) };
      } catch {
        return null;
      }
    })
    .filter((item): item is { text: string; url: string; score: number } => Boolean(item))
    .filter((item) => /\b(register|registration|sign[-\s]?up|book|apply)\b/i.test(`${item.text} ${item.url}`))
    .sort((a, b) => b.score - a.score);
  return links[0]?.url ?? page.finalUrl;
};

const extractRentalActionUrl = (page: PageResult) => {
  const dom = new JSDOM(page.html, { url: page.finalUrl, virtualConsole });
  const links = Array.from(dom.window.document.querySelectorAll("a[href]"))
    .map((link) => {
      const text = normalizeWhitespace(link.textContent ?? "");
      const href = link.getAttribute("href") ?? "";
      try {
        return { text, url: new URL(href, page.finalUrl).toString() };
      } catch {
        return null;
      }
    })
    .filter((item): item is { text: string; url: string } => Boolean(item))
    .filter((item) => !/newsletter|subscribe/i.test(`${item.text} ${item.url}`))
    .filter((item) => /\b(book|booking|reserve|availability|rental (?:form|application|agreement)|rent (?:a|the))\b/i.test(`${item.text} ${item.url}`));
  return links[0]?.url ?? page.finalUrl;
};

const monthIndex: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const timeNear = (text: string, index: number) => {
  const windowText = text.slice(index, Math.min(text.length, index + 180));
  const match = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(windowText);
  if (!match) return { hours: 0, minutes: 0 };
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridian = match[3]?.toUpperCase();
  if (meridian === "PM" && hours !== 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
};

const toIsoInPacific = (year: number, month: number, day: number, hours: number, minutes: number) => {
  const offset = month >= 2 && month <= 10 ? "-07:00" : "-08:00";
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00${offset}`;
};

const extractFutureDate = (text: string) => {
  const monthName =
    "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const monthDate = new RegExp(`\\b(${monthName})\\.?\\s+(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?(?:,)?\\s+(20\\d{2})\\b`, "gi");
  for (const match of text.matchAll(monthDate)) {
    const month = monthIndex[(match[1] ?? "").toLowerCase().replace(".", "")];
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month == null || !day || !year) continue;
    const time = timeNear(text, match.index ?? 0);
    const iso = toIsoInPacific(year, month, day, time.hours, time.minutes);
    if (new Date(iso) > now) return { iso, label: `${match[1]} ${day}, ${year}` };
  }

  const numericDate = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g;
  for (const match of text.matchAll(numericDate)) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const year = Number(match[3]);
    const time = timeNear(text, match.index ?? 0);
    const iso = toIsoInPacific(year, month, day, time.hours, time.minutes);
    if (new Date(iso) > now) return { iso, label: `${month + 1}/${day}/${year}` };
  }

  return null;
};

const countFutureDateSignals = (text: string) => {
  const monthName =
    "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const matches = [
    ...text.matchAll(new RegExp(`\\b(${monthName})\\.?\\s+\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?(?:,)?\\s+20\\d{2}\\b`, "gi")),
    ...text.matchAll(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/g),
  ];
  return matches.filter((match) => {
    const date = extractFutureDate(text.slice(match.index ?? 0, (match.index ?? 0) + 80));
    return date ? new Date(date.iso) > now : false;
  }).length;
};

const inferTags = (page: PageResult) => {
  const text = `${page.discoveryLabel ?? ""} ${page.title ?? ""} ${page.finalUrl}`.toLowerCase();
  const tags: string[] = [];
  if (!/\bpre[-\s]?tryout\b/.test(text) && /\btry[-\s]?outs?\b|\bevaluations?\b/.test(text)) tags.push("Tryouts");
  if (/\bcamps?\b/.test(text)) tags.push("Camp");
  if (/\bclinics?\b|\bclasses?\b|\btraining\b|\bacademy\b/.test(text)) tags.push("Clinic");
  if (/\btournaments?\b/.test(text)) tags.push("Tournament");
  if (/\bleagues?\b/.test(text)) tags.push("League");
  if (tags.length === 0 && /\bevents?\b|\bprograms?\b/.test(text)) tags.push("Event");
  return Array.from(new Set(tags));
};

const inferTitle = (page: PageResult, club: ClubRow, tags: string[]) => {
  const dom = new JSDOM(page.html, { url: page.finalUrl, virtualConsole });
  const h1 = normalizeWhitespace(dom.window.document.querySelector("h1")?.textContent ?? "");
  const h2 = normalizeWhitespace(dom.window.document.querySelector("h2")?.textContent ?? "");
  const options = [h1, h2, page.discoveryLabel, page.title].filter(Boolean) as string[];
  for (const option of options) {
    const cleaned = option
      .replace(/\s*[|–-]\s*.+$/g, "")
      .replace(/\bhome\b/gi, "")
      .trim();
    if (
      cleaned &&
      !/^welcome$/i.test(cleaned) &&
      !isGenericPageTitle(cleaned) &&
      !isGenericCandidateTitle(cleaned) &&
      cleaned.length <= 90
    ) {
      return cleaned;
    }
  }
  const tagLabel = tags.length > 0 ? tags.join(" & ") : "Event";
  return `${club.title} ${tagLabel}`;
};

const isGenericPageTitle = (value: string | null | undefined) =>
  /^(home|website manager|registration process|programs?|play for .+|adidas|20\d{2}(?:\D.*)?|.*season is complete)$/i.test(
    normalizeWhitespace(value ?? ""),
  );

const isGenericCandidateTitle = (value: string | null | undefined) =>
  /^(ready to compete\??|camp information|camps?\s*&\s*clinics?|training|facility rentals?|rentals?\s*&\s*amenities|discover your perfect\s*party space)$/i.test(
    normalizeWhitespace(value ?? ""),
  );

const isRootPage = (page: PageResult) => {
  try {
    const url = new URL(page.finalUrl);
    return url.pathname === "/" || url.pathname === "";
  } catch {
    return false;
  }
};

const extractPriceText = (text: string) => {
  const prices = Array.from(text.matchAll(/\$\s?(\d{1,4})(?:\.\d{2})?/g))
    .map((match) => Number(match[1]))
    .filter((value) => value >= 5 && value < 5000);
  if (!prices.length) return null;
  const unique = Array.from(new Set(prices)).sort((a, b) => a - b);
  if (unique.length > 4) return null;
  const min = unique[0] as number;
  const max = unique[unique.length - 1] as number;
  if (max / min > 5) return null;
  return min === max ? `$${min}` : `$${min}-$${max}`;
};

const descriptionForPage = (page: PageResult, club: ClubRow, tags: string[]) => {
  const sentences = page.text
    .split(/(?<=[.!?])\s+/)
    .map(normalizeWhitespace)
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 260)
    .filter((sentence) => /\btry[-\s]?outs?|evaluations?|camps?|clinics?|training|academy|tournaments?|events?|registration\b/i.test(sentence));
  if (sentences.length) return sentences.slice(0, 3).join(" ");

  const signal = new RegExp(
    `\\b(${tags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "event"}|registration|schedule)\\b`,
    "i",
  );
  const signalIndex = page.text.search(signal);
  if (signalIndex >= 0) {
    const start = Math.max(0, signalIndex - 120);
    return normalizeWhitespace(page.text.slice(start, signalIndex + 380));
  }

  return normalizeWhitespace(page.text.slice(0, 500));
};

const eventTypeLabel = (tags: string[]) => {
  if (tags.includes("Tryouts")) return "Tryouts";
  if (tags.includes("Tournament")) return "Tournament";
  if (tags.includes("League")) return "League";
  if (tags.includes("Camp")) return "Camp";
  if (tags.includes("Clinic")) return "Clinic";
  return "Event";
};

const isRentalPage = (page: PageResult) => {
  const label = `${page.discoveryLabel ?? ""} ${page.title ?? ""} ${page.finalUrl}`;
  const hasRentalLanguage = /\b(rentals?|rent\s+(?:a|our)\s+(?:court|field|gym|facility|space)|party[-\s]?rental)\b/i.test(label);
  const hasSportsBookingLanguage = /\b(book(?:ing)?|reserve)\b/i.test(label)
    && /\b(court|field|gym|facility|space)\b/i.test(label);
  return Boolean(page.discoveryLabel) && (hasRentalLanguage || hasSportsBookingLanguage);
};

const sourceVenueName = (value: string | null, fallback: string) => {
  const normalized = normalizeWhitespace(value ?? "");
  if (
    !normalized ||
    normalized.length > 100 ||
    /^\d+$/i.test(normalized) ||
    /\b(what we provide|tables|chairs|trash|follow us|contact us|read more|loading)\b/i.test(normalized)
  ) {
    return fallback;
  }
  return normalized;
};

const sourceCity = (value: string | null, fallback: string | null) => {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return fallback;
  if (/^(?:N|NE|NW|S|SE|SW|E|W)\s+/i.test(normalized)) return fallback;
  return normalized;
};

const buildRentalCandidateFromPage = (
  page: PageResult,
  club: ClubRow,
): DiscoveryCandidate => {
  const pageLocation = parseVenueAddressFromLocationText(page.text);
  const city = sourceCity(pageLocation.city, club.city);
  const address = sourceStreetAddress(pageLocation.address, city)
    ?? sourceStreetAddress(club.address, club.city);
  const title = inferTitle(page, club, ["Rental"]);
  const description = descriptionForPage(page, club, ["Rental"]);
  const warnings = [
    "Detected by club listing discovery. Review the official source page before publishing.",
  ];
  if (!address) {
    warnings.push("Rental page did not expose a reliable street address; resolve the facility location before publishing.");
  }

  return {
    listingKind: "RENTAL",
    title,
    officialActionUrl: extractRentalActionUrl(page),
    sourceUrl: page.finalUrl,
    organizerName: club.organizationName ?? club.title,
    sportName: club.sportName,
    formatLabel: "Facility rental",
    city,
    venueName: sourceVenueName(
      pageLocation.venueName,
      club.venueName ?? club.organizationName ?? club.title,
    ),
    address,
    dateDisplayMode: "ONGOING",
    dateDisplayText: "Check official availability",
    scheduleText: "Use the official booking page for current availability.",
    participantOptionsText: "External booking",
    priceText: extractPriceText(page.text),
    statusText: "Review the official booking page for current availability.",
    description,
    tags: ["Rental"],
    warnings,
  };
};

const buildCandidateFromPage = (page: PageResult, club: ClubRow): { candidate?: DiscoveryCandidate; skipped?: string } => {
  if (page.status >= 400) return { skipped: `HTTP ${page.status}` };
  if (isRentalPage(page)) {
    return { candidate: buildRentalCandidateFromPage(page, club) };
  }
  if (isRootPage(page) && !page.discoveryLabel) {
    return { skipped: "club homepage needs manual mapping" };
  }
  const labelText = `${page.discoveryLabel ?? ""} ${page.title ?? ""} ${page.finalUrl}`;
  if (isGenericPageTitle(page.discoveryLabel) || isGenericPageTitle(page.title)) {
    return { skipped: "generic page title needs manual mapping" };
  }
  if (club.sportName?.toLowerCase().includes("soccer") && /\bgolf\b/i.test(`${labelText} ${page.text.slice(0, 500)}`)) {
    return { skipped: "sport-mismatched page needs manual mapping" };
  }
  const tags = inferTags(page);
  if (tags.length === 0) return { skipped: "no event-like tag signal" };
  const futureDateSignals = countFutureDateSignals(page.text);
  const strongSingleProgramTag =
    tags.includes("Tryouts") || tags.includes("Camp") || tags.includes("Clinic");
  const pageLabel = `${page.title ?? ""} ${page.finalUrl}`.toLowerCase();
  if (!strongSingleProgramTag && /\bleagues?\s*&?\s*programs?\b|\bprograms?\b/.test(pageLabel)) {
    return { skipped: "generic programs page needs manual mapping" };
  }
  if (!strongSingleProgramTag && futureDateSignals > 2) {
    return { skipped: "multi-program page needs manual mapping" };
  }
  const date = extractFutureDate(page.text);
  if (!date) return { skipped: "no source-provided future date" };
  if (tags.includes("Tryouts") && !date.iso) return { skipped: "tryout page had no future date" };
  const title = inferTitle(page, club, tags);
  const registrationUrl = extractRegistrationUrl(page);
  const priceText = extractPriceText(page.text);
  const sportName = club.sportName ?? (club.sourceId.includes("ceva") ? "Indoor Volleyball" : "Grass Soccer");
  const formatLabel = eventTypeLabel(tags);
  const description = descriptionForPage(page, club, tags);

  return {
    candidate: {
      listingKind: "EVENT",
      title,
      officialActionUrl: registrationUrl,
      sourceUrl: page.finalUrl,
      organizerName: club.organizationName ?? club.title,
      sportName,
      formatLabel,
      city: club.city,
      venueName: club.venueName ?? club.organizationName ?? club.title,
      address: sourceStreetAddress(club.address, club.city),
      startsAt: date.iso,
      timeZone: "America/Los_Angeles",
      scheduleText: date.label,
      dateDisplayMode: "SCHEDULED",
      dateDisplayText: date.label,
      participantOptionsText: tags.includes("Tryouts") ? "Tryout registration" : "External registration",
      priceText,
      statusText: "Review official club site for current registration availability.",
      description,
      tags,
      warnings: [
        "Detected by club event discovery. Review the official source page before publishing.",
      ],
    },
  };
};

const discoverClub = async (club: ClubRow): Promise<ClubAudit> => {
  const audit: ClubAudit = {
    club: club.title,
    organizationId: club.publishedOrganizationId,
    website: club.officialActionUrl,
    robotsAllowed: null,
    robotsNote: null,
    fetchedPages: [],
    skipped: [],
    candidates: [],
  };

  if (isDirectoryOrSocialUrl(club.officialActionUrl)) {
    audit.skipped.push({ reason: "missing official club website or directory/social URL only" });
    return audit;
  }

  const robots = await auditRobots(club.officialActionUrl);
  audit.robotsAllowed = robots.allowed;
  audit.robotsNote = robots.note;
  if (robots.allowed === false) {
    audit.skipped.push({ reason: `blocked by robots (${robots.note})` });
    return audit;
  }

  let home: PageResult;
  try {
    home = await fetchPage(club.officialActionUrl);
  } catch (error) {
    audit.skipped.push({ reason: `homepage fetch failed: ${error instanceof Error ? error.message : String(error)}` });
    return audit;
  }
  audit.fetchedPages.push({ url: home.finalUrl, status: home.status, title: home.title });

  const links = extractLikelyLinks(home);
  const pages = [home];
  for (const link of links) {
    const pageRobots = await auditRobots(link.url);
    if (pageRobots.allowed === false) {
      audit.skipped.push({ url: link.url, reason: `blocked by robots (${pageRobots.note})` });
      continue;
    }
    try {
      const page = await fetchPage(link.url, link.text);
      audit.fetchedPages.push({ url: page.finalUrl, status: page.status, title: page.title });
      pages.push(page);
    } catch (error) {
      audit.skipped.push({ url: link.url, reason: `fetch failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  const seenCandidates = new Set<string>();
  for (const page of pages) {
    const exclusionReason = REVIEWED_DISCOVERY_EXCLUSIONS
      .get(club.publishedOrganizationId)
      ?.get(page.finalUrl)
      ?? (club.reviewedSourceUrls.includes(normalizeComparableUrl(page.finalUrl))
        ? "reviewed and intentionally excluded by an existing source mapping"
        : null);
    if (exclusionReason) {
      audit.skipped.push({ url: page.finalUrl, reason: `reviewed exclusion: ${exclusionReason}` });
      continue;
    }

    const result = buildCandidateFromPage(page, club);
    if (result.candidate) {
      const key = `${result.candidate.title}|${result.candidate.startsAt}|${result.candidate.sourceUrl}`;
      if (!seenCandidates.has(key)) {
        seenCandidates.add(key);
        audit.candidates.push(result.candidate);
      }
    } else if (result.skipped) {
      audit.skipped.push({ url: page.finalUrl, reason: result.skipped });
    }
  }

  return audit;
};

const sourceForClub = (club: ClubRow, candidates: DiscoveryCandidate[]): AffiliateScrapeMapping => ({
  kind: candidates.every((candidate) => candidate.listingKind === "RENTAL") ? "RENTAL" : "EVENT",
  listUrl: club.officialActionUrl,
  itemSelector: "body",
  fields: {
    title: { selector: "body", mode: "literal", value: `${club.title} Club Event Discovery` },
    officialActionUrl: { selector: "body", mode: "literal", value: club.officialActionUrl },
  },
  dedupe: {
    fields: ["officialActionUrl", "title", "startsAt"],
  },
  manualCandidates: candidates,
});

const writeClubCandidates = async (club: ClubRow, audit: ClubAudit) => {
  if (audit.candidates.length === 0) return;
  const { prisma } = await import("../src/lib/prisma");
  const { runAffiliateSourceScrape } = await import("../src/server/affiliateImports/service");
  const sourceSlug = slugify(club.organizationName ?? club.title);
  const sourceId = `affiliate_source_${sourceSlug}_club_events`;
  const sourceKey = `${sourceSlug}-club-events`;
  const mappingId = `${sourceId}_mapping_v1`;
  const now = new Date();
  const sourcePayload = {
    name: `${club.organizationName ?? club.title} Club Listings`,
    sourceKey,
    organizationId: club.publishedOrganizationId,
    baseUrl: new URL(club.officialActionUrl).origin,
    listUrl: club.officialActionUrl,
    targetKind: audit.candidates.every((candidate) => candidate.listingKind === "RENTAL")
      ? "RENTAL"
      : "EVENT",
    status: "ACTIVE",
    activeMappingId: mappingId,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes:
      "Manual event and rental candidates detected from the club official site. One-time club events require source-provided future dates and are not evergreen; rentals require a verified facility address before publishing.",
    metadata: {
      discoveredAt: now.toISOString(),
      discoveryScript: "scripts/discover-club-affiliate-events.ts",
      clubCandidateId: club.candidateId,
      robotsAllowed: audit.robotsAllowed,
      robotsNote: audit.robotsNote,
      fetchedPages: audit.fetchedPages,
      skipped: audit.skipped,
    },
  };
  const mapping = sourceForClub(club, audit.candidates);

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: sourceId },
    create: {
      id: sourceId,
      createdAt: now,
      updatedAt: now,
      ...sourcePayload,
    },
    update: {
      updatedAt: now,
      ...sourcePayload,
    },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: mappingId },
    create: {
      id: mappingId,
      sourceId,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: "Manual club event discovery candidates.",
      validatedAt: now,
    },
    update: {
      isActive: true,
      mapping,
      notes: "Manual club event discovery candidates.",
      validatedAt: now,
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: sourceId },
    data: { activeMappingId: mappingId },
  });

  const result = await runAffiliateSourceScrape(sourceId);
  audit.wroteSourceId = sourceId;
  audit.wroteRunId = result.run.id;
  audit.savedCandidateCount = result.candidates.length;
};

const main = async () => {
  const { prisma } = await import("../src/lib/prisma");
  const rows = (await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      listingKind: "CLUB",
      ...(sourceArg === "direct"
        ? { sourceId: { notIn: DIRECTORY_SOURCE_IDS } }
        : selectedSourceIds
          ? { sourceId: { in: selectedSourceIds } }
          : {}),
      publishedOrganizationId: { not: null },
    },
    select: {
      id: true,
      title: true,
      officialActionUrl: true,
      sourceId: true,
      sportName: true,
      city: true,
      venueName: true,
      address: true,
      publishedOrganizationId: true,
    },
    orderBy: { title: "asc" },
  })) as Array<{
    id: string;
    title: string;
    officialActionUrl: string;
    sourceId: string;
    sportName: string | null;
    city: string | null;
    venueName: string | null;
    address: string | null;
    publishedOrganizationId: string | null;
  }>;

  const organizationIds = Array.from(
    new Set(
      rows
        .map((row) => row.publishedOrganizationId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const organizations = await (prisma as any).organizations.findMany({
    where: { id: { in: organizationIds } },
    select: { id: true, name: true, website: true },
  });
  const organizationById = new Map<string, OrganizationSummary>(
    organizations.map((organization: OrganizationSummary) => [organization.id, organization]),
  );
  const existingSources = await (prisma as any).affiliateScrapeSources.findMany({
    where: { organizationId: { in: organizationIds } },
    select: { id: true, organizationId: true, metadata: true },
  });
  const reviewedSourceUrlsByOrganizationId = new Map<string, Set<string>>();
  const organizationIdBySourceId = new Map<string, string>();
  for (const source of existingSources as Array<{ id: string; organizationId: string | null; metadata: unknown }>) {
    if (!source.organizationId) continue;
    organizationIdBySourceId.set(source.id, source.organizationId);
    if (!source.metadata || typeof source.metadata !== "object") continue;
    const skippedRows = (source.metadata as { skippedRows?: unknown }).skippedRows;
    if (!Array.isArray(skippedRows)) continue;
    const urls = reviewedSourceUrlsByOrganizationId.get(source.organizationId) ?? new Set<string>();
    for (const row of skippedRows) {
      if (row && typeof row === "object" && typeof (row as { url?: unknown }).url === "string") {
        urls.add(normalizeComparableUrl(String((row as { url: string }).url)));
      }
    }
    reviewedSourceUrlsByOrganizationId.set(source.organizationId, urls);
  }
  const existingCandidates = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: { in: Array.from(organizationIdBySourceId.keys()) } },
    select: { sourceId: true, sourceUrl: true, officialActionUrl: true },
  });
  for (const candidate of existingCandidates as Array<{
    sourceId: string;
    sourceUrl: string | null;
    officialActionUrl: string;
  }>) {
    const organizationId = organizationIdBySourceId.get(candidate.sourceId);
    if (!organizationId) continue;
    const urls = reviewedSourceUrlsByOrganizationId.get(organizationId) ?? new Set<string>();
    if (candidate.sourceUrl) urls.add(normalizeComparableUrl(candidate.sourceUrl));
    if (candidate.officialActionUrl) urls.add(normalizeComparableUrl(candidate.officialActionUrl));
    reviewedSourceUrlsByOrganizationId.set(organizationId, urls);
  }
  const clubsByOrganizationId = new Map<string, ClubRow>();
  for (const row of rows
    .filter((row) => row.publishedOrganizationId)
    .sort((left, right) => left.title.localeCompare(right.title))) {
    const organizationId = row.publishedOrganizationId as string;
    const organization = organizationById.get(organizationId);
    const organizationName = organization?.name ?? row.title;
    if (
      clubFilter &&
      !organizationName.toLowerCase().includes(clubFilter) &&
      !row.title.toLowerCase().includes(clubFilter)
    ) {
      continue;
    }

    const existing = clubsByOrganizationId.get(organizationId);
    if (!existing) {
      clubsByOrganizationId.set(organizationId, {
        candidateId: row.id,
        title: organizationName,
        officialActionUrl: organization?.website || row.officialActionUrl,
        sourceId: row.sourceId,
        sportName: row.sportName,
        city: row.city,
        venueName: row.venueName,
        address: row.address,
        publishedOrganizationId: organizationId,
        organizationName,
        organizationWebsite: organization?.website ?? null,
        reviewedSourceUrls: Array.from(reviewedSourceUrlsByOrganizationId.get(organizationId) ?? []),
      });
      continue;
    }

    existing.sportName ??= row.sportName;
    existing.city ??= row.city;
    existing.venueName ??= row.venueName;
    existing.address ??= row.address;
  }

  const clubs: ClubRow[] = Array.from(clubsByOrganizationId.values())
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT);

  console.log(
    `Scanning ${clubs.length} club(s) from ${sourceArg}; write=${shouldWrite ? "yes" : "no"}.`,
  );

  const audits: ClubAudit[] = [];
  for (let index = 0; index < clubs.length; index += 1) {
    const club = clubs[index] as ClubRow;
    process.stdout.write(`[${index + 1}/${clubs.length}] ${club.title} ... `);
    const audit = await discoverClub(club);
    if (shouldWrite && audit.candidates.length > 0) {
      await writeClubCandidates(club, audit);
    }
    audits.push(audit);
    process.stdout.write(
      `${audit.candidates.length} candidate(s), ${audit.skipped.length} skipped\n`,
    );
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const suffix = `${new Date().toISOString().replace(/[:.]/g, "-")}${shouldWrite ? "-write" : "-dry-run"}`;
  const jsonPath = path.join(OUTPUT_DIR, `${suffix}.json`);
  await fs.writeFile(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: sourceArg,
        scanKinds: ["EVENT", "RENTAL"],
        write: shouldWrite,
        clubCount: clubs.length,
        candidateCount: audits.reduce((sum, audit) => sum + audit.candidates.length, 0),
        audits,
      },
      null,
      2,
    )}\n`,
  );

  const summary = audits.reduce(
    (acc, audit) => {
      acc.candidates += audit.candidates.length;
      acc.withCandidates += audit.candidates.length > 0 ? 1 : 0;
      acc.blocked += audit.robotsAllowed === false ? 1 : 0;
      return acc;
    },
    { candidates: 0, withCandidates: 0, blocked: 0 },
  );
  console.log(
    `Done. ${summary.candidates} candidate(s) across ${summary.withCandidates} club(s); ${summary.blocked} robots-blocked. Report: ${jsonPath}`,
  );

  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
