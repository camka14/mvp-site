import { prisma } from '@/lib/prisma';

type PrismaLike = any;

export type RegistrationQuestionScopeType = 'TEAM' | 'EVENT';
export type RegistrationQuestionAnswerType = 'TEXT' | 'LONG_TEXT';
export type RegistrationQuestionResponseSubjectType =
  | 'TEAM_JOIN_REQUEST'
  | 'TEAM_REGISTRATION'
  | 'EVENT_REGISTRATION';

export type RegistrationQuestionDraftInput = {
  id?: unknown;
  prompt?: unknown;
  answerType?: unknown;
  required?: unknown;
  sortOrder?: unknown;
};

export type RegistrationQuestionRow = {
  id: string;
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  prompt: string;
  answerType: RegistrationQuestionAnswerType;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type RegistrationQuestionAnswerInput = {
  questionId?: unknown;
  answer?: unknown;
};

export type RegistrationQuestionAnswerSnapshotItem = {
  questionId: string;
  prompt: string;
  answerType: RegistrationQuestionAnswerType;
  required: boolean;
  sortOrder: number;
  answer: string;
};

const VALID_SCOPE_TYPES = new Set(['TEAM', 'EVENT']);
const VALID_ANSWER_TYPES = new Set(['TEXT', 'LONG_TEXT']);
const MAX_QUESTIONS_PER_SCOPE = 20;
const MAX_PROMPT_LENGTH = 500;
const MAX_ANSWER_LENGTH = 5000;

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export const normalizeRegistrationQuestionScopeType = (value: unknown): RegistrationQuestionScopeType | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return VALID_SCOPE_TYPES.has(normalized) ? normalized as RegistrationQuestionScopeType : null;
};

export const normalizeRegistrationQuestionAnswerType = (value: unknown): RegistrationQuestionAnswerType => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return VALID_ANSWER_TYPES.has(normalized) ? normalized as RegistrationQuestionAnswerType : 'TEXT';
};

export const serializeRegistrationQuestion = (row: Record<string, any>): RegistrationQuestionRow => ({
  id: String(row.id ?? ''),
  scopeType: normalizeRegistrationQuestionScopeType(row.scopeType) ?? 'TEAM',
  scopeId: String(row.scopeId ?? ''),
  prompt: String(row.prompt ?? ''),
  answerType: normalizeRegistrationQuestionAnswerType(row.answerType),
  required: Boolean(row.required),
  sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
  isActive: row.isActive !== false,
  createdAt: row.createdAt ?? null,
  updatedAt: row.updatedAt ?? null,
});

export const normalizeQuestionDrafts = (input: unknown): RegistrationQuestionDraftInput[] => {
  const rows = Array.isArray(input) ? input : [];
  if (rows.length > MAX_QUESTIONS_PER_SCOPE) {
    throw new Error(`Use ${MAX_QUESTIONS_PER_SCOPE} or fewer registration questions.`);
  }
  return rows.map((row, index) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const prompt = normalizeText(record.prompt);
    if (!prompt) {
      throw new Error('Question prompts cannot be blank.');
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Question prompts must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
    }
    return {
      id: normalizeText(record.id),
      prompt,
      answerType: normalizeRegistrationQuestionAnswerType(record.answerType),
      required: Boolean(record.required),
      sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index,
    };
  });
};

