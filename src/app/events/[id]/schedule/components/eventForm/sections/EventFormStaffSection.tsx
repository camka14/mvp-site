import type { ComponentProps } from 'react';

import type { Event } from '@/types';

import { normalizeOfficialSchedulingMode } from '../officials';
import type { EventFormValues } from '../formTypes';
import type { useStaffOfficialController } from '../hooks/useStaffOfficialController';
import { StaffManagementPanel } from './StaffManagementPanel';
import { StaffSection } from './StaffSection';

type SetFormValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormStaffSectionProps = {
    collapsed: boolean;
    comboboxProps: ComponentProps<typeof StaffManagementPanel>['comboboxProps'];
    control: ComponentProps<typeof StaffManagementPanel>['control'];
    eventData: EventFormValues;
    isImmutableField: (fieldName: keyof Event) => boolean;
    isOrganizationHostedEvent: boolean;
    maxMediumTextLength: number;
    maxShortTextLength: number;
    onToggle: () => void;
    setValue: SetFormValue;
    staffController: ReturnType<typeof useStaffOfficialController>;
    visible: boolean;
};

export const EventFormStaffSection = ({
    collapsed,
    comboboxProps,
    control,
    eventData,
    isImmutableField,
    isOrganizationHostedEvent,
    maxMediumTextLength,
    maxShortTextLength,
    onToggle,
    setValue,
    staffController,
    visible,
}: EventFormStaffSectionProps) => {
    if (!visible) {
        return null;
    }

    const {
        assignedHostCards,
        assignedOfficialCards,
        assignedUserIdSetByRole,
        assistantHostValue,
        availableOfficialFieldOptions,
        eventOfficialByUserId,
        filteredOrganizationStaffEntries,
        handleAddAssistantHost,
        handleAddOfficial,
        handleAddOfficialPosition,
        handleAssignedHostsScroll,
        handleAssignedOfficialsScroll,
        handleHostChange,
        handleInviteFieldChange,
        handleInviteRoleToggle,
        handleOrganizationStaffScroll,
        handleRemoveAssistantHost,
        handleRemoveOfficial,
        handleRemoveOfficialPosition,
        handleRemovePendingStaffInviteRole,
        handleResetOfficialPositionsFromSport,
        handleStagePendingStaffInvite,
        handleUpdateEventOfficialEligibility,
        handleUpdateOfficialPosition,
        hostCardVisibleCount,
        newStaffInvite,
        nonOrgStaffError,
        nonOrgStaffResults,
        nonOrgStaffSearch,
        nonOrgStaffSearchLoading,
        officialCardVisibleCount,
        officialStaffingCoverageError,
        organizationStaffSearch,
        organizationStaffStatusFilter,
        organizationStaffTypeFilter,
        organizationStaffVisibleCount,
        setNonOrgStaffSearch,
        setOrganizationStaffSearch,
        setOrganizationStaffStatusFilter,
        setOrganizationStaffTypeFilter,
        sportOfficialPositionTemplates,
        staffInviteError,
    } = staffController;

    return (
        <StaffSection collapsed={collapsed} onToggle={onToggle}>
            <StaffManagementPanel
                control={control}
                eventData={eventData}
                isOrganizationHostedEvent={isOrganizationHostedEvent}
                officialStaffingCoverageError={officialStaffingCoverageError}
                sportDefaultPositionCount={sportOfficialPositionTemplates.length}
                maxMediumTextLength={maxMediumTextLength}
                maxShortTextLength={maxShortTextLength}
                comboboxProps={comboboxProps}
                organizationStaffSearch={organizationStaffSearch}
                organizationStaffTypeFilter={organizationStaffTypeFilter}
                organizationStaffStatusFilter={organizationStaffStatusFilter}
                filteredOrganizationStaffEntries={filteredOrganizationStaffEntries}
                organizationStaffVisibleCount={organizationStaffVisibleCount}
                nonOrgStaffSearch={nonOrgStaffSearch}
                nonOrgStaffResults={nonOrgStaffResults}
                nonOrgStaffSearchLoading={nonOrgStaffSearchLoading}
                nonOrgStaffError={nonOrgStaffError}
                newStaffInvite={newStaffInvite}
                assignedOfficialUserIds={assignedUserIdSetByRole.OFFICIAL}
                assistantHostIds={assistantHostValue}
                assignedOfficialCards={assignedOfficialCards}
                assignedHostCards={assignedHostCards}
                officialCardVisibleCount={officialCardVisibleCount}
                hostCardVisibleCount={hostCardVisibleCount}
                eventOfficialByUserId={eventOfficialByUserId}
                availableOfficialFieldOptions={availableOfficialFieldOptions}
                staffInviteError={staffInviteError}
                eventOfficialsDisabled={isImmutableField('eventOfficials')}
                assistantHostsDisabled={isImmutableField('assistantHostIds')}
                hostDisabled={isImmutableField('hostId')}
                onRosterEditsChange={(checked) => {
                    if (!checked) {
                        setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
                    }
                }}
                onTeamsOfficiateChange={(checked) => {
                    if (!checked) {
                        setValue('teamOfficialsMaySwap', false, { shouldDirty: true, shouldValidate: true });
                        if (eventData.officialSchedulingMode === 'TEAM_STAFFING') {
                            setValue('officialSchedulingMode', 'SCHEDULE', { shouldDirty: true, shouldValidate: true });
                        }
                    }
                }}
                onSchedulingModeChange={(value) => {
                    const nextMode = normalizeOfficialSchedulingMode(value);
                    setValue('officialSchedulingMode', nextMode, { shouldDirty: true, shouldValidate: true });
                    if (nextMode === 'TEAM_STAFFING' && !eventData.doTeamsOfficiate) {
                        setValue('doTeamsOfficiate', true, { shouldDirty: true, shouldValidate: true });
                    }
                }}
                onLoadSportDefaults={handleResetOfficialPositionsFromSport}
                onAddPosition={handleAddOfficialPosition}
                onUpdatePosition={handleUpdateOfficialPosition}
                onRemovePosition={handleRemoveOfficialPosition}
                onOrganizationStaffSearchChange={setOrganizationStaffSearch}
                onOrganizationStaffTypeFilterChange={setOrganizationStaffTypeFilter}
                onOrganizationStaffStatusFilterChange={setOrganizationStaffStatusFilter}
                onOrganizationStaffScroll={handleOrganizationStaffScroll}
                onAddOfficial={handleAddOfficial}
                onAddAssistantHost={handleAddAssistantHost}
                onSetHost={handleHostChange}
                onNonOrgStaffSearchChange={setNonOrgStaffSearch}
                onInviteFieldChange={handleInviteFieldChange}
                onInviteRoleToggle={handleInviteRoleToggle}
                onStageInvite={handleStagePendingStaffInvite}
                onAssignedOfficialsScroll={handleAssignedOfficialsScroll}
                onAssignedHostsScroll={handleAssignedHostsScroll}
                onRemovePendingStaffInviteRole={handleRemovePendingStaffInviteRole}
                onRemoveOfficial={handleRemoveOfficial}
                onRemoveAssistantHost={handleRemoveAssistantHost}
                onUpdateEventOfficialEligibility={handleUpdateEventOfficialEligibility}
            />
        </StaffSection>
    );
};
