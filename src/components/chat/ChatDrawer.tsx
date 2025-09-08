'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { ChatList } from './ChatList';
import { ChatDetail } from './ChatDetail';

export function ChatDrawer() {
    const { loadMessages } = useChat();
    const {
        isChatListOpen,
        openChatWindows,
        openChatList,
        isFloatingButtonVisible
    } = useChatUI();

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Load messages for each open chat window
    useEffect(() => {
        openChatWindows.forEach(chatId => {
            loadMessages(chatId);
        });
    }, [openChatWindows, loadMessages]);

    if (!mounted) return null;

    const chatWindowWidth = 320; // Width of each chat window
    const chatListWidth = 320; // Width of chat list drawer

    const drawerContent = (
        <div className="pointer-events-none fixed inset-0 z-40">
            {/* Floating Chat Button */}
            <button
                onClick={openChatList}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-300 flex items-center justify-center pointer-events-auto ${isFloatingButtonVisible
                        ? 'translate-y-0 opacity-100 scale-100'
                        : 'translate-y-16 opacity-0 scale-75 pointer-events-none'
                    }`}
                aria-label="Open chat"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </button>

            {/* Chat List Drawer */}
            <div
                className={`fixed bottom-0 right-6 transition-all duration-300 pointer-events-auto ${isChatListOpen
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-full opacity-0 pointer-events-none'
                    }`}
                style={{ width: `${chatListWidth}px` }}
            >
                <div className="bg-white rounded-t-xl shadow-2xl border border-b-0 max-h-96 overflow-hidden">
                    <ChatList />
                </div>
            </div>

            {/* Chat Detail Windows - Stacked from right to left */}
            {openChatWindows.map((chatId, index) => {
                const rightOffset = 6 + (index * chatWindowWidth) + (index > 0 ? index * 8 : 0); // 8px gap between windows

                return (
                    <div
                        key={chatId}
                        className="fixed bottom-0 transition-all duration-300 pointer-events-auto"
                        style={{
                            right: `${rightOffset}px`,
                            width: `${chatWindowWidth}px`,
                            height: '500px'
                        }}
                    >
                        <div className="bg-white rounded-t-xl shadow-2xl border border-b-0 h-full overflow-hidden">
                            <ChatDetail chatId={chatId} />
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return createPortal(drawerContent, document.body);
}
