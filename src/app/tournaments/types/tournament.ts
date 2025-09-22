import { Event, UserData, Team, Match } from '@/types/index';

export interface TournamentBracket {
    tournament: Event & { eventType: 'tournament' };
    matches: {[key: string]: Match};
    teams: Team[];
    isHost: boolean;
    canManage: boolean;
}

export interface BracketRound {
    roundNumber: number;
    matches: (Match | null)[];
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