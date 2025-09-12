import { databases } from '@/app/appwrite';
import { Team, UserData, getTeamWinRate, getTeamAvatarUrl } from '@/types';
import { userService } from './userService';
import { ID, Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const TEAMS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID!;

class TeamService {

    async createTeam(
        name: string,
        captainId: string,
        division: string = 'Open',
        sport: string = 'Volleyball',
        maxPlayers: number = 6,
        profileImage?: string
    ): Promise<Team | undefined> {
        try {
            const teamData = {
                name,
                seed: 0,
                division,
                sport,
                wins: 0,
                losses: 0,
                playerIds: [captainId],
                captainId,
                pending: [],
                teamSize: maxPlayers,
                profileImageId: profileImage || ''
            };

            const response = await databases.createRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: ID.unique(),
                data: teamData
            });

            const captain = await userService.getUserById(captainId);
            if (captain) {
                const updatedTeamIds = [...captain.teamIds, response.$id];
                await userService.updateUser(captainId, { teamIds: updatedTeamIds });
            }

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to create team:', error);
            throw error;
        }
    }

    async deleteTeam(teamId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId, true);
            if (!team) return false;

            // Remove team from all players' teamIds
            if (team.players && team.players.length > 0) {
                const updatePromises = team.players.map(async (player) => {
                    const updatedTeamIds = player.teamIds.filter(id => id !== teamId);
                    return userService.updateUser(player.$id, { teamIds: updatedTeamIds });
                });

                await Promise.all(updatePromises);
            }

            // Remove team invitations from all pending players
            if (team.pendingPlayers && team.pendingPlayers.length > 0) {
                const removeInvitePromises = team.pendingPlayers.map(async (player) => {
                    return userService.removeTeamInvitation(player.$id, teamId);
                });

                await Promise.all(removeInvitePromises);
            }

            // Delete the team from database
            await databases.deleteRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId
            });

            return true;
        } catch (error) {
            console.error('Failed to delete team:', error);
            return false;
        }
    }

    // NEW: Update team profile image
    async updateTeamProfileImage(teamId: string, profileImage: string): Promise<Team | undefined> {
        try {
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { profileImage }
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team profile image:', error);
            throw error;
        }
    }

    // NEW: Update team name
    async updateTeamName(teamId: string, name: string): Promise<Team | undefined> {
        try {
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { name }
            });
            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team name:', error);
            throw error;
        }
    }

    async getTeamsByIds(teamIds: string[], includeRelations: boolean = false): Promise<Team[]> {
        try {
            if (teamIds.length === 0) return [];

            const queries = [
                Query.limit(50),
                Query.equal('$id', teamIds)
            ];

            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                queries
            });

            const teams = response.rows.map(row => this.mapRowToTeam(row));

            if (includeRelations) {
                // Fetch players for each team
                const playerIds = Array.from(new Set(teams.flatMap(team => team.playerIds)));
                const playersMap: { [key: string]: UserData } = {};
                if (playerIds.length > 0) {
                    const players = await userService.getUsersByIds(playerIds);
                    players.forEach(player => {
                        playersMap[player.$id] = player;
                    });
                }

                teams.forEach(team => {
                    team.players = team.playerIds.map(id => playersMap[id]).filter(Boolean);
                });
            }

            return teams;
        } catch (error) {
            console.error('Failed to fetch teams:', error);
            return [];
        }
    }

    // Rest of methods remain the same...
    async getTeamById(id: string, includeRelations: boolean = false): Promise<Team | undefined> {
        try {
            const response = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: id
            });

            const team = this.mapRowToTeam(response);

            if (includeRelations) {
                if (team.playerIds.length > 0) {
                    team.players = await userService.getUsersByIds(team.playerIds);
                }

                if (team.captainId) {
                    team.captain = await userService.getUserById(team.captainId);
                }

                if (team.pending.length > 0) {
                    team.pendingPlayers = await userService.getUsersByIds(team.pending);
                }
            }

            return team;
        } catch (error) {
            console.error('Failed to fetch team:', error);
            return undefined;
        }
    }

    async getTeamsByUserId(userId: string): Promise<Team[]> {
        try {
            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                queries: [
                    Query.contains('playerIds', userId),
                    Query.limit(50)
                ]
            });

            return response.rows.map(row => this.mapRowToTeam(row));
        } catch (error) {
            console.error('Failed to fetch user teams:', error);
            return [];
        }
    }

    async invitePlayerToTeam(teamId: string, playerId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team) return false;

            if (team.playerIds.includes(playerId) || team.pending.includes(playerId)) {
                return false;
            }

            const totalAfterAccept = team.currentSize + team.pending.length + 1;
            if (totalAfterAccept > team.teamSize) {
                throw new Error('Team would exceed maximum player limit');
            }

            const updatedPending = [...team.pending, playerId];
            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { pending: updatedPending }
            });

            await userService.addTeamInvitation(playerId, teamId);
            return true;
        } catch (error) {
            console.error('Failed to invite player to team:', error);
            return false;
        }
    }

    async acceptTeamInvitation(teamId: string, playerId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team || !team.pending.includes(playerId)) {
                return false;
            }

            if (team.currentSize >= team.teamSize) {
                throw new Error('Team is already at maximum capacity');
            }

            const updatedPending = team.pending.filter(id => id !== playerId);
            const updatedPlayerIds = [...team.playerIds, playerId];

            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: {
                    pending: updatedPending,
                    playerIds: updatedPlayerIds
                }
            });

            const user = await userService.getUserById(playerId);
            if (user) {
                const updatedTeamIds = [...user.teamIds, teamId];
                const updatedInvites = user.teamInvites.filter(id => id !== teamId);

                await userService.updateUser(playerId, {
                    teamIds: updatedTeamIds,
                    teamInvites: updatedInvites
                });
            }

            return true;
        } catch (error) {
            console.error('Failed to accept team invitation:', error);
            return false;
        }
    }

    async removeTeamInvitation(teamId: string, playerId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team || !team.pending.includes(playerId)) {
                return false;
            }

            const updatedPending = team.pending.filter(id => id !== playerId);
            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { pending: updatedPending }
            });

            await userService.removeTeamInvitation(playerId, teamId);
            return true;
        } catch (error) {
            console.error('Failed to reject team invitation:', error);
            return false;
        }
    }

    async removePlayerFromTeam(teamId: string, playerId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team || !team.playerIds.includes(playerId)) {
                return false;
            }

            if (team.captainId === playerId) {
                throw new Error('Cannot remove team captain');
            }

            const updatedPlayerIds = team.playerIds.filter(id => id !== playerId);

            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: {
                    playerIds: updatedPlayerIds
                }
            });

            const user = await userService.getUserById(playerId);
            if (user) {
                const updatedTeamIds = user.teamIds.filter(id => id !== teamId);
                await userService.updateUser(playerId, { teamIds: updatedTeamIds });
            }

            return true;
        } catch (error) {
            console.error('Failed to remove player from team:', error);
            return false;
        }
    }

    private mapRowToTeam(row: any): Team {
        const currentSize = (row.playerIds || []).length;
        const maxPlayers = row.teamSize;

        const team: Team = {
            ...row,
            profileImageId: row.profileImage || row.profileImageId || row.profileImageID,
            // Computed properties
            currentSize,
            isFull: currentSize >= maxPlayers,
            winRate: getTeamWinRate({
                wins: row.wins || 0,
                losses: row.losses || 0
            } as Team),
            avatarUrl: getTeamAvatarUrl({
                name: row.name,
                profileImageId: row.profileImage
            } as Team)
        };

        return team;
    }
}

export const teamService = new TeamService();
