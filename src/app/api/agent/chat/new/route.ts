import { NextRequest, NextResponse } from 'next/server';
import type { AgentChatLoadResponse } from '@/lib/agent/types';
import { getOptionalSession } from '@/lib/permissions';
import { assertAgentAvailable } from '@/server/agent/openai';
import { startNewAgentConversation } from '@/server/agent/conversations';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    assertAgentAvailable();
    const session = await getOptionalSession(req);
    const resolved = await startNewAgentConversation(session);
    const response = NextResponse.json({
      conversationId: resolved.conversationId,
      messages: [],
      pendingConfirmations: [],
      isGuest: resolved.owner.type === 'guest',
      canUseActions: resolved.owner.type === 'user',
    } satisfies AgentChatLoadResponse);
    resolved.setCookie?.(response);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('AI assistant new chat failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
