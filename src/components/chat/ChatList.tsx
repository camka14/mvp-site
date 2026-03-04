'use client';

import React, { useState } from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import { chatService } from '@/lib/chatService';
import { resolveChatGroupInitial, resolveChatGroupTitle } from './chatGroupDisplay';

export function ChatList() {
    const { chatGroups, loading, loadChatGroups } = useChat();
    const { openChatWindow, openChatWindows, closeChatList, closeChatWindow, setInviteModalOpen } = useChatUI();
    const [actionError, setActionError] = useState<string | null>(null);
    const [openActionsChatId, setOpenActionsChatId] = useState<string | null>(null);

    const handleChatSelect = (chatId: string) => {
        setOpenActionsChatId(null);
        // Only open if not already open
        if (!openChatWindows.includes(chatId)) {
            openChatWindow(chatId);
        }
    };

    const handleRenameChat = async (chatId: string, currentTitle: string) => {
        const nextLabel = window.prompt('Rename chat', currentTitle === 'Unnamed Chat' ? '' : currentTitle);
        if (nextLabel === null) {
            setOpenActionsChatId(null);
            return;
        }

        const trimmed = nextLabel.trim();
        const nextName = trimmed.length > 0 ? trimmed : null;
        if (nextName === currentTitle || (currentTitle === 'Unnamed Chat' && nextName === null)) {
            return;
        }

        try {
            setActionError(null);
            await chatService.renameChatGroup(chatId, nextName);
            await loadChatGroups();
            setOpenActionsChatId(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to rename chat.';
            setActionError(message);
        }
    };

    const handleDeleteChat = async (chatId: string, currentTitle: string) => {
        const confirmed = window.confirm(
            `Delete "${currentTitle}"? This action cannot be undone and will remove all messages in this chat.`,
        );
        if (!confirmed) {
            setOpenActionsChatId(null);
            return;
        }

        try {
            setActionError(null);
            await chatService.deleteChatGroup(chatId);
            closeChatWindow(chatId);
            await loadChatGroups();
            setOpenActionsChatId(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete chat.';
            setActionError(message);
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
            return formatDisplayTime(date);
        } else {
            return formatDisplayDate(date, { year: '2-digit' });
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
        <div className="flex flex-col h-full" onClick={() => setOpenActionsChatId(null)}>
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
            {actionError && (
                <div className="px-3 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50">
                    {actionError}
                </div>
            )}

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
                            const chatTitle = resolveChatGroupTitle(chatGroup, 'Unnamed Chat');
                            const chatInitial = resolveChatGroupInitial(chatGroup, 'C');
                            const isActionsOpen = openActionsChatId === chatGroup.$id;

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
                                        {chatInitial}
                                    </div>

                                    <div className={`flex-1 min-w-0 ${isOpen ? 'text-gray-400' : 'text-gray-900'}`}>
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-medium truncate ${isOpen ? 'text-gray-400' : 'text-gray-900'}`}>
                                                {chatTitle}
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

                                    <div className="relative z-10" onClick={(event) => event.stopPropagation()}>
                                        <button
                                            type="button"
                                            aria-label={`Chat actions for ${chatTitle}`}
                                            className={`p-1 rounded-full transition-colors ${
                                                isOpen ? 'text-gray-300 hover:bg-gray-200' : 'text-gray-500 hover:bg-gray-100'
                                            }`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setOpenActionsChatId((previous) => (previous === chatGroup.$id ? null : chatGroup.$id));
                                            }}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6h.01M12 12h.01M12 18h.01" />
                                            </svg>
                                        </button>
                                        {isActionsOpen && (
                                            <div className="absolute right-0 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                                                <button
                                                    type="button"
                                                    className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handleRenameChat(chatGroup.$id, chatTitle);
                                                    }}
                                                >
                                                    Rename chat
                                                </button>
                                                <button
                                                    type="button"
                                                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handleDeleteChat(chatGroup.$id, chatTitle);
                                                    }}
                                                >
                                                    Delete chat
                                                </button>
                                            </div>
                                        )}
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
