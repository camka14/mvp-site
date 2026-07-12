import { prisma } from '../src/lib/prisma';
import {
  inferDivisionDetails,
  normalizeDivisionRatingType,
  normalizeDivisionTypeIds,
} from '../src/lib/divisionTypes';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');

type AuditSummary = {
  total: number;
  changed: number;
  compositeBackfilled: number;
  legacyInferred: number;
  scopeRepaired: number;
  unresolved: Array<{ id: string; reason: string }>;
};

const main = async (): Promise<void> => {
  const rows = await prisma.divisions.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      eventId: true,
      organizationId: true,
      scope: true,
      sportId: true,
      divisionTypeId: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
      ratingType: true,
    },
    orderBy: { id: 'asc' },
  });

  const summary: AuditSummary = {
    total: rows.length,
    changed: 0,
    compositeBackfilled: 0,
    legacyInferred: 0,
    scopeRepaired: 0,
    unresolved: [],
  };

  for (const row of rows) {
    if (!row.eventId && !row.organizationId) {
      summary.unresolved.push({ id: row.id, reason: 'division has neither eventId nor organizationId' });
      continue;
    }

    const inferred = inferDivisionDetails({
      identifier: row.key ?? row.divisionTypeId ?? row.id,
      sportInput: row.sportId ?? undefined,
      fallbackName: row.name,
    });
    const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
    const normalized = normalizeDivisionTypeIds({
      divisionTypeId: row.divisionTypeId ?? inferred.divisionTypeId,
      skillDivisionTypeId: row.skillDivisionTypeId,
      ageDivisionTypeId: row.ageDivisionTypeId,
      ratingType,
    });
    const scope = row.eventId ? 'EVENT' as const : 'ORGANIZATION' as const;
    const changed = row.divisionTypeId !== normalized.divisionTypeId
      || row.skillDivisionTypeId !== normalized.skillDivisionTypeId
      || row.ageDivisionTypeId !== normalized.ageDivisionTypeId
      || row.scope !== scope;

    if (!changed) continue;

    summary.changed += 1;
    if (!row.skillDivisionTypeId || !row.ageDivisionTypeId) {
      if (String(row.divisionTypeId ?? '').startsWith('skill_')) {
        summary.compositeBackfilled += 1;
      } else {
        summary.legacyInferred += 1;
      }
    }
    if (row.scope !== scope) summary.scopeRepaired += 1;

    if (write) {
      await prisma.divisions.update({
        where: { id: row.id },
        data: {
          scope,
          divisionTypeId: normalized.divisionTypeId,
          skillDivisionTypeId: normalized.skillDivisionTypeId,
          ageDivisionTypeId: normalized.ageDivisionTypeId,
          ratingType,
          updatedAt: new Date(),
        },
      });
    }
  }

  console.log(JSON.stringify({ mode: write ? 'write' : 'report', ...summary }, null, 2));
  if (summary.unresolved.length > 0) process.exitCode = 2;
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
