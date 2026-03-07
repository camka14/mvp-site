import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';

export interface ChatGroup {
    $id: string;
    name: string | null;
    userIds: string[];
    hostId: string;
    displayName?: string | null;
    imageUrl?: string | null;
    unreadCount?: number;
    lastMessage?: {
        body: string;
        sentTime: string;
        userId: string;
    };
}
export interface Message {
    $id: string;
    userId: string;
    body: string;
    chatId: string;
    sentTime: string;
    readByIds: string[];
}

export type MessagePageOrder = 'asc' | 'desc';

export interface MessagePageQuery {
    limit?: number;
    index?: number;
    order?: MessagePageOrder;
}

export interface MessagePagePagination {
    index: number;
    limit: number;
    totalCount: number;
    nextIndex: number;
    remainingCount: number;
    hasMore: boolean;
    order: MessagePageOrder;
}

export interface MessagePageResult {
    messages: Message[];
    pagination: MessagePagePagination;
}

const DEFAULT_PAGE_LIMIT = 20;

const toMessage = (row: any): Message => ({
    $id: row.$id,
    userId: row.userId,
    body: row.body,
    chatId: row.chatId,
    sentTime: row.sentTime,
    readByIds: row.readByIds || [],
});

class ChatService {

    // Following Android pattern: query chat groups where userIds contains current user
    async getChatGroups(userId: string): Promise<ChatGroup[]> {
        try {
            const params = new URLSearchParams();
            params.set('userId', userId);
            const response = await apiRequest<{ groups?: any[] }>(`/api/chat/groups?${params.toString()}`);

            return (response.groups ?? []).map((row: any) => ({
                $id: row.$id,
                name: row.name,
                userIds: row.userIds,
                hostId: row.hostId,
                displayName: row.displayName,
                imageUrl: row.imageUrl,
                unreadCount: Number.isFinite(row.unreadCount) ? Number(row.unreadCount) : 0,
                $createdAt: row.$createdAt,
                $updatedAt: row.$updatedAt
            }));
        } catch (error) {
            console.error('Failed to get chat groups:', error);
            throw error;
        }
    }

    async getMessagesPage(chatId: string, query: MessagePageQuery = {}): Promise<MessagePageResult> {
        try {
            const normalizedLimit = Number.isFinite(query.limit) ? Math.trunc(query.limit as number) : DEFAULT_PAGE_LIMIT;
            const limit = Math.min(Math.max(normalizedLimit, 1), 100);
            const normalizedIndex = Number.isFinite(query.index) ? Math.trunc(query.index as number) : 0;
            const index = Math.max(0, normalizedIndex);
            const order: MessagePageOrder = query.order === 'asc' ? 'asc' : 'desc';

            const params = new URLSearchParams();
            params.set('limit', String(limit));
            params.set('index', String(index));
            params.set('order', order);
            const response = await apiRequest<{
                messages?: any[];
                pagination?: Partial<MessagePagePagination>;
            }>(`/api/chat/groups/${chatId}/messages?${params.toString()}`);

            const messages = (response.messages ?? []).map((row: any) => toMessage(row));
            const fallbackNextIndex = index + messages.length;
            const totalCount = Number.isFinite(response.pagination?.totalCount)
                ? Number(response.pagination?.totalCount)
                : fallbackNextIndex;
            const nextIndex = Number.isFinite(response.pagination?.nextIndex)
                ? Number(response.pagination?.nextIndex)
                : fallbackNextIndex;
            const remainingCount = Number.isFinite(response.pagination?.remainingCount)
                ? Math.max(0, Number(response.pagination?.remainingCount))
                : Math.max(0, totalCount - nextIndex);
            const hasMore = typeof response.pagination?.hasMore === 'boolean'
                ? response.pagination.hasMore
                : remainingCount > 0;

            return {
                messages,
                pagination: {
                    index,
                    limit,
                    totalCount,
                    nextIndex,
                    remainingCount,
                    hasMore,
                    order,
                },
            };
        } catch (error) {
            console.error('Failed to get paged messages:', error);
            throw error;
        }
    }

    async getMessages(chatId: string): Promise<Message[]> {
        const page = await this.getMessagesPage(chatId, { limit: 100, index: 0, order: 'asc' });
        return page.messages;
    }

