import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const extractString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const extractDocumentId = (payload: Record<string, any>): string | null => {
  const direct = extractString(payload.documentId)
    ?? extractString(payload.documentID)
    ?? extractString(payload.DocumentId)
    ?? extractString(payload.DocumentID);
  if (direct) return direct;

  const containers = ['data', 'payload', 'document', 'documentDetails', 'event'];
  for (const key of containers) {
    const container = payload[key];
    if (container && typeof container === 'object') {
      const value = extractString(container.documentId)
        ?? extractString(container.documentID)
        ?? extractString(container.DocumentId)
        ?? extractString(container.DocumentID)
        ?? extractString(container.id);
      if (value) return value;
    }
  }

  return null;
};

const extractStatus = (payload: Record<string, any>): string | null => {
  const candidates = [
    payload.status,
    payload.documentStatus,
    payload.documentstatus,
    payload.event?.status,
    payload.data?.status,
    payload.payload?.status,
  ];
  for (const value of candidates) {
    const result = extractString(value);
    if (result) return result.toLowerCase();
  }
  return null;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const payload = body as Record<string, any>;
  const documentId = extractDocumentId(payload);
  if (!documentId) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const status = extractStatus(payload) ?? 'signed';
  const now = new Date();
  const normalized = status.toLowerCase();
  const isSigned = ['signed', 'completed'].includes(normalized);
  const isFailed = ['declined', 'expired', 'cancelled', 'canceled'].includes(normalized);

  try {
    if (isSigned) {
      await prisma.signedDocuments.updateMany({
        where: { signedDocumentId: documentId },
        data: { status: 'SIGNED', signedAt: now.toISOString(), updatedAt: now },
      });
    }

    const registrationUpdate: Record<string, any> = {
      consentStatus: normalized,
      updatedAt: now,
    };
    if (isSigned) {
      registrationUpdate.status = 'ACTIVE';
    } else if (isFailed) {
      registrationUpdate.status = 'CONSENTFAILED';
    }
    await prisma.eventRegistrations.updateMany({
      where: { consentDocumentId: documentId },
      data: registrationUpdate,
    });
  } catch (error) {
    console.error('Failed to process document webhook', error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
