import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  MapPinned,
  MessageSquareText,
  MonitorSmartphone,
} from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import { getMobileAppLinks } from '@/lib/mobileAppLinks';
import { SITE_URL } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Get the BracketIQ Mobile App | BracketIQ',
  description:
    'Download the BracketIQ mobile app from the App Store or Google Play to discover events, manage schedules, message teams, and keep registrations close at hand.',
  alternates: {
    canonical: '/mobile-app',
  },
  openGraph: {
    title: 'Get the BracketIQ Mobile App | BracketIQ',
    description:
      'Get the BracketIQ mobile app for event discovery, team communication, registrations, and schedules on the go.',
    url: `${SITE_URL}/mobile-app`,
  },
};

const mobileHighlights = [
  {
    title: 'Discover nearby events',
    detail: 'Browse active events, organizations, rentals, and registration options from the mobile discover feed.',
    icon: MapPinned,
  },
  {
    title: 'Keep schedules handy',
    detail: 'Check event times, locations, assignments, and updates without digging through email threads.',
    icon: CalendarDays,
  },
  {
    title: 'Stay in the conversation',
    detail: 'Use mobile access for team messages, event updates, documents, and registration status.',
    icon: MessageSquareText,
  },
] as const;

const phoneFrameStyle = {
  '--landing-phone-frame-width': 'min(100%, 20rem)',
} as CSSProperties;

export default function MobileAppPage() {
  const { iosStoreUrl, androidStoreUrl } = getMobileAppLinks();

  return (
    <div className="landing-root min-h-screen">
      <MarketingHeader anchorHrefPrefix="/info" />

      <main className="relative">
        <section className="marketing-page-hero container-responsive relative grid gap-12 pb-16 pt-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(20rem,0.58fr)] lg:items-center lg:pb-24">
          <div className="marketing-hero-copy space-y-7">
            <p className="landing-kicker inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <MonitorSmartphone aria-hidden="true" className="h-4 w-4" />
              Mobile App
            </p>
            <div className="space-y-5">
              <h1 className="landing-title max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Get the BracketIQ mobile app.
              </h1>
              <p className="landing-copy max-w-2xl text-base leading-8 sm:text-lg">
                Use the BracketIQ mobile app to discover sports events, join registrations, keep schedules close, and
                stay connected with teams and organizers from your phone.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={iosStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-btn-primary landing-btn-large"
                aria-label="Download BracketIQ on the App Store"
              >
                App Store
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </a>
              <a
                href={androidStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-btn-secondary landing-btn-large"
                aria-label="Get BracketIQ on Google Play"
              >
                Google Play
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>

          </div>

          <div className="relative mx-auto flex w-full max-w-[24rem] justify-center lg:justify-end">
            <div className="landing-phone-frame relative" style={phoneFrameStyle}>
              <div className="landing-phone-screen">
                <Image
                  src="/landing/discover_screen_mobile.png"
                  alt="BracketIQ mobile app discover page screenshot"
                  width={1344}
                  height={2992}
                  className="landing-phone-image"
                  priority
                />
              </div>
            </div>
          </div>

          <div className="marketing-signal-grid lg:col-span-2">
            {mobileHighlights.map((item) => {
              const Icon = item.icon;

              return (
                <article key={item.title} className="marketing-signal-card">
                  <div className="landing-icon-box">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">{item.title}</p>
                    <p>{item.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="container-responsive relative pb-20">
          <div className="grid gap-5 rounded-[1.35rem] bg-slate-950 p-6 text-white shadow-[0_28px_80px_-62px_rgba(14,14,16,0.55)] md:grid-cols-[minmax(0,0.86fr)_auto] md:items-center md:p-8">
            <div>
              <p className="landing-label-alt text-xs uppercase tracking-[0.16em] text-blue-200">
                Web + mobile
              </p>
              <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Run the operation on web. Carry the day on mobile.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                BracketIQ keeps participants and staff connected across event discovery, registrations, schedules,
                messages, and organization updates.
              </p>
            </div>
            <Link href="/discover" className="landing-btn-secondary landing-btn-large w-full justify-center md:w-auto">
              Browse on web
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
