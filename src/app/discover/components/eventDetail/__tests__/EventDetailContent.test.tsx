import { createRef } from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventDetailContent } from '../EventDetailContent';

jest.mock('../EventDetailHero', () => ({
    EventDetailHero: ({ eventName }: { eventName: string }) => <div>Hero: {eventName}</div>,
}));
jest.mock('../PublicEventOverview', () => ({
    PublicEventOverview: ({ hostedByLabel }: { hostedByLabel: string }) => (
        <div>Overview: {hostedByLabel}</div>
    ),
}));
jest.mock('../PublicEventProgramDetails', () => ({
    PublicEventProgramDetails: ({ eventType }: { eventType: string }) => (
        <div>Program: {eventType}</div>
    ),
}));
jest.mock('../EventDetailSheetSummary', () => ({
    EventDetailSheetSummary: ({ registrationCutoffSummary }: { registrationCutoffSummary: string }) => (
        <div>Summary: {registrationCutoffSummary}</div>
    ),
}));
jest.mock('../EventParticipantsSection', () => ({
    EventParticipantsSection: ({ totalParticipants }: { totalParticipants: number }) => (
        <div>Participants: {totalParticipants}</div>
    ),
}));
jest.mock('../EventJoinCard', () => ({
    EventJoinCard: ({ registrationTypeLabel }: { registrationTypeLabel: string }) => (
        <div>Join: {registrationTypeLabel}</div>
    ),
}));

function buildProps(overrides: Partial<React.ComponentProps<typeof EventDetailContent>> = {}) {
    return {
        renderInline: false,
        onClose: jest.fn(),
        sheetPopoverZIndex: 1800,
        heroProps: { eventName: 'Summer League' } as never,
        overviewProps: { hostedByLabel: 'River City Sports Club' } as never,
        programDetailsProps: { eventType: 'LEAGUE' } as never,
        summaryProps: { registrationCutoffSummary: 'Closes July 20' } as never,
        showParticipantsSection: true,
        participantsProps: { totalParticipants: 12 } as never,
        joinCardProps: { registrationTypeLabel: 'Team registration' } as never,
        joinCardAnchorRef: createRef<HTMLDivElement>(),
        joinCardRef: createRef<HTMLDivElement>(),
        joinCardDocked: false,
        joinCardHeight: 0,
        joinCardLeft: 0,
        joinCardWidth: 0,
        ...overrides,
    };
}

describe('EventDetailContent', () => {
    it('renders the sheet summary, participants, join card, and close action', () => {
        const props = buildProps();
        renderWithMantine(<EventDetailContent {...props} />);

        expect(screen.getByText('Hero: Summer League')).toBeInTheDocument();
        expect(screen.getByText('Summary: Closes July 20')).toBeInTheDocument();
        expect(screen.getByText('Participants: 12')).toBeInTheDocument();
        expect(screen.getByText('Join: Team registration')).toBeInTheDocument();
        expect(screen.queryByText('Overview: River City Sports Club')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('renders inline public details without sheet-only controls or hidden participants', () => {
        renderWithMantine(
            <EventDetailContent
                {...buildProps({ renderInline: true, showParticipantsSection: false })}
            />,
        );

        expect(screen.getByText('Overview: River City Sports Club')).toBeInTheDocument();
        expect(screen.getByText('Program: LEAGUE')).toBeInTheDocument();
        expect(screen.queryByText('Summary: Closes July 20')).not.toBeInTheDocument();
        expect(screen.queryByText('Participants: 12')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        expect(screen.getByText('Join: Team registration')).toBeInTheDocument();
    });

    it('reserves docked-card height and applies measured horizontal geometry', () => {
        const props = buildProps({
            renderInline: true,
            joinCardDocked: true,
            joinCardHeight: 240,
            joinCardLeft: 96,
            joinCardWidth: 360,
        });
        const { container } = renderWithMantine(<EventDetailContent {...props} />);

        expect(props.joinCardAnchorRef.current).toHaveStyle({ height: '240px' });
        expect(props.joinCardRef.current).toHaveStyle({ left: '96px', width: '360px' });
        expect(container.querySelector('.lg\\:fixed')).toBeInTheDocument();
    });
});
