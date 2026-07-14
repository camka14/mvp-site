import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import type { EventDivisionOption } from '../divisionRegistration';
import type { PublicDivisionGenderGroup } from '../eventDetailPresentation';

import { PublicEventProgramDetails } from '../PublicEventProgramDetails';

const division: EventDivisionOption = {
    id: 'division-open',
    key: 'division-open',
    name: 'Open',
    divisionTypeId: 'type-open',
    divisionTypeName: 'Open',
    divisionTypeKey: 'open',
    ratingType: 'SKILL',
    gender: 'C',
    ageCutoffLabel: '18 and older',
};

const divisionGroups: PublicDivisionGenderGroup[] = [{
    key: 'C',
    label: 'Coed',
    ageGroups: [{
        key: 'adult',
        label: 'Adult',
        skillGroups: [{ key: 'open', label: 'Open', options: [division] }],
    }],
}];

const baseProps: React.ComponentProps<typeof PublicEventProgramDetails> = {
    allDivisionOptionCount: 1,
    eligibleDivisionCount: 1,
    divisionGroups,
    registrationByDivisionType: false,
    selectedDivisionId: 'division-open',
    selectedDivisionTypeKey: 'open',
    onDivisionSelect: jest.fn(),
    supportsScheduleDetails: true,
    scheduleDateChips: [{ key: '2026-07-18', dayLabel: 'Sat', dateLabel: 'Jul 18' }],
    schedulePreviewItems: [{ id: 'match-1', dateLabel: 'Jul 18', timeLabel: '6:00 PM', title: 'Cascade Crew vs Harbor Strikers', meta: 'Court 1' }],
    eventType: 'TOURNAMENT',
    canViewStaffSection: false,
    sportLabel: 'Volleyball',
    hostedByLabel: 'River City Sports Club',
    assistantHostNames: [],
    officialNames: [],
    officialPositionsSummary: 'No positions configured',
};

describe('PublicEventProgramDetails', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders and forwards the selected division choice', () => {
        const onDivisionSelect = jest.fn();
        renderWithMantine(<PublicEventProgramDetails {...baseProps} onDivisionSelect={onDivisionSelect} />);

        const button = screen.getByRole('button', { name: /Open/ });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('18 and older')).toBeInTheDocument();
        fireEvent.click(button);
        expect(onDivisionSelect).toHaveBeenCalledWith(division);
    });

    it('shows an age-filtered empty choice state', () => {
        renderWithMantine(
            <PublicEventProgramDetails
                {...baseProps}
                eligibleDivisionCount={0}
                divisionGroups={[]}
            />,
        );

        expect(screen.getByText(/No divisions are available/)).toBeInTheDocument();
    });

    it('renders schedule chips and preview rows or the empty preview', () => {
        const { unmount } = renderWithMantine(<PublicEventProgramDetails {...baseProps} />);
        expect(screen.getByText('Sat')).toBeInTheDocument();
        expect(screen.getByText('Cascade Crew vs Harbor Strikers')).toBeInTheDocument();
        expect(screen.getByText('Court 1')).toBeInTheDocument();
        unmount();

        renderWithMantine(
            <PublicEventProgramDetails
                {...baseProps}
                scheduleDateChips={[]}
                schedulePreviewItems={[]}
            />,
        );
        expect(screen.getByText('No schedule preview is available yet.')).toBeInTheDocument();
    });

    it('renders league scoring and staff summaries', () => {
        renderWithMantine(
            <PublicEventProgramDetails
                {...baseProps}
                eventType="LEAGUE"
                canViewStaffSection
                assistantHostNames={['Jordan Lee']}
                officialNames={['Taylor Kim']}
                officialSchedulingMode="MANUAL"
            />,
        );

        expect(screen.getByRole('heading', { name: 'League Scoring Rules' })).toBeInTheDocument();
        expect(screen.getByText('Volleyball')).toBeInTheDocument();
        expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
        expect(screen.getByText('Taylor Kim')).toBeInTheDocument();
    });
});
