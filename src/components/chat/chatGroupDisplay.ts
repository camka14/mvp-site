import { ChatGroup } from '@/lib/chatService';

type ChatGroupLike = Pick<ChatGroup, 'displayName' | 'name'> | null | undefined;

const normalizeChatGroupText = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const resolvePreferredChatGroupName = (chatGroup: ChatGroupLike): string | null => (
    normalizeChatGroupText(chatGroup?.displayName) ?? normalizeChatGroupText(chatGroup?.name)
);

export const resolveChatGroupTitle = (chatGroup: ChatGroupLike, fallbackTitle: string): string => (
    resolvePreferredChatGroupName(chatGroup) ?? fallbackTitle
);

export const resolveChatGroupInitial = (chatGroup: ChatGroupLike, fallbackInitial = 'C'): string => {
    const preferredName = resolvePreferredChatGroupName(chatGroup);
    if (!preferredName) {
        return fallbackInitial;
    }
    return preferredName.charAt(0).toUpperCase() || fallbackInitial;
};
