import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  createAffiliateSource,
  listAffiliateSources,
} from '@/server/affiliateImports/service';
import { affiliateScrapeMappingSchema } from '@/server/affiliateImports/types';

const createSourceSchema = z.object({
  name: z.string().trim().min(1),
  sourceKey: z.string().trim().min(1),
  listUrl: z.string().trim().url(),
  targetKind: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().url().nullable().optional(),
  status: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  mapping: affiliateScrapeMappingSchema.optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const sources = await listAffiliateSources();
    return NextResponse.json({ sources: withLegacyList(sources) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate scrape sources', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = createSourceSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const source = await createAffiliateSource(parsed.data, session.userId);
    return NextResponse.json({ source: withLegacyFields(source) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to create affiliate scrape source', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
