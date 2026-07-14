import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventDetailHero } from '../EventDetailHero';

const baseProps: React.ComponentProps<typeof EventDetailHero> = {
    imageUrl: '/api/files/event-image/view',
    imageFallbackUrl: '/event-fallback.png',
    eventName: 'Summer Sand League',
    eventTypeLabel: 'League',
    sportLabel: 'Beach Volleyball',
    registrationTypeLabel: 'Team registration',
    showHostedByLabel: true,
    hostedByLabel: 'Hosted by River City Sports Club',
    scheduleLabel: 'Thursday evenings',
    locationLabel: 'River City Courts',
    spotsLabel: '4 spots left',
};

describe('EventDetailHero', () => {
    it('renders the complete event identity and summary', () => {
        renderWithMantine(<EventDetailHero {...baseProps} />);

        expect(screen.getByRole('heading', { name: 'Summer Sand League' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Summer Sand League' }).getAttribute('src'))
            .toContain('/api/files/event-image/view');
        expect(screen.getByText('League')).toBeInTheDocument();
        expect(screen.getByText('Beach Volleyball')).toBeInTheDocument();
        expect(screen.getByText('Team registration')).toBeInTheDocument();
        expect(screen.getByText('Hosted by River City Sports Club')).toBeInTheDocument();
        expect(screen.getByText('Thursday evenings')).toBeInTheDocument();
        expect(screen.getByText('River City Courts')).toBeInTheDocument();
        expect(screen.getByText('4 spots left')).toBeInTheDocument();
    });

    it('omits optional sport and host labels without hiding core metadata', () => {
        renderWithMantine(
            <EventDetailHero
                {...baseProps}
                sportLabel={null}
                showHostedByLabel={false}
            />,
        );

        expect(screen.queryByText('Beach Volleyball')).not.toBeInTheDocument();
        expect(screen.queryByText('Hosted by River City Sports Club')).not.toBeInTheDocument();
        expect(screen.getByText('Team registration')).toBeInTheDocument();
        expect(screen.getByText('Thursday evenings')).toBeInTheDocument();
    });

    it('switches the failed event image to the supplied fallback', () => {
        renderWithMantine(<EventDetailHero {...baseProps} />);
        const image = screen.getByRole('img', { name: 'Summer Sand League' });

        fireEvent.error(image);

        expect(image.getAttribute('src')).toContain('/event-fallback.png');
    });
});
