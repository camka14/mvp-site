import { databases } from '@/app/appwrite';
import { UserData, getUserFullName, getUserAvatarUrl } from '@/types';
import { Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID!;

class UserService {

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
                        Query.contains('firstName', query),
                        Query.contains('lastName', query),
                        Query.contains('userName', query)
                    ]),
                    Query.limit(20)
                ]
            });

            return response.rows.map(row => this.mapRowToUser(row));
        } catch (error) {
            console.error('Failed to search users:', error);
            return [];
        }
    }

    async updateUser(id: string, updates: Partial<UserData>): Promise<UserData | undefined> {
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

    async addTeamInvitation(userId: string, teamId: string): Promise<boolean> {
        try {
            const user = await this.getUserById(userId);
            if (!user) return false;

            const updatedInvites = [...user.teamInvites, teamId];
            await this.updateUser(userId, { teamInvites: updatedInvites });
            return true;
        } catch (error) {
            console.error('Failed to add team invitation:', error);
            return false;
        }
    }

    async removeTeamInvitation(userId: string, teamId: string): Promise<boolean> {
        try {
            const user = await this.getUserById(userId);
            if (!user) return false;

            const updatedInvites = user.teamInvites.filter(id => id !== teamId);
            await this.updateUser(userId, { teamInvites: updatedInvites });
            return true;
        } catch (error) {
            console.error('Failed to remove team invitation:', error);
            return false;
        }
    }

    // Map Appwrite row to UserData using spread operator
    private mapRowToUser(row: any): UserData {
        return {
            ...row, // Spread all fields from Appwrite row
            // Only define computed properties
            fullName: getUserFullName({
                firstName: row.firstName || '',
                lastName: row.lastName || ''
            } as UserData),
            avatarUrl: getUserAvatarUrl({
                firstName: row.firstName || '',
                lastName: row.lastName || '',
                userName: row.userName || '',
                profileImage: row.profileImage
            } as UserData)
        };
    }
}

export const userService = new UserService();
