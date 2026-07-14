import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { screen } from '@testing-library/react';

import {
    PublicEventMetaPill,
    PublicEventSection,
    ReadOnlyDetailsGrid,
} from '../PublicEventPrimitives';

describe('public event primitives', () => {
    it('filters empty read-only detail values', () => {
        renderWithMantine(
            <ReadOnlyDetailsGrid items={[
                { label: 'Date', value: 'July 18' },
                { label: 'Address', value: '   ' },
            ]} />,
        );

        expect(screen.getByText('Date')).toBeInTheDocument();
        expect(screen.getByText('July 18')).toBeInTheDocument();
        expect(screen.queryByText('Address')).not.toBeInTheDocument();
    });

    it('renders no grid when every detail is empty', () => {
        renderWithMantine(
            <ReadOnlyDetailsGrid items={[{ label: 'Address', value: '' }]} />,
        );

        expect(screen.queryByText('Address')).not.toBeInTheDocument();
    });

    it('renders section hierarchy and children', () => {
        renderWithMantine(
            <PublicEventSection eyebrow="Format" title="League rules">
                <p>Best of three</p>
            </PublicEventSection>,
        );

        expect(screen.getByText('Format')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'League rules' })).toBeInTheDocument();
        expect(screen.getByText('Best of three')).toBeInTheDocument();
    });

    it('hides empty metadata values and renders populated ones', () => {
        renderWithMantine(<PublicEventMetaPill label="Officials" value="" />);
        expect(screen.queryByText('Officials')).not.toBeInTheDocument();

        renderWithMantine(<PublicEventMetaPill label="Officials" value="Jordan Lee" />);
        expect(screen.getByText('Officials')).toBeInTheDocument();
        expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    });
});
