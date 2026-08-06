'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { Copy, Check } from 'lucide-react';
import {
  createFeedbackSubmission,
  type CreateFeedbackRequest,
  type CreateFeedbackResponse,
  type FeedbackEntrySource,
  type FeedbackSubmissionType,
} from '@/lib/feedbackService';
import {
  normalizeFeedbackPathCategory,
  trackFeedbackSubmitted,
} from '@/lib/analytics/feedbackAnalytics';

export type FeedbackFormProps = {
  currentPagePath?: string;
  authenticatedEmail?: string | null;
  entrySource: FeedbackEntrySource;
  draft?: Partial<FeedbackFormDraft>;
  onDraftChange?: (draft: FeedbackFormDraft) => void;
  onSuccess?: (response: CreateFeedbackResponse) => void;
  onCancel?: () => void;
  onDone?: () => void;
};

export type FeedbackFormDraft = {
  type: FeedbackSubmissionType;
  message: string;
  additionalContext: string;
  allowContact: boolean;
  contactEmail: string;
  companyWebsite: string;
};

const initialFormState = (
  authenticatedEmail?: string | null,
  draft?: Partial<FeedbackFormDraft>,
): FeedbackFormDraft => ({
  type: 'GENERAL',
  message: '',
  additionalContext: '',
  allowContact: false,
  contactEmail: authenticatedEmail?.trim() ?? '',
  companyWebsite: '',
  ...draft,
});

const getCurrentPath = (fallback?: string): string => (
  typeof window !== 'undefined' ? window.location.pathname : fallback || '/feedback'
);

export function FeedbackForm({
  currentPagePath,
  authenticatedEmail,
  entrySource,
  draft,
  onDraftChange,
  onSuccess,
  onCancel,
  onDone,
}: FeedbackFormProps) {
  const [form, setForm] = useState<FeedbackFormDraft>(() => initialFormState(authenticatedEmail, draft));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateFeedbackResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const contextLabel = useMemo(() => {
    if (form.type === 'BUG') return 'What did you expect to happen?';
    if (form.type === 'IDEA') return 'What are you trying to accomplish?';
    return null;
  }, [form.type]);

  const updateForm = <K extends keyof FeedbackFormDraft>(key: K, value: FeedbackFormDraft[K]) => {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      onDraftChange?.(next);
      return next;
    });
  };

  const resetForAnother = () => {
    const next = initialFormState(authenticatedEmail);
    setForm(next);
    onDraftChange?.(next);
    setError(null);
    setSuccess(null);
    setCopied(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (form.message.trim().length < 10) {
      setError('Your feedback must contain at least 10 characters.');
      return;
    }
    if (form.message.trim().length > 5000) {
      setError('Your feedback must be 5,000 characters or fewer.');
      return;
    }
    if (form.allowContact && !form.contactEmail.trim()) {
      setError('Enter an email address or turn off contact permission.');
      return;
    }

    const sourcePath = getCurrentPath(currentPagePath);
    const input: CreateFeedbackRequest = {
      type: form.type,
      message: form.message,
      additionalContext: form.additionalContext,
      allowContact: form.allowContact,
      contactEmail: form.allowContact ? form.contactEmail : undefined,
      sourcePath,
      clientContext: {
        surface: 'WEB',
        viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
        viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
      },
      companyWebsite: form.companyWebsite,
    };

    setSubmitting(true);
    try {
      const response = await createFeedbackSubmission(input);
      setSuccess(response);
      trackFeedbackSubmitted({
        type: form.type,
        allowContact: form.allowContact,
        pathCategory: normalizeFeedbackPathCategory(sourcePath),
      });
      onSuccess?.(response);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'We could not send your feedback. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Stack gap="md" data-testid="feedback-confirmation">
        <Alert color="teal" title="Feedback received">
          Thank you. Your feedback was saved and will help us improve BracketIQ.
        </Alert>
        <Paper withBorder radius="md" p="sm" bg="gray.0">
          <Text size="xs" c="dimmed">Confirmation identifier</Text>
          <Group gap="xs" mt={4} wrap="nowrap">
            <Text size="sm" ff="monospace" style={{ overflowWrap: 'anywhere' }}>
              {success.submission.id}
            </Text>
            <Button
              type="button"
              variant="subtle"
              size="compact-xs"
              aria-label="Copy confirmation identifier"
              onClick={() => {
                void navigator.clipboard?.writeText(success.submission.id);
                setCopied(true);
              }}
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            </Button>
          </Group>
        </Paper>
        <Group justify="flex-end">
          <Button
            type="button"
            variant="default"
            onClick={() => {
              onDone?.();
              onCancel?.();
            }}
          >
            Done
          </Button>
          <Button type="button" onClick={resetForAnother}>
            Send another
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }}>
      <Stack gap="md">
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}

        <div>
          <Text component="span" size="sm" fw={500}>What kind of feedback is this?</Text>
          <SegmentedControl
            fullWidth
            mt={6}
            value={form.type}
            onChange={(value) => updateForm('type', value as FeedbackSubmissionType)}
            data={[
              { label: 'Bug', value: 'BUG' },
              { label: 'Idea', value: 'IDEA' },
              { label: 'General', value: 'GENERAL' },
            ]}
          />
        </div>

        <Textarea
          label="Your feedback"
          placeholder="Tell us what happened or what you would like to see."
          value={form.message}
          onChange={(event) => updateForm('message', event.currentTarget.value)}
          minRows={6}
          maxLength={5000}
          aria-required="true"
        />

        {contextLabel ? (
          <Textarea
            label={contextLabel}
            value={form.additionalContext}
            onChange={(event) => updateForm('additionalContext', event.currentTarget.value)}
            minRows={3}
            maxLength={2000}
          />
        ) : null}

        <Checkbox
          label="You may contact me about this feedback"
          checked={form.allowContact}
          onChange={(event) => updateForm('allowContact', event.currentTarget.checked)}
        />

        {form.allowContact ? (
          <TextInput
            label="Email address"
            type="email"
            value={form.contactEmail}
            onChange={(event) => updateForm('contactEmail', event.currentTarget.value)}
            maxLength={254}
            aria-required="true"
          />
        ) : null}

        <div
          aria-hidden="true"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}
        >
          <TextInput
            tabIndex={-1}
            label="Company website"
            name="companyWebsite"
            autoComplete="off"
            value={form.companyWebsite}
            onChange={(event) => updateForm('companyWebsite', event.currentTarget.value)}
          />
        </div>

        <Group justify="flex-end">
          {onCancel ? (
            <Button type="button" variant="default" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" loading={submitting} disabled={submitting}>
            Send feedback
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default FeedbackForm;
