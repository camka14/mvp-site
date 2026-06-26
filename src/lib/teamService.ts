import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';
import { Bill, Invite, Team, UserData, getTeamAvatarUrl } from '@/types';
import type {
    RegistrationQuestion,
    RegistrationQuestionAnswerInput,
    RegistrationQuestionDraft,
    RegistrationQuestionResponse,
    TeamJoinPolicy,
    TeamJoinRequest,
    TeamPlayerRegistration,
} from '@/types';
import { userService, type UserVisibilityContext } from './userService';
import { inferDivisionDetails } from '@/lib/divisionTypes';

const isDefined = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;
export type TeamInviteRoleType = 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach';
export type TeamInviteEventTeamOption = {
    eventId: string;
    eventTeamId: string;
    eventName: string;
    eventStart: string | null;
    eventEnd: string | null;
    teamName: string;
};
export type TeamInviteFreeAgentContext = {
    users: UserData[];
    eventIds: string[];
    freeAgentIds: string[];
    eventTeams: TeamInviteEventTeamOption[];
    freeAgentEventsByUserId: Record<string, string[]>;
    freeAgentEventTeamIdsByUserId: Record<string, string[]>;
};
export type TeamInviteOptions = {
    eventTeamIds?: string[];
};
export type TeamRegistrationConsent = {
    documentId?: string | null;
    status?: string | null;
    childEmail?: string | null;
    requiresChildEmail?: boolean;
};

export type TeamRegistrationResult = {
    registrationId?: string;
    status?: string;
    registration?: TeamPlayerRegistration | null;
    consent?: TeamRegistrationConsent;
    warnings?: string[];
    team?: Team | null;
    requiresParentApproval?: boolean;
    invite?: Invite | null;
    message?: string;
};

export type TeamRegistrationCheckoutTarget = {
    id?: string;
    teamId: string;
    registrantId?: string;
    userId?: string;
    parentId?: string | null;
    registrantType?: string;
    rosterRole?: string;
    consentDocumentId?: string | null;
    consentStatus?: string | null;
};

export type TeamJoinRequestContext = {
    teamId: string;
    joinPolicy: TeamJoinPolicy;
    openRegistration: boolean;
    registrationPriceCents: number;
    questions: RegistrationQuestion[];
    currentRequest?: TeamJoinRequest | null;
};

class TeamService {
    async getTeamById(
        id: string,
        includeRelations: boolean = false,
        visibilityContext: UserVisibilityContext = {},
    ): Promise<Team | undefined> {
        try {
            const response = await apiRequest<any>(`/api/teams/${id}`);

            const team = this.mapRowToTeam(response);

            if (includeRelations) {
                await this.hydrateTeamRelations(team, visibilityContext);
            }

            return team;
        } catch (error) {
            console.error('Failed to fetch team:', error);
            return undefined;
        }
    }

