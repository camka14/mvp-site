import type { ChatGroup } from '@/lib/chatService';
import { upsertChatGroupById } from '@/context/chatGroupState';

const group = (id: string, name: string): ChatGroup => ({
    $id: id,
    name,
    userIds: ['user-a', 'user-b'],
    hostId: 'user-a',
});

describe('upsertChatGroupById', () => {
    it('replaces and deduplicates a canonical group returned by idempotent create', () => {
        const otherGroup = group('other-chat', 'Other chat');
        const staleCanonical = {
            ...group('canonical-chat', 'Stale direct chat'),
            unreadCount: 2,
            lastMessage: {
                body: 'Existing message',
                sentTime: '2026-07-13T22:00:00.000Z',
                userId: 'user-b',
            },
        };
        const returnedCanonical = group('canonical-chat', 'Server canonical chat');

        const nextGroups = upsertChatGroupById(
            [otherGroup, staleCanonical, group('canonical-chat', 'Duplicate local copy')],
            returnedCanonical,
        );

        expect(nextGroups).toEqual([
            otherGroup,
            {
                ...returnedCanonical,
                unreadCount: 2,
                lastMessage: staleCanonical.lastMessage,
            },
        ]);
    });

    it('appends a newly created group when its id is not present', () => {
        const existingGroup = group('existing-chat', 'Existing chat');
        const createdGroup = group('new-chat', 'New chat');

        expect(upsertChatGroupById([existingGroup], createdGroup)).toEqual([
            existingGroup,
            createdGroup,
        ]);
    });
});
