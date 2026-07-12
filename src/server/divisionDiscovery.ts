type DivisionDiscoveryWhereInput = {
  scope: 'EVENT' | 'ORGANIZATION';
  sports?: string[];
  genders?: string[];
  skillDivisionTypeIds?: string[];
  ageDivisionTypeIds?: string[];
  divisionIds?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
};

const unique = (values: string[] | undefined): string[] => Array.from(new Set(
  (values ?? []).map((value) => value.trim()).filter(Boolean),
));

export const buildDivisionDiscoveryWhere = (input: DivisionDiscoveryWhereInput): Record<string, unknown> | null => {
  const sports = unique(input.sports);
  const genders = unique(input.genders);
  const skillDivisionTypeIds = unique(input.skillDivisionTypeIds).map((value) => value.toLowerCase());
  const ageDivisionTypeIds = unique(input.ageDivisionTypeIds).map((value) => value.toLowerCase());
  const divisionIds = unique(input.divisionIds).map((value) => value.toLowerCase());
  const hasPriceMin = typeof input.priceMin === 'number' && Number.isFinite(input.priceMin);
  const hasPriceMax = typeof input.priceMax === 'number' && Number.isFinite(input.priceMax);
  if (
    sports.length === 0
    && genders.length === 0
    && skillDivisionTypeIds.length === 0
    && ageDivisionTypeIds.length === 0
    && divisionIds.length === 0
    && !hasPriceMin
    && !hasPriceMax
  ) {
    return null;
  }

  return {
    scope: input.scope,
    status: 'ACTIVE',
    ...(input.scope === 'EVENT'
      ? { eventId: { not: null }, OR: [{ kind: 'LEAGUE' }, { kind: null }] }
      : { organizationId: { not: null } }),
    ...(sports.length ? { sportId: { in: sports } } : {}),
    ...(genders.length ? { gender: { in: genders } } : {}),
    ...(skillDivisionTypeIds.length ? { skillDivisionTypeId: { in: skillDivisionTypeIds } } : {}),
    ...(ageDivisionTypeIds.length ? { ageDivisionTypeId: { in: ageDivisionTypeIds } } : {}),
    ...(divisionIds.length ? { AND: [{ OR: [{ id: { in: divisionIds } }, { key: { in: divisionIds } }] }] } : {}),
    ...(hasPriceMin || hasPriceMax ? {
      price: {
        ...(hasPriceMin ? { gte: Math.max(0, Math.round(input.priceMin as number)) } : {}),
        ...(hasPriceMax ? { lte: Math.max(0, Math.round(input.priceMax as number)) } : {}),
      },
    } : {}),
  };
};
