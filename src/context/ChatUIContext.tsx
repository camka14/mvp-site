'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChatUIContextType {
    // Drawer state
    isChatListOpen: boolean;
    setChatListOpen: (open: boolean) => void;
    selectedChatId: string | null;
    setSelectedChatId: (chatId: string | null) => void;

    // Modal state
    isInviteModalOpen: boolean;
    setInviteModalOpen: (open: boolean) => void;

    // Actions
    openChatList: () => void;
    closeChatList: () => void;
    openChat: (chatId: string) => void;
    closeChat: () => void;
    closeAll: () => void;
}

const ChatUIContext = createContext<ChatUIContextType | null>(null);

export function ChatUIProvider({ children }: { children: ReactNode }) {
    const [isChatListOpen, setChatListOpen] = useState(false);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [isInviteModalOpen, setInviteModalOpen] = useState(false);

    const openChatList = () => setChatListOpen(true);
    const closeChatList = () => setChatListOpen(false);
    const openChat = (chatId: string) => setSelectedChatId(chatId);
    const closeChat = () => setSelectedChatId(null);

    const closeAll = () => {
        setChatListOpen(false);
        setSelectedChatId(null);
        setInviteModalOpen(false);
    };

    return (
        <ChatUIContext.Provider value={{
            isChatListOpen,
            setChatListOpen,
            selectedChatId,
            setSelectedChatId,
            isInviteModalOpen,
            setInviteModalOpen,
            openChatList,
            closeChatList,
            openChat,
            closeChat,
            closeAll
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
