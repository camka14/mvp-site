'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ExternalLink, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { formatBillAmount } from '@/types';
import {
  buildOrganizationCustomerPath,
  buildOrganizationTabPath,
  type OrganizationCustomerRouteType,
} from '@/app/organizations/[id]/organizationTabs';

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

type TeamFinanceSummary = {
  teamId: string;
  eventTeamId?: string | null;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  futureCostCents: number;
  projectedProfitCents: number;
  eventRegistrationCostCents: number;
  staffCostCents: number;
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
};

type TeamFinanceResponse = {
  finance: TeamFinanceSummary;
};

type StaffLaborStatus = 'PLANNED' | 'ACTUAL';
type LineItemStatus = 'ESTIMATED' | 'APPROVED' | 'ACTUAL' | 'PAID' | 'VOID';

type TeamFinanceStaffMemberOption = {
  id: string;
  userId?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  displayName: string;
  types: string[];
};

type TeamFinanceStaffOptionsResponse = {
  staffMembers: TeamFinanceStaffMemberOption[];
};

type TeamFinancePanelProps = {
  teamId: string;
  organizationId?: string | null;
  isActive: boolean;
  canManage: boolean;
};

type MetricTone = 'green' | 'red' | 'orange' | 'gray';
type LineItemNavigationTarget = {
  label: string;
  href: string;
};

