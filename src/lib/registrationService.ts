import { apiRequest } from '@/lib/apiClient';

export type RegistrationStatus =
  | 'pendingConsent'
  | 'active'
  | 'blocked'
  | 'cancelled'
  | 'consentFailed';

export type ConsentStatus =
  | 'draft'
  | 'sent'
  | 'guardian_approval_required'
  | 'child_email_required'
  | 'guardian_declined'
  | 'parentSigned'
  | 'childSigned'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'error';

export type EventRegistration = {
  id?: string;
  status?: RegistrationStatus;
  consentStatus?: ConsentStatus;
};

export type ConsentLinks = {
  documentId?: string;
  status?: ConsentStatus | string;
  parentSignLink?: string;
  childSignLink?: string;
  childEmail?: string | null;
  requiresChildEmail?: boolean;
};

type RegistrationResponse = {
  registration?: EventRegistration;
  consent?: ConsentLinks;
  requiresParentApproval?: boolean;
  warnings?: string[];
  error?: string;
};

export type DivisionRegistrationSelection = {
  divisionId?: string;
  divisionTypeId?: string;
  divisionTypeKey?: string;
};

class RegistrationService {
  async registerSelfForEvent(
    eventId: string,
    selection: DivisionRegistrationSelection = {},
  ): Promise<RegistrationResponse> {
    const result = await apiRequest<RegistrationResponse>(`/api/events/${eventId}/registrations/self`, {
      method: 'POST',
      body: { eventId, ...selection },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }

  async registerChildForEvent(
    eventId: string,
    childId: string,
    selection: DivisionRegistrationSelection = {},
  ): Promise<RegistrationResponse> {
    const result = await apiRequest<RegistrationResponse>(`/api/events/${eventId}/registrations/child`, {
      method: 'POST',
      body: { eventId, childId, ...selection },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

export const registrationService = new RegistrationService();
