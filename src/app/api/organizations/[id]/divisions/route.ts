import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import { DEFAULT_ORGANIZATION_STATUS } from '@/lib/organizationStatus';
import { createId } from '@/lib/id';
import { organizationHasFeature } from '@/lib/organizationFeatures';
import {
  normalizeOrganizationDivisionInput,
  OrganizationDivisionValidationError,
  organizationDivisionView,
} from '@/server/organizationDivisions';

export const dynamic = 'force-dynamic';

const divisionSchema = z.object({
  name: z.string().optional(),
  sportId: z.string(),
  gender: z.string(),
  skillDivisionTypeId: z.string(),
  ageDivisionTypeId: z.string(),
  price: z.number().int().nonnegative(),
  maxParticipants: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  registrationUrl: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  lastVerifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

const loadOrganization = (id: string) => prisma.organizations.findUnique({
  where: { id },
  select: {
    id: true,
    ownerId: true,
    status: true,
    publicPageEnabled: true,
    enabledFeatures: true,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await loadOrganization(id);
  if (!organization) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const manage = req.nextUrl.searchParams.get('manage') === 'true';
  if (manage) {
    const session = await requireSession(req);
    if (!(await canManageOrganization(session, organization))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (organization.status !== DEFAULT_ORGANIZATION_STATUS) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await prisma.divisions.findMany({
    where: {
      organizationId: id,
      eventId: null,
      scope: 'ORGANIZATION',
      ...(manage ? {} : { status: 'ACTIVE' }),
    },
    orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ divisions: rows.map(organizationDivisionView) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const organization = await loadOrganization(id);
  if (!organization) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canManageOrganization(session, organization))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!organizationHasFeature(organization.enabledFeatures, 'CLUB_TEAMS')) {
    return NextResponse.json({ error: 'Enable club and team tools before adding club divisions.' }, { status: 409 });
  }

  const parsed = divisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const normalized = await normalizeOrganizationDivisionInput(parsed.data);
    const row = await prisma.divisions.create({
      data: {
        id: `organization_division_${createId()}`,
        organizationId: id,
        eventId: null,
        scope: 'ORGANIZATION',
        kind: 'LEAGUE',
        sortOrder: await prisma.divisions.count({
          where: { organizationId: id, scope: 'ORGANIZATION', status: { not: 'ARCHIVED' } },
        }),
        fieldIds: [],
        teamIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...normalized,
      },
    });
    return NextResponse.json({ division: organizationDivisionView(row) }, { status: 201 });
  } catch (error) {
    if (error instanceof OrganizationDivisionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if ((error as { code?: unknown })?.code === 'P2002') {
      return NextResponse.json({ error: 'This organization already has that active division.' }, { status: 409 });
    }
    throw error;
  }
}
