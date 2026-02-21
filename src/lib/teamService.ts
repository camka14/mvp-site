import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';
import { InviteType, Team, UserData, getTeamWinRate, getTeamAvatarUrl } from '@/types';
import { userService } from './userService';
import { inferDivisionDetails } from '@/lib/divisionTypes';

const isDefined = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;
export type TeamInviteRoleType = Extract<
    InviteType,
    'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach'
>;

class TeamService {
    async getTeamById(id: string, includeRelations: boolean = false): Promise<Team | undefined> {
        try {
            const response = await apiRequest<any>(`/api/teams/${id}`);

            const team = this.mapRowToTeam(response);

            if (includeRelations) {
                await this.hydrateTeamRelations(team);
            }

            return team;
        } catch (error) {
            console.error('Failed to fetch team:', error);
            return undefined;
        }
    }

    private async hydrateTeamRelations(team: Team): Promise<void> {
        if (!team) {
            return;
        }

        const [players, pendingPlayers] = await Promise.all([
            team.playerIds.length > 0 ? userService.getUsersByIds(team.playerIds) : Promise.resolve<UserData[]>([]),
            team.pending.length > 0 ? userService.getUsersByIds(team.pending) : Promise.resolve<UserData[]>([]),
        ]);

        const playersById = new Map(players.map((player) => [player.$id, player]));
        const pendingById = new Map(pendingPlayers.map((player) => [player.$id, player]));

        team.players = team.playerIds
            .map((playerId) => playersById.get(playerId))
            .filter(isDefined);

        team.pendingPlayers = team.pending
            .map((pendingId) => pendingById.get(pendingId))
            .filter(isDefined);

        const resolveKnownUser = (userId: string) => (
            playersById.get(userId) ?? pendingById.get(userId)
        );

        if (team.captainId) {
            team.captain = resolveKnownUser(team.captainId)
                ?? await userService.getUserById(team.captainId)
                ?? undefined;
        } else {
            team.captain = undefined;
        }

        const managerId = team.managerId ?? team.captainId;
        if (managerId) {
            team.manager = resolveKnownUser(managerId)
                ?? await userService.getUserById(managerId)
                ?? undefined;
        } else {
            team.manager = undefined;
        }

        if (team.headCoachId) {
            team.headCoach = resolveKnownUser(team.headCoachId)
                ?? await userService.getUserById(team.headCoachId)
                ?? undefined;
        } else {
            team.headCoach = undefined;
        }

        const assistantCoachIds = Array.isArray(team.assistantCoachIds)
            ? team.assistantCoachIds
            : (Array.isArray(team.coachIds) ? team.coachIds : []);
        if (assistantCoachIds.length > 0) {
            const missingCoachIds = assistantCoachIds.filter((coachId) => !resolveKnownUser(coachId));
            const fetchedCoaches = missingCoachIds.length > 0
                ? await userService.getUsersByIds(missingCoachIds)
                : [];
            const fetchedCoachMap = new Map(fetchedCoaches.map((coach) => [coach.$id, coach]));
            team.assistantCoaches = assistantCoachIds
                .map((coachId) => resolveKnownUser(coachId) ?? fetchedCoachMap.get(coachId))
                .filter(isDefined);
            team.coaches = team.assistantCoaches;
        } else {
            team.assistantCoaches = [];
            team.coaches = [];
        }

        team.currentSize = team.playerIds.length;
        team.isFull = team.currentSize >= team.teamSize;
        team.winRate = getTeamWinRate(team);
        team.avatarUrl = getTeamAvatarUrl(team);
    }

