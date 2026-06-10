'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Popover,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { ExternalLink, Plus, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { formatBillAmount } from '@/types';
import {
  buildOrganizationCustomerPath,
  buildOrganizationTabPath,
  type OrganizationCustomerRouteType,
} from './organizationTabs';

type FinanceLineItem = {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  scope: 'EVENT' | 'TEAM' | 'ORGANIZATION' | 'EVENT_TEAM';
  label: string;
  sourceName?: string | null;
  sourceEntityType?: 'event' | 'rental' | 'organization' | 'team' | null;
  sourceEntityId?: string | null;
  customerType?: OrganizationCustomerRouteType | null;
  customerId?: string | null;
  customerName?: string | null;
  description?: string | null;
  category: string;
  amountCents: number;
  quantity?: number | null;
  unitLabel?: string | null;
  classification: string;
  status: string;
  timing: 'ACTUAL' | 'FUTURE' | 'POTENTIAL' | 'WARNING';
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  isGenerated: boolean;
};

type OrganizationFinanceSummary = {
  organizationId: string;
  grossRevenueCents: number;
  refundCents: number;
  feeCents: number;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  futureCostCents: number;
  projectedProfitCents: number;
  staffCostCents: number;
  customCostCents: number;
  lineItems: FinanceLineItem[];
  warnings: Array<{ code: string; message: string }>;
};

type StaffPayRunItem = {
  id: string;
  label: string;
  amountCents: number;
  status: string;
  payoutStatus: string;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
};

type StaffPayRun = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  payoutStatus: string;
  totalAmountCents: number;
  itemCount: number;
  approvedAt?: string | null;
  paidAt?: string | null;
  items: StaffPayRunItem[];
};

type FinanceResponse = {
  finance: OrganizationFinanceSummary;
  payRuns: StaffPayRun[];
  lineItemCategories?: string[];
};

type LineItemStatus = 'ESTIMATED' | 'APPROVED' | 'ACTUAL' | 'PAID' | 'VOID';

type LineItemDraft = {
  title: string;
  category: string;
  description: string;
  amount: string | number;
  status: LineItemStatus;
  serviceStartDate: string;
  serviceEndDate: string;
  quantity: string | number;
  unitLabel: string;
};

type OrganizationFinancePanelProps = {
  organizationId: string;
  isActive: boolean;
  canManage: boolean;
};

type LineItemNavigationTarget = {
  label: string;
  href: string;
};

const dateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthStartValue = (): string => {
  const now = new Date();
  return dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
};

const LINE_ITEM_STATUS_OPTIONS = [
  { value: 'ESTIMATED', label: 'Estimated' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ACTUAL', label: 'Incurred' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOID', label: 'Void' },
] satisfies Array<{ value: LineItemStatus; label: string }>;

const LINE_ITEM_STATUS_LABELS = new Map<LineItemStatus, string>(
  LINE_ITEM_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const dateInputToIso = (value: string, endOfDay = false): string | null => {
  if (!value.trim()) {
    return null;
  }
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const dateValueFromIso = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return dateInputValue(parsed);
};

const centsFromDollars = (amountCents: number): string => {
  const prefix = amountCents < 0 ? '-' : '';
  return `${prefix}${formatBillAmount(Math.abs(amountCents))}`;
};

const dollarsToCents = (value: string | number): number => {
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/^\$/, ''));
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
};

const dollarsFromCents = (amountCents: number | null | undefined): string => {
  if (!Number.isFinite(amountCents)) {
    return '';
  }
  return (Number(amountCents) / 100).toFixed(2);
};

