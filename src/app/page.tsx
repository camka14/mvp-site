'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Loading from '@/components/ui/Loading';
import { useApp } from './providers';
import { authService } from '@/lib/auth';
import { getHomePathForUser } from '@/lib/homePage';

const featureSections = [
  {
    id: 'event-engine',
    title: 'Events, teams, matches, and standings - structured.',
    points: [
      'Create events, leagues, and tournaments with clean division logic.',
      'Build schedules with teams, brackets, and match dependencies.',
      'Publish results and standings in one source of truth.',
    ],
    imageLabel: 'Image D: Web event admin view (teams, matches, standings)',
  },
  {
    id: 'fields-scheduling',
    title: 'Place fields/courts and schedule time slots fast.',
    points: [
      'Assign resources, courts, and game windows from one scheduler.',
      'Use map placement and field layout context when planning.',
      'Keep operations conflict-aware as events scale.',
    ],
    imageLabel: 'Image E: Field placement map or scheduling grid',
  },
  {
    id: 'registration',
    title: "Registration that doesn't break on game day.",
    points: [
      'Support individual and team registration flows.',
      'Track participant status, waitlists, and attendance quickly.',
      'Support parent or guardian registration paths where required.',
    ],
    imageLabel: 'Image F: Participants list with registration statuses',
  },
  {
    id: 'payments',
    title: 'Collect payments and reconcile automatically.',
    points: [
      'Run checkout from mobile with event context.',
      'Process billing with server-side Stripe reconciliation.',
      'Handle billing records and refund workflows when needed.',
    ],
    imageLabel: 'Image G: Mobile checkout + web billing view',
  },
  {
    id: 'documents',
    title: 'Waivers and required docs, signed digitally.',
    points: [
      'Use document templates with event-level requirements.',
      'Track signed records by player and event.',
      'Give organizers instant visibility into compliance.',
    ],
    imageLabel: 'Image H: Waiver signing + document status view',
  },
  {
    id: 'communication',
    title: 'Communication built into the event.',
    points: [
      'Run team and event chat groups without external tools.',
      'Send topic notifications and organizer announcements.',
      'Keep players and parents synced in real time.',
    ],
    imageLabel: 'Image I: Mobile chat + push notification preview',
  },
];

const useCases = [
  'Tournaments',
  'Leagues',
  'Clubs',
  'Training Camps',
  'Facility Programs',
  'Community Events',
];

