import { prisma } from '@/lib/prisma';
import {
  buildCompositeDivisionTypeId,
  buildDivisionToken,
  deriveDivisionTypeDisplayName,
  getGlobalAgeDivisionTypeOptions,
  normalizeDivisionGender,
  normalizeDivisionTypeParameterOptions,
  type DivisionGender,
} from '@/lib/divisionTypes';

export type OrganizationDivisionInput = {
  name?: string;
  sportId: string;
  gender: string;
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  price: number;
  maxParticipants?: number | null;
  description?: string | null;
  registrationUrl?: string | null;
  sourceUrl?: string | null;
  lastVerifiedAt?: string | Date | null;
  status?: 'ACTIVE' | 'INACTIVE';
};

export class OrganizationDivisionValidationError extends Error {}

const normalizeOptionalUrl = (value: unknown, label: string): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new OrganizationDivisionValidationError(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OrganizationDivisionValidationError(`${label} must use http or https.`);
  }
  return parsed.toString();
};

const normalizeRequiredToken = (value: unknown, label: string): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) throw new OrganizationDivisionValidationError(`${label} is required.`);
  return normalized;
};

export const normalizeOrganizationDivisionInput = async (
  input: OrganizationDivisionInput,
  client: typeof prisma | any = prisma,
) => {
  const sportId = typeof input.sportId === 'string' ? input.sportId.trim() : '';
  const sport = sportId
    ? await client.sports.findUnique({ where: { id: sportId } })
    : null;
  if (!sport) throw new OrganizationDivisionValidationError('Select a valid sport.');

  const gender = normalizeDivisionGender(input.gender);
  if (!gender) throw new OrganizationDivisionValidationError('Select a valid division gender.');

  const skillDivisionTypeId = normalizeRequiredToken(input.skillDivisionTypeId, 'Skill division');
  const ageDivisionTypeId = normalizeRequiredToken(input.ageDivisionTypeId, 'Age division');
  const validSkillIds = new Set(
    normalizeDivisionTypeParameterOptions(sport.skillDivisionTypes).map((option) => option.id.toLowerCase()),
  );
  if (!validSkillIds.has(skillDivisionTypeId)) {
    throw new OrganizationDivisionValidationError('Select a skill division supported by this sport.');
  }
  const validAgeIds = new Set(getGlobalAgeDivisionTypeOptions().map((option) => option.id.toLowerCase()));
  if (!validAgeIds.has(ageDivisionTypeId)) {
    throw new OrganizationDivisionValidationError('Select a valid age division.');
  }

  const price = Number(input.price);
  if (!Number.isInteger(price) || price < 0) {
    throw new OrganizationDivisionValidationError('Division price must be a non-negative amount in cents.');
  }
  const maxParticipants = input.maxParticipants == null ? null : Number(input.maxParticipants);
  if (maxParticipants !== null && (!Number.isInteger(maxParticipants) || maxParticipants < 1)) {
    throw new OrganizationDivisionValidationError('Division capacity must be at least 1 when specified.');
  }

  const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
  const key = buildDivisionToken({ gender, ratingType: 'SKILL', divisionTypeId });
  const defaultName = deriveDivisionTypeDisplayName({
    sportInput: sport.id,
    gender,
    ratingType: 'SKILL',
    divisionTypeId,
  });
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : defaultName;
  const lastVerifiedAt = input.lastVerifiedAt == null
    ? null
    : new Date(input.lastVerifiedAt);
  if (lastVerifiedAt && Number.isNaN(lastVerifiedAt.getTime())) {
    throw new OrganizationDivisionValidationError('Last verified date is invalid.');
  }

  return {
    name,
    key,
    sportId: sport.id,
    gender: gender as DivisionGender,
    ratingType: 'SKILL' as const,
    divisionTypeId,
    skillDivisionTypeId,
    ageDivisionTypeId,
    price,
    maxParticipants,
    description: typeof input.description === 'string' ? input.description.trim() || null : null,
    registrationUrl: normalizeOptionalUrl(input.registrationUrl, 'Registration URL'),
    sourceUrl: normalizeOptionalUrl(input.sourceUrl, 'Source URL'),
    lastVerifiedAt,
    status: input.status === 'INACTIVE' ? 'INACTIVE' as const : 'ACTIVE' as const,
  };
};

export const organizationDivisionView = (row: Record<string, any>) => ({
  id: row.id,
  name: row.name,
  key: row.key,
  scope: row.scope,
  status: row.status,
  organizationId: row.organizationId,
  eventId: row.eventId,
  sourceDivisionId: row.sourceDivisionId,
  sportId: row.sportId,
  gender: row.gender,
  ratingType: row.ratingType,
  divisionTypeId: row.divisionTypeId,
  skillDivisionTypeId: row.skillDivisionTypeId,
  ageDivisionTypeId: row.ageDivisionTypeId,
  divisionTypeName: deriveDivisionTypeDisplayName({
    sportInput: row.sportId,
    gender: normalizeDivisionGender(row.gender) ?? 'C',
    ratingType: 'SKILL',
    divisionTypeId: row.divisionTypeId ?? buildCompositeDivisionTypeId(
      row.skillDivisionTypeId ?? 'open',
      row.ageDivisionTypeId ?? '18plus',
    ),
  }),
  price: row.price,
  maxParticipants: row.maxParticipants,
  description: row.description,
  registrationUrl: row.registrationUrl,
  sourceUrl: row.sourceUrl,
  lastVerifiedAt: row.lastVerifiedAt instanceof Date ? row.lastVerifiedAt.toISOString() : row.lastVerifiedAt,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
});
