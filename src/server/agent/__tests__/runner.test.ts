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

const { sanitizeAssistantReply } = require('../runner') as typeof import('../runner');

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
