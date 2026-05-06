jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn(),
}));

jest.mock('../openai', () => ({
  getAgentModel: jest.fn(),
  getOpenAiClient: jest.fn(),
}));

const { buildInstructions, sanitizeAssistantReply } = require('../runner') as typeof import('../runner');

describe('agent runner reply sanitation', () => {
  it('replaces leaked navigation paths with same-origin markdown links', () => {
    const reply = 'Click Discover (path: `/discover`).';

    const sanitized = sanitizeAssistantReply(reply, 'http://localhost:3000');

    expect(sanitized).toContain('[Discover](http://localhost:3000/discover)');
    expect(sanitized).not.toContain('`/discover`');
    expect(sanitized).not.toContain('path:');
  });

  it('redacts leaked object IDs from assistant replies', () => {
    const rawMatchId = '18d2cdc7-b319-4aef-a132-a2fb804f7219';

    const sanitized = sanitizeAssistantReply(
      `Update match ${rawMatchId} for "Northside Spring Volleyball League". Fields: start, end`,
      'http://localhost:3000',
    );

    expect(sanitized).toBe('Update the selected match for "Northside Spring Volleyball League". Fields: start, end');
    expect(sanitized).not.toContain(rawMatchId);
  });
});

describe('agent runner event form context', () => {
  const guestOwner = { type: 'guest', sessionId: 'guest_1' } as const;

  it('advertises the EventForm lookup tool on the event details tab without embedding the full JSON', () => {
    const instructions = buildInstructions(guestOwner, {
      pathname: '/events/event_1/schedule',
      auth: {
        isAuthenticated: false,
        isGuest: true,
      },
      page: {
        kind: 'event_schedule',
        activeTab: 'details',
        eventId: 'event_1',
      },
    });

    expect(instructions).toContain('call get_event_form_context instead of guessing');
    expect(instructions).toContain('When get_event_form_context returns matchedCapabilities');
    expect(instructions).toContain('available through get_event_form_context');
    expect(instructions).not.toContain('"sourceComponent": "src/app/events/[id]/schedule/components/EventForm.tsx"');
    expect(instructions).not.toContain('"path": "leagueSlots"');
  });

  it('marks EventForm lookup unavailable on other event schedule tabs', () => {
    const instructions = buildInstructions(guestOwner, {
      pathname: '/events/event_1/schedule',
      auth: {
        isAuthenticated: false,
        isGuest: true,
      },
      page: {
        kind: 'event_schedule',
        activeTab: 'schedule',
        eventId: 'event_1',
      },
    });

    expect(instructions).toContain('not available because the current page/tab is not the event Details tab');
    expect(instructions).not.toContain('"path": "leagueSlots"');
  });
});
