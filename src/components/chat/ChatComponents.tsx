'use client';

import { ChatDrawer } from './ChatDrawer';
import { InviteUsersModal } from '../ui/InviteUsersModal';

export function ChatComponents() {
    return (
        <>
            <ChatDrawer />
            <InviteUsersModal />
        </>
    );
}
