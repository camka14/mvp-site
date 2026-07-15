/**
 * Replaces legacy free-form organization division skill ids with strict,
 * sport-specific filter ids. Division names and all source-backed data remain
 * unchanged. The command is a dry run unless --apply is passed.
 */

import dotenv from 'dotenv';
import {
  buildCompositeDivisionTypeId,
  buildDivisionToken,
  normalizeDivisionGender,
} from '../src/lib/divisionTypes';
import { resolveStrictClubSkillId } from '../src/server/clubStructureSync';

dotenv.config({ path: '.env', override: false, quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const shouldApply = process.argv.includes('--apply');

const assertSafeApplyTarget = (): void => {
  if (!shouldApply) return;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is missing.');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || databaseName !== 'mvp_live_clubs') {
    throw new Error(`Apply is restricted to the isolated local mvp_live_clubs database; received ${parsed.hostname}/${databaseName}.`);
  }
};

const main = async () => {
  assertSafeApplyTarget();
  const { prisma } = await import('../src/lib/prisma');
  const divisions = await prisma.divisions.findMany({
    where: {
      scope: 'ORGANIZATION',
      status: 'ACTIVE',
      eventId: null,
    },
    orderBy: [{ sportId: 'asc' }, { organizationId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      organizationId: true,
      name: true,
      sportId: true,
      gender: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
    },
  });

  const repairs = divisions.flatMap((division) => {
    const skillDivisionTypeId = resolveStrictClubSkillId({
      sportId: division.sportId,
      candidate: division.skillDivisionTypeId,
      divisionName: division.name,
    });
    if (skillDivisionTypeId === division.skillDivisionTypeId) return [];
    const ageDivisionTypeId = division.ageDivisionTypeId?.trim().toLowerCase() || '18plus';
    const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
    const gender = normalizeDivisionGender(division.gender) ?? 'C';
    return [{
      ...division,
      gender,
      previousSkillDivisionTypeId: division.skillDivisionTypeId,
      skillDivisionTypeId,
      divisionTypeId,
      key: buildDivisionToken({ gender, ratingType: 'SKILL', divisionTypeId }),
    }];
  });

  for (const repair of repairs) {
    console.log(
      `${repair.organizationId} | ${repair.name}`,
    );
    console.log(`  ${repair.previousSkillDivisionTypeId} -> ${repair.skillDivisionTypeId}`);
  }

  if (shouldApply && repairs.length > 0) {
    await prisma.$transaction(repairs.map((repair) => prisma.divisions.update({
      where: { id: repair.id },
      data: {
        skillDivisionTypeId: repair.skillDivisionTypeId,
        divisionTypeId: repair.divisionTypeId,
        key: repair.key,
        updatedAt: new Date(),
      },
    })));
  }

  console.log(`\n${shouldApply ? 'Applied' : 'Dry-run found'} ${repairs.length} strict skill filter repair(s).`);
  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
