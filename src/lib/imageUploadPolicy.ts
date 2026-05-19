export const SVG_MIME_TYPE = 'image/svg+xml';

const IMAGE_TYPE_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': SVG_MIME_TYPE,
  '.webp': 'image/webp',
};

export const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  SVG_MIME_TYPE,
  'image/webp',
]);

export const IMAGE_UPLOAD_ACCEPT = Array.from(SUPPORTED_IMAGE_MIME_TYPES).join(',');

const normalizeContentType = (contentType?: string | null): string =>
  (contentType || '').split(';', 1)[0].trim().toLowerCase();

export const resolveImageContentType = (contentType?: string | null, fileName?: string | null): string => {
  const normalized = normalizeContentType(contentType);
  if (SUPPORTED_IMAGE_MIME_TYPES.has(normalized)) {
    return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
  }

  const normalizedName = (fileName || '').trim().toLowerCase();
  const matchedExtension = Object.keys(IMAGE_TYPE_BY_EXTENSION).find((extension) =>
    normalizedName.endsWith(extension),
  );
  return matchedExtension ? IMAGE_TYPE_BY_EXTENSION[matchedExtension] : '';
};

export const isSupportedImageUpload = (contentType?: string | null, fileName?: string | null): boolean =>
  Boolean(resolveImageContentType(contentType, fileName));

export const isSvgContentType = (contentType?: string | null): boolean =>
  normalizeContentType(contentType) === SVG_MIME_TYPE;

export const SVG_IMAGE_RESPONSE_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};
