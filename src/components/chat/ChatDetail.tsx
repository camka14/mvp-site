'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { useApp } from '@/app/providers';

interface ChatDetailProps {
    chatId: string;
}

export function ChatDetail({ chatId }: ChatDetailProps) {
    const { messages, sendMessage, chatGroups } = useChat();
    const { closeChatWindow } = useChatUI();
    const { user } = useApp();
    const [messageInput, setMessageInput] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chatMessages = useMemo(() => messages[chatId] || [], [messages, chatId]);
    const chatGroup = chatGroups.find(chat => chat.$id === chatId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

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
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header with Close Button - Fixed height */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                        {chatGroup?.displayName?.[0]?.toUpperCase() || chatGroup?.name[0]?.toUpperCase() || 'C'}
                    </div>
                    <div>
                        <div className="font-medium text-sm text-gray-900">
                            {chatGroup?.displayName || chatGroup?.name || 'Chat'}
                        </div>
                        <div className="text-xs text-gray-500">
                            {chatGroup?.userIds.length || 0} members
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
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                        <div className="text-sm">No messages yet</div>
                        <div className="text-xs">Start the conversation!</div>
                    </div>
                ) : (
                    chatMessages.map((message) => {
                        const isCurrentUser = message.userId === user?.$id;
                        return (
                            <div
                                key={message.$id}
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
                <div ref={messagesEndRef} />
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
