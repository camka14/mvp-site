import { notFound } from 'next/navigation';
import { parseDivisionAgeBracketFromId } from '@/lib/divisionTypes';
import { prisma } from '@/lib/prisma';
import {
  assertPublicWidgetEvent,
  normalizeRequiredTemplateIds,
} from '@/server/publicGuestRegistration';
import { listRegistrationQuestions } from '@/server/registrationQuestions';
import GuestEventRegistrationWidget from './GuestEventRegistrationWidget';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{
    slug: string;
    eventId: string;
  }>;
  searchParams?: Promise<{
    slotId?: string;
    occurrenceDate?: string;
  }>;
};

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
};

const getNumberOrNull = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const requiresGuardianForDivision = (params: {
  divisionTypeId?: unknown;
  divisionKey?: unknown;
  event: Record<string, unknown>;
}): boolean => {
  const bracket = parseDivisionAgeBracketFromId(
    typeof params.divisionTypeId === 'string'
      ? params.divisionTypeId
      : typeof params.divisionKey === 'string'
        ? params.divisionKey
        : null,
  );
  if (bracket) {
    return bracket.age < 18 && bracket.kind !== 'MINIMUM';
  }
  const maxAge = getNumberOrNull(params.event.maxAge);
  if (maxAge !== null && maxAge < 18) {
    return true;
  }
  return false;
};

export default async function GuestRegistrationPage({ params, searchParams }: PageProps) {
  const { slug, eventId } = await params;
  const query = await searchParams;
  const context = await assertPublicWidgetEvent(slug, eventId);
  if (!context) {
    notFound();
  }

  const [divisionRows, questions] = await Promise.all([
    (prisma as any).divisions.findMany({
      where: {
        eventId,
        OR: [
          { kind: 'LEAGUE' },
          { kind: null },
        ],
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        key: true,
        name: true,
        divisionTypeId: true,
        price: true,
      },
    }),
    listRegistrationQuestions({
      scopeType: 'EVENT',
      scopeId: eventId,
    }),
  ]);

  const event = context.event;
  return (
    <GuestEventRegistrationWidget
      organization={{
        id: context.organization.id,
        slug: context.organization.slug,
        name: context.organization.name,
        brandPrimaryColor: context.organization.brandPrimaryColor,
        brandAccentColor: context.organization.brandAccentColor,
        publicCompletionRedirectUrl: context.organization.publicCompletionRedirectUrl,
      }}
      event={{
        id: String(event.id),
        name: String(event.name ?? 'Event'),
        description: typeof event.description === 'string' ? event.description : null,
        location: typeof event.location === 'string' ? event.location : null,
        start: toIsoString(event.start),
        eventType: String(event.eventType ?? 'EVENT'),
        teamSignup: event.teamSignup === true,
        priceCents: typeof event.price === 'number' ? Math.max(0, Math.round(event.price)) : 0,
        requiredTemplateIds: normalizeRequiredTemplateIds(event.requiredTemplateIds),
      }}
      divisions={divisionRows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        key: typeof row.key === 'string' ? row.key : null,
        name: String(row.name ?? 'Open'),
        divisionTypeId: typeof row.divisionTypeId === 'string' ? row.divisionTypeId : null,
        priceCents: typeof row.price === 'number' ? Math.max(0, Math.round(row.price)) : null,
        requiresGuardian: requiresGuardianForDivision({
          divisionTypeId: row.divisionTypeId,
          divisionKey: row.key,
          event: event as Record<string, unknown>,
        }),
      }))}
      questions={questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        answerType: question.answerType,
        required: question.required,
      }))}
      initialOccurrence={{
        slotId: query?.slotId ?? null,
        occurrenceDate: query?.occurrenceDate ?? null,
      }}
    />
  );
}
