import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { downloadSignedDocumentPdf, isBoldSignConfigured } from '@/lib/boldsignServer';

export const dynamic = 'force-dynamic';

const sanitizeFileName = (value: string): string => {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) {
    return 'signed-document.pdf';
  }
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
};

const hasOrganizationDocumentAccess = async (params: {
  sessionUserId: string;
  isAdmin: boolean;
  organizationId?: string | null;
  eventId?: string | null;
}): Promise<boolean> => {
  if (params.isAdmin) {
    return true;
  }

  let organizationId = params.organizationId ?? null;
  let eventId = params.eventId ?? null;

  if (!organizationId && eventId) {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: { organizationId: true, userIds: true },
    });
    if (!event) {
      return false;
    }
    organizationId = event.organizationId;
    if (Array.isArray(event.userIds) && event.userIds.includes(params.sessionUserId)) {
      return true;
    }
  }

  if (!organizationId) {
    return false;
  }

  const org = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { ownerId: true, hostIds: true, refIds: true },
  });
  if (!org) {
    return false;
  }

  if (org.ownerId === params.sessionUserId) {
    return true;
  }

  if (Array.isArray(org.hostIds) && org.hostIds.includes(params.sessionUserId)) {
    return true;
  }

  if (Array.isArray(org.refIds) && org.refIds.includes(params.sessionUserId)) {
    return true;
  }

  if (eventId) {
    const registration = await prisma.eventRegistrations.findFirst({
      where: {
        eventId,
        OR: [
          { registrantId: params.sessionUserId },
          { createdBy: params.sessionUserId },
        ],
      },
      select: { id: true },
    });
    if (registration) {
      return true;
    }
  }

  return false;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ signedDocumentRecordId: string }> },
) {
  const session = await requireSession(req);
  const { signedDocumentRecordId } = await params;

  const signedDocument = await prisma.signedDocuments.findUnique({
    where: { id: signedDocumentRecordId },
    select: {
      id: true,
      signedDocumentId: true,
      templateId: true,
      userId: true,
      documentName: true,
      organizationId: true,
      eventId: true,
    },
  });
  if (!signedDocument) {
    return NextResponse.json({ error: 'Signed document not found.' }, { status: 404 });
  }

  if (!session.isAdmin && session.userId !== signedDocument.userId) {
    const canAccess = await hasOrganizationDocumentAccess({
      sessionUserId: session.userId,
      isAdmin: session.isAdmin,
      organizationId: signedDocument.organizationId,
      eventId: signedDocument.eventId,
    });
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: signedDocument.templateId },
    select: { type: true, title: true },
  });
  if (template?.type === 'TEXT') {
    return NextResponse.json(
      { error: 'This signed record is a TEXT waiver and does not have a PDF file.' },
      { status: 400 },
    );
  }

  if (!isBoldSignConfigured()) {
    return NextResponse.json(
      { error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.' },
      { status: 503 },
    );
  }

  const file = await downloadSignedDocumentPdf({
    documentId: signedDocument.signedDocumentId,
  });
  const fileName = sanitizeFileName(template?.title || signedDocument.documentName || 'signed-document');

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
