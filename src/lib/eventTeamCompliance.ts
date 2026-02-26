import {
  getSignerContextLabel,
  normalizeRequiredSignerType,
  normalizeSignerContext,
  type SignerContext,
} from '@/lib/templateSignerTypes';

export type ComplianceTemplate = {
  id: string;
  title?: string | null;
  type?: string | null;
  signOnce?: boolean | null;
  requiredSignerType?: string | null;
};

export type UserComplianceContext = {
  userId: string;
  isChildRegistration: boolean;
  parentUserId?: string | null;
};

export type RequiredSignatureTask = {
  templateId: string;
  templateTitle: string;
  templateType: 'PDF' | 'TEXT';
  signerContext: SignerContext;
  signerLabel: string;
  signerUserId: string | null;
  hostUserId: string | null;
  signOnce: boolean;
};

export type TeamCompliancePaymentSummary = {
  hasBill: boolean;
  billId: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  status: string | null;
  isPaidInFull: boolean;
  inheritedFromTeamBill?: boolean;
};

export type TeamComplianceRequiredDocument = {
  key: string;
  templateId: string;
  title: string;
  type: 'PDF' | 'TEXT';
  signerContext: SignerContext;
  signerLabel: string;
  signOnce: boolean;
  status: 'SIGNED' | 'UNSIGNED';
  signedDocumentRecordId?: string;
  signedAt?: string;
};

export type TeamComplianceUserSummary = {
  userId: string;
  fullName: string;
  userName?: string;
  isMinorAtEvent: boolean;
  registrationType: 'ADULT' | 'CHILD';
  payment: TeamCompliancePaymentSummary;
  documents: {
    signedCount: number;
    requiredCount: number;
  };
  requiredDocuments: TeamComplianceRequiredDocument[];
};

export type TeamComplianceSummary = {
  teamId: string;
  teamName: string;
  payment: TeamCompliancePaymentSummary;
  documents: {
    signedCount: number;
    requiredCount: number;
  };
  users: TeamComplianceUserSummary[];
};

export type EventTeamComplianceResponse = {
  teams: TeamComplianceSummary[];
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const isSignedDocumentStatus = (value: unknown): boolean => {
  const normalized = normalizeString(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

export const normalizeSignerRoleContext = (value: unknown): SignerContext => (
  normalizeSignerContext(value, 'participant')
);

export const buildSignatureCompletionKey = (params: {
  templateId: string;
  signerContext: SignerContext;
  hostUserId?: string | null;
  scopeKey: string;
}): string => (
  `${params.scopeKey}|${params.templateId}|${params.signerContext}|${params.hostUserId ?? ''}`
);

export const buildRequiredSignatureTasks = (params: {
  templates: ComplianceTemplate[];
  context: UserComplianceContext;
}): RequiredSignatureTask[] => {
  const tasks: RequiredSignatureTask[] = [];
  const userId = normalizeString(params.context.userId);
  if (!userId) {
    return tasks;
  }
  const parentUserId = normalizeString(params.context.parentUserId);

  params.templates.forEach((template) => {
    if (!template.id) {
      return;
    }
    const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
    const templateType: 'PDF' | 'TEXT' = template.type === 'TEXT' ? 'TEXT' : 'PDF';
    const templateTitle = normalizeString(template.title) ?? 'Required document';
    const signOnce = Boolean(template.signOnce);

    const addTask = (signerContext: SignerContext, signerUserId: string | null, hostUserId: string | null) => {
      tasks.push({
        templateId: template.id,
        templateTitle,
        templateType,
        signerContext,
        signerLabel: getSignerContextLabel(signerContext),
        signerUserId,
        hostUserId,
        signOnce,
      });
    };

    if (requiredSignerType === 'PARTICIPANT') {
      if (!params.context.isChildRegistration) {
        addTask('participant', userId, null);
      }
      return;
    }

    if (!params.context.isChildRegistration) {
      return;
    }

    if (requiredSignerType === 'PARENT_GUARDIAN') {
      addTask('parent_guardian', parentUserId, userId);
      return;
    }

    if (requiredSignerType === 'CHILD') {
      addTask('child', userId, userId);
      return;
    }

    if (requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
      addTask('parent_guardian', parentUserId, userId);
      addTask('child', userId, userId);
    }
  });

  return tasks;
};

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const pickPrimaryBill = <T extends {
  parentBillId?: string | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
}>(
    bills: T[],
): T | null => {
  if (!bills.length) {
    return null;
  }
  const rootBills = bills.filter((bill) => !normalizeString(bill.parentBillId));
  const source = rootBills.length ? rootBills : bills;
  return source.reduce<T>((latest, bill) => {
    const latestTs = Math.max(toTimestamp(latest.updatedAt), toTimestamp(latest.createdAt));
    const nextTs = Math.max(toTimestamp(bill.updatedAt), toTimestamp(bill.createdAt));
    return nextTs > latestTs ? bill : latest;
  }, source[0]);
};
