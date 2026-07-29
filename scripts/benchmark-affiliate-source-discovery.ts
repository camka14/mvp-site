import fs from 'fs';
import path from 'path';
import {
  evaluateAffiliateSourceDiscoveryResult,
} from '@/server/affiliateImports/sourceDiscoveryRules';
import type { AffiliateSourceDiscoveryQuery } from '@/server/affiliateImports/sourceDiscoveryTypes';

type JsonRecord = Record<string, any>;

const DEFAULT_INPUT = path.resolve(
  process.cwd(),
  'output/affiliate-discovery-review-2026-07-28',
);

const PROFILE_SOURCE_TYPES: Record<string, string[]> = {
  'clubs-programs': ['CLUB'],
  'tryouts-evaluations': ['TRYOUT'],
  'leagues-tournaments-events': ['EVENT', 'LEAGUE', 'TOURNAMENT'],
  'camps-clinics-open-play': ['CAMP', 'CLINIC', 'OPEN_PLAY'],
  'facilities-rentals': ['RENTAL'],
  'broad-directory': ['DIRECTORY'],
};

const argValue = (flag: string): string | null => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};

const profileKeyFromTemplate = (templateKey: unknown): string => {
  const raw = typeof templateKey === 'string' ? templateKey : '';
  if (raw.startsWith('PROFILE:')) return raw.slice('PROFILE:'.length);
  if (raw === 'broad-directory') return raw;
  return 'legacy';
};

const campaignTargets = (campaign: JsonRecord): Array<{ city: string; state: string }> => {
  const covered = Array.isArray(campaign.metadata?.coveredCities)
    ? campaign.metadata.coveredCities
      .map((row: JsonRecord) => ({
        city: String(row.city ?? '').trim(),
        state: String(row.state ?? '').trim(),
      }))
      .filter((row: { city: string; state: string }) => row.city && row.state)
    : [];
  if (covered.length) return covered;
  const [city = '', state = ''] = String(campaign.location ?? campaign.region ?? '')
    .split(',')
    .map((value) => value.trim());
  return city ? [{ city, state }] : [];
};

const targetForQuery = (
  campaign: JsonRecord,
  queryText: string,
): { city: string | null; state: string | null } => {
  const targets = campaignTargets(campaign);
  const matched = targets.find((target) => (
    queryText.toLowerCase().includes(target.city.toLowerCase())
  )) ?? targets[0];
  return {
    city: matched?.city ?? null,
    state: matched?.state ?? null,
  };
};

const queryIndexForExport = (data: JsonRecord): Map<string, JsonRecord> => {
  const byText = new Map<string, JsonRecord>();
  for (const run of data.runs ?? []) {
    for (const query of run.summary?.queries ?? []) {
      if (typeof query.query === 'string') byText.set(query.query, query);
    }
  }
  return byText;
};

const discoveryQueryForResult = (
  data: JsonRecord,
  result: JsonRecord,
  queryIndex: Map<string, JsonRecord>,
): AffiliateSourceDiscoveryQuery => {
  const raw = queryIndex.get(result.latestQuery) ?? {};
  const profileKey = profileKeyFromTemplate(raw.templateKey);
  const sourceTypes = PROFILE_SOURCE_TYPES[profileKey]
    ?? (Array.isArray(result.sourceTypeHints) && result.sourceTypeHints.length
      ? result.sourceTypeHints
      : [raw.sourceType ?? 'DIRECTORY']);
  const target = targetForQuery(data.campaign, result.latestQuery ?? '');
  const sportName = typeof raw.sportName === 'string'
    ? raw.sportName
    : Array.isArray(result.sportHints) ? result.sportHints[0] ?? null : null;
  return {
    query: result.latestQuery ?? '',
    templateKey: typeof raw.templateKey === 'string' ? raw.templateKey : `BENCHMARK:${profileKey}`,
    profileSourceTypes: sourceTypes,
    sportId: typeof raw.sportId === 'string' ? raw.sportId : sportName,
    sportName,
    sourceType: typeof raw.sourceType === 'string' ? raw.sourceType : sourceTypes[0],
    targetCity: target.city,
    targetState: target.state,
  };
};

const increment = (record: Record<string, number>, key: string): void => {
  record[key] = (record[key] ?? 0) + 1;
};

const filesForInput = (input: string): string[] => (
  fs.statSync(input).isDirectory()
    ? fs.readdirSync(input)
      .filter((name) => name.endsWith('.json') && name !== 'metros.json')
      .map((name) => path.join(input, name))
      .sort()
    : [input]
);

