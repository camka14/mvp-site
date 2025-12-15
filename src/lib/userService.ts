import { databases, account, storage, functions } from '@/app/appwrite';
import { UserData, Invite, getUserFullName, getUserAvatarUrl, Subscription } from '@/types';
import { Query, ID, ExecutionMethod } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID!;
const INVITES_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_INVITES_TABLE_ID || 'invites';

interface UpdateProfileData {
    firstName?: string;
    lastName?: string;
    userName?: string;
    profileImageId?: string;
}

class UserService {
    async createUser(id: string, data: Partial<UserData>): Promise<UserData> {
        try {
            const response = await databases.createRow({
                databaseId: DATABASE_ID,
                tableId: USERS_TABLE_ID,
                rowId: id,
                data
            });
            return this.mapRowToUser(response);
        } catch (error: any) {
            // If the row already exists (race condition), fetch and return it
            if (error && (error.code === 409 || error.response?.status === 409)) {
                const existing = await databases.getRow({
                    databaseId: DATABASE_ID,
                    tableId: USERS_TABLE_ID,
                    rowId: id
                });
                return this.mapRowToUser(existing);
            }
            console.error('Failed to create user profile:', error);
            throw error;
        }
    }

    async getUserById(id: string): Promise<UserData | undefined> {
        try {
            const response = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: USERS_TABLE_ID,
                rowId: id
            });
            return this.mapRowToUser(response);
        } catch (error) {
            console.error('Failed to fetch user:', error);
            return undefined;
        }
    }

    async getUsersByIds(ids: string[]): Promise<UserData[]> {
        if (ids.length === 0) return [];
        try {
            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: USERS_TABLE_ID,
                queries: [
                    Query.contains('$id', ids),
                    Query.limit(100)
                ]
            });
            return response.rows.map(row => this.mapRowToUser(row));
        } catch (error) {
            console.error('Failed to fetch users:', error);
            return [];
        }
    }

    async searchUsers(query: string): Promise<UserData[]> {
        try {
            if (query.length < 2) return [];
            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: USERS_TABLE_ID,
                queries: [
                    Query.or([
                        Query.search('firstName', query),
                        Query.search('lastName', query),
                        Query.search('userName', query),
                    ]),
                    Query.limit(5)
                ]
            });
            return response.rows.map(row => this.mapRowToUser(row));
        } catch (error) {
            console.error('Failed to search users:', error);
            return [];
        }
    }

    async updateUser(id: string, updates: Partial<UserData>): Promise<UserData> {
        try {
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: USERS_TABLE_ID,
                rowId: id,
                data: updates
            });
            return this.mapRowToUser(response);
        } catch (error) {
            console.error('Failed to update user:', error);
            throw error;
        }
    }

    // NEW: Profile editing methods
    async updateProfile(userId: string, data: UpdateProfileData): Promise<UserData> {
        try {
            // Update user data in database
            const updatedUser = await this.updateUser(userId, data);

            // If name changed, also update in Account
            if (data.userName) {
                await account.updateName({name: data.userName});
            }


            return updatedUser;
        } catch (error) {
            console.error('Failed to update profile:', error);
            throw error;
        }
    }

    async updateEmail(newEmail: string, currentPassword: string): Promise<void> {
        try {
            await account.updateEmail({email: newEmail, password: currentPassword});
        } catch (error) {
            console.error('Failed to update email:', error);
            throw error;
        }
    }

    async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
        try {
            await account.updatePassword({password: newPassword, oldPassword: currentPassword});
        } catch (error) {
            console.error('Failed to update password:', error);
            throw error;
        }
    }

    async listUserSubscriptions(userId: string): Promise<Subscription[]> {
        try {
            const response = await functions.createExecution({
                functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
                xpath: `/users/${userId}/subscriptions`,
                method: ExecutionMethod.GET,
                async: false,
            });
            const result = JSON.parse(response.responseBody || "{}") as {
                subscriptions?: any[];
            };
            const subs = Array.isArray(result.subscriptions) ? result.subscriptions : [];
            return subs.map((row) => ({
                $id: row?.$id ?? row?.id,
                productId: row?.productId ?? '',
                userId: row?.userId ?? '',
                organizationId: row?.organizationId ?? undefined,
                startDate: row?.startDate ?? row?.$createdAt ?? new Date().toISOString(),
                priceCents: row?.priceCents ?? row?.price ?? 0,
                period: (row?.period ?? 'month') as Subscription['period'],
                status: row?.status ?? 'ACTIVE',
            }));
        } catch (error) {
            console.error('Failed to list user subscriptions:', error);
            throw error;
        }
    }

    async uploadProfileImage(file: File): Promise<{ fileId: string; imageUrl: string }> {
        try {
            const fileId = ID.unique();

            await storage.createFile({
                bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
                fileId,
                file
            });

            const imageUrl = storage.getFilePreview({
                bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
                fileId,
                width: 400,
                height: 400
            });

            return {
                fileId,
                imageUrl: imageUrl.toString()
            };
        } catch (error) {
            console.error('Failed to upload profile image:', error);
            throw error;
        }
    }

    async deleteProfileImage(fileId: string): Promise<void> {
        try {
            await storage.deleteFile({
                bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
                fileId
            });
        } catch (error) {
            console.error('Failed to delete profile image:', error);
            throw error;
        }
    }

    async inviteUsersByEmail(
        inviterId: string,
        invites: {
            email: string;
            firstName?: string;
            lastName?: string;
            type?: 'player' | 'referee';
            eventId?: string;
            organizationId?: string;
            teamId?: string;
            userId?: string;
        }[],
        createIfMissing: boolean = true,
    ): Promise<{ sent: any[]; failed: any[]; not_sent: any[] }> {
        const normalizedInvites = invites.map((invite) => ({
            type: invite.type ?? 'player',
            ...invite,
        }));

        const response = await functions.createExecution({
            functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
            xpath: '/users/invite-email',
            method: ExecutionMethod.POST,
            body: JSON.stringify({ inviterId, invites: normalizedInvites, createIfMissing }),
            async: false,
        });

        const parsed = response.responseBody ? JSON.parse(response.responseBody) : {};
        if (parsed.error) {
            throw new Error(parsed.error);
        }
        return {
            sent: parsed.sent ?? [],
            failed: parsed.failed ?? [],
            not_sent: parsed.not_sent ?? [],
        };
    }

    async listInvites(filters: {
        userId?: string;
        type?: Invite['type'];
        teamId?: string;
        eventId?: string;
        organizationId?: string;
        email?: string;
    } = {}): Promise<Invite[]> {
        try {
            const queries = [];
            if (filters.userId) queries.push(Query.equal('userId', filters.userId));
            if (filters.type) queries.push(Query.equal('type', filters.type));
            if (filters.teamId) queries.push(Query.equal('teamId', filters.teamId));
            if (filters.eventId) queries.push(Query.equal('eventId', filters.eventId));
            if (filters.organizationId) queries.push(Query.equal('organizationId', filters.organizationId));
            if (filters.email) queries.push(Query.equal('email', filters.email.toLowerCase()));
            queries.push(Query.limit(100));

            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: INVITES_TABLE_ID,
                queries,
            });

            return response.rows.map((row) => this.mapRowToInvite(row));
        } catch (error) {
            console.error('Failed to list invites:', error);
            return [];
        }
    }

    async addTeamInvitation(userId: string, teamId: string): Promise<boolean> {
        try {
            const rowId = `${teamId}-${userId}`;
            await databases.upsertRow({
                databaseId: DATABASE_ID,
                tableId: INVITES_TABLE_ID,
                rowId,
                data: {
                    userId,
                    teamId,
                    type: 'player',
                    status: 'sent',
                },
            });
            return true;
        } catch (error) {
            console.error('Failed to add team invitation:', error);
            return false;
        }
    }

    async removeTeamInvitation(userId: string, teamId: string): Promise<boolean> {
        try {
            const invites = await this.listInvites({ userId, teamId, type: 'player' });
            await Promise.all(
                invites.map((invite) =>
                    databases.deleteRow({
                        databaseId: DATABASE_ID,
                        tableId: INVITES_TABLE_ID,
                        rowId: invite.$id,
                    }),
                ),
            );
            return true;
        } catch (error) {
            console.error('Failed to remove team invitation:', error);
            return false;
        }
    }

    // Map Appwrite row to UserData using spread operator
    private mapRowToUser(row: any): UserData {
        const { email: _email, ...rest } = row;
        const coerceList = (value: any) => (Array.isArray(value) ? value : []);
        return {
            ...rest, // Spread all fields from Appwrite row
            teamIds: coerceList(rest.teamIds),
            friendIds: coerceList(rest.friendIds),
            friendRequestIds: coerceList(rest.friendRequestIds),
            friendRequestSentIds: coerceList(rest.friendRequestSentIds),
            followingIds: coerceList(rest.followingIds),
            uploadedImages: coerceList(rest.uploadedImages),
            // Only define computed properties
            fullName: getUserFullName({
                firstName: rest.firstName || '',
                lastName: rest.lastName || ''
            } as UserData),
            avatarUrl: getUserAvatarUrl({
                firstName: rest.firstName || '',
                lastName: rest.lastName || '',
                userName: rest.userName || '',
                profileImageId: rest.profileImageId
            } as UserData)
        };
    }

    private mapRowToInvite(row: any): Invite {
        return {
            ...row,
        } as Invite;
    }
}

export const userService = new UserService();
