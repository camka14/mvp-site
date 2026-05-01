import type { AgentPageContext } from '@/lib/agent/types';
import type { AgentConversationOwner } from '../conversations';

const mockPrisma = {
  events: {
    findUnique: jest.fn(),
  },
  aiPendingConfirmation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn(),
}));

const { executeAgentTool, executePendingConfirmation } = require('../tools') as typeof import('../tools');

const userOwner: AgentConversationOwner = {
  type: 'user',
  userId: 'user-1',
  session: {
    userId: 'user-1',
    isAdmin: false,
    sessionVersion: 0,
    rawToken: 'session-token',
  },
};

const guestOwner: AgentConversationOwner = {
  type: 'guest',
  sessionId: 'guest-1',
};

const cleanScheduleContext: AgentPageContext = {
  pathname: '/events/event-1/schedule',
  auth: { isAuthenticated: true, isGuest: false },
  page: {
    kind: 'event_schedule',
    eventId: 'event-1',
    hasUnsavedChanges: false,
  },
};

const dirtyScheduleContext: AgentPageContext = {
  ...cleanScheduleContext,
  page: {
    ...cleanScheduleContext.page!,
    hasUnsavedChanges: true,
  },
};

describe('agent tools dispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.events.findUnique.mockResolvedValue({ name: 'Spring League' });
    mockPrisma.aiPendingConfirmation.create.mockResolvedValue({
      id: 'confirmation-1',
      toolName: 'update_event_match',
      summary: 'Update match match-1 for "Spring League". Fields: fieldId.',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
  });

  it('allows guest navigation read tools', async () => {
    const result = await executeAgentTool({
      name: 'get_site_navigation_help',
      args: { topic: 'schedule' },
      owner: guestOwner,
      conversationId: 'conv-1',
      pageContext: null,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('ok');
    expect(result.result.primaryRoutes).toBeDefined();
  });

  it('builds same-origin markdown links for navigation', async () => {
    const result = await executeAgentTool({
      name: 'build_site_link',
      args: { text: 'Discover', path: '/discover' },
      owner: guestOwner,
      conversationId: 'conv-1',
      pageContext: null,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('ok');
    expect(result.result.url).toBe('http://localhost:3000/discover');
    expect(result.result.markdown).toBe('[Discover](http://localhost:3000/discover)');
  });

  it('rejects external URLs when building navigation links', async () => {
    const result = await executeAgentTool({
      name: 'build_site_link',
      args: { text: 'Bad link', path: 'https://example.com/discover' },
      owner: guestOwner,
      conversationId: 'conv-1',
      pageContext: null,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('failed');
    expect(String(result.result.error)).toContain('same-site paths');
  });

  it('requires authentication for write tools', async () => {
    const result = await executeAgentTool({
      name: 'update_event_match',
      args: {
        eventId: 'event-1',
        matchId: 'match-1',
        updates: { fieldId: 'field-2' },
      },
      owner: guestOwner,
      conversationId: 'conv-1',
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('unauthorized');
    expect(mockPrisma.aiPendingConfirmation.create).not.toHaveBeenCalled();
  });

  it('creates pending confirmations for write tools before execution', async () => {
    const result = await executeAgentTool({
      name: 'update_event_match',
      args: {
        eventId: 'event-1',
        matchId: 'match-1',
        updates: { fieldId: 'field-2' },
      },
      owner: userOwner,
      conversationId: 'conv-1',
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('confirmation_required');
    expect(result.pendingConfirmation?.id).toBe('confirmation-1');
    expect(mockPrisma.aiPendingConfirmation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          openaiConversationId: 'conv-1',
          toolName: 'update_event_match',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('blocks pending write creation when schedule changes are unsaved', async () => {
    const result = await executeAgentTool({
      name: 'update_event_match',
      args: {
        eventId: 'event-1',
        matchId: 'match-1',
        updates: { fieldId: 'field-2' },
      },
      owner: userOwner,
      conversationId: 'conv-1',
      pageContext: dirtyScheduleContext,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('save_required');
    expect(mockPrisma.aiPendingConfirmation.create).not.toHaveBeenCalled();
  });

  it('rejects expired pending confirmations', async () => {
    mockPrisma.aiPendingConfirmation.findUnique.mockResolvedValue({
      id: 'confirmation-1',
      userId: 'user-1',
      sessionId: null,
      openaiConversationId: 'conv-1',
      toolName: 'update_event_match',
      args: { eventId: 'event-1', matchId: 'match-1', updates: { fieldId: 'field-2' } },
      status: 'PENDING',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const result = await executePendingConfirmation({
      confirmationId: 'confirmation-1',
      confirmed: true,
      conversationId: 'conv-1',
      owner: userOwner,
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
    });

    expect(result.status).toBe('expired');
    expect(mockPrisma.aiPendingConfirmation.update).toHaveBeenCalledWith({
      where: { id: 'confirmation-1' },
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
  });

  it('rejects confirmations from a different user', async () => {
    mockPrisma.aiPendingConfirmation.findUnique.mockResolvedValue({
      id: 'confirmation-1',
      userId: 'someone-else',
      sessionId: null,
      openaiConversationId: 'conv-1',
      toolName: 'update_event_match',
      args: { eventId: 'event-1', matchId: 'match-1', updates: { fieldId: 'field-2' } },
      status: 'PENDING',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const result = await executePendingConfirmation({
      confirmationId: 'confirmation-1',
      confirmed: true,
      conversationId: 'conv-1',
      owner: userOwner,
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
    });

    expect(result.status).toBe('failed');
    expect(mockPrisma.aiPendingConfirmation.update).not.toHaveBeenCalled();
  });

  it('surfaces permission failures from underlying event APIs without mutation success', async () => {
    mockPrisma.aiPendingConfirmation.findUnique.mockResolvedValue({
      id: 'confirmation-1',
      userId: 'user-1',
      sessionId: null,
      openaiConversationId: 'conv-1',
      toolName: 'update_event_match',
      args: { eventId: 'event-1', matchId: 'match-1', updates: { fieldId: 'field-2' } },
      status: 'PENDING',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    global.fetch = jest.fn().mockResolvedValue(
      {
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Forbidden' })),
      },
    );

    const result = await executePendingConfirmation({
      confirmationId: 'confirmation-1',
      confirmed: true,
      conversationId: 'conv-1',
      owner: userOwner,
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
    });

    expect(result.status).toBe('failed');
    expect(result.reply).toBe('Forbidden');
    expect(mockPrisma.aiPendingConfirmation.update).toHaveBeenCalledWith({
      where: { id: 'confirmation-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });
});
