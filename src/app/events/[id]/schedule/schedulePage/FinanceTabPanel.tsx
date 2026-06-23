import { Tabs } from '@mantine/core';

import EventFinancePanel from '../components/EventFinancePanel';

type FinanceTabPanelProps = {
  show: boolean;
  eventId: string;
  organizationId?: string | null;
  isActive: boolean;
  canManage: boolean;
};

export default function FinanceTabPanel({
  show,
  eventId,
  organizationId,
  isActive,
  canManage,
}: FinanceTabPanelProps) {
  if (!show) {
    return null;
  }

  return (
    <Tabs.Panel value="finance" pt="md">
      <EventFinancePanel
        eventId={eventId}
        organizationId={organizationId}
        isActive={isActive}
        canManage={canManage}
      />
    </Tabs.Panel>
  );
}
