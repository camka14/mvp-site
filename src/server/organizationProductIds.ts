import { prisma } from '@/lib/prisma';

export type OrganizationProductsClient = {
  products: {
    findMany: (args: {
      where: { organizationId: { in: string[] } };
      select: { id: true; organizationId: true };
    }) => Promise<Array<{ id: string; organizationId: string }>>;
  };
};

const normalizeIds = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? '')
        .filter(Boolean),
    ),
  ).sort()
);

export const getProductIdsByOrganizationIds = async (
  organizationIds: string[],
  client: OrganizationProductsClient = prisma,
): Promise<Map<string, string[]>> => {
  const normalizedOrganizationIds = normalizeIds(organizationIds);
  const productIdsByOrganizationId = new Map<string, string[]>(
    normalizedOrganizationIds.map((organizationId) => [organizationId, []]),
  );
  if (normalizedOrganizationIds.length === 0) {
    return productIdsByOrganizationId;
  }

  const rows = await client.products.findMany({
    where: { organizationId: { in: normalizedOrganizationIds } },
    select: { id: true, organizationId: true },
  });
  for (const row of rows) {
    const organizationId = row.organizationId?.trim();
    const productId = row.id?.trim();
    if (!organizationId || !productId || !productIdsByOrganizationId.has(organizationId)) {
      continue;
    }
    productIdsByOrganizationId.get(organizationId)?.push(productId);
  }

  for (const [organizationId, productIds] of productIdsByOrganizationId) {
    productIdsByOrganizationId.set(organizationId, normalizeIds(productIds));
  }
  return productIdsByOrganizationId;
};

export const withDerivedOrganizationProductIds = async <T extends { id: string }>(
  organizations: T[],
  client: OrganizationProductsClient = prisma,
): Promise<Array<T & { productIds: string[] }>> => {
  const productIdsByOrganizationId = await getProductIdsByOrganizationIds(
    organizations.map((organization) => organization.id),
    client,
  );
  return organizations.map((organization) => ({
    ...organization,
    productIds: productIdsByOrganizationId.get(organization.id.trim()) ?? [],
  }));
};
