import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';

import type { EventFormValues } from '../../formTypes';
import { StaffManagementPanel } from '../StaffManagementPanel';

jest.mock('../TeamOfficiatingControls', () => ({
    TeamOfficiatingControls: () => <div data-testid="team-officiating" />,
}));
jest.mock('../TeamCheckInControls', () => ({
    TeamCheckInControls: () => <div data-testid="team-operations" />,
}));
jest.mock('../StaffOfficialPositionEditor', () => ({
    StaffOfficialPositionEditor: ({ showSchedulingMode, showPositions }: {
        showSchedulingMode: boolean;
        showPositions: boolean;
    }) => (
        <div
            data-testid="official-editor"
            data-show-scheduling={String(showSchedulingMode)}
            data-show-positions={String(showPositions)}
        />
    ),
}));
jest.mock('../StaffNonOrganizationInvitePanel', () => ({
    StaffNonOrganizationInvitePanel: ({ showOfficialAssignments, showHostAssignments }: {
        showOfficialAssignments: boolean;
        showHostAssignments: boolean;
    }) => (
        <div
            data-testid="staff-picker"
            data-show-officials={String(showOfficialAssignments)}
            data-show-hosts={String(showHostAssignments)}
        />
    ),
}));
jest.mock('../StaffOrganizationRosterPicker', () => ({
    StaffOrganizationRosterPicker: () => <div data-testid="organization-staff-picker" />,
}));
jest.mock('../StaffAssignedCardsGrid', () => ({
    StaffAssignedCardsGrid: ({ showOfficials, showHosts }: {
        showOfficials: boolean;
        showHosts: boolean;
    }) => (
        <div
            data-testid="assigned-staff"
            data-show-officials={String(showOfficials)}
            data-show-hosts={String(showHosts)}
        />
    ),
}));

const buildProps = (overrides: Partial<ComponentProps<typeof StaffManagementPanel>> = {}) => ({
    control: {} as ComponentProps<typeof StaffManagementPanel>['control'],
    eventData: {
        teamSignup: true,
        doTeamsOfficiate: false,
        allowMatchRosterEdits: false,
        officialSchedulingMode: 'SCHEDULE',
        officialPositions: [],
    } as EventFormValues,
    isOrganizationHostedEvent: false,
    sportDefaultPositionCount: 0,
    maxMediumTextLength: 160,
    maxShortTextLength: 80,
    organizationStaffSearch: '',
    organizationStaffTypeFilter: 'all' as const,
    organizationStaffStatusFilter: 'all' as const,
    filteredOrganizationStaffEntries: [],
    organizationStaffVisibleCount: 0,
    nonOrgStaffSearch: '',
    nonOrgStaffResults: [],
    nonOrgStaffSearchLoading: false,
    newStaffInvite: { firstName: '', lastName: '', email: '', roles: [] },
    assignedOfficialUserIds: new Set<string>(),
    assistantHostIds: [],
    assignedOfficialCards: [],
    assignedHostCards: [],
    officialCardVisibleCount: 0,
    hostCardVisibleCount: 0,
    eventOfficialByUserId: new Map(),
    availableOfficialFieldOptions: [],
    eventOfficialsDisabled: false,
    assistantHostsDisabled: false,
    hostDisabled: false,
    onRosterEditsChange: jest.fn(),
    onTeamsOfficiateChange: jest.fn(),
    onSchedulingModeChange: jest.fn(),
    onLoadSportDefaults: jest.fn(),
    onAddPosition: jest.fn(),
    onUpdatePosition: jest.fn(),
    onRemovePosition: jest.fn(),
    onOrganizationStaffSearchChange: jest.fn(),
    onOrganizationStaffTypeFilterChange: jest.fn(),
    onOrganizationStaffStatusFilterChange: jest.fn(),
    onOrganizationStaffScroll: jest.fn(),
    onAddOfficial: jest.fn(),
    onAddAssistantHost: jest.fn(),
    onSetHost: jest.fn(),
    onNonOrgStaffSearchChange: jest.fn(),
    onInviteFieldChange: jest.fn(),
    onInviteRoleToggle: jest.fn(),
    onStageInvite: jest.fn(),
    onAssignedOfficialsScroll: jest.fn(),
    onAssignedHostsScroll: jest.fn(),
    onRemovePendingStaffInviteRole: jest.fn(),
    onRemoveOfficial: jest.fn(),
    onRemoveAssistantHost: jest.fn(),
    onUpdateEventOfficialEligibility: jest.fn(),
    ...overrides,
});

describe('StaffManagementPanel operation visibility', () => {
    it('shows only team controls for team check-in and roster operations', () => {
        render(<StaffManagementPanel {...buildProps({
            showStaffAssignments: false,
            showDedicatedOfficials: false,
            showCustomOfficialPositions: false,
            showTeamOperations: true,
        })} />);

        expect(screen.getByTestId('team-operations')).toBeInTheDocument();
        expect(screen.queryByTestId('team-officiating')).not.toBeInTheDocument();
        expect(screen.queryByTestId('official-editor')).not.toBeInTheDocument();
        expect(screen.queryByTestId('staff-picker')).not.toBeInTheDocument();
        expect(screen.queryByTestId('assigned-staff')).not.toBeInTheDocument();
    });

    it('shows official assignment and scheduling without custom position controls', () => {
        render(<StaffManagementPanel {...buildProps({
            showStaffAssignments: false,
            showDedicatedOfficials: true,
            showCustomOfficialPositions: false,
            showTeamOperations: false,
        })} />);

        expect(screen.getByTestId('team-officiating')).toBeInTheDocument();
        expect(screen.getByTestId('official-editor')).toHaveAttribute('data-show-scheduling', 'true');
        expect(screen.getByTestId('official-editor')).toHaveAttribute('data-show-positions', 'false');
        expect(screen.getByTestId('staff-picker')).toHaveAttribute('data-show-officials', 'true');
        expect(screen.getByTestId('staff-picker')).toHaveAttribute('data-show-hosts', 'false');
        expect(screen.getByTestId('assigned-staff')).toHaveAttribute('data-show-officials', 'true');
        expect(screen.getByTestId('assigned-staff')).toHaveAttribute('data-show-hosts', 'false');
    });

    it('shows only host assignment surfaces for staff assignments', () => {
        render(<StaffManagementPanel {...buildProps({
            showStaffAssignments: true,
            showDedicatedOfficials: false,
            showCustomOfficialPositions: false,
            showTeamOperations: false,
        })} />);

        expect(screen.queryByTestId('official-editor')).not.toBeInTheDocument();
        expect(screen.getByTestId('staff-picker')).toHaveAttribute('data-show-officials', 'false');
        expect(screen.getByTestId('staff-picker')).toHaveAttribute('data-show-hosts', 'true');
        expect(screen.getByTestId('assigned-staff')).toHaveAttribute('data-show-officials', 'false');
        expect(screen.getByTestId('assigned-staff')).toHaveAttribute('data-show-hosts', 'true');
    });
});
