import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import {
  absoluteUrl,
  createPublicEventDirectoryMetaDescription,
  createPublicEventDirectoryStructuredData,
  listPublicEventSportSummaries,
  publicEventDirectoryPath,
} from '@/server/publicSearchSeo';

export const dynamic = 'force-dynamic';

const navItems = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

export const metadata: Metadata = {
  title: 'Find Sports Events | BracketIQ',
  description: createPublicEventDirectoryMetaDescription(),
  alternates: {
    canonical: publicEventDirectoryPath(),
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Find Sports Events | BracketIQ',
    description: createPublicEventDirectoryMetaDescription(),
    url: absoluteUrl(publicEventDirectoryPath()),
    type: 'website',
  },
};

const eventCountLabel = (count: number): string => (
  count === 1 ? '1 public event' : `${count} public events`
);

export default async function FindEventsPage() {
  const sports = await listPublicEventSportSummaries();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <MarketingHeader navItems={navItems} />
      <main>
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-12 pt-12 sm:px-6 lg:px-8 lg:pt-16">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase text-emerald-700">
              <Search aria-hidden="true" className="h-4 w-4" />
              BracketIQ events
            </p>
            <h1 className="text-4xl font-semibold text-slate-950">
              Find sports events hosted through BracketIQ.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700">
              Browse public event search pages by sport, then open Discover with the matching sport filter selected for local events, leagues, and tournaments.
            </p>
          </div>

          {sports.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sports.map((sport) => (
                <article key={sport.slug} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex h-full flex-col gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">{sport.name} events</h2>
                      <p className="mt-2 text-sm text-slate-600">{eventCountLabel(sport.eventCount)} listed on BracketIQ.</p>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-3">
                      <Link
                        href={sport.discoverHref}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Open Discover
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                      <Link
                        href={sport.directoryPath}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100"
                      >
                        View page
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-xl font-semibold text-slate-950">Public event pages are coming online.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                When listed organizations publish events, their sports will appear here and link into filtered Discover results.
              </p>
              <Link
                href="/discover"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open Discover
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>
      </main>
      <BlogStructuredData data={createPublicEventDirectoryStructuredData(sports)} />
    </div>
  );
}
