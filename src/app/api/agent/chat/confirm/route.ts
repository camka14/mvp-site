import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { AgentConfirmResponse, AgentPageContext } from '@/lib/agent/types';
import { getOptionalSession } from '@/lib/permissions';
import { assertAgentAvailable, getOpenAiClient } from '@/server/agent/openai';
import { resolveAgentConversation } from '@/server/agent/conversations';
import { executePendingConfirmation } from '@/server/agent/tools';
import { getRequestOrigin } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

const pageContextSchema = z.object({
  pathname: z.string(),
  auth: z.object({
    isAuthenticated: z.boolean(),
    isGuest: z.boolean(),
  }),
  page: z.record(z.string(), z.unknown()).nullable().optional(),
}).passthrough();

const confirmSchema = z.object({
  confirmationId: z.string().min(1),
  confirmed: z.boolean().default(true),
  pageContext: pageContextSchema.nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertAgentAvailable();
    const body = await req.json().catch(() => null);
    const parsed = confirmSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const session = await getOptionalSession(req);
    const resolved = await resolveAgentConversation(req, session);
    const result = await executePendingConfirmation({
      confirmationId: parsed.data.confirmationId,
      confirmed: parsed.data.confirmed,
      conversationId: resolved.conversationId,
      owner: resolved.owner,
      pageContext: (parsed.data.pageContext ?? null) as AgentPageContext | null,
      origin: getRequestOrigin(req),
    });
    await getOpenAiClient().conversations.items.create(resolved.conversationId, {
      items: [
        {
          role: 'assistant',
          content: result.reply,
        },
      ],
    } as any).catch((appendError) => {
      console.warn('Failed to append AI confirmation result to conversation', appendError);
    });

    const response = NextResponse.json({
      reply: result.reply,
      status: result.status,
      changes: result.changes,
    } satisfies AgentConfirmResponse);
    resolved.setCookie?.(response);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('AI assistant confirmation failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
