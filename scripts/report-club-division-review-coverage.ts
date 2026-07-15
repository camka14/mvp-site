import fs from 'node:fs/promises';
import path from 'node:path';
import { reviewedClubDivisionCatalog } from './data/reviewed-club-divisions';

type AuditRow = {
  organizationId: string;
  organizationName: string;
  website: string | null;
  sports: string[];
  status: string;
  evidence?: {
    skills?: unknown[];
    ages?: unknown[];
    prices?: unknown[];
  };
};

const AUDIT_DIRECTORY = path.join(process.cwd(), 'output', 'club-division-source-audit');
const OBVIOUS_NON_CLUB_NAMES = new Set([
  'Columbia Empire Volleyball Association',
  'Mountain View Ice Arena',
  'NW Nations Tournament Baseball',
  'Oregon State Hockey Association',
  'Oregon Youth Soccer Association',
  'Portland Indoor Soccer',
  'Portland Youth Soccer Association',
  'The Plex',
  'The Rink Exchange',
]);

const latestAuditPath = async (): Promise<string> => {
  const files = (await fs.readdir(AUDIT_DIRECTORY))
    .filter((name) => name.endsWith('-all-sports.json'))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) throw new Error(`No all-sports audit exists in ${AUDIT_DIRECTORY}.`);
  return path.join(AUDIT_DIRECTORY, latest);
};

const main = async () => {
  const auditPath = await latestAuditPath();
  const audit = JSON.parse(await fs.readFile(auditPath, 'utf8')) as { generatedAt: string; audits: AuditRow[] };
  const reviewedById = new Map(reviewedClubDivisionCatalog.map((entry) => [entry.organizationId, entry]));
  const rows = audit.audits.map((organization) => {
    const reviewed = reviewedById.get(organization.organizationId);
    const pricedCount = reviewed?.divisions.filter((division) => division.priceCents != null).length ?? 0;
    return {
      ...organization,
      reviewedCount: reviewed?.divisions.length ?? 0,
      pricedCount,
      classification: OBVIOUS_NON_CLUB_NAMES.has(organization.organizationName) ? 'classification review' : 'club',
    };
  });
  const reviewedRows = rows.filter((row) => row.reviewedCount > 0);
  const unresolvedRows = rows.filter((row) => row.reviewedCount === 0);
  const outputPath = path.join(AUDIT_DIRECTORY, 'latest-review-coverage.md');
  const lines = [
    '# Club Division Review Coverage',
    '',
    `Generated from: \`${path.basename(auditPath)}\``,
    '',
    `- Candidate organizations: ${rows.length}`,
    `- Source-backed division catalogs: ${reviewedRows.length}`,
    `- Reviewed divisions: ${reviewedRows.reduce((total, row) => total + row.reviewedCount, 0)}`,
    `- Reviewed divisions with a current published total: ${reviewedRows.reduce((total, row) => total + row.pricedCount, 0)}`,
    `- Awaiting manual source review: ${unresolvedRows.length}`,
    `- Obvious non-club classification reviews: ${rows.filter((row) => row.classification !== 'club').length}`,
    '',
    'A null price is intentional when the official site does not publish a current full season or club total. Tryout fees, deposits, installments, uniforms, camps, and tournament entry fees are not division prices.',
    '',
    '## Reviewed',
    '',
    '| Organization | Sports | Divisions | Priced | Official site |',
    '| --- | --- | ---: | ---: | --- |',
    ...reviewedRows.map((row) => `| ${row.organizationName} | ${row.sports.join(', ')} | ${row.reviewedCount} | ${row.pricedCount} | ${row.website ?? 'Missing'} |`),
    '',
    '## Awaiting Manual Review',
    '',
    '| Organization | Sports | Fetch status | Evidence | Classification | Official site |',
    '| --- | --- | --- | --- | --- | --- |',
    ...unresolvedRows.map((row) => {
      const evidence = [
        `${row.evidence?.skills?.length ?? 0} skill`,
        `${row.evidence?.ages?.length ?? 0} age`,
        `${row.evidence?.prices?.length ?? 0} price`,
      ].join(' / ');
      return `| ${row.organizationName} | ${row.sports.join(', ')} | ${row.status} | ${evidence} | ${row.classification} | ${row.website ?? 'Missing'} |`;
    }),
    '',
  ];
  await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log({ candidates: rows.length, reviewed: reviewedRows.length, unresolved: unresolvedRows.length });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
