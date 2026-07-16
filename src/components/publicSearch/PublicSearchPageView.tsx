import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import {
  createPublicSearchStructuredData,
  type PublicSearchPage,
  type PublicSearchResult,
} from '@/server/publicSearchPages';

const navItems = [
  { label: 'Events', href: '/find-events' },
  { label: 'Clubs', href: '/find-clubs' },
  { label: 'Facilities', href: '/find-facilities' },
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

const formatDate = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

const resultKindLabel = (result: PublicSearchResult): string => {
  if (result.kind === 'events') {
    return result.eventType ? result.eventType.replace(/_/g, ' ').toLowerCase() : 'event';
  }
  if (result.kind === 'facilities') {
    return 'facility';
  }
  return 'club';
};

function ResultCard({ result }: { result: PublicSearchResult }) {
  const date = formatDate(result.start);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-full flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
            {resultKindLabel(result)}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            <Link href={result.href} className="transition hover:text-emerald-700">
              {result.title}
            </Link>
          </h2>
          {result.organizationName ? (
            <p className="mt-2 text-sm text-slate-600">{result.organizationName}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
            {date ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                {date}
              </span>
            ) : null}
            {result.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="h-4 w-4" />
                {result.location}
              </span>
            ) : null}
          </div>
          {result.description ? (
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{result.description}</p>
          ) : null}
        </div>
        <Link
          href={result.href}
          className="mt-auto inline-flex w-fit items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100"
        >
          View details
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default function PublicSearchPageView({ page }: { page: PublicSearchPage }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <MarketingHeader navItems={navItems} />
      <main>
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-12 pt-12 sm:px-6 lg:px-8 lg:pt-16">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase text-emerald-700">
              BracketIQ search
            </p>
            <h1 className="text-4xl font-semibold text-slate-950">{page.h1}</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700">
              {page.description}
            </p>
            {page.location && page.searchRadiusMiles ? (
              <p className="mt-3 text-sm font-medium text-slate-600">
                Showing public listings within {page.searchRadiusMiles} miles of {page.location.label}.
              </p>
            ) : null}
            <Link
              href={page.discoverHref}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open filtered Discover
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          {page.results.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {page.results.map((result) => (
                <ResultCard key={`${result.kind}:${result.id}`} result={result} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-xl font-semibold text-slate-950">No public listings are posted here yet.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                BracketIQ will show matching public listings here as organizations publish events, clubs, and facilities in this area.
              </p>
            </div>
          )}

          {page.relatedPages.length > 0 ? (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="text-lg font-semibold text-slate-950">Related searches</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {page.relatedPages.map((related) => (
                  <Link
                    key={related.path}
                    href={related.path}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100"
                  >
                    {related.title}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </main>
      <BlogStructuredData data={createPublicSearchStructuredData(page)} />
    </div>
  );
}
