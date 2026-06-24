"use client";

import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';
import { createId } from '@/lib/id';
import { normalizeFieldIds } from './facilityFormUtils';
import type {
  ManagerCalendarDraft,
  ManagerCalendarPendingChange,
  ManagerRentalSlotPendingUpdate,
  ManagerStaffAssignmentPendingOverride,
  ManagerStaffAssignmentPendingOverrideBatch,
  SelectionState,
} from './facilityCalendarTypes';

const serializeManagerCalendarDraft = (draft: ManagerCalendarDraft) => JSON.stringify({
  ...draft,
  fieldIds: normalizeFieldIds(draft.fieldIds),
  start: new Date(draft.start).toISOString(),
  end: new Date(draft.end).toISOString(),
});

const managerCalendarDraftsAreEqual = (
  first: ManagerCalendarDraft,
  second: ManagerCalendarDraft,
) => serializeManagerCalendarDraft(first) === serializeManagerCalendarDraft(second);

type UseManagerCalendarChangeQueueOptions = {
  setSelection: Dispatch<SetStateAction<SelectionState | null>>;
  setCalendarDate: Dispatch<SetStateAction<Date>>;
};

export function useManagerCalendarChangeQueue({
  setSelection,
  setCalendarDate,
}: UseManagerCalendarChangeQueueOptions) {
  const [managerCalendarEditMode, setManagerCalendarEditMode] = useState(false);
  const [managerCalendarDrafts, setManagerCalendarDrafts] = useState<ManagerCalendarDraft[]>([]);
  const [managerCalendarPendingChanges, setManagerCalendarPendingChanges] = useState<ManagerCalendarPendingChange[]>([]);
  const [managerRentalSlotUpdates, setManagerRentalSlotUpdates] = useState<Record<string, ManagerRentalSlotPendingUpdate>>({});
  const [managerStaffAssignmentOverrides, setManagerStaffAssignmentOverrides] = useState<Record<string, ManagerStaffAssignmentPendingOverride>>({});
  const [managerCalendarDraftsSaving, setManagerCalendarDraftsSaving] = useState(false);
  const [managerDraftDragId, setManagerDraftDragId] = useState<string | null>(null);
  const [selectedManagerDraftId, setSelectedManagerDraftId] = useState<string | null>(null);
  const [editingManagerDraftId, setEditingManagerDraftId] = useState<string | null>(null);

  const managerCalendarPendingChangeCount = managerCalendarPendingChanges.length;

  const stageManagerCalendarDraftCreate = useCallback((
    draft: ManagerCalendarDraft,
    label: string,
  ): ManagerCalendarDraft => {
    const normalizedDraft: ManagerCalendarDraft = {
      ...draft,
      fieldIds: normalizeFieldIds(draft.fieldIds),
      start: new Date(draft.start),
      end: new Date(draft.end),
    };
    setManagerCalendarEditMode(true);
    setSelection({
      fieldIds: normalizeFieldIds(normalizedDraft.fieldIds),
      start: new Date(normalizedDraft.start),
      end: new Date(normalizedDraft.end),
    });
    setCalendarDate(new Date(normalizedDraft.start));
    setSelectedManagerDraftId(normalizedDraft.id);
    setManagerCalendarDrafts((current) => [...current, normalizedDraft]);
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'create_draft',
        label,
        draft: normalizedDraft,
      },
    ]));
    return normalizedDraft;
  }, [setCalendarDate, setSelection]);

  const stageManagerCalendarDraftUpdate = useCallback((
    draftId: string,
    updater: (draft: ManagerCalendarDraft) => ManagerCalendarDraft,
    label = 'Updated draft card',
  ): ManagerCalendarDraft | null => {
    const previous = managerCalendarDrafts.find((draft) => draft.id === draftId) ?? null;
    if (!previous) {
      return null;
    }
    const next = updater({
      ...previous,
      fieldIds: normalizeFieldIds(previous.fieldIds),
      start: new Date(previous.start),
      end: new Date(previous.end),
    });
    const normalizedNext: ManagerCalendarDraft = {
      ...next,
      fieldIds: normalizeFieldIds(next.fieldIds),
      start: new Date(next.start),
      end: new Date(next.end),
    };
    if (managerCalendarDraftsAreEqual(previous, normalizedNext)) {
      return normalizedNext;
    }

    setManagerCalendarEditMode(true);
    setManagerCalendarDrafts((current) => current.map((draft) => (
      draft.id === draftId ? normalizedNext : draft
    )));
    setSelectedManagerDraftId(draftId);
    setSelection({
      fieldIds: normalizeFieldIds(normalizedNext.fieldIds),
      start: new Date(normalizedNext.start),
      end: new Date(normalizedNext.end),
    });
    setCalendarDate(new Date(normalizedNext.start));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'draft_update',
        label,
        draftId,
        previous,
        next: normalizedNext,
      },
    ]));
    return normalizedNext;
  }, [managerCalendarDrafts, setCalendarDate, setSelection]);

  const stageManagerCalendarDraftScope = useCallback((
    draftId: string,
    parentNext: ManagerCalendarDraft,
    childDraft: ManagerCalendarDraft,
    label = 'Assigned draft coverage occurrence',
    previousDraftFallback: ManagerCalendarDraft | null = null,
  ) => {
    const previous = managerCalendarDrafts.find((draft) => draft.id === draftId) ?? previousDraftFallback;
    if (!previous) {
      return false;
    }
    const normalizedParentNext: ManagerCalendarDraft = {
      ...parentNext,
      fieldIds: normalizeFieldIds(parentNext.fieldIds),
      start: new Date(parentNext.start),
      end: new Date(parentNext.end),
    };
    const normalizedChildDraft: ManagerCalendarDraft = {
      ...childDraft,
      fieldIds: normalizeFieldIds(childDraft.fieldIds),
      start: new Date(childDraft.start),
      end: new Date(childDraft.end),
    };
    setManagerCalendarEditMode(true);
    setManagerCalendarDrafts((current) => {
      const hasParentDraft = current.some((draft) => draft.id === draftId);
      const parentDrafts = hasParentDraft
        ? current.map((draft) => (draft.id === draftId ? normalizedParentNext : draft))
        : [...current, normalizedParentNext];
      return [...parentDrafts, normalizedChildDraft];
    });
    setSelectedManagerDraftId(normalizedChildDraft.id);
    setSelection({
      fieldIds: normalizeFieldIds(normalizedChildDraft.fieldIds),
      start: new Date(normalizedChildDraft.start),
      end: new Date(normalizedChildDraft.end),
    });
    setCalendarDate(new Date(normalizedChildDraft.start));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'draft_scope',
        label,
        draftId,
        previous,
        parentNext: normalizedParentNext,
        childDraft: normalizedChildDraft,
      },
    ]));
    return true;
  }, [managerCalendarDrafts, setCalendarDate, setSelection]);

  const stageRentalSlotUpdate = useCallback((
    update: ManagerRentalSlotPendingUpdate,
    label = 'Moved rental slot',
  ) => {
    const previous = managerRentalSlotUpdates[update.key] ?? null;
    setManagerCalendarEditMode(true);
    setManagerRentalSlotUpdates((current) => ({
      ...current,
      [update.key]: update,
    }));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'rental_update',
        label,
        key: update.key,
        previous,
        next: update,
      },
    ]));
  }, [managerRentalSlotUpdates]);

  const stageStaffAssignmentOverride = useCallback((
    assignmentId: string,
    override: ManagerStaffAssignmentPendingOverride,
    label = 'Updated staff assignment',
  ) => {
    const previous = managerStaffAssignmentOverrides[assignmentId] ?? null;
    setManagerCalendarEditMode(true);
    setManagerStaffAssignmentOverrides((current) => ({
      ...current,
      [assignmentId]: override,
    }));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'staff_override',
        label,
        assignmentId,
        previous,
        next: override,
      },
    ]));
  }, [managerStaffAssignmentOverrides]);

  const stageStaffAssignmentOverrideBatch = useCallback((
    updates: Array<{ assignmentId: string; override: ManagerStaffAssignmentPendingOverride }>,
    label = 'Updated staff assignments',
  ) => {
    const normalizedUpdates = new Map<string, ManagerStaffAssignmentPendingOverride>();
    updates.forEach((update) => {
      if (update.assignmentId) {
        normalizedUpdates.set(update.assignmentId, update.override);
      }
    });
    if (!normalizedUpdates.size) {
      return;
    }
    const changes = Array.from(normalizedUpdates.entries()).reduce<ManagerStaffAssignmentPendingOverrideBatch>(
      (acc, [assignmentId, override]) => {
        acc[assignmentId] = {
          previous: managerStaffAssignmentOverrides[assignmentId] ?? null,
          next: override,
        };
        return acc;
      },
      {},
    );
    setManagerCalendarEditMode(true);
    setManagerStaffAssignmentOverrides((current) => {
      const next = { ...current };
      Object.entries(changes).forEach(([assignmentId, change]) => {
        next[assignmentId] = change.next;
      });
      return next;
    });
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'staff_override_batch',
        label,
        changes,
      },
    ]));
  }, [managerStaffAssignmentOverrides]);

  const restorePendingStaffUnassignment = useCallback((assignmentId: string) => {
    const currentOverride = managerStaffAssignmentOverrides[assignmentId];
    if (currentOverride?.action !== 'unassign') {
      return false;
    }

    let replacementOverride: ManagerStaffAssignmentPendingOverride | null = null;
    let changeIdToRemove: string | null = null;
    for (let index = managerCalendarPendingChanges.length - 1; index >= 0; index -= 1) {
      const change = managerCalendarPendingChanges[index];
      if (change.type === 'staff_override' && change.assignmentId === assignmentId && change.next.action === 'unassign') {
        replacementOverride = change.previous;
        changeIdToRemove = change.id;
        break;
      }
      if (change.type === 'staff_override_batch') {
        const batchedChange = change.changes[assignmentId];
        if (batchedChange?.next.action === 'unassign') {
          replacementOverride = batchedChange.previous;
          changeIdToRemove = change.id;
          break;
        }
      }
    }

    setManagerStaffAssignmentOverrides((current) => {
      const next = { ...current };
      if (replacementOverride) {
        next[assignmentId] = replacementOverride;
      } else {
        delete next[assignmentId];
      }
      return next;
    });

    if (changeIdToRemove) {
      setManagerCalendarPendingChanges((current) => current.flatMap((change) => {
        if (change.id !== changeIdToRemove) {
          return [change];
        }
        if (change.type === 'staff_override') {
          return [];
        }
        if (change.type === 'staff_override_batch') {
          const nextChanges = { ...change.changes };
          delete nextChanges[assignmentId];
          return Object.keys(nextChanges).length ? [{ ...change, changes: nextChanges }] : [];
        }
        return [change];
      }));
    }

    return true;
  }, [managerCalendarPendingChanges, managerStaffAssignmentOverrides]);

  const undoLastManagerCalendarChange = useCallback(() => {
    const lastChange = managerCalendarPendingChanges[managerCalendarPendingChanges.length - 1];
    if (!lastChange) {
      return;
    }

    if (lastChange.type === 'create_draft') {
      setManagerCalendarDrafts((current) => current.filter((draft) => draft.id !== lastChange.draft.id));
      if (selectedManagerDraftId === lastChange.draft.id) {
        setSelectedManagerDraftId(null);
      }
      if (editingManagerDraftId === lastChange.draft.id) {
        setEditingManagerDraftId(null);
      }
    } else if (lastChange.type === 'draft_update') {
      setSelectedManagerDraftId(lastChange.draftId);
      setManagerCalendarDrafts((current) => current.map((draft) => (
        draft.id === lastChange.draftId ? lastChange.previous : draft
      )));
      setSelection((current) => {
        if (current?.fieldIds?.some((fieldId) => lastChange.previous.fieldIds.includes(fieldId))) {
          return {
            fieldIds: normalizeFieldIds(lastChange.previous.fieldIds),
            start: new Date(lastChange.previous.start),
            end: new Date(lastChange.previous.end),
          };
        }
        return current;
      });
    } else if (lastChange.type === 'draft_scope') {
      setManagerCalendarDrafts((current) => current
        .filter((draft) => draft.id !== lastChange.childDraft.id)
        .map((draft) => (
          draft.id === lastChange.draftId ? lastChange.previous : draft
        )));
      setSelectedManagerDraftId(lastChange.draftId);
      if (editingManagerDraftId === lastChange.childDraft.id) {
        setEditingManagerDraftId(null);
      }
      setSelection((current) => {
        if (current?.fieldIds?.some((fieldId) => lastChange.previous.fieldIds.includes(fieldId))) {
          return {
            fieldIds: normalizeFieldIds(lastChange.previous.fieldIds),
            start: new Date(lastChange.previous.start),
            end: new Date(lastChange.previous.end),
          };
        }
        return current;
      });
    } else if (lastChange.type === 'rental_update') {
      setManagerRentalSlotUpdates((current) => {
        const next = { ...current };
        if (lastChange.previous) {
          next[lastChange.key] = lastChange.previous;
        } else {
          delete next[lastChange.key];
        }
        return next;
      });
    } else if (lastChange.type === 'staff_override') {
      setManagerStaffAssignmentOverrides((current) => {
        const next = { ...current };
        if (lastChange.previous) {
          next[lastChange.assignmentId] = lastChange.previous;
        } else {
          delete next[lastChange.assignmentId];
        }
        return next;
      });
    } else if (lastChange.type === 'staff_override_batch') {
      setManagerStaffAssignmentOverrides((current) => {
        const next = { ...current };
        Object.entries(lastChange.changes).forEach(([assignmentId, change]) => {
          if (change.previous) {
            next[assignmentId] = change.previous;
          } else {
            delete next[assignmentId];
          }
        });
        return next;
      });
    }

    setManagerCalendarPendingChanges((current) => current.slice(0, -1));
  }, [editingManagerDraftId, managerCalendarPendingChanges, selectedManagerDraftId, setSelection]);

  const clearManagerCalendarPendingState = useCallback(() => {
    setManagerCalendarDrafts([]);
    setManagerCalendarPendingChanges([]);
    setManagerRentalSlotUpdates({});
    setManagerStaffAssignmentOverrides({});
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
  }, []);

  return {
    managerCalendarEditMode,
    setManagerCalendarEditMode,
    managerCalendarDrafts,
    managerCalendarPendingChanges,
    managerCalendarPendingChangeCount,
    managerRentalSlotUpdates,
    managerStaffAssignmentOverrides,
    managerCalendarDraftsSaving,
    setManagerCalendarDraftsSaving,
    managerDraftDragId,
    setManagerDraftDragId,
    selectedManagerDraftId,
    setSelectedManagerDraftId,
    editingManagerDraftId,
    setEditingManagerDraftId,
    stageManagerCalendarDraftCreate,
    stageManagerCalendarDraftUpdate,
    stageManagerCalendarDraftScope,
    stageRentalSlotUpdate,
    stageStaffAssignmentOverride,
    stageStaffAssignmentOverrideBatch,
    restorePendingStaffUnassignment,
    undoLastManagerCalendarChange,
    clearManagerCalendarPendingState,
  };
}