export const listRegistrationQuestions = async (params: {
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  includeInactive?: boolean;
  client?: PrismaLike;
}): Promise<RegistrationQuestionRow[]> => {
  const client = params.client ?? prisma;
  const normalizedScopeType = normalizeRegistrationQuestionScopeType(params.scopeType);
  const scopeId = normalizeText(params.scopeId);
  if (!normalizedScopeType || !scopeId || !client.registrationQuestions?.findMany) {
    return [];
  }
  const rows = await client.registrationQuestions.findMany({
    where: {
      scopeType: normalizedScopeType as any,
      scopeId,
      ...(params.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
  return rows.map((row: Record<string, any>) => serializeRegistrationQuestion(row));
};

export const saveRegistrationQuestions = async (params: {
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  questions: unknown;
  actorUserId?: string | null;
  client?: PrismaLike;
}): Promise<RegistrationQuestionRow[]> => {
  const client = params.client ?? prisma;
  const normalizedScopeType = normalizeRegistrationQuestionScopeType(params.scopeType);
  const scopeId = normalizeText(params.scopeId);
  const actorUserId = normalizeText(params.actorUserId);
  if (!normalizedScopeType || !scopeId) {
    throw new Error('Question scope is required.');
  }
  const drafts = normalizeQuestionDrafts(params.questions);
  const run = async (tx: PrismaLike) => {
    const existingRows = await tx.registrationQuestions.findMany({
      where: {
        scopeType: normalizedScopeType as any,
        scopeId,
      },
      select: { id: true },
    });
    const existingIds = new Set(existingRows.map((row: { id: string }) => row.id));
    const activeIds = new Set<string>();
    const now = new Date();

    for (const [index, draft] of drafts.entries()) {
      const id = normalizeText(draft.id);
      const data = {
        prompt: normalizeText(draft.prompt) ?? '',
        answerType: normalizeRegistrationQuestionAnswerType(draft.answerType) as any,
        required: Boolean(draft.required),
        sortOrder: Number.isFinite(Number(draft.sortOrder)) ? Number(draft.sortOrder) : index,
        isActive: true,
        updatedBy: actorUserId,
        updatedAt: now,
      };
      if (id && existingIds.has(id)) {
        await tx.registrationQuestions.update({
          where: { id },
          data,
        });
        activeIds.add(id);
      } else {
        const createdId = crypto.randomUUID();
        await tx.registrationQuestions.create({
          data: {
            id: createdId,
            scopeType: normalizedScopeType as any,
            scopeId,
            ...data,
            createdBy: actorUserId,
            createdAt: now,
          },
        });
        activeIds.add(createdId);
      }
    }

    const inactiveIds = existingRows
      .map((row: { id: string }) => row.id)
      .filter((id: string) => !activeIds.has(id));
    if (inactiveIds.length) {
      await tx.registrationQuestions.updateMany({
        where: { id: { in: inactiveIds } },
        data: {
          isActive: false,
          updatedBy: actorUserId,
          updatedAt: now,
        },
      });
    }

    return listRegistrationQuestions({
      scopeType: normalizedScopeType,
      scopeId,
      client: tx,
    });
  };

  return client.$transaction ? client.$transaction(run) : run(client);
};

const normalizeAnswerInputMap = (value: unknown): Map<string, string> => {
  const answersByQuestionId = new Map<string, string>();
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const record = entry && typeof entry === 'object' ? entry as RegistrationQuestionAnswerInput : {};
      const questionId = normalizeText(record.questionId);
      if (!questionId) {
        return;
      }
      const answer = typeof record.answer === 'string' || typeof record.answer === 'number'
        ? String(record.answer)
        : '';
      answersByQuestionId.set(questionId, answer.trim());
    });
    return answersByQuestionId;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([questionId, answerValue]) => {
      const normalizedQuestionId = normalizeText(questionId);
      if (!normalizedQuestionId) {
        return;
      }
      const answer = typeof answerValue === 'string' || typeof answerValue === 'number'
        ? String(answerValue)
        : '';
      answersByQuestionId.set(normalizedQuestionId, answer.trim());
    });
  }
  return answersByQuestionId;
};

const createRegistrationAnswerError = (message: string): Error & { status: number } => (
  Object.assign(new Error(message), { status: 400 })
);

export const buildRegistrationAnswerSnapshot = (params: {
  questions: RegistrationQuestionRow[];
  answers: unknown;
}): RegistrationQuestionAnswerSnapshotItem[] => {
  const answersByQuestionId = normalizeAnswerInputMap(params.answers);
  return params.questions.map((question) => {
    const answer = String(answersByQuestionId.get(question.id) ?? '').trim();
    if (answer.length > MAX_ANSWER_LENGTH) {
      throw createRegistrationAnswerError('Registration answers must be shorter.');
    }
    if (question.required && !answer) {
      throw createRegistrationAnswerError(`Answer "${question.prompt}" before continuing.`);
    }
    return {
      questionId: question.id,
      prompt: question.prompt,
      answerType: question.answerType,
      required: question.required,
      sortOrder: question.sortOrder,
      answer,
    };
  });
};

