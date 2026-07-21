import dotenv from 'dotenv';
import { createId } from '../src/lib/id';
import {
  CENSUS_CITY_CAMPAIGN_SOURCE,
  US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
  US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES,
} from '../src/server/affiliateImports/sourceDiscoveryCampaignTemplates';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  try {
    const sports = await db.sports.findMany({
      where: { name: { not: 'Other' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    if (!sports.length) throw new Error('Default sports must be seeded before discovery campaign templates.');
    const campaigns = [];
    for (const template of US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES) {
      const existing = await db.affiliateSourceDiscoveryCampaigns.findUnique({
        where: { name: template.name },
        select: { metadata: true },
      });
      const metadata = {
        ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
        template: true,
        rollout: 'largest-us-cities',
        priorityRank: template.priorityRank,
        anchorCity: template.anchorCity,
        anchorState: template.anchorState,
        anchorPopulation: template.anchorPopulation,
        coveredCities: template.coveredCities,
        censusSource: CENSUS_CITY_CAMPAIGN_SOURCE,
        queryStrategyVersion: US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
      };
      const existingQueryStrategyVersion = Number(
        existing?.metadata && typeof existing.metadata === 'object'
          ? (existing.metadata as Record<string, unknown>).queryStrategyVersion
          : 0,
      );
      const shouldResetQueryCursor = existingQueryStrategyVersion !== US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION;
      campaigns.push(await db.affiliateSourceDiscoveryCampaigns.upsert({
        where: { name: template.name },
        create: {
          id: createId(),
          name: template.name,
          region: template.region,
          location: template.location,
          sportIds: sports.map((sport: any) => sport.id),
          sourceTypeHints: ['CLUB', 'TRYOUT', 'EVENT', 'LEAGUE', 'TOURNAMENT', 'CAMP', 'CLINIC', 'OPEN_PLAY', 'RENTAL', 'DIRECTORY'],
          status: 'PAUSED',
          autoCreateIntakes: true,
          searchIntervalMinutes: 10080,
          maxQueriesPerRun: 10,
          maxResultsPerQuery: 10,
          metadata,
        },
        update: {
          region: template.region,
          location: template.location,
          sportIds: sports.map((sport: any) => sport.id),
          sourceTypeHints: ['CLUB', 'TRYOUT', 'EVENT', 'LEAGUE', 'TOURNAMENT', 'CAMP', 'CLINIC', 'OPEN_PLAY', 'RENTAL', 'DIRECTORY'],
          queryCursor: shouldResetQueryCursor ? 0 : undefined,
          metadata,
        },
      }));
    }
    console.log(JSON.stringify({ campaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, status: campaign.status })) }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:discovery:setup] failed', error);
  process.exitCode = 1;
});
