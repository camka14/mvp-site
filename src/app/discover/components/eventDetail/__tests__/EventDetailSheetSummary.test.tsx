import { screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import type { Event } from '@/types';
import { formatPrice } from '@/types';

import { EventDetailSheetSummary } from '../EventDetailSheetSummary';

const baseEvent = {
    $id: 'event-1',
    eventType: 'LEAGUE',
    description: 'A welcoming community league.',
    location: 'River City Sports Club',
    sportId: 'volleyball',
    teamSizeLimit: 6,
    includePlayoffs: false,
} as Event;

function renderSummary(event: Event = baseEvent, overrides: Partial<React.ComponentProps<typeof EventDetailSheetSummary>> = {}) {
    renderWithMantine(
        <EventDetailSheetSummary
            event={event}
            isTeamSignup={false}
            priceCents={0}
            eventMinAge={12}
            eventMaxAge={18}
            divisionLabels={['Open', 'Premier']}
            mapEmbedSrc=""
            participantCapacity={24}
            registrationCutoffSummary="24 hours before start"
            {...overrides}
        />,
    );
}

describe('EventDetailSheetSummary', () => {
    it('renders the core registration, age, division, description, and stats values', () => {
        renderSummary();

        expect(screen.getByText('Individual registration')).toBeInTheDocument();
        expect(screen.getByText('Free')).toBeInTheDocument();
        expect(screen.getByText('12-18')).toBeInTheDocument();
        expect(screen.getByText('Open')).toBeInTheDocument();
        expect(screen.getByText('Premier')).toBeInTheDocument();
        expect(screen.getByText('A welcoming community league.')).toBeInTheDocument();
        expect(screen.getByText('24 hours before start')).toBeInTheDocument();
    });

    it('renders tournament format and paid team registration details', () => {
        renderSummary({
            ...baseEvent,
            eventType: 'TOURNAMENT',
            doubleElimination: true,
            prize: 'Championship trophy',
            winnerSetCount: 2,
        } as Event, {
            isTeamSignup: true,
            priceCents: 2500,
        });

        expect(screen.getByText('Team registration')).toBeInTheDocument();
        expect(screen.getByText(formatPrice(2500))).toBeInTheDocument();
        expect(screen.getByText('Tournament Format')).toBeInTheDocument();
        expect(screen.getByText(/Championship trophy/)).toBeInTheDocument();
    });

    it('renders the map preview and stable coordinate label', () => {
        renderSummary(baseEvent, {
            mapEmbedSrc: 'https://maps.example.test/embed',
            mapLat: 45.5123,
            mapLng: -122.6587,
        });

        expect(screen.getByText('45.5123, -122.6587')).toBeInTheDocument();
        expect(screen.getByTitle('Event location preview')).toHaveAttribute('src', 'https://maps.example.test/embed');
    });

    it('renders configured league playoff rules', () => {
        renderSummary({
            ...baseEvent,
            includePlayoffs: true,
            playoffTeamCount: 8,
            doubleElimination: false,
            winnerSetCount: 3,
        } as Event);

        expect(screen.getByText('Playoff Format')).toBeInTheDocument();
        expect(screen.getByText(/Teams Included:/).parentElement).toHaveTextContent('8');
        expect(screen.getByText(/Single Elimination/)).toBeInTheDocument();
        expect(screen.getByText(/Sets to Win:/).parentElement).toHaveTextContent('3');
    });
});
