export type DeleteOrArchiveAction = 'deleted' | 'archived' | 'deactivated';

export type DeleteOrArchiveReference = {
  type: string;
  count: number;
};

export type DeleteOrArchiveResult = {
  deleted?: boolean;
  archived?: boolean;
  deactivated?: boolean;
  action?: DeleteOrArchiveAction;
  entityType?: string;
  entityId?: string;
  references?: DeleteOrArchiveReference[];
  error?: string;
};

export const deleteOutcomeSucceeded = (result: DeleteOrArchiveResult | null | undefined): boolean => {
  if (!result) {
    return true;
  }
  const hasOutcome = 'deleted' in result || 'archived' in result || 'deactivated' in result || 'action' in result;
  if (!hasOutcome) {
    return true;
  }
  return Boolean(result.deleted || result.archived || result.deactivated || result.action);
};

export const describeDeleteOutcome = (
  result: DeleteOrArchiveResult | null | undefined,
  labels: {
    deleted: string;
    archived?: string;
    deactivated?: string;
    fallback: string;
  },
): string => {
  if (result?.archived || result?.action === 'archived') {
    return labels.archived ?? labels.fallback;
  }
  if (result?.deactivated || result?.action === 'deactivated') {
    return labels.deactivated ?? labels.fallback;
  }
  if (result?.deleted || result?.action === 'deleted') {
    return labels.deleted;
  }
  return labels.fallback;
};
