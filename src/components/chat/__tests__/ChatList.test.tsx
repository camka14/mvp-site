import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatList } from '../ChatList';
import { type ChatGroup } from '@/lib/chatService';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const useChatMock = jest.fn();
const useChatUIMock = jest.fn();
const useAppMock = jest.fn();
const renameChatGroupMock = jest.fn();
const reportChatMock = jest.fn();
const leaveChatGroupMock = jest.fn();
const markChatViewedMock = jest.fn();
const hideChatGroupsMock = jest.fn();

jest.mock('@/lib/chatService', () => ({
  chatService: {
    renameChatGroup: (...args: unknown[]) => renameChatGroupMock(...args),
    reportChat: (...args: unknown[]) => reportChatMock(...args),
    leaveChatGroup: (...args: unknown[]) => leaveChatGroupMock(...args),
  },
}));

jest.mock('@/context/ChatContext', () => ({
  useChat: () => useChatMock(),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => useChatUIMock(),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
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
    reportChatMock.mockReset();
    leaveChatGroupMock.mockReset();
    markChatViewedMock.mockReset();
    hideChatGroupsMock.mockReset();
    renameChatGroupMock.mockResolvedValue(baseGroup);
    reportChatMock.mockResolvedValue({ removedChatIds: [] });
    leaveChatGroupMock.mockResolvedValue(baseGroup);
    useAppMock.mockReturnValue({
      user: { $id: 'user_1' },
    });

    useChatMock.mockReturnValue({
      chatGroups: [],
      loading: false,
      loadChatGroups: jest.fn(),
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
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
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
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
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
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

  it('reports a chat and optionally removes it from the current feed', async () => {
    const user = userEvent.setup();
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const closeChatWindowMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
    });

    useChatUIMock.mockReturnValue({
      ...baseChatUIState,
      openChatWindow: jest.fn(),
      closeChatWindow: closeChatWindowMock,
    });

    reportChatMock.mockResolvedValue({ removedChatIds: ['chat_1'] });
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Objectionable content');
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithMantine(<ChatList />);

    await user.click(screen.getByLabelText('Chat actions for Weekend League'));
    await user.click(screen.getByText('Report chat'));

    await waitFor(() => {
      expect(reportChatMock).toHaveBeenCalledWith('chat_1', {
        notes: 'Objectionable content',
        leaveChat: true,
      });
      expect(hideChatGroupsMock).toHaveBeenCalledWith(['chat_1']);
      expect(closeChatWindowMock).toHaveBeenCalledWith('chat_1');
      expect(loadChatGroupsMock).toHaveBeenCalled();
    });

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('does not open the chat when clicking the 3-dot menu button', async () => {
    const user = userEvent.setup();
    const openChatWindowMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: jest.fn(),
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
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

  it('shows unread message count next to the last message', () => {
    const unreadGroup: ChatGroup = {
      ...baseGroup,
      unreadCount: 4,
      lastMessage: {
        body: 'Latest hello',
        sentTime: '2026-03-07T00:00:00.000Z',
        userId: 'user_2',
      },
    };

    useChatMock.mockReturnValue({
      chatGroups: [unreadGroup],
      loading: false,
      loadChatGroups: jest.fn(),
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
    });

    renderWithMantine(<ChatList />);

    expect(screen.getByText('Latest hello')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('marks chat as viewed when selecting a chat', async () => {
    const user = userEvent.setup();
    const openChatWindowMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: jest.fn(),
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
    });

    useChatUIMock.mockReturnValue({
      ...baseChatUIState,
      openChatWindow: openChatWindowMock,
      closeChatWindow: jest.fn(),
    });

    renderWithMantine(<ChatList />);
    await user.click(screen.getByText('Weekend League'));

    expect(markChatViewedMock).toHaveBeenCalledWith('chat_1');
    expect(openChatWindowMock).toHaveBeenCalledWith('chat_1');
  });

  it('leaves a chat from the 3-dot menu and hides it locally', async () => {
    const user = userEvent.setup();
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const closeChatWindowMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [baseGroup],
      loading: false,
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: markChatViewedMock,
      hideChatGroups: hideChatGroupsMock,
    });

    useChatUIMock.mockReturnValue({
      ...baseChatUIState,
      openChatWindow: jest.fn(),
      closeChatWindow: closeChatWindowMock,
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithMantine(<ChatList />);

    await user.click(screen.getByLabelText('Chat actions for Weekend League'));
    await user.click(screen.getByText('Leave chat'));

    await waitFor(() => {
      expect(leaveChatGroupMock).toHaveBeenCalledWith('chat_1', ['user_2']);
      expect(hideChatGroupsMock).toHaveBeenCalledWith(['chat_1']);
      expect(closeChatWindowMock).toHaveBeenCalledWith('chat_1');
      expect(loadChatGroupsMock).toHaveBeenCalled();
    });

    confirmSpy.mockRestore();
  });
});
