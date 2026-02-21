export const MINUTE_MS = 60 * 1000;

export const TIMES = {
  REST: 5 * MINUTE_MS,
  SET: 20 * MINUTE_MS,
};

export enum Side {
  LEFT = 'left',
  RIGHT = 'right',
}

export interface SchedulerContext {
  log: (message: string) => void;
  error: (message: string) => void;
}

export const sideFrom = (value?: string | null): Side | null => {
  if (!value) return null;
  if (value === Side.LEFT) return Side.LEFT;
  if (value === Side.RIGHT) return Side.RIGHT;
  return null;
};

export const oppositeSide = (value: Side): Side => (value === Side.LEFT ? Side.RIGHT : Side.LEFT);

export interface Group {
  id: string;
}

export interface Participant {
  id: string;
  matches?: Match[];
  getGroups(): Group[];
  setGroups(groups: Group[]): void;
  getEvents(): SchedulableEvent[];
}

export interface Resource {
  id: string;
  getGroups(): Group[];
  setGroups(groups: Group[]): void;
  getEvents(): SchedulableEvent[];
  setEvents(event: SchedulableEvent): void;
  addEvent(event: SchedulableEvent): void;
  deleteEvent(event: SchedulableEvent): void;
}

export interface SchedulableEvent {
  id: string;
  start: Date;
  end: Date;
  bufferMs: number;
  getGroups(): Group[];
  setGroups(groups: Group[]): void;
  getResource(): Resource | null;
  setResource(resource: Resource | null): void;
  getParticipants(): Participant[];
  getDependencies(): SchedulableEvent[];
  getDependants(): SchedulableEvent[];
}

export class Division implements Group {
  id: string;
  name: string;
  fieldIds: string[];

  constructor(id: string, name?: string, fieldIds?: string[]) {
    this.id = id;
    this.name = name ?? id;
    this.fieldIds = Array.isArray(fieldIds) ? fieldIds : [];
  }
}

export class TimeSlot {
  id: string;
  dayOfWeek: number;
  startDate: Date;
  endDate: Date | null;
  repeating: boolean;
  startTimeMinutes: number;
  endTimeMinutes: number;
  price?: number | null;
  field?: string | null;
  divisions: Division[];

  constructor(params: {
    id: string;
    dayOfWeek: number;
    startDate: Date;
    endDate?: Date | null;
    repeating: boolean;
    startTimeMinutes: number;
    endTimeMinutes: number;
    price?: number | null;
    field?: string | null;
    divisions?: Division[];
  }) {
    this.id = params.id;
    this.dayOfWeek = params.dayOfWeek;
    this.startDate = params.startDate;
    this.endDate = params.endDate ?? null;
    this.repeating = params.repeating;
    this.startTimeMinutes = params.startTimeMinutes;
    this.endTimeMinutes = params.endTimeMinutes;
    this.price = params.price ?? null;
    this.field = params.field ?? null;
    this.divisions = params.divisions ?? [];
  }

  asDateRange(reference: Date): [Date, Date] {
    const referenceDate = new Date(reference);
    // Slots store Monday-based indexes (0=Mon ... 6=Sun), while JS Date#getDay() is Sunday-based.
    const referenceDay = (referenceDate.getDay() + 6) % 7;
    const daysAhead = (this.dayOfWeek - referenceDay + 7) % 7;
    const slotDate = new Date(referenceDate);
    slotDate.setHours(0, 0, 0, 0);
    slotDate.setDate(slotDate.getDate() + daysAhead);
    const start = new Date(slotDate.getTime() + this.startTimeMinutes * MINUTE_MS);
    const end = new Date(slotDate.getTime() + this.endTimeMinutes * MINUTE_MS);
    return [start, end];
  }
}

export class PlayingField implements Resource {
  id: string;
  fieldNumber: number;
  organizationId?: string | null;
  divisions: Division[];
  matches: Match[];
  events: BlockingEvent[];
  rentalSlots: TimeSlot[];
  name: string;

  constructor(params: {
    id: string;
    fieldNumber: number;
    organizationId?: string | null;
    divisions?: Division[];
    matches?: Match[];
    events?: BlockingEvent[];
    rentalSlots?: TimeSlot[];
    name?: string;
  }) {
    this.id = params.id;
    this.fieldNumber = params.fieldNumber;
    this.organizationId = params.organizationId ?? null;
    this.divisions = params.divisions ?? [];
    this.matches = params.matches ?? [];
    this.events = params.events ?? [];
    this.rentalSlots = params.rentalSlots ?? [];
    this.name = params.name ?? '';
  }

