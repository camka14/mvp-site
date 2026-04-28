'use client';

import Link from 'next/link';

type TermsConsentLikeState = {
  summary?: string[];
  url?: string;
} | null;

type TermsConsentModalProps = {
  open: boolean;
  state: TermsConsentLikeState;
  loading?: boolean;
  allowClose?: boolean;
  onAccept: () => void;
  onClose?: () => void;
  title?: string;
  intro?: string;
  confirmLabel?: string;
  dismissLabel?: string;
};

const DEFAULT_SUMMARY = [
  'There is no tolerance for objectionable content or abusive users.',
  'Users can report chats, events, and abusive users.',
  'Moderation acts on reports within 24 hours.',
];

export function TermsConsentModal({
  open,
  state,
  loading = false,
  allowClose = true,
  onAccept,
  onClose,
  title = 'Agree to the Terms and EULA',
  intro = 'Creating chats, events, or other user-generated content in Bracket IQ requires agreement to the Terms and EULA.',
  confirmLabel = 'Agree',
  dismissLabel = 'Not now',
}: TermsConsentModalProps) {
  if (!open) {
    return null;
  }

  const summary = state?.summary && state.summary.length > 0
    ? state.summary
    : DEFAULT_SUMMARY;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-600">{intro}</p>
          </div>
          {allowClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close terms dialog"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {summary.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-0.5 text-blue-600">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm text-gray-600">
          Moderation reports are reviewed within 24 hours. Confirmed objectionable content is removed and abusive users are ejected or suspended.
        </p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Link
            href={state?.url ?? '/terms'}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Read full terms
          </Link>
          <div className="flex gap-2">
            {allowClose && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                {dismissLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onAccept}
              disabled={loading}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Saving...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
