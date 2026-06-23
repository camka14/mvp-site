import type {
    ComponentProps,
    UIEvent,
} from 'react';
import { Text } from '@mantine/core';
import type { Control } from 'react-hook-form';

import type {
    EventOfficial,
    EventOfficialPosition,
    StaffMemberType,
    UserData,
} from '@/types';

import type { EventFormValues } from '../formTypes';
import type {
    AssignedStaffCard,
    PendingStaffInvite,
    StaffAssignmentRole,
    StaffRosterEntry,
    StaffRosterStatus,
} from '../staffInvites';
import { StaffAssignedCardsGrid } from './StaffAssignedCardsGrid';
import { StaffNonOrganizationInvitePanel } from './StaffNonOrganizationInvitePanel';
import { StaffOfficialPositionEditor } from './StaffOfficialPositionEditor';
import { StaffOrganizationRosterPicker } from './StaffOrganizationRosterPicker';
import { TeamOfficiatingControls } from './TeamOfficiatingControls';

type StaffManagementPanelProps = {
    control: Control<EventFormValues>;
    eventData: EventFormValues;
    isOrganizationHostedEvent: boolean;
    officialStaffingCoverageError?: string | null;
    sportDefaultPositionCount: number;
    maxMediumTextLength: number;
    maxShortTextLength: number;
    comboboxProps?: ComponentProps<typeof StaffOfficialPositionEditor>['comboboxProps'];
    organizationStaffSearch: string;
    organizationStaffTypeFilter: 'all' | StaffMemberType;
    organizationStaffStatusFilter: 'all' | StaffRosterStatus;
    filteredOrganizationStaffEntries: StaffRosterEntry[];
    organizationStaffVisibleCount: number;
    nonOrgStaffSearch: string;
    nonOrgStaffResults: UserData[];
    nonOrgStaffSearchLoading: boolean;
    nonOrgStaffError?: string | null;
    newStaffInvite: PendingStaffInvite;
    assignedOfficialUserIds: Set<string>;
    assistantHostIds: string[];
    assignedOfficialCards: AssignedStaffCard[];
    assignedHostCards: AssignedStaffCard[];
    officialCardVisibleCount: number;
    hostCardVisibleCount: number;
    eventOfficialByUserId: Map<string, EventOfficial>;
    availableOfficialFieldOptions: ComponentProps<typeof StaffAssignedCardsGrid>['officialsListProps']['availableFieldOptions'];
    staffInviteError?: string | null;
    eventOfficialsDisabled: boolean;
    assistantHostsDisabled: boolean;
    hostDisabled: boolean;
    onTeamsOfficiateChange: (checked: boolean) => void;
    onSchedulingModeChange: (value: string | null) => void;
    onLoadSportDefaults: () => void;
    onAddPosition: () => void;
    onUpdatePosition: (positionId: string, updates: Partial<EventOfficialPosition>) => void;
    onRemovePosition: (positionId: string) => void;
    onOrganizationStaffSearchChange: (value: string) => void;
    onOrganizationStaffTypeFilterChange: (value: 'all' | StaffMemberType) => void;
    onOrganizationStaffStatusFilterChange: (value: 'all' | StaffRosterStatus) => void;
    onOrganizationStaffScroll: (event: UIEvent<HTMLDivElement>) => void;
    onAddOfficial: (user: UserData) => void;
    onAddAssistantHost: (user: UserData) => void;
    onSetHost: (userId: string | null) => void;
    onNonOrgStaffSearchChange: (value: string) => void;
    onInviteFieldChange: (field: 'firstName' | 'lastName' | 'email', value: string) => void;
    onInviteRoleToggle: (role: StaffAssignmentRole) => void;
    onStageInvite: () => void;
    onAssignedOfficialsScroll: (event: UIEvent<HTMLDivElement>) => void;
    onAssignedHostsScroll: (event: UIEvent<HTMLDivElement>) => void;
    onRemovePendingStaffInviteRole: (email: string, role: StaffAssignmentRole) => void;
    onRemoveOfficial: (userId: string) => void;
    onRemoveAssistantHost: (userId: string) => void;
    onUpdateEventOfficialEligibility: (
        userId: string,
        updates: Partial<Pick<EventOfficial, 'positionIds' | 'fieldIds'>>,
    ) => void;
};

