import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { BroadcastOverlayNotFoundError } from './access';
import { buildMatchPresentationState, createEmptyMatchPresentationState } from './presentation';
import { parseMatchPresentationState } from './schemas';
import type {
  BroadcastOverlayAction,
  BroadcastOverlayActionType,
  BroadcastOverlayCommand,
  MatchPresentationStateV1,
} from './types';

export class BroadcastOverlayRevisionConflictError extends Error {
  readonly state: MatchPresentationStateV1;

  constructor(state: MatchPresentationStateV1) {
    super('The broadcast state changed. Reload the latest state before retrying.');
    this.name = 'BroadcastOverlayRevisionConflictError';
    this.state = state;
  }
}

export class BroadcastOverlayCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BroadcastOverlayCommandError';
  }
}

const jsonRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const parseState = (value: unknown, fallback: MatchPresentationStateV1): MatchPresentationStateV1 => {
  try {
    return parseMatchPresentationState(value);
  } catch {
    return fallback;
  }
};

const actionRecord = (row: any): BroadcastOverlayAction => ({
  id: row.id,
  overlayId: row.overlayId,
  organizationId: row.organizationId ?? null,
  eventId: row.eventId,
  matchId: row.matchId ?? null,
  accessTokenId: row.accessTokenId ?? null,
  actorUserId: row.actorUserId ?? null,
  actorKind: row.actorKind === 'SYSTEM' || row.actorKind === 'TOKEN' ? row.actorKind : 'USER',
  actionType: row.actionType,
  baseRevision: row.baseRevision ?? null,
  presentationRevision: row.presentationRevision,
  requestId: row.requestId,
  payload: jsonRecord(row.payload),
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
});

const actionTypeForCommand = (command: BroadcastOverlayCommand): BroadcastOverlayActionType => {
  switch (command.type) {
    case 'SELECT_MATCH': return 'MATCH_SELECTED';
    case 'SET_VISIBILITY': return 'SCOREBOARD_VISIBILITY_CHANGED';
    case 'SET_SERVING_TEAM': return 'SERVE_CHANGED';
    case 'SET_TIMEOUT_STATE': return 'TIMEOUT_STATE_CHANGED';
    case 'SHOW_STINGER': return 'STINGER_SHOWN';
    case 'HIDE_STINGER': return 'STINGER_HIDDEN';
    case 'SET_REPLAY_STATE': return 'REPLAY_STATE_CHANGED';
    case 'ENTER_MANUAL_OVERRIDE': return 'MANUAL_OVERRIDE_ENTERED';
    case 'APPLY_MANUAL_PRESENTATION_CHANGE': return 'MANUAL_PRESENTATION_CHANGED';
    case 'RESUME_AUTOMATIC': return 'RESUMED_AUTOMATIC';
    case 'UNDO_BROADCAST_ACTION': return 'BROADCAST_ACTION_UNDONE';
  }
};

const eventAnimate = (type: BroadcastOverlayActionType): boolean => (
  type === 'STINGER_SHOWN' || type === 'STINGER_HIDDEN'
);

const undoSnapshot = (state: MatchPresentationStateV1) => ({
  score: state.score,
  clock: state.clock,
  presentation: state.presentation,
  scoringMode: state.scoringMode,
});

const applyUndoSnapshot = (state: MatchPresentationStateV1, snapshot: Record<string, any>): MatchPresentationStateV1 => ({
  ...state,
  score: snapshot.score && typeof snapshot.score === 'object' ? { ...state.score, ...snapshot.score } : state.score,
  clock: snapshot.clock && typeof snapshot.clock === 'object' ? { ...state.clock, ...snapshot.clock } : state.clock,
  presentation: snapshot.presentation && typeof snapshot.presentation === 'object'
    ? { ...state.presentation, ...snapshot.presentation }
    : state.presentation,
  scoringMode: snapshot.scoringMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : state.scoringMode,
});

