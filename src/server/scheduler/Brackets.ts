import crypto from 'crypto';
import { Schedule } from './Schedule';
import {
  Division,
  Match,
  PlayingField,
  Side,
  SchedulerContext,
  Team,
  Tournament,
  UserData,
  TIMES,
  oppositeSide,
} from './types';

const createId = () => crypto.randomUUID();

export class Brackets {
  tournament: Tournament;
  context: SchedulerContext;
  callStack: string[] = [];
  maxDepth = 50;
  existingMatches: Record<number, Match> = {};
  currentDivision!: Division;
  numberOfRounds = 0;
  seedsWithByes: Team[] = [];
  remainingTeams: Team[] = [];
  currentFields: PlayingField[] = [];
  currentScheduleTime!: Date;
  perfectCount = false;
  bracketSchedule: Schedule<Match, PlayingField, Team | UserData, Division>;

  constructor(tournament: Tournament, context: SchedulerContext) {
    this.tournament = tournament;
    this.context = context;

    const matches = Object.values(this.tournament.matches);
    for (const match of matches) {
      if (typeof match.matchId === 'number') {
        this.existingMatches[match.matchId] = match;
      }
    }

    const fields = { ...this.tournament.fields };
    for (const field of Object.values(fields)) {
      field.matches = [];
    }
    const participants: Record<string, Team | UserData> = { ...this.tournament.teams };
    for (const referee of this.tournament.referees) {
      if (!referee.divisions.length) referee.divisions = [...this.tournament.divisions];
      referee.matches = [];
      participants[referee.id] = referee;
    }

    this.bracketSchedule = new Schedule(
      this.tournament.start,
      fields,
      participants,
      this.tournament.divisions,
      undefined,
      { timeSlots: this.tournament.timeSlots, endTime: this.tournament.end },
    );

    for (const team of Object.values(this.tournament.teams)) {
      team.losses = 0;
      team.wins = 0;
    }
  }

  private getMultiplier(match: Match): number {
    return match.team1Points.length;
  }

  private attachMatchToParticipants(match: Match): void {
    for (const participant of match.getParticipants()) {
      const matchesAttr = (participant as any).matches as Match[] | undefined;
      if (!matchesAttr) continue;
      if (!matchesAttr.includes(match)) {
        matchesAttr.push(match);
      }
    }
  }

  private logMethodEntry(methodName: string, details: Record<string, any>): void {
    const depth = this.callStack.length;
    const indent = '  '.repeat(depth);
    this.callStack.push(methodName);
    this.context.log(`${indent}→ ENTER ${methodName} (depth: ${depth})`);
    Object.entries(details).forEach(([key, value]) => {
      this.context.log(`${indent}  ${key}: ${value}`);
    });
    if (depth > this.maxDepth) {
      const errorMsg = `RECURSION LIMIT EXCEEDED in ${methodName} at depth ${depth}`;
      this.context.error(errorMsg);
      this.context.error(`Call stack: ${this.callStack.join(' -> ')}`);
      throw new Error(errorMsg);
    }
  }

  private logMethodExit(methodName: string, success = true, error?: unknown): void {
    const depth = this.callStack.length - 1;
    const indent = '  '.repeat(depth);
    if (error) {
      this.context.error(`${indent}← EXIT ${methodName} ERROR: ${String(error)}`);
    } else {
      this.context.log(`${indent}← EXIT ${methodName} ${success ? 'SUCCESS' : 'FAIL'}`);
    }
    if (this.callStack.length && this.callStack[this.callStack.length - 1] === methodName) {
      this.callStack.pop();
    }
  }

  buildBrackets(): void {
    this.context.log('=== STARTING build_brackets ===');
    try {
      this.tournament.matches = {};
      for (const division of this.tournament.divisions) {
        this.context.log(`Processing division: ${division.id}`);
        this.setupDivision(division);
        const teams = this.getTeamsByDivision(this.tournament.teams, division);
        this.context.log(`Teams in division: ${teams.length}`);
        if (teams.length < 3) {
          this.context.log(`Skipping division - not enough teams (${teams.length})`);
          continue;
        }
        this.prepareTeams(teams);
        this.callStack = [];
        const rootMatch = this.createBracketStructure();
        const finalMatch = this.handleDoubleElimination(rootMatch);
        this.applyMatchIds(finalMatch);
        this.context.log(`Completed division: ${division.id}`);
      }
    } catch (err) {
      this.context.error(`ERROR in build_brackets: ${err}`);
      this.context.error(`Final call stack: ${this.callStack.join(' -> ')}`);
      throw err;
    } finally {
      this.context.log('=== FINISHED build_brackets ===');
    }
  }

