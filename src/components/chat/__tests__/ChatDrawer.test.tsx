import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: jest.fn(),
      chatTermsState: {
        version: '2026-04-14',
        url: '/terms',
        summary: ['There is no tolerance for objectionable content or abusive users.'],
        accepted: false,
        acceptedAt: null,
      },
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: jest.fn(),
      isFloatingButtonVisible: false,
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.clearAllMocks();
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
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
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
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
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
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
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

  it('gates opening the chat list behind chat terms consent', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const ensureChatAccessMock = jest.fn().mockResolvedValue(false);
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const openChatListMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: jest.fn(),
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: ensureChatAccessMock,
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: openChatListMock,
      isFloatingButtonVisible: true,
    });

    render(<ChatDrawer />);
    await act(async () => {});

    await user.click(screen.getByLabelText('Open chat'));

    await waitFor(() => {
      expect(ensureChatAccessMock).toHaveBeenCalled();
    });
    expect(loadChatGroupsMock).not.toHaveBeenCalledWith();
    expect(openChatListMock).not.toHaveBeenCalled();
  });

  it('shows the chat terms modal and records agreement', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const acceptChatTermsMock = jest.fn().mockResolvedValue(undefined);
    const closeChatTermsModalMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: jest.fn(),
      chatTermsState: {
        version: '2026-04-14',
        url: '/terms',
        summary: ['There is no tolerance for objectionable content or abusive users.'],
        accepted: false,
        acceptedAt: null,
      },
      chatTermsLoading: false,
      chatTermsModalOpen: true,
      ensureChatAccess: jest.fn().mockResolvedValue(false),
      acceptChatTerms: acceptChatTermsMock,
      closeChatTermsModal: closeChatTermsModalMock,
    });

    render(<ChatDrawer />);
    await act(async () => {});

    expect(screen.getByText('Agree to the Terms and EULA')).toBeInTheDocument();
    expect(screen.getByText('There is no tolerance for objectionable content or abusive users.')).toBeInTheDocument();

    await user.click(screen.getByText('Agree'));
    await waitFor(() => {
      expect(acceptChatTermsMock).toHaveBeenCalled();
    });

    await user.click(screen.getByText('Not now'));
    expect(closeChatTermsModalMock).toHaveBeenCalled();
  });
});
