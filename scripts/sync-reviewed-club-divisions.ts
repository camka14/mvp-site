/**
 * Applies manually reviewed, official-source club divisions to the selected DB.
 *
 * Safe default: dry-run. Pass --apply only after reviewing the printed plan.
 * Reviewed organizations replace previously inferred organization-scope rows;
 * event divisions and events remain intact.
 */

import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import {
  buildCompositeDivisionTypeId,
  buildDivisionToken,
  getGlobalAgeDivisionTypeOptions,
  getSkillDivisionTypeOptionsForSport,
} from '../src/lib/divisionTypes';
import { reviewedClubDivisionCatalog } from './data/reviewed-club-divisions';

dotenv.config({ path: '.env', override: false, quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const shouldApply = process.argv.includes('--apply');
const organizationFilter = process.argv
  .find((argument) => argument.startsWith('--organization='))
  ?.slice('--organization='.length)
  .trim()
  .toLowerCase();

const divisionId = (organizationId: string, identity: string): string => {
  const digest = createHash('sha256').update(`${organizationId}|${identity}`).digest('hex').slice(0, 20);
  return `reviewed_club_division_${digest}`;
};

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const selected = reviewedClubDivisionCatalog.filter((entry) => (
    !organizationFilter || entry.organizationId.toLowerCase().includes(organizationFilter)
  ));
  if (selected.length === 0) throw new Error('No reviewed club division entry matched the requested organization.');

  for (const entry of selected) {
    const organization = await prisma.organizations.findUnique({
      where: { id: entry.organizationId },
      select: { id: true, name: true },
    });
    if (!organization) throw new Error(`Missing organization ${entry.organizationId}.`);
    const existing = await prisma.divisions.findMany({
      where: { organizationId: entry.organizationId, scope: 'ORGANIZATION' },
      select: { id: true, name: true, skillDivisionTypeId: true, ageDivisionTypeId: true, price: true },
    });
    const reviewedKeys = new Set<string>();
    console.log(`\n${organization.name}: replace ${existing.length} inferred row(s) with ${entry.divisions.length} reviewed row(s)`);
    for (const division of entry.divisions) {
      const validSkills = new Set(getSkillDivisionTypeOptionsForSport(division.sportId).map((option) => option.id));
      const validAges = new Set(getGlobalAgeDivisionTypeOptions().map((option) => option.id));
      if (!validSkills.has(division.skillDivisionTypeId)) {
        throw new Error(`${organization.name}: ${division.skillDivisionTypeId} is not a valid ${division.sportId} skill id.`);
      }
      if (!validAges.has(division.ageDivisionTypeId)) {
        throw new Error(`${organization.name}: ${division.ageDivisionTypeId} is not a valid age id.`);
      }
      const reviewedKey = buildDivisionToken({
        gender: division.gender,
        ratingType: 'SKILL',
        divisionTypeId: buildCompositeDivisionTypeId(
          division.skillDivisionTypeId,
          division.ageDivisionTypeId,
        ),
      });
      const reviewedIdentity = `${division.sportId}|${reviewedKey}|${division.name.trim().toLowerCase()}`;
      if (reviewedKeys.has(reviewedIdentity)) {
        throw new Error(`${organization.name}: duplicate reviewed division identity ${reviewedIdentity}.`);
      }
      reviewedKeys.add(reviewedIdentity);
      console.log(`  ${division.name} | ${division.skillDivisionTypeId} | ${division.ageDivisionTypeId} | ${division.priceCents == null ? 'price not specified' : `$${(division.priceCents / 100).toFixed(2)}`}`);
    }
    if (!shouldApply) continue;

    await prisma.$transaction(async (transaction) => {
      const existingIds = existing.map((division) => division.id);
      if (existingIds.length > 0) {
        await transaction.divisions.updateMany({
          where: { sourceDivisionId: { in: existingIds } },
          data: { sourceDivisionId: null },
        });
      }
      await transaction.divisions.deleteMany({
        where: { organizationId: entry.organizationId, scope: 'ORGANIZATION' },
      });
      for (const division of entry.divisions) {
        const identity = [
          division.sportId.toLowerCase(),
          division.gender,
          division.skillDivisionTypeId,
          division.ageDivisionTypeId,
          division.name.toLowerCase(),
        ].join('|');
        const compositeId = buildCompositeDivisionTypeId(
          division.skillDivisionTypeId,
          division.ageDivisionTypeId,
        );
        await transaction.divisions.create({
          data: {
            id: divisionId(entry.organizationId, identity),
            createdAt: new Date(),
            updatedAt: new Date(),
            name: division.name,
            key: buildDivisionToken({
              gender: division.gender,
              ratingType: 'SKILL',
              divisionTypeId: compositeId,
            }),
            kind: 'LEAGUE',
            eventId: null,
            organizationId: entry.organizationId,
            scope: 'ORGANIZATION',
            status: 'ACTIVE',
            sportId: division.sportId,
            price: division.priceCents,
            divisionTypeId: compositeId,
            skillDivisionTypeId: division.skillDivisionTypeId,
            ageDivisionTypeId: division.ageDivisionTypeId,
            ratingType: 'SKILL',
            gender: division.gender,
            description: division.description,
            registrationUrl: division.registrationUrl ?? division.sourceUrl,
            sourceUrl: division.sourceUrl,
            lastVerifiedAt: new Date(`${entry.reviewedAt}T12:00:00.000Z`),
          },
        });
      }
    });
  }
  console.log(`\n${shouldApply ? 'Applied' : 'Dry-run reviewed'} ${selected.length} organization(s).`);
  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
