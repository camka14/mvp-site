import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import type { EventFormValues } from '../../formTypes';
import { EventFormSections } from '../EventFormSections';

type BasicInformationProps = {
    onImageChange: (fileId: string, url: string) => void;
};

type EventDetailsProps = {
    localFieldCreationControl?: ReactNode;
    registrationQuestionsEditor?: ReactNode;
    showOrganizationFields: boolean;
};

const mockBasicInformationSection = jest.fn((_props: BasicInformationProps) => null);
const mockEventDetailsPanel = jest.fn((_props: EventDetailsProps) => null);

jest.mock('../../components/EventFormShell', () => ({
    EventFormShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('../BasicInformationSection', () => ({
    BasicInformationSection: (props: BasicInformationProps) => {
        mockBasicInformationSection(props);
        return <button type="button" onClick={() => props.onImageChange('file_1', '/file_1')}>Change image</button>;
    },
}));

jest.mock('../EventDetailsPanel', () => ({
    EventDetailsPanel: (props: EventDetailsProps) => {
        mockEventDetailsPanel(props);
        return null;
    },
}));

jest.mock('../EventFormDivisionSection', () => ({ EventFormDivisionSection: () => null }));
jest.mock('../EventFormStaffSection', () => ({ EventFormStaffSection: () => null }));
jest.mock('../LeagueScoringConfigSection', () => ({ LeagueScoringConfigSection: () => null }));
jest.mock('../ManualPaymentSettingsSection', () => ({ ManualPaymentSettingsSection: () => null }));
jest.mock('../MatchRulesConfigSection', () => ({ MatchRulesConfigSection: () => null }));
jest.mock('../RegistrationQuestionsSection', () => ({ RegistrationQuestionsSection: () => null }));
jest.mock('../ScheduleConfigBody', () => ({ ScheduleConfigBody: () => null }));
jest.mock('../ScheduleConfigSection', () => ({ ScheduleConfigSection: () => null }));

type EventFormSectionsProps = ComponentProps<typeof EventFormSections>;

const buildProps = (overrides: Partial<EventFormSectionsProps> = {}): EventFormSectionsProps => {
    const setValue = jest.fn();
    return {
        catalog: {
            eventTagOptions: [],
            sportOptions: [],
            sportsById: new Map(),
            sportsLoading: false,
        },
        configurationActions: {} as EventFormSectionsProps['configurationActions'],
        control: {} as EventFormSectionsProps['control'],
        divisionController: {} as EventFormSectionsProps['divisionController'],
        divisionOptions: [],
        divisionTypeOptions: [],
        errors: {},
        eventData: {
            eventType: 'EVENT',
            leagueData: { includePlayoffs: false },
            tournamentData: {},
            playoffData: {},
            leagueSlots: [],
            coordinates: [0, 0],
            divisionDetails: [],
            singleDivision: false,
        } as EventFormValues,
        fieldWriters: {
            setLeagueData: jest.fn(),
            setPlayoffData: jest.fn(),
            setTournamentData: jest.fn(),
        } as unknown as EventFormSectionsProps['fieldWriters'],
        handleSaveDivisionDetail: jest.fn(),
        hasUnsetTeamCapacityLimits: false,
        isAffiliateEvent: false,
        isImmutableField: jest.fn(() => false),
        paymentController: {
            manualPaymentLinks: [],
            manualPaymentsEnabled: false,
        } as unknown as EventFormSectionsProps['paymentController'],
        presentation: {
            allowImageEdit: true,
            eventTypeOptions: [],
            lockedEventTypeTagSlugs: [],
            selectedImageUrl: '',
            supportsNoFixedEndDateTime: false,
        },
        registrationQuestions: {
            drafts: [],
            loading: false,
        },
        resourceController: {
            eventLocalFields: [],
            fieldCount: 1,
            hasExternalRentalField: false,
            hasImmutableTimeSlots: false,
            immutableTimeSlots: [],
            isOrganizationHostedEvent: false,
            isOrganizationManagedEvent: false,
            leagueFieldOptions: [],
            organizationResourcePool: [],
            resourceSelectorLoading: false,
            selectedFields: [],
            setFieldCount: jest.fn(),
            showLocalFieldCreationControls: false,
            showOrganizationFieldsInEventDetails: true,
            usesRentalSlots: false,
        } as unknown as EventFormSectionsProps['resourceController'],
        sectionsController: {
            activeSectionId: 'section-basic-information',
            collapsedSections: {},
            fieldNamesCollapsed: false,
            questionActions: {
                addQuestion: jest.fn(),
                changePrompt: jest.fn(),
                changeRequired: jest.fn(),
                removeQuestion: jest.fn(),
            },
            scoringConfigSectionLabel: 'League Scoring Config',
            showManualPaymentsSection: false,
            showMatchRulesSection: false,
            showScheduleConfig: false,
            showScoringConfigSection: false,
            showStaffSection: true,
            showsFixedTeamEventToggle: false,
            supportsEditableTeamSignup: true,
            visibleSectionNavItems: [],
        } as unknown as EventFormSectionsProps['sectionsController'],
        setValue,
        slotController: {} as EventFormSectionsProps['slotController'],
        slotDivisionKeys: [],
        staffController: {} as EventFormSectionsProps['staffController'],
        templates: {
            loading: false,
            options: [],
        },
        ...overrides,
    };
};

describe('EventFormSections', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('routes image changes through the provided form writer', () => {
        const props = buildProps();
        render(<EventFormSections {...props} />);

        fireEvent.click(screen.getByRole('button', { name: 'Change image' }));

        expect(props.setValue).toHaveBeenCalledWith('imageId', 'file_1', {
            shouldDirty: true,
            shouldValidate: true,
        });
        expect(mockEventDetailsPanel.mock.calls[0]?.[0].registrationQuestionsEditor).not.toBeNull();
        expect(mockEventDetailsPanel.mock.calls[0]?.[0].showOrganizationFields).toBe(true);
    });

    it('removes internal registration and organization controls for affiliate listings', () => {
        render(<EventFormSections {...buildProps({ isAffiliateEvent: true })} />);

        expect(mockEventDetailsPanel.mock.calls[0]?.[0].registrationQuestionsEditor).toBeNull();
        expect(mockEventDetailsPanel.mock.calls[0]?.[0].localFieldCreationControl).toBeNull();
        expect(mockEventDetailsPanel.mock.calls[0]?.[0].showOrganizationFields).toBe(false);
    });
});
