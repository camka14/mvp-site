import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { saveQuickBooksFinanceCategoryAccountingMappings } from '@/server/integrations/financeCategoryAccountingMappings';
import { QUICKBOOKS_PROVIDER } from '@/server/integrations/quickBooksConnection';

export const dynamic = 'force-dynamic';

const categoryMappingSchema = z.object({
  category: z.string().trim().min(1).max(100),
  entryType: z.enum(['REVENUE', 'EXPENSE', 'LIABILITY', 'ASSET']),
  accountExternalId: z.string().trim().max(80).optional().nullable(),
  accountName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
}).strict();

const schema = z.object({
  mappings: z.array(categoryMappingSchema).max(100),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const organization = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganizationFinance(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const connection = await prisma.organizationAccountingConnections.findUnique({
    where: {
      organizationId_provider: {
        organizationId: id,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    select: { id: true, status: true },
  });
  if (!connection || connection.status === 'DISCONNECTED') {
    return NextResponse.json({ error: 'Connect QuickBooks before saving category mappings.' }, { status: 400 });
  }

  const mappings = await saveQuickBooksFinanceCategoryAccountingMappings({
    organizationId: id,
    actingUserId: session.userId,
    mappings: parsed.data.mappings,
    client: prisma,
  });

  return NextResponse.json({ mappings }, { status: 200 });
}
