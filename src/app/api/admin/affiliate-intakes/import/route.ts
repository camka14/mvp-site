import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  bulkUpsertAffiliateSourceIntakes,
  type AffiliateSourceIntakeImportRow,
} from '@/server/affiliateImports/sourceIntake';
import { parseAffiliateSourceIntakeDelimitedText } from '@/server/affiliateImports/sourceIntakeImport';

export async function POST(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    let rows: AffiliateSourceIntakeImportRow[];
    let parseRejected: Array<{ row: number; reason: string }> = [];
    if (Array.isArray(body?.rows)) {
      rows = body.rows;
    } else if (typeof body?.text === 'string') {
      const parsed = parseAffiliateSourceIntakeDelimitedText(body.text);
      rows = parsed.rows;
      parseRejected = parsed.rejected;
    } else {
      return NextResponse.json({ error: 'Provide rows or CSV/TSV text.' }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: 'Bulk intake is limited to 500 sources per request.' }, { status: 400 });
    }
    const result = await bulkUpsertAffiliateSourceIntakes(rows, session.userId);
    return NextResponse.json({ ...result, parseRejected });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to import affiliate source intakes.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
