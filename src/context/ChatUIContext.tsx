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

    const openChatList = () => setChatListOpen(true);

    const closeChatList = () => {
        setChatListOpen(false);
    };

    const openChatWindow = (chatId: string) => {
        // Add chat to open windows if not already open
        setOpenChatWindows(prev => {
            if (!prev.includes(chatId)) {
                return [...prev, chatId];
            }
            return prev;
        });

        // Close chat list when opening a chat
        setChatListOpen(false);
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
        <ChatUIContext.Provider value={{
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
            isFloatingButtonVisible
        }}>
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
