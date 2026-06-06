import { NextRequest, NextResponse } from 'next/server';
import { calculateAgeOnDate } from '@/lib/age';
import { normalizeOptionalName } from '@/lib/nameCase';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { handleApiRouteError } from '@/server/http/routeErrors';
import { loadAndBuildRegistrationAnswerSnapshot } from '@/server/registrationQuestions';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import { leaveTeam, findTeamRegistration, reserveTeamRegistrationSlot } from '@/server/teams/teamOpenRegistration';
import {
  dispatchRequiredTeamDocuments,
  getTeamRegistrationSignatureState,
} from '@/server/teams/teamRegistrationDocuments';

export const dynamic = 'force-dynamic';

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
    const { id } = await params;
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const [teamRow, userProfile] = await Promise.all([
      loadCanonicalTeamById(id),
      prisma.userData.findUnique({
        where: { id: session.userId },
        select: { dateOfBirth: true, firstName: true, lastName: true },
      }),
    ]);
    if (!teamRow) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }
    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const age = calculateAgeOnDate(userProfile.dateOfBirth, new Date());
    if (!Number.isFinite(age)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }

    if (age < 18) {
      const [parentLink, authUser, sensitiveUser, existingInvite] = await Promise.all([
        prisma.parentChildLinks.findFirst({
          where: {
            childId: session.userId,
            status: 'ACTIVE',
          },
          orderBy: { updatedAt: 'desc' },
          select: { parentId: true },
        }),
        prisma.authUser.findUnique({
          where: { id: session.userId },
          select: { email: true },
        }),
        prisma.sensitiveUserData.findFirst({
          where: { userId: session.userId },
          select: { email: true },
        }),
        prisma.invites.findFirst({
          where: {
            type: 'TEAM',
            teamId: id,
            userId: session.userId,
            status: 'PENDING',
          },
        }),
      ]);
      if (!parentLink?.parentId) {
        return NextResponse.json(
          { error: 'No linked parent/guardian found. Ask a parent to add you first.' },
          { status: 403 },
        );
      }

      const inviteEmail = normalizeEmail(authUser?.email)
        ?? normalizeEmail(sensitiveUser?.email)
        ?? normalizeEmail(existingInvite?.email);
      if (!inviteEmail) {
        return NextResponse.json({ error: 'Missing account email for team join request.' }, { status: 400 });
      }

      const now = new Date();
      const isExistingManagerInvite = Boolean(existingInvite && existingInvite.createdBy !== session.userId);
      const invite = isExistingManagerInvite
        ? existingInvite
        : existingInvite
          ? await prisma.invites.update({
            where: { id: existingInvite.id },
            data: {
              email: inviteEmail,
              status: 'PENDING',
              createdBy: session.userId,
              firstName: normalizeOptionalName(userProfile.firstName) ?? existingInvite.firstName,
              lastName: normalizeOptionalName(userProfile.lastName) ?? existingInvite.lastName,
              updatedAt: now,
            },
          })
          : await prisma.invites.create({
            data: {
              id: crypto.randomUUID(),
              type: 'TEAM',
              email: inviteEmail,
              status: 'PENDING',
              teamId: id,
              userId: session.userId,
              createdBy: session.userId,
              firstName: normalizeOptionalName(userProfile.firstName),
              lastName: normalizeOptionalName(userProfile.lastName),
              createdAt: now,
              updatedAt: now,
            },
          });

      return NextResponse.json({
        requiresParentApproval: true,
        message: isExistingManagerInvite
          ? 'A parent or guardian must accept the pending team invitation before you can join this team.'
          : 'A parent or guardian must accept this team join request before you can be added to the team.',
        invite: invite ? withLegacyFields(invite) : null,
        team: withTeamRoleAliases(teamRow as Record<string, any>),
      }, { status: 200 });
    }

    const registrantId = session.userId;
    const registrantType: 'SELF' = 'SELF';
    const parentId: string | null = null;
    const answersSnapshot = await loadAndBuildRegistrationAnswerSnapshot({
      scopeType: 'TEAM',
      scopeId: id,
      answers: body?.answers,
    });

    const signatureState = await getTeamRegistrationSignatureState({
      teamId: id,
      registrantId,
      registrantType,
      parentId,
    });
    const needsConsent = signatureState.eligibleTemplateIds.length > 0 && !signatureState.hasCompletedRequiredSignatures;
    const consentDispatch = needsConsent
      ? await dispatchRequiredTeamDocuments({
        teamId: id,
        organizationId: signatureState.organizationId,
        requiredTemplateIds: signatureState.missingTemplateIds,
        ...(registrantType === 'SELF'
          ? { participantUserId: registrantId }
          : {
            parentUserId: parentId,
            childUserId: registrantId,
          }),
      })
      : null;

    const existingRegistration = await findTeamRegistration({
      teamId: id,
      registrantId,
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
      userId: registrantId,
      actorUserId: session.userId,
      status: nextStatus,
      registrantType,
      parentId,
      rosterRole: 'PARTICIPANT',
      consentDocumentId: nextConsentDocumentId,
      consentStatus: nextConsentStatus,
      answersSnapshot,
      allowStartedWithoutPayment: !requiresPayment,
      now: new Date(),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const team = await loadCanonicalTeamById(id);
    const registration = await findTeamRegistration({
      teamId: id,
      registrantId,
    });
    return NextResponse.json({
      registrationId: result.registrationId,
      status: result.status,
      registration: registration ? withLegacyFields(registration) : null,
      consent: signatureState.eligibleTemplateIds.length > 0
        ? {
          documentId: nextConsentDocumentId,
          status: nextConsentStatus,
          requiresChildEmail: consentDispatch?.missingChildEmail ?? false,
        }
        : undefined,
      warnings: consentDispatch?.errors.length ? consentDispatch.errors : undefined,
      team: team ? withTeamRoleAliases(team as Record<string, any>) : null,
    }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to register self for team');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;
    const result = await leaveTeam({
      teamId: id,
      userId: session.userId,
      now: new Date(),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const team = await loadCanonicalTeamById(id);
    return NextResponse.json({
      left: true,
      team: team ? withTeamRoleAliases(team as Record<string, any>) : null,
    }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to leave team');
  }
}
