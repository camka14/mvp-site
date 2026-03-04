import { Message } from '@/lib/chatService';

const fallbackMessageKey = (message: Message): string => (
  `${message.chatId}::${message.userId}::${message.sentTime}::${message.body}`
);

export const dedupeChatMessages = (messages: Message[]): Message[] => {
  const seen = new Set<string>();
  const deduped: Message[] = [];

  for (const message of messages) {
    const id = typeof message.$id === 'string' ? message.$id.trim() : '';
    const key = id.length > 0 ? `id:${id}` : `fallback:${fallbackMessageKey(message)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(message);
  }

  return deduped;
};
