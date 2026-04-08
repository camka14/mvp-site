import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import type { Product, ProductType } from '@/types';
import {
  defaultProductTypeForPeriod,
  deriveProductTypeFromTaxCategory,
  deriveTaxCategoryFromProductType,
  isStoredTaxCategoryAllowedForPeriod,
  isProductTypeAllowedForPeriod,
} from '@/lib/productTypes';
import {
  defaultProductTaxCategoryForPeriod,
  normalizeProductPeriod,
  normalizeProductTaxCategory,
  syncPlatformProductCatalog,
} from '@/lib/stripeProducts';

export const dynamic = 'force-dynamic';

const PRODUCT_MUTABLE_FIELDS = new Set<string>([
  'name',
  'description',
  'priceCents',
  'period',
  'productType',
  'taxCategory',
  'isActive',
  'stripeProductId',
  'stripePriceId',
  'organizationId',
  'createdBy',
]);
const PRODUCT_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const PRODUCT_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'organizationId',
  'createdBy',
]);
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'product',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const payload = parsed.payload;
  const unknownPayloadKeys = findUnknownKeys(payload, [
    ...PRODUCT_MUTABLE_FIELDS,
    ...PRODUCT_HARD_IMMUTABLE_FIELDS,
    ...PRODUCT_ADMIN_OVERRIDABLE_FIELDS,
  ]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json(
      { error: 'Unknown product patch fields.', unknownKeys: unknownPayloadKeys },
      { status: 400 },
    );
  }

  const hardImmutableKeys = findPresentKeys(payload, PRODUCT_HARD_IMMUTABLE_FIELDS);
  if (hardImmutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable product fields cannot be updated.', fields: hardImmutableKeys },
      { status: 403 },
    );
  }
  const adminOverrideKeys = findPresentKeys(payload, PRODUCT_ADMIN_OVERRIDABLE_FIELDS);
  if (adminOverrideKeys.length && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Immutable product fields cannot be updated.', fields: adminOverrideKeys },
      { status: 403 },
    );
  }

  const targetOrganizationIdRaw = (() => {
    const nextId = payload.organizationId;
    if (typeof nextId === 'string' && nextId.trim().length > 0) {
      return nextId.trim();
    }
    return existing.organizationId;
  })();
  const org = await prisma.organizations.findUnique({ where: { id: targetOrganizationIdRaw } });
  if (!session.isAdmin && !(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  for (const key of PRODUCT_MUTABLE_FIELDS) {
    if (key !== 'productType' && Object.prototype.hasOwnProperty.call(payload, key)) {
      updateData[key] = payload[key];
    }
  }
  if (payload.period !== undefined) {
    const normalizedPeriod = normalizeProductPeriod(payload.period);
    if (!normalizedPeriod) {
      return NextResponse.json({ error: 'Invalid product billing period.' }, { status: 400 });
    }
    updateData.period = normalizedPeriod;
  }
  const effectivePeriod = typeof updateData.period === 'string' ? updateData.period : existing.period;
  if (payload.productType !== undefined) {
    const normalizedProductType = typeof payload.productType === 'string'
      ? payload.productType.trim().toUpperCase()
      : '';
    if (!normalizedProductType || !isProductTypeAllowedForPeriod(normalizedProductType as ProductType, effectivePeriod)) {
      return NextResponse.json({ error: 'Invalid product type for the selected billing period.' }, { status: 400 });
    }
    updateData.taxCategory = deriveTaxCategoryFromProductType(normalizedProductType as ProductType);
  }
  if (payload.taxCategory !== undefined) {
    const normalizedTaxCategory = normalizeProductTaxCategory(payload.taxCategory);
    if (!normalizedTaxCategory) {
      return NextResponse.json({ error: 'Invalid product tax category.' }, { status: 400 });
    }
    if (!isStoredTaxCategoryAllowedForPeriod(normalizedTaxCategory, effectivePeriod)) {
      return NextResponse.json({ error: 'Invalid product tax category for the selected billing period.' }, { status: 400 });
    }
    updateData.taxCategory = normalizedTaxCategory;
  }
  if (
    payload.period !== undefined
    && payload.productType === undefined
    && payload.taxCategory === undefined
  ) {
    updateData.taxCategory = deriveTaxCategoryFromProductType(
      defaultProductTypeForPeriod(effectivePeriod as Product['period']),
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const nextProduct = {
    id: existing.id,
    name: typeof updateData.name === 'string' ? updateData.name : existing.name,
    description: Object.prototype.hasOwnProperty.call(updateData, 'description')
      ? (typeof updateData.description === 'string' ? updateData.description : null)
      : existing.description,
    priceCents: typeof updateData.priceCents === 'number' ? updateData.priceCents : existing.priceCents,
    period: effectivePeriod,
    organizationId: typeof updateData.organizationId === 'string' ? updateData.organizationId : existing.organizationId,
    taxCategory:
      normalizeProductTaxCategory(updateData.taxCategory)
      ?? normalizeProductTaxCategory(existing.taxCategory)
      ?? defaultProductTaxCategoryForPeriod(
        effectivePeriod,
      ),
    stripeProductId: existing.stripeProductId,
    stripePriceId: existing.stripePriceId,
  };
  const stripe = new Stripe(secretKey);
  const stripeCatalog = await syncPlatformProductCatalog({
    stripe,
    product: nextProduct,
    forceNewPrice: (
      Object.prototype.hasOwnProperty.call(updateData, 'priceCents')
      || Object.prototype.hasOwnProperty.call(updateData, 'period')
      || !existing.stripePriceId
    ),
  });
  updateData.stripeProductId = stripeCatalog.stripeProductId;
  updateData.stripePriceId = stripeCatalog.stripePriceId;

  const updated = await prisma.products.update({
    where: { id },
    data: { ...updateData, updatedAt: new Date() } as any,
  });

  return NextResponse.json({
    ...withLegacyFields(updated),
    productType: deriveProductTypeFromTaxCategory(
      updated.taxCategory as Product['taxCategory'],
      updated.period as Product['period'],
    ),
  }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const org = await prisma.organizations.findUnique({ where: { id: existing.organizationId } });
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.products.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
