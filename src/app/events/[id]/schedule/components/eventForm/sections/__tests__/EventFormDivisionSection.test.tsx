import {
    fireEvent,
    render,
    screen,
} from '@testing-library/react';

import type { EventFormValues } from '../../formTypes';
import { EventFormDivisionSection } from '../EventFormDivisionSection';

jest.mock('../DivisionSettingsSection', () => ({
    DivisionSettingsSection: ({ children }: { children: React.ReactNode }) => (
        <section data-testid="division-section">{children}</section>
    ),
}));
jest.mock('../DivisionModeControls', () => ({
    DivisionModeControls: () => <div data-testid="division-mode" />,
}));
jest.mock('../SingleDivisionDefaultsPanel', () => ({
    SingleDivisionDefaultsPanel: ({ onAllowPaymentPlansChange }: {
        onAllowPaymentPlansChange: (value: boolean) => void;
    }) => (
        <button type="button" onClick={() => onAllowPaymentPlansChange(true)}>
            Enable payment plans
        </button>
    ),
}));
jest.mock('../DivisionEditorHeader', () => ({
    DivisionEditorHeader: () => <div data-testid="division-editor-header" />,
}));
jest.mock('../DivisionEditorLeaguePanel', () => ({
    DivisionEditorLeaguePanel: () => <div data-testid="division-editor-league" />,
}));
jest.mock('../DivisionEditorPlayoffDivisionControls', () => ({
    DivisionEditorPlayoffDivisionControls: () => <div data-testid="playoff-controls" />,
}));
jest.mock('../DivisionEditorActionsAndErrors', () => ({
    DivisionEditorActionsAndErrors: () => <div data-testid="division-actions" />,
}));
jest.mock('../DivisionSummaryList', () => ({
    DivisionSummaryList: ({ hideOperationalDetails = false }: {
        hideOperationalDetails?: boolean;
    }) => (
        <div
            data-testid="division-summary"
            data-affiliate-mode={hideOperationalDetails ? 'true' : 'false'}
        />
    ),
}));

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    singleDivision: true,
    teamSignup: false,
    splitLeaguePlayoffDivisions: false,
    divisionDetails: [],
    playoffDivisionDetails: [],
    price: 0,
    maxParticipants: 8,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentAmounts: [],
    sportId: '',
    sportConfig: null,
    leagueData: { includePlayoffs: false },
    playoffData: {},
    tournamentData: {},
    ...overrides,
} as EventFormValues);

const buildDivisionController = () => ({
    divisionEditor: {
        editingId: null,
        divisionKind: 'LEAGUE',
        name: '',
        maxParticipants: 8,
        playoffConfig: {},
        error: null,
    },
    divisionEditorReady: true,
    divisionMaxParticipantsWarning: null,
    handleDivisionEditorKindChange: jest.fn(),
    handleEditDivisionDetail: jest.fn(),
    handleEditPlayoffDivisionDetail: jest.fn(),
    handleRemoveDivisionDetail: jest.fn(),
    handleRemovePlayoffDivision: jest.fn(),
    removeDivisionInstallment: jest.fn(),
    resetDivisionEditor: jest.fn(),
    setDivisionEditor: jest.fn(),
    setDivisionEditorLeagueConfig: jest.fn(),
    setDivisionEditorPlayoffConfig: jest.fn(),
    setDivisionInstallmentAmount: jest.fn(),
    setDivisionInstallmentDueDate: jest.fn(),
    setDivisionInstallmentDueRelativeDay: jest.fn(),
    singleDivisionPoolPlayDefaults: {},
    splitDivisionEditorEnabled: false,
    syncDivisionInstallmentCount: jest.fn(),
    updateDivisionEditorSelection: jest.fn(),
    updateSingleDivisionTournamentPoolDefaults: jest.fn(),
});

const buildPaymentController = () => ({
    connectStripe: jest.fn(),
    connectingStripe: false,
    eventTaxableForPreview: false,
    eventTaxPolicyForPreview: { organizerResponsibilityMessage: '' },
    organizationDefaultEventTaxHandling: 'PLATFORM',
    organizerManualTaxSelected: false,
    organizerTaxCollectionAllowed: false,
    pricingControlsEnabled: true,
    removeInstallment: jest.fn(),
    setInstallmentAmount: jest.fn(),
    setInstallmentDueDate: jest.fn(),
    setInstallmentDueRelativeDay: jest.fn(),
    syncInstallmentCount: jest.fn(),
});

const renderSection = ({
    isAffiliateEvent = false,
    eventData = buildEventData(),
    paymentController = buildPaymentController(),
    setValue = jest.fn(),
}: {
    isAffiliateEvent?: boolean;
    eventData?: EventFormValues;
    paymentController?: ReturnType<typeof buildPaymentController>;
    setValue?: jest.Mock;
} = {}) => {
    render(
        <EventFormDivisionSection
            collapsed={false}
            comboboxProps={{}}
            control={{} as never}
            divisionController={buildDivisionController() as never}
            divisionTypeOptions={[]}
            errors={{}}
            eventData={eventData}
            hasExternalRentalField={false}
            isAffiliateEvent={isAffiliateEvent}
            isImmutableField={() => false}
            isOrganizationHostedEvent={false}
            maxMediumTextLength={160}
            maxPriceCents={999_999_900}
            maxStandardNumber={99_999}
            numberInputStyles={{}}
            onSaveDivision={jest.fn()}
            onToggle={jest.fn()}
            paymentController={paymentController as never}
            playoffData={eventData.playoffData}
            setLeagueData={jest.fn()}
            setPlayoffData={jest.fn()}
            setTournamentData={jest.fn()}
            setValue={setValue}
            showsFixedTeamEventToggle={false}
            splitLeaguePlayoffDivisionsLocked={false}
            supportsEditableTeamSignup
            tournamentData={eventData.tournamentData}
        />,
    );
    return { paymentController, setValue };
};

describe('EventFormDivisionSection', () => {
    it('renders standard division controls and forwards payment-plan activation', () => {
        const { paymentController, setValue } = renderSection();

        expect(screen.getByTestId('division-mode')).toBeInTheDocument();
        expect(screen.getByTestId('playoff-controls')).toBeInTheDocument();
        expect(screen.getByTestId('division-summary')).toHaveAttribute('data-affiliate-mode', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'Enable payment plans' }));
        expect(setValue).toHaveBeenCalledWith('allowPaymentPlans', true, {
            shouldDirty: true,
            shouldValidate: true,
        });
        expect(paymentController.syncInstallmentCount).toHaveBeenCalledWith(1);
    });

    it('uses the restricted affiliate summary and hides playoff-only controls', () => {
        renderSection({
            isAffiliateEvent: true,
            eventData: buildEventData({ singleDivision: false }),
        });

        expect(screen.queryByRole('button', { name: 'Enable payment plans' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('playoff-controls')).not.toBeInTheDocument();
        expect(screen.getByTestId('division-summary')).toHaveAttribute('data-affiliate-mode', 'true');
    });
});
