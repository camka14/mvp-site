import { Event, Team, Field, Match, TournamentBracket, UserData } from '@/types';
import { eventService } from './eventService';
import { authService } from './auth';
import { apiRequest } from './apiClient';
import { normalizeApiMatch } from './apiMappers';

export type LeagueStandingsDivisionRow = {
    position: number;
    teamId: string;
    teamName: string;
    draws: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    matchesPlayed: number;
    basePoints: number;
    finalPoints: number;
    pointsDelta: number;
};

export type LeagueStandingsDivisionResponse = {
    divisionId: string;
    divisionName: string;
    standingsConfirmedAt: string | null;
    standingsConfirmedBy: string | null;
    playoffTeamCount: number | null;
    playoffPlacementDivisionIds: string[];
    standingsOverrides: Record<string, number> | null;
    standings: LeagueStandingsDivisionRow[];
    validation: {
        mappingErrors: string[];
        capacityErrors: string[];
    };
    playoffDivisions: Array<{ id: string; name: string; maxParticipants: number | null }>;
};

class TournamentService {
    private toBulkMatchUpdatePayload(match: Partial<Match> & { $id: string }): Record<string, unknown> {
        const payload: Record<string, unknown> = { id: match.$id };
        const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(match, key);
        const relationId = (value: unknown): string | null => {
            if (typeof value === 'string') {
                return value;
            }
            if (value && typeof value === 'object' && '$id' in (value as Record<string, unknown>)) {
                const entityId = (value as Record<string, unknown>).$id;
                return typeof entityId === 'string' ? entityId : null;
            }
            return null;
        };

        if (hasOwn('matchId') && match.matchId !== undefined) {
            payload.matchId = match.matchId;
        }
        if (hasOwn('locked') && typeof match.locked === 'boolean') {
            payload.locked = match.locked;
        }
        if (hasOwn('team1Points') && Array.isArray(match.team1Points)) {
            payload.team1Points = match.team1Points;
        }
        if (hasOwn('team2Points') && Array.isArray(match.team2Points)) {
            payload.team2Points = match.team2Points;
        }
        if (hasOwn('setResults') && Array.isArray(match.setResults)) {
            payload.setResults = match.setResults;
        }

        if (hasOwn('team1Id')) {
            if (match.team1Id !== undefined) {
                payload.team1Id = match.team1Id ?? null;
            } else if (hasOwn('team1')) {
                payload.team1Id = relationId(match.team1);
            }
        } else if (hasOwn('team1')) {
            payload.team1Id = relationId(match.team1);
        }
        if (hasOwn('team2Id')) {
            if (match.team2Id !== undefined) {
                payload.team2Id = match.team2Id ?? null;
            } else if (hasOwn('team2')) {
                payload.team2Id = relationId(match.team2);
            }
        } else if (hasOwn('team2')) {
            payload.team2Id = relationId(match.team2);
        }
        if (hasOwn('refereeId')) {
            if (match.refereeId !== undefined) {
                payload.refereeId = match.refereeId ?? null;
            } else if (hasOwn('referee')) {
                payload.refereeId = relationId(match.referee);
            }
        } else if (hasOwn('referee')) {
            payload.refereeId = relationId(match.referee);
        }
        if (hasOwn('teamRefereeId')) {
            if (match.teamRefereeId !== undefined) {
                payload.teamRefereeId = match.teamRefereeId ?? null;
            } else if (hasOwn('teamReferee')) {
                payload.teamRefereeId = relationId(match.teamReferee);
            }
        } else if (hasOwn('teamReferee')) {
            payload.teamRefereeId = relationId(match.teamReferee);
        }
        if (hasOwn('fieldId')) {
            if (match.fieldId !== undefined) {
                payload.fieldId = match.fieldId ?? null;
            } else if (hasOwn('field')) {
                payload.fieldId = relationId(match.field);
            }
        } else if (hasOwn('field')) {
            payload.fieldId = relationId(match.field);
        }
        if (hasOwn('previousLeftId')) {
            if (match.previousLeftId !== undefined) {
                payload.previousLeftId = match.previousLeftId ?? null;
            } else if (hasOwn('previousLeftMatch')) {
                payload.previousLeftId = relationId(match.previousLeftMatch);
            }
        } else if (hasOwn('previousLeftMatch')) {
            payload.previousLeftId = relationId(match.previousLeftMatch);
        }
        if (hasOwn('previousRightId')) {
            if (match.previousRightId !== undefined) {
                payload.previousRightId = match.previousRightId ?? null;
            } else if (hasOwn('previousRightMatch')) {
                payload.previousRightId = relationId(match.previousRightMatch);
            }
        } else if (hasOwn('previousRightMatch')) {
            payload.previousRightId = relationId(match.previousRightMatch);
        }
        if (hasOwn('winnerNextMatchId')) {
            if (match.winnerNextMatchId !== undefined) {
                payload.winnerNextMatchId = match.winnerNextMatchId ?? null;
            } else if (hasOwn('winnerNextMatch')) {
                payload.winnerNextMatchId = relationId(match.winnerNextMatch);
            }
        } else if (hasOwn('winnerNextMatch')) {
            payload.winnerNextMatchId = relationId(match.winnerNextMatch);
        }
        if (hasOwn('loserNextMatchId')) {
            if (match.loserNextMatchId !== undefined) {
                payload.loserNextMatchId = match.loserNextMatchId ?? null;
            } else if (hasOwn('loserNextMatch')) {
                payload.loserNextMatchId = relationId(match.loserNextMatch);
            }
        } else if (hasOwn('loserNextMatch')) {
            payload.loserNextMatchId = relationId(match.loserNextMatch);
        }

        if (hasOwn('side')) {
            payload.side = match.side ?? null;
        }
        if (hasOwn('refereeCheckedIn') && typeof match.refereeCheckedIn === 'boolean') {
            payload.refereeCheckedIn = match.refereeCheckedIn;
        }
        return payload;
    }

