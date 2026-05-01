import type { AgentChatMessage, AgentPageContext, AgentPendingConfirmation, AgentToolChange } from '@/lib/agent/types';
import type { AgentConversationOwner } from './conversations';
import { getAgentModel, getOpenAiClient } from './openai';
import { buildAgentTools, buildSameOriginLink, executeAgentTool } from './tools';

type RunAgentTurnParams = {
  conversationId: string;
  owner: AgentConversationOwner;
  message: string;
  pageContext: AgentPageContext | null;
  origin: string;
};

type FunctionCall = {
  type: 'function_call';
  name: string;
  call_id: string;
  arguments?: string;
};

const MAX_TOOL_ITERATIONS = 8;

const knownNavigationLinks = [
  { text: 'Discover', path: '/discover' },
  { text: 'My Schedule', path: '/my-schedule' },
  { text: 'My Organizations', path: '/organizations' },
  { text: 'Teams', path: '/teams' },
  { text: 'Profile', path: '/profile' },
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const sanitizeAssistantReply = (reply: string, origin: string): string => {
  let sanitized = reply
    .replace(/\bleft sidebar\s+or\s+top navigation(?:\s+bar)?/gi, 'top navigation bar')
    .replace(/\bside navigation\s+or\s+top navigation(?:\s+bar)?/gi, 'top navigation bar')
    .replace(/\bsidebar\s+or\s+top navigation(?:\s+bar)?/gi, 'top navigation bar');

  for (const { text, path } of knownNavigationLinks) {
    const link = `[${text}](${buildSameOriginLink(origin, path)})`;
    const escapedPath = escapeRegExp(path);
    sanitized = sanitized
      .replace(new RegExp(`\\s*\\(\\s*path:\\s*\`?${escapedPath}\`?\\s*\\)`, 'gi'), ` (${link})`)
      .replace(new RegExp(`\\bpath:\\s*\`?${escapedPath}\`?`, 'gi'), link)
      .replace(new RegExp(`\`${escapedPath}\``, 'g'), link)
      .replace(new RegExp(`(?<![\\w:/)\\]\\(])${escapedPath}(?![\\w/-])`, 'g'), link);
  }

  return sanitized;
};

const getTextFromContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const row = part as Record<string, unknown>;
      if (typeof row.text === 'string') return row.text;
      if (typeof row.refusal === 'string') return row.refusal;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

export const conversationItemsToMessages = (items: unknown[]): AgentChatMessage[] => (
  items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => item.type === 'message' && (item.role === 'user' || item.role === 'assistant'))
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `item-${index}`,
      role: item.role as 'assistant' | 'user',
      content: getTextFromContent(item.content),
    }))
    .filter((message) => message.content.trim().length > 0)
);

const compactPageContext = (pageContext: AgentPageContext | null): string => {
  if (!pageContext) {
    return 'No page context was provided.';
  }
  return JSON.stringify({
    pathname: pageContext.pathname,
    auth: pageContext.auth,
    page: pageContext.page ?? null,
  });
};

const buildInstructions = (owner: AgentConversationOwner, pageContext: AgentPageContext | null): string => {
  const canUseActions = owner.type === 'user';
  return `
You are the BracketIQ web assistant.

Core behavior:
- Help users navigate BracketIQ and explain how to complete tasks on the site.
- For navigation destinations, call build_site_link and show standard Markdown links in the form [Text](Url).
- Do not expose raw route paths like /discover in user-facing answers, and do not write "path:" labels.
- Describe the web layout accurately: signed-in users use the top navigation bar. Do not mention a left sidebar unless the current page context or a tool result explicitly says one exists.
- Use read tools when you need actual event schedule, participant, field, official, or match data.
- Never invent IDs, match details, fields, teams, officials, or permissions.
- Mutating schedule actions must use the available write tools. Those tools return confirmation_required before any mutation. When that happens, tell the user to review the confirmation card and click Confirm.
- If a tool returns save_required, tell the user to save the page first and then retry. Do not create workarounds.
- Do not expose secrets, tokens, payment details, dates of birth, auth/session internals, or unnecessary profile fields.
- Keep answers concise and task-focused.

Action scope:
- In scope: navigation/help, event schedule reading, confirmed saved match assignment updates, score/result updates, officials, lock state, participant add/remove, and saved schedule regeneration.
- Out of scope: billing, refunds, purchases, rentals, team roster/profile management, admin moderation, document signing, and organization settings.

Current capability:
- Signed-in write tools available: ${canUseActions ? 'yes' : 'no'}.
- Guest users can only receive navigation/help and read allowed public schedule context.

Current page context:
${compactPageContext(pageContext)}
`.trim();
};

const parseToolCalls = (response: unknown): FunctionCall[] => {
  const output = Array.isArray((response as any)?.output) ? (response as any).output : [];
  return output.filter((item: any): item is FunctionCall => (
    item?.type === 'function_call'
    && typeof item.name === 'string'
    && typeof item.call_id === 'string'
  ));
};

export const runAgentTurn = async ({
  conversationId,
  owner,
  message,
  pageContext,
  origin,
}: RunAgentTurnParams): Promise<{
  reply: string;
  pendingConfirmations: AgentPendingConfirmation[];
  changes: AgentToolChange[];
}> => {
  const client = getOpenAiClient();
  const tools = buildAgentTools(owner);
  const pendingConfirmations: AgentPendingConfirmation[] = [];
  const changes: AgentToolChange[] = [];
  let input: any[] = [{ role: 'user', content: message }];
  let finalReply = '';

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client.responses.create({
      model: getAgentModel(),
      conversation: conversationId,
      instructions: buildInstructions(owner, pageContext),
      input,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    } as any);

    if ((response as any)?.error) {
      const errorMessage = (response as any).error?.message ?? 'OpenAI response error.';
      throw new Error(errorMessage);
    }
    if ((response as any)?.incomplete_details?.reason) {
      throw new Error(`OpenAI response incomplete: ${(response as any).incomplete_details.reason}`);
    }

    const toolCalls = parseToolCalls(response);
    if (!toolCalls.length) {
      finalReply = typeof (response as any).output_text === 'string'
        ? (response as any).output_text.trim()
        : '';
      break;
    }

    input = [];
    for (const call of toolCalls) {
      const execution = await executeAgentTool({
        name: call.name,
        args: call.arguments ?? '{}',
        owner,
        conversationId,
        pageContext,
        origin,
        mode: 'prepare',
      });
      if (execution.pendingConfirmation) {
        pendingConfirmations.push(execution.pendingConfirmation);
      }
      if (execution.changes?.length) {
        changes.push(...execution.changes);
      }
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(execution.result ?? {}),
      });
    }
  }

  return {
    reply: finalReply ? sanitizeAssistantReply(finalReply, origin) : (
      pendingConfirmations.length
        ? 'I prepared an action for confirmation. Review the confirmation card before I make changes.'
        : 'I could not complete that request.'
    ),
    pendingConfirmations,
    changes,
  };
};
