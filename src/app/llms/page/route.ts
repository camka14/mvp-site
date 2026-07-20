import {
  isPublicMarkdownPath,
  MARKDOWN_SOURCE_PATH_HEADER,
} from '@/lib/llmsRouting';
import { renderPublicPageMarkdown } from '@/server/llmsPage';

export const dynamic = 'force-dynamic';

const notFoundResponse = () => new Response('Public Markdown page not found.\n', {
  status: 404,
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  },
});

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  // Next preserves the browser-visible request URL after a proxy rewrite, so
  // the rewritten `path` query is not reliable inside this route handler.
  const sourcePath = request.headers.get(MARKDOWN_SOURCE_PATH_HEADER)
    ?? requestUrl.searchParams.get('path');
  if (!sourcePath || !sourcePath.startsWith('/') || sourcePath.startsWith('//')) {
    return notFoundResponse();
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(sourcePath, requestUrl.origin);
  } catch {
    return notFoundResponse();
  }
  if (sourceUrl.origin !== requestUrl.origin || !isPublicMarkdownPath(sourceUrl.pathname)) {
    return notFoundResponse();
  }

  const markdown = await renderPublicPageMarkdown(sourceUrl);
  if (!markdown) {
    return notFoundResponse();
  }

  return new Response(`${markdown.trim()}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      Vary: 'Accept',
    },
  });
}
