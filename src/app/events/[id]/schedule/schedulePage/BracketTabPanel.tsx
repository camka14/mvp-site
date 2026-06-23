import { Button, Group, Paper, Select, Stack, Tabs, Text, type SelectProps } from '@mantine/core';

import type { Match, TournamentBracket, UserData } from '@/types';
import TournamentBracketView from '../components/TournamentBracketView';
import type { DivisionOption } from './helpers';

type BracketTabPanelProps = {
  show: boolean;
  shouldShowBracketDivisionFilter: boolean;
  bracketDivisionOptions: DivisionOption[];
  selectedBracketDivision: string | null;
  renderViewerHighlightedDivisionOption: NonNullable<SelectProps['renderOption']>;
  getViewerHighlightedSelectStyles: (value: string | null | undefined) => SelectProps['styles'] | undefined;
  canEditMatches: boolean;
  bracketData: TournamentBracket | null;
  user: UserData | null | undefined;
  childUserIds: string[];
  viewerTeamIds: Iterable<string>;
  viewerDivisionHighlightKeys: Iterable<string>;
  isPreview: boolean;
  showEventOfficialNames: boolean;
  eventTimeZone?: string;
  showDateOnMatches: boolean;
  matchConflictsById: Record<string, string[]>;
  playoffMatchCount: number;
  onBracketDivisionChange: (value: string | null) => void;
  onAddBracketMatch: () => void;
  onMatchClick: (match: Match) => void | Promise<void>;
};

export default function BracketTabPanel({
  show,
  shouldShowBracketDivisionFilter,
  bracketDivisionOptions,
  selectedBracketDivision,
  renderViewerHighlightedDivisionOption,
  getViewerHighlightedSelectStyles,
  canEditMatches,
  bracketData,
  user,
  childUserIds,
  viewerTeamIds,
  viewerDivisionHighlightKeys,
  isPreview,
  showEventOfficialNames,
  eventTimeZone,
  showDateOnMatches,
  matchConflictsById,
  playoffMatchCount,
  onBracketDivisionChange,
  onAddBracketMatch,
  onMatchClick,
}: BracketTabPanelProps) {
  if (!show) {
    return null;
  }

  const fallbackDivision = bracketDivisionOptions[0]?.value ?? null;
  const selectedDivision = selectedBracketDivision ?? fallbackDivision;

  return (
    <Tabs.Panel value="bracket" pt="md" pb={0}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          {shouldShowBracketDivisionFilter ? (
            <Select
              label="Division"
              data={bracketDivisionOptions}
              value={selectedDivision}
              renderOption={renderViewerHighlightedDivisionOption}
              styles={getViewerHighlightedSelectStyles(selectedDivision)}
              onChange={(value) => onBracketDivisionChange(value ?? fallbackDivision)}
              allowDeselect={false}
              w={220}
            />
          ) : (
            <div />
          )}
          {canEditMatches && (
            <Button onClick={onAddBracketMatch}>Add Match</Button>
          )}
        </Group>

        {bracketData ? (
          <TournamentBracketView
            bracket={bracketData}
            currentUser={user ?? undefined}
            childUserIds={childUserIds}
            viewerTeamIds={viewerTeamIds}
            highlightDivisionKeys={viewerDivisionHighlightKeys}
            isPreview={isPreview}
            onMatchClick={onMatchClick}
            canEditMatches={canEditMatches}
            showEventOfficialNames={showEventOfficialNames}
            eventTimeZone={eventTimeZone}
            showDateOnMatches={showDateOnMatches}
            conflictMatchIdsById={matchConflictsById}
          />
        ) : (
          <Paper withBorder radius="md" p="xl" ta="center">
            <Text>
              {playoffMatchCount > 0
                ? 'No playoff bracket generated for the selected division.'
                : 'No playoff bracket generated yet.'}
            </Text>
          </Paper>
        )}
      </Stack>
    </Tabs.Panel>
  );
}