const formatDate = (value?: string | null): string => {
  if (!value) {
    return 'No date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No date';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatPeriod = (start?: string | null, end?: string | null): string => {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

const formatLineItemStatus = (status: string): string => (
  LINE_ITEM_STATUS_LABELS.get(status as LineItemStatus)?.toUpperCase() ?? status
);

const formatLineItemTiming = (timing: FinanceLineItem['timing']): string => (
  timing === 'ACTUAL' ? 'CURRENT' : timing
);

const formatQuantityAndUnit = (quantity?: number | null, unitLabel?: string | null): string => {
  const normalizedUnit = unitLabel?.trim();
  if (quantity == null || !Number.isFinite(quantity)) {
    return normalizedUnit || '-';
  }
  const quantityLabel = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const displayUnit = quantity === 1 && normalizedUnit === 'hours'
    ? 'hour'
    : normalizedUnit;
  return displayUnit ? `${quantityLabel} ${displayUnit}` : quantityLabel;
};

const defaultLineItemDraft = (): LineItemDraft => ({
  title: '',
  category: 'Operations',
  description: '',
  amount: '',
  status: 'ACTUAL',
  serviceStartDate: dateInputValue(),
  serviceEndDate: '',
  quantity: '',
  unitLabel: '',
});

const lineItemDraftFromItem = (item: FinanceLineItem): LineItemDraft => ({
  title: item.label,
  category: item.category,
  description: item.description ?? '',
  amount: dollarsFromCents(Math.abs(item.amountCents)),
  status: LINE_ITEM_STATUS_OPTIONS.some((option) => option.value === item.status)
    ? item.status as LineItemStatus
    : 'ACTUAL',
  serviceStartDate: dateValueFromIso(item.serviceStartAt),
  serviceEndDate: dateValueFromIso(item.serviceEndAt),
  quantity: item.quantity ?? '',
  unitLabel: item.unitLabel ?? '',
});

const messageForError = (error: unknown, fallback: string): string => {
  if (isApiRequestError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

function FinanceMetric({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  tone: 'green' | 'red' | 'orange' | 'gray';
}) {
  const toneClassName = {
    green: 'border-green-200 bg-green-50 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    gray: 'border-gray-200 bg-gray-50 text-gray-800',
  }[tone];

  return (
    <Paper withBorder radius="md" p="md" className={toneClassName}>
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase">{label}</Text>
        <Text size="xl" fw={800}>{centsFromDollars(value)}</Text>
        <Text size="xs">{description}</Text>
      </Stack>
    </Paper>
  );
}

export default function OrganizationFinancePanel({
  organizationId,
  isActive,
  canManage,
}: OrganizationFinancePanelProps) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(monthStartValue);
  const [toDate, setToDate] = useState(() => dateInputValue());
  const [finance, setFinance] = useState<OrganizationFinanceSummary | null>(null);
  const [payRuns, setPayRuns] = useState<StaffPayRun[]>([]);
  const [lineItemCategories, setLineItemCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payRunTitle, setPayRunTitle] = useState('');
  const [payRunStart, setPayRunStart] = useState(monthStartValue);
  const [payRunEnd, setPayRunEnd] = useState(() => dateInputValue());
  const [payRunSaving, setPayRunSaving] = useState(false);
  const [updatingPayRunId, setUpdatingPayRunId] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [lineItemModalOpen, setLineItemModalOpen] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<FinanceLineItem | null>(null);
  const [lineItemDraft, setLineItemDraft] = useState<LineItemDraft>(() => defaultLineItemDraft());
  const [lineItemSaving, setLineItemSaving] = useState(false);
  const [lineItemError, setLineItemError] = useState<string | null>(null);

  const loadFinance = useCallback(async () => {
    if (!isActive) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate.trim()) {
        params.set('from', dateInputToIso(fromDate) ?? fromDate);
      }
      if (toDate.trim()) {
        params.set('to', dateInputToIso(toDate, true) ?? toDate);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await apiRequest<FinanceResponse>(`/api/organizations/${organizationId}/finance${suffix}`);
      setFinance(response.finance);
      setPayRuns(response.payRuns ?? []);
      setLineItemCategories(response.lineItemCategories ?? []);
    } catch (loadError) {
      setError(messageForError(loadError, 'Failed to load organization finance.'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, isActive, organizationId, toDate]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const sortedLineItems = useMemo(() => (
    [...(finance?.lineItems ?? [])].sort((a, b) => {
      const aDate = a.serviceStartAt ? new Date(a.serviceStartAt).getTime() : 0;
      const bDate = b.serviceStartAt ? new Date(b.serviceStartAt).getTime() : 0;
      return bDate - aDate;
    })
  ), [finance?.lineItems]);

  const lineItemCategoryOptions = useMemo(() => {
    const categoriesByKey = new Map<string, string>();
    [...lineItemCategories, ...(finance?.lineItems ?? [])
      .filter((item) => !item.isGenerated)
      .map((item) => item.category)]
      .forEach((category) => {
        const normalizedCategory = category.trim();
        if (!normalizedCategory) {
          return;
        }
        const key = normalizedCategory.toLowerCase();
        if (!categoriesByKey.has(key)) {
          categoriesByKey.set(key, normalizedCategory);
        }
      });
    return [...categoriesByKey.values()].sort((a, b) => a.localeCompare(b));
  }, [finance?.lineItems, lineItemCategories]);

  const updateLineItemDraft = useCallback((patch: Partial<LineItemDraft>) => {
    setLineItemDraft((current) => ({ ...current, ...patch }));
  }, []);

  const getLineItemSourceTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    const sourceId = item.sourceEntityId?.trim();
    const sourceType = item.sourceEntityType;
    if (!sourceId || !sourceType) {
      return null;
    }
    const label = item.sourceName?.trim() || 'Source';
    if (sourceType === 'event') {
      return { label, href: `/events/${encodeURIComponent(sourceId)}?tab=details` };
    }
    if (sourceType === 'rental') {
      return { label, href: buildOrganizationTabPath(organizationId, 'fields') };
    }
    if (sourceType === 'team') {
      return { label, href: buildOrganizationCustomerPath(organizationId, 'teams', sourceId) };
    }
    if (sourceType === 'organization') {
      return { label, href: buildOrganizationTabPath(organizationId, 'overview') };
    }
    return null;
  }, [organizationId]);

  const getLineItemCustomerTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    const customerId = item.customerId?.trim();
    const customerType = item.customerType;
    if (!customerId || (customerType !== 'users' && customerType !== 'teams')) {
      return null;
    }
    return {
      label: item.customerName?.trim() || (customerType === 'teams' ? 'Team customer' : 'Customer'),
      href: buildOrganizationCustomerPath(organizationId, customerType, customerId),
    };
  }, [organizationId]);

  const navigateToLineItemTarget = useCallback((target: LineItemNavigationTarget | null) => {
    if (!target) {
      return;
    }
    router.push(target.href);
  }, [router]);

  const openNewLineItem = useCallback(() => {
    setEditingLineItem(null);
    setLineItemDraft(defaultLineItemDraft());
    setLineItemError(null);
    setLineItemModalOpen(true);
  }, []);

  const openEditLineItem = useCallback((item: FinanceLineItem) => {
    if (item.isGenerated || !item.sourceId) {
      return;
    }
    setEditingLineItem(item);
    setLineItemDraft(lineItemDraftFromItem(item));
    setLineItemError(null);
    setLineItemModalOpen(true);
  }, []);

  const saveLineItem = useCallback(async () => {
    const title = lineItemDraft.title.trim();
    const category = lineItemDraft.category.trim();
    const amountCents = dollarsToCents(lineItemDraft.amount);
    if (!title || !category || amountCents <= 0) {
      setLineItemError('Title, category, and amount are required.');
      return;
    }
    const serviceStartAt = dateInputToIso(lineItemDraft.serviceStartDate);
    const serviceEndAt = dateInputToIso(lineItemDraft.serviceEndDate, true);
    if (serviceStartAt && serviceEndAt && new Date(serviceEndAt).getTime() < new Date(serviceStartAt).getTime()) {
      setLineItemError('End date must be on or after the start date.');
      return;
    }
    const quantity = lineItemDraft.quantity === '' ? null : Number(lineItemDraft.quantity);
    if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setLineItemError('Quantity must be greater than zero.');
      return;
    }

    setLineItemSaving(true);
    setLineItemError(null);
    try {
      const baseBody = {
        title,
        category,
        description: lineItemDraft.description.trim() || null,
        amountCents,
        quantity,
        unitLabel: lineItemDraft.unitLabel.trim() || null,
        status: lineItemDraft.status,
        occurredAt: serviceStartAt,
        serviceStartAt,
        serviceEndAt,
      };
      if (editingLineItem?.sourceId) {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items/${editingLineItem.sourceId}`, {
          method: 'PATCH',
          body: baseBody,
        });
      } else {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items`, {
          method: 'POST',
          body: {
            scope: 'ORGANIZATION',
            ...baseBody,
          },
        });
      }
      setLineItemModalOpen(false);
      setEditingLineItem(null);
      setLineItemDraft(defaultLineItemDraft());
      await loadFinance();
    } catch (saveError) {
      setLineItemError(messageForError(saveError, 'Failed to save line item.'));
    } finally {
      setLineItemSaving(false);
    }
  }, [editingLineItem?.sourceId, lineItemDraft, loadFinance, organizationId]);

  const createPayRun = useCallback(async () => {
    setPayRunSaving(true);
    setPayrollError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/pay-runs`, {
        method: 'POST',
        body: {
          title: payRunTitle.trim() || null,
          periodStart: dateInputToIso(payRunStart),
          periodEnd: dateInputToIso(payRunEnd, true),
        },
      });
      setPayRunTitle('');
      await loadFinance();
    } catch (createError) {
      setPayrollError(messageForError(createError, 'Failed to create staff pay run.'));
    } finally {
      setPayRunSaving(false);
    }
  }, [loadFinance, organizationId, payRunEnd, payRunStart, payRunTitle]);

  const updatePayRun = useCallback(async (payRunId: string, action: 'APPROVE' | 'MARK_PAID' | 'VOID') => {
    setUpdatingPayRunId(payRunId);
    setPayrollError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/pay-runs/${payRunId}`, {
        method: 'PATCH',
        body: { action },
      });
      await loadFinance();
    } catch (updateError) {
      setPayrollError(messageForError(updateError, 'Failed to update staff pay run.'));
    } finally {
      setUpdatingPayRunId(null);
    }
  }, [loadFinance, organizationId]);

  const profitTone = (finance?.actualProfitCents ?? 0) >= 0 ? 'green' : 'red';
  const projectedTone = (finance?.projectedProfitCents ?? 0) >= 0 ? 'green' : 'red';

  const renderLineItemName = (item: FinanceLineItem, canEditLineItem: boolean) => {
    if (canEditLineItem) {
      return (
        <button
          type="button"
          aria-label={`Edit ${item.label}`}
          className="block w-full border-0 bg-transparent p-0 text-left"
          onClick={(event) => {
            event.stopPropagation();
            openEditLineItem(item);
          }}
        >
          <Stack gap={1}>
            <Text size="sm" fw={600}>{item.label}</Text>
            <Text size="xs" c="dimmed">Custom</Text>
          </Stack>
        </button>
      );
    }

    const sourceTarget = item.isGenerated ? getLineItemSourceTarget(item) : null;
    const customerTarget = item.isGenerated ? getLineItemCustomerTarget(item) : null;
    if (item.isGenerated && (sourceTarget || customerTarget)) {
      return (
        <Popover width={260} position="bottom-start" shadow="md" withArrow withinPortal>
          <Popover.Target>
            <button
              type="button"
              aria-label={`Open actions for ${item.label}`}
              className="block w-full border-0 bg-transparent p-0 text-left"
              onClick={(event) => event?.stopPropagation?.()}
            >
              <Stack gap={1}>
                <Text size="sm" fw={600}>{item.label}</Text>
                <Text size="xs" c="dimmed">Generated</Text>
              </Stack>
            </button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap={4}>
              <Button
                size="xs"
                variant="subtle"
                justify="flex-start"
                aria-label={`Go to "${sourceTarget?.label ?? 'Source'}"`}
                leftSection={<ExternalLink size={14} />}
                disabled={!sourceTarget}
                onClick={() => navigateToLineItemTarget(sourceTarget)}
              >
                Go to &quot;{sourceTarget?.label ?? 'Source'}&quot;
              </Button>
              <Button
                size="xs"
                variant="subtle"
                justify="flex-start"
                aria-label={`Go to "${customerTarget?.label ?? 'Customer'}"`}
                leftSection={<UserRound size={14} />}
                disabled={!customerTarget}
                onClick={() => navigateToLineItemTarget(customerTarget)}
              >
                Go to &quot;{customerTarget?.label ?? 'Customer'}&quot;
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      );
    }

    return (
      <Stack gap={1}>
        <Text size="sm" fw={600}>{item.label}</Text>
        <Text size="xs" c="dimmed">{item.isGenerated ? 'Generated' : 'Custom'}</Text>
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      <Modal
        opened={lineItemModalOpen}
        onClose={() => {
          setLineItemModalOpen(false);
          setLineItemError(null);
        }}
        title={editingLineItem ? 'Edit financial line item' : 'Add financial line item'}
        size="lg"
        centered
      >
        <Stack gap="md">
          {lineItemError && <Alert color="red">{lineItemError}</Alert>}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="Title"
              aria-label="Line item title"
              placeholder="Field rental"
              value={lineItemDraft.title}
              onChange={(event) => updateLineItemDraft({ title: event.currentTarget.value })}
              required
            />
            <Autocomplete
              label="Category"
              aria-label="Line item category"
              placeholder="Rentals"
              data={lineItemCategoryOptions}
              value={lineItemDraft.category}
              onChange={(value) => updateLineItemDraft({ category: value })}
              comboboxProps={{ withinPortal: true }}
              required
            />
            <NumberInput
              label="Amount"
              aria-label="Line item amount"
              prefix="$"
              decimalScale={2}
              min={0}
              value={lineItemDraft.amount}
              onChange={(value) => updateLineItemDraft({ amount: value })}
              required
            />
            <Select
              label="Status"
              aria-label="Line item status"
              data={LINE_ITEM_STATUS_OPTIONS}
              value={lineItemDraft.status}
              onChange={(value) => updateLineItemDraft({ status: (value as LineItemStatus | null) ?? 'ACTUAL' })}
              allowDeselect={false}
            />
            <TextInput
              label="Start date"
              aria-label="Line item start date"
              type="date"
              value={lineItemDraft.serviceStartDate}
              onChange={(event) => updateLineItemDraft({ serviceStartDate: event.currentTarget.value })}
            />
            <TextInput
              label="End date"
              aria-label="Line item end date"
              type="date"
              value={lineItemDraft.serviceEndDate}
              onChange={(event) => updateLineItemDraft({ serviceEndDate: event.currentTarget.value })}
            />
            <NumberInput
              label="Quantity"
              aria-label="Line item quantity"
              decimalScale={2}
              min={0}
              value={lineItemDraft.quantity}
              onChange={(value) => updateLineItemDraft({ quantity: value })}
            />
            <TextInput
              label="Unit"
              aria-label="Line item unit"
              placeholder="hours"
              value={lineItemDraft.unitLabel}
              onChange={(event) => updateLineItemDraft({ unitLabel: event.currentTarget.value })}
            />
          </SimpleGrid>
          <Textarea
            label="Description"
            aria-label="Line item description"
            value={lineItemDraft.description}
            onChange={(event) => updateLineItemDraft({ description: event.currentTarget.value })}
            autosize
            minRows={3}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setLineItemModalOpen(false);
                setLineItemError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveLineItem()} loading={lineItemSaving}>
              Save line item
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={5}>Finance and payroll</Title>
          <Text size="sm" c="dimmed">
            Organization-level revenue, refunds, labor costs, custom costs, and internal staff pay runs.
          </Text>
        </Stack>
        <Button variant="default" onClick={() => void loadFinance()} loading={loading}>
          Refresh
        </Button>
      </Group>

      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Group align="end" gap="sm">
          <TextInput
            label="From"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.currentTarget.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.currentTarget.value)}
          />
          <Button variant="light" onClick={() => void loadFinance()} loading={loading}>
            Apply
          </Button>
        </Group>
      </Paper>

      {error && <Alert color="red">{error}</Alert>}

      {loading && !finance ? (
        <Group gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading finance...</Text>
        </Group>
      ) : finance ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <FinanceMetric
              label="Gross sales"
              value={finance.grossRevenueCents}
              tone="green"
              description="Paid organization, event, team, rental, and product bills."
            />
            <FinanceMetric
              label="Refunds and fees"
              value={-(finance.refundCents + finance.feeCents)}
              tone="red"
              description={`${centsFromDollars(-finance.refundCents)} refunds, ${centsFromDollars(-finance.feeCents)} fees.`}
            />
            <FinanceMetric
              label="Current profit"
              value={finance.actualProfitCents}
              tone={profitTone}
              description="Net revenue minus staff and custom costs."
            />
            <FinanceMetric
              label="Projected profit"
              value={finance.projectedProfitCents}
              tone={finance.futureCostCents > 0 ? 'orange' : projectedTone}
              description={`${centsFromDollars(-finance.futureCostCents)} future costs included.`}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Staff costs</Text>
              <Text size="lg" fw={800}>{centsFromDollars(-finance.staffCostCents)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Custom costs</Text>
              <Text size="lg" fw={800}>{centsFromDollars(-finance.customCostCents)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Warnings</Text>
              <Text size="lg" fw={800}>{finance.warnings.length}</Text>
            </Paper>
          </SimpleGrid>

          {finance.warnings.length > 0 && (
            <Alert color="yellow">
              <Stack gap={4}>
                {finance.warnings.map((warning) => (
                  <Text key={`${warning.code}-${warning.message}`} size="sm">{warning.message}</Text>
                ))}
              </Stack>
            </Alert>
          )}

          <Paper withBorder radius="md" p="md" className="org-tab-surface">
            <Group justify="space-between" align="center" mb="sm">
              <Title order={6}>Finance line items</Title>
              {canManage && (
                <Button size="xs" variant="light" leftSection={<Plus size={14} />} onClick={openNewLineItem}>
                  Add line item
                </Button>
              )}
            </Group>
            <ScrollArea.Autosize mah={440} type="scroll" scrollHideDelay={900} offsetScrollbars>
              <Table striped highlightOnHover withColumnBorders style={{ minWidth: 900 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedLineItems.length > 0 ? sortedLineItems.map((item) => {
                    const canEditLineItem = canManage && !item.isGenerated && Boolean(item.sourceId);
                    return (
                      <Table.Tr
                        key={item.id}
                        data-testid={canEditLineItem ? `finance-line-item-${item.sourceId}` : undefined}
                        onClick={canEditLineItem ? () => openEditLineItem(item) : undefined}
                        style={{ cursor: canEditLineItem ? 'pointer' : undefined }}
                      >
                        <Table.Td>{formatPeriod(item.serviceStartAt, item.serviceEndAt)}</Table.Td>
                        <Table.Td>
                          {renderLineItemName(item, canEditLineItem)}
                        </Table.Td>
                        <Table.Td>{item.category}</Table.Td>
                        <Table.Td>{formatQuantityAndUnit(item.quantity, item.unitLabel)}</Table.Td>
                        <Table.Td>
                          <Group gap={6}>
                            <Badge size="xs" variant="light">{formatLineItemStatus(item.status)}</Badge>
                            <Badge size="xs" color={item.timing === 'FUTURE' ? 'orange' : item.timing === 'WARNING' ? 'yellow' : 'green'} variant="light">
                              {formatLineItemTiming(item.timing)}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={700} c={item.amountCents >= 0 ? 'green' : 'red'}>
                            {centsFromDollars(item.amountCents)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  }) : (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">No finance line items for this range.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>

          <Paper withBorder radius="md" p="md" className="org-tab-surface">
            <Group justify="space-between" align="flex-start" mb="sm">
              <Stack gap={2}>
                <Title order={6}>Staff pay runs</Title>
                <Text size="sm" c="dimmed">Create internal payroll batches from unpaid staff labor.</Text>
              </Stack>
            </Group>

            {canManage && (
              <Group align="end" gap="sm" mb="md">
                <TextInput
                  label="Pay run title"
                  placeholder="June payroll"
                  value={payRunTitle}
                  onChange={(event) => setPayRunTitle(event.currentTarget.value)}
                />
                <TextInput
                  label="Period start"
                  type="date"
                  value={payRunStart}
                  onChange={(event) => setPayRunStart(event.currentTarget.value)}
                />
                <TextInput
                  label="Period end"
                  type="date"
                  value={payRunEnd}
                  onChange={(event) => setPayRunEnd(event.currentTarget.value)}
                />
                <Button onClick={() => void createPayRun()} loading={payRunSaving}>
                  Create pay run
                </Button>
                {payrollError && (
                  <Text size="sm" c="red" fw={600}>
                    {payrollError}
                  </Text>
                )}
              </Group>
            )}

            <ScrollArea.Autosize mah={420}>
              <Table striped highlightOnHover withColumnBorders style={{ minWidth: 840 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pay run</Table.Th>
                    <Table.Th>Period</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Items</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                    {canManage && <Table.Th>Actions</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {payRuns.length > 0 ? payRuns.map((payRun) => (
                    <Table.Tr key={payRun.id}>
                      <Table.Td>
                        <Stack gap={1}>
                          <Text size="sm" fw={600}>{payRun.title}</Text>
                          {payRun.items.slice(0, 2).map((item) => (
                            <Text key={item.id} size="xs" c="dimmed">{item.label} • {centsFromDollars(item.amountCents)}</Text>
                          ))}
                          {payRun.items.length > 2 && (
                            <Text size="xs" c="dimmed">+{payRun.items.length - 2} more</Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{formatPeriod(payRun.periodStart, payRun.periodEnd)}</Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <Badge size="xs" variant="light">{payRun.status}</Badge>
                          <Badge size="xs" variant="light" color={payRun.payoutStatus === 'PAID' ? 'green' : 'gray'}>
                            {payRun.payoutStatus}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>{payRun.itemCount}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={700}>{centsFromDollars(payRun.totalAmountCents)}</Text>
                      </Table.Td>
                      {canManage && (
                        <Table.Td>
                          <Group gap="xs">
                            {payRun.status === 'DRAFT' && (
                              <Button
                                size="xs"
                                variant="light"
                                loading={updatingPayRunId === payRun.id}
                                onClick={() => void updatePayRun(payRun.id, 'APPROVE')}
                              >
                                Approve
                              </Button>
                            )}
                            {payRun.status !== 'PAID' && payRun.status !== 'VOID' && (
                              <Button
                                size="xs"
                                variant="light"
                                color="green"
                                loading={updatingPayRunId === payRun.id}
                                onClick={() => void updatePayRun(payRun.id, 'MARK_PAID')}
                              >
                                Mark paid
                              </Button>
                            )}
                            {payRun.status !== 'VOID' && payRun.status !== 'PAID' && (
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                loading={updatingPayRunId === payRun.id}
                                onClick={() => void updatePayRun(payRun.id, 'VOID')}
                              >
                                Void
                              </Button>
                            )}
                          </Group>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  )) : (
                    <Table.Tr>
                      <Table.Td colSpan={canManage ? 6 : 5}>
                        <Text size="sm" c="dimmed">No staff pay runs yet.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>
        </>
      ) : null}
    </Stack>
  );
}
