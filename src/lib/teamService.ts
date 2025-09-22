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

    private mapRowToTeam(row: any): Team {
        const currentSize = (row.playerIds || []).length;
        const maxPlayers = row.teamSize;

        // Handle division - could be expanded object or string ID
        let division: Division | string;
        if (typeof row.division === 'object' && row.division.id) {
            division = row.division as Division;
        } else {
            division = row.division || 'Open';
        }

        const team: Team = {
            ...row,
            division,
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

    // All other methods remain the same...
    // (deleteTeam, updateTeamProfileImage, updateTeamName, getTeamsByUserId, etc.)
}

export const teamService = new TeamService();
