import { functions } from '@/app/appwrite';
import { ExecutionMethod } from 'appwrite';

const FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!;

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

const parseExecutionResponse = <T = unknown>(
  responseBody: string | null | undefined,
): T => {
  if (!responseBody) {
    return {} as T;
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch (error) {
    throw new Error('Unable to parse Appwrite function response.');
  }
};

class RegistrationService {
  async registerSelfForEvent(eventId: string): Promise<RegistrationResponse> {
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: `/events/${eventId}/registrations/self`,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ eventId }),
      async: false,
    });

    const result = parseExecutionResponse<RegistrationResponse>(response.responseBody);
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }

  async registerChildForEvent(eventId: string, childId: string): Promise<RegistrationResponse> {
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: `/events/${eventId}/registrations/child`,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ eventId, childId }),
      async: false,
    });

    const result = parseExecutionResponse<RegistrationResponse>(response.responseBody);
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

export const registrationService = new RegistrationService();
