import type { Dispatch, SetStateAction } from 'react';
import { Button, Group, Paper, Select, Stack, Tabs, Text, type SelectProps } from '@mantine/core';
import type { View } from 'react-big-calendar';

import type { Event, Field, Match, Team, UserData } from '@/types';
import LeagueCalendarView from '../components/LeagueCalendarView';
import {
  normalizeIdToken,
  type DivisionOption,
  type MatchCreateContext,
  type WeeklyOccurrenceOption,
  type WeeklyOccurrenceSelection,
} from './helpers';

type ScheduleTabPanelProps = {
  show: boolean;
  isWeeklyParentEvent: boolean;
  activeEvent: Event | null;
  user: UserData | null | undefined;
  childUserIds: string[];
  viewerTeamIds: Iterable<string>;
  viewerDivisionHighlightKeys: Iterable<string>;
  selectedWeeklyOccurrenceOption: WeeklyOccurrenceOption | null;
  weeklyScheduleOccurrenceOptions: WeeklyOccurrenceOption[];
  weeklyOccurrenceMatches: Match[];
  weeklyScheduleCalendarDate: Date;
  weeklyScheduleCalendarView: View;
  onWeeklyScheduleCalendarDateChange: Dispatch<SetStateAction<Date>>;
  onWeeklyScheduleCalendarViewChange: Dispatch<SetStateAction<View>>;
  onWeeklyOccurrenceSelectionChange: (selection: WeeklyOccurrenceSelection | null) => void;
  shouldShowScheduleDivisionFilter: boolean;
  shouldShowSchedulePoolFilter: boolean;
  scheduleDivisionSelectData: DivisionOption[];
  schedulePoolSelectData: DivisionOption[];
  selectedScheduleDivision: string;
  selectedSchedulePool: string;
  onScheduleDivisionChange: (value: string) => void;
  onSchedulePoolChange: (value: string) => void;
  renderViewerHighlightedDivisionOption: NonNullable<SelectProps['renderOption']>;
  getViewerHighlightedSelectStyles: (value: string | null | undefined) => SelectProps['styles'] | undefined;
  canEditMatches: boolean;
  activeMatches: Match[];
  scheduleMatches: Match[];
  scheduleMatchesForDisplay: Match[];
  participantTeams: Team[];
  showEventOfficialNames: boolean;
  matchConflictsById: Record<string, string[]>;
  scheduleBracketPlaceholderAssignments: Record<string, string>;
  onAddScheduleMatch: () => void;
  onMatchEditRequest: (match: Match, context: MatchCreateContext) => void;
  onMatchClick: (match: Match) => void | Promise<void>;
  onMatchCalendarMove: (match: Match, range: { start: Date; end: Date; fieldId?: string | null }) => void;
  onToggleLockAllMatches: (locked: boolean, matchIds: string[]) => void | Promise<void>;
};

const EMPTY_CONFLICTS_BY_ID: Record<string, string[]> = {};