    async getTournamentBracket(tournamentId: string): Promise<TournamentBracket> {
        try {
            // Get tournament with expanded relations (teams, etc.)
            const tournament = await eventService.getEventWithRelations(tournamentId);

            if (!tournament) {
                throw new Error('Tournament not found');
            }
            if (tournament.eventType !== 'TOURNAMENT') {
                throw new Error('Event is not a tournament');
            }

            const matches: { [key: string]: Match } = tournament.matches?.reduce((acc, match) => {
                acc[match.$id] = match;
                return acc;
            }, {} as { [key: string]: Match }) || {};

            // Get teams
            const teams = (tournament.teams || []) as Team[];

            // Get user data for current user
            const currentUser = authService.getStoredUserData();

            Object.values(matches).forEach((match) => {
                match.winnerNextMatch = match.winnerNextMatchId ? matches[match.winnerNextMatchId] : undefined;
                match.loserNextMatch = match.loserNextMatchId ? matches[match.loserNextMatchId] : undefined;
                match.previousLeftMatch = match.previousLeftId ? matches[match.previousLeftId] : undefined;
                match.previousRightMatch = match.previousRightId ? matches[match.previousRightId] : undefined;
            });

            const isHost = tournament.hostId === currentUser?.$id;
            const canManageMatches = Object.values(matches).some((match) => {
                if (currentUser?.$id && match.refereeId === currentUser.$id) {
                    return true;
                }
                const teamPlayers = match.teamReferee?.playerIds || [];
                return currentUser?.$id ? teamPlayers.includes(currentUser.$id) : false;
            });

            return {
                tournament: tournament as Event & { eventType: 'TOURNAMENT' },
                matches,
                teams,
                isHost,
                canManage: isHost || canManageMatches,
            };
        } catch (error) {
            console.error('Failed to get tournament bracket:', error);
            throw error;
        }
    }

