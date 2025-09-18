import { Event, UserData, Team } from '@/types/index';

export interface Match {
    $id: string;
    matchId: number;
    team1?: string;
    team2?: string;
    tournamentId: string;
    refId?: string;
    fieldId?: string;
    start: string;
    end?: string;
    division: string;
    team1Points: number[];
    team2Points: number[];
    losersBracket: boolean;
    winnerNextMatchId?: string;
    loserNextMatchId?: string;
    previousLeftId?: string;
    previousRightId?: string;
    setResults: number[]; // 0 = ongoing, 1 = team1 won, 2 = team2 won
    refCheckedIn?: boolean;
    $createdAt: string;
    $updatedAt: string;
}

export interface MatchWithRelations extends Match {
    team1Data?: Team;
    team2Data?: Team;
    referee?: Team;
    field?: Field;
    winnerNextMatch?: MatchWithRelations;
    loserNextMatch?: MatchWithRelations;
    previousLeftMatch?: MatchWithRelations;
    previousRightMatch?: MatchWithRelations;
}

export interface TournamentBracket {
    tournament: Event & { eventType: 'tournament' };
    matches: MatchWithRelations[];
    teams: Team[];
    rounds: (MatchWithRelations)[];
    isHost: boolean;
    canManage: boolean;
}

export interface BracketRound {
    roundNumber: number;
    matches: (MatchWithRelations | null)[];
    isLosersBracket: boolean;
}

export interface Field {
    $id: string;
    fieldNumber: number;
    divisions: string[];
    matches: string[];
    lat: number;
    long: number;
    heading: number;
    inUse: boolean;
    tournamentId: string;
    $createdAt: string;
    $updatedAt: string;
}