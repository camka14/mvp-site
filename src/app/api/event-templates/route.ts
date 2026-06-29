import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { canManageEvent } from '@/server/accessControl';
import { loadEventWithRelations } from '@/server/repositories/events';
import {
  createEventTemplateFromSourceEvent,
  listEventTemplates,
} from '@/server/eventTemplates';

export const dynamic = 'force-dynamic';

const createTemplateSchema = z.object({
  sourceEventId: z.string().min(1),
  templateId: z.string().min(1).optional(),
}).strict();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const canManageOrganizationTemplates = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  organizationId: string,
): Promise<boolean> => {
  if (session.isAdmin) return true;
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  return hasOrgPermission(session, organization, ORG_PERMISSIONS.TEMPLATES_MANAGE);
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const organizationId = normalizeId(params.get('organizationId'));
  const hostId = normalizeId(params.get('hostId'));
  const limit = Number(params.get('limit') ?? '50');

  const where: Record<string, unknown> = {};
  if (organizationId) {
    if (!(await canManageOrganizationTemplates(session, organizationId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    where.organizationId = organizationId;
  } else if (!session.isAdmin) {
    if (hostId && hostId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    where.ownerUserId = session.userId;
    where.organizationId = null;
  } else if (hostId) {
    where.ownerUserId = hostId;
    where.organizationId = null;
  }

  const templates = await listEventTemplates(where, limit);
  return NextResponse.json({ templates }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const sourceEvent = await loadEventWithRelations(parsed.data.sourceEventId, prisma);
  if (!sourceEvent) {
    return NextResponse.json({ error: 'Source event not found.' }, { status: 404 });
  }
  if (!(await canManageEvent(session, sourceEvent as any))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sourceOrganizationId = normalizeId((sourceEvent as any).organizationId);
  if (sourceOrganizationId && !(await canManageOrganizationTemplates(session, sourceOrganizationId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bundle = await createEventTemplateFromSourceEvent(sourceEvent as any, {
    createdByUserId: session.userId,
    templateId: parsed.data.templateId,
  });
  if (!bundle) {
    return NextResponse.json({ error: 'Failed to create template.' }, { status: 500 });
  }

  return NextResponse.json(
    {
      template: {
        id: bundle.template.id,
        name: bundle.template.name,
        sourceEventId: bundle.template.sourceEventId,
        ownerUserId: bundle.template.ownerUserId,
        organizationId: bundle.template.organizationId,
        sportId: bundle.template.sportId,
        eventType: bundle.template.eventType,
      },
    },
    { status: 201 },
  );
}