export const StaffManagementPanel = ({
    control,
    eventData,
    isOrganizationHostedEvent,
    officialStaffingCoverageError,
    sportDefaultPositionCount,
    maxMediumTextLength,
    maxShortTextLength,
    comboboxProps,
    organizationStaffSearch,
    organizationStaffTypeFilter,
    organizationStaffStatusFilter,
    filteredOrganizationStaffEntries,
    organizationStaffVisibleCount,
    nonOrgStaffSearch,
    nonOrgStaffResults,
    nonOrgStaffSearchLoading,
    nonOrgStaffError,
    newStaffInvite,
    assignedOfficialUserIds,
    assistantHostIds,
    assignedOfficialCards,
    assignedHostCards,
    officialCardVisibleCount,
    hostCardVisibleCount,
    eventOfficialByUserId,
    availableOfficialFieldOptions,
    staffInviteError,
    eventOfficialsDisabled,
    assistantHostsDisabled,
    hostDisabled,
    onTeamsOfficiateChange,
    onSchedulingModeChange,
    onLoadSportDefaults,
    onAddPosition,
    onUpdatePosition,
    onRemovePosition,
    onOrganizationStaffSearchChange,
    onOrganizationStaffTypeFilterChange,
    onOrganizationStaffStatusFilterChange,
    onOrganizationStaffScroll,
    onAddOfficial,
    onAddAssistantHost,
    onSetHost,
    onNonOrgStaffSearchChange,
    onInviteFieldChange,
    onInviteRoleToggle,
    onStageInvite,
    onAssignedOfficialsScroll,
    onAssignedHostsScroll,
    onRemovePendingStaffInviteRole,
    onRemoveOfficial,
    onRemoveAssistantHost,
    onUpdateEventOfficialEligibility,
}: StaffManagementPanelProps) => (
    <>
        <TeamOfficiatingControls
            control={control}
            doTeamsOfficiate={Boolean(eventData.doTeamsOfficiate)}
            onTeamsOfficiateChange={onTeamsOfficiateChange}
        />
        <StaffOfficialPositionEditor
            officialSchedulingMode={eventData.officialSchedulingMode}
            officialPositions={eventData.officialPositions || []}
            sportDefaultPositionCount={sportDefaultPositionCount}
            coverageError={officialStaffingCoverageError}
            maxShortTextLength={maxShortTextLength}
            comboboxProps={comboboxProps}
            onSchedulingModeChange={onSchedulingModeChange}
            onLoadSportDefaults={onLoadSportDefaults}
            onAddPosition={onAddPosition}
            onUpdatePosition={onUpdatePosition}
            onRemovePosition={onRemovePosition}
        />

        {isOrganizationHostedEvent ? (
            <StaffOrganizationRosterPicker
                search={organizationStaffSearch}
                typeFilter={organizationStaffTypeFilter}
                statusFilter={organizationStaffStatusFilter}
                entries={filteredOrganizationStaffEntries}
                visibleCount={organizationStaffVisibleCount}
                assignedOfficialUserIds={assignedOfficialUserIds}
                assistantHostIds={assistantHostIds}
                hostId={eventData.hostId}
                maxMediumTextLength={maxMediumTextLength}
                eventOfficialsDisabled={eventOfficialsDisabled}
                assistantHostsDisabled={assistantHostsDisabled}
                hostDisabled={hostDisabled}
                comboboxProps={comboboxProps}
                onSearchChange={onOrganizationStaffSearchChange}
                onTypeFilterChange={onOrganizationStaffTypeFilterChange}
                onStatusFilterChange={onOrganizationStaffStatusFilterChange}
                onScrollRoster={onOrganizationStaffScroll}
                onAddOfficial={onAddOfficial}
                onAddAssistantHost={onAddAssistantHost}
                onSetHost={onSetHost}
            />
        ) : (
            <StaffNonOrganizationInvitePanel
                search={nonOrgStaffSearch}
                searchResults={nonOrgStaffResults}
                searchLoading={nonOrgStaffSearchLoading}
                searchError={nonOrgStaffError}
                inviteDraft={newStaffInvite}
                assignedOfficialUserIds={assignedOfficialUserIds}
                assistantHostIds={assistantHostIds}
                hostId={eventData.hostId}
                maxMediumTextLength={maxMediumTextLength}
                maxShortTextLength={maxShortTextLength}
                eventOfficialsDisabled={eventOfficialsDisabled}
                assistantHostsDisabled={assistantHostsDisabled}
                onSearchChange={onNonOrgStaffSearchChange}
                onAddOfficial={onAddOfficial}
                onAddAssistantHost={onAddAssistantHost}
                onInviteFieldChange={onInviteFieldChange}
                onInviteRoleToggle={onInviteRoleToggle}
                onStageInvite={onStageInvite}
            />
        )}

        <StaffAssignedCardsGrid
            officialsListProps={{
                cards: assignedOfficialCards,
                visibleCount: officialCardVisibleCount,
                officialPositions: eventData.officialPositions || [],
                eventOfficialByUserId,
                availableFieldOptions: availableOfficialFieldOptions,
                assignedOfficialsDisabled: eventOfficialsDisabled,
                comboboxProps,
                onScroll: onAssignedOfficialsScroll,
                onRemoveCard: (card) => {
                    if (card.source === 'draft' && card.email) {
                        onRemovePendingStaffInviteRole(card.email, 'OFFICIAL');
                        return;
                    }
                    if (card.userId) {
                        onRemoveOfficial(card.userId);
                    }
                },
                onUpdateEligibility: onUpdateEventOfficialEligibility,
            }}
            hostsListProps={{
                cards: assignedHostCards,
                visibleCount: hostCardVisibleCount,
                assistantHostsDisabled,
                onScroll: onAssignedHostsScroll,
                onRemoveCard: (card) => {
                    if (card.source === 'draft' && card.email) {
                        onRemovePendingStaffInviteRole(card.email, 'ASSISTANT_HOST');
                        return;
                    }
                    if (card.userId) {
                        onRemoveAssistantHost(card.userId);
                    }
                },
            }}
        />
        {staffInviteError ? (
            <Text size="xs" c="red">
                {staffInviteError}
            </Text>
        ) : null}
    </>
);
