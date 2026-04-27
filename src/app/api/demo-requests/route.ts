import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isEmailEnabled, sendEmail } from '@/server/email';

export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (maxLength: number) => z.string().trim().max(maxLength).optional().default('');

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  organization: z.string().trim().min(2).max(160),
  role: optionalText(120),
  phone: optionalText(40),
  eventType: optionalText(120),
  eventVolume: optionalText(120),
  message: optionalText(2000),
  sourcePath: optionalText(500),
  companyWebsite: optionalText(200),
});

type DemoRequestInput = z.infer<typeof demoRequestSchema>;

const escapeHtml = (value: string): string => (
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  })
);

const getDemoRequestRecipients = (): string[] => {
  const value = process.env.DEMO_REQUEST_TO?.trim() ?? '';
  if (!value) return [];

  return value
    .split(/[,\s;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => EMAIL_REGEX.test(entry));
};

const buildPlainTextEmail = (input: DemoRequestInput, submittedAt: string, userAgent: string): string => {
  const lines = [
    'New BracketIQ demo request',
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Organization: ${input.organization}`,
    input.role ? `Role: ${input.role}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    input.eventType ? `Event type: ${input.eventType}` : null,
    input.eventVolume ? `Expected volume: ${input.eventVolume}` : null,
    input.message ? `Message: ${input.message}` : null,
    '',
    `Source: ${input.sourcePath || '/request-demo'}`,
    `Submitted: ${submittedAt}`,
    userAgent ? `User agent: ${userAgent}` : null,
  ];

  return lines.filter(Boolean).join('\n');
};

const buildHtmlEmail = (input: DemoRequestInput, submittedAt: string, userAgent: string): string => {
  const rows = [
    ['Name', input.name],
    ['Email', input.email],
    ['Organization', input.organization],
    ['Role', input.role],
    ['Phone', input.phone],
    ['Event type', input.eventType],
    ['Expected volume', input.eventVolume],
    ['Message', input.message],
    ['Source', input.sourcePath || '/request-demo'],
    ['Submitted', submittedAt],
    ['User agent', userAgent],
  ].filter(([, value]) => Boolean(value));

  return [
    '<h1>New BracketIQ demo request</h1>',
    '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">',
    ...rows.map(([label, value]) => (
      `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`
    )),
    '</table>',
  ].join('');
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = demoRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.companyWebsite.trim()) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const recipients = getDemoRequestRecipients();
  if (!recipients.length) {
    return NextResponse.json(
      { error: 'Demo request notifications are unavailable because DEMO_REQUEST_TO is not configured.' },
      { status: 503 },
    );
  }

  if (!isEmailEnabled()) {
    return NextResponse.json(
      { error: 'Demo request notifications are unavailable because SMTP is not configured.' },
      { status: 503 },
    );
  }

  const submittedAt = new Date().toISOString();
  const userAgent = req.headers.get('user-agent')?.trim() ?? '';

  try {
    await sendEmail({
      to: recipients.join(', '),
      subject: `BracketIQ demo request: ${parsed.data.organization}`,
      text: buildPlainTextEmail(parsed.data, submittedAt, userAgent),
      html: buildHtmlEmail(parsed.data, submittedAt, userAgent),
      replyTo: parsed.data.email,
    });
  } catch (error) {
    console.error('Failed to send demo request email', error);
    return NextResponse.json({ error: 'Failed to send demo request. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