  private setupDivision(division: Division): void {
    this.currentDivision = division;
    this.currentFields = Object.values(this.tournament.fields).filter((field) =>
      field.divisions.some((d) => d.id === division.id),
    );
  }

  private prepareTeams(teams: Team[]): Team[] {
    teams.sort((a, b) => b.seed - a.seed);
    const byesCount = this.getByes(teams);
    this.seedsWithByes = teams.slice(0, byesCount);
    this.remainingTeams = teams.slice(byesCount);
    return teams;
  }

  private createBracketStructure(): Match {
    const byesCount = this.seedsWithByes.length;
    const totalTeams = this.remainingTeams.length + byesCount;
    this.numberOfRounds = totalTeams > 1 ? Math.ceil(Math.log2(totalTeams)) : 1;
    this.perfectCount = byesCount === 0;
    return this.createSubMatches(null, this.numberOfRounds, byesCount, Side.RIGHT);
  }

  private handleDoubleElimination(rootMatch: Match): Match {
    if (!this.tournament.doubleElimination) {
      return rootMatch;
    }
    const finalMatch = this.createMatch(null, null, null, null, false, Side.RIGHT);
    const semifinalMatch = this.createMatch(null, null, null, finalMatch, false, Side.RIGHT);
    semifinalMatch.loserNextMatch = finalMatch;
    semifinalMatch.previousLeftMatch = rootMatch;
    semifinalMatch.previousRightMatch = rootMatch.loserNextMatch;
    if (!rootMatch.loserNextMatch) {
      throw new Error('Double elimination root match missing loserNextMatch');
    }
    rootMatch.loserNextMatch.winnerNextMatch = semifinalMatch;
    rootMatch.winnerNextMatch = semifinalMatch;
    rootMatch.side = Side.LEFT;

    finalMatch.previousRightMatch = semifinalMatch;
    finalMatch.previousLeftMatch = semifinalMatch;
    return finalMatch;
  }

  private getByes(teams: Team[]): number {
    const [remainder, power] = this.remainderPowerOfTwo(teams.length);
    this.numberOfRounds = power + (remainder > 0 ? 1 : 0);
    const subtractor = remainder % (2 ** power - 1) > 0 ? remainder % (2 ** power - 1) : 0;
    return remainder - subtractor;
  }

  private getTeamsByDivision(teams: Record<string, Team>, division: Division): Team[] {
    return Object.values(teams).filter((team) => team.division.id === division.id);
  }

  private applyMatchIds(rootMatch: Match): void {
    const queue: Match[] = [rootMatch];
    const queueIds = new Set([rootMatch.id]);
    const matches: Match[] = [];
    const seenIds = new Set<string>();
    let processed = 0;

    while (queue.length) {
      const match = queue.shift() as Match;
      processed += 1;
      matches.push(match);
      seenIds.add(match.id);
      queueIds.delete(match.id);

      const prevMatches = match.getMatches();
      for (const prevMatch of prevMatches) {
        if (!prevMatch) continue;
        if (seenIds.has(prevMatch.id)) continue;
        if (queueIds.has(prevMatch.id)) continue;
        if (match.losersBracket && match.losersBracket !== prevMatch.losersBracket) continue;
        queue.push(prevMatch);
        queueIds.add(prevMatch.id);

        if (prevMatch.losersBracket) {
          const leftPrev = prevMatch.previousLeftMatch;
          const rightPrev = prevMatch.previousRightMatch;
          const leftLoser = Boolean(leftPrev && leftPrev.losersBracket);
          const rightLoser = Boolean(rightPrev && rightPrev.losersBracket);
          if (leftLoser !== rightLoser) {
            if (leftLoser && leftPrev) queue.push(leftPrev);
            else if (rightLoser && rightPrev) queue.push(rightPrev);
          }
        }
      }

      if (processed > 1000) {
        throw new Error('Infinite loop detected in applyMatchIds');
      }
    }

    this.processMatches(matches);
  }

