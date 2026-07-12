import { prisma } from '../src/lib/prisma';
import type { OrganizationFeatureEnum } from '../src/generated/prisma/client';

const write = process.argv.includes('--write');

const main = async () => {
  const [organizations, tagAssignments, teams, facilities, fields, organizationDivisions] = await Promise.all([
    prisma.organizations.findMany({ select: { id: true, name: true, enabledFeatures: true, operatesAthleticFacility: true } }),
    prisma.organizationTagAssignments.findMany({ select: { organizationId: true, tagNameSnapshot: true } }),
    prisma.canonicalTeams.findMany({ where: { organizationId: { not: null } }, select: { organizationId: true } }),
    prisma.facilities.findMany({ select: { organizationId: true } }),
    prisma.fields.findMany({ where: { organizationId: { not: null } }, select: { organizationId: true } }),
    prisma.divisions.findMany({
      where: { scope: 'ORGANIZATION', organizationId: { not: null }, status: { not: 'ARCHIVED' } },
      select: { organizationId: true },
    }),
  ]);

  const clubOrganizationIds = new Set<string>();
  tagAssignments.forEach((assignment) => {
    if (String(assignment.tagNameSnapshot ?? '').trim().toLowerCase() === 'club') {
      clubOrganizationIds.add(assignment.organizationId);
    }
  });
  teams.forEach((team) => { if (team.organizationId) clubOrganizationIds.add(team.organizationId); });
  organizationDivisions.forEach((division) => {
    if (division.organizationId) clubOrganizationIds.add(division.organizationId);
  });

  const facilityOrganizationIds = new Set<string>();
  facilities.forEach((facility) => facilityOrganizationIds.add(facility.organizationId));
  fields.forEach((field) => { if (field.organizationId) facilityOrganizationIds.add(field.organizationId); });

  let changed = 0;
  for (const organization of organizations) {
    const features = new Set<OrganizationFeatureEnum>(organization.enabledFeatures);
    features.add('EVENT_MANAGEMENT');
    if (clubOrganizationIds.has(organization.id)) features.add('CLUB_TEAMS');
    if (organization.operatesAthleticFacility || facilityOrganizationIds.has(organization.id)) {
      features.add('FACILITIES_RENTALS');
    }
    const next = Array.from(features).sort();
    const current = [...organization.enabledFeatures].sort();
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    changed += 1;
    console.log(`${write ? 'Updating' : 'Would update'} ${organization.name} (${organization.id}): ${next.join(', ')}`);
    if (write) {
      await prisma.organizations.update({ where: { id: organization.id }, data: { enabledFeatures: next } });
    }
  }

  console.log(`${write ? 'Updated' : 'Found'} ${changed} organization(s).${write ? '' : ' Re-run with --write to apply.'}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
