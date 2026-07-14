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
      $id: 'canonical-chat-id',
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
});
