import {
  League,
  Match,
  Tournament,
  UserData,
  type EventOfficial,
  type EventOfficialPosition,
  type MatchOfficialAssignment,
  type OfficialSchedulingMode,
  type PlayingField,
  type Team,
} from './types';

type RequiredOfficialSlot = {
  positionId: string;
  slotIndex: number;
};

type PreviewOptions = {
  field: PlayingField | null;
  start: Date;
  end: Date;
  requireFull: boolean;
  ignoreConflicts: boolean;
};

type PlannerDecision = {
  assignments: MatchOfficialAssignment[];
  complete: boolean;
};

type OfficialCommitment = {
  matchId: string;
  start: Date;
  end: Date;
};

const LEGACY_PRIMARY_POSITION_ID = 'legacy_primary_official';

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date): boolean => (
  startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime()
);

const compareNullableNumbers = (left: number | null, right: number | null): number => {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left - right;
};

const defaultPositionsForEvent = (event: Tournament | League): EventOfficialPosition[] => {
  if (Array.isArray(event.officialPositions) && event.officialPositions.length) {
    return event.officialPositions;
  }
  if (!event.officials.length) {
    return [];
  }
  return [{
    id: LEGACY_PRIMARY_POSITION_ID,
    name: 'Official',
    count: 1,
    order: 0,
  }];
};

const defaultEventOfficialsForEvent = (
  event: Tournament | League,
  positions: EventOfficialPosition[],
): EventOfficial[] => {
  if (Array.isArray(event.eventOfficials) && event.eventOfficials.length) {
    return event.eventOfficials.filter((official) => official.isActive !== false);
  }
  const positionIds = positions.map((position) => position.id);
  return event.officials.map((official) => ({
    id: `event_official_${event.id}_${official.id}`,
    userId: official.id,
    positionIds: [...positionIds],
    fieldIds: [],
    isActive: true,
  }));
};

const buildRequiredSlots = (positions: EventOfficialPosition[]): RequiredOfficialSlot[] => {
  const slots: RequiredOfficialSlot[] = [];
  positions
    .slice()
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .forEach((position) => {
      for (let slotIndex = 0; slotIndex < position.count; slotIndex += 1) {
        slots.push({ positionId: position.id, slotIndex });
      }
    });
  return slots;
};

const assignmentSortKey = (assignment: MatchOfficialAssignment): string => (
  `${assignment.positionId}:${String(assignment.slotIndex).padStart(4, '0')}:${assignment.userId}`
);

export class OfficialStaffingPlanner {
  readonly event: Tournament | League;
  readonly mode: OfficialSchedulingMode;
  readonly positions: EventOfficialPosition[];
  readonly requiredSlots: RequiredOfficialSlot[];
  readonly userById: Map<string, UserData>;
  readonly officialById: Map<string, EventOfficial>;
  readonly teamById: Map<string, Team>;

  private readonly commitmentsByUserId = new Map<string, OfficialCommitment[]>();
  private readonly assignmentCountByUserId = new Map<string, number>();
  private readonly assignmentCountByUserPosition = new Map<string, number>();
  private readonly lastAssignmentEndByUserId = new Map<string, number>();
  private readonly previewCache = new Map<string, MatchOfficialAssignment[]>();

  constructor(event: Tournament | League) {
    this.event = event;
    this.mode = event.officialSchedulingMode ?? 'STAFFING';
    this.positions = defaultPositionsForEvent(event);
    this.requiredSlots = buildRequiredSlots(this.positions);
    this.userById = new Map(event.officials.map((official) => [official.id, official]));
    this.officialById = new Map(
      defaultEventOfficialsForEvent(event, this.positions)
        .filter((official) => this.userById.has(official.userId))
        .map((official) => [official.id, official]),
    );
    this.teamById = new Map(Object.values(event.teams).map((team) => [team.id, team]));
  }

  hasRequiredSlots(): boolean {
    return this.requiredSlots.length > 0;
  }

  hasCommittedAssignments(match: Match): boolean {
    return Array.isArray(match.officialAssignments) && match.officialAssignments.length > 0;
  }

