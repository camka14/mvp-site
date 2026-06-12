'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { formatBillAmount } from '@/types';

type FinanceLineItemClassification =
  | 'revenue'
  | 'refund'
  | 'fee'
  | 'labor_cost'
  | 'team_registration_cost'
  | 'custom_cost'
  | 'potential_revenue'
  | 'warning';
type FinanceLineItemTiming = 'ACTUAL' | 'FUTURE' | 'POTENTIAL' | 'WARNING';

type FinanceLineItem = {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  scope: 'EVENT' | 'TEAM' | 'ORGANIZATION' | 'EVENT_TEAM';
  label: string;
  category: string;
  amountCents: number;
  classification: FinanceLineItemClassification;
  status: string;
  timing: FinanceLineItemTiming;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  isGenerated: boolean;
};

type FinanceWarning = {
  code: string;
  message: string;
  sourceType?: string;
  sourceId?: string | null;
};

type EventFinanceSummary = {
  eventId: string;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  futureCostCents: number;
  potentialRevenueCents: number;
  projectedProfitCents: number;
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
};

type EventFinanceResponse = {
  finance: EventFinanceSummary;
};

type StaffLaborStatus = 'PLANNED' | 'ACTUAL';

type EventFinanceStaffMemberOption = {
  id: string;
  userId?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  displayName: string;
  types: string[];
};

type EventFinanceStaffRoleOption = {
  id: string;
  name: string;
};

type EventFinanceStaffOptionsResponse = {
  staffMembers: EventFinanceStaffMemberOption[];
  staffRoles: EventFinanceStaffRoleOption[];
};

type EventFinancePanelProps = {
  eventId: string;
  organizationId?: string | null;
  isActive: boolean;
  canManage: boolean;
};

type MetricTone = 'green' | 'red' | 'yellow' | 'orange' | 'gray';

const classificationLabels: Record<FinanceLineItemClassification, string> = {
  revenue: 'Revenue',
  refund: 'Refund',
  fee: 'Fee',
  labor_cost: 'Staff cost',
  team_registration_cost: 'Team cost',
  custom_cost: 'Custom cost',
  potential_revenue: 'Potential',
  warning: 'Warning',
};

const classificationColors: Record<FinanceLineItemClassification, string> = {
  revenue: 'green',
  refund: 'red',
  fee: 'red',
  labor_cost: 'red',
  team_registration_cost: 'red',
  custom_cost: 'red',
  potential_revenue: 'yellow',
  warning: 'yellow',
};

const timingColors: Record<FinanceLineItemTiming, string> = {
  ACTUAL: 'green',
  FUTURE: 'orange',
  POTENTIAL: 'yellow',
  WARNING: 'yellow',
};

const dateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateInputToIso = (value: string): string | null => {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const dateTimeInputToIso = (dateValue: string, timeValue: string): string | null => {
  const date = dateValue.trim();
  if (!date) {
    return null;
  }
  const time = timeValue.trim() || '00:00';
  const parsed = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const addMinutesToIso = (isoValue: string, minutes: number): string | null => {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setMinutes(parsed.getMinutes() + minutes);
  return parsed.toISOString();
};

const centsFromDollars = (value: string | number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
};

const positiveIntegerFromInput = (value: string | number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
};

const formatSignedAmount = (amountCents: number): string => {
  const prefix = amountCents < 0 ? '-' : '';
  return `${prefix}${formatBillAmount(Math.abs(amountCents))}`;
};

const formatFinanceDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatLineItemPeriod = (item: FinanceLineItem): string => {
  const start = formatFinanceDate(item.serviceStartAt);
  const end = formatFinanceDate(item.serviceEndAt);
  if (start && end && start !== end) {
    return `${start} - ${end}`;
  }
  return start ?? end ?? 'No date';
};

const messageForError = (error: unknown, fallback: string): string => {
  if (isApiRequestError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

function FinanceMetricCard({
  label,
  amountCents,
  tone,
  description,
}: {
  label: string;
  amountCents: number;
  tone: MetricTone;
  description: string;
}) {
  const toneClassName = {
    green: 'border-green-200 bg-green-50 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    gray: 'border-gray-200 bg-gray-50 text-gray-800',
  }[tone];

  return (
    <Paper withBorder radius="md" p="md" className={toneClassName}>
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase">
          {label}
        </Text>
        <Text size="xl" fw={800}>
          {formatSignedAmount(amountCents)}
        </Text>
        <Text size="xs">
          {description}
        </Text>
      </Stack>
    </Paper>
  );
}

function EventFinanceBar({ finance }: { finance: EventFinanceSummary }) {
  const maxValue = Math.max(
    finance.actualRevenueCents,
    finance.actualCostCents,
    Math.abs(finance.actualProfitCents),
    finance.futureCostCents,
    finance.potentialRevenueCents,
    1,
  );
  const rows = [
    {
      label: 'Actual revenue',
      amountCents: finance.actualRevenueCents,
      colorClassName: 'bg-green-500',
    },
    {
      label: 'Actual costs',
      amountCents: finance.actualCostCents,
      colorClassName: 'bg-red-500',
    },
    {
      label: 'Current profit/loss',
      amountCents: Math.abs(finance.actualProfitCents),
      displayCents: finance.actualProfitCents,
      colorClassName: finance.actualProfitCents >= 0 ? 'bg-green-600' : 'bg-red-600',
    },
    {
      label: 'Future costs',
      amountCents: finance.futureCostCents,
      displayCents: -finance.futureCostCents,
      colorClassName: 'bg-orange-500',
    },
    {
      label: 'Potential profit',
      amountCents: finance.potentialRevenueCents,
      colorClassName: 'bg-yellow-500',
    },
  ];

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={700}>Profit analysis</Text>
          <Badge color={finance.projectedProfitCents >= 0 ? 'green' : 'red'} variant="light">
            Projected {formatSignedAmount(finance.projectedProfitCents)}
          </Badge>
        </Group>
        <Stack gap="xs">
          {rows.map((row) => {
            const width = `${Math.max(3, Math.round((row.amountCents / maxValue) * 100))}%`;
            return (
              <div key={row.label}>
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">{row.label}</Text>
                  <Text size="xs" fw={700}>{formatSignedAmount(row.displayCents ?? row.amountCents)}</Text>
                </Group>
                <div className="h-2.5 w-full overflow-hidden rounded bg-gray-100">
                  <div className={`h-full rounded ${row.colorClassName}`} style={{ width }} />
                </div>
              </div>
            );
          })}
        </Stack>
      </Stack>
    </Paper>
  );
}

function FinanceLineItemAmount({ item }: { item: FinanceLineItem }) {
  return (
    <Text
      fw={700}
      c={
        item.classification === 'potential_revenue'
          ? 'yellow.8'
          : item.timing === 'FUTURE'
            ? 'orange.7'
          : item.amountCents < 0
            ? 'red.7'
            : 'green.7'
      }
    >
      {formatSignedAmount(item.amountCents)}
    </Text>
  );
}

export default function EventFinancePanel({
  eventId,
  organizationId,
  isActive,
  canManage,
}: EventFinancePanelProps) {
  const [finance, setFinance] = useState<EventFinanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costCategory, setCostCategory] = useState('Operations');
  const [costTitle, setCostTitle] = useState('');
  const [costAmount, setCostAmount] = useState<string | number>('');
  const [costStartDate, setCostStartDate] = useState(() => dateInputValue());
  const [costEndDate, setCostEndDate] = useState('');
  const costStartDateInputRef = useRef<HTMLInputElement>(null);
  const costEndDateInputRef = useRef<HTMLInputElement>(null);
  const [savingCost, setSavingCost] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [costInfo, setCostInfo] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<EventFinanceStaffMemberOption[]>([]);
  const [staffRoleOptions, setStaffRoleOptions] = useState<EventFinanceStaffRoleOption[]>([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  const [staffOptionsError, setStaffOptionsError] = useState<string | null>(null);
  const [laborStaffMemberId, setLaborStaffMemberId] = useState<string | null>(null);
  const [laborRoleId, setLaborRoleId] = useState<string | null>(null);
  const [laborStatus, setLaborStatus] = useState<StaffLaborStatus>('PLANNED');
  const [laborDate, setLaborDate] = useState(() => dateInputValue());
  const [laborStartTime, setLaborStartTime] = useState('09:00');
  const [laborMinutes, setLaborMinutes] = useState<string | number>('');
  const [laborNotes, setLaborNotes] = useState('');
  const [savingLabor, setSavingLabor] = useState(false);
  const [laborError, setLaborError] = useState<string | null>(null);
  const [laborInfo, setLaborInfo] = useState<string | null>(null);

  const loadFinance = useCallback(async () => {
    if (!eventId || !isActive) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<EventFinanceResponse>(`/api/events/${eventId}/finance`);
      setFinance(response.finance);
    } catch (loadError) {
      setError(messageForError(loadError, 'Failed to load event finance.'));
      setFinance(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, isActive]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const loadStaffOptions = useCallback(async () => {
    if (!eventId || !isActive || !canManage || !organizationId) {
      return;
    }
    setStaffOptionsLoading(true);
    setStaffOptionsError(null);
    try {
      const response = await apiRequest<EventFinanceStaffOptionsResponse>(`/api/events/${eventId}/finance/staff`);
      setStaffOptions(response.staffMembers);
      setStaffRoleOptions(response.staffRoles);
      setLaborStaffMemberId((current) => current ?? response.staffMembers[0]?.id ?? null);
      setLaborRoleId((current) => current ?? response.staffMembers[0]?.roleId ?? null);
    } catch (loadError) {
      setStaffOptionsError(messageForError(loadError, 'Failed to load staff options.'));
      setStaffOptions([]);
      setStaffRoleOptions([]);
    } finally {
      setStaffOptionsLoading(false);
    }
  }, [canManage, eventId, isActive, organizationId]);

  useEffect(() => {
    void loadStaffOptions();
  }, [loadStaffOptions]);

  const selectedLaborStaffMember = useMemo(() => (
    staffOptions.find((staffMember) => staffMember.id === laborStaffMemberId) ?? null
  ), [laborStaffMemberId, staffOptions]);

  const staffSelectData = useMemo(() => staffOptions.map((staffMember) => ({
    value: staffMember.id,
    label: [
      staffMember.displayName,
      staffMember.roleName ? `(${staffMember.roleName})` : '',
    ].filter(Boolean).join(' '),
  })), [staffOptions]);

  const roleSelectData = useMemo(() => staffRoleOptions.map((role) => ({
    value: role.id,
    label: role.name,
  })), [staffRoleOptions]);

  const sortedLineItems = useMemo(() => {
    if (!finance) {
      return [];
    }
    const timingOrder: Record<FinanceLineItemTiming, number> = {
      ACTUAL: 0,
      FUTURE: 1,
      POTENTIAL: 2,
      WARNING: 3,
    };
    return [...finance.lineItems].sort((a, b) => {
      const timingDelta = timingOrder[a.timing] - timingOrder[b.timing];
      if (timingDelta !== 0) {
        return timingDelta;
      }
      const dateDelta = new Date(a.serviceStartAt ?? 0).getTime() - new Date(b.serviceStartAt ?? 0).getTime();
      if (Number.isFinite(dateDelta) && dateDelta !== 0) {
        return dateDelta;
      }
      return a.label.localeCompare(b.label);
    });
  }, [finance]);

  const handleAddCost = async () => {
    if (!organizationId) {
      setCostError('This event is not linked to an organization.');
      return;
    }
    const amountCents = centsFromDollars(costAmount);
    const serviceStartAt = dateInputToIso(costStartDateInputRef.current?.value ?? costStartDate);
    const serviceEndAt = dateInputToIso(costEndDateInputRef.current?.value ?? costEndDate);
    if (!costTitle.trim() || !costCategory.trim() || amountCents <= 0 || !serviceStartAt) {
      setCostError('Enter a title, category, amount greater than 0, and start date.');
      return;
    }
    if (serviceEndAt && new Date(serviceEndAt).getTime() < new Date(serviceStartAt).getTime()) {
      setCostError('End date must be on or after the start date.');
      return;
    }

    setSavingCost(true);
    setCostError(null);
    setCostInfo(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/line-items`, {
        method: 'POST',
        body: {
          scope: 'EVENT',
          eventId,
          category: costCategory.trim(),
          title: costTitle.trim(),
          amountCents,
          status: 'ACTUAL',
          serviceStartAt,
          serviceEndAt,
        },
      });
      setCostInfo('Cost added.');
      setCostTitle('');
      setCostAmount('');
      setCostStartDate(dateInputValue());
      setCostEndDate('');
      await loadFinance();
    } catch (saveError) {
      setCostError(messageForError(saveError, 'Failed to add cost.'));
    } finally {
      setSavingCost(false);
    }
  };

  const handleAddLabor = async () => {
    const selectedStaffMember = selectedLaborStaffMember;
    const paidMinutes = positiveIntegerFromInput(laborMinutes);
    const serviceStart = dateTimeInputToIso(laborDate, laborStartTime);
    if (!selectedStaffMember || paidMinutes <= 0 || !serviceStart) {
      setLaborError('Choose a staff member, date, start time, and paid minutes greater than 0.');
      return;
    }
    const serviceEnd = addMinutesToIso(serviceStart, paidMinutes);

    setSavingLabor(true);
    setLaborError(null);
    setLaborInfo(null);
    try {
      await apiRequest(`/api/events/${eventId}/finance/staff`, {
        method: 'POST',
        body: {
          staffMemberId: selectedStaffMember.id,
          organizationRoleId: laborRoleId || null,
          userId: selectedStaffMember.userId ?? null,
          status: laborStatus,
          plannedStart: laborStatus === 'PLANNED' ? serviceStart : null,
          plannedEnd: laborStatus === 'PLANNED' ? serviceEnd : null,
          plannedMinutes: laborStatus === 'PLANNED' ? paidMinutes : null,
          actualStart: laborStatus === 'ACTUAL' ? serviceStart : null,
          actualEnd: laborStatus === 'ACTUAL' ? serviceEnd : null,
          actualMinutes: laborStatus === 'ACTUAL' ? paidMinutes : null,
          notes: laborNotes.trim() || null,
        },
      });
      setLaborInfo('Staff cost added.');
      setLaborMinutes('');
      setLaborNotes('');
      await loadFinance();
    } catch (saveError) {
      setLaborError(messageForError(saveError, 'Failed to add staff cost.'));
    } finally {
      setSavingLabor(false);
    }
  };

  if (!isActive) {
    return null;
  }

  if (!organizationId) {
    return (
      <Paper withBorder radius="md" p="xl" ta="center">
        <Text fw={700}>Finance is available for organization events.</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Link this event to an organization to track staff costs, custom costs, and profit analysis.
        </Text>
      </Paper>
    );
  }

  if (loading && !finance) {
    return (
      <Paper withBorder radius="md" p="xl">
        <Group justify="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading finance analysis...</Text>
        </Group>
      </Paper>
    );
  }

  if (error && !finance) {
    return (
      <Alert color="red" radius="md">
        {error}
      </Alert>
    );
  }

  if (!finance) {
    return null;
  }

  const actualProfitTone: MetricTone = finance.actualProfitCents >= 0 ? 'green' : 'red';
  const projectedProfitTone: MetricTone = finance.projectedProfitCents >= 0 ? 'green' : 'red';

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 5 }} spacing="md">
        <FinanceMetricCard
          label="Revenue"
          amountCents={finance.actualRevenueCents}
          tone="green"
          description="Paid registration and event revenue after confirmed payments."
        />
        <FinanceMetricCard
          label="Costs"
          amountCents={-finance.actualCostCents}
          tone="red"
          description="Staff labor, payment fees, refunds, and custom costs."
        />
        <FinanceMetricCard
          label={finance.actualProfitCents >= 0 ? 'Profit' : 'Loss'}
          amountCents={finance.actualProfitCents}
          tone={actualProfitTone}
          description="Confirmed revenue minus actual costs."
        />
        <FinanceMetricCard
          label="Future costs"
          amountCents={-finance.futureCostCents}
          tone="orange"
          description="Dated costs that have not started yet."
        />
        <FinanceMetricCard
          label="Potential profit"
          amountCents={finance.potentialRevenueCents}
          tone="yellow"
          description="Open participant capacity valued at the current event price."
        />
      </SimpleGrid>

      <EventFinanceBar finance={finance} />

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="sm">
          <div>
            <Text fw={700}>Projected outcome</Text>
            <Text size="sm" c="dimmed">
              Actual profit plus potential open-spot revenue, minus future costs.
            </Text>
          </div>
          <Badge color={projectedProfitTone} variant="filled" size="lg">
            {formatSignedAmount(finance.projectedProfitCents)}
          </Badge>
        </Group>
      </Paper>

      {finance.warnings.length > 0 && (
        <Alert color="yellow" radius="md">
          <Stack gap={4}>
            {finance.warnings.map((warning) => (
              <Text key={`${warning.code}:${warning.sourceId ?? warning.message}`} size="sm">
                {warning.message}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={700}>Line items</Text>
              <Text size="sm" c="dimmed">
                Generated rows update from registrations, refunds, fees, staff costs, and custom event costs.
              </Text>
            </div>
            <Button variant="light" onClick={() => void loadFinance()} loading={loading}>
              Refresh
            </Button>
          </Group>

          {sortedLineItems.length === 0 ? (
            <Paper withBorder radius="md" p="xl" ta="center">
              <Text>No finance line items yet.</Text>
            </Paper>
          ) : (
            <>
              <Stack gap="sm" hiddenFrom="sm">
                {sortedLineItems.map((item) => (
                  <Paper key={item.id} withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                        <Stack gap={4} className="min-w-0">
                          <Text size="sm" fw={600}>{item.label}</Text>
                          <Group gap={6} wrap="wrap">
                            <Badge
                              color={classificationColors[item.classification]}
                              variant="light"
                              size="sm"
                            >
                              {classificationLabels[item.classification]}
                            </Badge>
                            <Badge variant="outline" color={item.isGenerated ? 'gray' : 'blue'} size="sm">
                              {item.isGenerated ? 'Generated' : 'Custom'}
                            </Badge>
                            <Badge variant="light" color={timingColors[item.timing]} size="sm">
                              {item.timing.toLowerCase()}
                            </Badge>
                          </Group>
                        </Stack>
                        <FinanceLineItemAmount item={item} />
                      </Group>

                      <SimpleGrid cols={2} spacing="xs">
                        <div>
                          <Text size="xs" c="dimmed">Category</Text>
                          <Text size="sm">{item.category}</Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Period</Text>
                          <Text size="sm">{formatLineItemPeriod(item)}</Text>
                        </div>
                      </SimpleGrid>
                    </Stack>
                  </Paper>
                ))}
              </Stack>

              <Box visibleFrom="sm" className="overflow-x-auto">
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Item</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Period</Table.Th>
                      <Table.Th>Timing</Table.Th>
                      <Table.Th>Source</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sortedLineItems.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm" fw={600}>{item.label}</Text>
                            <Badge
                              color={classificationColors[item.classification]}
                              variant="light"
                              size="sm"
                            >
                              {classificationLabels[item.classification]}
                            </Badge>
                          </Stack>
                        </Table.Td>
                        <Table.Td>{item.category}</Table.Td>
                        <Table.Td>{formatLineItemPeriod(item)}</Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={timingColors[item.timing]}>
                            {item.timing.toLowerCase()}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="outline" color={item.isGenerated ? 'gray' : 'blue'}>
                            {item.isGenerated ? 'Generated' : 'Custom'}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <FinanceLineItemAmount item={item} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            </>
          )}
        </Stack>
      </Paper>

      {canManage && (
        <>
          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Add staff cost</Text>
                <Text size="sm" c="dimmed">
                  Assign organization staff to this event.
                </Text>
              </div>
              {laborError && (
                <Alert color="red" radius="md" onClose={() => setLaborError(null)} withCloseButton>
                  {laborError}
                </Alert>
              )}
              {laborInfo && (
                <Alert color="green" radius="md" onClose={() => setLaborInfo(null)} withCloseButton>
                  {laborInfo}
                </Alert>
              )}
              {staffOptionsError && (
                <Alert color="red" radius="md" onClose={() => setStaffOptionsError(null)} withCloseButton>
                  {staffOptionsError}
                </Alert>
              )}
              {staffOptionsLoading ? (
                <Group gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Loading staff...</Text>
                </Group>
              ) : staffOptions.length === 0 ? (
                <Paper withBorder radius="md" p="md" ta="center">
                  <Text size="sm" c="dimmed">No organization staff members are available to assign yet.</Text>
                </Paper>
              ) : (
                <>
                  <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                    <Select
                      label="Staff member"
                      data={staffSelectData}
                      value={laborStaffMemberId}
                      onChange={(value) => {
                        const nextStaffMember = staffOptions.find((staffMember) => staffMember.id === value);
                        setLaborStaffMemberId(value);
                        setLaborRoleId(nextStaffMember?.roleId ?? null);
                      }}
                      searchable
                    />
                    <Select
                      label="Role"
                      data={roleSelectData}
                      value={laborRoleId}
                      onChange={setLaborRoleId}
                      clearable
                    />
                    <Select
                      label="Status"
                      data={[
                        { value: 'PLANNED', label: 'Planned' },
                        { value: 'ACTUAL', label: 'Actual' },
                      ]}
                      value={laborStatus}
                      onChange={(value) => setLaborStatus(value === 'ACTUAL' ? 'ACTUAL' : 'PLANNED')}
                      allowDeselect={false}
                    />
                  </SimpleGrid>
                  <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                    <TextInput
                      label="Labor date"
                      type="date"
                      value={laborDate}
                      onChange={(event) => setLaborDate(event.currentTarget.value)}
                    />
                    <TextInput
                      label="Start time"
                      type="time"
                      value={laborStartTime}
                      onChange={(event) => setLaborStartTime(event.currentTarget.value)}
                    />
                    <NumberInput
                      label="Paid minutes"
                      min={1}
                      step={15}
                      value={laborMinutes}
                      onChange={setLaborMinutes}
                    />
                    <TextInput
                      label="Notes"
                      value={laborNotes}
                      onChange={(event) => setLaborNotes(event.currentTarget.value)}
                    />
                  </SimpleGrid>
                  <Group justify="flex-end">
                    <Button onClick={() => void handleAddLabor()} loading={savingLabor}>
                      Add staff cost
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Add custom event cost</Text>
                <Text size="sm" c="dimmed">
                  Use this for one-off costs such as supplies, awards, permits, external rentals, or cleanup.
                </Text>
              </div>
              {costError && (
                <Alert color="red" radius="md" onClose={() => setCostError(null)} withCloseButton>
                  {costError}
                </Alert>
              )}
              {costInfo && (
                <Alert color="green" radius="md" onClose={() => setCostInfo(null)} withCloseButton>
                  {costInfo}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, md: 5 }} spacing="md">
                <TextInput
                  label="Title"
                  placeholder="Field rental"
                  value={costTitle}
                  onChange={(event) => setCostTitle(event.currentTarget.value)}
                />
                <TextInput
                  label="Category"
                  placeholder="Operations"
                  value={costCategory}
                  onChange={(event) => setCostCategory(event.currentTarget.value)}
                />
                <NumberInput
                  label="Amount"
                  prefix="$"
                  decimalScale={2}
                  min={0}
                  value={costAmount}
                  onChange={setCostAmount}
                />
                <TextInput
                  label="Start date"
                  type="date"
                  ref={costStartDateInputRef}
                  value={costStartDate}
                  onChange={(event) => setCostStartDate(event.currentTarget.value)}
                />
                <TextInput
                  label="End date"
                  type="date"
                  ref={costEndDateInputRef}
                  value={costEndDate}
                  onChange={(event) => setCostEndDate(event.currentTarget.value)}
                />
              </SimpleGrid>
              <Group justify="flex-end">
                <Button onClick={() => void handleAddCost()} loading={savingCost}>
                  Add cost
                </Button>
              </Group>
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
