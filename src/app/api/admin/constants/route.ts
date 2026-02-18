import { NextRequest, NextResponse } from 'next/server';
import { withLegacyList } from '@/server/legacyFormat';
import { loadAdminConstants } from '@/server/adminConstants';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

export async function GET(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const constants = await loadAdminConstants();
    return NextResponse.json({
      sports: withLegacyList(constants.sports),
      divisions: withLegacyList(constants.divisions),
      leagueScoringConfigs: withLegacyList(constants.leagueScoringConfigs),
      editableFields: constants.editableFields,
      adminEmail: session.adminEmail,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin constants', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