  seedCommittedMatches(matches: Match[]): void {
    const ordered = [...matches].sort((left, right) => {
      const startDiff = left.start.getTime() - right.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = left.end.getTime() - right.end.getTime();
      if (endDiff !== 0) return endDiff;
      return left.id.localeCompare(right.id);
    });
    for (const match of ordered) {
      const normalizedAssignments = this.normalizeCommittedAssignments(match);
      if (!normalizedAssignments.length) {
        continue;
      }
      this.recordAssignments(match, normalizedAssignments);
    }
  }

  previewSchedulingCandidate(match: Match, field: PlayingField, start: Date, end: Date): boolean {
    const preview = this.planAssignments(match, {
      field,
      start,
      end,
      requireFull: true,
      ignoreConflicts: false,
    });
    const key = this.previewKey(match.id, field.id, start, end);
    if (!preview.complete) {
      this.previewCache.delete(key);
      return false;
    }
    this.previewCache.set(key, preview.assignments);
    return true;
  }

  commitScheduledMatch(match: Match): void {
    const fieldId = match.field?.id ?? '';
    const key = this.previewKey(match.id, fieldId, match.start, match.end);
    const preview = this.previewCache.get(key);
    this.previewCache.delete(key);
    const assignments = preview ?? this.planAssignments(match, {
      field: match.field,
      start: match.start,
      end: match.end,
      requireFull: true,
      ignoreConflicts: false,
    }).assignments;
    if (assignments.length !== this.requiredSlots.length) {
      throw new Error('Unable to fully staff scheduled match without conflicts.');
    }
    this.applyAssignments(match, assignments);
  }

  assignMatch(match: Match): void {
    const decision = this.planAssignments(match, {
      field: match.field,
      start: match.start,
      end: match.end,
      requireFull: this.mode === 'STAFFING',
      ignoreConflicts: this.mode === 'OFF',
    });
    if (this.mode === 'STAFFING' && decision.assignments.length !== this.requiredSlots.length) {
      throw new Error('Unable to fully staff scheduled match without conflicts.');
    }
    this.applyAssignments(match, decision.assignments);
  }

  assignMatches(matches: Match[]): void {
    const ordered = [...matches].sort((left, right) => {
      const startDiff = left.start.getTime() - right.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = left.end.getTime() - right.end.getTime();
      if (endDiff !== 0) return endDiff;
      return (left.field?.id ?? '').localeCompare(right.field?.id ?? '');
    });
    for (const match of ordered) {
      this.assignMatch(match);
    }
  }

  private previewKey(matchId: string, fieldId: string, start: Date, end: Date): string {
    return `${matchId}:${fieldId}:${start.getTime()}:${end.getTime()}`;
  }

  private planAssignments(match: Match, options: PreviewOptions): PlannerDecision {
    if (!this.requiredSlots.length || !options.field) {
      return { assignments: [], complete: !this.requiredSlots.length };
    }
    const field = options.field;

    const selectedAssignments: MatchOfficialAssignment[] = [];
    const selectedUserIds = new Set<string>();
    const tempCommitments = new Map<string, OfficialCommitment[]>();
    const tempAssignmentTotals = new Map<string, number>();
    const tempPositionTotals = new Map<string, number>();
    const tempLastAssigned = new Map<string, number>();
    const pendingSlots = [...this.requiredSlots];

    while (pendingSlots.length) {
      const candidateSets = pendingSlots.map((slot) => ({
        slot,
        candidates: this.eligibleCandidatesForSlot(match, slot, field, options, {
          selectedUserIds,
          tempCommitments,
          tempAssignmentTotals,
          tempPositionTotals,
          tempLastAssigned,
        }),
      }));

      candidateSets.sort((left, right) => {
        const countDiff = left.candidates.length - right.candidates.length;
        if (countDiff !== 0) return countDiff;
        if (left.slot.positionId !== right.slot.positionId) {
          return left.slot.positionId.localeCompare(right.slot.positionId);
        }
        return left.slot.slotIndex - right.slot.slotIndex;
      });

      const next = candidateSets[0];
      if (!next || !next.candidates.length) {
        if (options.requireFull) {
          return { assignments: [], complete: false };
        }
        break;
      }

      const chosen = next.candidates[0];
      selectedAssignments.push(chosen.assignment);
      selectedUserIds.add(chosen.user.id);
      const tempCommitment = tempCommitments.get(chosen.user.id) ?? [];
      tempCommitment.push({
        matchId: match.id,
        start: options.start,
        end: options.end,
      });
      tempCommitments.set(chosen.user.id, tempCommitment);
      tempAssignmentTotals.set(chosen.user.id, (tempAssignmentTotals.get(chosen.user.id) ?? 0) + 1);
      const positionKey = `${chosen.user.id}:${next.slot.positionId}`;
      tempPositionTotals.set(positionKey, (tempPositionTotals.get(positionKey) ?? 0) + 1);
      tempLastAssigned.set(chosen.user.id, options.end.getTime());
      const removeIndex = pendingSlots.findIndex((slot) => (
        slot.positionId === next.slot.positionId && slot.slotIndex === next.slot.slotIndex
      ));
      if (removeIndex >= 0) {
        pendingSlots.splice(removeIndex, 1);
      } else {
        break;
      }
    }

    selectedAssignments.sort((left, right) => assignmentSortKey(left).localeCompare(assignmentSortKey(right)));
    return {
      assignments: selectedAssignments,
      complete: selectedAssignments.length === this.requiredSlots.length,
    };
  }

