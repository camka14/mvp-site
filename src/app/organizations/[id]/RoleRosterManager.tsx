"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
} from 'react-big-calendar';
import type { EventProps, View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { addDays, endOfDay, endOfMonth, endOfWeek, format, getDay, parse, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { Plus } from 'lucide-react';
import SharedCalendarEvent from '@/components/calendar/SharedCalendarEvent';
import UserCard from '@/components/ui/UserCard';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { buildUniqueColorReferenceList } from '@/lib/calendarColorReferences';
import { ORGANIZATION_PERMISSION_OPTIONS } from '@/lib/organizationPermissions';
import { getStaffMemberTypesForOrganizationRole } from '@/lib/staff';
import { formatBillAmount, type OrganizationRole, type StaffMemberType, type UserData } from '@/types';

export type RoleRosterStatus = 'active' | 'pending' | 'declined';

export type RoleInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
  types: StaffMemberType[];
  roleId?: string | null;
};

export type RoleRosterEntry = {
  id: string;
  staffMemberId?: string | null;
  userId: string;
  fullName: string;
  userName: string | null;
  email?: string | null;
  user?: UserData | null;
  status: RoleRosterStatus;
  subtitle?: string | null;
  types: StaffMemberType[];
  roleId?: string | null;
  roleName?: string | null;
  canRemove?: boolean;
  locked?: boolean;
};

type RoleRosterManagerProps = {
  rosterEntries: RoleRosterEntry[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults: UserData[];
  searchLoading: boolean;
  searchError: string | null;
  onAddExisting: (user: UserData, roleId: string, types: StaffMemberType[]) => void;
  inviteRows: RoleInviteRow[];
  onInviteRowsChange: (rows: RoleInviteRow[]) => void;
  inviteError: string | null;
  inviting: boolean;
  staffRoles: OrganizationRole[];
  onSendInvites: () => void;
  onRemoveFromRoster: (userId: string) => void;
  onRoleChange: (userId: string, roleId: string) => Promise<void> | void;
  onCreateRole: (name: string, permissions: string[]) => Promise<void> | void;
  onUpdateRole: (roleId: string, data: { name?: string; permissions?: string[] }) => Promise<void> | void;
  organizationId?: string | null;
  canManageCompensation?: boolean;
};

type ManagerView = 'staff' | 'schedule' | 'roles' | 'compensation';
type CompensationWageType = 'HOURLY' | 'SALARY' | 'FLAT_PER_EVENT';
type StaffScheduleAssignmentKind = 'STAFF_SHIFT' | 'OFFICIAL_SHIFT';

type StaffScheduleFacility = {
  id?: string;
  $id?: string;
  name?: string | null;
  location?: string | null;
};

type StaffScheduleField = {
  id?: string;
  $id?: string;
  name?: string | null;
  facilityId?: string | null;
};

type StaffScheduleStaffMember = {
  staffMemberId: string;
  userId: string;
  fullName: string;
  userName?: string | null;
  types: StaffMemberType[];
  roleId?: string | null;
  roleName?: string | null;
};

type StaffScheduleTimeSlot = {
  id?: string;
  startDate: string;
  endDate?: string | null;
  repeating: boolean;
  daysOfWeek?: number[] | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
};

type StaffScheduleAssignment = {
  id: string;
  parentAssignmentId?: string | null;
  staffMemberId?: string | null;
  userId?: string | null;
  userName: string;
  isOpen?: boolean;
  isChildAssignment?: boolean;
  assignmentKind: StaffScheduleAssignmentKind;
  facilityId?: string | null;
  facilityName?: string | null;
  fieldId?: string | null;
  fieldName?: string | null;
  timeSlotId: string;
  timeSlot?: StaffScheduleTimeSlot | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  rateOverrideType?: CompensationWageType | null;
  rateOverrideCents?: number | null;
  status?: string | null;
  notes?: string | null;
};

type StaffScheduleResponse = {
  assignments?: StaffScheduleAssignment[];
  facilities?: StaffScheduleFacility[];
  fields?: StaffScheduleField[];
  staffMembers?: StaffScheduleStaffMember[];
};

type StaffScheduleDraft = {
  userId: string | null;
  assignmentKind: StaffScheduleAssignmentKind;
  facilityId: string | null;
  fieldId: string | null;
  start: Date | null;
  end: Date | null;
  repeating: boolean;
  daysOfWeek: string[];
  repeatEnd: Date | null;
  overrideAmount: string | number;
  notes: string;
};

type StaffScheduleCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: StaffScheduleAssignment;
};

type StaffScheduleOpenOccurrence = StaffScheduleCalendarEvent | null;

type CompensationRate = {
  id: string;
  organizationId: string;
  organizationRoleId?: string | null;
  staffMemberId?: string | null;
  wageType: CompensationWageType;
  amountCents: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

type CompensationRatesResponse = {
  roleRates: CompensationRate[];
  staffRates: CompensationRate[];
};

type CompensationDraft = {
  wageType: CompensationWageType;
  amount: string | number;
  effectiveFrom: string;
  effectiveTo: string;
};

type DraftRole = {
  clientId: string;
  name: string;
  permissions: string[];
  error: string | null;
  isCreating: boolean;
};

const ROLE_NAME_DEBOUNCE_MS = 650;

const STAFF_TYPE_OPTIONS = [
  { value: 'HOST', label: 'Host' },
  { value: 'OFFICIAL', label: 'Official' },
  { value: 'STAFF', label: 'Staff' },
] satisfies Array<{ value: StaffMemberType; label: string }>;

const WAGE_TYPE_OPTIONS = [
  { value: 'HOURLY', label: 'Hourly' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'FLAT_PER_EVENT', label: 'Flat per event' },
] satisfies Array<{ value: CompensationWageType; label: string }>;

const STAFF_SCHEDULE_KIND_OPTIONS = [
  { value: 'STAFF_SHIFT', label: 'Staff hours' },
  { value: 'OFFICIAL_SHIFT', label: 'Official assignment' },
] satisfies Array<{ value: StaffScheduleAssignmentKind; label: string }>;

const DAY_OF_WEEK_OPTIONS = [
  { value: '0', label: 'Mon' },
  { value: '1', label: 'Tue' },
  { value: '2', label: 'Wed' },
  { value: '3', label: 'Thu' },
  { value: '4', label: 'Fri' },
  { value: '5', label: 'Sat' },
  { value: '6', label: 'Sun' },
];

const staffScheduleLocalizer = dateFnsLocalizer({
  format,
  parse: parse as any,
  startOfWeek,
  getDay,
  locales: {} as any,
});

const normalizeRoleKey = (role: Pick<OrganizationRole, 'kind' | 'name' | 'systemKey'> | null | undefined): string => (
  `${role?.systemKey ?? ''} ${role?.kind ?? ''} ${role?.name ?? ''}`.trim().toUpperCase()
);

const statusColor = (status: RoleRosterStatus): 'teal' | 'blue' | 'gray' => {
  if (status === 'active') return 'teal';
  if (status === 'pending') return 'blue';
  return 'gray';
};

const statusLabel = (status: RoleRosterStatus): string => {
  if (status === 'active') return 'Active';
  if (status === 'pending') return 'Pending';
  return 'Declined';
};

const formatTypeLabel = (type: StaffMemberType): string => (
  STAFF_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
);

const getUserCardData = (entry: RoleRosterEntry): UserData | null => (
  entry.user
    ? {
      ...entry.user,
      fullName: entry.fullName,
    }
    : null
);

const normalizePermissionList = (permissions: readonly string[] | undefined): string[] => (
  Array.from(new Set((permissions ?? []).filter((permission): permission is string => typeof permission === 'string')))
);

const roleNameValidationMessage = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Role name is required.';
  }
  if (trimmed.length < 2) {
    return 'Use at least 2 characters.';
  }
  return null;
};

const createDraftRoleId = (): string => `draft_role_${Date.now()}`;

const compensationTargetKey = (targetType: 'ROLE' | 'STAFF', targetId: string): string => `${targetType}:${targetId}`;

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
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/^\$/, ''));
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
};

const dollarsFromCents = (amountCents: number | null | undefined): string => {
  if (!Number.isFinite(amountCents)) {
    return '';
  }
  return (Number(amountCents) / 100).toFixed(2);
};

const formatFinanceDate = (value?: string | null): string => {
  if (!value) {
    return 'No end date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const nextRoundedHour = (): Date => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
};

const minutesFromDate = (date: Date): number => date.getHours() * 60 + date.getMinutes();

const mondayDayOf = (date: Date): number => (date.getDay() + 6) % 7;

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000);

