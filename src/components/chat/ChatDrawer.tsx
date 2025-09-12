'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { ChatList } from './ChatList';
import { ChatDetail } from './ChatDetail';

export function ChatDrawer() {
    const { loadMessages } = useChat();
    const { isChatListOpen, openChatWindows, openChatList, isFloatingButtonVisible } = useChatUI();
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
        <div className="fixed inset-0 pointer-events-none z-50">
            {/* Chat List - Half height, positioned at bottom-right */}
            {isChatListOpen && (
                <div
                    className="fixed bottom-0 bg-white border-l border-t border-gray-200 shadow-lg pointer-events-auto rounded-tl-lg"
                    style={{
                        right: 0,
                        width: `${chatListWidth}px`,
                        height: '50vh',
                    }}
                >
                    <ChatList />
                </div>
            )}

            {/* Chat Windows - Half height, stacked to the left of chat list */}
            {openChatWindows.map((chatId, index) => {
                const rightPosition = (isChatListOpen ? chatListWidth : 0) + (index * chatWindowWidth);

                return (
                    <div
                        key={chatId}
                        className="fixed bottom-0 bg-white border-l border-t border-gray-200 shadow-lg pointer-events-auto rounded-tl-lg"
                        style={{
                            right: `${rightPosition}px`,
                            width: `${chatWindowWidth}px`,
                            height: '50vh',
                        }}
                    >
                        <ChatDetail chatId={chatId} />
                    </div>
                );
            })}

            {/* Floating Chat Button */}
            {isFloatingButtonVisible && (
                <button
                    onClick={openChatList}
                    className="fixed bottom-4 right-4 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg transition-colors pointer-events-auto"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.292-.307l-5.7 1.9a.75.75 0 01-.92-.92l1.9-5.7c-.207-.732-.308-1.494-.308-2.292C6 7.582 9.582 4 14 4s8 3.582 8 8z" />
                    </svg>
                </button>
            )}
        </div>
    );

    return createPortal(drawerContent, document.body);
}
