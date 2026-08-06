import { apiRequest } from '@/lib/apiClient';

export type FeedbackSubmissionType = 'BUG' | 'IDEA' | 'GENERAL';

export type FeedbackEntrySource =
  | 'desktop_header'
  | 'mobile_menu'
  | 'standalone_page';

export type CreateFeedbackRequest = {
  type: FeedbackSubmissionType;
  message: string;
  additionalContext?: string;
  allowContact: boolean;
  contactEmail?: string;
  sourcePath?: string;
  clientContext?: {
    surface: 'WEB';
    viewportWidth?: number;
    viewportHeight?: number;
  };
  companyWebsite?: string;
};

export type CreateFeedbackResponse = {
  ok: true;
  submission: {
    id: string;
    status: 'NEW';
    createdAt: string;
  };
};

export async function createFeedbackSubmission(
  input: CreateFeedbackRequest,
): Promise<CreateFeedbackResponse> {
  return apiRequest<CreateFeedbackResponse>('/api/feedback', {
    method: 'POST',
    body: input,
  });
}
