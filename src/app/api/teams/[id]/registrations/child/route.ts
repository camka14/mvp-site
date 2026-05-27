import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateAgeOnDate } from '@/lib/age';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { handleApiRouteError } from '@/server/http/routeErrors';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import { reserveChildTeamRegistrationForGuardian } from '@/server/teams/teamChildRegistration';

export const dynamic = 'force-dynamic';

const schema = z.object({
  childId: z.string().min(1),
}).passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'childId is required.', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const [teamRow, parentProfile] = await Promise.all([
      loadCanonicalTeamById(id),
      prisma.userData.findUnique({
        where: { id: session.userId },
        select: { dateOfBirth: true },
      }),
    ]);
    if (!teamRow) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }
    if (!parentProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const parentAge = calculateAgeOnDate(parentProfile.dateOfBirth, new Date());
    if (!Number.isFinite(parentAge)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }
    if (parentAge < 18) {
      return NextResponse.json({ error: 'Only adults can register a child.' }, { status: 403 });
    }

    const childId = parsed.data.childId;
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        parentId: session.userId,
        childId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await reserveChildTeamRegistrationForGuardian({
      teamId: id,
      parentId: session.userId,
      childId,
      actorUserId: session.userId,
      teamRow,
      now: new Date(),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.payload, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to register child for team');
  }
}
