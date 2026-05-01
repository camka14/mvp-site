import type { AgentPageContext } from '@/lib/agent/types';
import type { AgentConversationOwner } from '../conversations';

const mockPrisma = {
  events: {
    findUnique: jest.fn(),
  },
  matches: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
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
const { canManageEvent } = require('@/server/accessControl') as { canManageEvent: jest.Mock };

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
    canEditMatches: true,
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
    canManageEvent.mockResolvedValue(true);
    mockPrisma.matches.findUnique.mockResolvedValue({
      matchId: 7,
      team1Id: 'team_alpha_private_id',
      team2Id: 'team_bravo_private_id',
    });
    mockPrisma.teams.findMany.mockResolvedValue([
      { id: 'team_alpha_private_id', name: 'Alpha' },
      { id: 'team_bravo_private_id', name: 'Bravo' },
    ]);
    mockPrisma.teams.findUnique.mockResolvedValue({ name: 'Alpha' });
    mockPrisma.userData.findUnique.mockResolvedValue({ firstName: 'Taylor', lastName: 'Player', userName: 'taylor' });
    mockPrisma.aiPendingConfirmation.create.mockImplementation(async ({ data }: any) => ({
      id: 'confirmation-1',
      toolName: data.toolName,
      summary: data.summary,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    }));
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

  it('returns a page layout description for the current route', async () => {
    const result = await executeAgentTool({
      name: 'get_page_layout_description',
      args: {},
      owner: userOwner,
      conversationId: 'conv-1',
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('ok');
    expect((result.result.page as any).key).toBe('event_schedule');
    expect(result.result.clickableGridJson).toEqual(expect.stringContaining('"Manage"'));
  });

  it('matches dynamic page layout patterns from an explicit pathname', async () => {
    const result = await executeAgentTool({
      name: 'get_page_layout_description',
      args: { pathname: '/organizations/org-1' },
      owner: userOwner,
      conversationId: 'conv-1',
      pageContext: null,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('ok');
    expect((result.result.page as any).key).toBe('organization_detail');
  });

  it('requires authentication for write tools', async () => {
    const result = await executeAgentTool({
      name: 'stage_event_match_draft_update',
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

  it('returns client draft actions for schedule match updates', async () => {
    const rawMatchId = '18d2cdc7-b319-4aef-a132-a2fb804f7219';
    const result = await executeAgentTool({
      name: 'stage_event_match_draft_update',
      args: {
        eventId: 'event-1',
        matchId: rawMatchId,
        updates: { fieldId: 'field-2' },
      },
      owner: userOwner,
      conversationId: 'conv-1',
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
      mode: 'prepare',
    });

    expect(result.result.status).toBe('client_action');
    expect(result.clientActions).toEqual([
      expect.objectContaining({
        type: 'schedule.match.update',
        eventId: 'event-1',
        matchId: rawMatchId,
        updates: { fieldId: 'field-2' },
        summary: 'Update match #7 - Alpha vs Bravo for "Spring League". Fields: field.',
      }),
    ]);
    expect(String(result.result.summary)).not.toContain(rawMatchId);
    expect(mockPrisma.aiPendingConfirmation.create).not.toHaveBeenCalled();
  });

  it('allows client draft actions when schedule changes are already unsaved', async () => {
    const result = await executeAgentTool({
      name: 'stage_event_match_draft_update',
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

    expect(result.result.status).toBe('client_action');
    expect(result.clientActions).toHaveLength(1);
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

  it('blocks legacy confirmed direct database writes', async () => {
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
    global.fetch = jest.fn();

    const result = await executePendingConfirmation({
      confirmationId: 'confirmation-1',
      confirmed: true,
      conversationId: 'conv-1',
      owner: userOwner,
      pageContext: cleanScheduleContext,
      origin: 'http://localhost:3000',
    });

    expect(result.status).toBe('failed');
    expect(result.reply).toContain('Direct assistant database writes are disabled');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPrisma.aiPendingConfirmation.update).toHaveBeenCalledWith({
      where: { id: 'confirmation-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('blocks direct database tool calls even outside confirmation flow', async () => {
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

    expect(result.result.status).toBe('failed');
    expect(String(result.result.error)).toContain('Direct assistant database writes are disabled');
    expect(mockPrisma.aiPendingConfirmation.create).not.toHaveBeenCalled();
  });

  it('rejects draft actions when the user cannot manage the event', async () => {
    canManageEvent.mockResolvedValue(false);

    const result = await executeAgentTool({
      name: 'stage_event_match_draft_update',
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

    expect(result.result.status).toBe('unauthorized');
    expect(result.clientActions).toBeUndefined();
    expect(mockPrisma.aiPendingConfirmation.create).not.toHaveBeenCalled();
  });
});
