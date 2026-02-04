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
  status?: ConsentStatus;
  parentSignLink?: string;
  childSignLink?: string;
};

type RegistrationResponse = {
  registration?: EventRegistration;
  consent?: ConsentLinks;
  error?: string;
};

class RegistrationService {
  async registerSelfForEvent(eventId: string): Promise<RegistrationResponse> {
    const result = await apiRequest<RegistrationResponse>(`/api/events/${eventId}/registrations/self`, {
      method: 'POST',
      body: { eventId },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }

  async registerChildForEvent(eventId: string, childId: string): Promise<RegistrationResponse> {
    const result = await apiRequest<RegistrationResponse>(`/api/events/${eventId}/registrations/child`, {
      method: 'POST',
      body: { eventId, childId },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

export const registrationService = new RegistrationService();
