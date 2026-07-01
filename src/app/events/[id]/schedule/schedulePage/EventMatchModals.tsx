import type { ComponentProps } from 'react';

import type { Event, Match, Team, UserData } from '@/types';

import MatchEditModal from '../components/MatchEditModal';
import ScoreUpdateModal from '../components/ScoreUpdateModal';
import { isClientMatchId, type MatchCreateContext } from './helpers';

type ScoreUpdateModalProps = ComponentProps<typeof ScoreUpdateModal>;
type MatchEditModalProps = ComponentProps<typeof MatchEditModal>;

type EventMatchModalsProps = {
  activeEvent: Event | null;
  activeMatches: Match[];
  participantTeams: Team[];
  scoreUpdateMatch: Match | null;
  isScoreModalOpen: boolean;
  canManageScore: (match: Match) => boolean;
  canEditRoster?: (match: Match) => boolean;
  onOpenRoster?: (match: Match) => void;
  onScoreChange: NonNullable<ScoreUpdateModalProps['onScoreChange']>;
  onSetComplete: NonNullable<ScoreUpdateModalProps['onSetComplete']>;
  onScoreSubmit: NonNullable<ScoreUpdateModalProps['onSubmit']>;
  onScoreModalClose: () => void;
  isMatchEditorOpen: boolean;
  matchBeingEdited: Match | null;
  matchEditorTeams: Team[];
  matchEditorOfficials: UserData[];
  canEditMatches: boolean;
  matchEditorContext: MatchCreateContext;
  scheduleBracketPlaceholderAssignments: Record<string, string>;
  onMatchEditClose: () => void;
  onMatchEditSave: NonNullable<MatchEditModalProps['onSave']>;
  onMatchDelete: NonNullable<MatchEditModalProps['onDelete']>;
};

export default function EventMatchModals({
  activeEvent,
  activeMatches,
  participantTeams,
  scoreUpdateMatch,
  isScoreModalOpen,
  canManageScore,
  canEditRoster,
  onOpenRoster,
  onScoreChange,
  onSetComplete,
  onScoreSubmit,
  onScoreModalClose,
  isMatchEditorOpen,
  matchBeingEdited,
  matchEditorTeams,
  matchEditorOfficials,
  canEditMatches,
  matchEditorContext,
  scheduleBracketPlaceholderAssignments,
  onMatchEditClose,
  onMatchEditSave,
  onMatchDelete,
}: EventMatchModalsProps) {
  const scoreMatchId = scoreUpdateMatch?.$id;
  const editingMatchId = matchBeingEdited?.$id;

  return (
    <>
      {scoreUpdateMatch && activeEvent && (
        <ScoreUpdateModal
          match={scoreUpdateMatch}
          tournament={activeEvent}
          participantTeams={participantTeams}
          canManage={canManageScore(scoreUpdateMatch)}
          onScoreChange={onScoreChange}
          onSetComplete={onSetComplete}
          onSubmit={onScoreSubmit}
          onClose={onScoreModalClose}
          isOpen={isScoreModalOpen}
          team1Placeholder={scoreMatchId ? scheduleBracketPlaceholderAssignments[`${scoreMatchId}:team1`] : undefined}
          team2Placeholder={scoreMatchId ? scheduleBracketPlaceholderAssignments[`${scoreMatchId}:team2`] : undefined}
          canEditRoster={canEditRoster?.(scoreUpdateMatch) ?? false}
          onOpenRoster={onOpenRoster ? () => onOpenRoster(scoreUpdateMatch) : undefined}
        />
      )}
      <MatchEditModal
        opened={isMatchEditorOpen}
        match={matchBeingEdited}
        tournament={activeEvent}
        allMatches={activeMatches}
        fields={Array.isArray(activeEvent?.fields) ? activeEvent.fields : []}
        teams={matchEditorTeams}
        participantTeams={participantTeams}
        officials={matchEditorOfficials}
        officialPositions={Array.isArray(activeEvent?.officialPositions) ? activeEvent.officialPositions : []}
        eventOfficials={Array.isArray(activeEvent?.eventOfficials) ? activeEvent.eventOfficials : []}
        doTeamsOfficiate={Boolean(activeEvent?.doTeamsOfficiate)}
        canManageOperations={canEditMatches}
        isCreateMode={Boolean(matchBeingEdited && isClientMatchId(matchBeingEdited.$id))}
        creationContext={matchEditorContext}
        eventType={activeEvent?.eventType}
        enforceScheduleFields={matchEditorContext === 'schedule'}
        onScoreChange={onScoreChange}
        onSetComplete={onSetComplete}
        onScoreSubmit={onScoreSubmit}
        team1Placeholder={editingMatchId ? scheduleBracketPlaceholderAssignments[`${editingMatchId}:team1`] : undefined}
        team2Placeholder={editingMatchId ? scheduleBracketPlaceholderAssignments[`${editingMatchId}:team2`] : undefined}
        onClose={onMatchEditClose}
        onSave={onMatchEditSave}
        onDelete={onMatchDelete}
      />
    </>
  );
}
