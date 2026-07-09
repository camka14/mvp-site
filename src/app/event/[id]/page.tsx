import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import { absoluteUrl } from '@/server/publicSearchSeo';
import {
  createRegularPublicEventStructuredData,
  getRegularPublicEventSeoData,
  regularOrganizationPath,
} from '@/server/publicSearchPages';

export const dynamic = 'force-dynamic';

type RegularPublicEventPageProps = {
  params: Promise<{ id: string }>;
};

const navItems = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

const formatDate = (value: string | null): string => {
  if (!value) {
    return 'Date TBD';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date TBD';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
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

export async function generateMetadata({ params }: RegularPublicEventPageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getRegularPublicEventSeoData(id);
  if (!data) {
    return {
      title: 'Event | BracketIQ',
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  return {
    title: data.title,
    description: data.description,
    alternates: {
      canonical: data.canonicalPath,
    },
    robots: {
      index: data.indexable,
      follow: true,
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: absoluteUrl(data.canonicalPath),
      type: 'website',
      images: [
        {
          url: absoluteUrl(data.event.imageUrl),
          width: 1200,
          height: 675,
          alt: data.event.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.description,
      images: [absoluteUrl(data.event.imageUrl)],
    },
  };
}

export default async function RegularPublicEventPage({ params }: RegularPublicEventPageProps) {
  const { id } = await params;
  const data = await getRegularPublicEventSeoData(id);
  if (!data) {
    notFound();
  }

  const primaryHref = data.registrationPath ?? regularOrganizationPath(data.organization.id);
  const primaryLabel = data.registrationPath ? 'Open registration' : 'View organization';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <MarketingHeader navItems={navItems} />
      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pt-16">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase text-emerald-700">
              BracketIQ event
            </p>
            <h1 className="text-4xl font-semibold text-slate-950">{data.event.name}</h1>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-700">
              <span className="inline-flex items-center gap-2">
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                {formatDate(data.event.start)}
              </span>
              {data.event.location ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                  {data.event.location}
                </span>
              ) : null}
            </div>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-700">
              {data.event.description ?? data.description}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {primaryLabel}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href={regularOrganizationPath(data.organization.id)}
                className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100"
              >
                {data.organization.name}
              </Link>
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <Image
              src={data.event.imageUrl}
              alt=""
              width={1200}
              height={675}
              className="aspect-video w-full rounded-lg object-cover"
              unoptimized
            />
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-950">Host</dt>
                <dd className="mt-1 text-slate-600">{data.organization.name}</dd>
              </div>
              {data.event.sportName ? (
                <div>
                  <dt className="font-semibold text-slate-950">Sport</dt>
                  <dd className="mt-1 text-slate-600">{data.event.sportName}</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-semibold text-slate-950">Price</dt>
                <dd className="mt-1 text-slate-600">{formatPrice(data.event.priceCents)}</dd>
              </div>
            </dl>
          </aside>
        </section>
      </main>
      {data.indexable ? (
        <BlogStructuredData data={createRegularPublicEventStructuredData(data)} />
      ) : null}
    </div>
  );
}
