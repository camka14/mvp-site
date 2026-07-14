export const SVG_MIME_TYPE = 'image/svg+xml';

export const IMAGE_UPLOAD_POLICY_VERSION = 1;
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_UPLOAD_UNSUPPORTED_TYPE_MESSAGE =
  'Unsupported image type. Please select a PNG, JPEG, WebP, AVIF, or SVG image.';
export const IMAGE_UPLOAD_TOO_LARGE_MESSAGE =
  'Image must be 10MB or less. Choose a smaller image and try again.';

const IMAGE_TYPE_BY_EXTENSION = {
  '.avif': 'image/avif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': SVG_MIME_TYPE,
  '.webp': 'image/webp',
} as const;

const IMAGE_UPLOAD_MIME_TYPES = [
  'image/avif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  SVG_MIME_TYPE,
  'image/webp',
] as const;

/**
 * Public, versioned source of truth for image-upload clients. Keep validation
 * and the capability response derived from this one object.
 */
export const IMAGE_UPLOAD_POLICY = Object.freeze({
  version: IMAGE_UPLOAD_POLICY_VERSION,
  maxBytes: MAX_IMAGE_UPLOAD_BYTES,
  mimeTypes: IMAGE_UPLOAD_MIME_TYPES,
  mimeTypesByExtension: IMAGE_TYPE_BY_EXTENSION,
  unsupportedTypeMessage: IMAGE_UPLOAD_UNSUPPORTED_TYPE_MESSAGE,
  tooLargeMessage: IMAGE_UPLOAD_TOO_LARGE_MESSAGE,
});

export const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(IMAGE_UPLOAD_POLICY.mimeTypes);

export const IMAGE_UPLOAD_ACCEPT = Array.from(SUPPORTED_IMAGE_MIME_TYPES).join(',');

const normalizeContentType = (contentType?: string | null): string =>
  (contentType || '').split(';', 1)[0].trim().toLowerCase();

export const resolveImageContentType = (contentType?: string | null, fileName?: string | null): string => {
  const normalized = normalizeContentType(contentType);
  if (SUPPORTED_IMAGE_MIME_TYPES.has(normalized)) {
    return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
  }

  const normalizedName = (fileName || '').trim().toLowerCase();
  const matchedExtension = Object.keys(IMAGE_UPLOAD_POLICY.mimeTypesByExtension).find((extension) =>
    normalizedName.endsWith(extension),
  );
  return matchedExtension
    ? IMAGE_UPLOAD_POLICY.mimeTypesByExtension[
        matchedExtension as keyof typeof IMAGE_UPLOAD_POLICY.mimeTypesByExtension
      ]
    : '';
};

export const isSupportedImageUpload = (contentType?: string | null, fileName?: string | null): boolean =>
  Boolean(resolveImageContentType(contentType, fileName));

export const isSvgContentType = (contentType?: string | null): boolean =>
  normalizeContentType(contentType) === SVG_MIME_TYPE;

export const SVG_IMAGE_RESPONSE_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};
