import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';

export interface ChatGroup {
    $id: string;
    name: string;
    userIds: string[];
    hostId: string;
    displayName?: string;
    imageUrl?: string;
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
                $createdAt: row.$createdAt,
                $updatedAt: row.$updatedAt
            }));
        } catch (error) {
            console.error('Failed to get chat groups:', error);
            throw error;
        }
    }

    async getMessages(chatId: string): Promise<Message[]> {
        try {
            const params = new URLSearchParams();
            params.set('limit', '100');
            params.set('order', 'asc');
            const response = await apiRequest<{ messages?: any[] }>(`/api/chat/groups/${chatId}/messages?${params.toString()}`);

            return (response.messages ?? []).map((row: any) => ({
                $id: row.$id,
                userId: row.userId,
                body: row.body,
                chatId: row.chatId,
                sentTime: row.sentTime,
                readByIds: row.readByIds || []
            }));
        } catch (error) {
            console.error('Failed to get messages:', error);
            throw error;
        }
    }

    async getLastMessage(chatId: string): Promise<Message | null> {
        try {
            const params = new URLSearchParams();
            params.set('limit', '1');
            params.set('order', 'desc');
            const response = await apiRequest<{ messages?: any[] }>(`/api/chat/groups/${chatId}/messages?${params.toString()}`);
            if (!response.messages?.length) return null;
            const row: any = response.messages[0];
            return {
                $id: row.$id,
                userId: row.userId,
                body: row.body,
                chatId: row.chatId,
                sentTime: row.sentTime,
                readByIds: row.readByIds || []
            };
        } catch (error) {
            console.error('Failed to get last message:', error);
            return null;
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
