import { prisma } from '@/lib/prisma';

type PrismaLike = typeof prisma | Record<string, any>;

export type FacilityOrganizationSeed = {
  id: string;
  name?: string | null;
  location?: string | null;
  address?: string | null;
  coordinates?: unknown | null;
  operatingHours?: unknown | null;
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const defaultFacilityIdForOrganization = (organizationId: string): string => (
  `facility_${organizationId.replace(/[^a-zA-Z0-9_]+/g, '_')}`
);

const getFacilitiesDelegate = (client: PrismaLike = prisma) => {
  const delegate = (client as any).facilities;
  if (!delegate) {
    throw new Error('Facilities delegate is unavailable. Run Prisma generate after applying the facilities migration.');
  }
  return delegate;
};

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: string }).code === 'P2002',
  )
);

export const getFacilityById = async (
  facilityId: string | null | undefined,
  client: PrismaLike = prisma,
) => {
  const id = normalizeText(facilityId);
  if (!id) {
    return null;
  }
  return getFacilitiesDelegate(client).findUnique({ where: { id } });
};

export const getFacilityForOrganization = async (
  facilityId: string | null | undefined,
  organizationId: string | null | undefined,
  client: PrismaLike = prisma,
) => {
  const id = normalizeText(facilityId);
  const orgId = normalizeText(organizationId);
  if (!id || !orgId) {
    return null;
  }
  return getFacilitiesDelegate(client).findFirst({
    where: {
      id,
      organizationId: orgId,
    },
  });
};

export const ensureDefaultFacilityForOrganization = async (
  organization: FacilityOrganizationSeed | null | undefined,
  client: PrismaLike = prisma,
) => {
  const orgId = normalizeText(organization?.id);
  if (!orgId) {
    return null;
  }

  const facilities = getFacilitiesDelegate(client);
  const existingDefault = await facilities.findFirst({
    where: {
      organizationId: orgId,
      isDefault: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
  });
  if (existingDefault) {
    return existingDefault;
  }

  const id = defaultFacilityIdForOrganization(orgId);
  const existingById = await facilities.findUnique({ where: { id } });
  if (existingById) {
    return existingById;
  }

  const now = new Date();
  const defaultLocation = normalizeText(organization?.location)
    ?? normalizeText(organization?.address)
    ?? normalizeText(organization?.name)
    ?? 'Main Facility';
  try {
    return await facilities.create({
      data: {
        id,
        createdAt: now,
        updatedAt: now,
        organizationId: orgId,
        name: normalizeText(organization?.name) ?? 'Main Facility',
        location: defaultLocation,
        address: normalizeText(organization?.address),
        coordinates: organization?.coordinates ?? null,
        operatingHours: organization?.operatingHours ?? null,
        timeZone: 'UTC',
        status: 'ACTIVE',
        isDefault: true,
        sortOrder: 0,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    return facilities.findUnique({ where: { id } });
  }
};
