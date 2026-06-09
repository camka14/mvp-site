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

const centsFromDollars = (value: string | number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
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
      label: finance.actualProfitCents >= 0 ? 'Actual profit' : 'Actual loss',
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
      )}
    </Stack>
  );
}
