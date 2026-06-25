import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';

export type EventTagView = {
  id: string;
  name: string;
  slug: string;
};

type PrismaLike = typeof prisma;

const MAX_EVENT_TAG_LENGTH = 40;

export const normalizeEventTagName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, MAX_EVENT_TAG_LENGTH);
};

export const slugifyEventTagName = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tag';
};

export const normalizeEventTagInputs = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value : [];
  const tags = source
    .map((entry) => {
      if (typeof entry === 'string') {
        return normalizeEventTagName(entry);
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        return normalizeEventTagName(record.name ?? record.label ?? record.value);
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry));

  const seen = new Set<string>();
  return tags.filter((tag) => {
    const slug = slugifyEventTagName(tag);
    if (seen.has(slug)) {
      return false;
    }
    seen.add(slug);
    return true;
  });
};

export const getEventTagsForEventIds = async (
  eventIds: string[],
  client: PrismaLike | any = prisma,
): Promise<Map<string, EventTagView[]>> => {
  const uniqueEventIds = Array.from(new Set(eventIds.map((id) => String(id).trim()).filter(Boolean)));
  const tagsByEventId = new Map<string, EventTagView[]>();
  if (!uniqueEventIds.length || typeof client.eventTagAssignments?.findMany !== 'function') {
    return tagsByEventId;
  }

  const assignments = await client.eventTagAssignments.findMany({
    where: { eventId: { in: uniqueEventIds } },
    orderBy: { createdAt: 'asc' },
  });
  const tagIds = Array.from(
    new Set(
      assignments
        .map((assignment: any) => String(assignment.tagId ?? '').trim())
        .filter(Boolean),
    ),
  );
  if (!tagIds.length || typeof client.eventTags?.findMany !== 'function') {
    return tagsByEventId;
  }

  const tags = await client.eventTags.findMany({
    where: { id: { in: tagIds } },
    orderBy: { name: 'asc' },
  });
  const tagById = new Map<string, EventTagView>(
    tags.map((tag: any) => [
      tag.id,
      {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      },
    ]),
  );

  assignments.forEach((assignment: any) => {
    const tag = tagById.get(assignment.tagId);
    if (!tag) {
      return;
    }
    const bucket = tagsByEventId.get(assignment.eventId) ?? [];
    bucket.push(tag);
    tagsByEventId.set(assignment.eventId, bucket);
  });

  return tagsByEventId;
};

export const syncEventTags = async (
  eventId: string,
  input: unknown,
  client: PrismaLike | any = prisma,
): Promise<EventTagView[]> => {
  const tagNames = normalizeEventTagInputs(input);
  if (
    typeof client.eventTags?.upsert !== 'function'
    || typeof client.eventTagAssignments?.deleteMany !== 'function'
    || typeof client.eventTagAssignments?.createMany !== 'function'
  ) {
    return [];
  }

  if (!tagNames.length) {
    await client.eventTagAssignments.deleteMany({ where: { eventId } });
    return [];
  }

  const tags: EventTagView[] = [];
  for (const name of tagNames) {
    const slug = slugifyEventTagName(name);
    const tag = await client.eventTags.upsert({
      where: { slug },
      create: {
        id: createId(),
        name,
        slug,
      },
      update: {
        name,
      },
    });
    tags.push({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    });
  }

  const tagIds = tags.map((tag) => tag.id);
  await client.eventTagAssignments.deleteMany({
    where: {
      eventId,
      tagId: { notIn: tagIds },
    },
  });
  await client.eventTagAssignments.createMany({
    data: tags.map((tag) => ({
      id: createId(),
      eventId,
      tagId: tag.id,
      tagNameSnapshot: tag.name,
    })),
    skipDuplicates: true,
  });

  return tags;
};
