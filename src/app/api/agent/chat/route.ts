import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalSession } from '@/lib/permissions';
import type { AgentChatLoadResponse, AgentChatSendResponse, AgentPageContext } from '@/lib/agent/types';
import { assertAgentAvailable, getOpenAiClient } from '@/server/agent/openai';
import { resolveAgentConversation } from '@/server/agent/conversations';
import { conversationItemsToMessages, runAgentTurn } from '@/server/agent/runner';
import { listPendingConfirmations } from '@/server/agent/tools';
import { getRequestOrigin } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

const pageContextSchema = z.object({
  pathname: z.string(),
  auth: z.object({
    isAuthenticated: z.boolean(),
    isGuest: z.boolean(),
  }),
  page: z.object({
    kind: z.enum(['event_schedule', 'generic']),
    title: z.string().nullable().optional(),
    eventId: z.string().nullable().optional(),
    eventName: z.string().nullable().optional(),
    eventType: z.string().nullable().optional(),
    activeTab: z.string().nullable().optional(),
    selectedOccurrence: z.object({
      slotId: z.string().nullable().optional(),
      occurrenceDate: z.string().nullable().optional(),
    }).nullable().optional(),
    canManageEvent: z.boolean().optional(),
    canEditMatches: z.boolean().optional(),
    hasUnsavedChanges: z.boolean().optional(),
    matchCount: z.number().optional(),
    participantCount: z.number().optional(),
    teamCount: z.number().optional(),
  }).nullable().optional(),
});

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
  pageContext: pageContextSchema.nullable().optional(),
});

const loadConversationMessages = async (conversationId: string) => {
  const page = await getOpenAiClient().conversations.items.list(conversationId, {
    order: 'asc',
    limit: 100,
  } as any);
  const items = Array.isArray((page as any).data) ? (page as any).data : [];
  return conversationItemsToMessages(items);
};

export async function GET(req: NextRequest) {
  try {
    assertAgentAvailable();
    const session = await getOptionalSession(req);
    const resolved = await resolveAgentConversation(req, session);
    const [messages, pendingConfirmations] = await Promise.all([
      loadConversationMessages(resolved.conversationId),
      listPendingConfirmations(resolved.conversationId, resolved.owner),
    ]);

    const response = NextResponse.json({
      conversationId: resolved.conversationId,
      messages,
      pendingConfirmations,
      isGuest: resolved.owner.type === 'guest',
      canUseActions: resolved.owner.type === 'user',
    } satisfies AgentChatLoadResponse);
    resolved.setCookie?.(response);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('AI assistant load failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertAgentAvailable();
    const body = await req.json().catch(() => null);
    const parsed = sendSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const session = await getOptionalSession(req);
    const resolved = await resolveAgentConversation(req, session);
    const pageContext = (parsed.data.pageContext ?? null) as AgentPageContext | null;
    const result = await runAgentTurn({
      conversationId: resolved.conversationId,
      owner: resolved.owner,
      message: parsed.data.message,
      pageContext,
      origin: getRequestOrigin(req),
    });
    const pendingConfirmations = await listPendingConfirmations(resolved.conversationId, resolved.owner);

    const response = NextResponse.json({
      conversationId: resolved.conversationId,
      reply: result.reply,
      pendingConfirmations,
      changes: result.changes,
    } satisfies AgentChatSendResponse);
    resolved.setCookie?.(response);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('AI assistant message failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
