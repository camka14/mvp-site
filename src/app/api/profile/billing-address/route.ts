import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import {
  billingAddressSchema,
  loadUserBillingProfile,
  upsertUserBillingAddress,
} from '@/lib/billingAddress';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  billingAddress: billingAddressSchema,
}).passthrough();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const profile = await loadUserBillingProfile(session.userId);

  return NextResponse.json({
    billingAddress: profile.draft,
    email: profile.email,
  }, { status: 200 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid billing address.', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const saved = await upsertUserBillingAddress(session.userId, parsed.data.billingAddress);
    return NextResponse.json({
      billingAddress: saved.billingAddress,
      email: saved.email,
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save billing address.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
