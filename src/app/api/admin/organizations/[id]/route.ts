import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const { id: rawOrganizationId } = await params;
    const organizationId = normalizeId(rawOrganizationId);
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization id is required.' }, { status: 400 });
    }

    const organization = await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const [eventCount, teamCount] = await Promise.all([
      prisma.events.count({ where: { organizationId } }),
      prisma.canonicalTeams.count({ where: { organizationId } }),
    ]);
    const blockers = {
      events: eventCount,
      teams: teamCount,
    };
    if (Object.values(blockers).some((count) => count > 0)) {
      return NextResponse.json(
        {
          error: 'Delete or move this organization\'s events and teams before deleting the organization.',
          blockers,
        },
        { status: 409 },
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx: any) => {
      await Promise.all([
        tx.staffMembers?.deleteMany?.({
          where: { organizationId },
        }),
        tx.invites?.deleteMany?.({
          where: { organizationId },
        }),
        tx.products?.deleteMany?.({
          where: { organizationId },
        }),
        tx.fields?.deleteMany?.({
          where: { organizationId },
        }),
        tx.templateDocuments?.deleteMany?.({
          where: { organizationId },
        }),
        tx.signedDocuments?.updateMany?.({
          where: { organizationId },
          data: {
            organizationId: null,
            updatedAt: now,
          },
        }),
        tx.bills?.updateMany?.({
          where: { organizationId },
          data: {
            organizationId: null,
            updatedAt: now,
          },
        }),
        tx.refundRequests?.updateMany?.({
          where: { organizationId },
          data: {
            organizationId: null,
            updatedAt: now,
          },
        }),
        tx.files?.updateMany?.({
          where: { organizationId },
          data: {
            organizationId: null,
            updatedAt: now,
          },
        }),
        tx.stripeAccounts?.updateMany?.({
          where: { organizationId },
          data: {
            organizationId: null,
            updatedAt: now,
          },
        }),
      ]);

      await tx.organizations.delete({
        where: { id: organizationId },
      });
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to delete admin organization', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
