import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import RequestDemoForm from './RequestDemoForm';
import { SITE_URL } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Request a Demo | BracketIQ',
  description: 'Request a BracketIQ demo for tournament, league, club, or facility operations.',
  alternates: {
    canonical: '/request-demo',
  },
  openGraph: {
    title: 'Request a Demo | BracketIQ',
    description: 'Request a BracketIQ demo for tournament, league, club, or facility operations.',
    url: `${SITE_URL}/request-demo`,
  },
};

export default function RequestDemoPage() {
  return (
    <main className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <header className="landing-header sticky top-0 z-20 backdrop-blur-lg">
        <div className="container-responsive flex items-center justify-between py-4">
          <Link href="/" className="landing-brand inline-flex items-center gap-3 text-lg font-semibold tracking-wide">
            <Image
              src="/BIQ_drawing.svg"
              alt="BracketIQ logo"
              width={40}
              height={40}
              className="h-10 w-10"
              priority
            />
            <span>BracketIQ</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="landing-btn-secondary inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold transition"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="landing-btn-primary inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold transition"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <section className="container-responsive relative grid gap-8 py-14 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:py-20">
        <div className="space-y-6">
          <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
            Request Demo
          </p>
          <h1 className="landing-title max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            See how BracketIQ can run your next sports program.
          </h1>
          <p className="landing-copy max-w-2xl text-base leading-8 sm:text-lg">
            Share a few details about your events and we will follow up with a focused walkthrough for your workflow.
          </p>

          <div className="grid gap-3">
            {[
              'Event setup, divisions, teams, and schedules',
              'Registration, payments, waivers, and refunds',
              'Player communication across web and mobile',
            ].map((item) => (
              <div key={item} className="landing-surface-soft rounded-2xl px-4 py-3">
                <p className="landing-section-copy text-sm font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <RequestDemoForm />
      </section>
    </main>
  );
}
