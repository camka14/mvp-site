'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Loading from '@/components/ui/Loading';
import { useApp } from './providers';
import { authService } from '@/lib/auth';
import { getHomePathForUser } from '@/lib/homePage';

type FeatureSection = {
  id: string;
  title: string;
  points: string[];
  webImage: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  mobileImage: {
    src: string;
    alt: string;
    width: number;
    height: number;
  } | null;
};

const featureSections = [
  {
    id: 'event-engine',
    title: 'Events, teams, matches, and standings - structured.',
    points: [
      'Create events, leagues, and tournaments with clean division logic.',
      'Build schedules with teams, brackets, and match dependencies.',
      'Publish results and standings in one source of truth.',
    ],
    webImage: {
      src: '/landing/bracket_screenshot_web.png',
      alt: 'Web bracket and standings screen',
      width: 1919,
      height: 906,
    },
    mobileImage: {
      src: '/landing/bracket_mobile.png',
      alt: 'Mobile bracket screen',
      width: 1344,
      height: 2992,
    },
  },
  {
    id: 'fields-scheduling',
    title: 'Place fields/courts and schedule time slots fast.',
    points: [
      'Assign resources, courts, and game windows from one scheduler.',
      'Use map placement and field layout context when planning.',
      'Keep operations conflict-aware as events scale.',
    ],
    webImage: {
      src: '/landing/schedule_screenshot_web.png',
      alt: 'Web field and scheduling view',
      width: 1919,
      height: 905,
    },
    mobileImage: {
      src: '/landing/schedule_mobile.png',
      alt: 'Mobile schedule view',
      width: 1344,
      height: 2992,
    },
  },
  {
    id: 'registration',
    title: "Registration that doesn't break on game day.",
    points: [
      'Support individual and team registration flows.',
      'Track participant status, waitlists, and attendance quickly.',
      'Support parent or guardian registration paths where required.',
    ],
    webImage: {
      src: '/landing/team_managment_web.png',
      alt: 'Web team management and roster view',
      width: 1918,
      height: 904,
    },
    mobileImage: {
      src: '/landing/participants_mobile.png',
      alt: 'Mobile participants view',
      width: 1344,
      height: 2992,
    },
  },
  {
    id: 'payments',
    title: 'Collect payments and reconcile automatically.',
    points: [
      'Run checkout from mobile with event context.',
      'Process billing with server-side Stripe reconciliation.',
      'Handle billing records and refund workflows when needed.',
    ],
    webImage: {
      src: '/landing/payment_screen_web.png',
      alt: 'Web payment flow and checkout summary',
      width: 1919,
      height: 900,
    },
    mobileImage: {
      src: '/landing/payment_screen_mobile.png',
      alt: 'Mobile payment sheet and checkout options',
      width: 1344,
      height: 2992,
    },
  },
  {
    id: 'documents',
    title: 'Waivers and required docs, signed digitally.',
    points: [
      'Use document templates with event-level requirements.',
      'Track signed records by player and event.',
      'Give organizers instant visibility into compliance.',
    ],
    webImage: {
      src: '/landing/teams_auth_screenshot_web.png',
      alt: 'Web team management dashboard',
      width: 1440,
      height: 900,
    },
    mobileImage: null,
  },
  {
    id: 'communication',
    title: 'Communication built into the event.',
    points: [
      'Run team and event chat groups without external tools.',
      'Send topic notifications and organizer announcements.',
      'Keep players and parents synced in real time.',
    ],
    webImage: {
      src: '/landing/discover_screen_web.png',
      alt: 'Web discover feed and updates view',
      width: 1919,
      height: 899,
    },
    mobileImage: null,
  },
  {
    id: 'my-schedule',
    title: 'Personal schedules stay organized.',
    points: [
      'Give players one place to see upcoming games and assignments.',
      'Keep event times and locations visible without extra coordination.',
      'Reduce no-shows with clear schedule visibility.',
    ],
    webImage: {
      src: '/landing/my_schedule_auth_screenshot_web.png',
      alt: 'Web personal schedule dashboard',
      width: 1440,
      height: 900,
    },
    mobileImage: null,
  },
] satisfies FeatureSection[];

const heroScreenshots = {
  web: {
    src: '/landing/discover_screen_web.png',
    alt: 'Web discover dashboard',
    width: 1919,
    height: 899,
  },
  mobile: {
    src: '/landing/discover_screen_mobile.png',
    alt: 'Mobile discover screen',
    width: 1344,
    height: 2992,
  },
};

const useCases = [
  'Tournaments',
  'Leagues',
  'Clubs',
  'Training Camps',
  'Facility Programs',
  'Community Events',
];