const input = path.resolve(argValue('--input') ?? DEFAULT_INPUT);
const files = filesForInput(input);
const overall = {
  rows: 0,
  oldStatus: {} as Record<string, number>,
  newStatus: {} as Record<string, number>,
  classifications: {} as Record<string, number>,
  autoPromotionEligible: 0,
  intermediaryAutoPromotionEligible: 0,
  staleOrClosedAutoPromotionEligible: 0,
  stateOnlyAutoPromotionEligible: 0,
  directoryAutoPromotionEligible: 0,
  changedStatus: 0,
  eligibleHosts: {} as Record<string, number>,
};
const metros: JsonRecord[] = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as JsonRecord;
  const queryIndex = queryIndexForExport(data);
  const selectedSportNames = Array.from(new Set(
    (data.results ?? []).flatMap((result: JsonRecord) => result.sportHints ?? []),
  ));
  const selectedSports = selectedSportNames.map((name) => ({ id: String(name), name: String(name) }));
  const now = new Date(data.exportedAt ?? '2026-07-29T00:00:00.000Z');
  const metro = {
    campaign: data.campaign?.name ?? path.basename(file),
    rows: 0,
    oldStatus: {} as Record<string, number>,
    newStatus: {} as Record<string, number>,
    classifications: {} as Record<string, number>,
    autoPromotionEligible: 0,
    changedStatus: 0,
    eligibleSamples: [] as JsonRecord[],
  };

  for (const result of data.results ?? []) {
    const query = discoveryQueryForResult(data, result, queryIndex);
    const evaluation = evaluateAffiliateSourceDiscoveryResult({
      url: result.originalUrl ?? result.canonicalUrl,
      title: result.title,
      description: result.description,
      query,
      campaignRegion: data.campaign?.region ?? '',
      selectedSports,
      currentYear: now.getUTCFullYear(),
      now,
    });
    overall.rows += 1;
    metro.rows += 1;
    increment(overall.oldStatus, result.status ?? 'UNKNOWN');
    increment(overall.newStatus, evaluation.status);
    increment(overall.classifications, evaluation.classification);
    increment(metro.oldStatus, result.status ?? 'UNKNOWN');
    increment(metro.newStatus, evaluation.status);
    increment(metro.classifications, evaluation.classification);
    if (evaluation.status !== result.status) {
      overall.changedStatus += 1;
      metro.changedStatus += 1;
    }
    if (evaluation.autoPromotionEligible) {
      overall.autoPromotionEligible += 1;
      metro.autoPromotionEligible += 1;
      if (evaluation.canonicalUrl) {
        increment(
          overall.eligibleHosts,
          new URL(evaluation.canonicalUrl).hostname.replace(/^www\./, ''),
        );
      }
      if (metro.eligibleSamples.length < 10) {
        metro.eligibleSamples.push({
          title: result.title,
          url: evaluation.canonicalUrl,
          query: query.query,
          score: evaluation.score,
          sportHints: evaluation.sportHints,
          sourceTypeHints: evaluation.sourceTypeHints,
        });
      }
      if (evaluation.classification === 'INTERMEDIARY') {
        overall.intermediaryAutoPromotionEligible += 1;
      }
      if (evaluation.reasonCodes.some((code) => ['PAST_DATE', 'CLOSED_OR_ENDED', 'STALE_YEAR'].includes(code))) {
        overall.staleOrClosedAutoPromotionEligible += 1;
      }
      if (evaluation.reasonCodes.includes('STATE_ONLY')) {
        overall.stateOnlyAutoPromotionEligible += 1;
      }
      if (query.sourceType === 'DIRECTORY') {
        overall.directoryAutoPromotionEligible += 1;
      }
    }
  }
  metros.push(metro);
}

const report = {
  input,
  files: files.length,
  overall,
  metros,
  assertions: {
    intermediaryAutoPromotionEligible: overall.intermediaryAutoPromotionEligible === 0,
    staleOrClosedAutoPromotionEligible: overall.staleOrClosedAutoPromotionEligible === 0,
    stateOnlyAutoPromotionEligible: overall.stateOnlyAutoPromotionEligible === 0,
    directoryAutoPromotionEligible: overall.directoryAutoPromotionEligible === 0,
  },
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(report.assertions).some((passed) => !passed)) process.exitCode = 1;
