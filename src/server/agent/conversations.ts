import { randomUUID } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/permissions';
import { getOpenAiClient } from './openai';

const GUEST_COOKIE_NAME = 'biq_ai_guest';
const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AgentConversationOwner =
  | { type: 'user'; userId: string; session: AuthContext }
  | { type: 'guest'; sessionId: string };

type GuestConversationToken = {
  conversationId: string;
  sessionId: string;
};

const getCookieSecret = (): string => {
  const secret = process.env.OPENAI_AGENT_COOKIE_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('OPENAI_AGENT_COOKIE_SECRET or AUTH_SECRET is required for guest AI chat.');
  }
  return secret;
};

const signGuestConversation = (payload: GuestConversationToken): string => (
  jwt.sign(payload, getCookieSecret(), { expiresIn: GUEST_COOKIE_MAX_AGE_SECONDS })
);

const verifyGuestConversation = (token: string | undefined): GuestConversationToken | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getCookieSecret()) as JwtPayload;
    const conversationId = typeof decoded.conversationId === 'string' ? decoded.conversationId : '';
    const sessionId = typeof decoded.sessionId === 'string' ? decoded.sessionId : '';
    if (!conversationId || !sessionId) {
      return null;
    }
    return { conversationId, sessionId };
  } catch {
    return null;
  }
};

const createOpenAiConversation = async (owner: Pick<AgentConversationOwner, 'type'> & { userId?: string; sessionId?: string }) => {
  const client = getOpenAiClient();
  return client.conversations.create({
    metadata: {
      app: 'bracketiq',
      owner_type: owner.type,
      ...(owner.type === 'user' && owner.userId ? { bracketiq_user_id: owner.userId } : {}),
      ...(owner.type === 'guest' && owner.sessionId ? { guest_session_id: owner.sessionId } : {}),
    },
  });
};

const ensureConversationExists = async (conversationId: string): Promise<boolean> => {
  try {
    await getOpenAiClient().conversations.retrieve(conversationId);
    return true;
  } catch {
    return false;
  }
};

export const resolveAgentConversation = async (
  req: NextRequest,
  session: AuthContext | null,
): Promise<{
  conversationId: string;
  owner: AgentConversationOwner;
  setCookie?: (response: NextResponse) => void;
}> => {
  const now = new Date();

  if (session) {
    const delegate = (prisma as any).aiConversationPointer;
    const existing = await delegate.findUnique({
      where: { userId: session.userId },
      select: { openaiConversationId: true },
    });

    let conversationId = existing?.openaiConversationId as string | undefined;
    if (!conversationId || !(await ensureConversationExists(conversationId))) {
      const conversation = await createOpenAiConversation({ type: 'user', userId: session.userId });
      conversationId = conversation.id;
      await delegate.upsert({
        where: { userId: session.userId },
        create: {
          userId: session.userId,
          openaiConversationId: conversationId,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        },
        update: {
          openaiConversationId: conversationId,
          updatedAt: now,
          lastOpenedAt: now,
        },
      });
    } else {
      await delegate.update({
        where: { userId: session.userId },
        data: { lastOpenedAt: now, updatedAt: now },
      });
    }

    return {
      conversationId,
      owner: { type: 'user', userId: session.userId, session },
    };
  }

  const verified = verifyGuestConversation(req.cookies.get(GUEST_COOKIE_NAME)?.value);
  let sessionId = verified?.sessionId ?? randomUUID();
  let conversationId = verified?.conversationId;
  if (!conversationId || !(await ensureConversationExists(conversationId))) {
    const conversation = await createOpenAiConversation({ type: 'guest', sessionId });
    conversationId = conversation.id;
  }

  const token = signGuestConversation({ conversationId, sessionId });
  return {
    conversationId,
    owner: { type: 'guest', sessionId },
    setCookie: (response) => {
      response.cookies.set(GUEST_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
      });
    },
  };
};

export const startNewAgentConversation = async (
  session: AuthContext | null,
): Promise<{
  conversationId: string;
  owner: AgentConversationOwner;
  setCookie?: (response: NextResponse) => void;
}> => {
  const now = new Date();
  if (session) {
    const conversation = await createOpenAiConversation({ type: 'user', userId: session.userId });
    await (prisma as any).aiConversationPointer.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        openaiConversationId: conversation.id,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      },
      update: {
        openaiConversationId: conversation.id,
        updatedAt: now,
        lastOpenedAt: now,
      },
    });
    return {
      conversationId: conversation.id,
      owner: { type: 'user', userId: session.userId, session },
    };
  }

  const sessionId = randomUUID();
  const conversation = await createOpenAiConversation({ type: 'guest', sessionId });
  const token = signGuestConversation({ conversationId: conversation.id, sessionId });
  return {
    conversationId: conversation.id,
    owner: { type: 'guest', sessionId },
    setCookie: (response) => {
      response.cookies.set(GUEST_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
      });
    },
  };
};