    private async hydrateTeamRelations(
        team: Team,
        visibilityContext: UserVisibilityContext = {},
    ): Promise<void> {
        if (!team) {
            return;
        }

        const scopedVisibilityContext: UserVisibilityContext = {
            teamId: team.$id,
            eventId: visibilityContext.eventId,
        };

        const [players, pendingPlayers] = await Promise.all([
            team.playerIds.length > 0
                ? userService.getUsersByIds(team.playerIds, scopedVisibilityContext)
                : Promise.resolve<UserData[]>([]),
            team.pending.length > 0
                ? userService.getUsersByIds(team.pending, scopedVisibilityContext)
                : Promise.resolve<UserData[]>([]),
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
                ?? await userService.getUserById(team.captainId, scopedVisibilityContext)
                ?? undefined;
        } else {
            team.captain = undefined;
        }

        const managerId = team.managerId ?? team.captainId;
        if (managerId) {
            team.manager = resolveKnownUser(managerId)
                ?? await userService.getUserById(managerId, scopedVisibilityContext)
                ?? undefined;
        } else {
            team.manager = undefined;
        }

        if (team.headCoachId) {
            team.headCoach = resolveKnownUser(team.headCoachId)
                ?? await userService.getUserById(team.headCoachId, scopedVisibilityContext)
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
                ? await userService.getUsersByIds(missingCoachIds, scopedVisibilityContext)
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
        team.avatarUrl = getTeamAvatarUrl(team);
    }

    async createTeam(
        name: string,
        captainId: string,
        division: string = 'Open',
        sport: string = 'Indoor Volleyball',
        maxPlayers: number = 6,
        profileImageId?: string,
          options?: {
              divisionTypeId?: string;
              addSelfAsPlayer?: boolean;
              organizationId?: string;
              joinPolicy?: TeamJoinPolicy;
              openRegistration?: boolean;
              registrationPriceCents?: number;
              affiliateUrl?: string | null;
              requiredTemplateIds?: string[];
          },
      ): Promise<Team> {
        try {
            const inferredDivision = inferDivisionDetails({
                identifier: division,
                sportInput: sport,
            });
            const addSelfAsPlayer = options?.addSelfAsPlayer ?? true;
            const normalizedCaptainId = typeof captainId === 'string' ? captainId.trim() : '';
            const initialPlayerIds = addSelfAsPlayer && normalizedCaptainId ? [normalizedCaptainId] : [];
            const teamData = {
                name,
                division,
                divisionTypeId: options?.divisionTypeId ?? inferredDivision.divisionTypeId,
                sport,
                playerIds: initialPlayerIds,
                captainId: addSelfAsPlayer ? normalizedCaptainId : '',
                managerId: normalizedCaptainId,
                headCoachId: null,
                assistantCoachIds: [],
                pending: [],
                teamSize: maxPlayers,
                profileImageId: profileImageId || '',
                addSelfAsPlayer,
                  organizationId: options?.organizationId,
                  joinPolicy: options?.joinPolicy ?? (options?.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED'),
                  openRegistration: (options?.joinPolicy ?? (options?.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED')) === 'OPEN_REGISTRATION',
                  registrationPriceCents: (options?.joinPolicy === 'REQUEST_TO_JOIN' || options?.openRegistration)
                      ? Math.max(0, Math.round(options?.registrationPriceCents ?? 0))
                      : 0,
                  affiliateUrl: options?.affiliateUrl ?? null,
                  requiredTemplateIds: Array.isArray(options?.requiredTemplateIds) ? options.requiredTemplateIds : [],
              };

            const response = await apiRequest<any>('/api/teams', {
                method: 'POST',
                body: { ...teamData, id: createId() },
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to create team:', error);
            throw error;
        }
    }

    async invitePlayerToTeam(team: Team, user: UserData): Promise<boolean> {
        return this.inviteUserToTeamRole(team, user, 'player');
    }

    async inviteUserToTeamRole(
        team: Team,
        user: UserData,
        inviteType: TeamInviteRoleType,
        options: TeamInviteOptions = {},
    ): Promise<boolean> {
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

            await apiRequest(`/api/teams/${encodeURIComponent(team.$id)}/member-invites`, {
                method: 'POST',
                body: {
                    userId: user.$id,
                    role: inviteType,
                    eventTeamIds: options.eventTeamIds ?? [],
                },
            });
            return true;
        } catch (error) {
            console.error('Failed to invite user to team:', error);
            return false;
        }
    }

    async inviteEmailToTeamRole(
        team: Team,
        email: string,
        inviteType: TeamInviteRoleType,
        options: TeamInviteOptions = {},
    ): Promise<boolean> {
        try {
            await apiRequest(`/api/teams/${encodeURIComponent(team.$id)}/member-invites`, {
                method: 'POST',
                body: {
                    email: email.trim().toLowerCase(),
                    role: inviteType,
                    eventTeamIds: options.eventTeamIds ?? [],
                },
            });
            return true;
        } catch (error) {
            console.error('Failed to invite email to team:', error);
            return false;
        }
    }

    private mapRowToPlayerRegistrations(value: unknown): TeamPlayerRegistration[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((row: any): TeamPlayerRegistration | null => {
                const id = typeof row?.$id === 'string' ? row.$id : (typeof row?.id === 'string' ? row.id : '');
                const userId = typeof row?.userId === 'string'
                    ? row.userId
                    : (typeof row?.registrantId === 'string' ? row.registrantId : '');
                const teamId = typeof row?.teamId === 'string'
                    ? row.teamId
                    : (typeof row?.eventTeamId === 'string' ? row.eventTeamId : null);
                const jerseyNumber = typeof row?.jerseyNumber === 'string' && row.jerseyNumber.trim().length > 0
                    ? row.jerseyNumber.trim()
                    : null;
                const position = typeof row?.position === 'string' && row.position.trim().length > 0
                    ? row.position.trim()
                    : null;

                if (!id || !userId) {
                    return null;
                }

                  return {
                      id,
                      teamId,
                      userId,
                      registrantId: typeof row?.registrantId === 'string' ? row.registrantId : userId,
                      parentId: typeof row?.parentId === 'string' ? row.parentId : null,
                      registrantType: typeof row?.registrantType === 'string' ? row.registrantType : 'SELF',
                      rosterRole: typeof row?.rosterRole === 'string' ? row.rosterRole : 'PARTICIPANT',
                      status: typeof row?.status === 'string' ? row.status : '',
                      jerseyNumber,
                      position,
                      isCaptain: Boolean(row?.isCaptain),
                      consentDocumentId: typeof row?.consentDocumentId === 'string' ? row.consentDocumentId : null,
                      consentStatus: typeof row?.consentStatus === 'string' ? row.consentStatus : null,
                      createdBy: typeof row?.createdBy === 'string' ? row.createdBy : null,
                  } satisfies TeamPlayerRegistration;
            })
            .filter((row: TeamPlayerRegistration | null): row is TeamPlayerRegistration => Boolean(row));
    }

    private mapRowToTeam(row: any): Team {
        const playerIds = Array.isArray(row.playerIds)
            ? row.playerIds.filter((value: any): value is string => typeof value === 'string')
            : [];
        const pending = Array.isArray(row.pending)
            ? row.pending.filter((value: any): value is string => typeof value === 'string')
            : [];
        const playerRegistrations = this.mapRowToPlayerRegistrations(row.playerRegistrations);
        const teamSize = typeof row.teamSize === 'number' ? row.teamSize : playerIds.length;

        const teamId =
            typeof row.$id === 'string' && row.$id.trim().length > 0
                ? row.$id
                : typeof row.id === 'string' && row.id.trim().length > 0
                    ? row.id
                    : row.$id;

        const team: Team = {
            $id: teamId,
            name: row.name,
            division: typeof row.division === 'string' ? row.division : (row.division?.name ?? 'Open'),
            divisionTypeId:
                typeof row.divisionTypeId === 'string' && row.divisionTypeId.trim().length
                    ? row.divisionTypeId
                    : undefined,
            sport: typeof row.sport === 'string' ? row.sport : (row.sport?.name ?? 'Indoor Volleyball'),
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
            playerRegistrations,
            teamSize,
            profileImageId: row.profileImageId || row.profileImage || row.profileImageID,
            organizationId: typeof row.organizationId === 'string' && row.organizationId.trim().length > 0
                ? row.organizationId
                : null,
              createdBy: typeof row.createdBy === 'string' && row.createdBy.trim().length > 0
                  ? row.createdBy
                  : null,
              openRegistration: Boolean(row.openRegistration),
              joinPolicy: typeof row.joinPolicy === 'string' && ['CLOSED', 'OPEN_REGISTRATION', 'REQUEST_TO_JOIN'].includes(row.joinPolicy)
                  ? row.joinPolicy
                  : (row.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED'),
              registrationPriceCents: typeof row.registrationPriceCents === 'number'
                  ? Math.max(0, Math.round(row.registrationPriceCents))
                  : 0,
              affiliateUrl: typeof row.affiliateUrl === 'string' && row.affiliateUrl.trim().length > 0
                  ? row.affiliateUrl
                  : null,
              requiredTemplateIds: Array.isArray(row.requiredTemplateIds)
                  ? row.requiredTemplateIds.filter((value: any): value is string => typeof value === 'string' && value.trim().length > 0)
                  : [],
              visibility: typeof row.visibility === 'string' && row.visibility.trim().length > 0
                  ? row.visibility
                  : 'PUBLIC',
              $createdAt: row.$createdAt,
              $updatedAt: row.$updatedAt,
            currentSize: playerIds.length,
            isFull: playerIds.length >= teamSize,
            avatarUrl: '',
        };

        team.avatarUrl = getTeamAvatarUrl(team);

        return team;
    }

    async getTeamsByIds(
        teamIds: string[],
        includeRelations: boolean = false,
        visibilityContext: UserVisibilityContext = {},
    ): Promise<Team[]> {
        try {
            if (teamIds.length === 0) return [];

            const params = new URLSearchParams();
            params.set('ids', teamIds.join(','));
            if (visibilityContext.eventId) {
                params.set('eventId', visibilityContext.eventId);
            }
            const response = await apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);

            const teams = (response.teams ?? []).map(row => this.mapRowToTeam(row));

            if (includeRelations) {
                await Promise.all(teams.map((team) => this.hydrateTeamRelations(team, visibilityContext)));
            }

            return teams;
        } catch (error) {
            console.error('Failed to fetch teams:', error);
            return [];
        }
    }

    async getTeamsByOrganizationId(
        organizationId: string,
        includeRelations: boolean = false,
        visibilityContext: UserVisibilityContext = {},
        limit: number = 100,
    ): Promise<Team[]> {
        try {
            const normalizedOrganizationId = organizationId.trim();
            if (!normalizedOrganizationId) return [];

            const params = new URLSearchParams();
            params.set('organizationId', normalizedOrganizationId);
            params.set('limit', String(limit));
            const response = await apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);

            const teams = (response.teams ?? []).map((row) => this.mapRowToTeam(row));

            if (includeRelations) {
                await Promise.all(teams.map((team) => this.hydrateTeamRelations(team, visibilityContext)));
            }

            return teams;
        } catch (error) {
            console.error('Failed to fetch organization teams:', error);
            return [];
        }
    }

    async searchOpenRegistrationTeams(
        query: string = '',
        limit: number = 100,
    ): Promise<Team[]> {
        try {
            const params = new URLSearchParams();
            const normalizedQuery = query.trim();
            if (normalizedQuery) {
                params.set('query', normalizedQuery);
            }
            params.set('openRegistration', 'true');
            params.set('limit', String(limit));
            const response = await apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);
            return (response.teams ?? [])
                .map((row: any) => this.mapRowToTeam(row))
                .filter((team) => team.openRegistration === true);
        } catch (error) {
            console.error('Failed to search open registration teams:', error);
            return [];
        }
    }

    async getTeamsByUserId(userId: string): Promise<Team[]> {
        try {
            const params = new URLSearchParams();
            params.set('playerId', userId);
            params.set('managerId', userId);
            params.set('limit', '100');
            const response = await apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);

            return (response.teams ?? []).map((row: any) => this.mapRowToTeam(row));
        } catch (error) {
            console.error('Failed to fetch user teams:', error);
            return [];
        }
    }

    async getInviteFreeAgentContext(teamId: string): Promise<TeamInviteFreeAgentContext> {
        try {
            const response = await apiRequest<Partial<TeamInviteFreeAgentContext>>(
                `/api/teams/${encodeURIComponent(teamId)}/invite-free-agents`
            );
            return {
                users: response.users ?? [],
                eventIds: response.eventIds ?? [],
                freeAgentIds: response.freeAgentIds ?? [],
                eventTeams: response.eventTeams ?? [],
                freeAgentEventsByUserId: response.freeAgentEventsByUserId ?? {},
                freeAgentEventTeamIdsByUserId: response.freeAgentEventTeamIdsByUserId ?? {},
            };
        } catch (error) {
            console.error('Failed to fetch invite free agents:', error);
            return {
                users: [],
                eventIds: [],
                freeAgentIds: [],
                eventTeams: [],
                freeAgentEventsByUserId: {},
                freeAgentEventTeamIdsByUserId: {},
            };
        }
    }

    async getInviteFreeAgents(teamId: string): Promise<UserData[]> {
        const context = await this.getInviteFreeAgentContext(teamId);
        return context.users;
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
        updates: Partial<Pick<Team, 'name' | 'sport' | 'division' | 'divisionTypeId' | 'teamSize' | 'captainId' | 'joinPolicy' | 'openRegistration' | 'registrationPriceCents' | 'affiliateUrl' | 'requiredTemplateIds' | 'playerRegistrations'>>,
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

    async updateTeamRosterAndRoles(
        teamId: string,
        updates: Partial<Pick<Team, 'playerIds' | 'captainId' | 'managerId' | 'headCoachId' | 'assistantCoachIds' | 'coachIds'>>,
    ): Promise<Team | undefined> {
        try {
            const response = await apiRequest<any>(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: updates },
            });
            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to update team roster and roles:', error);
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

    async removePlayerFromTeam(teamId: string, userId: string): Promise<Team | undefined> {
        try {
            const team = await this.getTeamById(teamId);
            if (!team) {
                return undefined;
            }

            const nextPlayerIds = team.playerIds.filter(id => id !== userId);

            const response = await apiRequest<any>(`/api/teams/${teamId}`, {
                method: 'PATCH',
                body: { team: { playerIds: nextPlayerIds } },
            });

            return this.mapRowToTeam(response);
        } catch (error) {
            console.error('Failed to remove player from team:', error);
            return undefined;
        }
    }

    async registerSelfForTeam(teamId: string, answers?: RegistrationQuestionAnswerInput[]): Promise<TeamRegistrationResult> {
        try {
            const response = await apiRequest<{
                registrationId?: string;
                status?: string;
                registration?: any;
                consent?: TeamRegistrationConsent;
                warnings?: string[];
                team?: any;
                requiresParentApproval?: boolean;
                invite?: Invite | null;
                message?: string;
                error?: string;
            }>(`/api/teams/${teamId}/registrations/self`, {
                method: 'POST',
                body: answers ? { answers } : undefined,
            });
            if (response?.error) {
                throw new Error(response.error);
            }
            return {
                registrationId: response?.registrationId,
                status: response?.status,
                registration: response?.registration
                    ? this.mapRowToPlayerRegistrations([response.registration])[0] ?? null
                    : null,
                consent: response?.consent,
                warnings: Array.isArray(response?.warnings) ? response.warnings : [],
                team: response?.team ? this.mapRowToTeam(response.team) : null,
                requiresParentApproval: Boolean(response?.requiresParentApproval),
                invite: response?.invite ?? null,
                message: typeof response?.message === 'string' ? response.message : undefined,
            };
        } catch (error) {
            console.error('Failed to register self for team:', error);
            throw error;
        }
    }

    async registerChildForTeam(teamId: string, childId: string, answers?: RegistrationQuestionAnswerInput[]): Promise<TeamRegistrationResult> {
        try {
            const response = await apiRequest<{
                registrationId?: string;
                status?: string;
                registration?: any;
                consent?: TeamRegistrationConsent;
                warnings?: string[];
                team?: any;
                error?: string;
            }>(`/api/teams/${teamId}/registrations/child`, {
                method: 'POST',
                body: { childId, ...(answers ? { answers } : {}) },
            });
            if (response?.error) {
                throw new Error(response.error);
            }
            return {
                registrationId: response?.registrationId,
                status: response?.status,
                registration: response?.registration
                    ? this.mapRowToPlayerRegistrations([response.registration])[0] ?? null
                    : null,
                consent: response?.consent,
                warnings: Array.isArray(response?.warnings) ? response.warnings : [],
                team: response?.team ? this.mapRowToTeam(response.team) : null,
            };
        } catch (error) {
            console.error('Failed to register child for team:', error);
            throw error;
        }
    }

    async registerForTeam(teamId: string): Promise<Team | undefined> {
        const result = await this.registerSelfForTeam(teamId);
        if (result.team) {
            return result.team;
        }
        return this.getTeamById(teamId);
    }

    async getRegistrationQuestions(scopeType: 'TEAM' | 'EVENT', scopeId: string, mode?: 'edit'): Promise<RegistrationQuestion[]> {
        const params = new URLSearchParams();
        params.set('scopeType', scopeType);
        params.set('scopeId', scopeId);
        if (mode) {
            params.set('mode', mode);
        }
        const response = await apiRequest<{ questions?: RegistrationQuestion[] }>(`/api/registration-questions?${params.toString()}`);
        return response.questions ?? [];
    }

    async saveRegistrationQuestions(
        scopeType: 'TEAM' | 'EVENT',
        scopeId: string,
        questions: RegistrationQuestionDraft[],
    ): Promise<RegistrationQuestion[]> {
        const response = await apiRequest<{ questions?: RegistrationQuestion[] }>('/api/registration-questions', {
            method: 'PUT',
            body: { scopeType, scopeId, questions },
        });
        return response.questions ?? [];
    }

    async getRegistrationQuestionResponse(
        subjectType: 'TEAM_JOIN_REQUEST' | 'TEAM_REGISTRATION' | 'EVENT_REGISTRATION',
        subjectId: string,
    ): Promise<RegistrationQuestionResponse | null> {
        const params = new URLSearchParams();
        params.set('subjectType', subjectType);
        params.set('subjectId', subjectId);
        const response = await apiRequest<{ response?: RegistrationQuestionResponse | null }>(`/api/registration-question-responses?${params.toString()}`);
        return response.response ?? null;
    }

    async getTeamJoinRequestContext(teamId: string): Promise<TeamJoinRequestContext> {
        const response = await apiRequest<Partial<TeamJoinRequestContext>>(`/api/teams/${encodeURIComponent(teamId)}/join-request-context`);
        return {
            teamId: response.teamId ?? teamId,
            joinPolicy: response.joinPolicy ?? 'CLOSED',
            openRegistration: Boolean(response.openRegistration),
            registrationPriceCents: Math.max(0, Math.round(response.registrationPriceCents ?? 0)),
            questions: response.questions ?? [],
            currentRequest: response.currentRequest ?? null,
        };
    }

    async requestToJoinTeam(
        teamId: string,
        answers: RegistrationQuestionAnswerInput[],
        options: { registrantUserId?: string; parentId?: string | null; registrantType?: 'SELF' | 'CHILD' } = {},
    ): Promise<TeamJoinRequest> {
        const response = await apiRequest<{ request?: TeamJoinRequest; error?: string }>(`/api/teams/${encodeURIComponent(teamId)}/join-requests`, {
            method: 'POST',
            body: { answers, ...options },
        });
        if (response.error) {
            throw new Error(response.error);
        }
        if (!response.request) {
            throw new Error('Failed to submit join request.');
        }
        return response.request;
    }

    async listTeamJoinRequests(teamId: string): Promise<TeamJoinRequest[]> {
        const response = await apiRequest<{ requests?: TeamJoinRequest[] }>(`/api/teams/${encodeURIComponent(teamId)}/join-requests`);
        return response.requests ?? [];
    }

    async reviewTeamJoinRequest(
        teamId: string,
        requestId: string,
        action: 'APPROVE' | 'DECLINE',
        note?: string | null,
    ): Promise<TeamJoinRequest> {
        const response = await apiRequest<{ request?: TeamJoinRequest; error?: string }>(
            `/api/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}`,
            {
                method: 'PATCH',
                body: { action, note },
            },
        );
        if (response.error) {
            throw new Error(response.error);
        }
        if (!response.request) {
            throw new Error('Failed to review join request.');
        }
        return response.request;
    }

    async createTeamMemberBill(teamId: string, input: {
        userId: string;
        amountCents?: number;
        label?: string;
        dueDate?: string;
    }): Promise<Bill> {
        const response = await apiRequest<{ bill?: Bill; error?: string }>(`/api/teams/${encodeURIComponent(teamId)}/billing/bills`, {
            method: 'POST',
            body: input,
        });
        if (response.error) {
            throw new Error(response.error);
        }
        if (!response.bill) {
            throw new Error('Failed to create bill.');
        }
        return response.bill;
    }

    async leaveTeam(teamId: string): Promise<Team | undefined> {
        try {
            const response = await apiRequest<{ team?: any; error?: string }>(`/api/teams/${teamId}/registrations/self`, {
                method: 'DELETE',
            });
            if (response?.error) {
                throw new Error(response.error);
            }
            return response?.team ? this.mapRowToTeam(response.team) : this.getTeamById(teamId);
        } catch (error) {
            console.error('Failed to leave team:', error);
            throw error;
        }
    }

    async deleteTeam(teamId: string): Promise<boolean> {
        try {
            const team = await this.getTeamById(teamId);

            await apiRequest(`/api/teams/${teamId}`, { method: 'DELETE' });

            if (team) {
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