export default function HomePage() {
  const { user, loading } = useApp();
  const router = useRouter();
  const [startingGuestSession, setStartingGuestSession] = useState(false);
  const [guestError, setGuestError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.push(getHomePathForUser(user));
    }
  }, [loading, router, user]);

  const handleContinueAsGuest = async () => {
    if (startingGuestSession) return;
    setGuestError('');
    setStartingGuestSession(true);
    try {
      await authService.guestLogin();
      router.push('/discover');
    } catch (error: unknown) {
      setGuestError(error instanceof Error ? error.message : 'Unable to start guest session right now.');
    } finally {
      setStartingGuestSession(false);
    }
  };

  if (loading || user) {
    return <Loading fullScreen text="Loading..." />;
  }

  return (
    <div className="landing-root min-h-screen">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <header className="landing-header sticky top-0 z-20 backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="landing-brand text-lg font-semibold tracking-wide">
            MVP
          </Link>

          <nav className="landing-nav hidden items-center gap-6 text-sm md:flex">
            <a href="#product" className="landing-nav-link transition">Product</a>
            <a href="#use-cases" className="landing-nav-link transition">Use Cases</a>
            <a href="#pricing" className="landing-nav-link transition">Pricing</a>
            <a href="#resources" className="landing-nav-link transition">Resources</a>
          </nav>

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

      <main className="relative">
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pt-24">
          <div className="space-y-7" data-reveal>
            <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
              Combined Platform: Web + Mobile
            </p>
            <h1 className="landing-title max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              Run leagues, tournaments, and sports events in one platform.
            </h1>
            <p className="landing-copy max-w-2xl text-base sm:text-lg">
              Create events, place fields, manage teams, collect payments, send updates, and keep everyone in sync across the web dashboard and mobile app.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="landing-btn-primary inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="landing-btn-secondary inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
              >
                Sign in
              </Link>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                disabled={startingGuestSession}
                className="landing-btn-outline inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingGuestSession ? 'Opening discover...' : 'Continue as guest'}
              </button>
            </div>

            <p className="landing-support text-sm">
              Payments, chat, notifications, and waivers included.
            </p>
            {guestError ? (
              <p className="landing-error rounded-xl px-4 py-3 text-sm">
                {guestError}
              </p>
            ) : null}
          </div>

          <div className="relative" data-reveal data-delay="1">
            <div className="landing-shot landing-surface-strong rounded-3xl p-4">
              <div className="landing-hero-media aspect-[16/10] rounded-2xl p-6">
                <p className="landing-label text-xs uppercase tracking-[0.16em]">Image A</p>
                <h2 className="landing-section-title mt-3 text-xl font-semibold">Web dashboard + mobile app mockup</h2>
                <p className="landing-section-copy mt-2 max-w-md text-sm">
                  Front: mobile event details with Join/Pay/Chat. Background: web admin schedule and participant controls.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="landing-note-primary rounded-xl p-3 text-xs">
                  Mobile screen: Event details + CTA actions
                </div>
                <div className="landing-note-secondary rounded-xl p-3 text-xs">
                  Web screen: Event admin and scheduling
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-band">
          <div className="landing-section-copy mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm sm:px-6 lg:px-8">
            <p>Built for tournament hosts, leagues, and facilities.</p>
            <div className="flex flex-wrap gap-2">
              {['Community Sports', 'Regional Leagues', 'Tournament Ops', 'Club Networks'].map((label) => (
                <span key={label} className="landing-tag rounded-full px-3 py-1 text-xs">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">Two sides of the platform</h2>
            <p className="landing-section-copy mt-3 max-w-3xl">
              Organizers run operations from the web dashboard while players and parents stay aligned from mobile.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <article className="landing-surface rounded-3xl p-6">
              <p className="landing-label text-xs uppercase tracking-[0.16em]">For Organizers (Web)</p>
              <ul className="landing-section-copy mt-4 space-y-2 text-sm">
                <li>Create events, leagues, and tournaments</li>
                <li>Manage teams, divisions, schedules</li>
                <li>Handle payments, payouts, and billing</li>
                <li>Broadcast updates and announcements</li>
                <li>Track documents and waivers</li>
              </ul>
              <div className="landing-note-primary mt-5 rounded-2xl p-4 text-xs">
                Image B: Web organizer dashboard screenshot
              </div>
            </article>

            <article className="landing-surface rounded-3xl p-6">
              <p className="landing-label-alt text-xs uppercase tracking-[0.16em]">For Players and Parents (Mobile)</p>
              <ul className="landing-section-copy mt-4 space-y-2 text-sm">
                <li>Discover and join events quickly</li>
                <li>Pay fees and track registration status</li>
                <li>Chat in team and group channels</li>
                <li>Receive push notifications instantly</li>
                <li>View schedules, locations, and updates</li>
              </ul>
              <div className="landing-note-secondary mt-5 rounded-2xl p-4 text-xs">
                Image C: Mobile participant app screenshot
              </div>
            </article>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl space-y-10 px-4 pb-16 sm:px-6 lg:px-8">
          {featureSections.map((feature, index) => {
            const reverse = index % 2 === 1;
            return (
              <article
                key={feature.id}
                className={`landing-surface grid gap-6 rounded-3xl p-6 lg:grid-cols-2 lg:items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}
              >
                <div className="space-y-4">
                  <h3 className="landing-section-title text-2xl font-semibold">{feature.title}</h3>
                  <ul className="landing-section-copy space-y-2 text-sm sm:text-base">
                    {feature.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
                <div className="landing-surface-soft landing-section-copy rounded-2xl p-5 text-sm">
                  <div className="landing-feature-media aspect-[4/3] rounded-xl p-4">
                    <p className="landing-label text-xs uppercase tracking-[0.16em]">Screenshot placement</p>
                    <p className="mt-3">{feature.imageLabel}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="landing-surface rounded-3xl p-6">
            <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">How it works</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                'Create your event and set up fields and schedules',
                'Teams and players join, sign docs, and pay',
                'Run game day with updates, chat, and notifications',
              ].map((step, index) => (
                <div key={step} className="landing-surface-soft rounded-2xl p-4">
                  <p className="landing-step text-xs font-semibold uppercase tracking-[0.14em]">Step {index + 1}</p>
                  <p className="landing-section-copy mt-2 text-sm">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">Use cases</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <article key={useCase} className="landing-surface landing-section-copy rounded-2xl p-5">
                <p className="font-medium">{useCase}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="resources" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="landing-surface rounded-3xl p-6">
            <h2 className="landing-section-title text-2xl font-semibold sm:text-3xl">Integrations and platform stack</h2>
            <div className="landing-section-copy mt-5 flex flex-wrap gap-3 text-sm">
              {['Stripe Payments', 'Firebase Push', 'BoldSign E-Sign', 'Google Maps'].map((integration) => (
                <span key={integration} className="landing-pill rounded-full px-4 py-2">
                  {integration}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">Pricing preview</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                tier: 'Starter',
                detail: 'Run core events and registrations.',
              },
              {
                tier: 'Pro',
                detail: 'Add payments, docs, messaging, and notifications.',
              },
              {
                tier: 'Enterprise',
                detail: 'Multi-location operations and advanced controls.',
              },
            ].map((plan) => (
              <article key={plan.tier} className="landing-surface rounded-2xl p-5">
                <h3 className="landing-section-title text-lg font-semibold">{plan.tier}</h3>
                <p className="landing-section-copy mt-2 text-sm">{plan.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="landing-cta rounded-3xl p-8">
            <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">Ready to run your next event on MVP?</h2>
            <p className="landing-cta-copy mt-3 max-w-2xl">
              Start with your first league, tournament, or event and invite your teams immediately.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="landing-btn-primary inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
              >
                Sign up
              </Link>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                disabled={startingGuestSession}
                className="landing-btn-outline inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue as guest
              </button>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
