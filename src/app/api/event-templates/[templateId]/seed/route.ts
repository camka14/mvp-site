import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
  buildSeedEventFromTemplate,
  getEventTemplate,
} from '@/server/eventTemplates';

export const dynamic = 'force-dynamic';

const seedTemplateSchema = z.object({
  newEventId: z.string().min(1),
  newStartDate: z.string().min(1),
}).strict();

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

const getParams = async (context: RouteContext): Promise<{ templateId: string }> =>
  context.params;

const canAccessTemplate = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  template: any,
): Promise<boolean> => {
  if (session.isAdmin) return true;
  if (template.organizationId) {
    const organization = await prisma.organizations.findUnique({
      where: { id: template.organizationId },
      select: { id: true, ownerId: true },
    });
    return hasOrgPermission(session, organization, ORG_PERMISSIONS.TEMPLATES_MANAGE);
  }
  return template.ownerUserId === session.userId || template.createdByUserId === session.userId;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await requireSession(req);
  const { templateId } = await getParams(context);
  const body = await req.json().catch(() => null);
  const parsed = seedTemplateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const newStartDate = new Date(parsed.data.newStartDate);
  if (Number.isNaN(newStartDate.getTime())) {
    return NextResponse.json({ error: 'newStartDate must be a valid date.' }, { status: 400 });
  }

  const bundle = await getEventTemplate(templateId);
  if (!bundle) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  if (!(await canAccessTemplate(session, bundle.template))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const event = buildSeedEventFromTemplate(bundle, {
    newEventId: parsed.data.newEventId,
    newStartDate,
    hostId: session.userId,
  });

  return NextResponse.json({ event }, { status: 200 });
}
