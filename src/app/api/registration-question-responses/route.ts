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
  const subjectIds = String(req.nextUrl.searchParams.get('subjectIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!subjectType || (!subjectId && !subjectIds.length)) {
    return NextResponse.json({ error: 'subjectType and subjectId or subjectIds are required.' }, { status: 400 });
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
  const firstResponse = responses[0] as Record<string, unknown> | undefined;
  const scopeType = normalizeRegistrationQuestionScopeType(firstResponse?.scopeType);
  const scopeId = String(firstResponse?.scopeId ?? '').trim();
  const canManage = scopeType && scopeId
    ? await canManageRegistrationQuestionScope({ session, scopeType, scopeId })
    : false;
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ responses }, { status: 200 });
}
