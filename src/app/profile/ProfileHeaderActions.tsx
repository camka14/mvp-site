'use client';

import { Button, Stack } from '@mantine/core';

export type ProfileHeaderActionsProps = {
  isEditing: boolean;
  saving: boolean;
  loggingOut: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  onLogout: () => void;
};

export default function ProfileHeaderActions({
  isEditing,
  saving,
  loggingOut,
  onCancel,
  onEdit,
  onSave,
  onLogout,
}: ProfileHeaderActionsProps) {
  if (isEditing) {
    return (
      <Stack gap="xs" align="flex-end">
        <Button variant="default" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} loading={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={2} align="flex-end">
      <Button onClick={onEdit}>Edit profile</Button>
      <Button
        variant="subtle"
        color="red"
        size="compact-sm"
        onClick={onLogout}
        loading={loggingOut}
        disabled={loggingOut}
      >
        Log out
      </Button>
    </Stack>
  );
}
