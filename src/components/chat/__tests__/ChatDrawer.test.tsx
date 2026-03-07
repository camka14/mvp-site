import { act, render, screen } from '@testing-library/react';

import { ChatDrawer } from '../ChatDrawer';

const useChatMock = jest.fn();
const useChatUIMock = jest.fn();

jest.mock('@/context/ChatContext', () => ({
  useChat: () => useChatMock(),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => useChatUIMock(),
}));

jest.mock('lottie-react', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../ChatDetail', () => ({
  ChatDetail: () => null,
}));

describe('ChatDrawer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('refreshes inactive chat groups every 30 seconds', async () => {
    const loadMessagesMock = jest.fn().mockResolvedValue(undefined);
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const markChatViewedMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: loadMessagesMock,
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: markChatViewedMock,
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: jest.fn(),
      isFloatingButtonVisible: false,
    });

    render(<ChatDrawer />);

    await act(async () => {});
    expect(loadChatGroupsMock).toHaveBeenCalledWith({ silent: true });
    expect(loadChatGroupsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(loadChatGroupsMock).toHaveBeenCalledTimes(2);
    expect(loadChatGroupsMock).toHaveBeenNthCalledWith(2, { silent: true });
  });

  it('shows unread badge on floating chat button', async () => {
    useChatMock.mockReturnValue({
      chatGroups: [{ $id: 'chat_1', unreadCount: 3 }],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: jest.fn(),
      isFloatingButtonVisible: true,
    });

    render(<ChatDrawer />);

    await act(async () => {});
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('marks chats as viewed when windows are open', async () => {
    const markChatViewedMock = jest.fn();
    const loadMessagesMock = jest.fn().mockResolvedValue(undefined);

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: loadMessagesMock,
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: markChatViewedMock,
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: ['chat_1'],
      openChatList: jest.fn(),
      isFloatingButtonVisible: false,
    });

    render(<ChatDrawer />);
    await act(async () => {});

    expect(markChatViewedMock).toHaveBeenCalledWith('chat_1');
    expect(loadMessagesMock).toHaveBeenCalledWith('chat_1');
  });
});
