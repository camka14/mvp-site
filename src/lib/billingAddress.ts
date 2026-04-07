import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeRequiredText = (value: unknown): string | null => {
  const normalized = normalizeOptionalText(value);
  return normalized && normalized.length > 0 ? normalized : null;
};

const normalizeCountryCode = (value: unknown): string | null => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }
  return normalized.toUpperCase();
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

export const billingAddressSchema = z.object({
  line1: z.string().trim().min(1, 'Billing address line 1 is required.'),
  line2: z.string().trim().optional().nullable().transform((value) => {
    if (!value) return null;
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }),
  city: z.string().trim().min(1, 'Billing city is required.'),
  state: z.string().trim().min(1, 'Billing state is required.'),
  postalCode: z.string().trim().min(1, 'Billing postal code is required.'),
  countryCode: z.string().trim().min(2).max(2).transform((value) => value.toUpperCase()),
});

export type BillingAddress = z.infer<typeof billingAddressSchema>;

export type BillingAddressDraft = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
};

export type SensitiveUserBillingAddressFields = {
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountryCode?: string | null;
};

export const billingAddressSelect = {
  billingAddressLine1: true,
  billingAddressLine2: true,
  billingCity: true,
  billingState: true,
  billingPostalCode: true,
  billingCountryCode: true,
} as const;

export const billingAddressDraftFromSensitiveUserData = (
  row: SensitiveUserBillingAddressFields | null | undefined,
): BillingAddressDraft | null => {
  if (!row) return null;
  return {
    line1: normalizeOptionalText(row.billingAddressLine1),
    line2: normalizeOptionalText(row.billingAddressLine2),
    city: normalizeOptionalText(row.billingCity),
    state: normalizeOptionalText(row.billingState),
    postalCode: normalizeOptionalText(row.billingPostalCode),
    countryCode: normalizeCountryCode(row.billingCountryCode),
  };
};

export const billingAddressFromSensitiveUserData = (
  row: SensitiveUserBillingAddressFields | null | undefined,
): BillingAddress | null => {
  const draft = billingAddressDraftFromSensitiveUserData(row);
  if (!draft) return null;
  if (!draft.line1 || !draft.city || !draft.state || !draft.postalCode || !draft.countryCode) {
    return null;
  }
  return {
    line1: draft.line1,
    line2: draft.line2,
    city: draft.city,
    state: draft.state,
    postalCode: draft.postalCode,
    countryCode: draft.countryCode,
  };
};

export const billingAddressToSensitiveUserData = (
  address: BillingAddress,
): SensitiveUserBillingAddressFields => ({
  billingAddressLine1: address.line1,
  billingAddressLine2: address.line2 ?? null,
  billingCity: address.city,
  billingState: address.state,
  billingPostalCode: address.postalCode,
  billingCountryCode: address.countryCode,
});

const loadUserEmail = async (userId: string): Promise<string | null> => {
  const [sensitive, authUser] = await Promise.all([
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);

  return normalizeEmail(sensitive?.email) ?? normalizeEmail(authUser?.email);
};

export const loadUserBillingProfile = async (userId: string): Promise<{
  billingAddress: BillingAddress | null;
  draft: BillingAddressDraft | null;
  email: string | null;
}> => {
  const row = await prisma.sensitiveUserData.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      email: true,
      ...billingAddressSelect,
    },
  });

  return {
    billingAddress: billingAddressFromSensitiveUserData(row),
    draft: billingAddressDraftFromSensitiveUserData(row),
    email: normalizeEmail(row?.email) ?? await loadUserEmail(userId),
  };
};

export const upsertUserBillingAddress = async (
  userId: string,
  address: BillingAddress,
): Promise<{ billingAddress: BillingAddress; email: string | null }> => {
  const existing = await prisma.sensitiveUserData.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      email: true,
    },
  });

  const email = normalizeEmail(existing?.email) ?? await loadUserEmail(userId);
  if (!email) {
    throw new Error('User email is required before saving billing address.');
  }

  const data = {
    ...billingAddressToSensitiveUserData(address),
    email,
    userId,
    updatedAt: new Date(),
  };

  if (existing?.id) {
    await prisma.sensitiveUserData.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.sensitiveUserData.create({
      data: {
        id: userId,
        createdAt: new Date(),
        ...data,
      },
    });
  }

  return {
    billingAddress: address,
    email,
  };
};

export const resolveBillingAddressInput = (value: unknown): BillingAddress | null => {
  const parsed = billingAddressSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const validateUsBillingAddress = (address: BillingAddress): BillingAddress => {
  const normalizedCountry = address.countryCode.toUpperCase();
  if (normalizedCountry !== 'US') {
    throw new Error('Only US billing addresses are supported right now.');
  }

  const line1 = normalizeRequiredText(address.line1);
  const city = normalizeRequiredText(address.city);
  const state = normalizeRequiredText(address.state);
  const postalCode = normalizeRequiredText(address.postalCode);
  if (!line1 || !city || !state || !postalCode) {
    throw new Error('Billing address line 1, city, state, and postal code are required.');
  }

  return {
    line1,
    line2: normalizeOptionalText(address.line2),
    city,
    state,
    postalCode,
    countryCode: normalizedCountry,
  };
};
