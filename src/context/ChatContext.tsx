'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
    ChatGroup,
    ChatTermsConsentState,
    chatService,
    Message,
    MessagePageOrder,
    MessagePagePagination,
} from '@/lib/chatService';
import { useApp } from '@/app/providers';
import { dedupeChatMessages } from '@/lib/chatMessages';


export interface ChatMessagePaginationState {
    initialized: boolean;
    loadingMore: boolean;
    nextIndex: number;
    totalCount: number;
    remainingCount: number;
    hasMore: boolean;
    limit: number;
}

interface ChatContextType {
    // Data State
    chatGroups: ChatGroup[];
    messages: Record<string, Message[]>;
    messagePagination: Record<string, ChatMessagePaginationState>;
    loading: boolean;
    chatTermsState: ChatTermsConsentState | null;
    chatTermsLoading: boolean;
    chatTermsModalOpen: boolean;

    // Actions
    loadChatGroups: (options?: { silent?: boolean }) => Promise<void>;
    loadMessages: (chatId: string) => Promise<void>;
    loadMoreMessages: (chatId: string) => Promise<void>;
    markChatViewed: (chatId: string) => void;
    sendMessage: (chatId: string, message: string) => Promise<void>;
    createChatGroup: (name: string, userIds: string[]) => Promise<void>;
    ensureChatAccess: () => Promise<boolean>;
    acceptChatTerms: () => Promise<boolean>;
    closeChatTermsModal: () => void;
    hideChatGroups: (chatIds: string[]) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);
const CHAT_PRELOAD_PAGE_LIMIT = 20;

const toAscendingMessages = (rows: Message[], order: MessagePageOrder): Message[] => (
    order === 'desc' ? [...rows].reverse() : rows
);

const buildPaginationState = (
    pagination: MessagePagePagination,
    overrides?: Partial<ChatMessagePaginationState>,
): ChatMessagePaginationState => {
    const baseNextIndex = Number.isFinite(overrides?.nextIndex)
        ? Number(overrides?.nextIndex)
        : pagination.nextIndex;
    const clampedNextIndex = Math.min(Math.max(baseNextIndex, 0), pagination.totalCount);
    const remainingCount = Math.max(pagination.totalCount - clampedNextIndex, 0);

    return {
        initialized: overrides?.initialized ?? true,
        loadingMore: overrides?.loadingMore ?? false,
        nextIndex: clampedNextIndex,
        totalCount: pagination.totalCount,
        remainingCount,
        hasMore: remainingCount > 0,
        limit: overrides?.limit ?? pagination.limit,
    };
};

