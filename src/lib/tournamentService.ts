import { databases } from '@/app/appwrite';
import { Event, Team, Field, Match, TournamentBracket } from '@/types';
import { eventService } from './eventService';
import { authService } from './auth';
import { Query } from 'appwrite';

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
            if (tournament.eventType !== 'tournament') {
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
                tournament: tournament as Event & { eventType: 'tournament' },
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
            const payload: Record<string, unknown> = { ...updates };

            if (payload.field && typeof payload.field === 'object' && '$id' in (payload.field as Record<string, unknown>)) {
                payload.field = (payload.field as Field).$id;
            }

            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: MATCHES_TABLE_ID,
                rowId: matchId,
                data: payload
            });

            return {
                $id: response.$id,
                matchId: response.matchNumber,
                event: response.event as Event,
                field: response.field,
                start: response.start,
                end: response.end,
                division: response.division,
                team1Points: response.team1Points || [],
                team2Points: response.team2Points || [],
                losersBracket: response.losersBracket || false,
                winnerNextMatchId: response.winnerNextMatchId,
                loserNextMatchId: response.loserNextMatchId,
                previousLeftId: response.previousLeftMatchId,
                previousRightId: response.previousRightMatchId,
                setResults: response.setResults || [],
                refCheckedIn: response.refCheckedIn,
                team1Seed: response.team1Seed ?? undefined,
                team2Seed: response.team2Seed ?? undefined,
                $createdAt: response.$createdAt,
                $updatedAt: response.$updatedAt,
                team1: typeof response.team1 === 'object' ? (response.team1 as Team) : undefined,
                team2: typeof response.team2 === 'object' ? (response.team2 as Team) : undefined,
            };
        } catch (error) {
            console.error('Failed to update match:', error);
            throw error;
        }
    }
}

export const tournamentService = new TournamentService();
