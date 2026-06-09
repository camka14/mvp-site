import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeId } from '@/server/teams/teamMembership';
import { canAccessTeamFinance } from '@/server/finance/financeAccess';
import { loadTeamFinanceSummary } from '@/server/finance/financeRepository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamId = normalizeId(id);
  if (!teamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const canAccess = await canAccessTeamFinance(teamId, session, prisma);
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const eventTeamId = normalizeId(req.nextUrl.searchParams.get('eventTeamId'));
  const finance = await loadTeamFinanceSummary(teamId, prisma, { eventTeamId });
  if (!finance) {
    return NextResponse.json({ error: 'Team finance is only available for organization teams.' }, { status: 400 });
  }

  return NextResponse.json({ finance });
}
