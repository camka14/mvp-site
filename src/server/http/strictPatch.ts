type RecordLike = Record<string, unknown>;

export const asRecord = (value: unknown): RecordLike | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as RecordLike;
};

export const parseStrictEnvelope = (params: {
  body: unknown;
  envelopeKey: string;
  allowedTopLevelKeys?: string[];
}): {
  payload: RecordLike;
  topLevel: RecordLike;
} | {
  error: string;
  details?: RecordLike;
} => {
  const allowedTopLevelKeys = new Set<string>([
    params.envelopeKey,
    ...(params.allowedTopLevelKeys ?? []),
  ]);
  const topLevel = asRecord(params.body);
  if (!topLevel) {
    return { error: 'Invalid input: request body must be an object.' };
  }

  const unknownTopLevelKeys = Object.keys(topLevel)
    .filter((key) => !allowedTopLevelKeys.has(key));
  if (unknownTopLevelKeys.length) {
    return {
      error: 'Invalid input: unknown top-level keys.',
      details: { unknownKeys: unknownTopLevelKeys },
    };
  }

  const payload = asRecord(topLevel[params.envelopeKey]);
  if (!payload) {
    return {
      error: `Invalid input: "${params.envelopeKey}" object is required.`,
    };
  }

  return { payload, topLevel };
};

export const findUnknownKeys = (
  payload: RecordLike,
  allowedKeys: Iterable<string>,
): string[] => {
  const allowed = new Set<string>(allowedKeys);
  return Object.keys(payload).filter((key) => !allowed.has(key));
};

export const findPresentKeys = (
  payload: RecordLike,
  keys: Iterable<string>,
): string[] => {
  const target = new Set<string>(keys);
  return Object.keys(payload).filter((key) => target.has(key));
};