    async getLastMessage(chatId: string): Promise<Message | null> {
        try {
            const page = await this.getMessagesPage(chatId, { limit: 1, index: 0, order: 'desc' });
            if (!page.messages.length) return null;
            return page.messages[0];
        } catch (error) {
            console.error('Failed to get last message:', error);
            return null;
        }
    }

    async markChatMessagesRead(chatId: string): Promise<void> {
        try {
            await apiRequest(`/api/chat/groups/${chatId}/messages/read`, {
                method: 'POST',
                body: {},
            });
        } catch (error) {
            console.error('Failed to mark chat messages as read:', error);
            throw error;
        }
    }

    async sendMessage(chatId: string, body: string, userId: string): Promise<Message> {
        try {
            const messageData = {
                userId,
                body,
                chatId,
                sentTime: new Date().toISOString(),
                readByIds: [userId]
            };

            const response = await apiRequest<any>('/api/messages', {
                method: 'POST',
                body: { ...messageData, id: createId() },
            });

            try {
                await apiRequest(`/api/messaging/topics/${chatId}/messages`, {
                    method: 'POST',
                    body: {
                        title: '',
                        body,
                        userIds: [],
                        senderId: userId
                    },
                });
            } catch (error) {
                console.warn('Failed to send chat notification', error);
            }

            // Return properly mapped message
            return {
                $id: response.$id,
                userId: response.userId,
                body: response.body,
                chatId: response.chatId,
                sentTime: response.sentTime,
                readByIds: response.readByIds || []
            };
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }

    async createChatGroup(name: string, userIds: string[]): Promise<ChatGroup> {
        try {
            const chatGroupData = {
                name,
                userIds,
                hostId: userIds[0]
            };

            const response = await apiRequest<any>('/api/chat/groups', {
                method: 'POST',
                body: { ...chatGroupData, id: createId() },
            });

            // Return properly mapped chat group
            return {
                $id: response.$id,
                name: response.name,
                userIds: response.userIds,
                hostId: response.hostId,
                displayName: response.displayName,
                imageUrl: response.imageUrl,
            };
        } catch (error) {
            console.error('Failed to create chat group:', error);
            throw error;
        }
    }

    async renameChatGroup(chatId: string, name: string | null): Promise<ChatGroup> {
        try {
            const response = await apiRequest<any>(`/api/chat/groups/${chatId}`, {
                method: 'PATCH',
                body: { name },
            });

            return {
                $id: response.$id,
                name: response.name,
                userIds: response.userIds,
                hostId: response.hostId,
                displayName: response.displayName,
                imageUrl: response.imageUrl,
            };
        } catch (error) {
            console.error('Failed to rename chat group:', error);
            throw error;
        }
    }

    async deleteChatGroup(chatId: string): Promise<void> {
        try {
            await apiRequest(`/api/chat/groups/${chatId}`, {
                method: 'DELETE',
            });
        } catch (error) {
            console.error('Failed to delete chat group:', error);
            throw error;
        }
    }

    async findOrCreateDirectMessage(currentUserId: string, otherUserId: string): Promise<ChatGroup> {
        try {
            // First, try to find existing DM chat
            const params = new URLSearchParams();
            params.set('userId', currentUserId);
            const response = await apiRequest<{ groups?: any[] }>(`/api/chat/groups?${params.toString()}`);

            const existingDM = (response.groups ?? []).find((row: any) =>
                Array.isArray(row.userIds) &&
                row.userIds.length === 2 &&
                row.userIds.includes(currentUserId) &&
                row.userIds.includes(otherUserId)
            );

            if (existingDM) {
                return {
                    $id: existingDM.$id,
                    name: existingDM.name,
                    userIds: existingDM.userIds,
                    hostId: existingDM.hostId,
                    displayName: existingDM.displayName,
                    imageUrl: existingDM.imageUrl,
                };
            }

            // Create new DM if not found
            const dmName = `DM_${currentUserId}_${otherUserId}`;
            return await this.createChatGroup(dmName, [currentUserId, otherUserId]);
        } catch (error) {
            console.error('Failed to find or create direct message:', error);
            throw error;
        }
    }
}

export const chatService = new ChatService();