export default function ScheduleTabPanel({
  show,
  isWeeklyParentEvent,
  activeEvent,
  user,
  childUserIds,
  viewerTeamIds,
  viewerDivisionHighlightKeys,
  selectedWeeklyOccurrenceOption,
  weeklyScheduleOccurrenceOptions,
  weeklyOccurrenceMatches,
  weeklyScheduleCalendarDate,
  weeklyScheduleCalendarView,
  onWeeklyScheduleCalendarDateChange,
  onWeeklyScheduleCalendarViewChange,
  onWeeklyOccurrenceSelectionChange,
  shouldShowScheduleDivisionFilter,
  shouldShowSchedulePoolFilter,
  scheduleDivisionSelectData,
  schedulePoolSelectData,
  selectedScheduleDivision,
  selectedSchedulePool,
  onScheduleDivisionChange,
  onSchedulePoolChange,
  renderViewerHighlightedDivisionOption,
  getViewerHighlightedSelectStyles,
  canEditMatches,
  activeMatches,
  scheduleMatches,
  scheduleMatchesForDisplay,
  participantTeams,
  showEventOfficialNames,
  matchConflictsById,
  scheduleBracketPlaceholderAssignments,
  onAddScheduleMatch,
  onMatchEditRequest,
  onMatchClick,
  onMatchCalendarMove,
  onToggleLockAllMatches,
}: ScheduleTabPanelProps) {
  if (!show) {
    return null;
  }

  const fields = Array.isArray(activeEvent?.fields) ? activeEvent.fields as Field[] : [];
  const teams = participantTeams.length > 0
    ? participantTeams
    : (Array.isArray(activeEvent?.teams) ? activeEvent.teams as Team[] : []);
  const officials = Array.isArray(activeEvent?.officials) ? activeEvent.officials as UserData[] : [];

  return (
    <Tabs.Panel value="schedule" pt="md">
      {isWeeklyParentEvent ? (
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm" c="dimmed">
              Select a weekly session to scope participants, billing, and compliance.
            </Text>
            {selectedWeeklyOccurrenceOption && (
              <Button variant="subtle" color="red" onClick={() => onWeeklyOccurrenceSelectionChange(null)}>
                Clear Selection
              </Button>
            )}
          </Group>
          {weeklyScheduleOccurrenceOptions.length === 0 && (
            <Paper withBorder radius="md" p="xl" ta="center">
              <Text>No weekly sessions are available for this calendar range.</Text>
            </Paper>
          )}
          <LeagueCalendarView
            matches={weeklyOccurrenceMatches}
            teams={[]}
            fields={fields}
            officials={[]}
            eventStart={activeEvent?.start}
            eventEnd={activeEvent?.end ?? undefined}
            eventTimeZone={activeEvent?.timeZone}
            date={weeklyScheduleCalendarDate}
            view={weeklyScheduleCalendarView}
            onDateChange={onWeeklyScheduleCalendarDateChange}
            onViewChange={onWeeklyScheduleCalendarViewChange}
            onMatchClick={(match) => {
              const occurrence = (match as Match & {
                weeklyOccurrenceMeta?: {
                  slotId?: string;
                  occurrenceDate?: string;
                };
              }).weeklyOccurrenceMeta;
              const slotId = normalizeIdToken(occurrence?.slotId);
              const occurrenceDate = normalizeIdToken(occurrence?.occurrenceDate);
              if (!slotId || !occurrenceDate) {
                return;
              }
              onWeeklyOccurrenceSelectionChange({
                slotId,
                occurrenceDate,
              });
            }}
            canManage={false}
            showEventOfficialNames={false}
            currentUser={user}
            childUserIds={childUserIds}
            viewerTeamIds={viewerTeamIds}
            highlightDivisionKeys={viewerDivisionHighlightKeys}
            conflictMatchIdsById={EMPTY_CONFLICTS_BY_ID}
          />
        </Stack>
      ) : (
        <Stack gap="sm">
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <Group align="flex-end" wrap="wrap">
              {shouldShowScheduleDivisionFilter ? (
                <Select
                  label="Division"
                  data={scheduleDivisionSelectData}
                  value={selectedScheduleDivision}
                  renderOption={renderViewerHighlightedDivisionOption}
                  styles={getViewerHighlightedSelectStyles(selectedScheduleDivision)}
                  onChange={(value) => {
                    onScheduleDivisionChange(value ?? 'all');
                  }}
                  allowDeselect={false}
                  w={220}
                />
              ) : null}
              {shouldShowSchedulePoolFilter ? (
                <Select
                  label="Pool"
                  data={schedulePoolSelectData}
                  value={selectedSchedulePool}
                  renderOption={renderViewerHighlightedDivisionOption}
                  styles={getViewerHighlightedSelectStyles(selectedSchedulePool)}
                  onChange={(value) => onSchedulePoolChange(value ?? 'all')}
                  allowDeselect={false}
                  w={220}
                />
              ) : null}
            </Group>
            {canEditMatches && (
              <Button onClick={onAddScheduleMatch}>Add Match</Button>
            )}
          </Group>

          {activeMatches.length === 0 ? (
            <Paper withBorder radius="md" p="xl" ta="center">
              <Text>No matches generated yet.</Text>
            </Paper>
          ) : scheduleMatches.length === 0 ? (
            <Paper withBorder radius="md" p="xl" ta="center">
              <Text>No matches found for the selected division or pool.</Text>
            </Paper>
          ) : (
            <LeagueCalendarView
              matches={scheduleMatchesForDisplay}
              teams={teams}
              fields={fields}
              officials={officials}
              eventStart={activeEvent?.start}
              eventEnd={activeEvent?.end ?? undefined}
              eventTimeZone={activeEvent?.timeZone}
              onMatchClick={(match) => {
                if (canEditMatches) {
                  onMatchEditRequest(match, 'schedule');
                  return;
                }
                void onMatchClick(match);
              }}
              onMatchTimeChange={onMatchCalendarMove}
              canManage={canEditMatches}
              showEventOfficialNames={showEventOfficialNames}
              currentUser={user}
              childUserIds={childUserIds}
              viewerTeamIds={viewerTeamIds}
              highlightDivisionKeys={viewerDivisionHighlightKeys}
              onToggleLockAllMatches={onToggleLockAllMatches}
              conflictMatchIdsById={matchConflictsById}
              matchSlotPlaceholderLabels={scheduleBracketPlaceholderAssignments}
            />
          )}
        </Stack>
      )}
    </Tabs.Panel>
  );
}
