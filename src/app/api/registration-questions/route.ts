import { NextRequest, NextResponse } from 'next/server';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import {
  listRegistrationQuestions,
  normalizeRegistrationQuestionScopeType,
  saveRegistrationQuestions,
} from '@/server/registrationQuestions';
import { canManageRegistrationQuestionScope } from '@/server/registrationQuestionAccess';

export const dynamic = 'force-dynamic';

const parseScope = (req: NextRequest) => {
  const scopeType = normalizeRegistrationQuestionScopeType(req.nextUrl.searchParams.get('scopeType'));
  const scopeId = String(req.nextUrl.searchParams.get('scopeId') ?? '').trim();
  return { scopeType, scopeId };
};

export async function GET(req: NextRequest) {
  const { scopeType, scopeId } = parseScope(req);
  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: 'scopeType and scopeId are required.' }, { status: 400 });
  }

  const mode = String(req.nextUrl.searchParams.get('mode') ?? '').trim().toLowerCase();
  const session = await getOptionalSession(req);
  const canManage = session
    ? await canManageRegistrationQuestionScope({ session, scopeType, scopeId })
    : false;
  if (mode === 'edit' && !canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const questions = await listRegistrationQuestions({
    scopeType,
    scopeId,
    includeInactive: mode === 'edit' && canManage,
  });
  return NextResponse.json({ questions, canManage }, { status: 200 });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const scopeType = normalizeRegistrationQuestionScopeType((body as Record<string, unknown> | null)?.scopeType);
  const scopeId = String((body as Record<string, unknown> | null)?.scopeId ?? '').trim();
  const questions = (body as Record<string, unknown> | null)?.questions;
  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: 'scopeType and scopeId are required.' }, { status: 400 });
  }
  const canManage = await canManageRegistrationQuestionScope({ session, scopeType, scopeId });
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const savedQuestions = await saveRegistrationQuestions({
      scopeType,
      scopeId,
      questions,
      actorUserId: session.userId,
    });
    return NextResponse.json({ questions: savedQuestions }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save registration questions.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
