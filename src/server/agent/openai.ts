import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

const DISABLED_VALUES = new Set(['0', 'false', 'off', 'disabled']);

export const isAgentEnabled = (): boolean => {
  const value = process.env.OPENAI_AGENT_ENABLED;
  return !value || !DISABLED_VALUES.has(value.trim().toLowerCase());
};

export const getAgentModel = (): string => (
  process.env.OPENAI_AGENT_MODEL?.trim() || 'gpt-5.1-2025-11-13'
);

export const getOpenAiClient = (): OpenAI => {
  if (!isAgentEnabled()) {
    throw new Error('AI assistant is disabled.');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
};

export const assertAgentAvailable = (): void => {
  if (!isAgentEnabled()) {
    throw new Response('AI assistant is disabled.', { status: 404 });
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Response('AI assistant is not configured.', { status: 503 });
  }
};
