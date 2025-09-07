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
        selectedChatId,
        openChatList,
        closeAll
    } = useChatUI();

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (selectedChatId) {
            loadMessages(selectedChatId);
        }
    }, [selectedChatId, loadMessages]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isChatListOpen || selectedChatId) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isChatListOpen, selectedChatId]);

    if (!mounted) return null;

    const drawerContent = (
        <>
            {/* Floating Chat Button */}
            <button
                onClick={openChatList}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-200 flex items-center justify-center"
                aria-label="Open chat"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </button>

            {/* Overlay Container */}
            {(isChatListOpen || selectedChatId) && (
                <div className="fixed inset-0 z-40">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black bg-opacity-30 transition-opacity"
                        onClick={closeAll}
                    />

                    {/* Chat List Drawer */}
                    <div className={`absolute bottom-20 right-6 w-80 transition-all duration-300 transform ${isChatListOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
                        }`}>
                        <div className="bg-white rounded-xl shadow-2xl border overflow-hidden max-h-96">
                            <ChatList />
                        </div>
                    </div>

                    {/* Chat Detail Drawer */}
                    <div className={`absolute top-0 right-0 w-96 h-full transition-all duration-300 transform ${selectedChatId ? 'translate-x-0' : 'translate-x-full'
                        }`}>
                        <div className="bg-white shadow-2xl border-l h-full">
                            {selectedChatId && (
                                <ChatDetail
                                    chatId={selectedChatId}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    return createPortal(drawerContent, document.body);
}
