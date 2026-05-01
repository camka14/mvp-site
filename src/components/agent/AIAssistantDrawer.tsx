'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { Bot, Check, Loader2, MessageSquare, Plus, Send, X } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useAgentContext } from '@/context/AgentContext';
import { MarkdownMessageContent } from '@/components/agent/MarkdownMessageContent';
import type {
  AgentChatLoadResponse,
  AgentChatMessage,
  AgentChatSendResponse,
  AgentConfirmResponse,
  AgentPageContext,
  AgentPendingConfirmation,
} from '@/lib/agent/types';

const INTRO_MESSAGE: AgentChatMessage = {
  id: 'intro',
  role: 'assistant',
  content: 'Ask me how to navigate BracketIQ or draft event schedule changes. Draft changes appear on the page for you to save or discard.',
};

const readJsonResponse = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : response.statusText || 'AI request failed.');
  }
  return body as T;
};

type AIAssistantDrawerProps = {
  enabled?: boolean;
};

export function AIAssistantDrawer({ enabled = true }: AIAssistantDrawerProps) {
  const pathname = usePathname();
  const { loading: authLoading, isAuthenticated, isGuest } = useApp();
  const {
    activePageContext,
    closeAssistant,
    dispatchClientActions,
    isAssistantOpen,
    refreshActivePage,
  } = useAgentContext();
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingConfirmations, setPendingConfirmations] = useState<AgentPendingConfirmation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const pageContext = useMemo<AgentPageContext>(() => ({
    pathname: pathname ?? '/',
    auth: {
      isAuthenticated: authLoading ? false : isAuthenticated,
      isGuest: authLoading ? false : isGuest,
    },
    page: activePageContext,
  }), [activePageContext, authLoading, isAuthenticated, isGuest, pathname]);

  const visibleMessages = messages.length > 0 ? messages : [INTRO_MESSAGE];

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, pendingConfirmations, sending]);

  const loadConversation = useCallback(async () => {
    if (!enabled) {
      setLoaded(true);
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/chat', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await readJsonResponse<AgentChatLoadResponse>(response);
      setMessages(data.messages);
      setPendingConfirmations(data.pendingConfirmations);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load AI chat.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!isAssistantOpen || loaded || loading) return;
    void loadConversation();
  }, [isAssistantOpen, loadConversation, loaded, loading]);

  const handleNewChat = useCallback(async () => {
    if (!enabled) {
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/chat/new', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJsonResponse<AgentChatLoadResponse>(response);
      setMessages(data.messages);
      setPendingConfirmations(data.pendingConfirmations);
      setLoaded(true);
    } catch (newChatError) {
      setError(newChatError instanceof Error ? newChatError.message : 'Failed to start a new chat.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
      },
    ]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!enabled) {
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }

    setInput('');
    setSending(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      },
    ]);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text, pageContext }),
      });
      const data = await readJsonResponse<AgentChatSendResponse>(response);
      appendAssistantMessage(data.reply || 'Done.');
      setPendingConfirmations(data.pendingConfirmations);
      const clientActions = data.clientActions ?? [];
      if (clientActions.length > 0) {
        const dispatchResult = await dispatchClientActions(clientActions);
        if (dispatchResult.errors.length > 0) {
          appendAssistantMessage(`I could not apply the draft changes: ${dispatchResult.errors.join(' ')}`);
        }
      }
      if (data.changes.length > 0) {
        await refreshActivePage();
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Failed to send message.';
      appendAssistantMessage(`Error: ${message}`);
      setError(message);
    } finally {
      setSending(false);
    }
  }, [appendAssistantMessage, dispatchClientActions, enabled, input, pageContext, refreshActivePage, sending]);

  const handleConfirm = useCallback(async (confirmationId: string, confirmed: boolean) => {
    if (!enabled) {
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }
    setConfirmingId(confirmationId);
    setError(null);
    try {
      const response = await fetch('/api/agent/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmationId, confirmed, pageContext }),
      });
      const data = await readJsonResponse<AgentConfirmResponse>(response);
      appendAssistantMessage(data.reply);
      if (data.status !== 'save_required') {
        setPendingConfirmations((prev) => prev.filter((entry) => entry.id !== confirmationId));
      }
      if (data.changes.length > 0) {
        await refreshActivePage();
      }
    } catch (confirmError) {
      const message = confirmError instanceof Error ? confirmError.message : 'Failed to confirm action.';
      appendAssistantMessage(`Error: ${message}`);
      setError(message);
    } finally {
      setConfirmingId(null);
    }
  }, [appendAssistantMessage, enabled, pageContext, refreshActivePage]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <>
      <Drawer
        opened={isAssistantOpen}
        onClose={closeAssistant}
        position="right"
        size="min(100vw, 460px)"
        title={
          <Group gap="sm">
            <MessageSquare size={18} />
            <Text fw={700}>AI Assistant</Text>
            {activePageContext?.kind === 'event_schedule' ? <Badge variant="light">Schedule</Badge> : null}
          </Group>
        }
        styles={{
          content: { height: '100dvh' },
          body: { height: 'calc(100dvh - 64px)', padding: 0 },
        }}
        zIndex={70}
      >
        <Stack h="100%" gap={0}>
          <Group justify="space-between" px="md" py="xs">
            <Text size="xs" c="dimmed">
              {!enabled
                ? 'AI assistant is disabled.'
                : activePageContext?.hasUnsavedChanges
                  ? 'AI drafts will be added to your unsaved changes.'
                  : 'Schedule changes are drafted on the page.'}
            </Text>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Plus size={14} />}
              onClick={() => { void handleNewChat(); }}
              disabled={!enabled || loading || sending}
            >
              New chat
            </Button>
          </Group>
          <Divider />

          <ScrollArea flex={1} viewportRef={viewportRef} px="md" py="sm">
            <Stack gap="sm">
              {loading && (
                <Group gap="xs" c="dimmed">
                  <Loader2 size={16} className="animate-spin" />
                  <Text size="sm">Loading chat...</Text>
                </Group>
              )}

              {visibleMessages.map((message) => (
                <Paper
                  key={message.id}
                  p="sm"
                  radius="sm"
                  withBorder
                  bg={message.role === 'assistant' ? 'gray.0' : 'mvpPrimary.6'}
                  c={message.role === 'assistant' ? undefined : 'white'}
                  ml={message.role === 'user' ? 'xl' : 0}
                  mr={message.role === 'assistant' ? 'xl' : 0}
                >
                  <Group gap="xs" mb={4}>
                    {message.role === 'assistant' ? <Bot size={14} /> : <MessageSquare size={14} />}
                    <Text size="xs" fw={700} tt="uppercase">
                      {message.role === 'assistant' ? 'Assistant' : 'You'}
                    </Text>
                  </Group>
                  <MarkdownMessageContent content={message.content} inverted={message.role === 'user'} />
                </Paper>
              ))}

              {pendingConfirmations.map((confirmation) => (
                <Paper key={confirmation.id} p="sm" radius="sm" withBorder>
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Badge variant="light" color="yellow">Confirmation required</Badge>
                      <Text size="xs" c="dimmed">
                        {new Date(confirmation.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </Group>
                    <Text size="sm">{confirmation.summary}</Text>
                    <Group gap="xs" justify="flex-end">
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<X size={14} />}
                        disabled={!enabled || Boolean(confirmingId)}
                        onClick={() => { void handleConfirm(confirmation.id, false); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="xs"
                        leftSection={confirmingId === confirmation.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        disabled={!enabled || Boolean(confirmingId)}
                        onClick={() => { void handleConfirm(confirmation.id, true); }}
                      >
                        Confirm
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ))}

              {sending ? (
                <Group gap="xs" c="dimmed">
                  <Loader2 size={16} className="animate-spin" />
                  <Text size="sm">Thinking...</Text>
                </Group>
              ) : null}

              {error ? (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              ) : null}
            </Stack>
          </ScrollArea>

          <Divider />
          <Stack gap="xs" p="md">
            <Textarea
              autosize
              minRows={2}
              maxRows={5}
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for help or a saved schedule change..."
              disabled={!enabled || sending || loading}
            />
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                {isAuthenticated && !isGuest ? 'Signed in' : 'Guest help mode'}
              </Text>
              <Button
                rightSection={sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                onClick={() => { void handleSend(); }}
                disabled={!enabled || !input.trim() || sending || loading}
              >
                Send
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Drawer>
    </>
  );
}
