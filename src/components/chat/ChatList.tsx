'use client';

import React from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { useApp } from '@/app/providers';

export function ChatList() {
    const { chatGroups, loading } = useChat();
    const { openChatWindow, openChatWindows, closeChatList, setInviteModalOpen } = useChatUI();
    const { user } = useApp();

    const handleChatSelect = (chatId: string) => {
        // Only open if not already open
        if (!openChatWindows.includes(chatId)) {
            openChatWindow(chatId);
        }
    };

    const handleClose = () => {
        closeChatList();
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
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <h2 className="font-semibold text-gray-900">Messages</h2>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setInviteModalOpen(true)}
                        className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                        title="Start new chat"
                    >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Chat Groups List */}
            <div className="flex-1 overflow-y-auto">
                {chatGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        <div className="text-gray-500 text-sm mb-2">No conversations yet</div>
                        <button
                            onClick={() => setInviteModalOpen(true)}
                            className="text-blue-500 text-sm hover:text-blue-600"
                        >
                            Start your first chat
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {chatGroups.map((chatGroup) => {
                            const isOpen = openChatWindows.includes(chatGroup.$id);

                            return (
                                <div
                                    key={chatGroup.$id}
                                    onClick={() => handleChatSelect(chatGroup.$id)}
                                    className={`p-3 flex items-center space-x-3 transition-colors relative ${isOpen
                                            ? 'bg-gray-100 cursor-not-allowed'
                                            : 'hover:bg-gray-50 cursor-pointer'
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${isOpen ? 'bg-gray-400' : 'bg-blue-500'
                                        }`}>
                                        {chatGroup.displayName?.[0]?.toUpperCase() || chatGroup.name[0]?.toUpperCase() || 'C'}
                                    </div>

                                    <div className={`flex-1 min-w-0 ${isOpen ? 'text-gray-400' : 'text-gray-900'}`}>
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-medium truncate ${isOpen ? 'text-gray-400' : 'text-gray-900'}`}>
                                                {chatGroup.displayName || chatGroup.name || 'Unnamed Chat'}
                                            </p>
                                            {chatGroup.lastMessage && (
                                                <span className={`text-xs ml-2 flex-shrink-0 ${isOpen ? 'text-gray-300' : 'text-gray-500'}`}>
                                                    {formatTime(chatGroup.lastMessage.sentTime)}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between mt-1">
                                            <p className={`text-xs truncate ${isOpen ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {chatGroup.lastMessage?.body || 'No messages yet'}
                                            </p>
                                            <span className={`text-xs ml-2 flex-shrink-0 ${isOpen ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {chatGroup.userIds.length} members
                                            </span>
                                        </div>
                                    </div>

                                    {/* Visual indicator for open chats */}
                                    {isOpen && (
                                        <div className="absolute right-2 top-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
