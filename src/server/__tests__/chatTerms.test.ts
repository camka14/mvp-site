import {
  buildChatTermsPayload,
  CHAT_TERMS_VERSION,
  hasAcceptedCurrentChatTerms,
} from '@/server/chatTerms';

describe('chatTerms', () => {
  it('accepts only the current version with a recorded acceptance timestamp', () => {
    expect(hasAcceptedCurrentChatTerms(null)).toBe(false);
    expect(hasAcceptedCurrentChatTerms({
      chatTermsVersion: 'older-version',
      chatTermsAcceptedAt: new Date('2026-04-14T12:00:00.000Z'),
    })).toBe(false);
    expect(hasAcceptedCurrentChatTerms({
      chatTermsVersion: CHAT_TERMS_VERSION,
      chatTermsAcceptedAt: null,
    })).toBe(false);
    expect(hasAcceptedCurrentChatTerms({
      chatTermsVersion: CHAT_TERMS_VERSION,
      chatTermsAcceptedAt: new Date('2026-04-14T12:00:00.000Z'),
    })).toBe(true);
  });

  it('builds a payload that reflects the current acceptance state', () => {
    const acceptedAt = '2026-04-14T12:00:00.000Z';
    expect(buildChatTermsPayload({
      chatTermsVersion: CHAT_TERMS_VERSION,
      chatTermsAcceptedAt: acceptedAt,
    })).toEqual(expect.objectContaining({
      version: CHAT_TERMS_VERSION,
      accepted: true,
      acceptedAt,
    }));

    expect(buildChatTermsPayload({
      chatTermsVersion: 'older-version',
      chatTermsAcceptedAt: acceptedAt,
    })).toEqual(expect.objectContaining({
      accepted: false,
      acceptedAt,
    }));
  });
});
