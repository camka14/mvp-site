'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatGroup, chatService, Message } from '@/lib/chatService';
import { useApp } from '@/app/providers';


interface ChatContextType {
    // Data State
    chatGroups: ChatGroup[];
    messages: Record<string, Message[]>;
    loading: boolean;

    // Actions
    loadChatGroups: () => Promise<void>;
    loadMessages: (chatId: string) => Promise<void>;
    sendMessage: (chatId: string, message: string) => Promise<void>;
    createChatGroup: (name: string, userIds: string[]) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
    const { user } = useApp();
    const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [loading, setLoading] = useState(false);

    const loadChatGroups = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const groups = await chatService.getChatGroups(user.$id);
            // Fetch last message for each group in parallel
            const withLast = await Promise.all(groups.map(async (g) => {
                const last = await chatService.getLastMessage(g.$id);
                return last ? { ...g, lastMessage: { body: last.body, sentTime: last.sentTime, userId: last.userId } } : g;
            }));
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
            setLoading(false);
        }
    };

    const loadMessages = async (chatId: string) => {
        try {
            const chatMessages = await chatService.getMessages(chatId);
            setMessages(prev => ({
                ...prev,
                [chatId]: chatMessages
            }));
            if (chatMessages.length > 0) {
                const last = chatMessages[chatMessages.length - 1];
                setChatGroups(prev => prev.map(g => g.$id === chatId ? {
                    ...g,
                    lastMessage: { body: last.body, sentTime: last.sentTime, userId: last.userId }
                } : g));
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    };

    const sendMessage = async (chatId: string, messageBody: string) => {
        if (!user) return;

        try {
            const newMessage = await chatService.sendMessage(chatId, messageBody, user.$id);
            setMessages(prev => ({
                ...prev,
                [chatId]: [...(prev[chatId] || []), newMessage]
            }));
            // Update lastMessage on chat group
            setChatGroups(prev => prev.map(g => g.$id === chatId ? {
                ...g,
                lastMessage: { body: newMessage.body, sentTime: newMessage.sentTime, userId: newMessage.userId }
            } : g));
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const createChatGroup = async (name: string, userIds: string[]) => {
        if (!user) return;

        try {
            const newGroup = await chatService.createChatGroup(name, [user.$id, ...userIds]);
            setChatGroups(prev => [...prev, newGroup]);
        } catch (error) {
            console.error('Failed to create chat group:', error);
        }
    };

    // Load chat groups when user is available
    useEffect(() => {
        if (user) {
            loadChatGroups();
        }
    }, [user]);

    return (
        <ChatContext.Provider value={{
            chatGroups,
            messages,
            loading,
            loadChatGroups,
            loadMessages,
            sendMessage,
            createChatGroup
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
