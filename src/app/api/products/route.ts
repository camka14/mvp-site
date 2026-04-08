import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
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

const createSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  organizationId: z.string(),
  product: z.object({
    name: z.string(),
    description: z.string().optional(),
    priceCents: z.number(),
    period: z.string(),
    productType: z.string().optional(),
    taxCategory: z.string().optional(),
  }),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const organizationId = params.get('organizationId');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (organizationId) where.organizationId = organizationId;

  const products = await prisma.products.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    products: withLegacyList(products).map((product) => ({
      ...product,
      productType: deriveProductTypeFromTaxCategory(
        product.taxCategory as Product['taxCategory'],
        product.period as Product['period'],
      ),
    })),
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const org = await prisma.organizations.findUnique({ where: { id: parsed.data.organizationId } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const nextProductId = crypto.randomUUID();
  const normalizedPeriod = normalizeProductPeriod(parsed.data.product.period);
  if (!normalizedPeriod) {
    return NextResponse.json({ error: 'Invalid product billing period.' }, { status: 400 });
  }

  const normalizedTaxCategory = parsed.data.product.taxCategory === undefined
    ? defaultProductTaxCategoryForPeriod(normalizedPeriod)
    : normalizeProductTaxCategory(parsed.data.product.taxCategory);
  const requestedProductType = typeof parsed.data.product.productType === 'string'
    ? parsed.data.product.productType.trim().toUpperCase()
    : '';
  const normalizedProductType = (requestedProductType || defaultProductTypeForPeriod(normalizedPeriod)) as ProductType;
  if (!isProductTypeAllowedForPeriod(normalizedProductType, normalizedPeriod)) {
    return NextResponse.json({ error: 'Invalid product type for the selected billing period.' }, { status: 400 });
  }
  const effectiveTaxCategory = requestedProductType
    ? deriveTaxCategoryFromProductType(normalizedProductType)
    : normalizedTaxCategory;
  if (!effectiveTaxCategory) {
    return NextResponse.json({ error: 'Invalid product tax category.' }, { status: 400 });
  }
  if (!requestedProductType && !isStoredTaxCategoryAllowedForPeriod(effectiveTaxCategory, normalizedPeriod)) {
    return NextResponse.json({ error: 'Invalid product tax category for the selected billing period.' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  const stripeCatalog = await syncPlatformProductCatalog({
    stripe,
    product: {
      id: nextProductId,
      name: parsed.data.product.name,
      description: parsed.data.product.description ?? null,
      priceCents: parsed.data.product.priceCents,
      period: normalizedPeriod,
      organizationId: parsed.data.organizationId,
      taxCategory: effectiveTaxCategory,
      stripeProductId: null,
      stripePriceId: null,
    },
  });

  const product = await prisma.products.create({
    data: {
      id: nextProductId,
      name: parsed.data.product.name,
      description: parsed.data.product.description ?? null,
      priceCents: parsed.data.product.priceCents,
      period: normalizedPeriod,
      taxCategory: effectiveTaxCategory,
      organizationId: parsed.data.organizationId,
      createdBy: session.userId,
      isActive: true,
      stripeProductId: stripeCatalog.stripeProductId,
      stripePriceId: stripeCatalog.stripePriceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    ...withLegacyFields(product),
    productType: deriveProductTypeFromTaxCategory(
      product.taxCategory as Product['taxCategory'],
      product.period as Product['period'],
    ),
  }, { status: 201 });
}
