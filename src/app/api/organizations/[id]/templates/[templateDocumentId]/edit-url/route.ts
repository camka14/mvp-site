import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  getEmbeddedTemplateEditUrl,
  isBoldSignConfigured,
  isBoldSignForbiddenError,
  isBoldSignInvalidTemplateIdError,
  isBoldSignNotFoundError,
} from '@/lib/boldsignServer';
import { canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateDocumentId: string }> },
) {
  const session = await requireSession(req);
  const { id, templateDocumentId } = await params;

  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: templateDocumentId },
  });
  if (!template || template.organizationId !== id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (template.type === 'TEXT') {
    return NextResponse.json({ error: 'Only PDF templates support BoldSign editing.' }, { status: 400 });
  }
  if (!template.templateId) {
    return NextResponse.json({ error: 'Template is missing BoldSign template id.' }, { status: 400 });
  }
  if (!isBoldSignConfigured()) {
    return NextResponse.json({
      error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.',
    }, { status: 503 });
  }

  try {
    const { editUrl } = await getEmbeddedTemplateEditUrl({
      templateId: template.templateId,
    });
    return NextResponse.json({ editUrl }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open template editor.';
    const isOutOfSyncTemplate = isBoldSignNotFoundError(error)
      || isBoldSignForbiddenError(error)
      || isBoldSignInvalidTemplateIdError(error);
    if (isOutOfSyncTemplate) {
      return NextResponse.json(
        {
          error: 'Template is out of sync with BoldSign. Delete and recreate this template.',
          detail: message,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
