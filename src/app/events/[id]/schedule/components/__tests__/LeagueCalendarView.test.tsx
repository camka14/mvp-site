import { render, screen } from '@testing-library/react';

import type { Match } from '@/types';
import LeagueCalendarView from '../LeagueCalendarView';

const mockCalendarProps: any[] = [];

jest.mock('@mantine/core', () => {
  const React = require('react');
  const passthrough = (tag: string) => ({ children, className, style, 'data-testid': testId }: any) =>
    React.createElement(tag, { className, style, 'data-testid': testId }, children);

  return {
    Button: passthrough('button'),
    Paper: passthrough('div'),
    RangeSlider: () => React.createElement('div', { 'data-testid': 'range-slider' }),
    SegmentedControl: ({ data, value, onChange }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'segmented-control', 'data-value': value },
        (data ?? []).map((item: any) =>
          React.createElement(
            'button',
            { key: item.value, type: 'button', onClick: () => onChange?.(item.value) },
            item.label,
          ),
        ),
      ),
    Text: passthrough('div'),
  };
});

jest.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
jest.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));
jest.mock('react-big-calendar/lib/addons/dragAndDrop', () => (Calendar: any) => Calendar);
jest.mock('react-big-calendar', () => {
  const React = require('react');
  return {
    Calendar: (props: any) => {
      mockCalendarProps.push(props);
      return React.createElement(
        'div',
        { 'data-testid': 'mock-big-calendar' },
        (props.events ?? []).map((event: any) =>
          React.createElement(
            'span',
            { key: event.id, 'data-testid': `calendar-event-${event.id}` },
            `${event.start.getHours()}:${event.start.getMinutes()}-${event.end.getHours()}:${event.end.getMinutes()}`,
          ),
        ),
      );
    },
    dateFnsLocalizer: () => ({}),
  };
});

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  $id: 'match_1',
  matchId: 1,
  start: '2026-03-01T09:00:00.000Z',
  end: '2026-03-01T21:00:00.000Z',
  team1Points: [],
  team2Points: [],
  setResults: [],
  ...overrides,
});

const emptyTeams: any[] = [];
const emptyFields: any[] = [];
const emptyOfficials: any[] = [];
const emptyChildUserIds: string[] = [];
const emptyViewerTeamIds: string[] = [];
const emptyHighlightDivisionKeys: string[] = [];
const emptyConflictMatchIdsById = {};

describe('LeagueCalendarView time handling', () => {
  beforeEach(() => {
    mockCalendarProps.length = 0;
  });

  it('passes serialized match times to the calendar as event-timezone wall-clock dates', () => {
    render(
      <LeagueCalendarView
        matches={[
          buildMatch({
            start: '2026-03-01T09:00:00.000+05:00',
            end: '2026-03-01T21:00:00.000+05:00',
          }),
        ]}
        teams={emptyTeams}
        fields={emptyFields}
        officials={emptyOfficials}
        childUserIds={emptyChildUserIds}
        viewerTeamIds={emptyViewerTeamIds}
        highlightDivisionKeys={emptyHighlightDivisionKeys}
        conflictMatchIdsById={emptyConflictMatchIdsById}
        date={new Date(2026, 2, 1)}
        view="day"
        eventTimeZone="Asia/Karachi"
      />,
    );

    const lastProps = mockCalendarProps[mockCalendarProps.length - 1];
    const [event] = lastProps.events;

    expect(screen.getByTestId('mock-big-calendar')).toBeInTheDocument();
    expect(event.start.getHours()).toBe(9);
    expect(event.end.getHours()).toBe(21);
    expect(screen.getByTestId('calendar-event-match_1')).toHaveTextContent('9:0-21:0');
  });
});