  getEvents(): SchedulableEvent[] {
    const slots = this.rentalSlots.filter((slot) => !slot.repeating);
    const eventSlots: BlockingEvent[] = [];
    for (const slot of slots) {
      if (!slot.endDate) continue;
      eventSlots.push(
        new BlockingEvent({
          id: slot.id,
          start: slot.startDate,
          end: slot.endDate,
          field: this,
          participants: [],
          parentId: '',
        }),
      );
    }
    return [...this.matches, ...this.events, ...eventSlots];
  }

  setEvents(event: SchedulableEvent): void {
    this.matches.push(event as Match);
  }

  getGroups(): Group[] {
    return this.divisions;
  }

  setGroups(groups: Group[]): void {
    this.divisions = groups as Division[];
  }

  addEvent(event: SchedulableEvent): void {
    this.matches.push(event as Match);
  }

  deleteEvent(event: SchedulableEvent): void {
    this.matches = this.matches.filter((match) => match.id !== event.id);
  }
}

export class Team implements Participant {
  id: string;
  seed: number;
  captainId: string;
  name: string;
  division: Division;
  matches: Match[];
  playerIds: string[];
  wins: number;
  losses: number;

  constructor(params: {
    id: string;
    seed: number;
    captainId: string;
    division: Division;
    name?: string;
    matches?: Match[];
    playerIds?: string[];
    wins?: number;
    losses?: number;
  }) {
    this.id = params.id;
    this.seed = params.seed;
    this.captainId = params.captainId;
    this.division = params.division;
    this.name = params.name ?? '';
    this.matches = params.matches ?? [];
    this.playerIds = params.playerIds ?? [];
    this.wins = params.wins ?? 0;
    this.losses = params.losses ?? 0;
  }

  getGroups(): Group[] {
    return [this.division];
  }

  setGroups(groups: Group[]): void {
    if (!groups.length) return;
    this.division = groups[0] as Division;
  }

  getEvents(): SchedulableEvent[] {
    return this.matches;
  }
}

export class UserData implements Participant {
  id: string;
  firstName: string;
  lastName: string;
  userName: string;
  hasStripeAccount: boolean;
  teamIds: string[];
  matches: Match[];
  divisions: Division[];

  constructor(params: {
    id: string;
    firstName?: string;
    lastName?: string;
    userName?: string;
    hasStripeAccount?: boolean;
    teamIds?: string[];
    matches?: Match[];
    divisions?: Division[];
  }) {
    this.id = params.id;
    this.firstName = params.firstName ?? '';
    this.lastName = params.lastName ?? '';
    this.userName = params.userName ?? '';
    this.hasStripeAccount = params.hasStripeAccount ?? false;
    this.teamIds = params.teamIds ?? [];
    this.matches = params.matches ?? [];
    this.divisions = params.divisions ?? [];
  }

  getGroups(): Group[] {
    return this.divisions;
  }

  setGroups(groups: Group[]): void {
    this.divisions = groups as Division[];
  }

  getEvents(): SchedulableEvent[] {
    return this.matches;
  }
}

export class Match implements SchedulableEvent {
  id: string;
  matchId: number | null;
  locked: boolean;
  team1Points: number[];
  team2Points: number[];
  start: Date;
  end: Date;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  losersBracket?: boolean | null;
  division: Division;
  field: PlayingField | null;
  setResults: number[];
  bufferMs: number;
  side: Side | null;
  refereeCheckedIn?: boolean | null;
  teamReferee: Team | null;
  referee: UserData | null;
  team1: Team | null;
  team2: Team | null;
  eventId: string;
  previousLeftMatch: Match | null;
  previousRightMatch: Match | null;
  winnerNextMatch: Match | null;
  loserNextMatch: Match | null;