const mergeManualChange = (
  state: MatchPresentationStateV1,
  change: Extract<BroadcastOverlayCommand, { type: 'APPLY_MANUAL_PRESENTATION_CHANGE' }>['change'],
): MatchPresentationStateV1 => ({
  ...state,
  score: change.score ? { ...state.score, ...change.score } : state.score,
  clock: change.clock ? { ...state.clock, ...change.clock } : state.clock,
  presentation: change.presentation ? { ...state.presentation, ...change.presentation } : state.presentation,
  scoringMode: 'MANUAL_OVERRIDE',
});

export const applyBroadcastOverlayCommand = async (input: {
  eventId: string;
  overlayId: string;
  actorUserId: string;
  command: BroadcastOverlayCommand;
}): Promise<{ state: MatchPresentationStateV1; action: BroadcastOverlayAction }> => {
  const result = await prisma.$transaction(async (tx) => {
    const overlay = await tx.broadcastOverlays.findFirst({
      where: { id: input.overlayId, eventId: input.eventId, archivedAt: null },
    });
    const stateRow = await tx.broadcastOverlayStates.findUnique({ where: { overlayId: input.overlayId } });
    if (!overlay || !stateRow) {
      throw new BroadcastOverlayNotFoundError();
    }
    const fallback = createEmptyMatchPresentationState({ eventId: input.eventId, revision: stateRow.revision });
    const current = parseState(stateRow.presentationState, fallback);
    const existingAction = await tx.broadcastOverlayActions.findUnique({
      where: { overlayId_requestId: { overlayId: input.overlayId, requestId: input.command.requestId } },
    });
    if (existingAction) {
      return { state: current, action: actionRecord(existingAction) };
    }
    if (stateRow.revision !== input.command.expectedRevision) {
      throw new BroadcastOverlayRevisionConflictError(current);
    }

    const actionType = actionTypeForCommand(input.command);
    const before = undoSnapshot(current);
    let next = current;
    let nextActiveMatchId = stateRow.activeMatchId;
    let nextScoringMode = stateRow.scoringMode;
    let manualOverrideBaseRevision = stateRow.manualOverrideBaseRevision;
    let manualOverrideStartedAt = stateRow.manualOverrideStartedAt;
    let manualOverrideStartedByUserId = stateRow.manualOverrideStartedByUserId;
    let manualOverrideReason = stateRow.manualOverrideReason;

    switch (input.command.type) {
      case 'SELECT_MATCH': {
        nextActiveMatchId = input.command.matchId;
        nextScoringMode = 'AUTOMATIC';
        manualOverrideBaseRevision = null;
        manualOverrideStartedAt = null;
        manualOverrideStartedByUserId = null;
        manualOverrideReason = null;
        next = await buildMatchPresentationState({
          overlay,
          state: { ...stateRow, revision: stateRow.revision, scoringMode: 'AUTOMATIC', presentationState: current },
          eventId: input.eventId,
          matchId: nextActiveMatchId,
          client: tx,
        });
        break;
      }
      case 'SET_VISIBILITY':
        next = { ...current, presentation: { ...current.presentation, scoreboardVisible: input.command.visible } };
        break;
      case 'SET_SERVING_TEAM': {
        const allowedTeams = new Set(current.teams.map((team) => team.id).filter(Boolean));
        if (input.command.eventTeamId && !allowedTeams.has(input.command.eventTeamId)) {
          throw new BroadcastOverlayCommandError('The serving team must be part of the selected match.');
        }
        next = { ...current, score: { ...current.score, servingTeamId: input.command.eventTeamId } };
        break;
      }
      case 'SET_TIMEOUT_STATE':
        next = { ...current, score: { ...current.score, timeoutsRemaining: input.command.timeoutsRemaining } };
        break;
      case 'SHOW_STINGER':
        next = { ...current, presentation: { ...current.presentation, activeStinger: input.command.stinger } };
        break;
      case 'HIDE_STINGER':
        next = { ...current, presentation: { ...current.presentation, activeStinger: null } };
        break;
      case 'SET_REPLAY_STATE':
        next = { ...current, presentation: { ...current.presentation, replayState: input.command.replayState } };
        break;
      case 'ENTER_MANUAL_OVERRIDE':
        if (stateRow.scoringMode === 'MANUAL_OVERRIDE') {
          throw new BroadcastOverlayCommandError('Manual presentation override is already active.');
        }
        nextScoringMode = 'MANUAL_OVERRIDE';
        manualOverrideBaseRevision = stateRow.revision;
        manualOverrideStartedAt = new Date();
        manualOverrideStartedByUserId = input.actorUserId;
        manualOverrideReason = input.command.reason;
        next = { ...current, scoringMode: 'MANUAL_OVERRIDE' };
        break;
      case 'APPLY_MANUAL_PRESENTATION_CHANGE':
        if (stateRow.scoringMode !== 'MANUAL_OVERRIDE') {
          throw new BroadcastOverlayCommandError('Enter manual presentation override before changing presentation values.');
        }
        next = mergeManualChange(current, input.command.change);
        break;
      case 'RESUME_AUTOMATIC': {
        if (stateRow.scoringMode !== 'MANUAL_OVERRIDE') {
          throw new BroadcastOverlayCommandError('Automatic scoring is already active.');
        }
        nextScoringMode = 'AUTOMATIC';
        manualOverrideBaseRevision = null;
        manualOverrideStartedAt = null;
        manualOverrideStartedByUserId = null;
        manualOverrideReason = null;
        next = parseState(stateRow.automaticShadowState, current);
        break;
      }
      case 'UNDO_BROADCAST_ACTION': {
        const target = await tx.broadcastOverlayActions.findFirst({
          where: { id: input.command.targetActionId, overlayId: overlay.id },
        });
        const snapshot = jsonRecord(target?.payload).before;
        if (!target || !snapshot || typeof snapshot !== 'object') {
          throw new BroadcastOverlayCommandError('That broadcast action cannot be undone.');
        }
        next = applyUndoSnapshot(current, snapshot as Record<string, any>);
        break;
      }
    }

    const nextRevision = stateRow.revision + 1;
    const state: MatchPresentationStateV1 = parseMatchPresentationState({
      ...next,
      revision: nextRevision,
      scoringMode: nextScoringMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTOMATIC',
    });
    const updated = await tx.broadcastOverlayStates.updateMany({
      where: { id: stateRow.id, revision: stateRow.revision },
      data: {
        activeMatchId: nextActiveMatchId,
        revision: nextRevision,
        scoringMode: nextScoringMode,
        presentationState: state as any,
        ...(nextScoringMode === 'AUTOMATIC' ? { automaticShadowState: state as any } : {}),
        manualOverrideBaseRevision,
        manualOverrideStartedAt,
        manualOverrideStartedByUserId,
        manualOverrideReason,
        updatedByUserId: input.actorUserId,
      },
    });
    if (updated.count !== 1) {
      const latest = await tx.broadcastOverlayStates.findUnique({ where: { id: stateRow.id } });
      throw new BroadcastOverlayRevisionConflictError(parseState(latest?.presentationState, current));
    }
    const action = await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        organizationId: overlay.organizationId,
        eventId: overlay.eventId,
        matchId: nextActiveMatchId,
        actorUserId: input.actorUserId,
        actorKind: 'USER',
        actionType,
        baseRevision: stateRow.revision,
        presentationRevision: nextRevision,
        requestId: input.command.requestId,
        payload: {
          command: input.command.type,
          before,
          after: undoSnapshot(state),
        },
      },
    });
    return { state, action: actionRecord(action) };
  });

  const { publishBroadcastOverlayState } = await import('@/server/realtime/broadcastOverlayRealtime');
  publishBroadcastOverlayState({
    overlayId: input.overlayId,
    state: result.state,
    event: { type: result.action.actionType, animate: eventAnimate(result.action.actionType) },
  });
  return result;
};
