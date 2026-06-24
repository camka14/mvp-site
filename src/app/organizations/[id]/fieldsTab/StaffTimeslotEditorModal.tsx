"use client";

import { Alert, Button, Checkbox, Collapse, Group, Loader, Modal, MultiSelect, NumberInput, Select, Stack, Text, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';

type StaffTimeslotMode = 'staff_assignment' | 'official_assignment';

type SelectOption = {
  value: string;
  label: string;
};

type StaffTimeslotEditorModalProps = {
  opened: boolean;
  mode: StaffTimeslotMode;
  error: string | null;
  selectedResourceLabel: string;
  selectedRangeLabel: string;
  isEditingManagerDraft: boolean;
  isEditingStaffAssignment: boolean;
  isEditingChildStaffAssignment: boolean;
  isAssigningStaffOccurrence: boolean;
  assignedUserName?: string | null;
  facilityOptions: SelectOption[];
  facilityValue: string;
  onFacilityChange: (value: string | null) => void;
  resourceOptions: SelectOption[];
  selectedResourceIds: string[];
  onResourceIdsChange: (values: string[]) => void;
  userOptions: SelectOption[];
  userId: string | null;
  onUserIdChange: (value: string | null) => void;
  usersLoading: boolean;
  overrideAmount: string | number;
  onOverrideAmountChange: (value: string | number) => void;
  showRepeatControls: boolean;
  repeating: boolean;
  onRepeatingChange: (checked: boolean) => void;
  repeatDays: number[];
  onRepeatDaysChange: (days: number[]) => void;
  repeatDayOptions: SelectOption[];
  repeatEndDate: Date | null;
  onRepeatEndDateChange: (value: unknown) => void;
  repeatMinDate?: Date;
  notes: string;
  onNotesChange: (value: string) => void;
  submitting: boolean;
  deleting: boolean;
  submitDisabled: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDeleteOpenAssignment: () => void;
  onUnassignChildAssignment: () => void;
  onDeleteAssignment: () => void;
};

const normalizeRepeatDays = (values: string[]): number[] => (
  Array.from(new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)))
    .sort((a, b) => a - b)
);

