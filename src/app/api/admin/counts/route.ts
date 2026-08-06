import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

export const dynamic = 'force-dynamic';

const eventWhere: any = { NOT: { state: 'TEMPLATE' } };
const verificationWhere: any = {
  OR: [
    { verificationStatus: 'ACTION_REQUIRED' },
    { verificationReviewStatus: { in: ['OPEN', 'IN_PROGRESS'] } },
  ],
};
const claimWhere: any = {
  status: { in: ['PENDING_MANUAL_REVIEW', 'DISPUTED'] },
};

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);

    const [
      events,
      organizations,
      teams,
      verification,
      claims,
      fields,
      users,
      chats,
      moderation,
      feedback,
    ] = await Promise.all([
      prisma.events.count({ where: eventWhere }),
      prisma.organizations.count(),
      prisma.canonicalTeams.count(),
      prisma.organizations.count({ where: verificationWhere }),
      prisma.organizationClaims.count({ where: claimWhere }),
      prisma.fields.count(),
      prisma.userData.count(),
      prisma.chatGroup.count(),
      prisma.moderationReport.count(),
      prisma.feedbackSubmissions.count({ where: { status: { in: ['NEW', 'IN_REVIEW'] } } }),
    ]);

    return NextResponse.json(
      {
        events,
        organizations,
        teams,
        verification,
        claims,
        fields,
        users,
        chats,
        moderation,
        feedback,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin dashboard counts', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
