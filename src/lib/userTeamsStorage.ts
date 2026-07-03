import type { Team } from '@/types';

const USER_TEAMS_STORAGE_PREFIX = 'app-user-teams';

type StoredUserTeams = {
  userId: string;
  teams: Team[];
  updatedAt: string;
};

const getStorageKey = (userId: string): string => `${USER_TEAMS_STORAGE_PREFIX}:${userId}`;

export const userTeamsStorage = {
  get(userId: string): Team[] {
    if (typeof window === 'undefined' || !userId) return [];
    try {
      const raw = window.localStorage.getItem(getStorageKey(userId));
      const parsed = raw ? (JSON.parse(raw) as StoredUserTeams) : null;
      if (!parsed || parsed.userId !== userId || !Array.isArray(parsed.teams)) {
        return [];
      }
      return parsed.teams;
    } catch {
      return [];
    }
  },

  set(userId: string, teams: Team[]): void {
    if (typeof window === 'undefined' || !userId) return;
    try {
      const payload: StoredUserTeams = {
        userId,
        teams,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
    } catch {
      // Ignore storage errors; the in-memory provider state remains authoritative for this session.
    }
  },
};
