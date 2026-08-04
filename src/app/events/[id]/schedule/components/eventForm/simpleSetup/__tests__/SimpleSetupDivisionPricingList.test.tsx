import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import type { EventFormValues } from '../../formTypes';
import { SimpleSetupDivisionPricingList } from '../SimpleSetupDivisionPricingList';

jest.mock('@/components/ui/CentsInput', () => function MockCentsInput({
    disabled,
    label,
    onChange,
    value,
}: {
    disabled?: boolean;
    label: string;
    onChange: (value: number) => void;
    value: number;
}) {
    return (
        <label>
            {label}
            <input
                aria-label={label}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
        </label>
    );
});

jest.mock('@/components/ui/HostPriceInput', () => function MockHostPriceInput({
    disabled,
    onChange,
    totalLabel,
    value,
}: {
    disabled?: boolean;
    onChange: (value: number) => void;
    totalLabel: string;
    value: number;
}) {
    return (
        <label>
            {totalLabel}
            <input
                aria-label={totalLabel}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
        </label>
    );
});

jest.mock('@/components/ui/PriceWithFeesPreview', () => function MockPriceWithFeesPreview() {
    return <div>Fee preview</div>;
});

const eventData = {
    eventType: 'LEAGUE',
    parentEvent: null,
    start: '2026-08-10T18:00',
    teamSignup: true,
    allowTeamSplitDefault: false,
    divisionDetails: [
        {
            id: 'open',
            key: 'open',
            kind: 'LEAGUE',
            name: 'Open',
            divisionTypeId: 'skill_open_age_18plus',
            divisionTypeName: 'Open 18+',
            ratingType: 'SKILL',
            gender: 'C',
            skillDivisionTypeId: 'open',
            skillDivisionTypeName: 'Open',
            ageDivisionTypeId: '18plus',
            ageDivisionTypeName: '18+',
            price: 2_500,
            maxParticipants: 8,
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentAmounts: [],
            installmentDueDates: [],
            installmentDueRelativeDays: [],
        },
        {
            id: 'intermediate',
            key: 'intermediate',
            kind: 'LEAGUE',
            name: 'Intermediate',
            divisionTypeId: 'skill_intermediate_age_18plus',
            divisionTypeName: 'Intermediate 18+',
            ratingType: 'SKILL',
            gender: 'C',
            skillDivisionTypeId: 'intermediate',
            skillDivisionTypeName: 'Intermediate',
            ageDivisionTypeId: '18plus',
            ageDivisionTypeName: '18+',
            price: 3_500,
            maxParticipants: 8,
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentAmounts: [],
            installmentDueDates: [],
            installmentDueRelativeDays: [],
        },
    ],
} as EventFormValues;

const baseProps = {
    eventData,
    hasStripeAccount: true,
    eventTaxableForPreview: false,
    connectingStripe: false,
    disabled: false,
    maxPriceCents: 999_999,
    maxStandardNumber: 99,
    onConnectStripe: jest.fn(),
    setValue: jest.fn(),
};

describe('SimpleSetupDivisionPricingList', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders one plain registration price per division in manual mode', () => {
        renderWithMantine(
            <SimpleSetupDivisionPricingList
                {...baseProps}
                manualPaymentsEnabled
            />,
        );

        expect(screen.getByText('Open')).toBeInTheDocument();
        expect(screen.getByText('Intermediate')).toBeInTheDocument();
        expect(screen.getAllByLabelText('Registration price')).toHaveLength(2);
        expect(screen.queryByLabelText('Online price')).not.toBeInTheDocument();
        expect(screen.queryByText('Payment plan')).not.toBeInTheDocument();
        expect(screen.queryByText('Fee preview')).not.toBeInTheDocument();
    });

    it('writes a separate division price from the Simple pricing page', () => {
        const setValue = jest.fn();
        renderWithMantine(
            <SimpleSetupDivisionPricingList
                {...baseProps}
                manualPaymentsEnabled
                setValue={setValue}
            />,
        );

        fireEvent.change(screen.getAllByLabelText('Registration price')[0], {
            target: { value: '4200' },
        });

        expect(setValue).toHaveBeenCalledWith(
            'divisionDetails',
            [
                expect.objectContaining({ id: 'open', price: 4_200 }),
                expect.objectContaining({ id: 'intermediate', price: 3_500 }),
            ],
            { shouldDirty: true, shouldValidate: true },
        );
    });

    it('shows online price and payment plan controls only for Stripe checkout', () => {
        renderWithMantine(
            <SimpleSetupDivisionPricingList
                {...baseProps}
                manualPaymentsEnabled={false}
            />,
        );

        expect(screen.getAllByLabelText('Online price')).toHaveLength(2);
        expect(screen.getAllByText('Payment plan')).toHaveLength(2);
        expect(screen.queryByLabelText('Registration price')).not.toBeInTheDocument();
    });
});
