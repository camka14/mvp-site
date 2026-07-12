import { Alert, Button, Checkbox, Group, Loader, NumberInput, Paper, Select, Stack, Table, Tabs, Text, UnstyledButton, type SelectProps } from '@mantine/core';

import { formatStandingsDelta, formatStandingsPoints } from '@/lib/standingsDisplay';
import type { DivisionOption, RankedStandingsRow, StandingsSortField } from './helpers';

type StandingsSort = {
  field: StandingsSortField;
  direction: 'asc' | 'desc';
};

type StandingsPoints = {
  basePoints: number;
  finalPoints: number;
  pointsDelta: number;
};

type StandingsDivisionStatus = {
  standingsConfirmedAt?: string | null;
  standingsConfirmedBy?: string | null;
};

type StandingsTabPanelProps = {
  show: boolean;
  effectiveStandingsDivisionOptions: DivisionOption[];
  selectedStandingsDivision: string | null;
  renderViewerHighlightedDivisionOption: NonNullable<SelectProps['renderOption']>;
  getViewerHighlightedSelectStyles: (value: string | null | undefined) => SelectProps['styles'] | undefined;
  shouldShowStandingsPoolFilter: boolean;
  standingsPoolOptions: DivisionOption[];
  selectedStandingsDataDivision: string | null;
  standingsLoading: boolean;
  canManageStandings: boolean;
  applyStandingsReassignment: boolean;
  savingStandings: boolean;
  confirmingStandings: boolean;
  standingsDivisionData: StandingsDivisionStatus | null;
  standingsActionError: string | null;
  standingsValidationMessages: string[];
  standings: RankedStandingsRow[];
  hasRecordedMatches: boolean;
  standingsSort: StandingsSort;
  viewerTeamIds: Iterable<string>;
  getDraftStandingsPoints: (row: RankedStandingsRow) => StandingsPoints;
  getStandingsOverrideInputValue: (row: RankedStandingsRow) => string | number;
  onStandingsDivisionChange: (value: string | null) => void;
  onStandingsPoolChange: (value: string | null) => void;
  onApplyStandingsReassignmentChange: (checked: boolean) => void;
  onSaveStandingsAdjustments: () => void | Promise<void>;
  onConfirmStandings: () => void | Promise<void>;
  onStandingsSortChange: (field: StandingsSortField) => void;
  onStandingsOverrideChange: (teamId: string, value: string | number) => void;
};

function renderSortIndicator(standingsSort: StandingsSort, field: StandingsSortField) {
  if (standingsSort.field !== field) {
    return <span className="ml-1 text-xs text-gray-400">{'\u2195'}</span>;
  }

  return (
    <span className="ml-1 text-xs font-semibold text-gray-700">
      {standingsSort.direction === 'asc' ? '\u2191' : '\u2193'}
    </span>
  );
}