const classificationLabels: Record<FinanceLineItemClassification, string> = {
  revenue: 'Revenue',
  refund: 'Refund',
  fee: 'Fee',
  labor_cost: 'Staff cost',
  team_registration_cost: 'Registration cost',
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

const dateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

const dollarsFromCents = (amountCents: number | null | undefined): string => {
  if (!Number.isFinite(amountCents)) {
    return '';
  }
  return (Number(amountCents) / 100).toFixed(2);
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

const formatLineItemStatus = (status: string): string => (
  LINE_ITEM_STATUS_LABELS.get(status as LineItemStatus)?.toUpperCase() ?? status
);

const formatLineItemTiming = (timing: FinanceLineItemTiming): string => (
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

function TeamFinanceBar({ finance }: { finance: TeamFinanceSummary }) {
  const otherCostCents = Math.max(
    0,
    finance.actualCostCents - finance.eventRegistrationCostCents - finance.staffCostCents,
  );
  const maxValue = Math.max(
    finance.actualRevenueCents,
    Math.abs(finance.actualProfitCents),
    finance.eventRegistrationCostCents,
    finance.staffCostCents,
    otherCostCents,
    finance.futureCostCents,
    1,
  );
  const rows = [
    {
      label: 'Team revenue',
      amountCents: finance.actualRevenueCents,
      displayCents: finance.actualRevenueCents,
      colorClassName: 'bg-green-500',
    },
    {
      label: 'Event registration costs',
      amountCents: finance.eventRegistrationCostCents,
      displayCents: -finance.eventRegistrationCostCents,
      colorClassName: 'bg-red-500',
    },
    {
      label: 'Staff costs',
      amountCents: finance.staffCostCents,
      displayCents: -finance.staffCostCents,
      colorClassName: 'bg-red-600',
    },
    {
      label: 'Other costs',
      amountCents: otherCostCents,
      displayCents: -otherCostCents,
      colorClassName: 'bg-red-400',
    },
    {
      label: 'Future costs',
      amountCents: finance.futureCostCents,
      displayCents: -finance.futureCostCents,
      colorClassName: 'bg-orange-500',
    },
    {
      label: 'Current profit/loss',
      amountCents: Math.abs(finance.actualProfitCents),
      displayCents: finance.actualProfitCents,
      colorClassName: finance.actualProfitCents >= 0 ? 'bg-green-600' : 'bg-red-600',
    },
  ];

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={700}>Team profit analysis</Text>
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
                  <Text size="xs" fw={700}>{formatSignedAmount(row.displayCents)}</Text>
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
        item.timing === 'FUTURE'
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

export default function TeamFinancePanel({
  teamId,
  organizationId,
  isActive,
  canManage,
}: TeamFinancePanelProps) {
  const router = useRouter();
  const [finance, setFinance] = useState<TeamFinanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costCategory, setCostCategory] = useState('Operations');
  const [costTitle, setCostTitle] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState<string | number>('');
  const [costStatus, setCostStatus] = useState<LineItemStatus>('ACTUAL');
  const [costQuantity, setCostQuantity] = useState<string | number>('');
  const [costUnitLabel, setCostUnitLabel] = useState('');
  const [costStartDate, setCostStartDate] = useState(() => dateInputValue());
  const [costEndDate, setCostEndDate] = useState('');
  const costStartDateInputRef = useRef<HTMLInputElement>(null);
  const costEndDateInputRef = useRef<HTMLInputElement>(null);
  const [savingCost, setSavingCost] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [costInfo, setCostInfo] = useState<string | null>(null);
  const [customCostModalOpen, setCustomCostModalOpen] = useState(false);
  const [editingCostItem, setEditingCostItem] = useState<FinanceLineItem | null>(null);
  const [staffOptions, setStaffOptions] = useState<TeamFinanceStaffMemberOption[]>([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  const [staffOptionsError, setStaffOptionsError] = useState<string | null>(null);
  const [staffCostModalOpen, setStaffCostModalOpen] = useState(false);
  const [laborStaffMemberId, setLaborStaffMemberId] = useState<string | null>(null);
  const [laborStatus, setLaborStatus] = useState<StaffLaborStatus>('PLANNED');
  const [laborDate, setLaborDate] = useState(() => dateInputValue());
  const [laborStartTime, setLaborStartTime] = useState('09:00');
  const [laborMinutes, setLaborMinutes] = useState<string | number>('');
  const [laborNotes, setLaborNotes] = useState('');
  const [savingLabor, setSavingLabor] = useState(false);
  const [laborError, setLaborError] = useState<string | null>(null);
  const [laborInfo, setLaborInfo] = useState<string | null>(null);

  const loadFinance = useCallback(async () => {
    if (!teamId || !isActive || !organizationId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<TeamFinanceResponse>(`/api/teams/${teamId}/finance`);
      setFinance(response.finance);
    } catch (loadError) {
      setError(messageForError(loadError, 'Failed to load team finance.'));
      setFinance(null);
    } finally {
      setLoading(false);
    }
  }, [isActive, organizationId, teamId]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const loadStaffOptions = useCallback(async () => {
    if (!teamId || !isActive || !canManage || !organizationId) {
      return;
    }
    setStaffOptionsLoading(true);
    setStaffOptionsError(null);
    try {
      const response = await apiRequest<TeamFinanceStaffOptionsResponse>(`/api/teams/${teamId}/finance/staff`);
      const staffMembers = Array.isArray(response.staffMembers) ? response.staffMembers : [];
      setStaffOptions(staffMembers);
      setLaborStaffMemberId((current) => current ?? staffMembers[0]?.id ?? null);
    } catch (loadError) {
      setStaffOptionsError(messageForError(loadError, 'Failed to load staff options.'));
      setStaffOptions([]);
    } finally {
      setStaffOptionsLoading(false);
    }
  }, [canManage, isActive, organizationId, teamId]);

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

  const lineItemCategoryOptions = useMemo(() => {
    const categoriesByKey = new Map<string, string>();
    ['Operations', costCategory, ...(finance?.lineItems ?? []).map((item) => item.category)]
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
  }, [costCategory, finance?.lineItems]);

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

  const resetCostDraft = useCallback(() => {
    setEditingCostItem(null);
    setCostCategory('Operations');
    setCostTitle('');
    setCostDescription('');
    setCostAmount('');
    setCostStatus('ACTUAL');
    setCostQuantity('');
    setCostUnitLabel('');
    setCostStartDate(dateInputValue());
    setCostEndDate('');
  }, []);

  const openNewCostModal = useCallback(() => {
    resetCostDraft();
    setCostError(null);
    setCostInfo(null);
    setCustomCostModalOpen(true);
  }, [resetCostDraft]);

  const openEditCostModal = useCallback((item: FinanceLineItem) => {
    if (item.isGenerated || !item.sourceId) {
      return;
    }
    setEditingCostItem(item);
    setCostCategory(item.category);
    setCostTitle(item.label);
    setCostDescription(item.description ?? '');
    setCostAmount(dollarsFromCents(Math.abs(item.amountCents)));
    setCostStatus(LINE_ITEM_STATUS_OPTIONS.some((option) => option.value === item.status)
      ? item.status as LineItemStatus
      : 'ACTUAL');
    setCostQuantity(item.quantity ?? '');
    setCostUnitLabel(item.unitLabel ?? '');
    setCostStartDate(dateValueFromIso(item.serviceStartAt));
    setCostEndDate(dateValueFromIso(item.serviceEndAt));
    setCostError(null);
    setCostInfo(null);
    setCustomCostModalOpen(true);
  }, []);

  const getLineItemSourceTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    if (!organizationId) {
      return null;
    }
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
    if (!organizationId) {
      return null;
    }
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

  const handleSaveCost = async () => {
    if (!organizationId) {
      setCostError('This team is not linked to an organization.');
      return;
    }
    const amountCents = centsFromDollars(costAmount);
    const serviceStartAt = dateInputToIso(costStartDateInputRef.current?.value ?? costStartDate);
    const serviceEndAt = dateInputToIso(costEndDateInputRef.current?.value ?? costEndDate, true);
    if (!costTitle.trim() || !costCategory.trim() || amountCents <= 0 || !serviceStartAt) {
      setCostError('Enter a title, category, amount greater than 0, and start date.');
      return;
    }
    if (serviceEndAt && new Date(serviceEndAt).getTime() < new Date(serviceStartAt).getTime()) {
      setCostError('End date must be on or after the start date.');
      return;
    }
    const quantity = costQuantity === '' ? null : Number(costQuantity);
    if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setCostError('Quantity must be greater than zero.');
      return;
    }

    setSavingCost(true);
    setCostError(null);
    setCostInfo(null);
    try {
      const body = {
        category: costCategory.trim(),
        title: costTitle.trim(),
        description: costDescription.trim() || null,
        amountCents,
        quantity,
        unitLabel: costUnitLabel.trim() || null,
        status: costStatus,
        occurredAt: serviceStartAt,
        serviceStartAt,
        serviceEndAt,
      };
      if (editingCostItem?.sourceId) {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items/${editingCostItem.sourceId}`, {
          method: 'PATCH',
          body,
        });
      } else {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items`, {
          method: 'POST',
          body: {
            scope: 'TEAM',
            teamId,
            ...body,
          },
        });
      }
      setCostInfo(editingCostItem ? 'Team cost updated.' : 'Team cost added.');
      setCustomCostModalOpen(false);
      resetCostDraft();
      await loadFinance();
    } catch (saveError) {
      setCostError(messageForError(saveError, 'Failed to save team cost.'));
    } finally {
      setSavingCost(false);
    }
  };

  const handleAddLabor = async () => {
    const selectedStaffMember = selectedLaborStaffMember;
    const paidMinutes = positiveIntegerFromInput(laborMinutes);
    const serviceStart = dateTimeInputToIso(laborDate, laborStartTime);
    if (!selectedStaffMember || !selectedStaffMember.userId || paidMinutes <= 0 || !serviceStart) {
      setLaborError('Choose a staff member, date, start time, and paid minutes greater than 0.');
      return;
    }
    const serviceEnd = addMinutesToIso(serviceStart, paidMinutes);

    setSavingLabor(true);
    setLaborError(null);
    setLaborInfo(null);
    try {
      await apiRequest(`/api/teams/${teamId}/finance/staff`, {
        method: 'POST',
        body: {
          staffMemberId: selectedStaffMember.id,
          userId: selectedStaffMember.userId,
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
      setLaborInfo('Team staff cost added.');
      setLaborMinutes('');
      setLaborNotes('');
      setStaffCostModalOpen(false);
      await loadFinance();
    } catch (saveError) {
      setLaborError(messageForError(saveError, 'Failed to add team staff cost.'));
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
        <Text fw={700}>Finance is available for organization teams.</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Link this team to an organization to track staff costs, event registration costs, and custom costs.
        </Text>
      </Paper>
    );
  }

  if (loading && !finance) {
    return (
      <Paper withBorder radius="md" p="xl">
        <Group justify="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading team finance...</Text>
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

  const renderLineItemName = (item: FinanceLineItem, canEditLineItem: boolean) => {
    if (canEditLineItem) {
      return (
        <button
          type="button"
          aria-label={`Edit ${item.label}`}
          className="block w-full border-0 bg-transparent p-0 text-left"
          onClick={(event) => {
            event.stopPropagation();
            openEditCostModal(item);
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
        <Popover width={280} position="bottom-start" shadow="md" withArrow withinPortal>
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
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={5}>Team Finance</Title>
          <Text size="sm" c="dimmed">
            Event registrations are treated as team costs. Staff labor and custom team costs update this analysis from dated records.
          </Text>
        </div>
        <Button variant="light" onClick={() => void loadFinance()} loading={loading}>
          Refresh
        </Button>
      </Group>

      {error && (
        <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 6 }} spacing="md">
        <FinanceMetricCard
          label="Revenue"
          amountCents={finance.actualRevenueCents}
          tone="green"
          description="Confirmed team revenue attributed to this team."
        />
        <FinanceMetricCard
          label="Total costs"
          amountCents={-finance.actualCostCents}
          tone="red"
          description="Event registration costs, staff labor, fees, and custom costs."
        />
        <FinanceMetricCard
          label={finance.actualProfitCents >= 0 ? 'Profit' : 'Loss'}
          amountCents={finance.actualProfitCents}
          tone={actualProfitTone}
          description="Confirmed revenue minus actual costs."
        />
        <FinanceMetricCard
          label="Event registrations"
          amountCents={-finance.eventRegistrationCostCents}
          tone="red"
          description="Team registration bills net of refunds."
        />
        <FinanceMetricCard
          label="Staff costs"
          amountCents={-finance.staffCostCents}
          tone="red"
          description="Calculated from staff wage history and team labor records."
        />
        <FinanceMetricCard
          label="Future costs"
          amountCents={-finance.futureCostCents}
          tone="orange"
          description="Dated costs that have not started yet."
        />
      </SimpleGrid>

      <TeamFinanceBar finance={finance} />

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="sm">
          <div>
            <Text fw={700}>Projected outcome</Text>
            <Text size="sm" c="dimmed">
              Actual profit minus future team costs.
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
          <Group justify="space-between" align="flex-start" gap="sm">
            <div>
              <Text fw={700}>Line items</Text>
              <Text size="sm" c="dimmed">
                Generated rows update from team registration bills, refunds, fees, staff costs, and custom team costs.
              </Text>
            </div>
            {canManage && (
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={openNewCostModal}
                >
                  Add custom cost
                </Button>
                <Button
                  variant="light"
                  onClick={() => {
                    setLaborError(null);
                    setLaborInfo(null);
                    setStaffCostModalOpen(true);
                  }}
                >
                  Add staff cost
                </Button>
              </Group>
            )}
          </Group>

          {costInfo && (
            <Alert color="green" radius="md" onClose={() => setCostInfo(null)} withCloseButton>
              {costInfo}
            </Alert>
          )}
          {laborInfo && (
            <Alert color="green" radius="md" onClose={() => setLaborInfo(null)} withCloseButton>
              {laborInfo}
            </Alert>
          )}

          {sortedLineItems.length === 0 ? (
            <Paper withBorder radius="md" p="xl" ta="center">
              <Text>No team finance line items yet.</Text>
            </Paper>
          ) : (
            <>
              <Stack gap="sm" hiddenFrom="sm">
                {sortedLineItems.map((item) => {
                  const canEditLineItem = canManage && !item.isGenerated && Boolean(item.sourceId);
                  return (
                    <Paper
                      key={item.id}
                      withBorder
                      radius="md"
                      p="sm"
                      data-testid={canEditLineItem ? `team-finance-line-item-${item.sourceId}` : undefined}
                      onClick={canEditLineItem ? () => openEditCostModal(item) : undefined}
                      style={{ cursor: canEditLineItem ? 'pointer' : undefined }}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                          <Stack gap={4} className="min-w-0">
                            {renderLineItemName(item, canEditLineItem)}
                            <Group gap={6} wrap="wrap">
                              <Badge
                                color={classificationColors[item.classification]}
                                variant="light"
                                size="sm"
                              >
                                {classificationLabels[item.classification]}
                              </Badge>
                              <Badge variant="light" color={timingColors[item.timing]} size="sm">
                                {formatLineItemTiming(item.timing).toLowerCase()}
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
                          <div>
                            <Text size="xs" c="dimmed">Quantity</Text>
                            <Text size="sm">{formatQuantityAndUnit(item.quantity, item.unitLabel)}</Text>
                          </div>
                          <div>
                            <Text size="xs" c="dimmed">Status</Text>
                            <Text size="sm">{formatLineItemStatus(item.status)}</Text>
                          </div>
                        </SimpleGrid>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>

              <ScrollArea.Autosize visibleFrom="sm" mah={440} type="scroll" scrollHideDelay={900} offsetScrollbars>
                <Table striped highlightOnHover withColumnBorders style={{ minWidth: 900 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Item</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Period</Table.Th>
                      <Table.Th>Quantity</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Source</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sortedLineItems.map((item) => {
                      const canEditLineItem = canManage && !item.isGenerated && Boolean(item.sourceId);
                      return (
                        <Table.Tr
                          key={item.id}
                          data-testid={canEditLineItem ? `team-finance-line-item-${item.sourceId}` : undefined}
                          onClick={canEditLineItem ? () => openEditCostModal(item) : undefined}
                          style={{ cursor: canEditLineItem ? 'pointer' : undefined }}
                        >
                          <Table.Td>
                            <Stack gap={2}>
                              {renderLineItemName(item, canEditLineItem)}
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
                          <Table.Td>{formatQuantityAndUnit(item.quantity, item.unitLabel)}</Table.Td>
                          <Table.Td>
                            <Group gap={6}>
                              <Badge variant="light" color="gray">
                                {formatLineItemStatus(item.status)}
                              </Badge>
                              <Badge variant="light" color={timingColors[item.timing]}>
                                {formatLineItemTiming(item.timing)}
                              </Badge>
                            </Group>
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
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </>
          )}
        </Stack>
      </Paper>

      {canManage && (
        <>
          <Modal
            opened={staffCostModalOpen}
            onClose={() => {
              if (!savingLabor) {
                setStaffCostModalOpen(false);
                setLaborError(null);
              }
            }}
            title="Add team staff cost"
            size="lg"
            centered
          >
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Assign organization staff time to this team.
              </Text>
              {laborError && (
                <Alert color="red" radius="md" onClose={() => setLaborError(null)} withCloseButton>
                  {laborError}
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
                      onChange={setLaborStaffMemberId}
                      searchable
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
                    <TextInput
                      label="Labor date"
                      type="date"
                      value={laborDate}
                      onChange={(event) => setLaborDate(event.currentTarget.value)}
                    />
                  </SimpleGrid>
                  <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
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
                    <Button
                      variant="default"
                      onClick={() => {
                        setStaffCostModalOpen(false);
                        setLaborError(null);
                      }}
                      disabled={savingLabor}
                    >
                      Cancel
                    </Button>
                    <Button onClick={() => void handleAddLabor()} loading={savingLabor}>
                      Add staff cost
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Modal>

          <Modal
            opened={customCostModalOpen}
            onClose={() => {
              if (!savingCost) {
                setCustomCostModalOpen(false);
                setEditingCostItem(null);
                setCostError(null);
              }
            }}
            title={editingCostItem ? 'Edit custom team cost' : 'Add custom team cost'}
            size="lg"
            centered
          >
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Use this for one-off team costs such as uniforms, training, travel, or equipment.
              </Text>
              {costError && (
                <Alert color="red" radius="md" onClose={() => setCostError(null)} withCloseButton>
                  {costError}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, md: 5 }} spacing="md">
                <TextInput
                  label="Title"
                  placeholder="Uniform order"
                  value={costTitle}
                  onChange={(event) => setCostTitle(event.currentTarget.value)}
                />
                <Autocomplete
                  label="Category"
                  placeholder="Equipment"
                  data={lineItemCategoryOptions}
                  value={costCategory}
                  onChange={setCostCategory}
                  comboboxProps={{ withinPortal: true }}
                />
                <NumberInput
                  label="Amount"
                  prefix="$"
                  decimalScale={2}
                  min={0}
                  value={costAmount}
                  onChange={setCostAmount}
                />
                <Select
                  label="Status"
                  data={LINE_ITEM_STATUS_OPTIONS}
                  value={costStatus}
                  onChange={(value) => setCostStatus((value as LineItemStatus | null) ?? 'ACTUAL')}
                  allowDeselect={false}
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
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <NumberInput
                  label="Quantity"
                  decimalScale={2}
                  min={0}
                  value={costQuantity}
                  onChange={setCostQuantity}
                />
                <TextInput
                  label="Unit"
                  placeholder="hours"
                  value={costUnitLabel}
                  onChange={(event) => setCostUnitLabel(event.currentTarget.value)}
                />
              </SimpleGrid>
              <Textarea
                label="Description"
                value={costDescription}
                onChange={(event) => setCostDescription(event.currentTarget.value)}
                autosize
                minRows={3}
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => {
                    setCustomCostModalOpen(false);
                    setEditingCostItem(null);
                    setCostError(null);
                  }}
                  disabled={savingCost}
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleSaveCost()} loading={savingCost}>
                  {editingCostItem ? 'Save cost' : 'Add cost'}
                </Button>
              </Group>
            </Stack>
          </Modal>
        </>
      )}
    </Stack>
  );
}
