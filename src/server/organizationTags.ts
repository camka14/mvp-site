import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';

export type OrganizationTagView = {
  id: string;
  name: string;
  slug: string;
  isSystem?: boolean;
  organizationCount?: number;
};

type PrismaLike = typeof prisma;

const MAX_ORGANIZATION_TAG_LENGTH = 40;
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(error)
  && typeof error === 'object'
  && (error as { code?: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
);

const findOrganizationTagBySlug = async (
  slug: string,
  client: PrismaLike | any = prisma,
): Promise<OrganizationTagView | null> => {
  if (typeof client.organizationTags?.findUnique === 'function') {
    const tag = await client.organizationTags.findUnique({ where: { slug } });
    return tag ? { id: tag.id, name: tag.name, slug: tag.slug, isSystem: tag.isSystem === true } : null;
  }

  if (typeof client.organizationTags?.findFirst === 'function') {
    const tag = await client.organizationTags.findFirst({ where: { slug } });
    return tag ? { id: tag.id, name: tag.name, slug: tag.slug, isSystem: tag.isSystem === true } : null;
  }

  return null;
};

const upsertOrganizationTagByName = async (
  name: string,
  client: PrismaLike | any = prisma,
): Promise<OrganizationTagView> => {
  const slug = slugifyOrganizationTagName(name);
  try {
    const tag = await client.organizationTags.upsert({
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
    return {
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      isSystem: tag.isSystem === true,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingTag = await findOrganizationTagBySlug(slug, client);
    if (existingTag) {
      return existingTag;
    }
    throw error;
  }
};

export const normalizeOrganizationTagName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, MAX_ORGANIZATION_TAG_LENGTH);
};

export const slugifyOrganizationTagName = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tag';
};

export const normalizeOrganizationTagInputs = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value : [];
  const tags = source
    .map((entry) => {
      if (typeof entry === 'string') {
        return normalizeOrganizationTagName(entry);
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        return normalizeOrganizationTagName(record.name ?? record.label ?? record.value);
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry));

  const seen = new Set<string>();
  return tags.filter((tag) => {
    const slug = slugifyOrganizationTagName(tag);
    if (seen.has(slug)) {
      return false;
    }
    seen.add(slug);
    return true;
  });
};

export const sortOrganizationTagsByUsage = (a: OrganizationTagView, b: OrganizationTagView): number => {
  const countDiff = (b.organizationCount ?? 0) - (a.organizationCount ?? 0);
  if (countDiff !== 0) {
    return countDiff;
  }
  return a.name.localeCompare(b.name);
};

export const mergeOrganizationTags = (
  tags: OrganizationTagView[],
  query: string = '',
): OrganizationTagView[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (tag: OrganizationTagView) => (
    !normalizedQuery
    || tag.name.toLowerCase().includes(normalizedQuery)
    || tag.slug.toLowerCase().includes(normalizedQuery)
  );
  const merged = new Map<string, OrganizationTagView>();

  tags.forEach((tag) => {
    const slug = tag.slug.trim().toLowerCase();
    if (!slug || !matchesQuery(tag) || merged.has(slug)) {
      return;
    }
    merged.set(slug, tag);
  });

  return Array.from(merged.values()).sort(sortOrganizationTagsByUsage);
};

export const withListedOrganizationCountsForTags = async (
  tags: OrganizationTagView[],
  client: PrismaLike | any = prisma,
): Promise<OrganizationTagView[]> => {
  const tagIds = Array.from(new Set(tags.map((tag) => tag.id).filter(Boolean)));
  if (
    tagIds.length === 0
    || typeof client.organizationTagAssignments?.findMany !== 'function'
    || typeof client.organizations?.findMany !== 'function'
  ) {
    return tags.map((tag) => ({ ...tag, organizationCount: tag.organizationCount ?? 0 }));
  }

  const assignments = await client.organizationTagAssignments.findMany({
    where: { tagId: { in: tagIds } },
    select: { tagId: true, organizationId: true },
  });
  const organizationIds = Array.from(
    new Set(
      assignments
        .map((assignment: any) => String(assignment.organizationId ?? '').trim())
        .filter(Boolean),
    ),
  );

  if (!organizationIds.length) {
    return tags.map((tag) => ({ ...tag, organizationCount: 0 }));
  }

  const listedOrganizations = await client.organizations.findMany({
    where: {
      id: { in: organizationIds },
      status: 'LISTED',
    },
    select: { id: true },
  });
  const listedOrganizationIds = new Set(listedOrganizations.map((organization: any) => String(organization.id)));
  const countsByTagId = new Map<string, Set<string>>();

  assignments.forEach((assignment: any) => {
    const tagId = String(assignment.tagId ?? '').trim();
    const organizationId = String(assignment.organizationId ?? '').trim();
    if (!tagId || !organizationId || !listedOrganizationIds.has(organizationId)) {
      return;
    }
    const organizationIdsForTag = countsByTagId.get(tagId) ?? new Set<string>();
    organizationIdsForTag.add(organizationId);
    countsByTagId.set(tagId, organizationIdsForTag);
  });

  return tags.map((tag) => ({
    ...tag,
    organizationCount: countsByTagId.get(tag.id)?.size ?? 0,
  }));
};

export const getOrganizationTagsForOrganizationIds = async (
  organizationIds: string[],
  client: PrismaLike | any = prisma,
): Promise<Map<string, OrganizationTagView[]>> => {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds.map((id) => String(id).trim()).filter(Boolean)));
  const tagsByOrganizationId = new Map<string, OrganizationTagView[]>();
  if (!uniqueOrganizationIds.length || typeof client.organizationTagAssignments?.findMany !== 'function') {
    return tagsByOrganizationId;
  }

  const assignments = await client.organizationTagAssignments.findMany({
    where: { organizationId: { in: uniqueOrganizationIds } },
    orderBy: { createdAt: 'asc' },
  });
  const tagIds = Array.from(
    new Set(
      assignments
        .map((assignment: any) => String(assignment.tagId ?? '').trim())
        .filter(Boolean),
    ),
  );
  if (!tagIds.length || typeof client.organizationTags?.findMany !== 'function') {
    return tagsByOrganizationId;
  }

  const tags = await client.organizationTags.findMany({
    where: { id: { in: tagIds } },
    orderBy: { name: 'asc' },
  });
  const tagById = new Map<string, OrganizationTagView>(
    tags.map((tag: any) => [
      tag.id,
      {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        isSystem: tag.isSystem === true,
      },
    ]),
  );

  assignments.forEach((assignment: any) => {
    const tag = tagById.get(assignment.tagId);
    if (!tag) {
      return;
    }
    const bucket = tagsByOrganizationId.get(assignment.organizationId) ?? [];
    bucket.push(tag);
    tagsByOrganizationId.set(assignment.organizationId, bucket);
  });

  return tagsByOrganizationId;
};

