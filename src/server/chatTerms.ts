export const CHAT_TERMS_VERSION = '2026-04-14';
export const CHAT_TERMS_PATH = '/terms';
export const CHAT_TERMS_REQUIRED_CODE = 'CHAT_TERMS_REQUIRED';

export const CHAT_TERMS_SUMMARY = [
  'Creating chats or events requires agreement to the Bracket IQ Terms and EULA.',
  'There is no tolerance for objectionable content or abusive users.',
  'Users can report chats, events, and abusive users, and moderation acts on reports within 24 hours.',
  'Blocking a user can immediately remove shared chats from the blocker’s feed.',
] as const;

type ChatTermsUser = {
  chatTermsVersion?: string | null;
  chatTermsAcceptedAt?: Date | string | null;
};

export const hasAcceptedCurrentChatTerms = (user: ChatTermsUser | null | undefined): boolean => {
  if (!user) return false;
  if (user.chatTermsVersion !== CHAT_TERMS_VERSION) return false;
  return Boolean(user.chatTermsAcceptedAt);
};

export const buildChatTermsPayload = (user: ChatTermsUser | null | undefined) => ({
  version: CHAT_TERMS_VERSION,
  url: CHAT_TERMS_PATH,
  summary: [...CHAT_TERMS_SUMMARY],
  accepted: hasAcceptedCurrentChatTerms(user),
  acceptedAt: user?.chatTermsAcceptedAt ?? null,
});

export const buildChatTermsRequiredPayload = () => ({
  error: 'Terms and EULA consent required.',
  code: CHAT_TERMS_REQUIRED_CODE,
  version: CHAT_TERMS_VERSION,
  url: CHAT_TERMS_PATH,
});
