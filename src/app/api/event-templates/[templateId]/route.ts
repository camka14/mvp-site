import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
  archiveEventTemplate,
  getEventTemplate,
} from '@/server/eventTemplates';

export const dynamic = 'force-dynamic';

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

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

const getParams = async (context: RouteContext): Promise<{ templateId: string }> =>
  context.params;

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await requireSession(req);
  const { templateId } = await getParams(context);
  const bundle = await getEventTemplate(templateId);
  if (!bundle) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  if (!(await canAccessTemplate(session, bundle.template))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    template: {
      ...bundle.template,
      resources: bundle.resources,
      timeSlots: bundle.timeSlots,
      rentalResourceHints: bundle.rentalHints,
      leagueScoringConfig: bundle.leagueScoringConfig,
    },
  }, { status: 200 });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await requireSession(req);
  const { templateId } = await getParams(context);
  const bundle = await getEventTemplate(templateId);
  if (!bundle) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  if (!(await canAccessTemplate(session, bundle.template))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await archiveEventTemplate(templateId);
  return NextResponse.json({ ok: true }, { status: 200 });
}