  private eligibleCandidatesForSlot(
    match: Match,
    slot: RequiredOfficialSlot,
    field: PlayingField,
    options: PreviewOptions,
    temp: {
      selectedUserIds: Set<string>;
      tempCommitments: Map<string, OfficialCommitment[]>;
      tempAssignmentTotals: Map<string, number>;
      tempPositionTotals: Map<string, number>;
      tempLastAssigned: Map<string, number>;
    },
  ): Array<{ official: EventOfficial; user: UserData; assignment: MatchOfficialAssignment; score: [number, number, number, string] }> {
    const results: Array<{ official: EventOfficial; user: UserData; assignment: MatchOfficialAssignment; score: [number, number, number, string] }> = [];
    for (const official of this.officialById.values()) {
      if (!official.positionIds.includes(slot.positionId)) {
        continue;
      }
      const user = this.userById.get(official.userId);
      if (!user || temp.selectedUserIds.has(user.id)) {
        continue;
      }
      if (official.fieldIds.length && !official.fieldIds.includes(field.id)) {
        continue;
      }
      if (this.isSameMatchParticipant(match, user)) {
        continue;
      }

      const hasConflict = this.userHasConflict(user, match.id, options.start, options.end, temp.tempCommitments);
      if (!options.ignoreConflicts && hasConflict) {
        continue;
      }

      const exactCount = (this.assignmentCountByUserPosition.get(`${user.id}:${slot.positionId}`) ?? 0)
        + (temp.tempPositionTotals.get(`${user.id}:${slot.positionId}`) ?? 0);
      const totalCount = (this.assignmentCountByUserId.get(user.id) ?? 0)
        + (temp.tempAssignmentTotals.get(user.id) ?? 0);
      const lastAssigned = temp.tempLastAssigned.get(user.id)
        ?? this.lastAssignmentEndByUserId.get(user.id)
        ?? 0;

      results.push({
        official,
        user,
        assignment: {
          positionId: slot.positionId,
          slotIndex: slot.slotIndex,
          holderType: 'OFFICIAL',
          userId: user.id,
          eventOfficialId: official.id,
          checkedIn: false,
          hasConflict: options.ignoreConflicts ? hasConflict : false,
        },
        score: [exactCount, totalCount, lastAssigned, user.id],
      });
    }

    results.sort((left, right) => {
      const exactDiff = left.score[0] - right.score[0];
      if (exactDiff !== 0) return exactDiff;
      const totalDiff = left.score[1] - right.score[1];
      if (totalDiff !== 0) return totalDiff;
      const recencyDiff = compareNullableNumbers(left.score[2], right.score[2]);
      if (recencyDiff !== 0) return recencyDiff;
      return left.score[3].localeCompare(right.score[3]);
    });
    return results;
  }

  private userHasConflict(
    user: UserData,
    currentMatchId: string,
    start: Date,
    end: Date,
    tempCommitments: Map<string, OfficialCommitment[]>,
  ): boolean {
    const committedAssignments = this.commitmentsByUserId.get(user.id) ?? [];
    for (const commitment of committedAssignments) {
      if (commitment.matchId === currentMatchId) {
        continue;
      }
      if (overlaps(commitment.start, commitment.end, start, end)) {
        return true;
      }
    }
    for (const commitment of tempCommitments.get(user.id) ?? []) {
      if (commitment.matchId === currentMatchId) {
        continue;
      }
      if (overlaps(commitment.start, commitment.end, start, end)) {
        return true;
      }
    }
    for (const teamId of user.teamIds ?? []) {
      const team = this.teamById.get(teamId);
      if (!team) {
        continue;
      }
      for (const teamMatch of team.matches ?? []) {
        if (teamMatch.id === currentMatchId) {
          continue;
        }
        if (overlaps(teamMatch.start, teamMatch.end, start, end)) {
          return true;
        }
      }
    }
    return false;
  }

