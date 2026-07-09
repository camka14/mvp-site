import fs from "node:fs/promises";
import path from "node:path";

type RegistryRow = {
  section: string;
  source: string;
  targetKind: string;
  priority: string;
  url: string;
  targetData: string;
  status: string;
  notes: string;
};

type RobotsRule = {
  type: "allow" | "disallow";
  value: string;
};

type RobotsAudit = {
  url: string;
  status: number | null;
  allowed: boolean | null;
  matchedRule: string | null;
  error: string | null;
};

type PageAudit = {
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  contentLength: number;
  dateSignalCount: number;
  priceSignalCount: number;
  addressSignalCount: number;
  actionLinks: Array<{ text: string; href: string }>;
  policyWarnings: string[];
  error: string | null;
};

type SourceAudit = RegistryRow & {
  origin: string;
  robots: RobotsAudit;
  page: PageAudit;
  recommendation: string;
  nextStep: string;
};

const SECTIONS = new Set([
  "Directory Sources To Mine First",
  "Club And Event Expansion Backlog",
]);

const OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "affiliate-source-audits",
);
const OUTPUT_BASENAME = "2026-07-09-new-source-backlog-audit";
const USER_AGENT = "BracketIQ source review bot; contact samuel.r@razumly.com";
const FETCH_TIMEOUT_MS = 20_000;

const normalizeCell = (value: string) => value.trim().replace(/\\\|/g, "|");

const splitMarkdownRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return [];
  }
  return trimmed.slice(1, -1).split("|").map(normalizeCell);
};

const parseRegistryRows = async () => {
  const document = await fs.readFile(
    "docs/admin-affiliate-scrape-sources.md",
    "utf8",
  );
  const rows: RegistryRow[] = [];
  let currentSection: string | null = null;

  for (const line of document.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      currentSection = heading[1]?.trim() ?? null;
      continue;
    }

    if (!currentSection || !SECTIONS.has(currentSection)) {
      continue;
    }

    const cells = splitMarkdownRow(line);
    if (
      cells.length !== 7 ||
      cells[0] === "Source" ||
      cells[0]?.startsWith("---")
    ) {
      continue;
    }

    rows.push({
      section: currentSection,
      source: cells[0] ?? "",
      targetKind: cells[1] ?? "",
      priority: cells[2] ?? "",
      url: cells[3] ?? "",
      targetData: cells[4] ?? "",
      status: cells[5] ?? "",
      notes: cells[6] ?? "",
    });
  }

  return rows;
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
    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

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

    if (!current) {
      continue;
    }

    if (key === "allow" || key === "disallow") {
      current.rules.push({ type: key, value });
    }
  }

  return groups
    .filter((group) => group.agents.includes("*"))
    .flatMap((group) => group.rules)
    .filter((rule) => rule.value.length > 0);
};

