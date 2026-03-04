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
  const { user, loading, isGuest } = useApp();
  const router = useRouter();
  const [startingGuestSession, setStartingGuestSession] = useState(false);
  const [guestError, setGuestError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.push(getHomePathForUser(user));
      return;
    }
    if (isGuest) {
      router.push('/discover');
    }
  }, [isGuest, loading, router, user]);

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

  if (loading || user || isGuest) {
    return <Loading fullScreen text="Loading..." />;
  }

  return (
    <div className="landing-root min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold tracking-wide text-cyan-300">
            MVP
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#product" className="transition hover:text-white">Product</a>
            <a href="#use-cases" className="transition hover:text-white">Use Cases</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#resources" className="transition hover:text-white">Resources</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-500/60 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pt-24">
          <div className="space-y-7" data-reveal>
            <p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
              Combined Platform: Web + Mobile
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Run leagues, tournaments, and sports events in one platform.
            </h1>
            <p className="max-w-2xl text-base text-slate-200 sm:text-lg">
              Create events, place fields, manage teams, collect payments, send updates, and keep everyone in sync across the web dashboard and mobile app.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-500/60 px-5 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
              >
                Sign in
              </Link>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                disabled={startingGuestSession}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-cyan-300/40 px-5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingGuestSession ? 'Opening discover...' : 'Continue as guest'}
              </button>
            </div>

            <p className="text-sm text-cyan-100/90">
              Payments, chat, notifications, and waivers included.
            </p>
            {guestError ? (
              <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {guestError}
              </p>
            ) : null}
          </div>

          <div className="relative" data-reveal data-delay="1">
            <div className="landing-shot rounded-3xl border border-white/20 bg-slate-900/85 p-4 shadow-[0_18px_50px_-20px_rgba(56,189,248,0.6)]">
              <div className="aspect-[16/10] rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-500/25 via-blue-500/10 to-slate-900 p-6">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Image A</p>
                <h2 className="mt-3 text-xl font-semibold text-white">Web dashboard + mobile app mockup</h2>
                <p className="mt-2 max-w-md text-sm text-slate-200">
                  Front: mobile event details with Join/Pay/Chat. Background: web admin schedule and participant controls.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs text-cyan-50">
                  Mobile screen: Event details + CTA actions
                </div>
                <div className="rounded-xl border border-blue-300/20 bg-blue-300/10 p-3 text-xs text-blue-50">
                  Web screen: Event admin and scheduling
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-slate-900/70">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-slate-300 sm:px-6 lg:px-8">
            <p>Built for tournament hosts, leagues, and facilities.</p>
            <div className="flex flex-wrap gap-2">
              {['Community Sports', 'Regional Leagues', 'Tournament Ops', 'Club Networks'].map((label) => (
                <span key={label} className="rounded-full border border-white/15 px-3 py-1 text-xs">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Two sides of the platform</h2>
            <p className="mt-3 max-w-3xl text-slate-300">
              Organizers run operations from the web dashboard while players and parents stay aligned from mobile.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-white/15 bg-slate-900/70 p-6">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">For Organizers (Web)</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                <li>Create events, leagues, and tournaments</li>
                <li>Manage teams, divisions, schedules</li>
                <li>Handle payments, payouts, and billing</li>
                <li>Broadcast updates and announcements</li>
                <li>Track documents and waivers</li>
              </ul>
              <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-xs text-cyan-50">
                Image B: Web organizer dashboard screenshot
              </div>
            </article>

            <article className="rounded-3xl border border-white/15 bg-slate-900/70 p-6">
              <p className="text-xs uppercase tracking-[0.16em] text-blue-200">For Players and Parents (Mobile)</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                <li>Discover and join events quickly</li>
                <li>Pay fees and track registration status</li>
                <li>Chat in team and group channels</li>
                <li>Receive push notifications instantly</li>
                <li>View schedules, locations, and updates</li>
              </ul>
              <div className="mt-5 rounded-2xl border border-blue-300/20 bg-blue-300/10 p-4 text-xs text-blue-50">
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
                className={`grid gap-6 rounded-3xl border border-white/15 bg-slate-900/65 p-6 lg:grid-cols-2 lg:items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}
              >
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold text-white">{feature.title}</h3>
                  <ul className="space-y-2 text-sm text-slate-200 sm:text-base">
                    {feature.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/15 bg-slate-900/80 p-5 text-sm text-slate-200">
                  <div className="aspect-[4/3] rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-500/20 via-transparent to-blue-500/20 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Screenshot placement</p>
                    <p className="mt-3">{feature.imageLabel}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/15 bg-slate-900/70 p-6">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">How it works</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                'Create your event and set up fields and schedules',
                'Teams and players join, sign docs, and pay',
                'Run game day with updates, chat, and notifications',
              ].map((step, index) => (
                <div key={step} className="rounded-2xl border border-white/15 bg-slate-900/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Step {index + 1}</p>
                  <p className="mt-2 text-sm text-slate-200">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">Use cases</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <article key={useCase} className="rounded-2xl border border-white/15 bg-slate-900/70 p-5 text-slate-200">
                <p className="font-medium">{useCase}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="resources" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/15 bg-slate-900/70 p-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Integrations and platform stack</h2>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-200">
              {['Stripe Payments', 'Firebase Push', 'BoldSign E-Sign', 'Google Maps'].map((integration) => (
                <span key={integration} className="rounded-full border border-white/20 px-4 py-2">
                  {integration}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">Pricing preview</h2>
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
              <article key={plan.tier} className="rounded-2xl border border-white/15 bg-slate-900/70 p-5">
                <h3 className="text-lg font-semibold text-white">{plan.tier}</h3>
                <p className="mt-2 text-sm text-slate-200">{plan.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-cyan-300/35 bg-gradient-to-r from-cyan-400/20 via-blue-500/20 to-slate-900 p-8">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Ready to run your next event on MVP?</h2>
            <p className="mt-3 max-w-2xl text-slate-100">
              Start with your first league, tournament, or event and invite your teams immediately.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Sign up
              </Link>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                disabled={startingGuestSession}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-cyan-100/45 px-5 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
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
