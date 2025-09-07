'use client';

import React from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { useApp } from '@/app/providers';

export function ChatList() {
    const { chatGroups, loading } = useChat();
    const { setSelectedChatId, setInviteModalOpen } = useChatUI();
    const { user } = useApp();

    const handleChatSelect = (chatId: string) => {
        setSelectedChatId(chatId);
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 24) {
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }
    };

    if (loading) {
        return (
            <div className="p-4 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col max-h-96">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-900">Messages</h3>
                <button
                    onClick={() => setInviteModalOpen(true)}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                    aria-label="New chat"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto">
                {chatGroups.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                        <p className="text-sm">No conversations yet</p>
                        <button
                            onClick={() => setInviteModalOpen(true)}
                            className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                            Start a conversation
                        </button>
                    </div>
                ) : (
                    chatGroups.map((chat) => (
                        <button
                            key={chat.$id}
                            onClick={() => handleChatSelect(chat.$id)}
                            className="w-full p-3 hover:bg-gray-50 border-b border-gray-100 text-left transition-colors group"
                        >
                            <div className="flex items-start space-x-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                                    {chat.displayName?.[0]?.toUpperCase() || chat.name[0]?.toUpperCase() || 'C'}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <p className="font-medium text-gray-900 truncate">
                                            {chat.displayName || chat.name}
                                        </p>
                                        {chat.lastMessage && (
                                            <span className="text-xs text-gray-500">
                                                {formatTime(chat.lastMessage.sentTime)}
                                            </span>
                                        )}
                                    </div>
                                    {chat.lastMessage && (
                                        <p className="text-sm text-gray-600 truncate">
                                            {chat.lastMessage.userId === user?.$id ? 'You: ' : ''}
                                            {chat.lastMessage.body}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
