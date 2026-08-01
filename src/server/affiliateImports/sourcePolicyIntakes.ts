import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const policyKeyForUrl = (value: unknown): string | null => {
  const url = stringValue(value);
  if (!url) return null;
  try {
    return affiliateDiscoveryPolicyKeyForUrl(url);
  } catch {
    return null;
  }
};

export const findAffiliateIntakeIdsForPolicyKey = async (
  db: any,
  policyKey: string,
): Promise<string[]> => {
  const intakes = await db.affiliateSourceIntakes.findMany({
    select: { id: true, baseUrl: true },
    orderBy: { id: 'asc' },
  });
  const matching = new Set<string>(intakes
    .filter((intake: any) => policyKeyForUrl(intake.baseUrl) === policyKey)
    .map((intake: any) => intake.id));
  const pages = await db.affiliateSourceIntakePages.findMany({
    select: { intakeId: true, canonicalUrl: true },
    orderBy: { id: 'asc' },
  });
  for (const page of pages) {
    if (policyKeyForUrl(page.canonicalUrl) === policyKey) matching.add(page.intakeId);
  }
  return Array.from(matching).sort();
};
