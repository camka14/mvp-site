export const normalizePublicOrganizationSlug = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
);

export const slugifyPublicOrganizationName = (value: string, maxLength = 63): string => (
  normalizePublicOrganizationSlug(value.replace(/['’]/g, '').replace(/[^a-z0-9]+/gi, '-'))
    .slice(0, maxLength)
    .replace(/-+$/g, '')
);

export const buildPublicOrganizationPath = (slug: string): string => (
  `/o/${encodeURIComponent(normalizePublicOrganizationSlug(slug))}`
);

export const buildPublicEventPath = (slug: string, eventId: string): string => (
  `${buildPublicOrganizationPath(slug)}/events/${encodeURIComponent(eventId)}`
);