  constructor(params: {
    id: string;
    matchId?: number | null;
    locked?: boolean;
    team1Points?: number[];
    team2Points?: number[];
    start: Date;
    end: Date;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    losersBracket?: boolean | null;
    division: Division;
    field?: PlayingField | null;
    setResults?: number[];
    bufferMs: number;
    side?: Side | null;
    refereeCheckedIn?: boolean | null;
    teamReferee?: Team | null;
    referee?: UserData | null;
    team1?: Team | null;
    team2?: Team | null;
    eventId: string;
    previousLeftMatch?: Match | null;
    previousRightMatch?: Match | null;
    winnerNextMatch?: Match | null;
    loserNextMatch?: Match | null;
  }) {
    this.id = params.id;
    this.matchId = params.matchId ?? null;
    this.locked = params.locked ?? false;
    this.team1Points = params.team1Points ?? [];
    this.team2Points = params.team2Points ?? [];
    this.start = params.start;
    this.end = params.end;
    this.createdAt = params.createdAt ?? null;
    this.updatedAt = params.updatedAt ?? null;
    this.losersBracket = params.losersBracket ?? false;
    this.division = params.division;
    this.field = params.field ?? null;
    this.setResults = params.setResults ?? [];
    this.bufferMs = params.bufferMs;
    this.side = params.side ?? null;
    this.refereeCheckedIn = params.refereeCheckedIn ?? false;
    this.teamReferee = params.teamReferee ?? null;
    this.referee = params.referee ?? null;
    this.team1 = params.team1 ?? null;
    this.team2 = params.team2 ?? null;
    this.eventId = params.eventId;
    this.previousLeftMatch = params.previousLeftMatch ?? null;
    this.previousRightMatch = params.previousRightMatch ?? null;
    this.winnerNextMatch = params.winnerNextMatch ?? null;
    this.loserNextMatch = params.loserNextMatch ?? null;
  }

  unschedule(): void {
    if (this.field) {
      this.field.deleteEvent(this);
      this.field = null;
    }
  }

  getMatches(): Match[] {
    const matches: Match[] = [];
    if (this.previousRightMatch) matches.push(this.previousRightMatch);
    if (this.previousLeftMatch) matches.push(this.previousLeftMatch);
    return matches;
  }

  advanceTeams(winner: Team, loser: Team): void {
    if (this.winnerNextMatch) {
      winner.matches.push(this.winnerNextMatch);
    }
    if (this.winnerNextMatch && this.winnerNextMatch === this.loserNextMatch) {
      if (this.loserNextMatch) {
        loser.matches.push(this.loserNextMatch);
      }
      if (winner.losses === 0) {
        return;
      }
      if (this.winnerNextMatch) {
        this.winnerNextMatch.team1 = winner;
        this.winnerNextMatch.team2 = loser;
        this.winnerNextMatch.teamReferee = this.teamReferee;
      }
    } else {
      if (this.winnerNextMatch) {
        if (this.side === Side.LEFT && !this.winnerNextMatch.team1) {
          this.winnerNextMatch.team1 = winner;
        } else {
          this.winnerNextMatch.team2 = winner;
        }
      }
      if (this.loserNextMatch) {
        loser.matches.push(this.loserNextMatch);
        if (this.side === Side.LEFT && !this.loserNextMatch.team1) {
          this.loserNextMatch.team1 = loser;
        } else {
          this.loserNextMatch.team2 = loser;
        }
      }
    }
  }

  isBye(): boolean {
    return Boolean(this.team1) !== Boolean(this.team2);
  }

  getParticipants(): Participant[] {
    const participants: Participant[] = [];
    for (const participant of [this.team1, this.team2, this.teamReferee, this.referee]) {
      if (participant) participants.push(participant);
    }
    return participants;
  }

  getResource(): Resource | null {
    return this.field;
  }

  setResource(resource: Resource | null): void {
    this.field = resource as PlayingField | null;
  }

  getGroups(): Group[] {
    return [this.division];
  }

  setGroups(groups: Group[]): void {
    if (!groups.length) return;
    this.division = groups[0] as Division;
  }

  getDependencies(): Match[] {
    const matches: Match[] = [];
    if (this.previousLeftMatch) matches.push(this.previousLeftMatch);
    if (this.previousRightMatch) matches.push(this.previousRightMatch);
    return matches;
  }

  getDependants(): Match[] {
    const matches: Match[] = [];
    if (this.winnerNextMatch) matches.push(this.winnerNextMatch);
    if (this.loserNextMatch) matches.push(this.loserNextMatch);
    return matches;
  }
}

