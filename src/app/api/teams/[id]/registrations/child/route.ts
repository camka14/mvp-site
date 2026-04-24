import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateAgeOnDate } from '@/lib/age';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { handleApiRouteError } from '@/server/http/routeErrors';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import { findTeamRegistration, reserveTeamRegistrationSlot } from '@/server/teams/teamOpenRegistration';
import {
  dispatchRequiredTeamDocuments,
  getTeamRegistrationSignatureState,
} from '@/server/teams/teamRegistrationDocuments';

export const dynamic = 'force-dynamic';

const schema = z.object({
  childId: z.string().min(1),
}).passthrough();

const toUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

const withTeamRoleAliases = (team: Record<string, any>) => {
  const formatted = withLegacyFields(team);
  const assistantCoachIds = toUniqueStrings((formatted as any).assistantCoachIds ?? (formatted as any).coachIds);
  return {
    ...formatted,
    assistantCoachIds,
    coachIds: assistantCoachIds,
  };
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'childId is required.', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const [teamRow, parentProfile] = await Promise.all([
      loadCanonicalTeamById(id),
      prisma.userData.findUnique({
        where: { id: session.userId },
        select: { dateOfBirth: true },
      }),
    ]);
    if (!teamRow) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }
    if (!parentProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const parentAge = calculateAgeOnDate(parentProfile.dateOfBirth, new Date());
    if (!Number.isFinite(parentAge)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }
    if (parentAge < 18) {
      return NextResponse.json({ error: 'Only adults can register a child.' }, { status: 403 });
    }

    const childId = parsed.data.childId;
    const [parentLink, childSensitive] = await Promise.all([
      prisma.parentChildLinks.findFirst({
        where: {
          parentId: session.userId,
          childId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      prisma.sensitiveUserData.findFirst({
        where: { userId: childId },
        select: { email: true },
      }),
    ]);
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const signatureState = await getTeamRegistrationSignatureState({
      teamId: id,
      registrantId: childId,
      registrantType: 'CHILD',
      parentId: session.userId,
    });
    const needsConsent = signatureState.eligibleTemplateIds.length > 0 && !signatureState.hasCompletedRequiredSignatures;
    const consentDispatch = needsConsent
      ? await dispatchRequiredTeamDocuments({
        teamId: id,
        organizationId: signatureState.organizationId,
        requiredTemplateIds: signatureState.missingTemplateIds,
        parentUserId: session.userId,
        childUserId: childId,
      })
      : null;

    const existingRegistration = await findTeamRegistration({
      teamId: id,
      registrantId: childId,
    });
    const nextConsentStatus = signatureState.eligibleTemplateIds.length === 0
      ? null
      : signatureState.hasCompletedRequiredSignatures
        ? 'completed'
        : consentDispatch?.missingChildEmail
          ? 'child_email_required'
          : (consentDispatch?.errors.length ?? 0) > 0
            ? 'send_failed'
            : signatureState.consentStatus ?? 'sent';
    const nextConsentDocumentId = consentDispatch?.firstDocumentId
      ?? existingRegistration?.consentDocumentId
      ?? null;
    const requiresPayment = Math.max(0, Math.round(Number((teamRow as any).registrationPriceCents ?? 0))) > 0;
    const nextStatus = (!requiresPayment && !needsConsent) ? 'ACTIVE' : 'STARTED';

    const result = await reserveTeamRegistrationSlot({
      teamId: id,
      userId: childId,
      actorUserId: session.userId,
      status: nextStatus,
      registrantType: 'CHILD',
      parentId: session.userId,
      rosterRole: 'PARTICIPANT',
      consentDocumentId: nextConsentDocumentId,
      consentStatus: nextConsentStatus,
      allowStartedWithoutPayment: !requiresPayment,
      now: new Date(),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const team = await loadCanonicalTeamById(id);
    const registration = await findTeamRegistration({
      teamId: id,
      registrantId: childId,
    });
    const childEmail = normalizeEmail(childSensitive?.email);
    const warnings = consentDispatch?.errors.length ? consentDispatch.errors : undefined;

    return NextResponse.json({
      registrationId: result.registrationId,
      status: result.status,
      registration: registration ? withLegacyFields(registration) : null,
      consent: signatureState.eligibleTemplateIds.length > 0
        ? {
          documentId: nextConsentDocumentId,
          status: nextConsentStatus,
          childEmail,
          requiresChildEmail: consentDispatch?.missingChildEmail ?? false,
        }
        : undefined,
      warnings,
      team: team ? withTeamRoleAliases(team as Record<string, any>) : null,
    }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to register child for team');
  }
}
