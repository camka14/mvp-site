import type { ChatGroup } from '@/lib/chatService';

const mergeDefinedChatGroupFields = (
    existingGroup: ChatGroup,
    incomingGroup: ChatGroup,
): ChatGroup => ({
    ...existingGroup,
    ...Object.fromEntries(
        Object.entries(incomingGroup).filter(([, value]) => value !== undefined),
    ),
}) as ChatGroup;

/**
 * Inserts a newly created group, or replaces the existing canonical row when
 * an idempotent create returns an ID that is already present locally. Any
 * accidental duplicate copies of that ID are collapsed at the same time.
 */
export const upsertChatGroupById = (
    groups: ChatGroup[],
    incomingGroup: ChatGroup,
): ChatGroup[] => {
    let inserted = false;
    const nextGroups: ChatGroup[] = [];

    groups.forEach((group) => {
        if (group.$id !== incomingGroup.$id) {
            nextGroups.push(group);
            return;
        }
        if (!inserted) {
            nextGroups.push(mergeDefinedChatGroupFields(group, incomingGroup));
            inserted = true;
        }
    });

    if (!inserted) {
        nextGroups.push(incomingGroup);
    }

    return nextGroups;
};
