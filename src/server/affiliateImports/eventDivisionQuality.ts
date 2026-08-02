export type AffiliateEventDivisionCandidateRow = {
  id: string;
  title: string;
  rawPayload: unknown;
};

export type AffiliateEventDivisionIssue = {
  candidateId: string;
  title: string;
  divisionIndex: number | null;
  code:
    | 'EVENT_DIVISION_REQUIRED'
    | 'EVENT_DIVISION_NAME_INVALID'
    | 'EVENT_DIVISION_CLASSIFICATION_INVALID'
    | 'EVENT_DIVISION_DUPLICATE';
  message: string;
};

export type AffiliateEventDivisionQuality = {
  checkedEventCount: number;
  validEventCount: number;
  issueCount: number;
  passed: boolean;
  issues: AffiliateEventDivisionIssue[];
};

type DivisionRecord = Record<string, unknown>;

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const nonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizedDivisions = (rawPayload: unknown): DivisionRecord[] => {
  const normalizedImport = recordValue(recordValue(rawPayload).normalizedImport);
  return Array.isArray(normalizedImport.divisions)
    ? normalizedImport.divisions.filter(
        (value): value is DivisionRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
      )
    : [];
};

export const analyzeAffiliateEventDivisionQuality = (
  rows: AffiliateEventDivisionCandidateRow[],
): AffiliateEventDivisionQuality => {
  const issues: AffiliateEventDivisionIssue[] = [];
  let validEventCount = 0;

  for (const row of rows) {
    const divisions = normalizedDivisions(row.rawPayload);
    if (divisions.length === 0) {
      issues.push({
        candidateId: row.id,
        title: row.title,
        divisionIndex: null,
        code: 'EVENT_DIVISION_REQUIRED',
        message: 'Every accepted event requires at least one source-supported division.',
      });
      continue;
    }

    const keys = new Set<string>();
    divisions.forEach((division, divisionIndex) => {
      const name = nonEmptyString(division.name);
      if (!name) {
        issues.push({
          candidateId: row.id,
          title: row.title,
          divisionIndex,
          code: 'EVENT_DIVISION_NAME_INVALID',
          message: 'A division requires the source display name.',
        });
      }

      const gender = nonEmptyString(division.gender);
      const ratingType = nonEmptyString(division.ratingType);
      const divisionTypeId = nonEmptyString(division.divisionTypeId);
      const skillDivisionTypeId = nonEmptyString(division.skillDivisionTypeId);
      const ageDivisionTypeId = nonEmptyString(division.ageDivisionTypeId);
      if (
        !gender
        || !['M', 'F', 'C'].includes(gender)
        || !ratingType
        || !['AGE', 'SKILL'].includes(ratingType)
        || !divisionTypeId
        || !skillDivisionTypeId
        || !ageDivisionTypeId
      ) {
        issues.push({
          candidateId: row.id,
          title: row.title,
          divisionIndex,
          code: 'EVENT_DIVISION_CLASSIFICATION_INVALID',
          message: 'A division requires canonical gender, rating type, division, skill, and age identifiers.',
        });
      }

      const key = nonEmptyString(division.key)?.toLowerCase();
      if (key && keys.has(key)) {
        issues.push({
          candidateId: row.id,
          title: row.title,
          divisionIndex,
          code: 'EVENT_DIVISION_DUPLICATE',
          message: `Division key ${key} occurs more than once in the same event.`,
        });
      }
      if (key) keys.add(key);
    });

    if (!issues.some((issue) => issue.candidateId === row.id)) {
      validEventCount += 1;
    }
  }

  return {
    checkedEventCount: rows.length,
    validEventCount,
    issueCount: issues.length,
    passed: issues.length === 0,
    issues,
  };
};

export const inspectAffiliateEventDivisionQuality = async (input: {
  queryable: {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: T[] }>;
  };
  sourceId: string;
}): Promise<AffiliateEventDivisionQuality> => {
  const result = await input.queryable.query<AffiliateEventDivisionCandidateRow>(
    `SELECT id, title, "rawPayload"
       FROM "AffiliateImportCandidates"
      WHERE "sourceId" = $1
        AND "listingKind" = 'EVENT'
      ORDER BY "dedupeKey" ASC`,
    [input.sourceId],
  );
  return analyzeAffiliateEventDivisionQuality(result.rows);
};
