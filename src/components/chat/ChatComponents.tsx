'use client';

import { usePathname } from 'next/navigation';
import { ChatDrawer } from './ChatDrawer';
import { InviteUsersModal } from './InviteUsersModal';
import { useApp } from '@/app/providers';

export function ChatComponents() {
    const { loading, isAuthenticated, isGuest } = useApp();
    const pathname = usePathname();
    const isMarketingPage = pathname === '/' || pathname === '/blog' || pathname.startsWith('/blog/');

    if (loading || !isAuthenticated || isGuest || isMarketingPage) {
        return null;
    }

    return (
        <>
            <ChatDrawer />
            <InviteUsersModal />
        </>
    );
}
