import type { Event, Organization, RegistrationQuestionDraft, UserData } from '@/types';

export type DefaultLocation = {
    location?: string;
    address?: string;
    coordinates?: [number, number];
};

export type RentalPurchaseContext = {
    start: string;
    end: string;
    fieldId?: string;
    organization?: Organization | null;
    organizationEmail?: string | null;
    priceCents?: number;
    requiredTemplateIds?: string[];
};

export interface EventFormProps {
    isOpen?: boolean;
    onClose?: () => void;
    currentUser: UserData;
    event: Event;
    organization: Organization | null;
    immutableDefaults?: Partial<Event>;
    formId?: string;
    defaultLocation?: DefaultLocation;
    isCreateMode?: boolean;
    rentalPurchase?: RentalPurchaseContext;
    templateOrganizationId?: string;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    onDraftStateChange?: (state: {
        draft: Partial<Event>;
        baselineDraft: Partial<Event>;
    }) => void;
}

export type EventFormHandle = {
    getDraft: () => Partial<Event>;
    getRegistrationQuestionDrafts: () => RegistrationQuestionDraft[];
    validate: () => Promise<boolean>;
    getValidationErrors: () => Array<{ path: string; message: string }>;
    validatePendingStaffAssignments: () => Promise<void>;
    commitDirtyBaseline: () => void;
    submitPendingStaffInvites: (eventId: string) => Promise<void>;
};
