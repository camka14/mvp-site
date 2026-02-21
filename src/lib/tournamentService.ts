import { Event, Team, Field, Match, TournamentBracket, UserData } from '@/types';
import { eventService } from './eventService';
import { authService } from './auth';
import { apiRequest } from './apiClient';
import { normalizeApiMatch } from './apiMappers';

class TournamentService {
    private toBulkMatchUpdatePayload(match: Match): Record<string, unknown> {
        return {
            id: match.$id,
            matchId: match.matchId,
            locked: Boolean(match.locked),
            team1Points: match.team1Points,
            team2Points: match.team2Points,
            setResults: match.setResults,
            team1Id: match.team1Id ?? match.team1?.$id ?? null,
            team2Id: match.team2Id ?? match.team2?.$id ?? null,
            refereeId: match.refereeId ?? match.referee?.$id ?? null,
            teamRefereeId: match.teamRefereeId ?? match.teamReferee?.$id ?? null,
            fieldId: match.fieldId ?? match.field?.$id ?? null,
            previousLeftId: match.previousLeftId ?? match.previousLeftMatch?.$id ?? null,
            previousRightId: match.previousRightId ?? match.previousRightMatch?.$id ?? null,
            winnerNextMatchId: match.winnerNextMatchId ?? match.winnerNextMatch?.$id ?? null,
            loserNextMatchId: match.loserNextMatchId ?? match.loserNextMatch?.$id ?? null,
            side: match.side ?? null,
            refereeCheckedIn: match.refereeCheckedIn ?? false,
        };
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

    async updateMatchesBulk(eventId: string, matches: Match[]): Promise<Match[]> {
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
                    matchId,
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
}

export const tournamentService = new TournamentService();
