import type { TimeSlot } from '@/types';
import type {
  FacilityCalendarFeedItem,
  FacilityCalendarFeedItemType,
  FieldCalendarEntry,
} from '../fieldCalendar';

export type SelectionState = {
  fieldIds: string[];
  start: Date;
  end: Date;
};

export type ManagerCalendarSelectionMode = 'rental' | 'staff_assignment' | 'official_assignment';

export type ManagerCalendarDraftRentalOptions = {
  repeating?: boolean;
  dayOfWeek?: NonNullable<TimeSlot['dayOfWeek']>;
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  price?: number;
  requiredTemplateIds?: string[];
  hostRequiredTemplateIds?: string[];
};

export type ManagerCalendarDraftStaffOptions = {
  userId?: string | null;
  userName?: string | null;
  parentDraftId?: string | null;
  rateOverrideCents?: number | null;
  notes?: string;
  repeating?: boolean;
  daysOfWeek?: number[];
  repeatEndDate?: string | null;
};

export type ManagerCalendarDraft = {
  id: string;
  mode: ManagerCalendarSelectionMode;
  fieldIds: string[];
  start: Date;
  end: Date;
  rental?: ManagerCalendarDraftRentalOptions;
  staff?: ManagerCalendarDraftStaffOptions;
};

export type StaffScheduleAssignmentKind = 'STAFF_SHIFT' | 'OFFICIAL_SHIFT';

export type StaffScheduleStaffMember = {
  staffMemberId: string;
  userId: string;
  fullName: string;
  userName?: string | null;
  types?: string[];
  roleName?: string | null;
};

export type StaffScheduleTimeSlot = {
  startDate: string;
  endDate?: string | null;
  repeating: boolean;
  dayOfWeek?: number | null;
  daysOfWeek?: number[] | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  timeZone?: string | null;
};

export type StaffScheduleAssignment = {
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
  timeSlot?: StaffScheduleTimeSlot | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  rateOverrideType?: string | null;
  rateOverrideCents?: number | null;
  status?: string | null;
  notes?: string | null;
};

export type RentalSlotDragUpdate = Partial<TimeSlot> & {
  $id: string;
  dayOfWeek: NonNullable<TimeSlot['dayOfWeek']>;
};

export type ManagerRentalSlotPendingUpdate = {
  key: string;
  fieldId: string;
  slotId: string;
} & (
  | { action: 'update'; slot: RentalSlotDragUpdate }
  | { action: 'delete' }
);

export type ManagerStaffAssignmentPendingOverride =
  | { action: 'create'; assignment: StaffScheduleAssignment }
  | { action: 'update'; assignment: StaffScheduleAssignment }
  | { action: 'unassign'; assignmentId: string }
  | { action: 'delete'; assignmentId: string };

export type ManagerStaffAssignmentPendingOverrideBatch = Record<string, {
  previous: ManagerStaffAssignmentPendingOverride | null;
  next: ManagerStaffAssignmentPendingOverride;
}>;

export type ManagerCalendarPendingChange =
  | { id: string; type: 'create_draft'; label: string; draft: ManagerCalendarDraft }
  | { id: string; type: 'draft_update'; label: string; draftId: string; previous: ManagerCalendarDraft; next: ManagerCalendarDraft }
  | { id: string; type: 'draft_scope'; label: string; draftId: string; previous: ManagerCalendarDraft; parentNext: ManagerCalendarDraft; childDraft: ManagerCalendarDraft }
  | { id: string; type: 'rental_update'; label: string; key: string; previous: ManagerRentalSlotPendingUpdate | null; next: ManagerRentalSlotPendingUpdate }
  | { id: string; type: 'staff_override'; label: string; assignmentId: string; previous: ManagerStaffAssignmentPendingOverride | null; next: ManagerStaffAssignmentPendingOverride }
  | { id: string; type: 'staff_override_batch'; label: string; changes: ManagerStaffAssignmentPendingOverrideBatch };

export type BuildStaffAssignmentCalendarRangeOptions = {
  preserveRepeatingPattern?: boolean;
};

export type OpenStaffDeleteScope = 'following' | 'all';

export type OpenStaffDeleteConfirmationState = {
  assignmentId: string;
  occurrenceStart: string;
  occurrenceEnd: string;
  scope: OpenStaffDeleteScope;
};

export type StaffAssignmentScopePromptState =
  | {
      source: 'assignment';
      parentAssignment: StaffScheduleAssignment;
      parentOverride: ManagerStaffAssignmentPendingOverride;
      childOverride: ManagerStaffAssignmentPendingOverride;
      staffName: string;
      occurrenceLabel: string;
      kindLabel: 'staff' | 'official';
    }
  | {
      source: 'draft';
      draftId: string;
      previousDraft: ManagerCalendarDraft;
      allDraft: ManagerCalendarDraft;
      parentDraft: ManagerCalendarDraft;
      childDraft: ManagerCalendarDraft;
      staffName: string;
      occurrenceLabel: string;
      kindLabel: 'staff' | 'official';
    };

export type ManagerDraftDragState = {
  draftId: string;
  draft: ManagerCalendarDraft;
  fieldIds: string[];
  durationMs: number;
  startPoint: { clientX: number; clientY: number };
  lastPoint: { clientX: number; clientY: number };
  hasMoved: boolean;
};

export type SelectionCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: {
    type: 'selection';
    slotKey?: string;
    mode?: ManagerCalendarSelectionMode;
    userId?: string | null;
  };
  metaType: 'selection';
  selectionMode?: ManagerCalendarSelectionMode;
  fieldName: string;
};

export type FacilityFeedCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: FacilityCalendarFeedItem;
  metaType: 'facility-feed';
  feedType: FacilityCalendarFeedItemType;
  fieldName: string;
};

export type CalendarEventData = FieldCalendarEntry | FacilityFeedCalendarEntry | SelectionCalendarEntry;

export type RentalDraftSelection = {
  key: string;
  scheduledFieldIds: string[];
  dayOfWeek?: number;
  daysOfWeek: number[];
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  startDate?: string;
  endDate?: string;
  repeating: boolean;
};

export type RentalSelectionCheckoutSelection = {
  key: string;
  scheduledFieldIds: string[];
  dayOfWeek: number;
  daysOfWeek: number[];
  startTimeMinutes: number;
  endTimeMinutes: number;
  startDate: string;
  endDate: string;
  repeating: boolean;
};

export type RentalSelectionCheckoutPayload = {
  eventId: string;
  manageEventUrl: string;
  organizationId: string | null;
  organizationName: string;
  renterOrganizationId: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityLocation: string | null;
  facilityAddress: string | null;
  totalRentalCents: number;
  rentalStart: string;
  rentalEnd: string;
  rentalSelections: RentalSelectionCheckoutSelection[];
  fieldIds: string[];
  primaryFieldId: string | null;
  primaryFieldName: string | null;
  location: string;
  coordinates?: [number, number];
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
};

export type RentalSelectionValidation = {
  selection: RentalDraftSelection;
  totalCents: number;
  totalHours: number;
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
  conflictCount: number;
  conflictCheckPending: boolean;
  errors: string[];
};

export type RentalSelectionConflictState = {
  signature: string;
  conflictCount: number;
  loading: boolean;
  error: string | null;
};

export type StaffScheduleResponse = {
  assignments?: StaffScheduleAssignment[];
  staffMembers?: StaffScheduleStaffMember[];
};

export type StaffScheduleCreateResponse = {
  assignment?: StaffScheduleAssignment;
};

export type StaffScheduleUpdateResponse = {
  assignment?: StaffScheduleAssignment;
};
