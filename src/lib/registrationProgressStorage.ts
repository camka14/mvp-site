export type RegistrationProgressStep =
  | 'questions'
  | 'signing'
  | 'billing'
  | 'checkout';

export type RegistrationProgressDraft = {
  version: 1;
  scope: 'event' | 'team';
  userId: string;
  subjectId: string;
  step?: RegistrationProgressStep;
  answers?: Record<string, string>;
  selectedTeamId?: string | null;
  selectedDivisionId?: string | null;
  selectedDivisionTypeKey?: string | null;
  slotId?: string | null;
  occurrenceDate?: string | null;
  registrationId?: string | null;
  holdExpiresAt?: string | null;
  updatedAt: string;
};

type RegistrationProgressKeyInput = {
  scope: 'event' | 'team';
  userId?: string | null;
  subjectId?: string | null;
  slotId?: string | null;
  occurrenceDate?: string | null;
};

const STORAGE_PREFIX = 'bracketiq.registration-progress.v1';

const normalizeKeyPart = (value: unknown): string => (
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : 'none'
);

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const buildRegistrationProgressKey = ({
  scope,
  userId,
  subjectId,
  slotId,
  occurrenceDate,
}: RegistrationProgressKeyInput): string | null => {
  const normalizedUserId = normalizeKeyPart(userId);
  const normalizedSubjectId = normalizeKeyPart(subjectId);
  if (normalizedUserId === 'none' || normalizedSubjectId === 'none') {
    return null;
  }
  return [
    STORAGE_PREFIX,
    scope,
    normalizedUserId,
    normalizedSubjectId,
    normalizeKeyPart(slotId),
    normalizeKeyPart(occurrenceDate),
  ].join(':');
};

export const isRegistrationHoldExpired = (holdExpiresAt?: string | null, nowMs = Date.now()): boolean => {
  if (!holdExpiresAt) {
    return false;
  }
  const expiresAtMs = new Date(holdExpiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
};

export const loadRegistrationProgress = (key: string | null): RegistrationProgressDraft | null => {
  if (!key) {
    return null;
  }
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as RegistrationProgressDraft;
    if (!parsed || parsed.version !== 1) {
      storage.removeItem(key);
      return null;
    }
    if (isRegistrationHoldExpired(parsed.holdExpiresAt)) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
};

export const saveRegistrationProgress = (
  key: string | null,
  draft: Omit<RegistrationProgressDraft, 'version' | 'updatedAt'>,
): void => {
  if (!key) {
    return;
  }
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  const payload: RegistrationProgressDraft = {
    ...draft,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Storage can be disabled or full. Registration should still work without resume.
  }
};

export const clearRegistrationProgress = (key: string | null): void => {
  if (!key) {
    return;
  }
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(key);
};
