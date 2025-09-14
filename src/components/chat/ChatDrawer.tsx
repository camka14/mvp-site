'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { ChatList } from './ChatList';
import { ChatDetail } from './ChatDetail';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';

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

            {/* Floating Chat Button (Lottie) */}
            {isFloatingButtonVisible && <FloatingChatButton onClick={openChatList} />}
        </div>
    );

    return createPortal(drawerContent, document.body);
}

function FloatingChatButton({ onClick }: { onClick: () => void }) {
    const [animationData, setAnimationData] = useState<any | null>(null);
    const lottieRef = useRef<LottieRefCurrentProps>(null);

    useEffect(() => {
        let mounted = true;
        fetch('/chat.json')
            .then((r) => (r.ok ? r.json() : Promise.reject('Failed to load chat.json')))
            .then((data) => {
                if (mounted) setAnimationData(data);
            })
            .catch((e) => console.error(e));
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        // Ensure we hold on the first frame when data loads
        if (animationData && lottieRef.current) {
            try {
                lottieRef.current.stop();
                lottieRef.current.goToAndStop(0, true);
            } catch {}
        }
    }, [animationData]);

    const handleMouseEnter = () => {
        if (!animationData) return;
        try {
            // Play once from the beginning
            lottieRef.current?.goToAndPlay(0, true);
        } catch {}
    };

    const handleComplete = () => {
        try {
            // Return to first frame and hold
            lottieRef.current?.goToAndStop(0, true);
        } catch {}
    };

    return (
        <button
            aria-label="Open chat"
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            className="fixed bottom-4 right-4 bg-transparent hover:bg-transparent p-3 rounded-full shadow-lg transition-shadow pointer-events-auto"
        >
            {animationData ? (
                <Lottie
                    lottieRef={lottieRef}
                    animationData={animationData}
                    autoplay={false}
                    loop={false}
                    style={{ width: 48, height: 48 }}
                    onComplete={handleComplete}
                />
            ) : (
                // Fallback icon while loading JSON
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.292-.307l-5.7 1.9a.75.75 0 01-.92-.92l1.9-5.7c-.207-.732-.308-1.494-.308-2.292C6 7.582 9.582 4 14 4s8 3.582 8 8z" />
                </svg>
            )}
        </button>
    );
}
