import { inferAffiliateParticipantAvailability, parseAffiliateMaxParticipants } from '../participantAvailability';

describe('affiliate participant availability parsing', () => {
  it('does not treat currency prices as max participants', () => {
    expect(parseAffiliateMaxParticipants('$300 per team before August 10')).toBeNull();
    expect(parseAffiliateMaxParticipants('Registration is $300 per team and $350 after August 11.')).toBeNull();
    expect(inferAffiliateParticipantAvailability({
      description: 'Registration is $300 per team before August 10 and $350 per team after August 11.',
      participantOptionsText: 'Team registration',
    })).toEqual({
      maxParticipants: null,
      currentParticipants: null,
      spotsRemaining: null,
    });
  });

  it('still parses explicit source capacity text', () => {
    expect(parseAffiliateMaxParticipants('Up to 42 players play on 3 nets.')).toBe(42);
    expect(parseAffiliateMaxParticipants('Teams have 3-5 players.')).toBe(5);
  });
});
