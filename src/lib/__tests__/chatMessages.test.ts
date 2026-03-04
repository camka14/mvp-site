import { dedupeChatMessages } from '@/lib/chatMessages';
import type { Message } from '@/lib/chatService';

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  $id: 'message_1',
  userId: 'user_1',
  body: 'hello',
  chatId: 'chat_1',
  sentTime: '2026-03-03T00:00:00.000Z',
  readByIds: ['user_1'],
  ...overrides,
});

describe('dedupeChatMessages', () => {
  it('removes duplicate messages by id while preserving order', () => {
    const first = createMessage({ $id: 'm1', body: 'first' });
    const duplicate = createMessage({ $id: 'm1', body: 'first duplicate payload' });
    const second = createMessage({ $id: 'm2', body: 'second' });

    const result = dedupeChatMessages([first, duplicate, second]);

    expect(result).toEqual([first, second]);
  });

  it('falls back to composite fields when message id is missing', () => {
    const first = createMessage({ $id: '', body: 'same body' });
    const duplicate = createMessage({ $id: ' ', body: 'same body' });
    const distinct = createMessage({ $id: '', body: 'different body' });

    const result = dedupeChatMessages([first, duplicate, distinct]);

    expect(result).toEqual([first, distinct]);
  });
});
