const PUBLIC_STATIC_MARKDOWN_PATHS = new Set([
  '/',
  '/blog',
  '/delete-data',
  '/discover',
  '/find-clubs',
  '/find-events',
  '/find-facilities',
  '/guides',
  '/info',
  '/mobile-app',
  '/privacy-policy',
  '/request-demo',
  '/terms',
]);

const PUBLIC_DYNAMIC_MARKDOWN_PATTERNS = [
  /^\/(?:blog|guides)\/[^/]+$/,
  /^\/find-(?:clubs|events|facilities)(?:\/[^/]+){1,2}$/,
  /^\/event\/[^/]+$/,
  /^\/organizations\/[^/]+$/,
  /^\/o\/[^/]+(?:\/(?:events|products|teams)\/[^/]+|\/rentals)?$/,
];

const withoutTrailingSlash = (pathname: string): string => (
  pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
);

export const markdownCompanionSourcePath = (pathname: string): string | null => {
  if (pathname === '/index.html.md') {
    return '/';
  }
  if (pathname.endsWith('/index.html.md')) {
    return withoutTrailingSlash(pathname.slice(0, -'/index.html.md'.length) || '/');
  }
  if (!pathname.endsWith('.md')) {
    return null;
  }
  return withoutTrailingSlash(pathname.slice(0, -'.md'.length) || '/');
};

export const isPublicMarkdownPath = (pathname: string): boolean => {
  const normalized = withoutTrailingSlash(pathname || '/');
  return PUBLIC_STATIC_MARKDOWN_PATHS.has(normalized)
    || PUBLIC_DYNAMIC_MARKDOWN_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const acceptsMarkdown = (acceptHeader: string | null): boolean => (
  Boolean(acceptHeader?.split(',').some((entry) => entry.trim().toLowerCase().startsWith('text/markdown')))
);