const integrations = [
  {
    name: 'Stripe Payments',
    logoSrc: '/integrations/stripe-wordmark-slate.svg',
    logoAlt: 'Stripe logo',
    logoWidth: 112,
    logoHeight: 34,
  },
  {
    name: 'Firebase Push',
    logoSrc: '/integrations/firebase-horizontal-full-color.svg',
    logoAlt: 'Firebase logo',
    logoWidth: 136,
    logoHeight: 36,
  },
  {
    name: 'BoldSign E-Sign',
    logoSrc: '/integrations/boldsign-wordmark.svg',
    logoAlt: 'BoldSign logo',
    logoWidth: 170,
    logoHeight: 48,
  },
  {
    name: 'Google Maps',
    logoSrc: '/integrations/google-maps.svg',
    logoAlt: 'Google Maps icon',
    logoWidth: 92,
    logoHeight: 132,
    wordmarkText: 'Google Maps',
  },
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
        <div className="container-responsive flex items-center justify-between py-4">
          <Link href="/" className="landing-brand inline-flex items-center gap-3 text-lg font-semibold tracking-wide">
            <Image
              src="/bracketiq-shield.svg"
              alt="BracketIQ shield logo"
              width={40}
              height={40}
              className="h-10 w-10"
              priority
            />
            <span>BracketIQ</span>
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
        <section className="container-responsive grid gap-10 pb-20 pt-16 lg:grid-cols-[0.9fr_1.1fr] lg:pt-24">
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
              <div className="landing-hero-stack space-y-4">
                <div className="landing-shot-image landing-shot-image-equal">
                  <Image
                    src={heroScreenshots.web.src}
                    alt={heroScreenshots.web.alt}
                    width={heroScreenshots.web.width}
                    height={heroScreenshots.web.height}
                    sizes="(min-width: 1024px) 44vw, 100vw"
                    className="landing-shot-image-content landing-shot-image-content-equal"
                  />
                </div>
                <div className="flex justify-center">
                  <div className="landing-phone-frame landing-phone-frame-hero">
                    <div className="landing-phone-screen">
                      <Image
                        src={heroScreenshots.mobile.src}
                        alt={heroScreenshots.mobile.alt}
                        width={heroScreenshots.mobile.width}
                        height={heroScreenshots.mobile.height}
                        sizes="(min-width: 1024px) 18vw, 52vw"
                        className="landing-phone-image"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-band">
          <div className="container-responsive landing-section-copy flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
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

        <section id="product" className="container-responsive py-16">
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
              <div className="landing-shot-image landing-shot-image-equal mt-5">
                <Image
                  src="/landing/org_home_web.png"
                  alt="Web organizer organization home dashboard screenshot"
                  width={1919}
                  height={909}
                  sizes="(min-width: 1280px) 560px, (min-width: 1024px) 44vw, 100vw"
                  className="landing-shot-image-content landing-shot-image-content-equal"
                />
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
              <div className="landing-phone-frame landing-phone-frame-two-sides mt-5">
                <div className="landing-phone-screen">
                  <Image
                    src="/landing/discover_screen_mobile.png"
                    alt="Mobile discover screenshot"
                    width={1344}
                    height={2992}
                    sizes="(min-width: 1280px) 18rem, (min-width: 768px) 34vw, 48vw"
                    className="landing-phone-image"
                  />
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="container-responsive space-y-10 pb-16">
          {featureSections.map((feature, index) => {
            const reverse = index % 2 === 1;
            return (
              <article
                key={feature.id}
                className={`landing-surface grid gap-6 rounded-3xl p-6 lg:items-center ${reverse ? 'lg:grid-cols-[3fr_1fr] lg:[&>*:first-child]:order-2' : 'lg:grid-cols-[1fr_3fr]'}`}
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
                  <div className="rounded-xl">
                    <div className={`landing-media-grid grid gap-3 ${feature.mobileImage ? 'landing-media-grid-paired' : ''}`}>
                      <div className={`landing-shot-image ${feature.mobileImage ? 'landing-media-pair-item' : ''}`}>
                        <Image
                          src={feature.webImage.src}
                          alt={feature.webImage.alt}
                          width={feature.webImage.width}
                          height={feature.webImage.height}
                          sizes={
                            feature.mobileImage
                              ? '(min-width: 1280px) 832px, (min-width: 1024px) 64vw, 100vw'
                              : '(min-width: 1280px) 960px, (min-width: 1024px) 72vw, 100vw'
                          }
                          className={`landing-shot-image-content ${feature.mobileImage ? 'landing-shot-image-content-equal' : ''}`}
                        />
                      </div>
                      {feature.mobileImage ? (
                        <div className="landing-phone-frame landing-phone-frame-compact landing-phone-frame-equal landing-media-pair-item">
                          <div className="landing-phone-screen">
                            <Image
                              src={feature.mobileImage.src}
                              alt={feature.mobileImage.alt}
                              width={feature.mobileImage.width}
                              height={feature.mobileImage.height}
                              sizes="(min-width: 1024px) 12vw, 40vw"
                              className="landing-phone-image"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="container-responsive pb-16">
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

        <section id="use-cases" className="container-responsive pb-16">
          <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">Use cases</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <article key={useCase} className="landing-surface landing-section-copy rounded-2xl p-5">
                <p className="font-medium">{useCase}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="resources" className="container-responsive pb-16">
          <div className="landing-surface rounded-3xl p-6">
            <h2 className="landing-section-title text-2xl font-semibold sm:text-3xl">Integrations and platform stack</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {integrations.map((integration) => (
                <article
                  key={integration.name}
                  className={`landing-pill flex min-h-24 items-center justify-center rounded-2xl px-4 py-3 ${integration.name === 'Google Maps' ? 'gap-2' : ''}`}
                >
                  <Image
                    src={integration.logoSrc}
                    alt={integration.logoAlt}
                    width={integration.logoWidth}
                    height={integration.logoHeight}
                    className={`w-auto shrink-0 ${integration.name === 'Google Maps' ? 'h-10' : 'h-8'}`}
                  />
                  {integration.wordmarkText ? (
                    <span className="landing-pill-wordmark whitespace-nowrap text-base font-semibold">
                      {integration.wordmarkText}
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="container-responsive pb-16">
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

        <section className="container-responsive pb-20">
          <div className="landing-cta rounded-3xl p-8">
            <h2 className="landing-section-title text-3xl font-semibold sm:text-4xl">Ready to run your next event on BracketIQ?</h2>
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