const parseScheduleDate = (value?: string | Date | null): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const formatScheduleDateTime = (value?: string | Date | null): string => {
  const parsed = parseScheduleDate(value);
  if (!parsed) {
    return 'Not scheduled';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatScheduleTime = (value?: string | Date | null): string => {
  const parsed = parseScheduleDate(value);
  if (!parsed) {
    return '';
  }
  return parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatScheduleDuration = (minutes?: number | null): string => {
  if (!Number.isFinite(minutes ?? NaN) || !minutes) {
    return 'Duration pending';
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) {
    return `${remainder} min`;
  }
  if (!remainder) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainder} min`;
};

const getScheduleEntityId = (value: { id?: string; $id?: string } | null | undefined): string => (
  String(value?.id ?? value?.$id ?? '').trim()
);

const scheduleKindLabel = (kind: StaffScheduleAssignmentKind | string | null | undefined): string => (
  kind === 'OFFICIAL_SHIFT' ? 'Official' : 'Staff'
);

const defaultStaffScheduleDraft = (): StaffScheduleDraft => {
  const start = nextRoundedHour();
  const end = addMinutes(start, 120);
  return {
    userId: null,
    assignmentKind: 'STAFF_SHIFT',
    facilityId: null,
    fieldId: null,
    start,
    end,
    repeating: false,
    daysOfWeek: [String(mondayDayOf(start))],
    repeatEnd: null,
    overrideAmount: '',
    notes: '',
  };
};

const calendarRangeForView = (date: Date, view: View): { start: Date; end: Date } => {
  if (view === 'month') {
    return {
      start: startOfWeek(startOfMonth(date)),
      end: endOfWeek(endOfMonth(date)),
    };
  }
  if (view === 'day') {
    return {
      start: startOfDay(date),
      end: endOfDay(date),
    };
  }
  if (view === 'agenda') {
    return {
      start: startOfDay(date),
      end: endOfDay(addDays(date, 30)),
    };
  }
  return {
    start: startOfWeek(date),
    end: endOfWeek(date),
  };
};

const dateWithMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

const buildAssignmentOccurrences = (
  assignment: StaffScheduleAssignment,
  range: { start: Date; end: Date },
): StaffScheduleCalendarEvent[] => {
  const timeSlot = assignment.timeSlot;
  const fallbackStart = parseScheduleDate(assignment.plannedStart);
  const fallbackEnd = parseScheduleDate(assignment.plannedEnd);
  if (!timeSlot?.repeating) {
    const start = fallbackStart ?? parseScheduleDate(timeSlot?.startDate);
    const end = fallbackEnd ?? parseScheduleDate(timeSlot?.endDate);
    if (!start || !end || end.getTime() <= range.start.getTime() || start.getTime() >= range.end.getTime()) {
      return [];
    }
    return [{
      id: assignment.id,
      title: assignment.userName,
      start,
      end,
      resource: assignment,
    }];
  }

  const scheduleStart = parseScheduleDate(timeSlot.startDate);
  if (!scheduleStart) {
    return [];
  }
  const scheduleEnd = parseScheduleDate(timeSlot.endDate);
  const days = Array.isArray(timeSlot.daysOfWeek) && timeSlot.daysOfWeek.length
    ? timeSlot.daysOfWeek
    : [mondayDayOf(scheduleStart)];
  const startMinutes = typeof timeSlot.startTimeMinutes === 'number'
    ? timeSlot.startTimeMinutes
    : minutesFromDate(scheduleStart);
  const endMinutes = typeof timeSlot.endTimeMinutes === 'number'
    ? timeSlot.endTimeMinutes
    : startMinutes + Math.max(30, assignment.plannedMinutes ?? 60);
  const events: StaffScheduleCalendarEvent[] = [];
  let cursor = startOfDay(range.start);
  while (cursor.getTime() <= range.end.getTime()) {
    const day = mondayDayOf(cursor);
    if (
      days.includes(day)
      && cursor.getTime() >= startOfDay(scheduleStart).getTime()
      && (!scheduleEnd || cursor.getTime() <= endOfDay(scheduleEnd).getTime())
    ) {
      const start = dateWithMinutes(cursor, startMinutes);
      const end = dateWithMinutes(cursor, endMinutes);
      if (end.getTime() > range.start.getTime() && start.getTime() < range.end.getTime()) {
        events.push({
          id: `${assignment.id}-${start.toISOString()}`,
          title: assignment.userName,
          start,
          end,
          resource: assignment,
        });
      }
    }
    cursor = addDays(cursor, 1);
  }
  return events;
};

const scheduleOccurrenceKey = (event: StaffScheduleCalendarEvent): string => (
  `${event.start.getTime()}-${event.end.getTime()}`
);

const buildVisibleScheduleEvents = (
  assignments: StaffScheduleAssignment[],
  range: { start: Date; end: Date },
): StaffScheduleCalendarEvent[] => {
  const events = assignments.flatMap((assignment) => buildAssignmentOccurrences(assignment, range));
  const childEventsByParentId = new Map<string, Set<string>>();
  events.forEach((event) => {
    const parentId = event.resource.parentAssignmentId;
    if (!parentId) {
      return;
    }
    const keys = childEventsByParentId.get(parentId) ?? new Set<string>();
    keys.add(scheduleOccurrenceKey(event));
    childEventsByParentId.set(parentId, keys);
  });
  return events.filter((event) => {
    if (event.resource.parentAssignmentId) {
      return true;
    }
    return !(childEventsByParentId.get(event.resource.id)?.has(scheduleOccurrenceKey(event)));
  });
};

const compensationRateStatus = (rate: CompensationRate, now = new Date()): 'current' | 'scheduled' | 'expired' => {
  const effectiveFrom = new Date(rate.effectiveFrom);
  const effectiveTo = rate.effectiveTo ? new Date(rate.effectiveTo) : null;
  if (!Number.isNaN(effectiveFrom.getTime()) && effectiveFrom.getTime() > now.getTime()) {
    return 'scheduled';
  }
  if (effectiveTo && !Number.isNaN(effectiveTo.getTime()) && effectiveTo.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'current';
};

const pickPrimaryCompensationRate = (rates: CompensationRate[]): CompensationRate | null => {
  const now = new Date();
  return rates.find((rate) => compensationRateStatus(rate, now) === 'current') ?? rates[0] ?? null;
};

const defaultCompensationDraft = (rate: CompensationRate | null): CompensationDraft => ({
  wageType: rate?.wageType ?? 'HOURLY',
  amount: rate ? dollarsFromCents(rate.amountCents) : '',
  effectiveFrom: dateInputValue(),
  effectiveTo: '',
});

const formatCompensationRate = (rate: CompensationRate | null): string => {
  if (!rate) {
    return 'No active rate';
  }
  const suffix = {
    HOURLY: '/hr',
    SALARY: '/yr',
    FLAT_PER_EVENT: '/event',
  }[rate.wageType];
  return `${formatBillAmount(rate.amountCents)}${suffix}`;
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

export default function RoleRosterManager({
  rosterEntries,
  searchValue,
  onSearchChange,
  searchResults,
  searchLoading,
  searchError,
  onAddExisting,
  inviteRows,
  onInviteRowsChange,
  inviteError,
  inviting,
  staffRoles,
  onSendInvites,
  onRemoveFromRoster,
  onRoleChange,
  onCreateRole,
  onUpdateRole,
  organizationId,
  canManageCompensation = false,
}: RoleRosterManagerProps) {
  const [managerView, setManagerView] = useState<ManagerView>('staff');
  const [inviteMode, setInviteMode] = useState<'existing' | 'email'>('existing');
  const [rosterQuery, setRosterQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RoleRosterStatus>('all');
  const [existingInviteRoleId, setExistingInviteRoleId] = useState<string | null>(null);
  const [roleNameDrafts, setRoleNameDrafts] = useState<Record<string, string>>({});
  const [roleNameErrors, setRoleNameErrors] = useState<Record<string, string | null>>({});
  const [rolePermissionDrafts, setRolePermissionDrafts] = useState<Record<string, string[]>>({});
  const [roleUpdateErrors, setRoleUpdateErrors] = useState<Record<string, string | null>>({});
  const [updatingRoleIds, setUpdatingRoleIds] = useState<string[]>([]);
  const [savingRosterRoleUserIds, setSavingRosterRoleUserIds] = useState<string[]>([]);
  const [rosterRoleSelections, setRosterRoleSelections] = useState<Record<string, string | null>>({});
  const [draftRole, setDraftRole] = useState<DraftRole | null>(null);
  const [compensationRates, setCompensationRates] = useState<CompensationRatesResponse>({ roleRates: [], staffRates: [] });
  const [compensationLoading, setCompensationLoading] = useState(false);
  const [compensationError, setCompensationError] = useState<string | null>(null);
  const [compensationInfo, setCompensationInfo] = useState<string | null>(null);
  const [compensationDrafts, setCompensationDrafts] = useState<Record<string, CompensationDraft>>({});
  const [compensationTargetErrors, setCompensationTargetErrors] = useState<Record<string, string | null>>({});
  const [savingCompensationKeys, setSavingCompensationKeys] = useState<string[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<StaffScheduleAssignment[]>([]);
  const [scheduleFacilities, setScheduleFacilities] = useState<StaffScheduleFacility[]>([]);
  const [scheduleFields, setScheduleFields] = useState<StaffScheduleField[]>([]);
  const [scheduleStaffMembers, setScheduleStaffMembers] = useState<StaffScheduleStaffMember[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleInfo, setScheduleInfo] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<StaffScheduleDraft>(() => defaultStaffScheduleDraft());
  const [scheduleCalendarDate, setScheduleCalendarDate] = useState<Date>(() => new Date());
  const [scheduleCalendarView, setScheduleCalendarView] = useState<View>('week');
  const [assigningOpenOccurrence, setAssigningOpenOccurrence] = useState<StaffScheduleOpenOccurrence>(null);
  const [coverageAssignUserId, setCoverageAssignUserId] = useState<string | null>(null);
  const [coverageAssignOverrideAmount, setCoverageAssignOverrideAmount] = useState<string | number>('');
  const rosterRoleSaveSequenceRef = useRef<Record<string, number>>({});

  const roleOptions = useMemo(
    () => staffRoles.map((role) => ({ value: role.$id, label: role.name })),
    [staffRoles],
  );
  const defaultInviteRoleId = useMemo(() => {
    const staffRole = staffRoles.find((role) => normalizeRoleKey(role).includes('STAFF'));
    return staffRole?.$id ?? staffRoles[0]?.$id ?? null;
  }, [staffRoles]);

  const permissionColumns = ORGANIZATION_PERMISSION_OPTIONS;
  const rolesTableMinWidth = 280 + permissionColumns.length * 150;
  const managerViewOptions = useMemo(
    () => [
      { label: 'Staff', value: 'staff' },
      { label: 'Roles', value: 'roles' },
      ...(canManageCompensation ? [{ label: 'Compensation', value: 'compensation' }] : []),
    ],
    [canManageCompensation],
  );

  useEffect(() => {
    if (!canManageCompensation && managerView === 'compensation') {
      setManagerView('staff');
    }
  }, [canManageCompensation, managerView]);

  useEffect(() => {
    setRoleNameDrafts((current) => {
      const next: Record<string, string> = {};
      staffRoles.forEach((role) => {
        next[role.$id] = current[role.$id] ?? role.name;
      });
      return next;
    });
    setRolePermissionDrafts((current) => {
      const next: Record<string, string[]> = {};
      staffRoles.forEach((role) => {
        next[role.$id] = current[role.$id] ?? normalizePermissionList(role.permissions);
      });
      return next;
    });
  }, [staffRoles]);

  useEffect(() => {
    setExistingInviteRoleId((current) => (
      current && staffRoles.some((role) => role.$id === current)
        ? current
        : defaultInviteRoleId
    ));
  }, [defaultInviteRoleId, staffRoles]);

  const loadCompensationRates = useCallback(async () => {
    if (!organizationId || !canManageCompensation) {
      setCompensationRates({ roleRates: [], staffRates: [] });
      return;
    }
    setCompensationLoading(true);
    setCompensationError(null);
    try {
      const response = await apiRequest<CompensationRatesResponse>(`/api/organizations/${organizationId}/finance/compensation`);
      setCompensationRates({
        roleRates: Array.isArray(response.roleRates) ? response.roleRates : [],
        staffRates: Array.isArray(response.staffRates) ? response.staffRates : [],
      });
    } catch (error) {
      setCompensationError(messageForError(error, 'Failed to load compensation rates.'));
    } finally {
      setCompensationLoading(false);
    }
  }, [canManageCompensation, organizationId]);

  const loadScheduleAssignments = useCallback(async () => {
    if (!organizationId) {
      setScheduleAssignments([]);
      setScheduleFacilities([]);
      setScheduleFields([]);
      setScheduleStaffMembers([]);
      setScheduleLoaded(false);
      return;
    }
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const response = await apiRequest<StaffScheduleResponse>(`/api/organizations/${organizationId}/staff/schedule`);
      setScheduleAssignments(Array.isArray(response.assignments) ? response.assignments : []);
      setScheduleFacilities(Array.isArray(response.facilities) ? response.facilities : []);
      setScheduleFields(Array.isArray(response.fields) ? response.fields : []);
      setScheduleStaffMembers(Array.isArray(response.staffMembers) ? response.staffMembers : []);
      setScheduleLoaded(true);
    } catch (error) {
      setScheduleError(messageForError(error, 'Failed to load staff schedule.'));
    } finally {
      setScheduleLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (managerView === 'compensation') {
      void loadCompensationRates();
    }
  }, [loadCompensationRates, managerView]);

  useEffect(() => {
    const sourceRoleByUserId = new Map(rosterEntries.map((entry) => [entry.userId, entry.roleId ?? null] as const));
    setRosterRoleSelections((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(current).forEach(([userId, roleId]) => {
        if (!sourceRoleByUserId.has(userId) || sourceRoleByUserId.get(userId) === roleId) {
          delete next[userId];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [rosterEntries]);

  const setRoleUpdating = useCallback((roleId: string, updating: boolean) => {
    setUpdatingRoleIds((current) => {
      if (updating) {
        return current.includes(roleId) ? current : [...current, roleId];
      }
      return current.filter((id) => id !== roleId);
    });
  }, []);

  const setRosterRoleSaving = useCallback((userId: string, saving: boolean) => {
    setSavingRosterRoleUserIds((current) => {
      if (saving) {
        return current.includes(userId) ? current : [...current, userId];
      }
      return current.filter((entry) => entry !== userId);
    });
  }, []);

  const setCompensationSaving = useCallback((targetKey: string, saving: boolean) => {
    setSavingCompensationKeys((current) => {
      if (saving) {
        return current.includes(targetKey) ? current : [...current, targetKey];
      }
      return current.filter((entry) => entry !== targetKey);
    });
  }, []);

  const updateCompensationDraft = useCallback((
    targetKey: string,
    patch: Partial<CompensationDraft>,
    currentRate: CompensationRate | null,
  ) => {
    setCompensationDrafts((current) => ({
      ...current,
      [targetKey]: {
        ...(current[targetKey] ?? defaultCompensationDraft(currentRate)),
        ...patch,
      },
    }));
    setCompensationTargetErrors((current) => ({ ...current, [targetKey]: null }));
    setCompensationInfo(null);
  }, []);

  const updateRosterRole = useCallback(
    async (entry: RoleRosterEntry, roleId: string) => {
      const nextSequence = (rosterRoleSaveSequenceRef.current[entry.userId] ?? 0) + 1;
      rosterRoleSaveSequenceRef.current[entry.userId] = nextSequence;
      setRosterRoleSelections((current) => ({ ...current, [entry.userId]: roleId }));
      setRosterRoleSaving(entry.userId, true);
      try {
        await onRoleChange(entry.userId, roleId);
      } catch {
        if (rosterRoleSaveSequenceRef.current[entry.userId] === nextSequence) {
          setRosterRoleSelections((current) => ({ ...current, [entry.userId]: entry.roleId ?? null }));
        }
      } finally {
        if (rosterRoleSaveSequenceRef.current[entry.userId] === nextSequence) {
          setRosterRoleSaving(entry.userId, false);
        }
      }
    },
    [onRoleChange, setRosterRoleSaving],
  );

  const saveCompensationRate = useCallback(
    async ({
      targetType,
      targetId,
      targetKey,
      currentRate,
    }: {
      targetType: 'ROLE' | 'STAFF';
      targetId: string;
      targetKey: string;
      currentRate: CompensationRate | null;
    }) => {
      if (!organizationId) {
        setCompensationError('Missing organization id.');
        return;
      }
      const draft = compensationDrafts[targetKey] ?? defaultCompensationDraft(currentRate);
      const amountCents = centsFromDollars(draft.amount);
      const effectiveFrom = dateInputToIso(draft.effectiveFrom);
      const effectiveTo = dateInputToIso(draft.effectiveTo);
      if (amountCents <= 0 || !effectiveFrom) {
        setCompensationTargetErrors((current) => ({
          ...current,
          [targetKey]: 'Enter an amount greater than 0 and an effective start date.',
        }));
        return;
      }
      if (effectiveTo && new Date(effectiveTo).getTime() <= new Date(effectiveFrom).getTime()) {
        setCompensationTargetErrors((current) => ({
          ...current,
          [targetKey]: 'End date must be after the start date.',
        }));
        return;
      }

      setCompensationSaving(targetKey, true);
      setCompensationTargetErrors((current) => ({ ...current, [targetKey]: null }));
      setCompensationError(null);
      setCompensationInfo(null);
      try {
        await apiRequest(`/api/organizations/${organizationId}/finance/compensation`, {
          method: 'POST',
          body: {
            targetType,
            targetId,
            wageType: draft.wageType,
            amountCents,
            effectiveFrom,
            effectiveTo,
          },
        });
        setCompensationInfo('Compensation rate saved.');
        setCompensationDrafts((current) => {
          const next = { ...current };
          delete next[targetKey];
          return next;
        });
        await loadCompensationRates();
      } catch (error) {
        setCompensationTargetErrors((current) => ({
          ...current,
          [targetKey]: messageForError(error, 'Failed to save compensation rate.'),
        }));
      } finally {
        setCompensationSaving(targetKey, false);
      }
    },
    [compensationDrafts, loadCompensationRates, organizationId, setCompensationSaving],
  );

  const updateRoleDefinition = useCallback(
    async (roleId: string, data: { name?: string; permissions?: string[] }) => {
      setRoleUpdating(roleId, true);
      setRoleUpdateErrors((current) => ({ ...current, [roleId]: null }));
      try {
        await onUpdateRole(roleId, data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update role.';
        setRoleUpdateErrors((current) => ({ ...current, [roleId]: message }));
        const role = staffRoles.find((entry) => entry.$id === roleId);
        if (role && data.permissions) {
          setRolePermissionDrafts((current) => ({ ...current, [roleId]: normalizePermissionList(role.permissions) }));
        }
      } finally {
        setRoleUpdating(roleId, false);
      }
    },
    [onUpdateRole, setRoleUpdating, staffRoles],
  );

  useEffect(() => {
    if (!staffRoles.length) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const nextErrors: Record<string, string | null> = {};
      staffRoles.forEach((role) => {
        if (role.isSystem) {
          return;
        }
        const draftName = roleNameDrafts[role.$id] ?? role.name;
        const validationMessage = roleNameValidationMessage(draftName);
        nextErrors[role.$id] = validationMessage;
        const nextName = draftName.trim();
        if (!validationMessage && nextName !== role.name) {
          void updateRoleDefinition(role.$id, { name: nextName });
        }
      });
      setRoleNameErrors((current) => ({ ...current, ...nextErrors }));
    }, ROLE_NAME_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [roleNameDrafts, staffRoles, updateRoleDefinition]);

  useEffect(() => {
    if (!draftRole || draftRole.isCreating) {
      return undefined;
    }

    const validationMessage = roleNameValidationMessage(draftRole.name);
    if (validationMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const name = draftRole.name.trim();
      setDraftRole((current) => (
        current?.clientId === draftRole.clientId
          ? { ...current, isCreating: true, error: null }
          : current
      ));
      try {
        await onCreateRole(name, draftRole.permissions);
        setDraftRole((current) => (current?.clientId === draftRole.clientId ? null : current));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create role.';
        setDraftRole((current) => (
          current?.clientId === draftRole.clientId
            ? { ...current, isCreating: false, error: message }
            : current
        ));
      }
    }, ROLE_NAME_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    draftRole?.clientId,
    draftRole?.isCreating,
    draftRole?.name,
    draftRole?.permissions,
    onCreateRole,
  ]);

  const filteredRosterEntries = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return rosterEntries.filter((entry) => {
      const selectedRoleId = Object.prototype.hasOwnProperty.call(rosterRoleSelections, entry.userId)
        ? rosterRoleSelections[entry.userId]
        : entry.roleId ?? null;
      if (roleFilter !== 'all' && selectedRoleId !== roleFilter) {
        return false;
      }
      if (statusFilter !== 'all' && entry.status !== statusFilter) {
        return false;
      }
      if (!query.length) {
        return true;
      }
      return entry.fullName.toLowerCase().includes(query)
        || (entry.userName ?? '').toLowerCase().includes(query)
        || (entry.email ?? '').toLowerCase().includes(query)
        || (entry.subtitle ?? '').toLowerCase().includes(query);
    });
  }, [roleFilter, rosterEntries, rosterQuery, rosterRoleSelections, statusFilter]);

  const rosterCounts = useMemo(
    () => ({
      active: rosterEntries.filter((entry) => entry.status === 'active').length,
      pending: rosterEntries.filter((entry) => entry.status === 'pending').length,
      declined: rosterEntries.filter((entry) => entry.status === 'declined').length,
    }),
    [rosterEntries],
  );

  const roleRatesByRoleId = useMemo(() => {
    const grouped = new Map<string, CompensationRate[]>();
    compensationRates.roleRates.forEach((rate) => {
      if (!rate.organizationRoleId) {
        return;
      }
      grouped.set(rate.organizationRoleId, [...(grouped.get(rate.organizationRoleId) ?? []), rate]);
    });
    return grouped;
  }, [compensationRates.roleRates]);

  const staffRatesByStaffMemberId = useMemo(() => {
    const grouped = new Map<string, CompensationRate[]>();
    compensationRates.staffRates.forEach((rate) => {
      if (!rate.staffMemberId) {
        return;
      }
      grouped.set(rate.staffMemberId, [...(grouped.get(rate.staffMemberId) ?? []), rate]);
    });
    return grouped;
  }, [compensationRates.staffRates]);

  const staffCompensationEntries = useMemo(
    () => rosterEntries.filter((entry) => Boolean(entry.staffMemberId) && entry.status === 'active' && !entry.locked),
    [rosterEntries],
  );

  const scheduleAssignableStaffMembers = useMemo(
    () => scheduleStaffMembers.filter((entry) => entry.userId && entry.staffMemberId),
    [scheduleStaffMembers],
  );

  const scheduleUserOptionsForKind = useCallback(
    (assignmentKind: StaffScheduleAssignmentKind) => scheduleAssignableStaffMembers
      .filter((entry) => (
        assignmentKind === 'OFFICIAL_SHIFT'
          ? entry.types.includes('OFFICIAL')
          : true
      ))
      .map((entry) => ({
        value: entry.userId,
        label: `${entry.fullName}${entry.roleName ? ` - ${entry.roleName}` : ''}`,
      })),
    [scheduleAssignableStaffMembers],
  );

  const scheduleUserOptions = useMemo(
    () => scheduleUserOptionsForKind(scheduleDraft.assignmentKind),
    [scheduleDraft.assignmentKind, scheduleUserOptionsForKind],
  );

  const coverageUserOptions = useMemo(
    () => scheduleUserOptionsForKind(assigningOpenOccurrence?.resource.assignmentKind ?? 'STAFF_SHIFT'),
    [assigningOpenOccurrence?.resource.assignmentKind, scheduleUserOptionsForKind],
  );

  const facilityOptions = useMemo(
    () => scheduleFacilities.map((facility) => ({
      value: getScheduleEntityId(facility),
      label: facility.name?.trim() || facility.location?.trim() || 'Facility',
    })).filter((option) => option.value),
    [scheduleFacilities],
  );

  const filteredScheduleFields = useMemo(
    () => scheduleFields.filter((field) => (
      !scheduleDraft.facilityId || field.facilityId === scheduleDraft.facilityId
    )),
    [scheduleDraft.facilityId, scheduleFields],
  );

  const fieldOptions = useMemo(
    () => filteredScheduleFields.map((field) => ({
      value: getScheduleEntityId(field),
      label: field.name?.trim() || 'Resource',
    })).filter((option) => option.value),
    [filteredScheduleFields],
  );

  const scheduleCalendarRange = useMemo(
    () => calendarRangeForView(scheduleCalendarDate, scheduleCalendarView),
    [scheduleCalendarDate, scheduleCalendarView],
  );

  const scheduleCalendarEvents = useMemo(
    () => buildVisibleScheduleEvents(scheduleAssignments, scheduleCalendarRange),
    [scheduleAssignments, scheduleCalendarRange],
  );

  const scheduleColorReferences = useMemo(
    () => buildUniqueColorReferenceList(scheduleAssignableStaffMembers.map((entry) => entry.userId)),
    [scheduleAssignableStaffMembers],
  );

  useEffect(() => {
    setScheduleDraft((current) => {
      if (current.userId && scheduleUserOptions.some((option) => option.value === current.userId)) {
        return current;
      }
      return {
        ...current,
        userId: null,
      };
    });
  }, [scheduleUserOptions]);

  useEffect(() => {
    setCoverageAssignUserId((current) => (
      current && coverageUserOptions.some((option) => option.value === current)
        ? current
        : null
    ));
  }, [coverageUserOptions]);

  const toggleRolePermission = useCallback(
    (role: OrganizationRole, permission: string, checked: boolean) => {
      const currentPermissions = rolePermissionDrafts[role.$id] ?? normalizePermissionList(role.permissions);
      const nextPermissions = checked
        ? normalizePermissionList([...currentPermissions, permission])
        : currentPermissions.filter((entry) => entry !== permission);
      setRolePermissionDrafts((current) => ({ ...current, [role.$id]: nextPermissions }));
      void updateRoleDefinition(role.$id, { permissions: nextPermissions });
    },
    [rolePermissionDrafts, updateRoleDefinition],
  );

  const handleAddRoleRow = useCallback(() => {
    setManagerView('roles');
    setDraftRole((current) => (
      current ?? {
        clientId: createDraftRoleId(),
        name: '',
        permissions: [],
        error: 'Role name is required.',
        isCreating: false,
      }
    ));
  }, []);

  const createScheduleAssignment = useCallback(async () => {
    if (!organizationId) {
      setScheduleError('Missing organization id.');
      return;
    }
    if (!scheduleDraft.start || !scheduleDraft.end) {
      setScheduleError('Choose a valid start and end time.');
      return;
    }
    if (scheduleDraft.end.getTime() <= scheduleDraft.start.getTime()) {
      setScheduleError('End time must be after the start time.');
      return;
    }
    const overrideAmountCents = scheduleDraft.overrideAmount === ''
      ? null
      : centsFromDollars(scheduleDraft.overrideAmount);
    if (overrideAmountCents !== null && overrideAmountCents <= 0) {
      setScheduleError('Override amount must be greater than 0.');
      return;
    }

    const daysOfWeek = scheduleDraft.repeating
      ? scheduleDraft.daysOfWeek.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [mondayDayOf(scheduleDraft.start)];
    if (scheduleDraft.repeating && !daysOfWeek.length) {
      setScheduleError('Choose at least one repeat day.');
      return;
    }

    setScheduleSaving(true);
    setScheduleError(null);
    setScheduleInfo(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/staff/schedule`, {
        method: 'POST',
        body: {
          userId: scheduleDraft.userId || null,
          assignmentKind: scheduleDraft.assignmentKind,
          facilityId: scheduleDraft.facilityId,
          fieldId: scheduleDraft.fieldId,
          rateOverrideType: overrideAmountCents ? 'HOURLY' : null,
          rateOverrideCents: overrideAmountCents,
          notes: scheduleDraft.notes,
          timeSlot: {
            startDate: scheduleDraft.start.toISOString(),
            endDate: scheduleDraft.repeating
              ? scheduleDraft.repeatEnd?.toISOString() ?? null
              : scheduleDraft.end.toISOString(),
            repeating: scheduleDraft.repeating,
            daysOfWeek,
            startTimeMinutes: minutesFromDate(scheduleDraft.start),
            endTimeMinutes: minutesFromDate(scheduleDraft.end),
          },
        },
      });
      setScheduleInfo('Staff assignment added.');
      setScheduleDraft((current) => ({
        ...defaultStaffScheduleDraft(),
        assignmentKind: current.assignmentKind,
        userId: null,
      }));
      await loadScheduleAssignments();
    } catch (error) {
      setScheduleError(messageForError(error, 'Failed to add staff assignment.'));
    } finally {
      setScheduleSaving(false);
    }
  }, [loadScheduleAssignments, organizationId, scheduleDraft]);

  const closeAssignOpenOccurrence = useCallback(() => {
    setAssigningOpenOccurrence(null);
    setCoverageAssignUserId(null);
    setCoverageAssignOverrideAmount('');
  }, []);

  const assignOpenOccurrence = useCallback(async () => {
    if (!organizationId || !assigningOpenOccurrence) {
      setScheduleError('Missing assignment context.');
      return;
    }
    if (!coverageAssignUserId) {
      setScheduleError('Choose a staff member for this coverage.');
      return;
    }
    const overrideAmountCents = coverageAssignOverrideAmount === ''
      ? null
      : centsFromDollars(coverageAssignOverrideAmount);
    if (overrideAmountCents !== null && overrideAmountCents <= 0) {
      setScheduleError('Override amount must be greater than 0.');
      return;
    }

    setScheduleSaving(true);
    setScheduleError(null);
    setScheduleInfo(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/staff/schedule`, {
        method: 'POST',
        body: {
          parentAssignmentId: assigningOpenOccurrence.resource.id,
          userId: coverageAssignUserId,
          rateOverrideType: overrideAmountCents ? 'HOURLY' : null,
          rateOverrideCents: overrideAmountCents,
          timeSlot: {
            startDate: assigningOpenOccurrence.start.toISOString(),
            endDate: assigningOpenOccurrence.end.toISOString(),
            repeating: false,
            daysOfWeek: [mondayDayOf(assigningOpenOccurrence.start)],
            startTimeMinutes: minutesFromDate(assigningOpenOccurrence.start),
            endTimeMinutes: minutesFromDate(assigningOpenOccurrence.end),
          },
        },
      });
      setScheduleInfo('Coverage assigned.');
      closeAssignOpenOccurrence();
      await loadScheduleAssignments();
    } catch (error) {
      setScheduleError(messageForError(error, 'Failed to assign coverage.'));
    } finally {
      setScheduleSaving(false);
    }
  }, [
    assigningOpenOccurrence,
    closeAssignOpenOccurrence,
    coverageAssignOverrideAmount,
    coverageAssignUserId,
    loadScheduleAssignments,
    organizationId,
  ]);

  const renderInvitePanel = () => (
    <Paper withBorder p="md" radius="md" className="org-tab-item">
      <Stack gap="sm">
        <Stack gap={2}>
          <Title order={6}>Invite Staff</Title>
          <Text size="sm" c="dimmed">
            Invite existing users or send email invites with one staff role.
          </Text>
        </Stack>

        <SegmentedControl
          fullWidth
          value={inviteMode}
          onChange={(value) => setInviteMode(value as typeof inviteMode)}
          data={[
            { label: 'Add existing', value: 'existing' },
            { label: 'Email invite', value: 'email' },
          ]}
        />

        {inviteMode === 'existing' ? (
          <Stack gap="sm">
            <Select
              label="Role"
              data={roleOptions}
              value={existingInviteRoleId}
              onChange={(value) => {
                setExistingInviteRoleId(value);
              }}
              searchable={roleOptions.length > 8}
              allowDeselect={false}
            />
            <TextInput
              value={searchValue}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Search staff by name or username"
            />
            {searchError ? (
              <Text size="xs" c="red">
                {searchError}
              </Text>
            ) : null}
            {searchLoading ? (
              <Text size="sm" c="dimmed">
                Searching staff...
              </Text>
            ) : searchValue.length < 2 ? (
              <Text size="sm" c="dimmed">
                Type at least 2 characters to search.
              </Text>
            ) : searchResults.length > 0 ? (
              <Stack gap="xs">
                {searchResults.map((result) => (
                  <Paper key={result.$id} withBorder p="sm" radius="md" className="org-tab-nested-item">
                    <Group justify="space-between" align="center" gap="sm">
                      <UserCard
                        user={result}
                        className="!p-0 !shadow-none flex-1"
                      />
                      <Button
                        size="xs"
                        disabled={!existingInviteRoleId}
                        onClick={() => {
                          const role = staffRoles.find((entry) => entry.$id === existingInviteRoleId) ?? null;
                          if (existingInviteRoleId) {
                            onAddExisting(result, existingInviteRoleId, getStaffMemberTypesForOrganizationRole(role));
                          }
                        }}
                      >
                        Invite
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                No users found.
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap="sm">
            {inviteRows.map((invite, index) => (
              <Paper key={index} withBorder radius="md" p="sm" className="org-tab-nested-item">
                <SimpleGrid cols={1} spacing="sm">
                  <TextInput
                    label="First name"
                    placeholder="First name"
                    value={invite.firstName}
                    onChange={(event) => {
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        firstName: event.currentTarget.value,
                      };
                      onInviteRowsChange(next);
                    }}
                  />
                  <TextInput
                    label="Last name"
                    placeholder="Last name"
                    value={invite.lastName}
                    onChange={(event) => {
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        lastName: event.currentTarget.value,
                      };
                      onInviteRowsChange(next);
                    }}
                  />
                </SimpleGrid>
                <SimpleGrid cols={1} spacing="sm" mt="sm">
                  <TextInput
                    label="Email"
                    placeholder="name@example.com"
                    value={invite.email}
                    onChange={(event) => {
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        email: event.currentTarget.value,
                      };
                      onInviteRowsChange(next);
                    }}
                  />
                  <Select
                    label="Role"
                    data={roleOptions}
                    value={invite.roleId ?? defaultInviteRoleId}
                    onChange={(value) => {
                      const role = staffRoles.find((entry) => entry.$id === value) ?? null;
                      const next = [...inviteRows];
                      next[index] = {
                        ...invite,
                        roleId: value,
                        types: getStaffMemberTypesForOrganizationRole(role),
                      };
                      onInviteRowsChange(next);
                    }}
                    searchable={roleOptions.length > 8}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                {inviteRows.length > 1 ? (
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      onClick={() => onInviteRowsChange(inviteRows.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </Button>
                  </Group>
                ) : null}
              </Paper>
            ))}
            <Group justify="space-between" align="center">
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={() =>
                  onInviteRowsChange([
                    ...inviteRows,
                    {
                      firstName: '',
                      lastName: '',
                      email: '',
                      types: ['STAFF'],
                      roleId: defaultInviteRoleId,
                    },
                  ])
                }
              >
                Add row
              </Button>
              <Button
                onClick={onSendInvites}
                loading={inviting}
                disabled={inviting}
              >
                Send invites
              </Button>
            </Group>
            {inviteError ? (
              <Text size="xs" c="red">
                {inviteError}
              </Text>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Paper>
  );

  const renderFiltersPanel = () => (
    <Paper withBorder p="md" radius="md" className="org-tab-item">
      <Stack gap="sm">
        <Stack gap={2}>
          <Title order={6}>Filters</Title>
          <Text size="sm" c="dimmed">
            Narrow the staff list by role or invite status.
          </Text>
        </Stack>

        <TextInput
          label="Search"
          placeholder="Name or username"
          value={rosterQuery}
          onChange={(event) => setRosterQuery(event.currentTarget.value)}
        />

        <Select
          label="Role"
          data={[{ value: 'all', label: 'All roles' }, ...roleOptions]}
          value={roleFilter}
          onChange={(value: string | null) => setRoleFilter(value ?? 'all')}
          allowDeselect={false}
          searchable={roleOptions.length > 8}
        />

        <Select
          label="Status"
          data={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
            { value: 'declined', label: 'Declined' },
          ]}
          value={statusFilter}
          onChange={(value: string | null) => setStatusFilter((value as 'all' | RoleRosterStatus | null) ?? 'all')}
          allowDeselect={false}
        />

        <Button
          variant="default"
          onClick={() => {
            setRosterQuery('');
            setRoleFilter('all');
            setStatusFilter('all');
          }}
        >
          Clear filters
        </Button>
      </Stack>
    </Paper>
  );

  const renderRateSummary = (rate: CompensationRate | null) => {
    if (!rate) {
      return (
        <Stack gap={4}>
          <Text size="sm" fw={600}>No active rate</Text>
          <Text size="xs" c="dimmed">No compensation history</Text>
        </Stack>
      );
    }
    const status = compensationRateStatus(rate);
    const statusColorMap = {
      current: 'teal',
      scheduled: 'blue',
      expired: 'gray',
    } satisfies Record<ReturnType<typeof compensationRateStatus>, string>;
    return (
      <Stack gap={4}>
        <Group gap={6}>
          <Text size="sm" fw={700}>{formatCompensationRate(rate)}</Text>
          <Badge size="xs" variant="light" color={statusColorMap[status]}>
            {status}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {formatFinanceDate(rate.effectiveFrom)} - {formatFinanceDate(rate.effectiveTo)}
        </Text>
      </Stack>
    );
  };

  const renderCompensationControls = ({
    targetKey,
    currentRate,
    amountLabel,
    saveLabel,
    onSave,
  }: {
    targetKey: string;
    currentRate: CompensationRate | null;
    amountLabel: string;
    saveLabel: string;
    onSave: () => void;
  }) => {
    const draft = compensationDrafts[targetKey] ?? defaultCompensationDraft(currentRate);
    const targetError = compensationTargetErrors[targetKey] ?? null;
    const isSaving = savingCompensationKeys.includes(targetKey);

    return (
      <Stack gap="xs">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="xs">
          <Select
            label="Type"
            data={WAGE_TYPE_OPTIONS}
            value={draft.wageType}
            onChange={(value) => updateCompensationDraft(
              targetKey,
              { wageType: (value as CompensationWageType | null) ?? 'HOURLY' },
              currentRate,
            )}
            allowDeselect={false}
            aria-label={`${amountLabel} wage type`}
          />
          <NumberInput
            label="Amount"
            prefix="$"
            decimalScale={2}
            min={0}
            value={draft.amount}
            onChange={(value) => updateCompensationDraft(targetKey, { amount: value }, currentRate)}
            aria-label={`${amountLabel} amount`}
          />
          <TextInput
            label="Starts"
            type="date"
            value={draft.effectiveFrom}
            onChange={(event) => updateCompensationDraft(
              targetKey,
              { effectiveFrom: event.currentTarget.value },
              currentRate,
            )}
            aria-label={`${amountLabel} effective start`}
          />
          <TextInput
            label="Ends"
            type="date"
            value={draft.effectiveTo}
            onChange={(event) => updateCompensationDraft(
              targetKey,
              { effectiveTo: event.currentTarget.value },
              currentRate,
            )}
            aria-label={`${amountLabel} effective end`}
          />
        </SimpleGrid>
        <Group justify="space-between" align="center">
          <Text size="xs" c={targetError ? 'red' : 'dimmed'}>
            {targetError ?? 'Saving creates a new effective-dated history row.'}
          </Text>
          <Button size="xs" onClick={onSave} loading={isSaving}>
            {saveLabel}
          </Button>
        </Group>
      </Stack>
    );
  };

  const renderCompensationView = () => {
    if (!canManageCompensation) {
      return (
        <Alert color="yellow" radius="md">
          Staff compensation requires staff management and billing management access.
        </Alert>
      );
    }

    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" gap="md">
          <Stack gap={2}>
            <Title order={6}>Compensation</Title>
            <Text size="sm" c="dimmed">
              Set role defaults and individual staff overrides with effective dates.
            </Text>
          </Stack>
          <Button variant="light" onClick={() => void loadCompensationRates()} loading={compensationLoading}>
            Refresh
          </Button>
        </Group>

        {compensationError ? (
          <Alert color="red" radius="md" onClose={() => setCompensationError(null)} withCloseButton>
            {compensationError}
          </Alert>
        ) : null}
        {compensationInfo ? (
          <Alert color="green" radius="md" onClose={() => setCompensationInfo(null)} withCloseButton>
            {compensationInfo}
          </Alert>
        ) : null}

        {compensationLoading && compensationRates.roleRates.length === 0 && compensationRates.staffRates.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center" className="org-tab-item">
            <Group justify="center" gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading compensation rates...</Text>
            </Group>
          </Paper>
        ) : (
          <>
            <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <Table withColumnBorders highlightOnHover miw={940}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ minWidth: 200 }}>Role default</Table.Th>
                      <Table.Th style={{ minWidth: 180 }}>Current rate</Table.Th>
                      <Table.Th style={{ minWidth: 520 }}>New rate</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {staffRoles.map((role) => {
                      const roleRates = roleRatesByRoleId.get(role.$id) ?? [];
                      const currentRate = pickPrimaryCompensationRate(roleRates);
                      const targetKey = compensationTargetKey('ROLE', role.$id);
                      return (
                        <Table.Tr key={role.$id}>
                          <Table.Td>
                            <Stack gap={4}>
                              <Text size="sm" fw={700}>{role.name}</Text>
                              <Text size="xs" c="dimmed">
                                {role.kind.toLowerCase()}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>{renderRateSummary(currentRate)}</Table.Td>
                          <Table.Td>
                            {renderCompensationControls({
                              targetKey,
                              currentRate,
                              amountLabel: `${role.name} default`,
                              saveLabel: 'Save default',
                              onSave: () => void saveCompensationRate({
                                targetType: 'ROLE',
                                targetId: role.$id,
                                targetKey,
                                currentRate,
                              }),
                            })}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>
            </Paper>

            <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <Table withColumnBorders highlightOnHover miw={980}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ minWidth: 220 }}>Staff override</Table.Th>
                      <Table.Th style={{ minWidth: 180 }}>Current override</Table.Th>
                      <Table.Th style={{ minWidth: 540 }}>New override</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {staffCompensationEntries.length > 0 ? (
                      staffCompensationEntries.map((entry) => {
                        const staffMemberId = entry.staffMemberId as string;
                        const staffRates = staffRatesByStaffMemberId.get(staffMemberId) ?? [];
                        const currentRate = pickPrimaryCompensationRate(staffRates);
                        const targetKey = compensationTargetKey('STAFF', staffMemberId);
                        return (
                          <Table.Tr key={entry.id}>
                            <Table.Td>
                              <Stack gap={4}>
                                <Text size="sm" fw={700}>{entry.fullName}</Text>
                                <Text size="xs" c="dimmed">
                                  {entry.roleName ?? 'No role'}
                                </Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>{renderRateSummary(currentRate)}</Table.Td>
                            <Table.Td>
                              {renderCompensationControls({
                                targetKey,
                                currentRate,
                                amountLabel: `${entry.fullName} override`,
                                saveLabel: 'Save override',
                                onSave: () => void saveCompensationRate({
                                  targetType: 'STAFF',
                                  targetId: staffMemberId,
                                  targetKey,
                                  currentRate,
                                }),
                              })}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Text size="sm" c="dimmed" ta="center">
                            Active staff members can receive individual overrides after they are added to the roster.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </div>
            </Paper>
          </>
        )}
      </Stack>
    );
  };

  const renderScheduleEvent = ({ event }: EventProps<StaffScheduleCalendarEvent>) => {
    const assignment = event.resource;
    const locationParts = [
      assignment.facilityName,
      assignment.fieldName,
    ].filter((value): value is string => Boolean(value));
    const isOpenParent = !assignment.userId && !assignment.parentAssignmentId;
    return (
      <SharedCalendarEvent
        title={event.title}
        subtitle={locationParts.join(' - ') || scheduleKindLabel(assignment.assignmentKind)}
        meta={`${formatScheduleTime(event.start)} - ${formatScheduleTime(event.end)}`}
        colorReferenceList={scheduleColorReferences}
        colorMatchKey={assignment.userId ?? assignment.id}
        colorSeed={assignment.userId ?? assignment.id}
        variant={isOpenParent ? 'availability' : assignment.assignmentKind === 'OFFICIAL_SHIFT' ? 'reservation' : 'default'}
        compact={scheduleCalendarView === 'month'}
        onClick={isOpenParent ? () => {
          setAssigningOpenOccurrence(event);
          setCoverageAssignUserId(null);
          setCoverageAssignOverrideAmount('');
        } : undefined}
      />
    );
  };

  const renderScheduleView = () => (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" gap="md">
        <Stack gap={2}>
          <Title order={6}>Schedule</Title>
          <Text size="sm" c="dimmed">
            Add open or assigned staff coverage with optional facility, resource, and rate overrides.
          </Text>
        </Stack>
        <Button variant="light" onClick={() => void loadScheduleAssignments()} loading={scheduleLoading}>
          Refresh
        </Button>
      </Group>

      {scheduleError ? (
        <Alert color="red" radius="md" onClose={() => setScheduleError(null)} withCloseButton>
          {scheduleError}
        </Alert>
      ) : null}
      {scheduleInfo ? (
        <Alert color="green" radius="md" onClose={() => setScheduleInfo(null)} withCloseButton>
          {scheduleInfo}
        </Alert>
      ) : null}

      <Modal
        opened={Boolean(assigningOpenOccurrence)}
        onClose={closeAssignOpenOccurrence}
        title="Assign coverage"
        centered
      >
        <Stack gap="sm">
          <Stack gap={2}>
            <Text size="sm" fw={700}>
              {assigningOpenOccurrence?.resource.facilityName ?? 'Any facility'}
              {assigningOpenOccurrence?.resource.fieldName ? ` - ${assigningOpenOccurrence.resource.fieldName}` : ''}
            </Text>
            <Text size="sm" c="dimmed">
              {formatScheduleDateTime(assigningOpenOccurrence?.start)} - {formatScheduleTime(assigningOpenOccurrence?.end)}
            </Text>
          </Stack>

          <Select
            label={assigningOpenOccurrence?.resource.assignmentKind === 'OFFICIAL_SHIFT' ? 'Official' : 'Staff member'}
            data={coverageUserOptions}
            value={coverageAssignUserId}
            onChange={setCoverageAssignUserId}
            placeholder={assigningOpenOccurrence?.resource.assignmentKind === 'OFFICIAL_SHIFT' ? 'Select an official' : 'Select staff'}
            searchable={coverageUserOptions.length > 8}
            disabled={!coverageUserOptions.length}
            allowDeselect={false}
          />

          <NumberInput
            label="Override rate"
            description="Optional hourly override for this staffed occurrence."
            prefix="$"
            decimalScale={2}
            min={0}
            value={coverageAssignOverrideAmount}
            onChange={setCoverageAssignOverrideAmount}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAssignOpenOccurrence} disabled={scheduleSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => void assignOpenOccurrence()}
              loading={scheduleSaving}
              disabled={!coverageAssignUserId || scheduleSaving}
            >
              Assign
            </Button>
          </Group>
        </Stack>
      </Modal>

      <div className="staff-schedule-layout">
        <Paper withBorder radius="md" p="md" className="org-tab-item" h="fit-content">
          <Stack gap="sm">
            <Stack gap={2}>
              <Title order={6}>Add Coverage</Title>
              <Text size="sm" c="dimmed">
                Create an open shift, or assign staff for the full timeslot. Costs fall back to the staff member rate.
              </Text>
            </Stack>

            <Select
              label="Assignment"
              data={STAFF_SCHEDULE_KIND_OPTIONS}
              value={scheduleDraft.assignmentKind}
              onChange={(value) => {
                setScheduleDraft((current) => ({
                  ...current,
                  assignmentKind: (value as StaffScheduleAssignmentKind | null) ?? 'STAFF_SHIFT',
                  userId: null,
                }));
              }}
              allowDeselect={false}
            />

            <Select
              label="Assigned staff"
              description="Leave blank to create open coverage that can be assigned from the calendar."
              data={scheduleUserOptions}
              value={scheduleDraft.userId}
              onChange={(value) => setScheduleDraft((current) => ({ ...current, userId: value }))}
              placeholder={scheduleDraft.assignmentKind === 'OFFICIAL_SHIFT' ? 'Open official shift' : 'Open staff shift'}
              searchable={scheduleUserOptions.length > 8}
              disabled={!scheduleUserOptions.length}
              clearable
            />

            <Select
              label="Facility"
              data={facilityOptions}
              value={scheduleDraft.facilityId}
              onChange={(value) => {
                setScheduleDraft((current) => {
                  const nextField = current.fieldId
                    && scheduleFields.some((field) => getScheduleEntityId(field) === current.fieldId && field.facilityId === value)
                    ? current.fieldId
                    : null;
                  return {
                    ...current,
                    facilityId: value,
                    fieldId: nextField,
                  };
                });
              }}
              placeholder="Any facility"
              clearable
              searchable={facilityOptions.length > 8}
            />

            <Select
              label="Resource"
              data={fieldOptions}
              value={scheduleDraft.fieldId}
              onChange={(value) => {
                const selectedField = scheduleFields.find((field) => getScheduleEntityId(field) === value);
                setScheduleDraft((current) => ({
                  ...current,
                  fieldId: value,
                  facilityId: selectedField?.facilityId ?? current.facilityId,
                }));
              }}
              placeholder={scheduleDraft.facilityId ? 'Any resource in facility' : 'Any resource'}
              clearable
              searchable={fieldOptions.length > 8}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <DateTimePicker
                label="Start"
                valueFormat="MM/DD/YYYY hh:mm A"
                value={scheduleDraft.start}
                onChange={(value) => {
                  const nextStart = parseScheduleDate(value as Date | string | null);
                  if (!nextStart) return;
                  setScheduleDraft((current) => ({
                    ...current,
                    start: nextStart,
                    end: current.end && current.end.getTime() > nextStart.getTime()
                      ? current.end
                      : addMinutes(nextStart, 120),
                    daysOfWeek: current.repeating ? current.daysOfWeek : [String(mondayDayOf(nextStart))],
                  }));
                }}
                timePickerProps={{ withDropdown: true, format: '12h' }}
              />
              <DateTimePicker
                label={scheduleDraft.repeating ? 'End time' : 'End'}
                valueFormat="MM/DD/YYYY hh:mm A"
                value={scheduleDraft.end}
                onChange={(value) => {
                  const nextEnd = parseScheduleDate(value as Date | string | null);
                  if (!nextEnd) return;
                  setScheduleDraft((current) => ({ ...current, end: nextEnd }));
                }}
                timePickerProps={{ withDropdown: true, format: '12h' }}
              />
            </SimpleGrid>

            <Switch
              label="Repeats weekly"
              checked={scheduleDraft.repeating}
              onChange={(event) => {
                const repeating = event.currentTarget.checked;
                setScheduleDraft((current) => ({
                  ...current,
                  repeating,
                  daysOfWeek: current.start ? [String(mondayDayOf(current.start))] : current.daysOfWeek,
                  repeatEnd: repeating ? current.repeatEnd : null,
                }));
              }}
            />

            {scheduleDraft.repeating ? (
              <Stack gap="sm">
                <MultiSelect
                  label="Repeat days"
                  data={DAY_OF_WEEK_OPTIONS}
                  value={scheduleDraft.daysOfWeek}
                  onChange={(value) => setScheduleDraft((current) => ({ ...current, daysOfWeek: value }))}
                  placeholder="Choose days"
                />
                <DateTimePicker
                  label="Repeat until"
                  valueFormat="MM/DD/YYYY"
                  value={scheduleDraft.repeatEnd}
                  onChange={(value) => {
                    const repeatEnd = parseScheduleDate(value as Date | string | null);
                    setScheduleDraft((current) => ({ ...current, repeatEnd }));
                  }}
                  clearable
                />
              </Stack>
            ) : null}

            <NumberInput
              label="Override rate"
              description="Optional hourly override for this assignment."
              prefix="$"
              decimalScale={2}
              min={0}
              value={scheduleDraft.overrideAmount}
              onChange={(value) => setScheduleDraft((current) => ({ ...current, overrideAmount: value }))}
            />

            <Textarea
              label="Notes"
              minRows={2}
              autosize
              value={scheduleDraft.notes}
              onChange={(event) => setScheduleDraft((current) => ({ ...current, notes: event.currentTarget.value }))}
            />

            <Button
              onClick={() => void createScheduleAssignment()}
              loading={scheduleSaving}
              disabled={scheduleSaving}
            >
              Add coverage
            </Button>
          </Stack>
        </Paper>

        <Stack gap="md" miw={0}>
          <Paper withBorder radius="md" p="sm" className="org-tab-item shared-calendar-shell staff-schedule-calendar-shell">
            {scheduleLoading && !scheduleLoaded ? (
              <Group justify="center" gap="sm" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Loading staff schedule...</Text>
              </Group>
            ) : (
              <BigCalendar<StaffScheduleCalendarEvent>
                localizer={staffScheduleLocalizer}
                events={scheduleCalendarEvents}
                startAccessor="start"
                endAccessor="end"
                date={scheduleCalendarDate}
                view={scheduleCalendarView}
                views={['month', 'week', 'day', 'agenda']}
                onNavigate={setScheduleCalendarDate}
                onView={(view) => setScheduleCalendarView(view)}
                onSelectEvent={(event) => {
                  if (!event.resource.userId && !event.resource.parentAssignmentId) {
                    setAssigningOpenOccurrence(event);
                    setCoverageAssignUserId(null);
                    setCoverageAssignOverrideAmount('');
                  }
                }}
                components={{
                  event: renderScheduleEvent,
                }}
                style={{ minHeight: 620 }}
                popup
              />
            )}
          </Paper>

          <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <Table highlightOnHover miw={760}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Assignment</Table.Th>
                    <Table.Th>Scope</Table.Th>
                    <Table.Th>Timeslot</Table.Th>
                    <Table.Th>Cost</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {scheduleAssignments.length > 0 ? (
                    scheduleAssignments.slice(0, 12).map((assignment) => (
                      <Table.Tr key={assignment.id}>
                        <Table.Td>
                          <Stack gap={4}>
                            <Group gap={6}>
                              <Text size="sm" fw={700}>{assignment.userName}</Text>
                              <Badge size="xs" variant="light" color={assignment.assignmentKind === 'OFFICIAL_SHIFT' ? 'orange' : 'blue'}>
                                {scheduleKindLabel(assignment.assignmentKind)}
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                              {formatScheduleDuration(assignment.plannedMinutes)}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm">{assignment.facilityName ?? 'Any facility'}</Text>
                            <Text size="xs" c="dimmed">{assignment.fieldName ?? 'Any resource'}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm">
                              {assignment.timeSlot?.repeating ? 'Repeats weekly' : 'One time'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {formatScheduleDateTime(assignment.plannedStart)} - {formatScheduleTime(assignment.plannedEnd)}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={assignment.rateOverrideCents ? undefined : 'dimmed'}>
                            {assignment.rateOverrideCents
                              ? `${formatBillAmount(assignment.rateOverrideCents)}/hr override`
                              : 'Staff rate'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          No staff assignments have been added yet.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </div>
          </Paper>
        </Stack>
      </div>
    </Stack>
  );

  const renderStaffView = () => (
    <div className="staff-roster-layout">
      <Stack gap="md" h="fit-content">
        {renderInvitePanel()}
        {renderFiltersPanel()}
      </Stack>

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={6}>Roster</Title>
          <Text size="sm" c="dimmed">
            {`${filteredRosterEntries.length} shown - ${rosterCounts.active} active - ${rosterCounts.pending} pending - ${rosterCounts.declined} declined`}
          </Text>
        </Stack>

        {filteredRosterEntries.length > 0 ? (
          <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <Table withColumnBorders highlightOnHover miw={760}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Staff Member</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th style={{ width: 140 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredRosterEntries.map((entry) => {
                    const userCardData = getUserCardData(entry);
                    const selectedRoleId = Object.prototype.hasOwnProperty.call(rosterRoleSelections, entry.userId)
                      ? rosterRoleSelections[entry.userId]
                      : entry.roleId ?? null;
                    const isSavingRosterRole = savingRosterRoleUserIds.includes(entry.userId);
                    const secondaryParts = [
                      entry.userName ? `@${entry.userName}` : null,
                      entry.email ?? null,
                    ].filter((value): value is string => Boolean(value));

                    return (
                      <Table.Tr key={entry.id}>
                        <Table.Td>
                          {userCardData ? (
                            <Stack gap={4}>
                              <UserCard
                                user={userCardData}
                                className="!p-0 !shadow-none !bg-transparent"
                              />
                              {entry.email ? (
                                <Text size="xs" c="dimmed">
                                  {entry.email}
                                </Text>
                              ) : null}
                              {entry.subtitle ? (
                                <Text size="xs" c="dimmed">
                                  {entry.subtitle}
                                </Text>
                              ) : null}
                            </Stack>
                          ) : (
                            <>
                              <Text fw={600}>{entry.fullName}</Text>
                              {secondaryParts.length > 0 ? (
                                <Text size="xs" c="dimmed">
                                  {secondaryParts.join(' - ')}
                                </Text>
                              ) : null}
                            </>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {!entry.locked ? (
                            <Select
                              data={roleOptions}
                              value={selectedRoleId ?? null}
                              onChange={(value) => {
                                if (value) {
                                  void updateRosterRole(entry, value);
                                }
                              }}
                              placeholder="Select role"
                              searchable={roleOptions.length > 8}
                              allowDeselect={false}
                              rightSection={isSavingRosterRole ? <Loader size="xs" aria-label="Saving role" /> : undefined}
                              rightSectionPointerEvents="none"
                            />
                          ) : (
                            <Group gap={6}>
                              <Text size="sm" c={entry.roleName ? undefined : 'dimmed'}>
                                {entry.roleName ?? 'No role'}
                              </Text>
                              {entry.types.map((type) => (
                                <Badge key={`${entry.id}-${type}`} variant="light">
                                  {formatTypeLabel(type)}
                                </Badge>
                              ))}
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge radius="xl" variant="light" color={statusColor(entry.status)}>
                            {statusLabel(entry.status)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {entry.canRemove === false ? (
                            <Text size="xs" c="dimmed">Locked</Text>
                          ) : (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              onClick={() => onRemoveFromRoster(entry.userId)}
                            >
                              Remove
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </div>
          </Paper>
        ) : (
          <Paper withBorder p="lg" radius="md" className="org-tab-item" style={{ textAlign: 'center' }}>
            <Stack gap="xs" align="center">
              <Title order={6}>No matching staff</Title>
              <Text size="sm" c="dimmed">
                Adjust your filters or use Invite Staff to add someone new.
              </Text>
            </Stack>
          </Paper>
        )}
      </Stack>
    </div>
  );

  const renderRoleNameCell = (role: OrganizationRole) => {
    const draftName = roleNameDrafts[role.$id] ?? role.name;
    const rowError = roleNameErrors[role.$id] || roleUpdateErrors[role.$id] || null;
    const isUpdating = updatingRoleIds.includes(role.$id);
    return (
      <Stack gap={4}>
        <TextInput
          value={draftName}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setRoleNameDrafts((current) => ({ ...current, [role.$id]: value }));
            setRoleNameErrors((current) => ({ ...current, [role.$id]: roleNameValidationMessage(value) }));
          }}
          disabled={role.isSystem}
          error={rowError}
          aria-label={`${role.name} role name`}
        />
        {role.isSystem ? (
          <Text size="xs" c="dimmed">
            System role
          </Text>
        ) : isUpdating ? (
          <Text size="xs" c="dimmed">
            Updating...
          </Text>
        ) : null}
      </Stack>
    );
  };

  const renderRolesView = () => (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" gap="md">
        <Stack gap={2}>
          <Title order={6}>Roles</Title>
          <Text size="sm" c="dimmed">
            Edit role names and permissions. Changes are applied automatically.
          </Text>
        </Stack>
      </Group>

      <Paper withBorder radius="md" className="org-tab-item" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <Table withColumnBorders highlightOnHover miw={rolesTableMinWidth}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 260 }}>Role name</Table.Th>
                {permissionColumns.map((permission) => (
                  <Table.Th key={permission.value} style={{ minWidth: 150, textAlign: 'center' }}>
                    <Text size="xs" fw={700}>
                      {permission.label}
                    </Text>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {staffRoles.map((role) => {
                const permissions = rolePermissionDrafts[role.$id] ?? normalizePermissionList(role.permissions);
                const isUpdating = updatingRoleIds.includes(role.$id);
                return (
                  <Table.Tr key={role.$id}>
                    <Table.Td>{renderRoleNameCell(role)}</Table.Td>
                    {permissionColumns.map((permission) => (
                      <Table.Td key={`${role.$id}-${permission.value}`} style={{ textAlign: 'center' }}>
                        <Checkbox
                          aria-label={`${role.name} ${permission.label}`}
                          checked={permissions.includes(permission.value)}
                          disabled={isUpdating}
                          onChange={(event) => toggleRolePermission(role, permission.value, event.currentTarget.checked)}
                        />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
              {draftRole ? (
                <Table.Tr>
                  <Table.Td>
                    <TextInput
                      value={draftRole.name}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraftRole((current) => (
                          current
                            ? {
                              ...current,
                              name: value,
                              error: current.error && roleNameValidationMessage(value)
                                ? roleNameValidationMessage(value)
                                : null,
                            }
                            : current
                        ));
                      }}
                      placeholder="Role name"
                      error={draftRole.error ?? roleNameValidationMessage(draftRole.name)}
                      disabled={draftRole.isCreating}
                      aria-label="New role name"
                      autoFocus
                    />
                    {draftRole.isCreating ? (
                      <Text size="xs" c="dimmed" mt={4}>
                        Creating...
                      </Text>
                    ) : null}
                  </Table.Td>
                  {permissionColumns.map((permission) => (
                    <Table.Td key={`${draftRole.clientId}-${permission.value}`} style={{ textAlign: 'center' }}>
                      <Checkbox
                        aria-label={`New role ${permission.label}`}
                        checked={draftRole.permissions.includes(permission.value)}
                        disabled={draftRole.isCreating}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setDraftRole((current) => {
                            if (!current) return current;
                            const permissions = checked
                              ? normalizePermissionList([...current.permissions, permission.value])
                              : current.permissions.filter((entry) => entry !== permission.value);
                            return { ...current, permissions };
                          });
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ) : null}
              <Table.Tr className="role-add-row">
                <Table.Td colSpan={permissionColumns.length + 1}>
                  <Button
                    variant="subtle"
                    leftSection={<Plus size={16} aria-hidden="true" />}
                    onClick={handleAddRoleRow}
                  >
                    Add role
                  </Button>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
      </Paper>
    </Stack>
  );

  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <Stack gap={2}>
            <Title order={5}>Staff List</Title>
            <Text size="sm" c="dimmed">
              Manage organization hosts, officials, and staff access in one roster.
            </Text>
          </Stack>
          <SegmentedControl
            value={managerView}
            onChange={(value) => setManagerView(value as ManagerView)}
            data={managerViewOptions}
          />
        </Group>

        {managerView === 'staff'
          ? renderStaffView()
          : managerView === 'roles'
            ? renderRolesView()
            : renderCompensationView()}
      </Stack>
    </Paper>
  );
}
