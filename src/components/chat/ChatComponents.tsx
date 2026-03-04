'use client';

import { ChatDrawer } from './ChatDrawer';
import { InviteUsersModal } from './InviteUsersModal';
import { useApp } from '@/app/providers';

export function ChatComponents() {
    const { loading, isAuthenticated, isGuest } = useApp();

    if (loading || !isAuthenticated || isGuest) {
        return null;
    }

    return (
        <>
            <ChatDrawer />
            <InviteUsersModal />
        </>
    );
}