export default function StandingsTabPanel({
  show,
  effectiveStandingsDivisionOptions,
  selectedStandingsDivision,
  renderViewerHighlightedDivisionOption,
  getViewerHighlightedSelectStyles,
  shouldShowStandingsPoolFilter,
  standingsPoolOptions,
  selectedStandingsDataDivision,
  standingsLoading,
  canManageStandings,
  applyStandingsReassignment,
  savingStandings,
  confirmingStandings,
  standingsDivisionData,
  standingsActionError,
  standingsValidationMessages,
  standings,
  hasRecordedMatches,
  standingsSort,
  viewerTeamIds,
  getDraftStandingsPoints,
  getStandingsOverrideInputValue,
  onStandingsDivisionChange,
  onStandingsPoolChange,
  onApplyStandingsReassignmentChange,
  onSaveStandingsAdjustments,
  onConfirmStandings,
  onStandingsSortChange,
  onStandingsOverrideChange,
}: StandingsTabPanelProps) {
  if (!show) {
    return null;
  }

  const highlightedTeamIds = new Set(viewerTeamIds);

  return (
    <Tabs.Panel value="standings" pt="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Group align="flex-end" wrap="wrap">
            <Select
              label="Division"
              data={effectiveStandingsDivisionOptions}
              value={selectedStandingsDivision}
              renderOption={renderViewerHighlightedDivisionOption}
              styles={getViewerHighlightedSelectStyles(selectedStandingsDivision)}
              onChange={(value) => {
                onStandingsDivisionChange(value);
                onStandingsPoolChange(null);
              }}
              allowDeselect={false}
              disabled={!effectiveStandingsDivisionOptions.length || standingsLoading}
              w={260}
            />
            {shouldShowStandingsPoolFilter ? (
              <Select
                label="Pool"
                data={standingsPoolOptions}
                value={selectedStandingsDataDivision}
                renderOption={renderViewerHighlightedDivisionOption}
                styles={getViewerHighlightedSelectStyles(selectedStandingsDataDivision)}
                onChange={(value) => onStandingsPoolChange(value ?? standingsPoolOptions[0]?.value ?? null)}
                allowDeselect={false}
                disabled={standingsLoading}
                w={220}
              />
            ) : null}
          </Group>
          {canManageStandings && selectedStandingsDataDivision && (
            <Stack gap={6} align="flex-end">
              <Checkbox
                label="Apply automatic playoff reassignment"
                checked={applyStandingsReassignment}
                onChange={(event) => onApplyStandingsReassignmentChange(event.currentTarget.checked)}
              />
              <Group gap="xs">
                <Button
                  variant="light"
                  onClick={() => void onSaveStandingsAdjustments()}
                  loading={savingStandings}
                  disabled={standingsLoading || confirmingStandings}
                >
                  Save Standings Adjustments
                </Button>
                <Button
                  onClick={() => void onConfirmStandings()}
                  loading={confirmingStandings}
                  disabled={standingsLoading || savingStandings}
                >
                  Confirm Results
                </Button>
              </Group>
            </Stack>
          )}
        </Group>

        {standingsDivisionData?.standingsConfirmedAt && (
          <Text size="sm" c="dimmed">
            Confirmed {new Date(standingsDivisionData.standingsConfirmedAt).toLocaleString()}
            {standingsDivisionData.standingsConfirmedBy ? ` by ${standingsDivisionData.standingsConfirmedBy}` : ''}.
          </Text>
        )}

        {standingsActionError && (
          <Alert color="red" radius="md">
            {standingsActionError}
          </Alert>
        )}

        {standingsValidationMessages.length > 0 && (
          <Alert color="yellow" radius="md">
            <Stack gap={2}>
              {standingsValidationMessages.map((message, index) => (
                <Text key={`${message}-${index}`} size="sm">
                  {message}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        {standingsLoading ? (
          <Paper withBorder radius="md" p="xl">
            <Group justify="center" gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading standings...</Text>
            </Group>
          </Paper>
        ) : standings.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center">
            <Text>No teams available yet.</Text>
          </Paper>
        ) : (
          <Paper withBorder radius="md" p={0}>
            {!hasRecordedMatches && (
              <div className="px-4 pt-4">
                <Text size="sm" c="dimmed">
                  Standings will update automatically as match results are recorded.
                </Text>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th className="w-12 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      #
                    </Table.Th>
                    <Table.Th className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <UnstyledButton
                        className="flex items-center gap-1 text-sm font-semibold text-gray-700"
                        onClick={() => onStandingsSortChange('team')}
                      >
                        Team
                        {renderSortIndicator(standingsSort, 'team')}
                      </UnstyledButton>
                    </Table.Th>
                    <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <UnstyledButton
                        className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                        onClick={() => onStandingsSortChange('wins')}
                      >
                        W
                        {renderSortIndicator(standingsSort, 'wins')}
                      </UnstyledButton>
                    </Table.Th>
                    <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <UnstyledButton
                        className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                        onClick={() => onStandingsSortChange('losses')}
                      >
                        L
                        {renderSortIndicator(standingsSort, 'losses')}
                      </UnstyledButton>
                    </Table.Th>
                    <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <UnstyledButton
                        className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                        onClick={() => onStandingsSortChange('draws')}
                      >
                        D
                        {renderSortIndicator(standingsSort, 'draws')}
                      </UnstyledButton>
                    </Table.Th>
                    <Table.Th className="w-48 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <UnstyledButton
                        className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                        onClick={() => onStandingsSortChange('points')}
                      >
                        Final Pts
                        {renderSortIndicator(standingsSort, 'points')}
                      </UnstyledButton>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {standings.map((row) => {
                    const points = getDraftStandingsPoints(row);
                    const isViewerTeamRow = highlightedTeamIds.has(row.teamId);
                    const deltaColor = points.pointsDelta > 0
                      ? 'teal'
                      : points.pointsDelta < 0
                        ? 'red'
                        : 'dimmed';
                    return (
                      <Table.Tr
                        key={row.teamId}
                        style={isViewerTeamRow ? { backgroundColor: 'var(--mantine-color-green-0)' } : undefined}
                      >
                        <Table.Td className={`text-sm font-semibold ${isViewerTeamRow ? 'text-green-800' : 'text-gray-600'}`}>{row.rank}</Table.Td>
                        <Table.Td className={`text-sm font-medium ${isViewerTeamRow ? 'text-green-900' : 'text-gray-700'}`}>{row.teamName}</Table.Td>
                        <Table.Td className="text-right text-sm text-gray-700">{row.wins}</Table.Td>
                        <Table.Td className="text-right text-sm text-gray-700">{row.losses}</Table.Td>
                        <Table.Td className="text-right text-sm text-gray-700">{row.draws}</Table.Td>
                        <Table.Td className="text-right text-sm font-semibold text-gray-900">
                          {canManageStandings ? (
                            <Group justify="flex-end" gap="xs" wrap="nowrap">
                              <NumberInput
                                value={getStandingsOverrideInputValue(row)}
                                onChange={(value) => onStandingsOverrideChange(row.teamId, value as string | number)}
                                min={-9999}
                                max={9999}
                                step={1}
                                allowDecimal={false}
                                w={96}
                                size="xs"
                              />
                              <Text size="xs" c={deltaColor}>
                                {formatStandingsDelta(points.pointsDelta)}
                              </Text>
                            </Group>
                          ) : (
                            <Group justify="flex-end" gap="xs" wrap="nowrap">
                              <Text size="sm" fw={600}>{formatStandingsPoints(points.finalPoints)}</Text>
                              <Text size="xs" c={deltaColor}>
                                {formatStandingsDelta(points.pointsDelta)}
                              </Text>
                            </Group>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </div>
          </Paper>
        )}
      </Stack>
    </Tabs.Panel>
  );
}
