import { NextRequest, NextResponse } from 'next/server';
import {
  isAuthEventType,
  isVerificationEvent,
  parseBoldSignWebhookEvent,
  processBoldSignWebhookEvent,
  shouldProcessBoldSignEvent,
  verifyBoldSignWebhookSignature,
} from '@/lib/boldsignWebhookSync';
import {
  createBoldSignWebhookEvent,
  updateBoldSignWebhookEventStatus,
} from '@/lib/boldsignSyncOperations';

export const dynamic = 'force-dynamic';

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => '');
  let parsedBody: unknown = null;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ received: true }, { status: 200 });
    }
  }
  const payload = toRecord(parsedBody);
  if (!payload) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const signatureHeader = req.headers.get('x-boldsign-signature');
  const signatureVerification = verifyBoldSignWebhookSignature({
    rawBody,
    signatureHeader,
  });

  if (!signatureVerification.valid) {
    console.error('Rejected BoldSign webhook signature', {
      reason: signatureVerification.error ?? 'Invalid signature',
      hasSignatureHeader: Boolean(signatureHeader),
      eventTypeHeader: req.headers.get('x-boldsign-event'),
    });
    const status = signatureVerification.error?.toLowerCase().includes('not configured') ? 500 : 400;
    return NextResponse.json(
      {
        received: false,
        error: signatureVerification.error ?? 'Invalid webhook signature.',
      },
      { status },
    );
  }

  const eventTypeHeader = req.headers.get('x-boldsign-event');
  const parsedEvent = parseBoldSignWebhookEvent({
    payload,
    rawBody,
    headerEventType: eventTypeHeader,
  });

  if (isVerificationEvent(eventTypeHeader, parsedEvent.eventType)) {
    return NextResponse.json({ received: true, verification: true }, { status: 200 });
  }

  const eventRecord = await createBoldSignWebhookEvent({
    boldSignEventId: parsedEvent.eventId,
    eventType: parsedEvent.eventType,
    objectType: parsedEvent.objectType,
    templateId: parsedEvent.templateId,
    documentId: parsedEvent.documentId,
    eventTimestamp: parsedEvent.eventTimestamp,
    signatureTimestamp: signatureVerification.signatureTimestamp,
    payload,
    headers: {
      event: eventTypeHeader,
      signature: signatureHeader,
    },
  });

  if (eventRecord.duplicate) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  if (isAuthEventType(parsedEvent.eventType) || !shouldProcessBoldSignEvent(parsedEvent.eventType)) {
    if (eventRecord.event?.id) {
      await updateBoldSignWebhookEventStatus({
        id: eventRecord.event.id,
        status: 'PROCESSED',
      });
    }
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  try {
    await processBoldSignWebhookEvent(parsedEvent);
    if (eventRecord.event?.id) {
      await updateBoldSignWebhookEventStatus({
        id: eventRecord.event.id,
        status: 'PROCESSED',
      });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to process BoldSign webhook event', {
      eventId: parsedEvent.eventId,
      eventType: parsedEvent.eventType,
      error,
    });

    if (eventRecord.event?.id) {
      await updateBoldSignWebhookEventStatus({
        id: eventRecord.event.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Failed to process webhook event.',
      });
    }

    return NextResponse.json(
      {
        received: false,
        error: 'Failed to process webhook event.',
      },
      { status: 500 },
    );
  }
}
