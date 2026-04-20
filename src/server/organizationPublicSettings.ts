export const PUBLIC_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const RESERVED_PUBLIC_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'blog',
  'billing',
  'discover',
  'embed',
  'embed-js',
  'events',
  'login',
  'new',
  'organizations',
  'privacy-policy',
  'profile',
  'teams',
  'terms',
  'www',
]);

export const normalizePublicSlug = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('Public slug must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!PUBLIC_SLUG_PATTERN.test(normalized) || RESERVED_PUBLIC_SLUGS.has(normalized)) {
    throw new Error('Public slug must be lowercase letters, numbers, and hyphens, and cannot use a reserved word.');
  }
  return normalized;
};

export const normalizePublicColor = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a hex color.`);
  }
  const normalized = value.trim();
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a 6-digit hex color like #0f766e.`);
  }
  return normalized.toLowerCase();
};

export const normalizePublicText = (value: unknown, label: string, maxLength: number): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
};

export const normalizeEmbedAllowedDomains = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('Embed allowed domains must be a list of domains.');
  }
  return Array.from(new Set(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        try {
          const parsed = entry.includes('://') ? new URL(entry) : new URL(`https://${entry}`);
          return parsed.hostname;
        } catch {
          throw new Error('Embed allowed domains must contain valid hostnames.');
        }
      }),
  ));
};

export const normalizePublicRedirectUrl = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('Completion redirect URL must be a URL.');
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > 2048) {
    throw new Error('Completion redirect URL must be 2048 characters or fewer.');
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Completion redirect URL must be an absolute http or https URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Completion redirect URL must be an absolute http or https URL.');
  }
  return parsed.toString();
};
