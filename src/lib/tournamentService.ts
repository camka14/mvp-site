import { databases } from '@/app/appwrite';
import { Event, UserData, Team } from '@/types';
import { Match, MatchWithRelations, TournamentBracket } from '@/app/tournaments/types/tournament';
import { eventService } from './eventService';
import { teamService } from './teamService';
import { userService } from './userService';
import { authService } from './auth';
import { Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const MATCHES_COLLECTION_ID = process.env.NEXT_PUBLIC_MATCHES_COLLECTION_ID!;

class TournamentService {
    async getTournamentBracket(tournamentId: string): Promise<TournamentBracket> {
        try {
            // Get tournament details
            const tournament = await eventService.getEvent(tournamentId);

            if (!tournament) {
                throw new Error('Tournament not found');
            }
            if (tournament.eventType !== 'tournament') {
                throw new Error('Event is not a tournament');
            }

            // Get all matches for this tournament
            const matchesResponse = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: MATCHES_COLLECTION_ID,
                queries: [
                    Query.equal('tournamentId', tournamentId),
                    Query.limit(200),
                ]
            });

            const matches: Match[] = matchesResponse.rows.map(row => ({
                $id: row.$id,
                matchId: row.matchId,
                team1: row.team1,
                team2: row.team2,
                tournamentId: row.tournamentId,
                refId: row.refId,
                field: row.field,
                start: row.start,
                end: row.end,
                division: row.division,
                team1Points: row.team1Points || [],
                team2Points: row.team2Points || [],
                losersBracket: row.losersBracket || false,
                winnerNextMatchId: row.winnerNextMatchId,
                loserNextMatchId: row.loserNextMatchId,
                previousLeftId: row.previousLeftId,
                previousRightId: row.previousRightId,
                setResults: row.setResults || [],
                refCheckedIn: row.refCheckedIn,
                $createdAt: row.$createdAt,
                $updatedAt: row.$updatedAt,
            }));

            // Get teams
            const teams = await teamService.getTeamsByIds(tournament.teamIds);

            // Get user data for current user
            const currentUser = await authService.getStoredUserData();

            // Enhance matches with related data
            const matchesWithRelations: MatchWithRelations[] = await Promise.all(
                matches.map(async (match) => {
                    const [team1Data, team2Data, referee] = await Promise.all([
                        match.team1 ? teams.find(t => t.$id === match.team1) : undefined,
                        match.team2 ? teams.find(t => t.$id === match.team2) : undefined,
                        match.refId ? userService.getUserById(match.refId) : undefined,
                    ]);

                    return {
                        ...match,
                        team1Data,
                        team2Data,
                        referee,
                    };
                })
            );

            // Organize matches into rounds
            const rounds = this.generateMatchTree(matchesWithRelations);

            return {
                tournament,
                matches: matchesWithRelations,
                teams,
                rounds,
                isHost: tournament.hostId === currentUser?.$id,
                canManage: tournament.hostId === currentUser?.$id ||
                    matchesWithRelations.some(m => m.refId === currentUser?.$id),
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
                team1: response.team1,
                team2: response.team2,
                tournamentId: response.tournamentId,
                refId: response.refId,
                fieldId: response.fieldId,
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

    private generateMatchTree(matches: MatchWithRelations[]): (MatchWithRelations)[] {
        return matches.map(m => {
            m.previousLeftMatch = matches.find(pm => pm.$id === m.previousLeftId);
            m.previousRightMatch = matches.find(pm => pm.$id === m.previousRightId);
            m.winnerNextMatch = matches.find(nm => nm.$id === m.winnerNextMatchId);
            m.loserNextMatch = matches.find(nm => nm.$id === m.loserNextMatchId);
            return m;
        });
    }
}

export const tournamentService = new TournamentService();