const ruleMatches = (rule: string, pathAndSearch: string) => {
  if (rule === "/") {
    return true;
  }

  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${pattern}${anchored ? "$" : ""}`);
  return regex.test(pathAndSearch);
};

const auditRobots = async (sourceUrl: string): Promise<RobotsAudit> => {
  const target = new URL(sourceUrl);
  const robotsUrl = `${target.origin}/robots.txt`;
  try {
    const response = await fetchText(robotsUrl);
    if (response.status >= 400) {
      return {
        url: robotsUrl,
        status: response.status,
        allowed: true,
        matchedRule: null,
        error: null,
      };
    }

    const rules = parseRobotsRules(response.body);
    const pathAndSearch = `${target.pathname}${target.search}`;
    const matching = rules
      .filter((rule) => ruleMatches(rule.value, pathAndSearch))
      .sort(
        (a, b) =>
          b.value.replace(/\*/g, "").length - a.value.replace(/\*/g, "").length,
      )[0];

    return {
      url: robotsUrl,
      status: response.status,
      allowed: matching ? matching.type === "allow" : true,
      matchedRule: matching ? `${matching.type}: ${matching.value}` : null,
      error: null,
    };
  } catch (error) {
    return {
      url: robotsUrl,
      status: null,
      allowed: null,
      matchedRule: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const textContent = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const extractMeta = (html: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexes = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const regex of regexes) {
    const match = regex.exec(html);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
};

const absoluteUrl = (href: string, baseUrl: string) => {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
};

const extractActionLinks = (html: string, baseUrl: string) => {
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  const hrefRegex = /\bhref=["']([^"']+)["']/i;
  const actionRegex =
    /\b(register|registration|sign\s*up|tryout|tryouts|teams?|programs?|events?|camps?|clinics?|league|tournament|schedule|directory|club|book|booking|reserve|more info)\b/i;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html))) {
    const href = hrefRegex.exec(match[1] ?? "")?.[1];
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }
    const text = textContent(match[2] ?? "").slice(0, 120);
    if (!text || !actionRegex.test(text)) {
      continue;
    }
    links.push({ text, href: absoluteUrl(href, baseUrl) });
    if (links.length >= 20) {
      break;
    }
  }

  return links;
};

const auditPage = async (sourceUrl: string): Promise<PageAudit> => {
  try {
    const response = await fetchText(sourceUrl);
    const bodyText = textContent(response.body);
    const title =
      /<title[^>]*>([\s\S]*?)<\/title>/i
        .exec(response.body)?.[1]
        ?.replace(/\s+/g, " ")
        .trim() ?? null;
    const lower = bodyText.toLowerCase();
    const policyWarnings = [
      ["no scraping", lower.includes("no scraping")],
      ["scraping prohibited", lower.includes("scraping prohibited")],
      ["automated means", lower.includes("automated means")],
      ["robots", lower.includes("robots")],
      ["login required", lower.includes("log in") || lower.includes("sign in")],
      [
        "access denied",
        lower.includes("access denied") || lower.includes("forbidden"),
      ],
    ]
      .filter(([, present]) => present)
      .map(([label]) => String(label));

    return {
      status: response.status,
      finalUrl: response.finalUrl,
      title,
      description:
        extractMeta(response.body, "description") ??
        extractMeta(response.body, "og:description"),
      ogImage:
        extractMeta(response.body, "og:image") ??
        extractMeta(response.body, "twitter:image"),
      contentLength: bodyText.length,
      dateSignalCount: (
        bodyText.match(
          /\b(?:20[2-9]\d|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi,
        ) ?? []
      ).length,
      priceSignalCount: (bodyText.match(/\$\s?\d/gi) ?? []).length,
      addressSignalCount: (
        bodyText.match(
          /\b\d{2,6}\s+[A-Za-z0-9'.-]+(?:\s+[A-Za-z0-9'.-]+){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Way|Lane|Ln|Court|Ct|Highway|Hwy)\b/gi,
        ) ?? []
      ).length,
      actionLinks: extractActionLinks(response.body, response.finalUrl),
      policyWarnings,
      error: null,
    };
  } catch (error) {
    return {
      status: null,
      finalUrl: null,
      title: null,
      description: null,
      ogImage: null,
      contentLength: 0,
      dateSignalCount: 0,
      priceSignalCount: 0,
      addressSignalCount: 0,
      actionLinks: [],
      policyWarnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const classifyRecommendation = (
  row: RegistryRow,
  robots: RobotsAudit,
  page: PageAudit,
) => {
  if (robots.allowed === false) {
    return {
      recommendation: "BLOCKED_BY_ROBOTS",
      nextStep: `Mark blocked or choose a different official URL. Matched ${robots.matchedRule}.`,
    };
  }

  if (
    page.policyWarnings.some(
      (warning) =>
        warning.includes("scraping") || warning === "automated means",
    )
  ) {
    return {
      recommendation: "POLICY_REVIEW",
      nextStep:
        "Manual terms review required before ScrapingDog or saved mappings.",
    };
  }

  if (page.error || (page.status != null && page.status >= 400)) {
    return {
      recommendation: "FETCH_REVIEW",
      nextStep:
        "Open in rendered browser and verify whether the source blocks simple public fetches.",
    };
  }

  if (/Directory/i.test(row.targetKind)) {
    return {
      recommendation: "DIRECTORY_MINE",
      nextStep:
        "Mine org/team links first; create public CLUB org candidates before event/team/rental mappings.",
    };
  }

  if (
    /CLUB/i.test(row.targetKind) &&
    !/EVENT|TEAM|RENTAL/i.test(row.targetKind)
  ) {
    return {
      recommendation: "CLUB_ORG_FIRST",
      nextStep:
        "Create/update public organization candidate, then inspect official registration/tryout/program links.",
    };
  }

  if (
    page.dateSignalCount > 0 ||
    page.priceSignalCount > 0 ||
    page.actionLinks.length > 0
  ) {
    return {
      recommendation: "PROMOTE_TO_RENDERED_INSPECTION",
      nextStep:
        "Use rendered browser/ScrapingDog on the unfiltered list/detail page and design a source-specific mapping.",
    };
  }

  return {
    recommendation: "LOW_SIGNAL_REVIEW",
    nextStep:
      "Manual browser review needed; page did not expose enough date, price, action-link, or address signals in static HTML.",
  };
};

const runLimited = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) => {
  const results: R[] = [];
  let next = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index] as T, index);
      }
    },
  );

  await Promise.all(workers);
  return results;
};

const auditSource = async (
  row: RegistryRow,
  index: number,
): Promise<SourceAudit> => {
  const origin = new URL(row.url).origin;
  process.stdout.write(`[${index + 1}] ${row.source} ... `);
  const robots = await auditRobots(row.url);
  const page =
    robots.allowed === false
      ? {
          status: null,
          finalUrl: null,
          title: null,
          description: null,
          ogImage: null,
          contentLength: 0,
          dateSignalCount: 0,
          priceSignalCount: 0,
          addressSignalCount: 0,
          actionLinks: [],
          policyWarnings: [],
          error: "Skipped page fetch because robots disallows the target path.",
        }
      : await auditPage(row.url);
  const classification = classifyRecommendation(row, robots, page);
  process.stdout.write(`${classification.recommendation}\n`);
  return {
    ...row,
    origin,
    robots,
    page,
    ...classification,
  };
};

const markdownEscape = (value: string | null | undefined) =>
  (value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

const writeOutputs = async (audits: SourceAudit[]) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`);
  const markdownPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.md`);

  await fs.writeFile(
    jsonPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), audits }, null, 2)}\n`,
  );

  const counts = audits.reduce<Record<string, number>>((acc, audit) => {
    acc[audit.recommendation] = (acc[audit.recommendation] ?? 0) + 1;
    return acc;
  }, {});

  const lines = [
    "# Affiliate Source Backlog Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Recommendation Counts",
    "",
    ...Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Sources",
    "",
    "| Source | Target | Robots | Page | Signals | Recommendation | Next step |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...audits.map((audit) => {
      const robots =
        audit.robots.allowed === false
          ? `blocked (${audit.robots.matchedRule ?? "rule unknown"})`
          : audit.robots.allowed === true
            ? "allowed"
            : `unknown (${audit.robots.error ?? "no result"})`;
      const page = audit.page.status
        ? `${audit.page.status} ${audit.page.title ?? ""}`
        : `n/a ${audit.page.error ?? ""}`;
      const signals = [
        `dates ${audit.page.dateSignalCount}`,
        `prices ${audit.page.priceSignalCount}`,
        `addresses ${audit.page.addressSignalCount}`,
        `links ${audit.page.actionLinks.length}`,
      ].join(", ");
      return `| ${markdownEscape(audit.source)} | ${markdownEscape(audit.targetKind)} | ${markdownEscape(robots)} | ${markdownEscape(page)} | ${markdownEscape(signals)} | ${markdownEscape(audit.recommendation)} | ${markdownEscape(audit.nextStep)} |`;
    }),
  ];

  await fs.writeFile(markdownPath, `${lines.join("\n")}\n`);
  return { jsonPath, markdownPath };
};

const main = async () => {
  const rows = await parseRegistryRows();
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
  const selectedRows =
    Number.isFinite(limit) && limit != null
      ? rows.slice(0, Math.max(0, limit))
      : rows;
  const audits = await runLimited(selectedRows, 6, auditSource);
  const outputs = await writeOutputs(audits);

  console.log(`\nAudited ${audits.length} sources.`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Markdown: ${outputs.markdownPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
