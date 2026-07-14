import { screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import type { Organization } from '@/types';

import { PublicEventOverview } from '../PublicEventOverview';

const organization = {
    $id: 'org-1',
    name: 'River City Sports Club',
} as Organization;

const baseProps: React.ComponentProps<typeof PublicEventOverview> = {
    description: 'A welcoming local league.',
    organization,
    hostUser: null,
    hostedByHref: '/organizations/river-city',
    hostedByLabel: 'River City Sports Club',
    hostedByHandle: null,
    isAffiliateEvent: false,
    registrationStatusClassName: 'bg-emerald-50',
    registrationStatusLabel: 'Registration is open',
    isEvergreenProgram: false,
    sharesSingleDayWindow: true,
    scheduleDisplayText: 'Saturday evenings',
    startDate: new Date('2026-07-18T18:00:00-07:00'),
    endDate: new Date('2026-07-18T21:00:00-07:00'),
    displayTimeZone: 'America/Los_Angeles',
    locationSummary: 'River City Sports Club',
    address: '123 Main St',
    mapEmbedSrc: null,
};

describe('PublicEventOverview', () => {
    it('renders the organization host, status, description, and single-day schedule', () => {
        renderWithMantine(<PublicEventOverview {...baseProps} />);

        expect(screen.getByRole('link', { name: /River City Sports Club/ })).toHaveAttribute('href', '/organizations/river-city');
        expect(screen.getByText('Registration is open')).toBeInTheDocument();
        expect(screen.getByText('A welcoming local league.')).toBeInTheDocument();
        expect(screen.getByText('Starts')).toBeInTheDocument();
        expect(screen.getByText('Ends')).toBeInTheDocument();
        expect(screen.getByText('123 Main St')).toBeInTheDocument();
    });

    it('labels an affiliate organization action as an external website', () => {
        renderWithMantine(
            <PublicEventOverview
                {...baseProps}
                hostedByHref="https://example.test/event"
                isAffiliateEvent
            />,
        );

        const link = screen.getByRole('link', { name: /Open website/ });
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer');
    });

    it('renders the evergreen schedule without an end row', () => {
        renderWithMantine(
            <PublicEventOverview
                {...baseProps}
                isEvergreenProgram
                scheduleDisplayText="Registration open year-round"
            />,
        );

        expect(screen.getByText('Schedule')).toBeInTheDocument();
        expect(screen.getByText('Registration open year-round')).toBeInTheDocument();
        expect(screen.queryByText('Ends')).not.toBeInTheDocument();
    });

    it('renders the map and a fallback host when no organization profile is available', () => {
        renderWithMantine(
            <PublicEventOverview
                {...baseProps}
                organization={null}
                hostedByHref={null}
                hostedByLabel="Independent organizer"
                hostedByHandle="@organizer"
                description=""
                mapEmbedSrc="https://maps.example.test/embed"
            />,
        );

        expect(screen.getByText('Independent organizer')).toBeInTheDocument();
        expect(screen.getByText('@organizer')).toBeInTheDocument();
        expect(screen.getByText('No description provided yet.')).toBeInTheDocument();
        expect(screen.getByTitle('Event location preview')).toHaveAttribute('src', 'https://maps.example.test/embed');
    });
});
