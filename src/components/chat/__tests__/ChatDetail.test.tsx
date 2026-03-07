import { fireEvent, screen } from '@testing-library/react';

import { ChatDetail } from '../ChatDetail';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const useChatMock = jest.fn();
const useChatUIMock = jest.fn();
const useAppMock = jest.fn();

jest.mock('@/context/ChatContext', () => ({
  useChat: () => useChatMock(),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => useChatUIMock(),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

describe('ChatDetail', () => {
  const sendMessageMock = jest.fn();
  const loadMoreMessagesMock = jest.fn();
  const closeChatWindowMock = jest.fn();

  const buildBaseChatContext = () => ({
    messages: {
      chat_1: [
        {
          $id: 'm_1',
          userId: 'user_2',
          body: 'hello',
          chatId: 'chat_1',
          sentTime: '2026-03-06T00:00:00.000Z',
          readByIds: ['user_2'],
        },
      ],
    },
    messagePagination: {
      chat_1: {
        initialized: true,
        loadingMore: false,
        nextIndex: 1,
        totalCount: 5,
        remainingCount: 4,
        hasMore: true,
        limit: 20,
      },
    },
    sendMessage: sendMessageMock,
    loadMoreMessages: loadMoreMessagesMock,
    chatGroups: [{ $id: 'chat_1', name: 'Weekend League', userIds: ['user_1', 'user_2'], hostId: 'user_1' }],
  });

  beforeEach(() => {
    sendMessageMock.mockReset();
    loadMoreMessagesMock.mockReset();
    closeChatWindowMock.mockReset();

    useAppMock.mockReturnValue({
      user: { $id: 'user_1' },
    });
    useChatUIMock.mockReturnValue({
      closeChatWindow: closeChatWindowMock,
    });
    useChatMock.mockReturnValue(buildBaseChatContext());
  });

  it('renders loading indicator when older messages are being fetched', () => {
    const base = buildBaseChatContext();
    useChatMock.mockReturnValue({
      ...base,
      messagePagination: {
        chat_1: {
          initialized: true,
          loadingMore: true,
          nextIndex: 1,
          totalCount: 5,
          remainingCount: 4,
          hasMore: true,
          limit: 20,
        },
      },
    });

    renderWithMantine(<ChatDetail chatId="chat_1" />);

    expect(screen.getByText('Loading more messages...')).toBeInTheDocument();
  });

  it('loads older messages when scrolling near the top and more history exists', () => {
    const { container } = renderWithMantine(<ChatDetail chatId="chat_1" />);
    const messageList = container.querySelector('.overflow-y-auto') as HTMLDivElement;

    Object.defineProperty(messageList, 'scrollTop', {
      value: 0,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(messageList, 'scrollHeight', {
      value: 640,
      configurable: true,
    });

    fireEvent.scroll(messageList);

    expect(loadMoreMessagesMock).toHaveBeenCalledWith('chat_1');
  });

  it('does not load older messages when there is no remaining history', () => {
    const base = buildBaseChatContext();
    useChatMock.mockReturnValue({
      ...base,
      messagePagination: {
        chat_1: {
          initialized: true,
          loadingMore: false,
          nextIndex: 2,
          totalCount: 2,
          remainingCount: 0,
          hasMore: false,
          limit: 20,
        },
      },
    });

    const { container } = renderWithMantine(<ChatDetail chatId="chat_1" />);
    const messageList = container.querySelector('.overflow-y-auto') as HTMLDivElement;

    Object.defineProperty(messageList, 'scrollTop', {
      value: 0,
      configurable: true,
      writable: true,
    });

    fireEvent.scroll(messageList);

    expect(loadMoreMessagesMock).not.toHaveBeenCalled();
  });
});
