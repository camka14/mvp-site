import { databases } from '@/app/appwrite';
import { Event, UserData, Team, Field, Match } from '@/types';
import { TournamentBracket } from '@/app/tournaments/types/tournament';
import { eventService } from './eventService';
import { authService } from './auth';
import { Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const MATCHES_COLLECTION_ID = process.env.NEXT_PUBLIC_MATCHES_COLLECTION_ID!;

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
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: MATCHES_COLLECTION_ID,
                rowId: matchId,
                data: updates
            });

            return {
                $id: response.$id,
                matchId: response.matchNumber,
                tournamentId: response.tournamentId,
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
