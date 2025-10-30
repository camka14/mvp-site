import { databases } from '@/app/appwrite';
import { Team, UserData, getTeamWinRate, getTeamAvatarUrl, Division } from '@/types';
import { userService } from './userService';
import { ID, Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const TEAMS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID!;

class TeamService {
    /**
     * Get team with all relationships expanded
     */
    async getTeamWithRelations(id: string): Promise<Team | undefined> {
        try {
            // Use Query.select to expand relationships
            const queries = [
                Query.select([
                    '*',
                    'players.*',
                    'captain.*',
                    'pending.*',
                    'matches.*'
                ])
            ];

            const response = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: id,
                queries
            });

            return this.mapRowToTeamWithRelations(response);
        } catch (error) {
            console.error('Failed to fetch team with relations:', error);
            return undefined;
        }
    }

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

    async createTeam(
        name: string,
        captainId: string,
        division: string = 'Open',
        sport: string = 'Volleyball',
        maxPlayers: number = 6,
        profileImageId?: string
    ): Promise<Team> {
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
                profileImageId: profileImageId || ''
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

    async invitePlayerToTeam(team: Team, user: UserData): Promise<boolean> {
        try {
            if (team.playerIds.includes(user.$id)) {
                // Player already on team; nothing to do
                return false;
            }

            const pendingSet = new Set(team.pending ?? []);
            pendingSet.add(user.$id);
            const updatedPending = Array.from(pendingSet);

            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: team.$id,
                data: {
                    pending: updatedPending,
                },
            });

            await userService.addTeamInvitation(user.$id, team.$id);
            return true;
        } catch (error) {
            console.error('Failed to invite player to team:', error);
            return false;
        }
    }

    private mapRowToTeam(row: any): Team {
        const playerIds = Array.isArray(row.playerIds) ? row.playerIds : [];
        const pending = Array.isArray(row.pending) ? row.pending : [];
        const teamSize = typeof row.teamSize === 'number' ? row.teamSize : playerIds.length;
        const wins = typeof row.wins === 'number' ? row.wins : Number(row.wins ?? 0);
        const losses = typeof row.losses === 'number' ? row.losses : Number(row.losses ?? 0);

        let division: Division | string;
        if (row.division && typeof row.division === 'object' && ('id' in row.division || 'name' in row.division)) {
            division = row.division as Division;
        } else {
            division = (row.division as string) || 'Open';
        }

        const team: Team = {
            $id: row.$id,
            name: row.name,
            seed: typeof row.seed === 'number' ? row.seed : Number(row.seed ?? 0),
            division,
            sport: typeof row.sport === 'string' ? row.sport : (row.sport?.name ?? 'Volleyball'),
            wins,
            losses,
            playerIds,
            captainId: row.captainId,
            pending,
            teamSize,
            profileImageId: row.profileImage || row.profileImageId || row.profileImageID,
            $createdAt: row.$createdAt,
            $updatedAt: row.$updatedAt,
            winRate: 0,
            currentSize: playerIds.length,
            isFull: playerIds.length >= teamSize,
            avatarUrl: '',
        };

        const totalMatches = team.wins + team.losses;
        team.winRate = totalMatches === 0 ? 0 : Math.round((team.wins / totalMatches) * 100);
        team.avatarUrl = getTeamAvatarUrl(team);

        return team;
    }

    private mapRowToTeamWithRelations(row: any): Team {
        const team = this.mapRowToTeam(row);

        // Process expanded relationships
        if (row.players && Array.isArray(row.players)) {
            team.players = row.players.map((playerData: any) => ({
                ...playerData,
                fullName: `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim(),
                avatarUrl: '' // Will be computed by helper function
            }));
        }

        if (row.captain) {
            team.captain = {
                ...row.captain,
                fullName: `${row.captain.firstName || ''} ${row.captain.lastName || ''}`.trim(),
                avatarUrl: ''
            };
        }

        if (row.pending && Array.isArray(row.pending)) {
            team.pendingPlayers = row.pending.map((playerData: any) => ({
                ...playerData,
                fullName: `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim(),
                avatarUrl: ''
            }));
        }

        return team;
    }

    // Rest of the methods remain the same as they don't need relationship changes
    async getTeamsByIds(teamIds: string[], includeRelations: boolean = false): Promise<Team[]> {
        try {
            if (teamIds.length === 0) return [];

            const queries = [
                Query.limit(50),
                Query.contains('$id', teamIds)
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

    async getTeamsByUserId(userId: string): Promise<Team[]> {
        try {
            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                queries: [
                    Query.limit(100),
                    Query.contains('playerIds', userId),
                ],
            });

            return response.rows.map((row: any) => this.mapRowToTeam(row));
        } catch (error) {
            console.error('Failed to fetch user teams:', error);
            return [];
        }
    }

    async updateTeamProfileImage(teamId: string, fileId: string): Promise<Team | undefined> {
        try {
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: {
                    profileImageId: fileId,
                    profileImage: fileId,
                },
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team profile image:', error);
            return undefined;
        }
    }

    async updateTeamName(teamId: string, name: string): Promise<Team | undefined> {
        try {
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { name },
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team name:', error);
            return undefined;
        }
    }

    async acceptTeamInvitation(teamId: string, userId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team) {
                return false;
            }

            const nextPlayerIds = Array.from(new Set([...team.playerIds, userId]));
            const nextPending = team.pending.filter(id => id !== userId);

            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: {
                    playerIds: nextPlayerIds,
                    pending: nextPending,
                },
            });

            const user = await userService.getUserById(userId);
            if (user) {
                const updatedTeamIds = Array.from(new Set([...(user.teamIds || []), teamId]));
                await userService.updateUser(userId, { teamIds: updatedTeamIds });
            }

            await userService.removeTeamInvitation(userId, teamId);
            return true;
        } catch (error) {
            console.error('Failed to accept team invitation:', error);
            return false;
        }
    }

    async removeTeamInvitation(teamId: string, userId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team) {
                return false;
            }

            const nextPending = team.pending.filter(id => id !== userId);

            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { pending: nextPending },
            });

            await userService.removeTeamInvitation(userId, teamId);
            return true;
        } catch (error) {
            console.error('Failed to remove team invitation:', error);
            return false;
        }
    }

    async removePlayerFromTeam(teamId: string, userId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team) {
                return false;
            }

            const nextPlayerIds = team.playerIds.filter(id => id !== userId);

            await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
                data: { playerIds: nextPlayerIds },
            });

            const user = await userService.getUserById(userId);
            if (user) {
                const updatedTeamIds = (user.teamIds || []).filter(id => id !== teamId);
                await userService.updateUser(userId, { teamIds: updatedTeamIds });
            }

            return true;
        } catch (error) {
            console.error('Failed to remove player from team:', error);
            return false;
        }
    }

    async deleteTeam(teamId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);

            await databases.deleteRow({
                databaseId: DATABASE_ID,
                tableId: TEAMS_TABLE_ID,
                rowId: teamId,
            });

            if (team) {
                await Promise.all(team.playerIds.map(async (playerId) => {
                    const user = await userService.getUserById(playerId);
                    if (!user) return;
                    const updatedTeamIds = (user.teamIds || []).filter(id => id !== teamId);
                    await userService.updateUser(playerId, { teamIds: updatedTeamIds });
                }));

                await Promise.all(team.pending.map(async (userId) => {
                    await userService.removeTeamInvitation(userId, teamId);
                }));
            }

            return true;
        } catch (error) {
            console.error('Failed to delete team:', error);
            return false;
        }
    }
}

export const teamService = new TeamService();
