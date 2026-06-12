import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { QUICKBOOKS_PROVIDER } from './quickBooksConnection';

type PrismaLike = any;

export type FinanceCategoryAccountingEntryType = 'REVENUE' | 'EXPENSE' | 'LIABILITY' | 'ASSET';

export type FinanceCategoryAccountingMappingInput = {
  category: string;
  entryType: FinanceCategoryAccountingEntryType;
  accountExternalId?: string | null;
  accountName?: string | null;
  notes?: string | null;
};

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const normalizeText = (value?: string | null, maxLength = 160): string | null => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
};

const normalizeCategory = (value: string): { category: string; categoryKey: string } | null => {
  const category = normalizeText(value, 100);
  if (!category) {
    return null;
  }
  return {
    category,
    categoryKey: category.toLowerCase(),
  };
};

export const listOrganizationFinanceCategoryAccountingMappings = async (
  organizationId: string,
  client: PrismaLike = prisma,
  provider = QUICKBOOKS_PROVIDER,
) => (
  client.organizationFinanceCategoryAccountingMappings.findMany({
    where: {
      organizationId,
      provider,
      isActive: true,
    },
    orderBy: [{ category: 'asc' }, { entryType: 'asc' }],
  })
);

export const saveQuickBooksFinanceCategoryAccountingMappings = async ({
  organizationId,
  actingUserId,
  mappings,
  client = prisma,
}: {
  organizationId: string;
  actingUserId: string;
  mappings: FinanceCategoryAccountingMappingInput[];
  client?: PrismaLike;
}) => {
  const normalizedMappings = mappings
    .map((mapping) => {
      const normalizedCategory = normalizeCategory(mapping.category);
      if (!normalizedCategory) {
        return null;
      }
      return {
        ...normalizedCategory,
        entryType: mapping.entryType,
        accountExternalId: normalizeText(mapping.accountExternalId, 80),
        accountName: normalizeText(mapping.accountName, 160),
        notes: normalizeText(mapping.notes, 500),
      };
    })
    .filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping));

  for (const mapping of normalizedMappings) {
    const where = {
      organizationId_provider_categoryKey_entryType: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
        categoryKey: mapping.categoryKey,
        entryType: mapping.entryType,
      },
    };
    if (!mapping.accountExternalId && !mapping.accountName) {
      const existing = await client.organizationFinanceCategoryAccountingMappings.findUnique({ where });
      if (existing) {
        await client.organizationFinanceCategoryAccountingMappings.update({
          where,
          data: {
            category: mapping.category,
            accountExternalId: null,
            accountName: null,
            notes: mapping.notes,
            isActive: false,
            updatedBy: actingUserId,
          },
        });
      }
      continue;
    }

    await client.organizationFinanceCategoryAccountingMappings.upsert({
      where,
      create: {
        id: createId('finance_category_accounting_mapping'),
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
        category: mapping.category,
        categoryKey: mapping.categoryKey,
        entryType: mapping.entryType,
        accountExternalId: mapping.accountExternalId,
        accountName: mapping.accountName,
        notes: mapping.notes,
        isActive: true,
        createdBy: actingUserId,
        updatedBy: actingUserId,
      },
      update: {
        category: mapping.category,
        accountExternalId: mapping.accountExternalId,
        accountName: mapping.accountName,
        notes: mapping.notes,
        isActive: true,
        updatedBy: actingUserId,
      },
    });
  }

  return listOrganizationFinanceCategoryAccountingMappings(organizationId, client, QUICKBOOKS_PROVIDER);
};
