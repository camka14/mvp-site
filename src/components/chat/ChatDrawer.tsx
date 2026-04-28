'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { ChatList } from './ChatList';
import { ChatDetail } from './ChatDetail';
import { TermsConsentModal } from '@/components/moderation/TermsConsentModal';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import chatAnimationData from '../../../public/chat.json';

const CHAT_POLL_INTERVAL_MS = 2000;
const INACTIVE_CHAT_REFRESH_MS = 30000;

export function ChatDrawer() {
    const {
        chatGroups,
        loadMessages,
        loadChatGroups,
        markChatViewed,
        chatTermsState,
        chatTermsLoading,
        chatTermsModalOpen,
        ensureChatAccess,
        acceptChatTerms,
        closeChatTermsModal,
    } = useChat();
    const { isChatListOpen, openChatWindows, openChatList, isFloatingButtonVisible } = useChatUI();
    const [mounted, setMounted] = useState(false);
    const pollingRef = useRef(false);
    const openAfterTermsAcceptedRef = useRef(false);
    const uniqueOpenChatWindows = useMemo(
        () => Array.from(new Set(openChatWindows)),
        [openChatWindows],
    );
    const totalUnreadCount = useMemo(
        () => chatGroups.reduce((total, group) => total + Math.max(0, Number(group.unreadCount ?? 0)), 0),
        [chatGroups],
    );

    useEffect(() => {
        setMounted(true);
    }, []);

    // Load messages for each open chat window
    useEffect(() => {
        uniqueOpenChatWindows.forEach(chatId => {
            markChatViewed(chatId);
            loadMessages(chatId);
        });
    }, [uniqueOpenChatWindows, loadMessages, markChatViewed]);

    useEffect(() => {
        if (!mounted || uniqueOpenChatWindows.length === 0) {
            return;
        }

        const pollOpenChats = async () => {
            if (pollingRef.current) {
                return;
            }
            pollingRef.current = true;
            try {
                await Promise.all(uniqueOpenChatWindows.map((chatId) => loadMessages(chatId)));
            } finally {
                pollingRef.current = false;
            }
        };

        void pollOpenChats();
        const interval = window.setInterval(() => {
            void pollOpenChats();
        }, CHAT_POLL_INTERVAL_MS);

        return () => {
            window.clearInterval(interval);
            pollingRef.current = false;
        };
    }, [mounted, uniqueOpenChatWindows, loadMessages]);

    useEffect(() => {
        if (!mounted) {
            return;
        }

        const refreshInactiveChats = async () => {
            try {
                await loadChatGroups({ silent: true });
            } catch (error) {
                console.error('Failed to refresh inactive chats:', error);
            }
        };

        void refreshInactiveChats();
        const interval = window.setInterval(() => {
            void refreshInactiveChats();
        }, INACTIVE_CHAT_REFRESH_MS);

        return () => {
            window.clearInterval(interval);
        };
    }, [mounted, loadChatGroups]);

    if (!mounted) return null;

    const handleOpenChatList = async () => {
        const allowed = await ensureChatAccess();
        if (!allowed) {
            openAfterTermsAcceptedRef.current = true;
            return;
        }
        await loadChatGroups();
        openChatList();
    };

    const handleAcceptChatTerms = async () => {
        const accepted = await acceptChatTerms();
        if (!accepted) {
            return;
        }
        if (openAfterTermsAcceptedRef.current) {
            openAfterTermsAcceptedRef.current = false;
            await loadChatGroups();
            openChatList();
        }
    };

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
            {uniqueOpenChatWindows.map((chatId, index) => {
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
            {isFloatingButtonVisible && <FloatingChatButton onClick={handleOpenChatList} unreadCount={totalUnreadCount} />}

            <TermsConsentModal
                open={chatTermsModalOpen}
                state={chatTermsState}
                loading={chatTermsLoading}
                onAccept={() => { void handleAcceptChatTerms(); }}
                onClose={closeChatTermsModal}
                allowClose
            />
        </div>
    );

    return createPortal(drawerContent, document.body);
}

function FloatingChatButton({ onClick, unreadCount }: { onClick: () => void; unreadCount: number }) {
    const animationData = chatAnimationData;
    const lottieRef = useRef<LottieRefCurrentProps>(null);

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
            className="fixed bottom-4 right-4 rounded-full bg-transparent p-3 shadow-lg transition-shadow hover:bg-transparent pointer-events-auto relative"
            style={{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 60 }}
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
            {unreadCount > 0 ? (
                <span className="absolute right-0 top-0 inline-flex min-w-5 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            ) : null}
        </button>
    );
}
