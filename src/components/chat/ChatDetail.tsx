'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { useApp } from '@/app/providers';
import { formatDisplayTime } from '@/lib/dateUtils';
import { resolveChatGroupInitial, resolveChatGroupTitle } from './chatGroupDisplay';

interface ChatDetailProps {
    chatId: string;
}

export function ChatDetail({ chatId }: ChatDetailProps) {
    const { messages, messagePagination, sendMessage, loadMoreMessages, chatGroups } = useChat();
    const { closeChatWindow } = useChatUI();
    const { user } = useApp();
    const [messageInput, setMessageInput] = useState('');
    const [sending, setSending] = useState(false);
    const messageListRef = useRef<HTMLDivElement>(null);
    const pendingLoadMoreRestoreRef = useRef<{ previousTop: number; previousHeight: number } | null>(null);
    const previousMessageCountRef = useRef(0);
    const previousLastMessageKeyRef = useRef('');

    const chatMessages = useMemo(() => messages[chatId] || [], [messages, chatId]);
    const pagination = messagePagination[chatId];
    const loadingMore = pagination?.loadingMore ?? false;
    const hasMore = pagination?.hasMore ?? false;
    const chatGroup = chatGroups.find(chat => chat.$id === chatId);
    const chatTitle = resolveChatGroupTitle(chatGroup, 'Chat');
    const chatInitial = resolveChatGroupInitial(chatGroup, 'C');
    const chatMemberCount = Array.isArray(chatGroup?.userIds) ? chatGroup.userIds.length : 0;

    useEffect(() => {
        previousMessageCountRef.current = 0;
        previousLastMessageKeyRef.current = '';
        pendingLoadMoreRestoreRef.current = null;
    }, [chatId]);

    useEffect(() => {
        const container = messageListRef.current;
        if (!container) {
            return;
        }

        if (pendingLoadMoreRestoreRef.current) {
            const { previousHeight, previousTop } = pendingLoadMoreRestoreRef.current;
            const heightDelta = container.scrollHeight - previousHeight;
            container.scrollTop = previousTop + Math.max(heightDelta, 0);
            pendingLoadMoreRestoreRef.current = null;
        } else {
            const previousCount = previousMessageCountRef.current;
            const previousLastMessageKey = previousLastMessageKeyRef.current;
            const latestMessage = chatMessages[chatMessages.length - 1];
            const latestKey = latestMessage ? `${latestMessage.$id}::${latestMessage.sentTime}` : '';
            const appendedAtBottom = chatMessages.length > previousCount
                && previousLastMessageKey.length > 0
                && latestKey.length > 0
                && latestKey !== previousLastMessageKey;

            if (previousCount === 0 || appendedAtBottom) {
                container.scrollTop = container.scrollHeight;
            }
        }

        const nextLast = chatMessages[chatMessages.length - 1];
        previousLastMessageKeyRef.current = nextLast ? `${nextLast.$id}::${nextLast.sentTime}` : '';
        previousMessageCountRef.current = chatMessages.length;
    }, [chatMessages]);

    const handleMessagesScroll = () => {
        const container = messageListRef.current;
        if (!container || loadingMore || !hasMore) {
            return;
        }

        if (container.scrollTop <= 24) {
            pendingLoadMoreRestoreRef.current = {
                previousTop: container.scrollTop,
                previousHeight: container.scrollHeight,
            };
            void loadMoreMessages(chatId);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageInput.trim() || sending) return;

        setSending(true);
        try {
            await sendMessage(chatId, messageInput.trim());
            setMessageInput('');
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleClose = () => {
        closeChatWindow(chatId);
    };

    const formatMessageTime = (timestamp: string) => {
        return formatDisplayTime(timestamp);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header with Close Button - Fixed height */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                        {chatInitial}
                    </div>
                    <div>
                        <div className="font-medium text-sm text-gray-900">
                            {chatTitle}
                        </div>
                        <div className="text-xs text-gray-500">
                            {chatMemberCount} members
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleClose}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Messages - Scrollable area that takes remaining height */}
            <div
                ref={messageListRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
            >
                {loadingMore ? (
                    <div className="text-center text-xs text-gray-500">Loading more messages...</div>
                ) : null}
                {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                        <div className="text-sm">No messages yet</div>
                        <div className="text-xs">Start the conversation!</div>
                    </div>
                ) : (
                    chatMessages.map((message, index) => {
                        const isCurrentUser = message.userId === user?.$id;
                        return (
                            <div
                                key={`${message.$id || 'message'}-${message.sentTime || ''}-${index}`}
                                className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-xs px-3 py-2 rounded-lg text-sm ${isCurrentUser
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-200 text-gray-900'
                                        }`}
                                >
                                    <div>{message.body}</div>
                                    <div className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-100' : 'text-gray-500'}`}>
                                        {formatMessageTime(message.sentTime)}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Message Input - Fixed height at bottom */}
            <div className="border-t border-gray-200 p-3 flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex space-x-2">
                    <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={sending}
                    />
                    <button
                        type="submit"
                        disabled={!messageInput.trim() || sending}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        {sending ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
