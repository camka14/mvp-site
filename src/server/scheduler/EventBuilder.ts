import crypto from 'crypto';
import { Brackets } from './Brackets';
import { Schedule } from './Schedule';
import {
  Division,
  League,
  Match,
  PlayingField,
  Team,
  Tournament,
  UserData,
  TIMES,
  MINUTE_MS,
  SchedulerContext,
} from './types';

const createId = () => crypto.randomUUID();

export class EventBuilder {
  event: League | Tournament;
  context: SchedulerContext;
  schedule: Schedule<Match, any, any, Division>;
  private placeholderIds: Set<string> = new Set();
  private participants: Record<string, Team | UserData> = {};
  private refereeCycle: UserData[] = [];

  constructor(event: League | Tournament, context: SchedulerContext) {
    this.context = context;
    this.event = event;
    this.participants = this.participantsForSchedule(this.event.teams);
    this.schedule = new Schedule(
      this.event.start,
      this.event.fields,
      this.participants,
      this.event.divisions,
      undefined,
      { endTime: this.event.end, timeSlots: this.event.timeSlots },
    );
    this.resetState();
  }

  private get isLeague(): boolean {
    return this.event instanceof League;
  }

  buildSchedule(): League | Tournament {
    this.resetState();
    this.ensureFieldsAvailable();

    const participantCapacity = this.desiredParticipantCapacity();
    const participants = this.prepareParticipants(participantCapacity);
    if (Object.keys(participants).length < 2) {
      throw new Error('Event requires at least two participants to schedule');
    }

    this.participants = participants;
    const scheduleParticipants = this.participantsForSchedule(participants);
    this.schedule = new Schedule(
      this.event.start,
      this.event.fields,
      scheduleParticipants,
      this.event.divisions,
      undefined,
      { endTime: this.event.end, timeSlots: this.event.timeSlots },
    );

    const durationMs = this.matchDuration();
    const scheduledMatches: Match[] = [];

    if (this.isLeague) {
      const regularMatches = this.scheduleRegularSeason(Object.values(participants), durationMs);
      scheduledMatches.push(...regularMatches);
      if (this.leagueHasPlayoffs(Object.values(participants).length)) {
        const maxEnd = this.maxEndTime(regularMatches);
        if (maxEnd) {
          this.schedule.advanceTo(new Date(maxEnd.getTime() + this.matchBuffer()));
        }
        const playoffMatches = this.schedulePlayoffs(Object.values(participants), durationMs);
        scheduledMatches.push(...playoffMatches);
      }

      this.assignChronologicalMatchIds(scheduledMatches);
      this.stripPlaceholderAssignments(scheduledMatches);
      for (const field of Object.values(this.event.fields)) {
        field.matches = [...scheduledMatches];
      }
      this.event.matches = {};
      for (const match of scheduledMatches) {
        this.event.matches[match.id] = match;
      }
    } else {
      const playoffMatches = this.schedulePlayoffs(Object.values(participants), durationMs);
      scheduledMatches.push(...playoffMatches);
    }

    this.stripPlaceholderAssignments(scheduledMatches);
    this.assignUserReferees(scheduledMatches);
    if (this.isLeague && this.event.doTeamsRef) {
      this.assignTeamReferees(scheduledMatches);
    }
    if (this.isLeague) {
      for (const field of Object.values(this.event.fields)) {
        field.matches = [...scheduledMatches];
      }
      this.event.matches = {};
      for (const match of scheduledMatches) {
        this.event.matches[match.id] = match;
      }
    }

    return this.event;
  }

  private leagueHasPlayoffs(participantCount: number): boolean {
    if (!this.isLeague) return false;
    return Boolean(this.event.includePlayoffs && participantCount > 1);
  }

  private resetState(): void {
    this.event.matches = {};
    for (const field of Object.values(this.event.fields)) {
      field.matches = [];
    }
    for (const team of Object.values(this.event.teams)) {
      team.matches = [];
    }
    for (const referee of this.event.referees) {
      referee.matches = [];
      if (!referee.divisions.length) {
        referee.divisions = [...this.event.divisions];
      }
    }
    this.refereeCycle = [...this.event.referees];
    this.placeholderIds.clear();
  }

  private ensureFieldsAvailable(): void {
    if (!Object.keys(this.event.fields).length) {
      throw new Error('Unable to schedule event because no fields are configured.');
    }
  }

  private defaultDivision(): Division {
    if (this.event.divisions.length) return this.event.divisions[0];
    return new Division('OPEN', 'OPEN');
  }

  private prepareParticipants(placeholderCount?: number): Record<string, Team> {
    for (const team of Object.values(this.event.teams)) {
      team.matches = [];
    }
    if (placeholderCount) {
      this.ensurePlaceholderCapacity(placeholderCount);
    }
    return this.event.teams;
  }

