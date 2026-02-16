import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  inferDivisionDetails,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  team: z.record(z.string(), z.any()).optional(),
}).passthrough();

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.volleyBallTeams.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withLegacyFields(team), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.volleyBallTeams.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && existing.captainId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = parsed.data.team ?? parsed.data ?? {};
  const normalizedDivision = normalizeText(payload.division)
    ?? normalizeText(existing.division)
    ?? 'Open';
  const sportInput = normalizeText(payload.sport)
    ?? normalizeText(existing.sport)
    ?? null;
  const normalizedDivisionTypeId = normalizeDivisionIdToken(payload.divisionTypeId)
    ?? normalizeDivisionIdToken(existing.divisionTypeId);
  const inferredDivision = inferDivisionDetails({
    identifier: normalizedDivisionTypeId ?? normalizedDivision,
    sportInput: sportInput ?? undefined,
  });
  const divisionTypeId = normalizedDivisionTypeId ?? inferredDivision.divisionTypeId;
  const divisionTypeName = normalizeText(payload.divisionTypeName)
    ?? normalizeText(existing.divisionTypeName)
    ?? inferredDivision.divisionTypeName;

  const updateData = {
    ...payload,
    division: normalizedDivision,
    divisionTypeId,
    divisionTypeName,
    sport: sportInput,
    updatedAt: new Date(),
  };

  const updated = await prisma.volleyBallTeams.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.volleyBallTeams.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && existing.captainId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.volleyBallTeams.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