    async updateMatch(eventId: string, matchId: string, updates: Partial<Match>): Promise<Match> {
        try {
            const payload: Record<string, unknown> = {};

            Object.entries(updates).forEach(([key, value]) => {
                switch (key) {
                    case 'field':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.fieldId = (value as Field).$id;
                        } else if (typeof value === 'string') {
                            payload.fieldId = value;
                        } else if (value === null) {
                            payload.fieldId = null;
                        }
                        break;
                    case 'team1':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.team1Id = (value as Team).$id;
                        } else if (typeof value === 'string') {
                            payload.team1Id = value;
                        } else if (value === null) {
                            payload.team1Id = null;
                        }
                        break;
                    case 'team2':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.team2Id = (value as Team).$id;
                        } else if (typeof value === 'string') {
                            payload.team2Id = value;
                        } else if (value === null) {
                            payload.team2Id = null;
                        }
                        break;
                    case 'referee':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.refereeId = (value as UserData).$id;
                        } else if (typeof value === 'string') {
                            payload.refereeId = value;
                        } else if (value === null) {
                            payload.refereeId = null;
                        }
                        break;
                    case 'refereeId':
                        if (typeof value === 'string') {
                            payload.refereeId = value;
                        } else if (value === null) {
                            payload.refereeId = null;
                        }
                        break;
                    case 'teamReferee':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.teamRefereeId = (value as Team).$id;
                        } else if (typeof value === 'string') {
                            payload.teamRefereeId = value;
                        } else if (value === null) {
                            payload.teamRefereeId = null;
                        }
                        break;
                    case 'teamRefereeId':
                        if (typeof value === 'string') {
                            payload.teamRefereeId = value;
                        } else if (value === null) {
                            payload.teamRefereeId = null;
                        }
                        break;
                    case 'previousLeftMatch':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.previousLeftId = (value as Match).$id;
                        } else if (typeof value === 'string') {
                            payload.previousLeftId = value;
                        } else if (value === null) {
                            payload.previousLeftId = null;
                        }
                        break;
                    case 'previousRightMatch':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.previousRightId = (value as Match).$id;
                        } else if (typeof value === 'string') {
                            payload.previousRightId = value;
                        } else if (value === null) {
                            payload.previousRightId = null;
                        }
                        break;
                    case 'winnerNextMatch':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.winnerNextMatchId = (value as Match).$id;
                        } else if (typeof value === 'string') {
                            payload.winnerNextMatchId = value;
                        } else if (value === null) {
                            payload.winnerNextMatchId = null;
                        }
                        break;
                    case 'loserNextMatch':
                        if (value && typeof value === 'object' && '$id' in value) {
                            payload.loserNextMatchId = (value as Match).$id;
                        } else if (typeof value === 'string') {
                            payload.loserNextMatchId = value;
                        } else if (value === null) {
                            payload.loserNextMatchId = null;
                        }
                        break;
                    default:
                        payload[key] = value;
                }
            });

            const response = await apiRequest<{ match: Match }>(`/api/events/${eventId}/matches/${matchId}`, {
                method: 'PATCH',
                body: payload,
            });

            if (!response?.match) {
                throw new Error('Failed to update match');
            }

            return normalizeApiMatch(response.match);
        } catch (error) {
            console.error('Failed to update match:', error);
            throw error;
        }
    }

    async updateMatchScores(eventId: string, matchId: string, updates: Pick<Match, 'team1Points' | 'team2Points' | 'setResults'>): Promise<Match> {
        return this.updateMatch(eventId, matchId, updates);
    }

    async updateMatchesBulk(eventId: string, matches: Array<Partial<Match> & { $id: string }>): Promise<Match[]> {
        if (!eventId || !Array.isArray(matches) || matches.length === 0) {
            return [];
        }

        const payload = matches
            .filter((match) => typeof match?.$id === 'string' && match.$id.length > 0)
            .map((match) => this.toBulkMatchUpdatePayload(match));
        if (payload.length === 0) {
            return [];
        }

        const response = await apiRequest<{ matches?: Match[] }>(`/api/events/${eventId}/matches`, {
            method: 'PATCH',
            body: { matches: payload },
        });
        return (response.matches ?? []).map((match) => normalizeApiMatch(match));
    }

    async completeMatch(
        eventId: string,
        matchId: string,
        payload: Pick<Match, 'team1Points' | 'team2Points' | 'setResults'>,
    ): Promise<void> {
        try {
            const nowIso = new Date().toISOString();
            await apiRequest(`/api/events/${eventId}/matches/${matchId}`, {
                method: 'PATCH',
                body: {
                    finalize: true,
                    setResults: payload.setResults,
                    team1Points: payload.team1Points,
                    team2Points: payload.team2Points,
                    time: nowIso,
                },
            });
        } catch (error) {
            console.error('Failed to finalize match via event manager:', error);
            throw error;
        }
    }

    async getLeagueDivisionStandings(
        eventId: string,
        divisionId: string,
    ): Promise<LeagueStandingsDivisionResponse> {
        const query = new URLSearchParams({ divisionId });
        const response = await apiRequest<{ division: LeagueStandingsDivisionResponse }>(
            `/api/events/${eventId}/standings?${query.toString()}`,
        );
        if (!response?.division) {
            throw new Error('Failed to load league standings');
        }
        return response.division;
    }

    async updateLeagueStandingsOverrides(
        eventId: string,
        divisionId: string,
        pointsOverrides: Array<{ teamId: string; points: number | null }>,
    ): Promise<LeagueStandingsDivisionResponse> {
        const response = await apiRequest<{ division: LeagueStandingsDivisionResponse }>(
            `/api/events/${eventId}/standings`,
            {
                method: 'PATCH',
                body: {
                    divisionId,
                    pointsOverrides,
                },
            },
        );
        if (!response?.division) {
            throw new Error('Failed to save standings overrides');
        }
        return response.division;
    }

    async confirmLeagueStandings(
        eventId: string,
        divisionId: string,
        applyReassignment: boolean = true,
    ): Promise<{
        division: LeagueStandingsDivisionResponse;
        applyReassignment: boolean;
        reassignedPlayoffDivisionIds: string[];
        seededTeamIds: string[];
    }> {
        return apiRequest(`/api/events/${eventId}/standings/confirm`, {
            method: 'POST',
            body: {
                divisionId,
                applyReassignment,
            },
        });
    }
}

export const tournamentService = new TournamentService();