export const syncOrganizationTags = async (
  organizationId: string,
  input: unknown,
  client: PrismaLike | any = prisma,
): Promise<OrganizationTagView[]> => {
  const tagNames = normalizeOrganizationTagInputs(input);
  if (
    typeof client.organizationTags?.upsert !== 'function'
    || typeof client.organizationTagAssignments?.deleteMany !== 'function'
    || typeof client.organizationTagAssignments?.createMany !== 'function'
  ) {
    return [];
  }

  if (!tagNames.length) {
    await client.organizationTagAssignments.deleteMany({ where: { organizationId } });
    return [];
  }

  const tags: OrganizationTagView[] = [];
  for (const name of tagNames) {
    const tag = await upsertOrganizationTagByName(name, client);
    tags.push(tag);
  }

  const tagIds = tags.map((tag) => tag.id);
  await client.organizationTagAssignments.deleteMany({
    where: {
      organizationId,
      tagId: { notIn: tagIds },
    },
  });
  await client.organizationTagAssignments.createMany({
    data: tags.map((tag) => ({
      id: createId(),
      organizationId,
      tagId: tag.id,
      tagNameSnapshot: tag.name,
    })),
    skipDuplicates: true,
  });

  return tags;
};

export const resolveSystemOrganizationTagIdsBySlugs = async (
  slugs: string[],
  client: PrismaLike | any = prisma,
): Promise<string[]> => {
  const normalizedSlugs = Array.from(
    new Set(
      slugs
        .map((slug) => slugifyOrganizationTagName(slug))
        .filter(Boolean),
    ),
  );
  if (!normalizedSlugs.length || typeof client.organizationTags?.findMany !== 'function') {
    return [];
  }

  const tags = await client.organizationTags.findMany({
    where: {
      slug: { in: normalizedSlugs },
      isSystem: true,
    },
    select: { id: true },
  });
  return tags.map((tag: any) => String(tag.id)).filter(Boolean);
};
