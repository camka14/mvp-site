'use client';

import { Stack, Text, Title } from '@mantine/core';

import { normalizeOfficialSchedulingMode } from '../officials';
import type { EventFormSectionsProps } from '../sections/EventFormSections';
import { StaffManagementPanel } from '../sections/StaffManagementPanel';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const MAX_SHORT_TEXT_LENGTH = 80;
const MAX_MEDIUM_TEXT_LENGTH = 160;

type SimpleSetupStaffOperationsPageProps = {
    model: EventFormSectionsProps;
};

export const SimpleSetupStaffOperationsPage = ({
    model,
}: SimpleSetupStaffOperationsPageProps) => {
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
    } = model.staffController;
    const { eventData, isImmutableField, setValue } = model;

    return (
        <Stack gap="lg">
            <div>
                <Title order={4}>Staff and operations</Title>
                <Text size="sm" c="dimmed">
                    Assign hosts and officials, then configure check-in, rosters, and officiating.
                </Text>
            </div>
            <StaffManagementPanel
                control={model.control}
                eventData={eventData}
                isOrganizationHostedEvent={model.resourceController.isOrganizationHostedEvent}
                officialStaffingCoverageError={officialStaffingCoverageError}
                sportDefaultPositionCount={sportOfficialPositionTemplates.length}
                maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                maxShortTextLength={MAX_SHORT_TEXT_LENGTH}
                comboboxProps={sharedComboboxProps}
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
                        setValue('allowTemporaryMatchPlayers', false, {
                            shouldDirty: true,
                            shouldValidate: true,
                        });
                    }
                }}
                onTeamsOfficiateChange={(checked) => {
                    if (!checked) {
                        setValue('teamOfficialsMaySwap', false, {
                            shouldDirty: true,
                            shouldValidate: true,
                        });
                        if (eventData.officialSchedulingMode === 'TEAM_STAFFING') {
                            setValue('officialSchedulingMode', 'SCHEDULE', {
                                shouldDirty: true,
                                shouldValidate: true,
                            });
                        }
                    }
                }}
                onSchedulingModeChange={(value) => {
                    const nextMode = normalizeOfficialSchedulingMode(value);
                    setValue('officialSchedulingMode', nextMode, {
                        shouldDirty: true,
                        shouldValidate: true,
                    });
                    if (nextMode === 'TEAM_STAFFING' && !eventData.doTeamsOfficiate) {
                        setValue('doTeamsOfficiate', true, {
                            shouldDirty: true,
                            shouldValidate: true,
                        });
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
        </Stack>
    );
};
