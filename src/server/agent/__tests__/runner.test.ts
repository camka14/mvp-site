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
    const reply = 'In the left sidebar or top navigation, click Discover (path: `/discover`).';

    const sanitized = sanitizeAssistantReply(reply, 'http://localhost:3000');

    expect(sanitized).toContain('top navigation bar');
    expect(sanitized).toContain('[Discover](http://localhost:3000/discover)');
    expect(sanitized).not.toContain('`/discover`');
    expect(sanitized).not.toContain('path:');
    expect(sanitized).not.toContain('left sidebar');
  });
});
