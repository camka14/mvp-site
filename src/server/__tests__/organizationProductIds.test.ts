/** @jest-environment node */

import {
  getProductIdsByOrganizationIds,
  withDerivedOrganizationProductIds,
} from '@/server/organizationProductIds';

describe('organization product compatibility projection', () => {
  it('batches, deduplicates, and sorts product ids for every requested organization', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'product_b', organizationId: 'org_1' },
      { id: 'product_a', organizationId: 'org_1' },
      { id: 'product_a', organizationId: 'org_1' },
      { id: 'product_z', organizationId: 'org_2' },
    ]);

    const result = await getProductIdsByOrganizationIds(
      [' org_2 ', 'org_1', 'org_3', 'org_1'],
      { products: { findMany } },
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: { in: ['org_1', 'org_2', 'org_3'] } },
      select: { id: true, organizationId: true },
    });
    expect(Object.fromEntries(result)).toEqual({
      org_1: ['product_a', 'product_b'],
      org_2: ['product_z'],
      org_3: [],
    });
  });

  it('overwrites contradictory stored arrays with the normalized product rows', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'product_live', organizationId: 'org_1' },
    ]);

    const [organization] = await withDerivedOrganizationProductIds([
      { id: 'org_1', name: 'Club', productIds: ['product_stale'] },
    ], { products: { findMany } });

    expect(organization).toEqual({
      id: 'org_1',
      name: 'Club',
      productIds: ['product_live'],
    });
  });

  it('does not query for an empty organization list', async () => {
    const findMany = jest.fn();

    await expect(withDerivedOrganizationProductIds([], { products: { findMany } })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
