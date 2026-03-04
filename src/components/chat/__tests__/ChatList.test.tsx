import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatList } from '../ChatList';
import { type ChatGroup } from '@/lib/chatService';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const useChatMock = jest.fn();
const useChatUIMock = jest.fn();
const renameChatGroupMock = jest.fn();
const deleteChatGroupMock = jest.fn();

jest.mock('@/lib/chatService', () => ({
  chatService: {
    renameChatGroup: (...args: unknown[]) => renameChatGroupMock(...args),
    deleteChatGroup: (...args: unknown[]) => deleteChatGroupMock(...args),
  },
}));

jest.mock('@/context/ChatContext', () => ({
  useChat: () => useChatMock(),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => useChatUIMock(),
}));

const baseChatUIState = {
  openChatWindow: jest.fn(),
  openChatWindows: [] as string[],
  closeChatList: jest.fn(),
  closeChatWindow: jest.fn(),
  setInviteModalOpen: jest.fn(),
};

const baseGroup: ChatGroup = {
  $id: 'chat_1',
  name: 'Weekend League',
  displayName: null,
  userIds: ['user_1', 'user_2'],
  hostId: 'user_1',
};

describe('ChatList', () => {
  beforeEach(() => {
    renameChatGroupMock.mockReset();
    deleteChatGroupMock.mockReset();
    renameChatGroupMock.mockResolvedValue(baseGroup);
    deleteChatGroupMock.mockResolvedValue(undefined);

    useChatMock.mockReturnValue({
      chatGroups: [],
      loading: false,
      loadChatGroups: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      ...baseChatUIState,
      openChatWindow: jest.fn(),
      closeChatWindow: jest.fn(),
    });
  });

  it('renders fallback title and initial when chat group names are null', () => {
    const nullNamedGroup: ChatGroup = {
      $id: 'chat_1',
      name: null,
      displayName: null,
      userIds: ['user_1'],
      hostId: 'user_1',
    };

    useChatMock.mockReturnValue({
      chatGroups: [nullNamedGroup],
      loading: false,
      loadChatGroups: jest.fn(),
    });

    renderWithMantine(<ChatList />);

    expect(screen.getByText('Unnamed Chat')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('1 members')).toBeInTheDocument();
  });

  it('renames a chat from the 3-dot menu', async () => {
    const user = userEvent.setup();
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: loadChatGroupsMock,
    });

    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Renamed Chat');
    renderWithMantine(<ChatList />);

    await user.click(screen.getByLabelText('Chat actions for Weekend League'));
    await user.click(screen.getByText('Rename chat'));

    await waitFor(() => {
      expect(renameChatGroupMock).toHaveBeenCalledWith('chat_1', 'Renamed Chat');
      expect(loadChatGroupsMock).toHaveBeenCalled();
    });

    promptSpy.mockRestore();
  });

  it('deletes a chat from the 3-dot menu', async () => {
    const user = userEvent.setup();
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const closeChatWindowMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: loadChatGroupsMock,
    });

    useChatUIMock.mockReturnValue({
      ...baseChatUIState,
      openChatWindow: jest.fn(),
      closeChatWindow: closeChatWindowMock,
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithMantine(<ChatList />);

    await user.click(screen.getByLabelText('Chat actions for Weekend League'));
    await user.click(screen.getByText('Delete chat'));

    await waitFor(() => {
      expect(deleteChatGroupMock).toHaveBeenCalledWith('chat_1');
      expect(closeChatWindowMock).toHaveBeenCalledWith('chat_1');
      expect(loadChatGroupsMock).toHaveBeenCalled();
    });

    confirmSpy.mockRestore();
  });

  it('does not open the chat when clicking the 3-dot menu button', async () => {
    const user = userEvent.setup();
    const openChatWindowMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: jest.fn(),
    });

    useChatUIMock.mockReturnValue({
      ...baseChatUIState,
      openChatWindow: openChatWindowMock,
      closeChatWindow: jest.fn(),
    });

    renderWithMantine(<ChatList />);
    await user.click(screen.getByLabelText('Chat actions for Weekend League'));

    expect(openChatWindowMock).not.toHaveBeenCalled();
  });
});