  private processMatches(matches: Match[]): void {
    let count = 1;
    for (const match of [...matches].reverse()) {
      match.matchId = count;
      try {
        this.bracketSchedule.scheduleEvent(match, this.getMultiplier(match) * TIMES.SET);
      } catch (err) {
        this.context.error(`ERROR scheduling event for match ${count}: ${err}`);
      }
      const existingMatch = this.existingMatches[count];
      if (existingMatch) {
        delete this.tournament.matches[match.id];
        match.id = existingMatch.id;
        this.tournament.matches[match.id] = match;
      } else {
        this.tournament.matches[match.id] = match;
      }
      count += 1;
    }

    const orderedMatches = [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      return (a.field?.id ?? '').localeCompare(b.field?.id ?? '');
    });

    for (const match of orderedMatches) {
      this.attachMatchToParticipants(match);
      // Official referees can be assigned even when the teams are not yet known (future bracket matches).
      if (!match.referee && this.tournament.referees.length) {
        const availableRefs = this.bracketSchedule.freeParticipants(this.currentDivision, match.start, match.end)
          .filter((participant) => participant instanceof UserData) as UserData[];
        if (availableRefs.length) {
          match.referee = availableRefs[0];
          availableRefs[0].matches.push(match);
          this.attachMatchToParticipants(match);
        }
      }
    }

