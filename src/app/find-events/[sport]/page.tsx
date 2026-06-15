import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import { sportSlugToLabel } from '@/lib/discoverFilters';
import {
  absoluteUrl,
  createPublicEventSportMetaDescription,
  createPublicEventSportStructuredData,
  getPublicEventSportDirectory,
  publicEventDirectoryPath,
} from '@/server/publicSearchSeo';

export const dynamic = 'force-dynamic';

type SportEventsPageProps = {
  params: Promise<{ sport: string }>;
};

const navItems = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

const getDirectory = cache((sport: string) => getPublicEventSportDirectory(sport));

const formatDate = (value: string | null): string => {
  if (!value) {
    return 'Date TBD';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date TBD';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const formatPrice = (cents: number): string => (
  cents > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    : 'Free'
);

export async function generateMetadata({ params }: SportEventsPageProps): Promise<Metadata> {
  const { sport } = await params;
  const directory = await getDirectory(sport);
  if (!directory) {
    const fallbackSport = sportSlugToLabel(sport);
    return {
      title: `${fallbackSport} Events | BracketIQ`,
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const title = `${directory.sport.name} Events | BracketIQ`;
  const description = createPublicEventSportMetaDescription(directory.sport.name);

  return {
    title,
    description,
    alternates: {
      canonical: directory.sport.directoryPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(directory.sport.directoryPath),
      type: 'website',
    },
  };
}

export default async function SportEventsPage({ params }: SportEventsPageProps) {
  const { sport } = await params;
  const directory = await getDirectory(sport);
  if (!directory) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <MarketingHeader navItems={navItems} />
      <main>
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-12 pt-12 sm:px-6 lg:px-8 lg:pt-16">
          <div className="max-w-3xl">
            <Link
              href={publicEventDirectoryPath()}
              className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-slate-950"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              All sports
            </Link>
            <h1 className="text-4xl font-semibold text-slate-950">
              {directory.sport.name} events on BracketIQ
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700">
              Find {directory.sport.name} events, leagues, and tournaments hosted through BracketIQ. Open Discover to browse matching results with {directory.sport.name} selected.
            </p>
            <Link
              href={directory.sport.discoverHref}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open filtered Discover
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          {directory.events.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {directory.events.map((event) => (
                <article key={event.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex h-full flex-col gap-4">
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">{formatDate(event.start)}</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">
                        <Link href={event.eventPath} className="transition hover:text-emerald-700">
                          {event.name}
                        </Link>
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">{event.organizationName}</p>
                      <p className="mt-1 text-sm text-slate-600">{event.location ?? 'Location TBD'}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">{formatPrice(event.priceCents)}</span>
                      <Link
                        href={event.eventPath}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100"
                      >
                        Event details
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-xl font-semibold text-slate-950">No public {directory.sport.name} events are listed right now.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Discover can still show matching results when new {directory.sport.name} events are published.
              </p>
            </div>
          )}
        </section>
      </main>
      <BlogStructuredData data={createPublicEventSportStructuredData(directory)} />
    </div>
  );
}
