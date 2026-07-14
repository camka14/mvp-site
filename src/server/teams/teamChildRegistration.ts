import { prisma } from '@/lib/prisma';
import type { RegistrationQuestionAnswerSnapshotItem } from '@/server/registrationQuestions';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import { findTeamRegistration, reserveTeamRegistrationSlot } from '@/server/teams/teamOpenRegistration';
import {
  dispatchRequiredTeamDocuments,
  getTeamRegistrationSignatureState,
} from '@/server/teams/teamRegistrationDocuments';

const toUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

export const withTeamRoleAliases = (team: Record<string, any>) => {
  const formatted = team;
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

export type ChildTeamRegistrationResult =
  | {
    ok: true;
    payload: {
      registrationId: string;
      status: 'ACTIVE' | 'STARTED' | 'PENDING';
      registration: Record<string, any> | null;
      consent?: {
        documentId: string | null;
        status: string | null;
        childEmail?: string | null;
        requiresChildEmail: boolean;
      };
      warnings?: string[];
      team: Record<string, any> | null;
    };
  }
  | { ok: false; status: number; error: string };

export const reserveChildTeamRegistrationForGuardian = async ({
  teamId,
  childId,
  parentId,
  actorUserId,
  teamRow,
  answersSnapshot,
  now = new Date(),
}: {
  teamId: string;
  childId: string;
  parentId: string;
  actorUserId: string;
  teamRow?: Record<string, any> | null;
  answersSnapshot?: RegistrationQuestionAnswerSnapshotItem[];
  now?: Date;
}): Promise<ChildTeamRegistrationResult> => {
  const resolvedTeamRow = teamRow ?? await loadCanonicalTeamById(teamId);
  if (!resolvedTeamRow) {
    return { ok: false, status: 404, error: 'Team not found.' };
  }

  const [signatureState, childSensitive] = await Promise.all([
    getTeamRegistrationSignatureState({
      teamId,
      registrantId: childId,
      registrantType: 'CHILD',
      parentId,
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId: childId },
      select: { email: true },
    }),
  ]);
  const needsConsent = signatureState.eligibleTemplateIds.length > 0 && !signatureState.hasCompletedRequiredSignatures;
  const consentDispatch = needsConsent
    ? await dispatchRequiredTeamDocuments({
      teamId,
      organizationId: signatureState.organizationId,
      requiredTemplateIds: signatureState.missingTemplateIds,
      parentUserId: parentId,
      childUserId: childId,
    })
    : null;

  const existingRegistration = await findTeamRegistration({
    teamId,
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
  const requiresPayment = Math.max(0, Math.round(Number((resolvedTeamRow as any).registrationPriceCents ?? 0))) > 0;
  const nextStatus = (!requiresPayment && !needsConsent) ? 'ACTIVE' : 'STARTED';

  const result = await reserveTeamRegistrationSlot({
    teamId,
    userId: childId,
    actorUserId,
    status: nextStatus,
    registrantType: 'CHILD',
    parentId,
    rosterRole: 'PARTICIPANT',
    consentDocumentId: nextConsentDocumentId,
    consentStatus: nextConsentStatus,
    answersSnapshot,
    allowStartedWithoutPayment: !requiresPayment,
    now,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }

  const [team, registration] = await Promise.all([
    loadCanonicalTeamById(teamId),
    findTeamRegistration({
      teamId,
      registrantId: childId,
    }),
  ]);
  const childEmail = normalizeEmail(childSensitive?.email);
  const warnings = consentDispatch?.errors.length ? consentDispatch.errors : undefined;

  return {
    ok: true,
    payload: {
      registrationId: result.registrationId,
      status: result.status,
      registration: registration ? registration : null,
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
    },
  };
};
