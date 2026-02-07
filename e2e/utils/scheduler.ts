export type CanonicalMatch = {
  matchId: number;
  side: string | null;
  losersBracket: boolean;
  team1Seed: number | null;
  team2Seed: number | null;
  previousLeftMatchId: number | null;
  previousRightMatchId: number | null;
  winnerNextMatchId: number | null;
  loserNextMatchId: number | null;
};

type RawTeam = {
  seed?: number | null;
} | null;

type RawMatch = {
  id?: string | null;
  $id?: string | null;
  matchId?: number | null;
  side?: string | null;
  losersBracket?: boolean | null;
  team1?: RawTeam;
  team2?: RawTeam;
  previousLeftId?: string | null;
  previousRightId?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
};

const toMatchId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toId = (match: RawMatch): string | null => {
  if (match.id && typeof match.id === 'string') return match.id;
  if (match.$id && typeof match.$id === 'string') return match.$id;
  return null;
};

const resolveLink = (linkId: string | null | undefined, idMap: Map<string, number>): number | null => {
  if (!linkId) return null;
  return idMap.get(linkId) ?? null;
};

export const canonicalizeMatches = (matches: RawMatch[]): CanonicalMatch[] => {
  const idMap = new Map<string, number>();
  for (const match of matches) {
    const matchId = toMatchId(match.matchId);
    const id = toId(match);
    if (matchId !== null && id) {
      idMap.set(id, matchId);
    }
  }

  const canonical = matches
    .map((match) => {
      const matchId = toMatchId(match.matchId);
      if (matchId === null) return null;
      return {
        matchId,
        side: match.side ?? null,
        losersBracket: Boolean(match.losersBracket),
        team1Seed: match.team1?.seed ?? null,
        team2Seed: match.team2?.seed ?? null,
        previousLeftMatchId: resolveLink(match.previousLeftId ?? null, idMap),
        previousRightMatchId: resolveLink(match.previousRightId ?? null, idMap),
        winnerNextMatchId: resolveLink(match.winnerNextMatchId ?? null, idMap),
        loserNextMatchId: resolveLink(match.loserNextMatchId ?? null, idMap),
      } satisfies CanonicalMatch;
    })
    .filter((value): value is CanonicalMatch => Boolean(value));

  return canonical.sort((a, b) => a.matchId - b.matchId);
};