  private participantsForSchedule(teams: Record<string, Team>): Record<string, Team | UserData> {
    const participants: Record<string, Team | UserData> = { ...teams };
    for (const referee of this.event.referees) {
      if (!referee.divisions.length) referee.divisions = [...this.event.divisions];
      referee.matches = [];
      participants[referee.id] = referee;
    }
    return participants;
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

  private ensurePlaceholderCapacity(targetCount: number): void {
    if (targetCount < 2) targetCount = 2;
    if (Object.keys(this.event.teams).length >= targetCount) return;
    const division = this.defaultDivision();
    while (Object.keys(this.event.teams).length < targetCount) {
      const placeholderId = this.generatePlaceholderId('placeholder');
      const placeholder = new Team({
        id: placeholderId,
        seed: 0,
        captainId: '',
        division,
        matches: [],
        wins: 0,
        losses: 0,
        playerIds: [],
        name: '',
      });
      this.event.teams[placeholderId] = placeholder;
      this.placeholderIds.add(placeholderId);
    }
  }

  private generatePlaceholderId(prefix: string): string {
    let index = 1;
    while (true) {
      const candidate = `${prefix}-${index}`;
      if (!this.event.teams[candidate] && !this.placeholderIds.has(candidate)) {
        return candidate;
      }
      index += 1;
    }
  }

  private appendPlaceholderToSchedule(team: Team): void {
    const scheduleParticipants = this.schedule.participants;
    for (const [group, participants] of scheduleParticipants.entries()) {
      if (group.id === team.division.id) {
        participants.push(team);
        return;
      }
    }
  }

  private buildLeaguePlayoffPlaceholders(count: number): Team[] {
    const placeholders: Team[] = [];
    const division = this.defaultDivision();
    for (let seedIndex = 0; seedIndex < count; seedIndex += 1) {
      const placeholderId = this.generatePlaceholderId('playoff-placeholder');
      const placeholder = new Team({
        id: placeholderId,
        seed: count - seedIndex,
        captainId: '',
        division,
        matches: [],
        wins: 0,
        losses: 0,
        playerIds: [],
        name: `Seed ${seedIndex + 1}`,
      });
      this.event.teams[placeholderId] = placeholder;
      this.placeholderIds.add(placeholderId);
      this.appendPlaceholderToSchedule(placeholder);
      placeholders.push(placeholder);
    }
    return placeholders;
  }

  private desiredParticipantCapacity(): number {
    const maxParticipants = this.event.maxParticipants ?? 0;
    const teamCount = Object.keys(this.event.teams).length;
    return Math.max(teamCount, maxParticipants, 2);
  }

  private matchDuration(): number {
    if (this.event.usesSets && this.event.setDurationMinutes && this.event.setsPerMatch) {
      return this.event.setDurationMinutes * this.event.setsPerMatch * MINUTE_MS;
    }
    if (this.event.matchDurationMinutes) {
      return this.event.matchDurationMinutes * MINUTE_MS;
    }
    return 60 * MINUTE_MS;
  }

  private matchBuffer(): number {
    const restMinutes = this.event.restTimeMinutes || 0;
    if (restMinutes > 0) return restMinutes * MINUTE_MS;
    const multiplier = this.event.usesSets ? (this.event.setsPerMatch || 1) : 1;
    return TIMES.REST * Math.max(multiplier, 1);
  }

  private createMatch(team1: Team | null, team2: Team | null): Match {
    const setCount = this.event.usesSets ? (this.event.setsPerMatch || 1) : 1;
    return new Match({
      id: createId(),
      matchId: null,
      team1,
      team2,
      team1Points: Array(setCount).fill(0),
      team2Points: Array(setCount).fill(0),
      start: this.event.start,
      end: this.event.start,
      referee: null,
      teamReferee: null,
      winnerNextMatch: null,
      loserNextMatch: null,
      losersBracket: false,
      division: this.defaultDivision(),
      field: null,
      setResults: Array(setCount).fill(0),
      bufferMs: this.matchBuffer(),
      side: null,
      refereeCheckedIn: false,
      eventId: this.event.id,
    });
  }

  private scheduleRegularSeason(participants: Team[], durationMs: number): Match[] {
    const gamesPerOpponent = this.isLeague ? (this.event.gamesPerOpponent || 1) : 1;
    const rounds = this.roundRobinRounds(participants, gamesPerOpponent);
    const scheduled: Match[] = [];
    for (const roundPairs of rounds) {
      const roundScheduled: Match[] = [];
      for (const [home, away] of roundPairs) {
        const match = this.createMatch(home, away);
        this.schedule.scheduleEvent(match, durationMs);
        this.attachMatchToParticipants(match);
        scheduled.push(match);
        roundScheduled.push(match);
      }
      if (roundScheduled.length) {
        const lastEnd = roundScheduled.reduce((acc, match) => (match.end > acc ? match.end : acc), roundScheduled[0].end);
        this.schedule.advanceTo(new Date(lastEnd.getTime() + this.matchBuffer()));
      }
    }
    return scheduled;
  }

  private roundRobinRounds(participants: Team[], gamesPerOpponent: number): Array<Array<[Team, Team]>> {
    const teams = [...participants];
    if (teams.length < 2) return [];
    if (teams.length % 2 === 1) teams.push(null as any);
    const teamCount = teams.length;
    const half = teamCount / 2;
    const baseRounds: Array<Array<[Team, Team]>> = [];
    let working = [...teams];
    for (let i = 0; i < teamCount - 1; i += 1) {
      const pairings: Array<[Team, Team]> = [];
      for (let idx = 0; idx < half; idx += 1) {
        const home = working[idx];
        const away = working[teamCount - 1 - idx];
        if (!home || !away) continue;
        pairings.push([home, away]);
      }
      baseRounds.push(pairings);
      working = [working[0], working[working.length - 1], ...working.slice(1, -1)];
    }
    const fullSchedule: Array<Array<[Team, Team]>> = [];
    for (let repeat = 0; repeat < gamesPerOpponent; repeat += 1) {
      for (const pairings of baseRounds) {
        if (repeat % 2 === 1) {
          fullSchedule.push(pairings.map(([home, away]) => [away, home]));
        } else {
          fullSchedule.push([...pairings]);
        }
      }
    }
    return fullSchedule;
  }

  private schedulePlayoffs(participants: Team[], durationMs: number): Match[] {
    if (participants.length < 2) return [];
    if (!this.isLeague) {
      const bracketBuilder = new Brackets(this.event as Tournament, this.context);
      bracketBuilder.buildBrackets();
      this.schedule = bracketBuilder.bracketSchedule;
      this.event = bracketBuilder.tournament as League | Tournament;
      return Object.values(this.event.matches).sort((a, b) => (a.matchId || 0) - (b.matchId || 0));
    }

    const league = this.event as League;
    const playoffCount = Math.min(league.playoffTeamCount || participants.length, participants.length);
    if (playoffCount < 2) return [];

    const seeded = this.buildLeaguePlayoffPlaceholders(playoffCount);
    const teamLookup = Object.fromEntries(seeded.map((team) => [team.id, team]));

    const tournamentFields: Record<string, any> = {};
    for (const [fieldId, field] of Object.entries(this.event.fields)) {
      tournamentFields[fieldId] = new PlayingField({
        id: field.id,
        fieldNumber: field.fieldNumber,
        organizationId: field.organizationId,
        divisions: [...this.event.divisions],
        matches: [],
        events: [],
        rentalSlots: [...field.rentalSlots],
        name: field.name,
      });
    }

    const tournamentTeams: Record<string, Team> = {};
    for (const team of seeded) {
      tournamentTeams[team.id] = new Team({
        id: team.id,
        seed: team.seed,
        captainId: team.captainId,
        division: team.division,
        name: team.name,
        matches: [],
        playerIds: [...team.playerIds],
        wins: team.wins,
        losses: team.losses,
      });
    }

    const playoffStart = this.schedule.currentTime.getTime() > this.event.start.getTime()
      ? this.schedule.currentTime
      : this.event.start;

    const playoffTournament = new Tournament({
      id: `${this.event.id}`,
      name: `${this.event.name} Playoffs`,
      start: playoffStart,
      end: this.event.end,
      fields: tournamentFields,
      doubleElimination: this.event.doubleElimination,
      matches: {},
      fieldType: this.event.fieldType,
      location: this.event.location,
      organizationId: this.event.organizationId,
      winnerSetCount: this.event.winnerSetCount,
      loserSetCount: this.event.loserSetCount,
      teams: tournamentTeams,
      players: this.event.players,
      referees: this.event.referees,
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: seeded.length,
      teamSignup: true,
      divisions: this.event.divisions,
      eventType: 'TOURNAMENT',
      timeSlots: this.event.timeSlots,
      restTimeMinutes: this.event.restTimeMinutes,
      matchDurationMinutes: this.event.matchDurationMinutes,
      usesSets: this.event.usesSets,
      setDurationMinutes: this.event.setDurationMinutes,
    });

    const bracketBuilder = new Brackets(playoffTournament, this.context);
    bracketBuilder.bracketSchedule.advanceTo(playoffStart);
    bracketBuilder.buildBrackets();

    const bracketMatches = Object.values(bracketBuilder.tournament.matches).sort((a, b) => (a.matchId || 0) - (b.matchId || 0));

    const scheduledMatches: Match[] = [];
    for (const match of bracketMatches) {
      match.unschedule();
      if (match.team1) {
        match.team1 = teamLookup[match.team1.id] ?? match.team1;
      }
      if (match.team2) {
        match.team2 = teamLookup[match.team2.id] ?? match.team2;
      }
      if (match.teamReferee) {
        match.teamReferee = teamLookup[match.teamReferee.id] ?? match.teamReferee;
      }
      match.division = this.defaultDivision();
      match.bufferMs = this.matchBuffer();
      this.schedule.scheduleEvent(match, durationMs);
      this.attachMatchToParticipants(match);
      scheduledMatches.push(match);
    }
    return scheduledMatches;
  }

  private seedParticipants(participants: Team[], count: number): Team[] {
    return [...participants].sort((a, b) => b.seed - a.seed).slice(0, count);
  }

  private maxEndTime(matches: Match[]): Date | null {
    if (!matches.length) return null;
    return matches.reduce((latest, match) => (match.end > latest ? match.end : latest), matches[0].end);
  }

  private stripPlaceholderAssignments(matches: Match[]): void {
    for (const match of matches) {
      if (match.team1 && this.placeholderIds.has(match.team1.id)) match.team1 = null;
      if (match.team2 && this.placeholderIds.has(match.team2.id)) match.team2 = null;
      if (match.teamReferee && this.placeholderIds.has(match.teamReferee.id)) match.teamReferee = null;
    }
    if (this.placeholderIds.size) {
      const nextTeams: Record<string, Team> = {};
      for (const team of Object.values(this.event.teams)) {
        if (!this.placeholderIds.has(team.id)) nextTeams[team.id] = team;
      }
      this.event.teams = nextTeams;
    }
  }

  private assignChronologicalMatchIds(matches: Match[]): void {
    const ordered = [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      const fieldDiff = (a.field?.id ?? '').localeCompare(b.field?.id ?? '');
      if (fieldDiff !== 0) return fieldDiff;
      return a.id.localeCompare(b.id);
    });
    ordered.forEach((match, index) => {
      match.matchId = index + 1;
    });
  }

