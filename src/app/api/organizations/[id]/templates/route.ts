import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  userId: z.string().optional(),
  template: z.object({
    title: z.string(),
    description: z.string().optional(),
    signOnce: z.boolean().optional(),
    type: z.string().optional(),
    content: z.string().optional(),
  }).optional(),
}).passthrough();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templates = await prisma.templateDocuments.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ templates: withLegacyList(templates) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!session.isAdmin && org.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = parsed.data.template;
  if (!template) {
    return NextResponse.json({ error: 'Template data is required' }, { status: 400 });
  }

  const record = await prisma.templateDocuments.create({
    data: {
      id: crypto.randomUUID(),
      templateId: null,
      type: (template.type ?? 'TEXT') as any,
      organizationId: id,
      title: template.title,
      description: template.description ?? null,
      signOnce: template.signOnce ?? false,
      status: 'ACTIVE',
      createdBy: parsed.data.userId ?? session.userId,
      roleIndex: 0,
      roleIndexes: [],
      signerRoles: [],
      content: template.content ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ template: withLegacyFields(record) }, { status: 201 });
}
