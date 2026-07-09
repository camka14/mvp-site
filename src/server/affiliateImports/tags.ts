import { normalizeEventTagInputs } from '@/server/eventTags';

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const splitTagText = (value: unknown): string[] => {
  const text = nullableString(value);
  if (!text) return [];
  return text
    .split(/[,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeTagList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return normalizeEventTagInputs(value);
  }
  return normalizeEventTagInputs(splitTagText(value));
};

const objectRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const compactStringValues = (values: unknown[]): string[] => (
  values
    .map((value) => nullableString(value))
    .filter((value): value is string => Boolean(value))
);

export const affiliateCandidateExplicitTagNames = (candidate: Record<string, unknown>): string[] => {
  const rawPayload = objectRecord(candidate.rawPayload);
  const extractedFields = objectRecord(rawPayload?.extractedFields);
  const detailPage = objectRecord(rawPayload?.detailPage);
  const detailFields = objectRecord(detailPage?.extractedFields);
  const normalizedImport = objectRecord(rawPayload?.normalizedImport);

  return normalizeEventTagInputs([
    ...normalizeTagList(candidate.tags),
    ...normalizeTagList(candidate.tagText),
    ...normalizeTagList(rawPayload?.tags),
    ...normalizeTagList(normalizedImport?.tags),
    ...normalizeTagList(normalizedImport?.tagText),
    ...normalizeTagList(extractedFields?.tags),
    ...normalizeTagList(extractedFields?.tagText),
    ...normalizeTagList(detailFields?.tags),
    ...normalizeTagList(detailFields?.tagText),
  ]);
};

const affiliateCandidateTagText = (candidate: Record<string, unknown>): string => {
  const rawPayload = objectRecord(candidate.rawPayload);
  const extractedFields = objectRecord(rawPayload?.extractedFields);
  const detailPage = objectRecord(rawPayload?.detailPage);
  const detailFields = objectRecord(detailPage?.extractedFields);
  const normalizedImport = objectRecord(rawPayload?.normalizedImport);

  return compactStringValues([
    candidate.title,
    candidate.name,
    candidate.formatLabel,
    candidate.formatName,
    candidate.statusText,
    candidate.divisionText,
    candidate.skillLevel,
    candidate.sportName,
    candidate.ageGroup,
    candidate.scheduleText,
    candidate.participantOptionsText,
    candidate.registrationType,
    normalizedImport?.title,
    normalizedImport?.name,
    normalizedImport?.formatLabel,
    normalizedImport?.formatName,
    normalizedImport?.statusText,
    normalizedImport?.divisionText,
    normalizedImport?.skillLevel,
    normalizedImport?.sportName,
    normalizedImport?.ageGroup,
    normalizedImport?.scheduleText,
    normalizedImport?.participantOptionsText,
    normalizedImport?.registrationType,
    extractedFields?.title,
    extractedFields?.formatLabel,
    extractedFields?.statusText,
    extractedFields?.divisionText,
    extractedFields?.skillLevel,
    extractedFields?.ageGroup,
    extractedFields?.scheduleText,
    extractedFields?.participantOptionsText,
    extractedFields?.registrationType,
    detailFields?.title,
    detailFields?.formatLabel,
    detailFields?.statusText,
    detailFields?.divisionText,
    detailFields?.skillLevel,
    detailFields?.ageGroup,
    detailFields?.scheduleText,
    detailFields?.participantOptionsText,
    detailFields?.registrationType,
  ])
    .join(' ')
    .toLowerCase();
};

const affiliateCandidateSupplementalText = (candidate: Record<string, unknown>): string => {
  const rawPayload = objectRecord(candidate.rawPayload);
  const extractedFields = objectRecord(rawPayload?.extractedFields);
  const detailPage = objectRecord(rawPayload?.detailPage);
  const detailFields = objectRecord(detailPage?.extractedFields);
  const normalizedImport = objectRecord(rawPayload?.normalizedImport);

  return compactStringValues([
    candidate.description,
    normalizedImport?.description,
    extractedFields?.description,
    detailFields?.description,
  ])
    .join(' ')
    .toLowerCase();
};

export const inferAffiliateEventTagNames = (
  candidate: Record<string, unknown>,
  options: {
    eventType?: unknown;
    listingKind?: unknown;
  } = {},
): string[] => {
  const tags = [...affiliateCandidateExplicitTagNames(candidate)];
  const addTag = (name: string) => {
    if (!tags.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
      tags.push(name);
    }
  };
  const removeTag = (name: string) => {
    const normalizedName = name.toLowerCase();
    for (let index = tags.length - 1; index >= 0; index -= 1) {
      if (tags[index].toLowerCase() === normalizedName) {
        tags.splice(index, 1);
      }
    }
  };

  const listingKind = nullableString(options.listingKind ?? candidate.listingKind)?.toUpperCase();
  if (listingKind === 'RENTAL') {
    addTag('Rental');
  }

  const eventType = nullableString(options.eventType ?? candidate.eventType)?.toUpperCase();
  const eventTypeIsLeague = eventType === 'LEAGUE';
  const eventTypeIsTournament = eventType === 'TOURNAMENT';
  if (eventType === 'LEAGUE') {
    removeTag('Tournament');
    addTag('League');
  } else if (eventType === 'TOURNAMENT') {
    removeTag('League');
    addTag('Tournament');
  }

  const text = affiliateCandidateTagText(candidate);
  const supplementalText = affiliateCandidateSupplementalText(candidate);
  const allText = `${text} ${supplementalText}`;
  const socialLike = /\bsocial event\b|\badult social\b|\bfamily field day\b|\bmember appreciation\b|\bholiday party\b/.test(text);
  if (socialLike) {
    addTag('Social Event');
  }
  if (!/\bpre[-\s]?tryout\b/.test(allText) && /\btry[-\s]?outs?\b|\bevaluations?\b/.test(allText)) {
    addTag('Tryouts');
  }
  if (!socialLike && /\bcamps?\b/.test(text) && !/\bcamp\s+recs\b/.test(text)) {
    addTag('Camp');
  }
  const clinicLike = (
    /\bclinics?\b|\bclasses?\b|\blessons?\b|\btraining sessions?\b/.test(text)
    || /\b(?:rookie|skills?|technical|player|elite|team|youth)\s+(?:level\s+)?(?:class|academy|training|institute)\b/.test(text)
    || /\b(?:technical|player|youth)\s+development\s+academy\b/.test(text)
    || /\bcoaching\s+programs?\b/.test(text)
    || /\bbeginner\s+programs?\b/.test(text)
    || /\byda\b/.test(text)
    || /\b(?:class|training)\b/.test(text)
    || /\bclass\b/.test(supplementalText)
  );
  if (!socialLike && clinicLike) {
    addTag('Clinic');
  }
  const openPlayLike = (
    /\bopen\s+(?:gym|play|court|field|run)\b|\bdrop[-\s]?in\b|\bteam\s+play\b|\bfree\s+play\b/.test(text)
    || /\bgroup\s+play\b|\bguided\s+(?:beginner\s+)?play\b|\bround\s+robin\b|\bwin\s+up\s+lose\s+down\b/.test(text)
    || /\bking\s+of\s+the\s+court\b|\bqueen\s+of\s+the\s+court\b/.test(text)
    || /\bhalf\s+price\s+(?:night|monday|mondays)\b/.test(text)
    || /\borganized\s+play\b|\bclub\s+play\b|\bpark\s+play\b|\bverified\s+play\b|\bdaily\s+programs?\b/.test(text)
  );
  if (openPlayLike) {
    addTag('Open Play');
  }
  const leagueGameLike = /\bleague\s+(?:basketball\s+)?game\b|\bcity\s+league\b/.test(text);
  const leagueLike = !leagueGameLike && (
    /\bleagues?\b/.test(text)
    || /\bhouse\s+team\s+registration\b/.test(text)
    || /\bdoubles?\s+flights?\b/.test(text)
  );
  if (leagueLike && !eventTypeIsTournament) {
    addTag('League');
  }
  if (!eventTypeIsLeague && /\btournaments?\b|\bchampionships?\b|\bclassic\b|\bcup\b/.test(text)) {
    addTag('Tournament');
  }
  const classLike = clinicLike || /\bcamps?\b/.test(text);
  if (
    /\bpick[-\s]?up\b|\bpick\s+to\s+play\b|\bfriendly\s+matches?\b|\bfriendly\s+games?\b|\bdrop[-\s]?in\s+games?\b|\bcooperative\s+game\b|\bmasters?\s+game\b/.test(text)
    || leagueGameLike
    || (!classLike && /\bscrimmages?\b/.test(text))
  ) {
    addTag('Pickup Game');
  }

  return normalizeEventTagInputs(tags);
};