export class Tournament {
  id: string;
  start: Date;
  end: Date;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  name: string;
  description: string;
  waitListIds: string[];
  freeAgentIds: string[];
  maxParticipants: number;
  teamSignup: boolean;
  coordinates: number[] | null;
  organizationId: string | null;
  requiredTemplateIds: string[];
  location: string;
  price: number | null;
  allowPaymentPlans: boolean;
  installmentCount: number;
  installmentDueDates: Date[];
  installmentAmounts: number[];
  allowTeamSplitDefault: boolean;
  sportId: string;
  teamSizeLimit: number | null;
  singleDivision: boolean;
  seedColor: number | null;
  cancellationRefundHours: number | null;
  registrationCutoffHours: number | null;
  rating: number | null;
  minAge: number | null;
  maxAge: number | null;
  doTeamsRef: boolean;
  fieldCount: number | null;
  prize: string | null;
  hostId: string;
  assistantHostIds: string[];
  noFixedEndDateTime: boolean;
  imageId: string;
  loserBracketPointsToVictory: number[] | null;
  winnerBracketPointsToVictory: number[] | null;
  restTimeMinutes: number;
  state: string;
  leagueScoringConfig: Record<string, any> | null;
  teams: Record<string, Team>;
  players: UserData[];
  registrationIds: string[];
  divisions: Division[];
  referees: UserData[];
  eventType: string;
  fields: Record<string, PlayingField>;
  doubleElimination: boolean;
  matches: Record<string, Match>;
  winnerSetCount: number | null;
  loserSetCount: number | null;
  matchDurationMinutes: number;
  usesSets: boolean;
  setDurationMinutes: number;
  gamesPerOpponent?: number;
  includePlayoffs?: boolean;
  playoffTeamCount?: number;
  setsPerMatch?: number;
  pointsToVictory?: number[];
  timeSlots: TimeSlot[];

  constructor(params: {
    id: string;
    start: Date;
    end: Date;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    name: string;
    description?: string;
    waitListIds?: string[];
    freeAgentIds?: string[];
    maxParticipants: number;
    teamSignup: boolean;
    coordinates?: number[] | null;
    organizationId?: string | null;
    requiredTemplateIds?: string[];
    location?: string;
    price?: number | null;
    allowPaymentPlans?: boolean;
    installmentCount?: number;
    installmentDueDates?: Date[];
    installmentAmounts?: number[];
    allowTeamSplitDefault?: boolean;
    sportId?: string;
    teamSizeLimit?: number | null;
    singleDivision?: boolean;
    seedColor?: number | null;
    cancellationRefundHours?: number | null;
    registrationCutoffHours?: number | null;
    rating?: number | null;
    minAge?: number | null;
    maxAge?: number | null;
    doTeamsRef?: boolean;
    fieldCount?: number | null;
    prize?: string | null;
    hostId?: string;
    assistantHostIds?: string[];
    noFixedEndDateTime?: boolean;
    imageId?: string;
    loserBracketPointsToVictory?: number[] | null;
    winnerBracketPointsToVictory?: number[] | null;
    restTimeMinutes?: number;
    state?: string;
    leagueScoringConfig?: Record<string, any> | null;
    teams?: Record<string, Team>;
    players?: UserData[];
    registrationIds?: string[];
    divisions?: Division[];
    referees?: UserData[];
    eventType: string;
    fields?: Record<string, PlayingField>;
    doubleElimination?: boolean;
    matches?: Record<string, Match>;
    winnerSetCount?: number | null;
    loserSetCount?: number | null;
    matchDurationMinutes?: number;
    usesSets?: boolean;
    setDurationMinutes?: number;
    gamesPerOpponent?: number;
    includePlayoffs?: boolean;
    playoffTeamCount?: number;
    setsPerMatch?: number;
    pointsToVictory?: number[];
    timeSlots?: TimeSlot[];
  }) {
    this.id = params.id;
    this.start = params.start;
    this.end = params.end;
    this.createdAt = params.createdAt ?? null;
    this.updatedAt = params.updatedAt ?? null;
    this.name = params.name;
    this.description = params.description ?? '';
    this.waitListIds = params.waitListIds ?? [];
    this.freeAgentIds = params.freeAgentIds ?? [];
    this.maxParticipants = params.maxParticipants;
    this.teamSignup = params.teamSignup;
    this.coordinates = params.coordinates ?? null;
    this.organizationId = params.organizationId ?? null;
    this.requiredTemplateIds = params.requiredTemplateIds ?? [];
    this.location = params.location ?? '';
    this.price = params.price ?? null;
    this.allowPaymentPlans = params.allowPaymentPlans ?? false;
    this.installmentCount = params.installmentCount ?? 0;
    this.installmentDueDates = params.installmentDueDates ?? [];
    this.installmentAmounts = params.installmentAmounts ?? [];
    this.allowTeamSplitDefault = params.allowTeamSplitDefault ?? false;
    this.sportId = params.sportId ?? '';
    this.teamSizeLimit = params.teamSizeLimit ?? null;
    this.singleDivision = params.singleDivision ?? false;
    this.seedColor = params.seedColor ?? null;
    this.cancellationRefundHours = params.cancellationRefundHours ?? null;
    this.registrationCutoffHours = params.registrationCutoffHours ?? null;
    this.rating = params.rating ?? null;
    this.minAge = params.minAge ?? null;
    this.maxAge = params.maxAge ?? null;
    this.doTeamsRef = typeof params.doTeamsRef === 'boolean' ? params.doTeamsRef : true;
    this.fieldCount = params.fieldCount ?? null;
    this.prize = params.prize ?? null;
    this.hostId = params.hostId ?? '';
    this.assistantHostIds = params.assistantHostIds ?? [];
    this.noFixedEndDateTime = params.noFixedEndDateTime ?? true;
    this.imageId = params.imageId ?? '';
    this.loserBracketPointsToVictory = params.loserBracketPointsToVictory ?? null;
    this.winnerBracketPointsToVictory = params.winnerBracketPointsToVictory ?? null;
    this.restTimeMinutes = params.restTimeMinutes ?? 0;
    this.state = params.state ?? 'UNPUBLISHED';
    this.leagueScoringConfig = params.leagueScoringConfig ?? null;
    this.teams = params.teams ?? {};
    this.players = params.players ?? [];
    this.registrationIds = params.registrationIds ?? [];
    this.divisions = params.divisions ?? [];
    this.referees = params.referees ?? [];
    this.eventType = params.eventType;
    this.fields = params.fields ?? {};
    this.doubleElimination = params.doubleElimination ?? false;
    this.matches = params.matches ?? {};
    this.winnerSetCount = params.winnerSetCount ?? null;
    this.loserSetCount = params.loserSetCount ?? null;
    this.matchDurationMinutes = params.matchDurationMinutes ?? 0;
    this.usesSets = params.usesSets ?? false;
    this.setDurationMinutes = params.setDurationMinutes ?? 0;
    this.gamesPerOpponent = params.gamesPerOpponent ?? undefined;
    this.includePlayoffs = params.includePlayoffs ?? undefined;
    this.playoffTeamCount = params.playoffTeamCount ?? undefined;
    this.setsPerMatch = params.setsPerMatch ?? undefined;
    this.pointsToVictory = params.pointsToVictory ?? undefined;
    this.timeSlots = params.timeSlots ?? [];
  }
}

