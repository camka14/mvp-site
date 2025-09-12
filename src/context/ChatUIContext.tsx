'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChatUIContextType {
    // Chat list drawer state
    isChatListOpen: boolean;
    setChatListOpen: (open: boolean) => void;
    // Multiple chat windows state
    openChatWindows: string[];
    // Modal state
    isInviteModalOpen: boolean;
    setInviteModalOpen: (open: boolean) => void;
    // Actions
    openChatList: () => void;
    closeChatList: () => void;
    openChatWindow: (chatId: string) => void;
    closeChatWindow: (chatId: string) => void;
    closeAllChatWindows: () => void;
    isFloatingButtonVisible: boolean;
}

const ChatUIContext = createContext<ChatUIContextType | null>(null);

export function ChatUIProvider({ children }: { children: ReactNode }) {
    const [isChatListOpen, setChatListOpen] = useState(false);
    const [openChatWindows, setOpenChatWindows] = useState<string[]>([]);
    const [isInviteModalOpen, setInviteModalOpen] = useState(false);

    const MAX_OPEN_CHATS = 3;

    const openChatList = () => setChatListOpen(true);

    const closeChatList = () => {
        setChatListOpen(false);
    };

    const openChatWindow = (chatId: string) => {
        setOpenChatWindows(prev => {
            // Check if chat is already open
            if (prev.includes(chatId)) {
                return prev; // Don't add duplicate
            }

            if (prev.length >= MAX_OPEN_CHATS) {
                // Remove the oldest chat window and add the new one
                return [...prev.slice(1), chatId];
            } else {
                // Add new chat window
                return [...prev, chatId];
            }
        });
    };

    const closeChatWindow = (chatId: string) => {
        setOpenChatWindows(prev => prev.filter(id => id !== chatId));
    };

    const closeAllChatWindows = () => {
        setOpenChatWindows([]);
    };

    // Button is visible when no chat list or windows are open
    const isFloatingButtonVisible = !isChatListOpen && openChatWindows.length === 0;

    return (
        <ChatUIContext.Provider
            value={{
                isChatListOpen,
                setChatListOpen,
                openChatWindows,
                isInviteModalOpen,
                setInviteModalOpen,
                openChatList,
                closeChatList,
                openChatWindow,
                closeChatWindow,
                closeAllChatWindows,
                isFloatingButtonVisible,
            }}
        >
            {children}
        </ChatUIContext.Provider>
    );
}

export function useChatUI() {
    const context = useContext(ChatUIContext);
    if (!context) {
        throw new Error('useChatUI must be used within ChatUIProvider');
    }
    return context;
}
