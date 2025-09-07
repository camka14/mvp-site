import { functions, databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';

interface ChatGroup {
    $id: string;
    name: string;
    userIds: string[];
    hostId: string;
    displayName?: string;
    imageUrl?: string;
    $createdAt: string;
    $updatedAt: string;
}

interface Message {
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
            const response = await databases.listRows({
                databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
                tableId: process.env.NEXT_PUBLIC_CHAT_GROUPS_COLLECTION_ID!,
                queries: [
                    Query.contains('userIds', userId)
                ]
            });

            return response.rows.map((row: any) => ({
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
            const response = await databases.listRows({
                databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
                tableId: process.env.NEXT_PUBLIC_MESSAGES_COLLECTION_ID!,
                queries: [
                    Query.equal('chatId', chatId),
                    Query.orderAsc('sentTime'),
                    Query.limit(100)
                ]
            });

            // Properly map response instead of unsafe casting
            return response.rows.map((row: any) => ({
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

    async sendMessage(chatId: string, body: string, userId: string): Promise<Message> {
        try {
            const messageData = {
                userId,
                body,
                chatId,
                sentTime: new Date().toISOString(),
                readByIds: [userId]
            };

            const response = await databases.createRow({
                databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
                tableId: process.env.NEXT_PUBLIC_MESSAGES_COLLECTION_ID!,
                rowId: ID.unique(),
                data: messageData
            });

            // Send push notification
            await functions.createExecution({
                functionId: process.env.NEXT_PUBLIC_CHAT_FUNCTION_ID!,
                body: JSON.stringify({
                    command: "send_chat_notification",
                    chatId,
                    message: body,
                    senderId: userId
                }),
                async: true
            });

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

            const response = await databases.createRow({
                databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
                tableId: process.env.NEXT_PUBLIC_CHAT_GROUPS_COLLECTION_ID!,
                rowId: ID.unique(),
                data: chatGroupData
            });

            // Return properly mapped chat group
            return {
                $id: response.$id,
                name: response.name,
                userIds: response.userIds,
                hostId: response.hostId,
                displayName: response.displayName,
                imageUrl: response.imageUrl,
                $createdAt: response.$createdAt,
                $updatedAt: response.$updatedAt
            };
        } catch (error) {
            console.error('Failed to create chat group:', error);
            throw error;
        }
    }

    async findOrCreateDirectMessage(currentUserId: string, otherUserId: string): Promise<ChatGroup> {
        try {
            // First, try to find existing DM chat
            const response = await databases.listRows({
                databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
                tableId: process.env.NEXT_PUBLIC_CHAT_GROUPS_COLLECTION_ID!,
                queries: [
                    Query.contains('userIds', currentUserId),
                    Query.contains('userIds', otherUserId),
                    Query.limit(1)
                ]
            });

            // Check if we found a DM (2 users only)
            const existingDM = response.rows.find((row: any) =>
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
                    $createdAt: existingDM.$createdAt,
                    $updatedAt: existingDM.$updatedAt
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
