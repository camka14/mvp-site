export type PublicCompletionKind = 'event' | 'rental' | 'product';

type ClientRouter = {
  push: (href: string) => void;
};

export const getPublicCompletionPath = (slug: string, kind: PublicCompletionKind): string => {
  const params = new URLSearchParams({ type: kind });
  return `/o/${encodeURIComponent(slug)}/complete?${params.toString()}`;
};

export const normalizePublicCompletionRedirectUrl = (value?: string | null): string | null => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const getPublicCompletionTarget = ({
  slug,
  kind,
  redirectUrl,
}: {
  slug: string;
  kind: PublicCompletionKind;
  redirectUrl?: string | null;
}): string => (
  normalizePublicCompletionRedirectUrl(redirectUrl) ?? getPublicCompletionPath(slug, kind)
);

export const navigateToPublicCompletion = ({
  router,
  slug,
  kind,
  redirectUrl,
}: {
  router: ClientRouter;
  slug: string;
  kind: PublicCompletionKind;
  redirectUrl?: string | null;
}) => {
  const target = getPublicCompletionTarget({ slug, kind, redirectUrl });
  if (/^https?:\/\//i.test(target) && typeof window !== 'undefined') {
    window.location.assign(target);
    return;
  }
  router.push(target);
};
