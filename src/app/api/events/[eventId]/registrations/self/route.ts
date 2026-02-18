import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  resolveEventDivisionSelection,
  validateRegistrantAgeForSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';

export const dynamic = 'force-dynamic';

const schema = z.object({
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      minAge: true,
      maxAge: true,
      sportId: true,
      registrationByDivisionType: true,
      divisions: true,
      requiredTemplateIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const user = await prisma.userData.findUnique({
    where: { id: session.userId },
    select: { dateOfBirth: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  const divisionSelection = await resolveEventDivisionSelection({
    event,
    input: parsed.data,
  });
  if (!divisionSelection.ok) {
    return NextResponse.json({ error: divisionSelection.error ?? 'Invalid division selection' }, { status: 400 });
  }

  const ageCheck = validateRegistrantAgeForSelection({
    dateOfBirth: user.dateOfBirth,
    event,
    selection: divisionSelection.selection,
  });
  if (ageCheck.error === 'Invalid date of birth') {
    return NextResponse.json({ error: ageCheck.error }, { status: 400 });
  }
  if (ageCheck.error) {
    return NextResponse.json({ error: ageCheck.error }, { status: 403 });
  }
  const ageAtEvent = ageCheck.ageAtEvent;

  // Minors can request to join, but a linked parent/guardian must approve.
  if (ageAtEvent < 18) {
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        childId: session.userId,
        status: 'ACTIVE',
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        parentId: true,
      },
    });
    if (!parentLink?.parentId) {
      return NextResponse.json(
        { error: 'No linked parent/guardian found. Ask a parent to add you first.' },
        { status: 403 },
      );
    }

    const existingRequest = await prisma.eventRegistrations.findFirst({
      where: {
        eventId,
        registrantId: session.userId,
        parentId: parentLink.parentId,
        registrantType: 'CHILD',
        status: {
          in: ['PENDINGCONSENT', 'ACTIVE'],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    if (existingRequest) {
      return NextResponse.json(
        {
          registration: withLegacyFields(existingRequest),
          requiresParentApproval: true,
          consent: {
            status: existingRequest.consentStatus ?? 'guardian_approval_required',
            parentId: parentLink.parentId,
          },
        },
        { status: 200 },
      );
    }

    const registration = await prisma.eventRegistrations.create({
      data: {
        id: crypto.randomUUID(),
        eventId,
        registrantId: session.userId,
        parentId: parentLink.parentId,
        registrantType: 'CHILD',
        status: 'PENDINGCONSENT',
        ageAtEvent,
        divisionId: divisionSelection.selection.divisionId,
        divisionTypeId: divisionSelection.selection.divisionTypeId,
        divisionTypeKey: divisionSelection.selection.divisionTypeKey,
        consentStatus: 'guardian_approval_required',
        createdBy: session.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        registration: withLegacyFields(registration),
        requiresParentApproval: true,
        consent: {
          status: 'guardian_approval_required',
          parentId: parentLink.parentId,
        },
      },
      { status: 200 },
    );
  }

  const registration = await prisma.eventRegistrations.create({
    data: {
      id: crypto.randomUUID(),
      eventId,
      registrantId: session.userId,
      registrantType: 'SELF',
      status: Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0 ? 'PENDINGCONSENT' : 'ACTIVE',
      ageAtEvent,
      divisionId: divisionSelection.selection.divisionId,
      divisionTypeId: divisionSelection.selection.divisionTypeId,
      divisionTypeKey: divisionSelection.selection.divisionTypeKey,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ registration: withLegacyFields(registration) }, { status: 200 });
}
