import { databases, account, storage } from '@/app/appwrite';
import { UserData, getUserFullName, getUserAvatarUrl } from '@/types';
import { Query, ID } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID!;

interface UpdateProfileData {
    firstName?: string;
    lastName?: string;
    userName?: string;
    profileImage?: string;
}

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
                profileImageId: row.profileImage
            } as UserData)
        };
    }
}

export const userService = new UserService();
