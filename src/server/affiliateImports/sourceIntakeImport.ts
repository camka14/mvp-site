import type { AffiliateSourceIntakeImportRow } from './sourceIntake';

const normalizeHeader = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
};

const splitKinds = (value: string): string[] => value
  .split(/[|;,]/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const sourceKeyFor = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100);

export type ParsedAffiliateSourceIntakeImport = {
  rows: AffiliateSourceIntakeImportRow[];
  rejected: Array<{ row: number; reason: string }>;
};

export const parseAffiliateSourceIntakeDelimitedText = (
  text: string,
): ParsedAffiliateSourceIntakeImport => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Bulk intake text requires a header and at least one source row.');
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  const column = (...names: string[]): number => headers.findIndex((header) => names.includes(header));
  const nameIndex = column('name', 'source', 'sourcename', 'organization', 'organizationname');
  const urlIndex = column('url', 'sourceurl', 'listurl', 'pageurl', 'website');
  if (nameIndex < 0 || urlIndex < 0) throw new Error('Bulk intake requires Name and URL columns.');
  const sourceKeyIndex = column('sourcekey', 'key', 'slug');
  const regionIndex = column('region', 'market', 'metro', 'location');
  const kindIndex = column('kind', 'kinds', 'targetkind', 'targetkinds', 'type');
  const roleIndex = column('role', 'pagerole');
  const notesIndex = column('notes', 'description');
  const grouped = new Map<string, AffiliateSourceIntakeImportRow>();
  const rejected: ParsedAffiliateSourceIntakeImport['rejected'] = [];

  lines.slice(1).forEach((line, rowOffset) => {
    const values = splitDelimitedLine(line, delimiter);
    const name = values[nameIndex]?.trim();
    const url = values[urlIndex]?.trim();
    if (!name || !url) {
      rejected.push({ row: rowOffset + 2, reason: 'Name and URL are required.' });
      return;
    }
    const sourceKey = values[sourceKeyIndex]?.trim() || sourceKeyFor(name);
    const key = sourceKey.toLowerCase();
    const targetKindHints = splitKinds(values[kindIndex] ?? '');
    const existing = grouped.get(key);
    if (existing) {
      existing.pages.push({
        url,
        role: values[roleIndex]?.trim() || undefined,
        targetKindHints,
      });
      existing.targetKindHints = Array.from(new Set([
        ...(existing.targetKindHints ?? []),
        ...targetKindHints,
      ]));
      return;
    }
    grouped.set(key, {
      name,
      sourceKey,
      region: values[regionIndex]?.trim() || undefined,
      targetKindHints,
      notes: values[notesIndex]?.trim() || undefined,
      pages: [{
        url,
        role: values[roleIndex]?.trim() || undefined,
        targetKindHints,
      }],
    });
  });

  return { rows: Array.from(grouped.values()), rejected };
};
