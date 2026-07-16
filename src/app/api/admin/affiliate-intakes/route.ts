import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  createAffiliateSourceIntake,
  listAffiliateSourceIntakes,
} from '@/server/affiliateImports/sourceIntake';

const pageSchema = z.object({
  url: z.string().trim().url(),
  role: z.string().trim().min(1).optional(),
  targetKindHints: z.array(z.string().trim().min(1)).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  sourceKey: z.string().trim().min(1).optional(),
  region: z.string().trim().nullable().optional(),
  baseUrl: z.string().trim().url().nullable().optional(),
  targetKindHints: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  pages: z.array(pageSchema).min(1).max(50),
});

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    return NextResponse.json({ intakes: await listAffiliateSourceIntakes() });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to list affiliate source intakes', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const intake = await createAffiliateSourceIntake(parsed.data, session.userId);
    return NextResponse.json({ intake }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to create affiliate source intake.';
    return NextResponse.json({ error: message }, { status: message.includes('already belongs') ? 409 : 400 });
  }
}
