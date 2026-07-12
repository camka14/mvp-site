import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { canManageRegistrationQuestionScope } from '@/server/registrationQuestionAccess';
import {
  getRegistrationQuestionResponseBySubject,
  listRegistrationQuestionResponsesForSubjects,
  normalizeRegistrationQuestionScopeType,
  type RegistrationQuestionResponseSubjectType,
} from '@/server/registrationQuestions';

export const dynamic = 'force-dynamic';

const MAX_BATCH_SUBJECT_IDS = 100;

const normalizeSubjectType = (value: unknown): RegistrationQuestionResponseSubjectType | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    normalized === 'TEAM_JOIN_REQUEST'
    || normalized === 'TEAM_REGISTRATION'
    || normalized === 'EVENT_REGISTRATION'
  ) {
    return normalized;
  }
  return null;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const subjectType = normalizeSubjectType(req.nextUrl.searchParams.get('subjectType'));
  const subjectId = String(req.nextUrl.searchParams.get('subjectId') ?? '').trim();
  const subjectIds = Array.from(new Set(
    String(req.nextUrl.searchParams.get('subjectIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ));

  if (!subjectType || (!subjectId && !subjectIds.length)) {
    return NextResponse.json({ error: 'subjectType and subjectId or subjectIds are required.' }, { status: 400 });
  }
  if (subjectIds.length > MAX_BATCH_SUBJECT_IDS) {
    return NextResponse.json(
      { error: `subjectIds supports at most ${MAX_BATCH_SUBJECT_IDS} unique IDs per request.` },
      { status: 400 },
    );
  }

  if (subjectId) {
    const response = await getRegistrationQuestionResponseBySubject({ subjectType, subjectId });
    if (!response) {
      return NextResponse.json({ response: null }, { status: 200 });
    }
    const scopeType = normalizeRegistrationQuestionScopeType((response as Record<string, unknown>).scopeType);
    const scopeId = String((response as Record<string, unknown>).scopeId ?? '').trim();
    const canManage = scopeType && scopeId
      ? await canManageRegistrationQuestionScope({ session, scopeType, scopeId })
      : false;
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ response }, { status: 200 });
  }

  const responses = await listRegistrationQuestionResponsesForSubjects({
    subjectType,
    subjectIds,
  });
  if (!responses.length) {
    return NextResponse.json({ responses: [] }, { status: 200 });
  }

  // A batch can span multiple team or event scopes. Authorizing only the
  // first unordered row would allow a manager of one scope to retrieve every
  // other response included in the request.
  const scopes = new Map<string, { scopeType: NonNullable<ReturnType<typeof normalizeRegistrationQuestionScopeType>>; scopeId: string }>();
  for (const response of responses as Array<Record<string, unknown>>) {
    const scopeType = normalizeRegistrationQuestionScopeType(response.scopeType);
    const scopeId = String(response.scopeId ?? '').trim();
    if (!scopeType || !scopeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    scopes.set(`${scopeType}:${scopeId}`, { scopeType, scopeId });
  }

  const permissions = await Promise.all(
    Array.from(scopes.values()).map(({ scopeType, scopeId }) =>
      canManageRegistrationQuestionScope({ session, scopeType, scopeId }),
    ),
  );
  if (permissions.some((canManage) => !canManage)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ responses }, { status: 200 });
}