export function ChatProvider({ children }: { children: ReactNode }) {
    const { user } = useApp();
    const currentUserId = user?.$id ?? null;
    const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [messagePagination, setMessagePagination] = useState<Record<string, ChatMessagePaginationState>>({});
    const [loading, setLoading] = useState(false);
    const [chatTermsState, setChatTermsState] = useState<ChatTermsConsentState | null>(null);
    const [chatTermsLoading, setChatTermsLoading] = useState(false);
    const [chatTermsModalOpen, setChatTermsModalOpen] = useState(false);
    const chatGroupsRef = useRef<ChatGroup[]>([]);
    const messagesRef = useRef<Record<string, Message[]>>({});
    const messagePaginationRef = useRef<Record<string, ChatMessagePaginationState>>({});
    const chatTermsAcceptedRef = useRef(false);

    useEffect(() => {
        chatGroupsRef.current = chatGroups;
    }, [chatGroups]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        messagePaginationRef.current = messagePagination;
    }, [messagePagination]);

    useEffect(() => {
        chatTermsAcceptedRef.current = Boolean(chatTermsState?.accepted);
    }, [chatTermsState]);

    useEffect(() => {
        setChatGroups([]);
        setMessages({});
        setMessagePagination({});
        setChatTermsState(null);
        setChatTermsModalOpen(false);
        chatTermsAcceptedRef.current = false;
    }, [currentUserId]);

    const fetchChatTermsState = useCallback(async (): Promise<ChatTermsConsentState | null> => {
        if (!currentUserId) {
            return null;
        }
        const state = await chatService.getChatTermsConsent();
        setChatTermsState(state);
        return state;
    }, [currentUserId]);

    const hideChatGroups = useCallback((chatIds: string[]) => {
        if (!Array.isArray(chatIds) || chatIds.length === 0) {
            return;
        }
        const hiddenIds = new Set(chatIds);
        setChatGroups((previous) => previous.filter((group) => !hiddenIds.has(group.$id)));
        setMessages((previous) => Object.fromEntries(
            Object.entries(previous).filter(([chatId]) => !hiddenIds.has(chatId)),
        ));
        setMessagePagination((previous) => Object.fromEntries(
            Object.entries(previous).filter(([chatId]) => !hiddenIds.has(chatId)),
        ));
    }, []);

    const ensureChatAccess = useCallback(async (): Promise<boolean> => {
        if (!currentUserId) {
            return false;
        }
        if (chatTermsAcceptedRef.current) {
            return true;
        }

        setChatTermsLoading(true);
        try {
            const state = chatTermsState ?? await fetchChatTermsState();
            if (state?.accepted) {
                return true;
            }
            setChatTermsModalOpen(true);
            return false;
        } catch (error) {
            console.error('Failed to load chat terms consent state:', error);
            setChatTermsModalOpen(true);
            return false;
        } finally {
            setChatTermsLoading(false);
        }
    }, [chatTermsState, currentUserId, fetchChatTermsState]);

    const closeChatTermsModal = useCallback(() => {
        setChatTermsModalOpen(false);
    }, []);

    const markChatReadLocally = useCallback((chatId: string, readerId: string) => {
        setMessages((previous) => {
            const chatMessages = previous[chatId] || [];
            let changed = false;
            const nextMessages = chatMessages.map((message) => {
                if (message.userId === readerId) {
                    return message;
                }
                if (message.readByIds.includes(readerId)) {
                    return message;
                }
                changed = true;
                return {
                    ...message,
                    readByIds: [...message.readByIds, readerId],
                };
            });

            if (!changed) {
                return previous;
            }
            return {
                ...previous,
                [chatId]: nextMessages,
            };
        });
        setChatGroups((previous) => previous.map((group) => (
            group.$id === chatId
                ? { ...group, unreadCount: 0 }
                : group
        )));
    }, []);

    const loadChatGroups = useCallback(async (options?: { silent?: boolean }) => {
        if (!user) return;
        if (!chatTermsAcceptedRef.current) {
            return;
        }
        const shouldSetLoading = !options?.silent;

        if (shouldSetLoading) {
            setLoading(true);
        }
        try {
            const groups = await chatService.getChatGroups(user.$id);
            const preloadedByChatId = new Map<string, {
                messages: Message[];
                pagination: MessagePagePagination;
            }>();

            await Promise.all(groups.map(async (group) => {
                try {
                    const page = await chatService.getMessagesPage(group.$id, {
                        limit: CHAT_PRELOAD_PAGE_LIMIT,
                        index: 0,
                        order: 'desc',
                    });
                    preloadedByChatId.set(group.$id, {
                        messages: dedupeChatMessages(toAscendingMessages(page.messages, page.pagination.order)),
                        pagination: page.pagination,
                    });
                } catch (error) {
                    console.error(`Failed to preload chat messages for ${group.$id}:`, error);
                }
            }));

            setMessages((previous) => {
                const next: Record<string, Message[]> = {};

                for (const group of groups) {
                    const existing = previous[group.$id] || [];
                    const preloaded = preloadedByChatId.get(group.$id)?.messages || [];
                    next[group.$id] = dedupeChatMessages([...existing, ...preloaded]);
                }

                return next;
            });

            setMessagePagination((previous) => {
                const next: Record<string, ChatMessagePaginationState> = {};

                for (const group of groups) {
                    const existingState = previous[group.$id];
                    const preloaded = preloadedByChatId.get(group.$id);
                    if (!preloaded) {
                        if (existingState) {
                            next[group.$id] = { ...existingState, loadingMore: false };
                        }
                        continue;
                    }

                    const baselineNextIndex = existingState?.initialized
                        ? Math.max(existingState.nextIndex, preloaded.pagination.nextIndex)
                        : preloaded.pagination.nextIndex;
                    next[group.$id] = buildPaginationState(preloaded.pagination, {
                        nextIndex: baselineNextIndex,
                        loadingMore: false,
                    });
                }

                return next;
            });

            const withLast = groups.map((group) => {
                const preloaded = preloadedByChatId.get(group.$id);
                const merged = dedupeChatMessages([
                    ...(messagesRef.current[group.$id] || []),
                    ...(preloaded?.messages || []),
                ]);
                const last = merged[merged.length - 1];
                return last
                    ? { ...group, lastMessage: { body: last.body, sentTime: last.sentTime, userId: last.userId } }
                    : group;
            });

            // Sort groups by last activity (fallback to createdAt if no last message)
            withLast.sort((a: any, b: any) => {
                const at = a.lastMessage?.sentTime ? new Date(a.lastMessage.sentTime).getTime() : 0;
                const bt = b.lastMessage?.sentTime ? new Date(b.lastMessage.sentTime).getTime() : 0;
                return bt - at;
            });
            setChatGroups(withLast as any);
        } catch (error) {
            console.error('Failed to load chat groups:', error);
        } finally {
            if (shouldSetLoading) {
                setLoading(false);
            }
        }
    }, [user]);

    const acceptChatTerms = useCallback(async (): Promise<boolean> => {
        if (!currentUserId) {
            return false;
        }
        setChatTermsLoading(true);
        try {
            const state = await chatService.acceptChatTermsConsent();
            chatTermsAcceptedRef.current = Boolean(state.accepted);
            setChatTermsState(state);
            setChatTermsModalOpen(false);
            await loadChatGroups();
            return Boolean(state.accepted);
        } catch (error) {
            console.error('Failed to accept chat terms:', error);
            return false;
        } finally {
            setChatTermsLoading(false);
        }
    }, [currentUserId, loadChatGroups]);

    const loadMessages = useCallback(async (chatId: string) => {
        try {
            if (!currentUserId) {
                return;
            }
            if (!chatTermsAcceptedRef.current) {
                return;
            }
            const currentPagination = messagePaginationRef.current[chatId];
            if (currentPagination?.loadingMore) {
                return;
            }

            const page = await chatService.getMessagesPage(chatId, {
                limit: CHAT_PRELOAD_PAGE_LIMIT,
                index: 0,
                order: 'desc',
            });

            const latestMessages = dedupeChatMessages(toAscendingMessages(page.messages, page.pagination.order));
            const existingMessages = messagesRef.current[chatId] || [];
            const mergedMessages = dedupeChatMessages([...existingMessages, ...latestMessages]);
            const latestMessage = mergedMessages[mergedMessages.length - 1];
            const inferredNextIndex = Math.max(
                currentPagination?.nextIndex ?? page.pagination.nextIndex,
                mergedMessages.length,
            );

            setMessages((prev) => ({
                ...prev,
                [chatId]: mergedMessages,
            }));
            setMessagePagination((prev) => ({
                ...prev,
                [chatId]: buildPaginationState(page.pagination, {
                    nextIndex: inferredNextIndex,
                    loadingMore: false,
                }),
            }));

            if (latestMessage) {
                setChatGroups((prev) => prev.map((group) => (
                    group.$id === chatId
                        ? {
                            ...group,
                            lastMessage: {
                                body: latestMessage.body,
                                sentTime: latestMessage.sentTime,
                                userId: latestMessage.userId,
                            },
                        }
                        : group
                )));
            }

            const hasUnreadInFetchedMessages = mergedMessages.some((message) => (
                message.userId !== currentUserId && !message.readByIds.includes(currentUserId)
            ));
            const unreadCountFromGroup = chatGroupsRef.current.find((group) => group.$id === chatId)?.unreadCount ?? 0;
            if (hasUnreadInFetchedMessages || unreadCountFromGroup > 0) {
                try {
                    await chatService.markChatMessagesRead(chatId);
                    markChatReadLocally(chatId, currentUserId);
                } catch (error) {
                    console.error('Failed to mark fetched messages as read:', error);
                }
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }, [currentUserId, markChatReadLocally]);

    const loadMoreMessages = useCallback(async (chatId: string) => {
        if (!currentUserId) {
            return;
        }
        if (!chatTermsAcceptedRef.current) {
            return;
        }
        const currentPagination = messagePaginationRef.current[chatId];
        if (!currentPagination || currentPagination.loadingMore || !currentPagination.hasMore) {
            return;
        }

        setMessagePagination((prev) => ({
            ...prev,
            [chatId]: {
                ...currentPagination,
                loadingMore: true,
            },
        }));

        try {
            const page = await chatService.getMessagesPage(chatId, {
                limit: currentPagination.limit || CHAT_PRELOAD_PAGE_LIMIT,
                index: currentPagination.nextIndex,
                order: 'desc',
            });
            const olderMessages = dedupeChatMessages(toAscendingMessages(page.messages, page.pagination.order));
            const existingMessages = messagesRef.current[chatId] || [];
            const mergedMessages = dedupeChatMessages([...olderMessages, ...existingMessages]);

            setMessages((prev) => ({
                ...prev,
                [chatId]: mergedMessages,
            }));
            setMessagePagination((prev) => ({
                ...prev,
                [chatId]: buildPaginationState(page.pagination, {
                    nextIndex: page.pagination.nextIndex,
                    loadingMore: false,
                }),
            }));

            const hasUnreadInOlderMessages = olderMessages.some((message) => (
                message.userId !== currentUserId && !message.readByIds.includes(currentUserId)
            ));
            if (hasUnreadInOlderMessages) {
                try {
                    await chatService.markChatMessagesRead(chatId);
                    markChatReadLocally(chatId, currentUserId);
                } catch (error) {
                    console.error('Failed to mark older messages as read:', error);
                }
            }
        } catch (error) {
            console.error('Failed to load older messages:', error);
            setMessagePagination((prev) => ({
                ...prev,
                [chatId]: {
                    ...(prev[chatId] || currentPagination),
                    loadingMore: false,
                },
            }));
        }
    }, [currentUserId, markChatReadLocally]);

    const markChatViewed = useCallback((chatId: string) => {
        if (!currentUserId) {
            return;
        }
        if (!chatTermsAcceptedRef.current) {
            return;
        }

        // Clear unread counters immediately in the UI when the user opens/views the chat.
        markChatReadLocally(chatId, currentUserId);
        void chatService.markChatMessagesRead(chatId).catch((error) => {
            console.error('Failed to mark viewed chat as read:', error);
        });
    }, [currentUserId, markChatReadLocally]);

    const sendMessage = async (chatId: string, messageBody: string) => {
        if (!user) return;
        if (!chatTermsAcceptedRef.current) return;

        try {
            const newMessage = await chatService.sendMessage(chatId, messageBody, user.$id);
            setMessages((prev) => ({
                ...prev,
                [chatId]: dedupeChatMessages([...(prev[chatId] || []), newMessage])
            }));
            setMessagePagination((prev) => {
                const existing = prev[chatId];
                if (!existing) {
                    const totalCount = 1;
                    const nextIndex = 1;
                    return {
                        ...prev,
                        [chatId]: {
                            initialized: true,
                            loadingMore: false,
                            limit: CHAT_PRELOAD_PAGE_LIMIT,
                            totalCount,
                            nextIndex,
                            remainingCount: 0,
                            hasMore: false,
                        },
                    };
                }

                const totalCount = existing.totalCount + 1;
                const nextIndex = Math.min(existing.nextIndex + 1, totalCount);
                const remainingCount = Math.max(totalCount - nextIndex, 0);
                return {
                    ...prev,
                    [chatId]: {
                        ...existing,
                        totalCount,
                        nextIndex,
                        remainingCount,
                        hasMore: remainingCount > 0,
                    },
                };
            });
            // Update lastMessage on chat group
            setChatGroups((prev) => prev.map((g) => g.$id === chatId ? {
                ...g,
                unreadCount: 0,
                lastMessage: { body: newMessage.body, sentTime: newMessage.sentTime, userId: newMessage.userId }
            } : g));
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const createChatGroup = async (name: string, userIds: string[]) => {
        if (!user) return;
        if (!chatTermsAcceptedRef.current) return;

        try {
            const newGroup = await chatService.createChatGroup(name, [user.$id, ...userIds]);
            setChatGroups(prev => [...prev, newGroup]);
        } catch (error) {
            console.error('Failed to create chat group:', error);
        }
    };

    return (
        <ChatContext.Provider value={{
            chatGroups,
            messages,
            messagePagination,
            loading,
            chatTermsState,
            chatTermsLoading,
            chatTermsModalOpen,
            loadChatGroups,
            loadMessages,
            loadMoreMessages,
            markChatViewed,
            sendMessage,
            createChatGroup,
            ensureChatAccess,
            acceptChatTerms,
            closeChatTermsModal,
            hideChatGroups,
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within ChatProvider');
    }
    return context;
}
