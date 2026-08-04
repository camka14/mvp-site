/**
 * Repairs explicitly selected discovered direct-club candidates.
 *
 * The command relinks each candidate to its canonical source organization and
 * fills a missing organization locality from source-organization or intake
 * evidence. It resolves missing canonical organization coordinates through
 * the normal server-side Google resolver. It does not publish candidates or
 * delete generated duplicate organizations.
 *
 * The command is dry-run by default. Apply mode requires --live and an exact
 * --expected-count.
 */

import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import {
  buildAffiliatePlaceLocationQueries,
  normalizeAffiliateCoordinates,
} from '../src/server/affiliateImports/locationResolution';
import { resolveAddressToPlace } from '../src/server/geocoding';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const values = (name: string): string[] => {
  const prefix = `--${name}=`;
  return process.argv
    .filter((argument) => argument.startsWith(prefix))
    .map((argument) => argument.slice(prefix.length).trim())
    .filter(Boolean);
};
const candidateIds = Array.from(new Set(values('candidate')));
const expectedText = values('expected-count')[0] ?? null;
const expectedCount = expectedText === null ? null : Number.parseInt(expectedText, 10);
const repairedBy = values('repaired-by')[0] ?? 'operator';

type OfficialLocalityRepair = {
  city: string;
  address: string | null;
  coordinateQuery: string;
  evidenceUrl: string;
};

const officialLocalityRepairs: Record<string, OfficialLocalityRepair> = {
  'ncs-cafarelli-arizona-baseball-tournaments': {
    city: 'Peoria, AZ',
    address: '9367 W Sands Dr, Peoria, AZ 85383',
    coordinateQuery: '9367 W Sands Dr, Peoria, AZ 85383',
    evidenceUrl: 'https://www.ncscafarelli.com/contact-us.html',
  },
  'new-york-new-york-metropolitan-area-amateur-hockey-tournaments-in-new-york-nickelcityhockey-com': {
    city: 'Buffalo, NY',
    address: null,
    coordinateQuery: 'Buffalo, NY',
    evidenceUrl: 'https://www.nickelcityhockey.com/canada-connection',
  },
  'ncs-texas-baseball-events': {
    city: 'Arlington, TX',
    address: '2011 E Lamar Blvd, Suite 120, Arlington, TX 76006',
    coordinateQuery: '2011 E Lamar Blvd, Suite 120, Arlington, TX 76006',
    evidenceUrl: 'https://playncs.com/baseball/Events/Details/12641/coastal-bend-winter-diamond-showdown',
  },
  'new-york-new-york-metropolitan-area-tournaments-playnypc-com': {
    city: 'New City, NY',
    address: '182 N Main St, New City, NY 10956',
    coordinateQuery: '182 N Main St, New City, NY 10956',
    evidenceUrl: 'https://www.playnypc.com/',
  },
};

if (!useLive) throw new Error('Discovered club candidate repair requires --live.');
if (!candidateIds.length) throw new Error('At least one --candidate is required.');
if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
  throw new Error('--expected-count must be a non-negative integer.');
}
if (apply && expectedCount === null) {
  throw new Error('--apply requires --expected-count.');
}

configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const normalizedIntakeLocality = (region: unknown): string | null => {
  const value = stringValue(region);
  if (!value) return null;
  const exact: Record<string, string> = {
    'New York, New York metropolitan area': 'New York, NY',
    'Phoenix metropolitan area, Arizona': 'Phoenix, AZ',
    'Houston, Texas metropolitan area': 'Houston, TX',
    'San Diego, California metropolitan area': 'San Diego, CA',
    'Washington, DC metropolitan area': 'Washington, DC',
  };
  return exact[value] ?? value;
};

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  try {
    const candidates = await db.affiliateImportCandidates.findMany({
      where: { id: { in: candidateIds } },
      orderBy: { id: 'asc' },
    });
    const sources = candidates.length
      ? await db.affiliateScrapeSources.findMany({
        where: { id: { in: Array.from(new Set(candidates.map((row: any) => row.sourceId))) } },
      })
      : [];
    const sourceById = new Map(sources.map((row: any) => [row.id, row]));
    const sourceOrganizationIds = Array.from(new Set(
      sources.map((row: any) => stringValue(row.organizationId)).filter(Boolean),
    ));
    const sourceOrganizations = sourceOrganizationIds.length
      ? await db.organizations.findMany({ where: { id: { in: sourceOrganizationIds } } })
      : [];
    const sourceOrganizationById = new Map(sourceOrganizations.map((row: any) => [row.id, row]));
    const sourceEvidence = sources.map((source: any) => recordValue(recordValue(source.metadata).sourceEvidence));
    const intakeIds = Array.from(new Set(
      sourceEvidence
        .map((evidence: Record<string, unknown>) => stringValue(evidence.intakeId))
        .filter(Boolean),
    ));
    const intakeSourceKeys = Array.from(new Set(
      sourceEvidence
        .map((evidence: Record<string, unknown>) => stringValue(evidence.intakeSourceKey))
        .filter(Boolean),
    ));
    const intakeFilters = [
      ...(intakeIds.length ? [{ id: { in: intakeIds } }] : []),
      ...(intakeSourceKeys.length ? [{ sourceKey: { in: intakeSourceKeys } }] : []),
    ];
    const intakes = intakeFilters.length
      ? await db.affiliateSourceIntakes.findMany({ where: { OR: intakeFilters } })
      : [];
    const intakeById = new Map(intakes.map((row: any) => [row.id, row]));
    const intakeBySourceKey = new Map(intakes.map((row: any) => [row.sourceKey, row]));
    const candidateById = new Map(candidates.map((row: any) => [row.id, row]));
    const excluded: Array<{ candidateId: string; reason: string }> = [];
    const plans: any[] = [];

    for (const candidateId of candidateIds) {
      const candidate = candidateById.get(candidateId) as any;
      if (!candidate) {
        excluded.push({ candidateId, reason: 'candidate-not-found' });
        continue;
      }
      const source = sourceById.get(candidate.sourceId) as any;
      const sourceOrganizationId = stringValue(source?.organizationId);
      const sourceOrganization = sourceOrganizationId
        ? sourceOrganizationById.get(sourceOrganizationId) as any
        : null;
      if (candidate.status !== 'DISCOVERED' || String(candidate.listingKind).toUpperCase() !== 'CLUB') {
        excluded.push({ candidateId, reason: 'candidate-is-not-a-discovered-club' });
        continue;
      }
      if (!source || !sourceOrganization) {
        excluded.push({ candidateId, reason: 'canonical-source-organization-is-missing' });
        continue;
      }
      const priorPublicationRepair = recordValue(recordValue(candidate.rawPayload).publicationRepair);
      if (
        priorPublicationRepair.schemaVersion === 1
        && stringValue(priorPublicationRepair.canonicalOrganizationId) === sourceOrganization.id
      ) {
        excluded.push({ candidateId, reason: 'candidate-repair-already-applied' });
        continue;
      }
      if (
        !stringValue(sourceOrganization.name)
        || !stringValue(sourceOrganization.description)
        || !stringValue(sourceOrganization.website)
        || !stringValue(sourceOrganization.logoId)
      ) {
        excluded.push({ candidateId, reason: 'canonical-source-organization-is-incomplete' });
        continue;
      }
      const evidence = recordValue(recordValue(source.metadata).sourceEvidence);
      const intake: any = (stringValue(evidence.intakeId)
        ? intakeById.get(stringValue(evidence.intakeId)!)
        : null)
        ?? (stringValue(evidence.intakeSourceKey)
          ? intakeBySourceKey.get(stringValue(evidence.intakeSourceKey)!)
          : null);
      const officialLocalityRepair = officialLocalityRepairs[source.sourceKey] ?? null;
      const city = officialLocalityRepair?.city
        ?? stringValue(candidate.city)
        ?? stringValue(sourceOrganization.location)
        ?? normalizedIntakeLocality(intake?.region);
      const address = officialLocalityRepair?.address
        ?? stringValue(candidate.address)
        ?? stringValue(sourceOrganization.address);
      if (!city && !address) {
        excluded.push({ candidateId, reason: 'no-source-backed-locality' });
        continue;
      }
      const location = stringValue(sourceOrganization.location) ?? city ?? address;
      const queries = buildAffiliatePlaceLocationQueries({
        name: stringValue(sourceOrganization.name),
        location,
        address,
        city,
      });
      if (officialLocalityRepair?.coordinateQuery) {
        queries.unshift(officialLocalityRepair.coordinateQuery);
      }
      let coordinates = officialLocalityRepair
        ? null
        : normalizeAffiliateCoordinates(sourceOrganization.coordinates);
      let successfulQuery: string | null = coordinates ? 'existing-source-organization-coordinates' : null;
      let resolution: unknown = null;
      if (!coordinates) {
        for (const query of queries) {
          const candidateResolution = await resolveAddressToPlace(query);
          resolution = candidateResolution;
          coordinates = normalizeAffiliateCoordinates(candidateResolution.coordinates);
          if (coordinates) {
            successfulQuery = query;
            break;
          }
        }
      }
      if (!coordinates) {
        excluded.push({ candidateId, reason: 'source-backed-locality-did-not-resolve' });
        continue;
      }
      plans.push({
        candidate,
        source,
        sourceOrganization,
        intake,
        city,
        address,
        location,
        coordinates,
        queries,
        successfulQuery,
        resolution,
        officialLocalityRepair,
      });
    }

    const preview = {
      schemaVersion: 1,
      environment: 'live',
      apply,
      requested: candidateIds.length,
      eligible: plans.length,
      expectedCount,
      excluded,
      candidates: plans.map((plan) => ({
        candidateId: plan.candidate.id,
        title: plan.candidate.title,
        sourceKey: plan.source.sourceKey,
        priorOrganizationId: plan.candidate.publishedOrganizationId,
        canonicalOrganizationId: plan.sourceOrganization.id,
        priorCity: plan.candidate.city,
        repairedCity: plan.city,
        priorAddress: plan.candidate.address,
        repairedAddress: plan.address,
        priorCoordinates: plan.sourceOrganization.coordinates,
        repairedCoordinates: plan.coordinates,
        successfulQuery: plan.successfulQuery,
        resolvedPlaceName: recordValue(plan.resolution).displayName ?? null,
        resolvedFormattedAddress: recordValue(plan.resolution).formattedAddress ?? null,
        localityEvidenceUrl: plan.officialLocalityRepair?.evidenceUrl ?? null,
      })),
    };
    if (expectedCount !== null && plans.length !== expectedCount) {
      throw new Error(
        `Eligible discovered club repair count ${plans.length} did not match expected ${expectedCount}.`,
      );
    }
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const repaired: string[] = [];
    for (const plan of plans) {
      await db.$transaction(async (transaction: any) => {
        const currentCandidate = await transaction.affiliateImportCandidates.findUnique({
          where: { id: plan.candidate.id },
        });
        const currentSource = await transaction.affiliateScrapeSources.findUnique({
          where: { id: plan.source.id },
        });
        const currentOrganization = await transaction.organizations.findUnique({
          where: { id: plan.sourceOrganization.id },
        });
        if (
          currentCandidate?.status !== 'DISCOVERED'
          || String(currentCandidate.listingKind).toUpperCase() !== 'CLUB'
          || currentSource?.organizationId !== plan.sourceOrganization.id
          || !currentOrganization
        ) {
          throw new Error(`Candidate ${plan.candidate.id} changed before repair.`);
        }
        const repairedAt = new Date();
        await transaction.affiliateImportCandidates.update({
          where: { id: currentCandidate.id },
          data: {
            publishedOrganizationId: plan.sourceOrganization.id,
            city: stringValue(currentCandidate.city) ?? plan.city,
            address: stringValue(currentCandidate.address) ?? plan.address,
            rawPayload: {
              ...recordValue(currentCandidate.rawPayload),
              publicationRepair: {
                schemaVersion: 1,
                repairedAt: repairedAt.toISOString(),
                repairedBy,
                reasonCodes: [
                  'CLUB_CANONICAL_ORGANIZATION_INVALID',
                  'ORGANIZATION_LOCATION_INVALID',
                ],
                priorOrganizationId: currentCandidate.publishedOrganizationId,
                canonicalOrganizationId: plan.sourceOrganization.id,
                localitySource: plan.officialLocalityRepair
                  ? 'MANUAL_OFFICIAL_SOURCE_REVIEW'
                  : stringValue(plan.sourceOrganization.location)
                    ? 'SOURCE_ORGANIZATION'
                    : 'SOURCE_INTAKE_REGION',
                localityEvidenceUrl: plan.officialLocalityRepair?.evidenceUrl ?? null,
                successfulCoordinateQuery: plan.successfulQuery,
              },
            },
          },
        });
        await transaction.organizations.update({
          where: { id: currentOrganization.id },
          data: {
            location: plan.officialLocalityRepair?.city
              ?? stringValue(currentOrganization.location)
              ?? plan.city
              ?? plan.location,
            address: plan.officialLocalityRepair?.address
              ?? stringValue(currentOrganization.address)
              ?? plan.address,
            coordinates: (plan.officialLocalityRepair
              ? null
              : normalizeAffiliateCoordinates(currentOrganization.coordinates))
              ?? plan.coordinates,
            updatedAt: repairedAt,
          },
        });
        repaired.push(currentCandidate.id);
      });
    }

    console.log(JSON.stringify({ ...preview, repaired }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