    if (this.tournament.doTeamsRef) {
      for (const match of orderedMatches) {
        this.attachMatchToParticipants(match);
        if (!match.team1 || !match.team2 || match.teamReferee) continue;
        const availableTeams = this.bracketSchedule.freeParticipants(this.currentDivision, match.start, match.end)
          .filter((participant) => participant instanceof Team) as Team[];
        const filtered = availableTeams.filter((team) => team !== match.team1 && team !== match.team2);
        if (filtered.length) {
          match.teamReferee = filtered[0];
          filtered[0].matches.push(match);
          this.attachMatchToParticipants(match);
        }
      }
    }
  }

  private createSubMatches(rootMatch: Match | null, round: number, byes: number, side: Side): Match {
    this.logMethodEntry('_create_sub_matches', {
      round,
      byes,
      side,
      remainingTeams: this.remainingTeams.length,
      seedsWithByes: this.seedsWithByes.length,
      perfectCount: this.perfectCount,
    });
    try {
      const totalTeamsLeft = this.remainingTeams.length + this.seedsWithByes.length;
      if (totalTeamsLeft === 0) {
        const emptyMatch = this.createMatch(null, null, null, rootMatch, false, side);
        this.logMethodExit('_create_sub_matches');
        return emptyMatch;
      }
      if (round <= 1 || totalTeamsLeft <= 2) {
        const newMatch = this.createFinalRoundMatch(rootMatch, byes, side);
        if (this.tournament.doubleElimination) {
          this.addLoserMatch(newMatch, side);
        }
        this.logMethodExit('_create_sub_matches');
        return newMatch;
      }
      const condition1 = !this.perfectCount && round <= 2;
      const condition2 = round <= 2 && byes > 0;
      const condition3 = round <= 1 && byes === 0;
      const newMatch = condition1 || condition2 || condition3
        ? this.createFinalRoundMatch(rootMatch, byes, side)
        : this.createIntermediateRoundMatch(rootMatch, round, byes, side);

      if (this.tournament.doubleElimination) {
        this.addLoserMatch(newMatch, side);
      }
      this.logMethodExit('_create_sub_matches');
      return newMatch;
    } catch (err) {
      this.context.error(`_create_sub_matches error: ${err}`);
      this.logMethodExit('_create_sub_matches', false, err);
      throw err;
    }
  }

  private createFinalRoundMatch(rootMatch: Match | null, byes: number, side: Side): Match {
    this.logMethodEntry('_create_final_round_match', {
      byes,
      side,
      remainingTeams: this.remainingTeams.length,
      seedsWithByes: this.seedsWithByes.length,
    });
    try {
      if (byes === 1) {
        const highSeed = this.seedsWithByes.shift() as Team;
        const leftSeed = side === Side.LEFT ? highSeed : null;
        const rightSeed = side === Side.LEFT ? null : highSeed;
        const newMatch = this.createMatch(leftSeed, rightSeed, null, rootMatch, false, side);
        const lowSeedMatch = this.createMatch(
          this.remainingTeams.pop() ?? null,
          this.remainingTeams.pop() ?? null,
          highSeed,
          newMatch,
          false,
          oppositeSide(side),
        );
        if (side === Side.LEFT) {
          newMatch.previousRightMatch = lowSeedMatch;
        } else {
          newMatch.previousLeftMatch = lowSeedMatch;
        }
        return newMatch;
      }
      if (byes === 2) {
        const newMatch = this.createMatch(null, null, null, rootMatch, false, side);
        const highSeed1 = this.seedsWithByes.shift() as Team;
        const highSeed2 = this.seedsWithByes.shift() as Team;
        const lowSeed1 = this.remainingTeams.pop() as Team;
        const lowSeed2 = this.remainingTeams.pop() as Team;
        const highSeedMatch = this.createMatch(highSeed1, lowSeed1, null, newMatch, false, side);
        const lowSeedMatch = this.createMatch(highSeed2, lowSeed2, null, newMatch, false, oppositeSide(side));
        if (side === Side.LEFT) {
          newMatch.previousLeftMatch = highSeedMatch;
          newMatch.previousRightMatch = lowSeedMatch;
        } else {
          newMatch.previousLeftMatch = lowSeedMatch;
          newMatch.previousRightMatch = highSeedMatch;
        }
        return newMatch;
      }
      if (this.remainingTeams.length < 2) {
        throw new Error(`Not enough teams remaining: ${this.remainingTeams.length}`);
      }
      const highSeedIndex = 0;
      let lowSeedIndex = -2 + 2 * this.seedsWithByes.length;
      if (Math.abs(lowSeedIndex) > this.remainingTeams.length) {
        lowSeedIndex = -1;
      }
      const team1 = this.remainingTeams.splice(highSeedIndex, 1)[0];
      const team2 = this.remainingTeams.splice(lowSeedIndex, 1)[0];
      return this.createMatch(team1, team2, null, rootMatch, false, side);
    } finally {
      this.logMethodExit('_create_final_round_match');
    }
  }

  private createIntermediateRoundMatch(rootMatch: Match | null, round: number, byes: number, side: Side): Match {
    this.logMethodEntry('_create_intermediate_round_match', {
      round,
      byes,
      side,
      remainingTeams: this.remainingTeams.length,
    });
    try {
      if (round <= 0) {
        return this.createFinalRoundMatch(rootMatch, byes, side);
      }
      const [rightByes, leftByes] = this.distributeByes(byes, side);
      const newMatch = this.createMatch(null, null, null, rootMatch, false, side);
      newMatch.previousLeftMatch = this.createSubMatches(newMatch, round - 1, leftByes, Side.LEFT);
      newMatch.previousRightMatch = this.createSubMatches(newMatch, round - 1, rightByes, Side.RIGHT);
      return newMatch;
    } finally {
      this.logMethodExit('_create_intermediate_round_match');
    }
  }

  private distributeByes(byes: number, side: Side): [number, number] {
    if (side === Side.LEFT) {
      return [Math.floor(byes / 2), Math.ceil(byes / 2)];
    }
    return [Math.ceil(byes / 2), Math.floor(byes / 2)];
  }

  private restBuffer(multiplier: number): number {
    const restMinutes = this.tournament.restTimeMinutes || 0;
    if (restMinutes > 0) {
      return restMinutes * 60 * 1000;
    }
    return TIMES.REST * Math.max(multiplier, 1);
  }

  private createMatch(
    team1: Team | null,
    team2: Team | null,
    ref: Team | null,
    nextWinnerMatch: Match | null,
    isLoser: boolean,
    side: Side,
  ): Match {
    const multiplier = isLoser
      ? (this.tournament.loserSetCount || 1)
      : (this.tournament.winnerSetCount || 1);
    const newMatch = new Match({
      id: createId(),
      matchId: null,
      team1Points: Array(multiplier).fill(0),
      team2Points: Array(multiplier).fill(0),
      start: this.tournament.start,
      end: this.tournament.start,
      referee: null,
      teamReferee: ref ?? null,
      loserNextMatch: null,
      losersBracket: isLoser,
      division: this.currentDivision,
      field: null,
      setResults: Array(multiplier).fill(0),
      bufferMs: this.restBuffer(multiplier),
      side,
      refereeCheckedIn: false,
      team1,
      team2,
      eventId: this.tournament.id,
      previousLeftMatch: null,
      previousRightMatch: null,
      winnerNextMatch: nextWinnerMatch,
    });

    if (nextWinnerMatch) {
      newMatch.winnerNextMatch = nextWinnerMatch;
    }

    this.tournament.matches[newMatch.id] = newMatch;
    if (team1) team1.matches = [newMatch];
    if (team2) team2.matches = [newMatch];
    return newMatch;
  }

  private addLoserMatch(newMatch: Match, side: Side): void {
    const prevMatches = newMatch.getMatches();
    if (prevMatches.length === 1) {
      newMatch.loserNextMatch = this.handleOnePrevMatch(newMatch, side);
    } else if (prevMatches.length === 2) {
      newMatch.loserNextMatch = this.handleTwoPrevMatches(newMatch, side);
    }
    if (newMatch.loserNextMatch) {
      if (side === Side.LEFT) {
        newMatch.loserNextMatch.previousLeftMatch = newMatch;
      } else {
        newMatch.loserNextMatch.previousRightMatch = newMatch;
      }
    }
  }

  private connectMatches(nextMatch: Match, prevMatch: Match, side: Side, loser: boolean): void {
    if (loser) {
      prevMatch.loserNextMatch = nextMatch;
    } else {
      prevMatch.winnerNextMatch = nextMatch;
    }
    if (side === Side.LEFT) {
      nextMatch.previousLeftMatch = prevMatch;
    } else {
      nextMatch.previousRightMatch = prevMatch;
    }
  }

  private handleOnePrevMatch(newMatch: Match, side: Side): Match {
    const loserNextMatch = this.createMatch(null, null, null, null, true, side);
    const prevMatch = newMatch.getMatches()[0];
    if (side === Side.LEFT) {
      loserNextMatch.previousRightMatch = prevMatch;
    } else {
      loserNextMatch.previousLeftMatch = prevMatch;
    }
    prevMatch.loserNextMatch = loserNextMatch;
    return loserNextMatch;
  }

  private handleTwoPrevMatches(newMatch: Match, side: Side): Match {
    const loserNextMatch = this.createMatch(null, null, null, null, true, side);
    const loserPrevMatch = this.createMatch(null, null, null, loserNextMatch, true, oppositeSide(side));
    if (side === Side.LEFT) {
      loserNextMatch.previousLeftMatch = newMatch;
      loserNextMatch.previousRightMatch = loserPrevMatch;
    } else {
      loserNextMatch.previousRightMatch = newMatch;
      loserNextMatch.previousLeftMatch = loserPrevMatch;
    }
    const leftPrev = newMatch.previousLeftMatch;
    if (leftPrev) {
      const leftLoserNext = leftPrev.loserNextMatch;
      if (leftLoserNext) {
        this.connectMatches(loserPrevMatch, leftLoserNext, Side.LEFT, false);
      } else {
        this.connectMatches(loserPrevMatch, leftPrev, Side.LEFT, true);
      }
    }
    const rightPrev = newMatch.previousRightMatch;
    if (rightPrev) {
      const rightLoserNext = rightPrev.loserNextMatch;
      if (rightLoserNext) {
        this.connectMatches(loserPrevMatch, rightLoserNext, Side.RIGHT, false);
      } else {
        this.connectMatches(loserPrevMatch, rightPrev, Side.RIGHT, true);
      }
    }
    return loserNextMatch;
  }

  private findLargestPowerOfTwo(n: number): number {
    let x = 0;
    while (n >> x) {
      x += 1;
    }
    return x - 1;
  }

  private remainderPowerOfTwo(n: number): [number, number] {
    const x = this.findLargestPowerOfTwo(n);
    const largest = 1 << x;
    const remainder = n - largest;
    return [remainder, x];
  }
}
