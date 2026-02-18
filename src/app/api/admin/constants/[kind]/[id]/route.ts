import { NextRequest, NextResponse } from 'next/server';
import {
  AdminConstantsInputError,
  normalizePatchForKind,
  parseAdminConstantKind,
  updateAdminConstantByKind,
} from '@/server/adminConstants';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    await requireRazumlyAdmin(req);
    const { kind, id } = await params;
    const parsedKind = parseAdminConstantKind(kind);
    const payload = await req.json().catch(() => null);
    const patch = normalizePatchForKind(parsedKind, payload);
    const updated = await updateAdminConstantByKind(parsedKind, id, patch);
    return NextResponse.json({ record: withLegacyFields(updated) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AdminConstantsInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update admin constant', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