export class League extends Tournament {
  gamesPerOpponent: number;
  includePlayoffs: boolean;
  playoffTeamCount: number;
  setsPerMatch: number;
  pointsToVictory: number[];

  constructor(params: ConstructorParameters<typeof Tournament>[0] & {
    gamesPerOpponent?: number;
    includePlayoffs?: boolean;
    playoffTeamCount?: number;
    setsPerMatch?: number;
    pointsToVictory?: number[];
  }) {
    super(params);
    this.gamesPerOpponent = params.gamesPerOpponent ?? 1;
    this.includePlayoffs = params.includePlayoffs ?? false;
    this.playoffTeamCount = params.playoffTeamCount ?? 0;
    this.setsPerMatch = params.setsPerMatch ?? 0;
    this.pointsToVictory = params.pointsToVictory ?? [];
  }
}

export class BlockingEvent implements SchedulableEvent {
  id: string;
  start: Date;
  end: Date;
  participants: UserData[];
  field: PlayingField;
  parentId: string;
  bufferMs: number;

  constructor(params: {
    id: string;
    start: Date;
    end: Date;
    participants: UserData[];
    field: PlayingField;
    parentId: string;
  }) {
    this.id = params.id;
    this.start = params.start;
    this.end = params.end;
    this.participants = params.participants;
    this.field = params.field;
    this.parentId = params.parentId;
    this.bufferMs = 0;
  }

  getParticipants(): Participant[] {
    return this.participants;
  }

  getResource(): Resource | null {
    return this.field;
  }

  setResource(resource: Resource | null): void {
    if (resource) this.field = resource as PlayingField;
  }

  getGroups(): Group[] {
    return this.field.getGroups();
  }

  setGroups(groups: Group[]): void {
    this.field.setGroups(groups);
  }

  getDependencies(): SchedulableEvent[] {
    return [];
  }

  getDependants(): SchedulableEvent[] {
    return [];
  }
}