  private assignUserReferees(matches: Match[]): void {
    if (!this.event.referees.length) {
      matches.forEach((match) => this.attachMatchToParticipants(match));
      return;
    }
    const ordered = [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      return (a.field?.id ?? '').localeCompare(b.field?.id ?? '');
    });
    for (const match of ordered) {
      this.attachMatchToParticipants(match);
      if (match.referee || !match.division) continue;
      const availableRefs = this.schedule.freeParticipants(match.division, match.start, match.end)
        .filter((participant) => participant instanceof UserData) as UserData[];
      if (!availableRefs.length) continue;
      for (let i = 0; i < this.refereeCycle.length; i += 1) {
        const candidate = this.refereeCycle.shift() as UserData;
        if (availableRefs.find((ref) => ref.id === candidate.id)) {
          match.referee = candidate;
          candidate.matches.push(match);
          this.attachMatchToParticipants(match);
          this.refereeCycle.push(candidate);
          break;
        }
        this.refereeCycle.push(candidate);
      }
    }
  }

  private assignTeamReferees(matches: Match[]): void {
    const teams = Object.values(this.event.teams);
    const unassigned = [...teams];
    const ordered = [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      return (a.field?.id ?? '').localeCompare(b.field?.id ?? '');
    });
    for (const match of ordered) {
      this.attachMatchToParticipants(match);
      if (match.teamReferee || !match.division || !(match.team1 && match.team2)) continue;
      const availableTeams = this.schedule.freeParticipants(match.division, match.start, match.end)
        .filter((participant) => participant instanceof Team) as Team[];
      const filtered = availableTeams.filter((team) => team !== match.team1 && team !== match.team2);
      let candidate: Team | null = null;
      for (let i = 0; i < unassigned.length; i += 1) {
        const candidateTeam = unassigned[0];
        unassigned.push(unassigned.shift() as Team);
        if (filtered.includes(candidateTeam)) {
          candidate = candidateTeam;
          const idx = unassigned.indexOf(candidateTeam);
          if (idx >= 0) unassigned.splice(idx, 1);
          break;
        }
      }
      if (!candidate) {
        candidate = filtered[0] ?? null;
      }
      if (candidate) {
        match.teamReferee = candidate;
        candidate.matches.push(match);
        this.attachMatchToParticipants(match);
      }
    }
  }
}
