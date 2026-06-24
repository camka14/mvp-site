import { Button, Paper, Popover, Stack, Text } from '@mantine/core';
import { ListChecks } from 'lucide-react';

import type { PendingSaveChangeItem } from './helpers';

type EventSchedulePendingChangesPopoverProps = {
  opened: boolean;
  changes: PendingSaveChangeItem[];
  onOpenedChange: (opened: boolean) => void;
};

export default function EventSchedulePendingChangesPopover({
  opened,
  changes,
  onOpenedChange,
}: EventSchedulePendingChangesPopoverProps) {
  const changeCount = changes.length;

  return (
    <Popover
      opened={opened}
      onChange={onOpenedChange}
      width={420}
      position="bottom-end"
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<ListChecks size={16} />}
          onClick={() => onOpenedChange(!opened)}
          disabled={changeCount === 0}
        >
          Changes ({changeCount})
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            These updates will be applied when you save.
          </Text>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <Stack gap={8}>
              {changes.map((change) => (
                <Paper key={change.id} withBorder radius="sm" p="xs">
                  <Text size="sm" fw={600}>{change.label}</Text>
                  {change.detail ? (
                    <Text size="xs" c="dimmed">{change.detail}</Text>
                  ) : null}
                </Paper>
              ))}
            </Stack>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

