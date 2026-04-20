const DEFAULT_EVENT_CONTENT_DENYLIST = [
  'asshole',
  'bitch',
  'fuck',
  'fucking',
  'motherfucker',
  'shit',
  'kill yourself',
  'whore',
] as const;

type EventContentField = 'name' | 'description';

export type EventContentMatch = {
  field: EventContentField;
  term: string;
};

const normalizeTermList = (value: string): string[] => (
  Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
);

const getEventContentDenylist = (): string[] => {
  const configured = process.env.EVENT_CONTENT_DENYLIST?.trim();
  if (configured) {
    const entries = normalizeTermList(configured);
    if (entries.length > 0) {
      return entries;
    }
  }
  return [...DEFAULT_EVENT_CONTENT_DENYLIST];
};

const escapeRegex = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

const buildTermPattern = (term: string): RegExp => {
  const escaped = escapeRegex(term).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');
};

const collectMatches = (
  field: EventContentField,
  value: unknown,
  terms: string[],
): EventContentMatch[] => {
  if (typeof value !== 'string') {
    return [];
  }

  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  return terms
    .filter((term) => buildTermPattern(term).test(normalized))
    .map((term) => ({ field, term }));
};

export class EventContentFilterError extends Error {
  matches: EventContentMatch[];

  constructor(matches: EventContentMatch[]) {
    super('Event content contains blocked language.');
    this.name = 'EventContentFilterError';
    this.matches = matches;
  }
}

export const assertEventContentAllowed = (event: {
  name?: unknown;
  description?: unknown;
}) => {
  const terms = getEventContentDenylist();
  const matches = [
    ...collectMatches('name', event.name, terms),
    ...collectMatches('description', event.description, terms),
  ];

  if (matches.length > 0) {
    throw new EventContentFilterError(matches);
  }
};
