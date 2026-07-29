import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import {
  findOrganizationMatches,
  isOrganizationMatchError,
} from '@/server/organizationMatch';

export const dynamic = 'force-dynamic';

const coordinatesSchema = z.union([
  z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }),
  z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ]),
]);

const matchSchema = z.object({
  name: z.string().trim().max(120).optional(),
  website: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
  coordinates: coordinatesSchema.nullish(),
  acknowledgedMatchIds: z.array(z.string().trim().min(1).max(200)).max(25).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = matchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid organization match input.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await findOrganizationMatches(parsed.data, {
      userId: session.userId,
      isAdmin: session.isAdmin,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (isOrganizationMatchError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code, matches: error.matches },
        { status: error.status },
      );
    }
    throw error;
  }
}
