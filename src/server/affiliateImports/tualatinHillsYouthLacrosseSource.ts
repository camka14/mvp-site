import { JSDOM } from "jsdom";
import type { AffiliateScrapeMapping } from "./types";

const LIST_URL =
  "https://www.tualatinhillsparks.org/624/Youth-Lacrosse";
const DIRECTORY_CITY = "Beaverton, OR";

type DirectoryCandidate = NonNullable<
  AffiliateScrapeMapping["manualCandidates"]
>[number];

export type TualatinHillsYouthLacrosseDirectoryResult = {
  candidates: DirectoryCandidate[];
  skippedRows: Array<{ title: string; href: string; reason: string }>;
};

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const normalizeHttpUrl = (href: string) => {
  try {
    const url = new URL(href, LIST_URL);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

export const parseTualatinHillsYouthLacrosseDirectory = (
  html: string,
): TualatinHillsYouthLacrosseDirectoryResult => {
  const document = new JSDOM(html).window.document;
  const memberHeading = Array.from(document.querySelectorAll("h1, h2, h3, h4"))
    .find((heading) =>
      /^Member Clubs$/i.test(normalizeWhitespace(heading.textContent ?? "")),
    );
  const memberList = memberHeading?.nextElementSibling?.matches("ul")
    ? memberHeading.nextElementSibling
    : null;

  if (!memberList) {
    return {
      candidates: [],
      skippedRows: [
        {
          title: "(directory)",
          href: LIST_URL,
          reason: "member club list was not found after the Member Clubs heading",
        },
      ],
    };
  }

  const candidates: DirectoryCandidate[] = [];
  const skippedRows: TualatinHillsYouthLacrosseDirectoryResult["skippedRows"] =
    [];
  const seen = new Set<string>();

  for (const link of Array.from(memberList.querySelectorAll("li > a[href]"))) {
    const title = normalizeWhitespace(link.textContent ?? "");
    const rawHref = link.getAttribute("href") ?? "";
    const officialActionUrl = normalizeHttpUrl(rawHref);
    if (!title || !officialActionUrl) {
      skippedRows.push({
        title: title || "(missing title)",
        href: rawHref,
        reason: !title ? "missing club name" : "invalid or non-HTTP club URL",
      });
      continue;
    }

    const dedupeKey = `${title.toLowerCase()}|${officialActionUrl.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    candidates.push({
      listingKind: "CLUB",
      title,
      officialActionUrl,
      sourceUrl: LIST_URL,
      organizerName: title,
      sportName: "Lacrosse",
      formatLabel: "Youth lacrosse club",
      city: DIRECTORY_CITY,
      venueName: title,
      address: DIRECTORY_CITY,
      tags: ["Club", "Youth"],
      dateDisplayMode: "ONGOING",
      dateDisplayText: "Club programs by season",
      scheduleText:
        "Registration and seasonal schedules are managed by the individual club.",
      ageGroup: "Grades 1-8",
      participantOptionsText:
        "Boys and girls youth lacrosse programs for grades 1-8.",
      description: `${title} is listed by Tualatin Hills Park & Recreation District as a Tualatin Valley Youth Lacrosse League member club serving a Beaverton School District high school attendance area. The official club website is the source for current registration, teams, schedules, and contact information.`,
      warnings: [
        "Directory candidate only. Inspect the official club site before adding tryouts, camps, clinics, registrations, divisions, prices, or teams.",
        "Beaverton, OR is directory-level location context, not a verified club facility address.",
      ],
    });
  }

  return {
    candidates: candidates.sort((left, right) =>
      left.title.localeCompare(right.title),
    ),
    skippedRows,
  };
};