export const loadAndBuildRegistrationAnswerSnapshot = async (params: {
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  answers: unknown;
  client?: PrismaLike;
}): Promise<RegistrationQuestionAnswerSnapshotItem[]> => {
  const questions = await listRegistrationQuestions({
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    client: params.client,
  });
  return buildRegistrationAnswerSnapshot({
    questions,
    answers: params.answers,
  });
};

export const upsertRegistrationQuestionResponse = async (params: {
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  subjectType: RegistrationQuestionResponseSubjectType;
  subjectId: string;
  responderUserId: string;
  registrantUserId: string;
  registrantType: string;
  answersSnapshot: RegistrationQuestionAnswerSnapshotItem[];
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const scopeType = normalizeRegistrationQuestionScopeType(params.scopeType);
  const scopeId = normalizeText(params.scopeId);
  const subjectId = normalizeText(params.subjectId);
  const responderUserId = normalizeText(params.responderUserId);
  const registrantUserId = normalizeText(params.registrantUserId);
  const registrantType = normalizeText(params.registrantType)?.toUpperCase() ?? 'SELF';
  if (!scopeType || !scopeId || !subjectId || !responderUserId || !registrantUserId) {
    throw new Error('Registration answer context is incomplete.');
  }
  if (!client.registrationQuestionResponses?.upsert) {
    return null;
  }
  const now = new Date();
  return client.registrationQuestionResponses.upsert({
    where: {
      subjectType_subjectId: {
        subjectType: params.subjectType as any,
        subjectId,
      },
    },
    create: {
      id: crypto.randomUUID(),
      scopeType: scopeType as any,
      scopeId,
      subjectType: params.subjectType as any,
      subjectId,
      responderUserId,
      registrantUserId,
      registrantType,
      answersSnapshot: params.answersSnapshot as any,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      scopeType: scopeType as any,
      scopeId,
      responderUserId,
      registrantUserId,
      registrantType,
      answersSnapshot: params.answersSnapshot as any,
      updatedAt: now,
    },
  });
};

export const getRegistrationQuestionResponseBySubject = async (params: {
  subjectType: RegistrationQuestionResponseSubjectType;
  subjectId: string;
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const subjectId = normalizeText(params.subjectId);
  if (!subjectId || !client.registrationQuestionResponses?.findUnique) {
    return null;
  }
  const row = await client.registrationQuestionResponses.findUnique({
    where: {
      subjectType_subjectId: {
        subjectType: params.subjectType as any,
        subjectId,
      },
    },
  });
  return row ?? null;
};

export const listRegistrationQuestionResponsesForSubjects = async (params: {
  subjectType: RegistrationQuestionResponseSubjectType;
  subjectIds: string[];
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const subjectIds = Array.from(new Set(params.subjectIds.map((id) => normalizeText(id)).filter(Boolean))) as string[];
  if (!subjectIds.length || !client.registrationQuestionResponses?.findMany) {
    return [];
  }
  return client.registrationQuestionResponses.findMany({
    where: {
      subjectType: params.subjectType as any,
      subjectId: { in: subjectIds },
    },
  });
};

export const deleteRegistrationQuestionResponsesForSubjects = async (params: {
  subjectType: RegistrationQuestionResponseSubjectType;
  subjectIds: string[];
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const subjectIds = Array.from(new Set(params.subjectIds.map((id) => normalizeText(id)).filter(Boolean))) as string[];
  if (!subjectIds.length || !client.registrationQuestionResponses?.deleteMany) {
    return;
  }
  await client.registrationQuestionResponses.deleteMany({
    where: {
      subjectType: params.subjectType as any,
      subjectId: { in: subjectIds },
    },
  });
};
