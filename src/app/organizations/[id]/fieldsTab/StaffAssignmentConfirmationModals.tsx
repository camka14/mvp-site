"use client";

import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';

type StaffAssignmentScope = 'occurrence' | 'all';
type OpenStaffDeleteScope = 'following' | 'all';

type StaffAssignmentScopePromptModalProps = {
  opened: boolean;
  kindLabel?: 'staff' | 'official';
  staffName?: string | null;
  occurrenceLabel?: string | null;
  onClose: () => void;
  onApplyScope: (scope: StaffAssignmentScope) => void;
};

export function StaffAssignmentScopePromptModal({
  opened,
  kindLabel,
  staffName,
  occurrenceLabel,
  onClose,
  onApplyScope,
}: StaffAssignmentScopePromptModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={kindLabel === 'official' ? 'Assign official coverage' : 'Assign staff coverage'}
      centered
    >
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={700}>
            {staffName ?? 'Selected staff member'}
          </Text>
          <Text size="sm" c="dimmed">
            {occurrenceLabel ?? 'Selected occurrence'}
          </Text>
        </Stack>
        <Alert color="blue" radius="md">
          Assign this person to every instance of the parent coverage block, or only the clicked occurrence?
        </Alert>
        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" onClick={() => onApplyScope('occurrence')}>
            This occurrence
          </Button>
          <Button onClick={() => onApplyScope('all')}>
            All instances
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type OpenStaffDeleteChild = {
  id: string;
  label: string;
};

type OpenStaffDeleteConfirmationModalProps = {
  opened: boolean;
  title: string;
  hasPlan: boolean;
  canDeleteFollowing: boolean;
  scope: OpenStaffDeleteScope;
  occurrenceLabel: string;
  showShortenedAssignmentWarning: boolean;
  showDeletesParentWarning: boolean;
  childAssignments: OpenStaffDeleteChild[];
  onScopeChange: (scope: OpenStaffDeleteScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const OPEN_STAFF_DELETE_VISIBLE_CHILD_LIMIT = 3;
const OPEN_STAFF_DELETE_CHILD_ROW_HEIGHT = 54;

export function OpenStaffDeleteConfirmationModal({
  opened,
  title,
  hasPlan,
  canDeleteFollowing,
  scope,
  occurrenceLabel,
  showShortenedAssignmentWarning,
  showDeletesParentWarning,
  childAssignments,
  onScopeChange,
  onCancel,
  onConfirm,
}: OpenStaffDeleteConfirmationModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={title}
      centered
    >
      <Stack gap="md">
        {hasPlan ? (
          <>
            {canDeleteFollowing ? (
              <Stack gap="xs">
                <Text size="sm" fw={700}>Delete scope</Text>
                <Group gap="xs" grow>
                  <Button
                    variant={scope === 'following' ? 'filled' : 'default'}
                    onClick={() => onScopeChange('following')}
                  >
                    This and following
                  </Button>
                  <Button
                    variant={scope === 'all' ? 'filled' : 'default'}
                    onClick={() => onScopeChange('all')}
                  >
                    All instances
                  </Button>
                </Group>
              </Stack>
            ) : null}

            <Stack gap={4}>
              <Text size="sm" fw={700}>
                {scope === 'all'
                  ? 'All open instances will be removed.'
                  : 'This occurrence and future open instances will be removed.'}
              </Text>
              <Text size="sm" c="dimmed">
                {occurrenceLabel}
              </Text>
            </Stack>

            {showShortenedAssignmentWarning ? (
              <Alert color="blue" radius="md">
                The parent open range will be shortened to end after the previous occurrence. Earlier assignments remain unchanged.
              </Alert>
            ) : null}

            {showDeletesParentWarning ? (
              <Alert color="yellow" radius="md">
                This is the first occurrence in the open range, so staging this change will delete the parent open shift.
              </Alert>
            ) : null}

            {childAssignments.length ? (
              <Alert color="yellow" radius="md">
                <Stack gap={6}>
                  <Text size="sm" fw={700}>
                    Assigned coverage that will be removed
                  </Text>
                  <Stack
                    gap={6}
                    aria-label="Assigned coverage removal list"
                    style={childAssignments.length > OPEN_STAFF_DELETE_VISIBLE_CHILD_LIMIT
                      ? {
                          maxHeight: OPEN_STAFF_DELETE_VISIBLE_CHILD_LIMIT * OPEN_STAFF_DELETE_CHILD_ROW_HEIGHT,
                          overflowY: 'auto',
                          paddingRight: 4,
                        }
                      : undefined}
                  >
                    {childAssignments.map((assignment) => (
                      <Text key={assignment.id} size="sm">
                        {assignment.label}
                      </Text>
                    ))}
                  </Stack>
                </Stack>
              </Alert>
            ) : (
              <Text size="sm" c="dimmed">
                No assigned staff coverage will be removed for this scope.
              </Text>
            )}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={onCancel}>
                Cancel
              </Button>
              <Button color="red" onClick={onConfirm}>
                Stage delete
              </Button>
            </Group>
          </>
        ) : (
          <Alert color="red" radius="md">
            Unable to resolve this open staff assignment.
          </Alert>
        )}
      </Stack>
    </Modal>
  );
}