  private isSameMatchParticipant(match: Match, user: UserData): boolean {
    const team1Id = match.team1?.id ?? null;
    const team2Id = match.team2?.id ?? null;
    if (!team1Id && !team2Id) {
      return false;
    }
    return user.teamIds.some((teamId) => teamId === team1Id || teamId === team2Id);
  }

  private applyAssignments(match: Match, assignments: MatchOfficialAssignment[]): void {
    match.officialAssignments = assignments.map((assignment) => ({ ...assignment }));
    const primaryAssignment = assignments.find((assignment) => assignment.holderType === 'OFFICIAL') ?? null;
    match.official = primaryAssignment ? (this.userById.get(primaryAssignment.userId) ?? null) : null;
    match.officialCheckedIn = assignments.some((assignment) => assignment.checkedIn === true);
    this.recordAssignments(match, assignments);
  }

  private normalizeCommittedAssignments(match: Match): MatchOfficialAssignment[] {
    const requiredSlotKeys = new Set(
      this.requiredSlots.map((slot) => `${slot.positionId}:${slot.slotIndex}`),
    );
    const normalized: MatchOfficialAssignment[] = [];
    const seenSlotKeys = new Set<string>();
    const seenUsers = new Set<string>();
    for (const assignment of match.officialAssignments ?? []) {
      const positionId = typeof assignment?.positionId === 'string' ? assignment.positionId.trim() : '';
      const userId = typeof assignment?.userId === 'string' ? assignment.userId.trim() : '';
      const slotIndex = Number(assignment?.slotIndex);
      if (
        assignment?.holderType !== 'OFFICIAL'
        || !positionId
        || !userId
        || !Number.isInteger(slotIndex)
        || slotIndex < 0
        || !this.userById.has(userId)
      ) {
        continue;
      }
      const slotKey = `${positionId}:${slotIndex}`;
      if (!requiredSlotKeys.has(slotKey) || seenSlotKeys.has(slotKey) || seenUsers.has(userId)) {
        continue;
      }
      normalized.push({
        ...assignment,
        positionId,
        slotIndex,
        holderType: 'OFFICIAL',
        userId,
      });
      seenSlotKeys.add(slotKey);
      seenUsers.add(userId);
    }
    if (normalized.length > 0) {
      return normalized;
    }
    const fallbackUserId = match.official?.id?.trim() ?? '';
    const fallbackSlot = this.requiredSlots[0] ?? null;
    if (!fallbackSlot || !fallbackUserId || !this.userById.has(fallbackUserId)) {
      return [];
    }
    return [{
      positionId: fallbackSlot.positionId,
      slotIndex: fallbackSlot.slotIndex,
      holderType: 'OFFICIAL',
      userId: fallbackUserId,
      checkedIn: match.officialCheckedIn === true,
    }];
  }

  private recordAssignments(match: Match, assignments: MatchOfficialAssignment[]): void {
    for (const assignment of assignments) {
      const user = this.userById.get(assignment.userId);
      if (!user) {
        continue;
      }
      if (!user.matches.includes(match)) {
        user.matches.push(match);
      }
      const commitments = this.commitmentsByUserId.get(user.id) ?? [];
      commitments.push({
        matchId: match.id,
        start: match.start,
        end: match.end,
      });
      this.commitmentsByUserId.set(user.id, commitments);
      this.assignmentCountByUserId.set(user.id, (this.assignmentCountByUserId.get(user.id) ?? 0) + 1);
      const positionKey = `${user.id}:${assignment.positionId}`;
      this.assignmentCountByUserPosition.set(
        positionKey,
        (this.assignmentCountByUserPosition.get(positionKey) ?? 0) + 1,
      );
      this.lastAssignmentEndByUserId.set(user.id, match.end.getTime());
    }
  }
}
