import { apiRequest } from '@/lib/apiClient';
import { chatService } from '@/lib/chatService';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/id', () => ({
  createId: () => 'client-proposed-chat-id',
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('chatService direct messages', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('posts the participant pair directly and returns the server canonical chat id', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'canonical-chat-id',
      name: 'Existing direct chat',
      userIds: ['user-b', 'user-a'],
      hostId: 'user-b',
    });

    const group = await chatService.findOrCreateDirectMessage('user-a', 'user-b');

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/chat/groups', {
      method: 'POST',
      body: {
        id: 'client-proposed-chat-id',
        name: 'DM_user-a_user-b',
        userIds: ['user-a', 'user-b'],
        hostId: 'user-a',
      },
    });
    expect(group.$id).toBe('canonical-chat-id');
    expect(group.hostId).toBe('user-b');
  });

  it('maps canonical-only group and message payloads into the existing UI models', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        groups: [{
          id: 'group_1',
          name: 'Tournament staff',
          userIds: ['user_1'],
          hostId: 'user_1',
          createdAt: '2026-07-14T10:00:00.000Z',
          updatedAt: '2026-07-14T10:30:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        messages: [{
          id: 'message_1',
          userId: 'user_1',
          body: 'Court three is ready.',
          chatId: 'group_1',
          sentTime: '2026-07-14T10:31:00.000Z',
          readByIds: ['user_1'],
        }],
        pagination: { totalCount: 1, nextIndex: 1, remainingCount: 0, hasMore: false },
      });

    const [group] = await chatService.getChatGroups('user_1');
    const page = await chatService.getMessagesPage('group_1');

    expect(group).toEqual(expect.objectContaining({
      $id: 'group_1',
      $createdAt: '2026-07-14T10:00:00.000Z',
      $updatedAt: '2026-07-14T10:30:00.000Z',
    }));
    expect(page.messages[0]).toEqual(expect.objectContaining({ $id: 'message_1' }));
  });
});