    async createTeam(
        name: string,
        captainId: string,
        division: string = 'Open',
        sport: string = 'Volleyball',
        maxPlayers: number = 6,
        profileImageId?: string,
        options?: {
            divisionTypeId?: string;
            divisionTypeName?: string;
        },
    ): Promise<Team> {
        try {
            const inferredDivision = inferDivisionDetails({
                identifier: division,
                sportInput: sport,
            });
            const teamData = {
                name,
                seed: 0,
                division,
                divisionTypeId: options?.divisionTypeId ?? inferredDivision.divisionTypeId,
                divisionTypeName: options?.divisionTypeName ?? inferredDivision.divisionTypeName,
                sport,
                wins: 0,
                losses: 0,
                playerIds: [captainId],
                captainId,
                managerId: captainId,
                headCoachId: null,
                assistantCoachIds: [],
                pending: [],
                teamSize: maxPlayers,
                profileImageId: profileImageId || ''
            };

            const response = await apiRequest<any>('/api/teams', {
                method: 'POST',
                body: { ...teamData, id: createId() },
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
        return this.inviteUserToTeamRole(team, user, 'player');
    }

    async inviteUserToTeamRole(team: Team, user: UserData, inviteType: TeamInviteRoleType): Promise<boolean> {
        try {
            if (inviteType === 'player') {
                if (team.playerIds.includes(user.$id)) {
                    // Player already on team; nothing to do
                    return false;
                }
                if (team.pending.includes(user.$id)) {
                    // Invite already pending; avoid duplicate invite rows and emails.
                    return false;
                }

                const pendingSet = new Set(team.pending ?? []);
                pendingSet.add(user.$id);
                const updatedPending = Array.from(pendingSet);

                await apiRequest(`/api/teams/${team.$id}`, {
                    method: 'PATCH',
                    body: { team: { pending: updatedPending } },
                });
            } else if (inviteType === 'team_manager') {
                if (team.managerId === user.$id) {
                    return false;
                }
            } else if (inviteType === 'team_head_coach') {
                if (team.headCoachId === user.$id) {
                    return false;
                }
            } else if (inviteType === 'team_assistant_coach') {
                const assistantCoachIds = team.assistantCoachIds ?? team.coachIds ?? [];
                if (assistantCoachIds.includes(user.$id)) {
                    return false;
                }
            }

            if (inviteType === 'player') {
                await userService.addTeamInvitation(user.$id, team.$id);
            } else {
                await userService.addTeamInvitation(user.$id, team.$id, inviteType);
            }
            return true;
        } catch (error) {
            console.error('Failed to invite user to team:', error);
            return false;
        }
    }

    private mapRowToTeam(row: any): Team {
        const playerIds = Array.isArray(row.playerIds)
            ? row.playerIds.filter((value: any): value is string => typeof value === 'string')
            : [];
        const pending = Array.isArray(row.pending)
            ? row.pending.filter((value: any): value is string => typeof value === 'string')
            : [];
        const teamSize = typeof row.teamSize === 'number' ? row.teamSize : playerIds.length;
        const wins = typeof row.wins === 'number' ? row.wins : Number(row.wins ?? 0);
        const losses = typeof row.losses === 'number' ? row.losses : Number(row.losses ?? 0);

        const team: Team = {
            $id: row.$id,
            name: row.name,
            seed: typeof row.seed === 'number' ? row.seed : Number(row.seed ?? 0),
            division: typeof row.division === 'string' ? row.division : (row.division?.name ?? 'Open'),
            divisionTypeId:
                typeof row.divisionTypeId === 'string' && row.divisionTypeId.trim().length
                    ? row.divisionTypeId
                    : undefined,
            divisionTypeName:
                typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length
                    ? row.divisionTypeName
                    : undefined,
            sport: typeof row.sport === 'string' ? row.sport : (row.sport?.name ?? 'Volleyball'),
            wins,
            losses,
            playerIds,
            captainId: row.captainId,
            managerId: typeof row.managerId === 'string' && row.managerId.trim().length > 0
                ? row.managerId
                : row.captainId,
            headCoachId:
                typeof row.headCoachId === 'string' && row.headCoachId.trim().length > 0
                    ? row.headCoachId
                    : null,
            assistantCoachIds: Array.isArray(row.assistantCoachIds)
                ? row.assistantCoachIds.filter((value: any): value is string => typeof value === 'string')
                : Array.isArray(row.coachIds)
                ? row.coachIds.filter((value: any): value is string => typeof value === 'string')
                : [],
            coachIds: Array.isArray(row.assistantCoachIds)
                ? row.assistantCoachIds.filter((value: any): value is string => typeof value === 'string')
                : Array.isArray(row.coachIds)
                ? row.coachIds.filter((value: any): value is string => typeof value === 'string')
                : [],
            parentTeamId: typeof row.parentTeamId === 'string' && row.parentTeamId.trim().length > 0
                ? row.parentTeamId
                : null,
            pending,
            teamSize,
            profileImageId: row.profileImageId || row.profileImage || row.profileImageID,
            $createdAt: row.$createdAt,
            $updatedAt: row.$updatedAt,
            winRate: 0,
            currentSize: playerIds.length,
            isFull: playerIds.length >= teamSize,
            avatarUrl: '',
        };

        team.winRate = getTeamWinRate(team);
        team.avatarUrl = getTeamAvatarUrl(team);

        return team;
    }

    async getTeamsByIds(teamIds: string[], includeRelations: boolean = false): Promise<Team[]> {
        try {
            if (teamIds.length === 0) return [];

            const params = new URLSearchParams();
            params.set('ids', teamIds.join(','));
            const response = await apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);

            const teams = (response.teams ?? []).map(row => this.mapRowToTeam(row));

            if (includeRelations) {
                await Promise.all(teams.map((team) => this.hydrateTeamRelations(team)));
            }

            return teams;
        } catch (error) {
            console.error('Failed to fetch teams:', error);
            return [];
        }
    }

    async getTeamsByUserId(userId: string): Promise<Team[]> {
        try {
            const params = new URLSearchParams();
            params.set('playerId', userId);
            params.set('limit', '100');
            const response = await apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);

            return (response.teams ?? []).map((row: any) => this.mapRowToTeam(row));
        } catch (error) {
            console.error('Failed to fetch user teams:', error);
            return [];
        }
    }

    async updateTeamProfileImage(teamId: string, fileId: string): Promise<Team | undefined> {
        try {
            const response = await apiRequest<any>(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: { profileImageId: fileId, profileImage: fileId } },
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team profile image:', error);
            return undefined;
        }
    }

    async updateTeamName(teamId: string, name: string): Promise<Team | undefined> {
        try {
            const response = await apiRequest<any>(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: { name } },
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team name:', error);
            return undefined;
        }
    }

    async updateTeamDetails(
        teamId: string,
        updates: Partial<Pick<Team, 'name' | 'sport' | 'division' | 'divisionTypeId' | 'divisionTypeName' | 'teamSize' | 'seed' | 'wins' | 'losses'>>,
    ): Promise<Team | undefined> {
        try {
            const response = await apiRequest<any>(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: updates },
            });
            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team details:', error);
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

            await apiRequest(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: { playerIds: nextPlayerIds, pending: nextPending } },
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

    async removeTeamInvitation(teamId: string, userId: string, inviteType: TeamInviteRoleType = 'player'): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team) {
                return false;
            }

            if (inviteType === 'player') {
                const nextPending = team.pending.filter(id => id !== userId);

                await apiRequest(`/api/teams/${teamId}`, {
                    method: 'PATCH',
                    body: { team: { pending: nextPending } },
                });
            }

            await userService.removeTeamInvitation(userId, teamId, inviteType);
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

            await apiRequest(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: { playerIds: nextPlayerIds } },
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

            await apiRequest(`/api/teams/${teamId}`, { method: 'DELETE' });

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
