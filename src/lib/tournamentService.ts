import { databases } from '@/app/appwrite';
import { Event, Team, Field, Match, TournamentBracket } from '@/types';
import { eventService } from './eventService';
import { authService } from './auth';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const MATCHES_TABLE_ID = process.env.NEXT_PUBLIC_MATCHES_TABLE_ID!;

class TournamentService {
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

            return {
                tournament: tournament as Event & { eventType: 'TOURNAMENT' },
                matches,
                teams,
                isHost: tournament.hostId === currentUser?.$id,
                canManage: tournament.hostId === currentUser?.$id ||
                    Object.values(matches).some(m => m.referee && (m.referee.playerIds || []).includes(currentUser?.$id || '')),
            };
        } catch (error) {
            console.error('Failed to get tournament bracket:', error);
            throw error;
        }
    }

    async updateMatch(matchId: string, updates: Partial<Match>): Promise<Match> {
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
                            payload.refereeId = (value as Team).$id;
                        } else if (typeof value === 'string') {
                            payload.refereeId = value;
                        } else if (value === null) {
                            payload.refereeId = null;
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

            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: MATCHES_TABLE_ID,
                rowId: matchId,
                data: payload,
            });

            const eventId: string | undefined =
                (typeof response.eventId === 'string' && response.eventId) ||
                (response.event && typeof response.event === 'object' && '$id' in response.event ? response.event.$id : undefined);

            if (eventId) {
                const tournament = await eventService.getEventWithRelations(eventId);
                const hydratedMatch = tournament?.matches?.find((match) => match.$id === response.$id);
                if (hydratedMatch) {
                    return hydratedMatch;
                }
            }

            return {
                $id: response.$id,
                matchId: response.matchNumber ?? response.matchId,
                field: undefined,
                start: response.start,
                end: response.end,
                division: response.division,
                team1Points: response.team1Points || [],
                team2Points: response.team2Points || [],
                losersBracket: response.losersBracket || false,
                winnerNextMatchId: response.winnerNextMatchId,
                loserNextMatchId: response.loserNextMatchId,
                previousLeftId: response.previousLeftId ?? response.previousLeftMatchId,
                previousRightId: response.previousRightId ?? response.previousRightMatchId,
                setResults: response.setResults || [],
                refCheckedIn: response.refCheckedIn ?? response.refereeCheckedIn,
                team1Seed: response.team1Seed ?? undefined,
                team2Seed: response.team2Seed ?? undefined,
                $createdAt: response.$createdAt,
                $updatedAt: response.$updatedAt,
            };
        } catch (error) {
            console.error('Failed to update match:', error);
            throw error;
        }
    }
}

export const tournamentService = new TournamentService();
