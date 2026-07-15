import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { organizationService } from '@/lib/organizationService';
import type { Division } from '@/types';

import type { DivisionDetailForm } from '../divisionForm';
import { TryoutDivisionSelector } from './TryoutDivisionSelector';

jest.mock('@/app/hooks/useSports', () => ({
    useSports: () => ({
        sports: [{ $id: 'soccer', name: 'Soccer' }],
    }),
}));

jest.mock('@/lib/organizationService', () => ({
    organizationService: {
        listOrganizationDivisions: jest.fn(),
        createOrganizationDivision: jest.fn(),
    },
}));

const divisionTypes = {
    genders: [
        { id: 'M', name: 'Men' },
        { id: 'F', name: 'Women' },
        { id: 'C', name: 'Coed' },
    ],
    ages: [{ id: 'u14', name: 'U14' }],
    sportSkills: [{ sportId: 'soccer', skills: [{ id: 'competitive', name: 'Competitive' }] }],
};

const organizationDivision: Division = {
    id: 'organization_division_1',
    name: 'Girls U14 Competitive',
    organizationId: 'organization_1',
    scope: 'ORGANIZATION',
    status: 'ACTIVE',
    sportId: 'soccer',
    gender: 'F',
    skillDivisionTypeId: 'competitive',
    ageDivisionTypeId: 'u14',
    price: 42500,
    maxParticipants: 24,
};

const eventDivision = {
    id: 'event_division_1',
    sourceDivisionId: organizationDivision.id,
    name: organizationDivision.name,
    price: 2500,
} as DivisionDetailForm;

const renderSelector = (props?: Partial<React.ComponentProps<typeof TryoutDivisionSelector>>) => {
    const onChange = jest.fn();
    const onTryoutPriceChange = jest.fn();
    render(
        <MantineProvider>
            <TryoutDivisionSelector
                organizationId="organization_1"
                preferredSportId="soccer"
                selectedDivisions={[]}
                maxPriceCents={100000}
                onChange={onChange}
                onTryoutPriceChange={onTryoutPriceChange}
                {...props}
            />
        </MantineProvider>,
    );
    return { onChange, onTryoutPriceChange };
};

describe('TryoutDivisionSelector', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => divisionTypes,
        }) as jest.MockedFunction<typeof fetch>;
    });

    it('shows organization-owned settings as read only and only edits the tryout price', async () => {
        jest.mocked(organizationService.listOrganizationDivisions).mockResolvedValue([organizationDivision]);
        const { onTryoutPriceChange } = renderSelector({ selectedDivisions: [eventDivision] });

        expect((await screen.findAllByText('Girls U14 Competitive')).length).toBeGreaterThan(0);
        expect(screen.getByText('Soccer')).toBeInTheDocument();
        expect(screen.getByText('Women')).toBeInTheDocument();
        expect(screen.getByText('U14')).toBeInTheDocument();
        expect(screen.getByText('Competitive')).toBeInTheDocument();
        expect(screen.getByText('$425.00')).toBeInTheDocument();
        expect(screen.getByText('24')).toBeInTheDocument();
        expect(screen.queryByLabelText('Division name')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Tryout price for Girls U14 Competitive'), { target: { value: '30' } });
        expect(onTryoutPriceChange).toHaveBeenLastCalledWith(organizationDivision.id, 3000);
    });

    it('creates the first organization division in a modal and selects it for the tryout', async () => {
        jest.mocked(organizationService.listOrganizationDivisions).mockResolvedValue([]);
        jest.mocked(organizationService.createOrganizationDivision).mockResolvedValue(organizationDivision);
        const { onChange } = renderSelector();

        const createButton = await screen.findByRole('button', { name: 'Create organization division' });
        fireEvent.click(createButton);

        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Division name'), {
            target: { value: 'Girls U14 Competitive' },
        });
        fireEvent.change(within(dialog).getByLabelText('Division season price'), {
            target: { value: '425' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Create division' }));

        await waitFor(() => expect(organizationService.createOrganizationDivision).toHaveBeenCalledWith(
            'organization_1',
            expect.objectContaining({
                name: 'Girls U14 Competitive',
                sportId: 'soccer',
                skillDivisionTypeId: 'competitive',
                ageDivisionTypeId: 'u14',
                price: 42500,
            }),
        ));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith([organizationDivision]));
    });
});
