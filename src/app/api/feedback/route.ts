import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getOptionalSession } from '@/lib/permissions';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { sendAdminFeedbackSubmissionNotification } from '@/server/adminNotifications';

export const dynamic = 'force-dynamic';

const feedbackTypeSchema = z.enum(['BUG', 'IDEA', 'GENERAL']);

const feedbackSchema = z.object({
  type: feedbackTypeSchema,
  message: z.string().trim().min(10).max(5000),
  additionalContext: z.string().trim().max(2000).optional().default(''),
  allowContact: z.boolean(),
  contactEmail: z.string().trim().optional().default(''),
  sourcePath: z.string().trim().optional().default(''),
  clientContext: z.object({
    surface: z.literal('WEB'),
    viewportWidth: z.number().int().positive().max(20000).optional(),
    viewportHeight: z.number().int().positive().max(20000).optional(),
  }).strict().optional(),
  companyWebsite: z.string().trim().max(200).optional().default(''),
}).superRefine((value, context) => {
  if (!value.allowContact) return;
  if (
    !value.contactEmail
    || value.contactEmail.length > 254
    || !z.string().email().safeParse(value.contactEmail).success
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contactEmail'],
      message: 'Enter a valid email address when contact is allowed.',
    });
  }
});

type FeedbackInput = z.infer<typeof feedbackSchema>;

const normalizeSourcePath = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('?') || trimmed.includes('#') || trimmed.includes('://')) {
    return null;
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (normalized.startsWith('//') || normalized.length > 500) return null;
  return normalized;
};

const normalizeUserAgent = (req: NextRequest): string | null => {
  const value = req.headers.get('user-agent')?.trim() ?? '';
  return value ? value.slice(0, 512) : null;
};

const getBaseUrl = (req: NextRequest): string | null => (
  process.env.PUBLIC_WEB_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || req.nextUrl.origin
    || null
);

const buildSuccessResponse = (id: string, createdAt: Date): NextResponse => (
  NextResponse.json({
    ok: true,
    submission: {
      id,
      status: 'NEW',
      createdAt: createdAt.toISOString(),
    },
  }, { status: 201 })
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please review the feedback fields and try again.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = await getOptionalSession(req);
  const rateLimitResponse = await applyRateLimit(
    req,
    RATE_LIMIT_POLICIES.feedbackSubmission,
    session?.userId,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const input: FeedbackInput = parsed.data;
  const id = randomUUID();
  const createdAt = new Date();

  if (input.companyWebsite) {
    return buildSuccessResponse(id, createdAt);
  }

  const contactEmail = input.allowContact ? input.contactEmail || null : null;
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const clientContext = input.clientContext ?? { surface: 'WEB' as const };
  const userAgent = normalizeUserAgent(req);

  let submission;
  try {
    submission = await prisma.feedbackSubmissions.create({
      data: {
        id,
        createdAt,
        type: input.type,
        message: input.message,
        additionalContext: input.additionalContext || null,
        submitterUserId: session?.userId ?? null,
        allowContact: input.allowContact,
        contactEmail,
        sourcePath,
        userAgent,
        clientContext,
      },
    });
  } catch (error) {
    console.error('Failed to persist feedback submission', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'We could not save your feedback. Please try again.' },
      { status: 500 },
    );
  }

  try {
    await sendAdminFeedbackSubmissionNotification({
      id: submission.id,
      type: input.type,
      message: input.message,
      additionalContext: input.additionalContext || null,
      submitterUserId: session?.userId ?? null,
      allowContact: input.allowContact,
      contactEmail,
      sourcePath,
      createdAt: submission.createdAt,
      baseUrl: getBaseUrl(req),
    });
  } catch (error) {
    console.error('Failed to send feedback submission notification', error instanceof Error ? error.message : error);
  }

  return buildSuccessResponse(submission.id, submission.createdAt);
}