export default function StaffTimeslotEditorModal({
  opened,
  mode,
  error,
  selectedResourceLabel,
  selectedRangeLabel,
  isEditingManagerDraft,
  isEditingStaffAssignment,
  isEditingChildStaffAssignment,
  isAssigningStaffOccurrence,
  assignedUserName,
  facilityOptions,
  facilityValue,
  onFacilityChange,
  resourceOptions,
  selectedResourceIds,
  onResourceIdsChange,
  userOptions,
  userId,
  onUserIdChange,
  usersLoading,
  overrideAmount,
  onOverrideAmountChange,
  showRepeatControls,
  repeating,
  onRepeatingChange,
  repeatDays,
  onRepeatDaysChange,
  repeatDayOptions,
  repeatEndDate,
  onRepeatEndDateChange,
  repeatMinDate,
  notes,
  onNotesChange,
  submitting,
  deleting,
  submitDisabled,
  onClose,
  onSubmit,
  onDeleteOpenAssignment,
  onUnassignChildAssignment,
  onDeleteAssignment,
}: StaffTimeslotEditorModalProps) {
  const isOfficial = mode === 'official_assignment';
  const title = isEditingStaffAssignment
    ? (isOfficial ? 'Edit Official Assignment' : 'Edit Staff Assignment')
    : isEditingManagerDraft
      ? (isOfficial ? 'Edit Official Draft' : 'Edit Staff Draft')
      : isAssigningStaffOccurrence
        ? (isOfficial ? 'Assign Official Coverage' : 'Assign Staff Coverage')
        : (isOfficial ? 'Apply Official Timeslot' : 'Apply Staff Timeslot');
  const userLabel = isOfficial ? 'Official' : 'Staff member';
  const userDescription = isEditingChildStaffAssignment
    ? 'Managed by the parent coverage assignment.'
    : isAssigningStaffOccurrence
      ? 'Required for assigned coverage.'
      : isOfficial
        ? 'Leave blank to create open official coverage.'
        : 'Leave blank to create open staff coverage.';
  const userPlaceholder = isEditingChildStaffAssignment
    ? (assignedUserName ?? 'Assigned staff member')
    : isAssigningStaffOccurrence
      ? (isOfficial ? 'Select official' : 'Select staff member')
      : (isOfficial ? 'Open official timeslot' : 'Open staff timeslot');
  const submitLabel = isEditingStaffAssignment
    ? 'Save assignment'
    : isEditingManagerDraft
      ? 'Save draft'
      : isAssigningStaffOccurrence
        ? 'Assign coverage'
        : 'Apply timeslot';

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (submitting || deleting) return;
        onClose();
      }}
      title={title}
      centered
    >
      <Stack gap="sm">
        {error ? (
          <Alert color="red" radius="md">
            {error}
          </Alert>
        ) : null}

        <Stack gap={2}>
          <Text size="sm" fw={700}>
            {selectedResourceLabel}
          </Text>
          <Text size="sm" c="dimmed">
            {selectedRangeLabel}
          </Text>
        </Stack>

        {isEditingChildStaffAssignment ? (
          <Alert color="blue" radius="md">
            This staff member is assigned to a parent coverage block. You can override pay or unassign them from this occurrence.
          </Alert>
        ) : null}

        <Select
          label="Facility"
          data={facilityOptions}
          value={facilityValue}
          onChange={onFacilityChange}
          allowDeselect={false}
          disabled={isEditingChildStaffAssignment}
          size="sm"
        />

        <MultiSelect
          label="Resources"
          description={isEditingStaffAssignment
            ? 'Choose the resource this assignment belongs to.'
            : 'Choose one or more resources to create matching coverage.'}
          data={resourceOptions}
          value={selectedResourceIds}
          onChange={onResourceIdsChange}
          searchable
          placeholder="Select resources"
          disabled={isEditingChildStaffAssignment}
          required={!isEditingChildStaffAssignment}
          size="sm"
        />

        <Select
          label={userLabel}
          description={userDescription}
          data={userOptions}
          value={userId}
          onChange={onUserIdChange}
          placeholder={userPlaceholder}
          searchable={userOptions.length > 8}
          disabled={usersLoading || isEditingChildStaffAssignment}
          rightSection={usersLoading ? <Loader size="xs" /> : undefined}
          clearable={!isEditingChildStaffAssignment}
          required={isAssigningStaffOccurrence}
        />

        <NumberInput
          label="Override rate"
          description="Optional hourly override for this timeslot."
          prefix="$"
          decimalScale={2}
          min={0}
          value={overrideAmount}
          onChange={onOverrideAmountChange}
        />

        {showRepeatControls ? (
          <>
            <Checkbox
              label="Repeat weekly"
              description="Use the selected time window on one or more days each week."
              checked={repeating}
              onChange={(event) => onRepeatingChange(event.currentTarget.checked)}
            />

            <Collapse in={repeating}>
              <Stack gap="sm">
                <MultiSelect
                  label="Repeat days"
                  data={repeatDayOptions}
                  value={repeatDays.map((day) => String(day))}
                  onChange={(values) => onRepeatDaysChange(normalizeRepeatDays(values))}
                  placeholder="Select days"
                  required
                />
                <DatePickerInput
                  label="Repeat until"
                  description="Optional. Leave blank for an ongoing weekly schedule."
                  placeholder="No end date"
                  valueFormat="MM/DD/YYYY"
                  value={repeatEndDate}
                  onChange={onRepeatEndDateChange}
                  minDate={repeatMinDate}
                  clearable
                  clearButtonProps={{ 'aria-label': 'Clear repeat end date' }}
                  popoverProps={{ withinPortal: true }}
                />
              </Stack>
            </Collapse>
          </>
        ) : null}

        {!isEditingChildStaffAssignment ? (
          <Textarea
            label="Notes"
            minRows={2}
            autosize
            value={notes}
            onChange={(event) => onNotesChange(event.currentTarget.value)}
          />
        ) : null}

        <Group justify="space-between">
          <Group gap="xs">
            {isAssigningStaffOccurrence ? (
              <Button
                color="red"
                variant="light"
                onClick={onDeleteOpenAssignment}
                loading={deleting}
                disabled={submitting}
              >
                {isOfficial ? 'Delete open official shift' : 'Delete open staff shift'}
              </Button>
            ) : isEditingChildStaffAssignment ? (
              <Button
                color="red"
                variant="light"
                onClick={onUnassignChildAssignment}
                loading={deleting}
                disabled={submitting}
              >
                Unassign staff member
              </Button>
            ) : isEditingStaffAssignment ? (
              <Button
                color="red"
                variant="light"
                onClick={onDeleteAssignment}
                loading={deleting}
                disabled={submitting}
              >
                Delete assignment
              </Button>
            ) : null}
          </Group>
          <Group gap="xs">
            <Button
              variant="subtle"
              onClick={onClose}
              disabled={submitting || deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              loading={submitting}
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
