'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileSignature,
  Globe2,
  LayoutDashboard,
  MapPinned,
  MessageSquareText,
  MonitorSmartphone,
  PanelsTopLeft,
  Radio,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '@/app/providers';
import { authService } from '@/lib/auth';
import { getHomePathForUser } from '@/lib/homePage';
import MarketingHeader from '@/components/marketing/MarketingHeader';

type FeatureSection = {
  id: string;
  title: string;
  eyebrow: string;
  points: string[];
  details: string[];
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
  icon: LucideIcon;
};

type LandingPageProps = {
  brandHref?: string;
  anchorHrefPrefix?: string;
  heroMediaLayout?: 'stacked' | 'horizontal';
};

const featureSections = [
  {
    id: 'scheduling',
    eyebrow: 'Scheduling',
    title: 'Schedule courts fast.',
    points: ['Courts + fields', 'Conflict checks'],
    details: ['Place resources quickly', 'See conflicts before publishing', 'Keep the full day visible'],
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
    icon: MapPinned,
  },
  {
    id: 'registrations',
    eyebrow: 'Registration',
    title: 'Rosters stay ready.',
    points: ['Teams', 'Attendance'],
    details: ['Track team status', 'Manage waitlists', 'Confirm attendance'],
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
    icon: UsersRound,
  },
  {
    id: 'payments',
    eyebrow: 'Payments',
    title: 'Payments, reconciled.',
    points: ['Checkout', 'Refunds'],
    details: ['Collect from mobile', 'Match Stripe records', 'Handle refunds cleanly'],
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
    icon: CreditCard,
  },
  {
    id: 'documents',
    eyebrow: 'Documents',
    title: 'Documents signed.',
    points: ['Waivers', 'Clearance'],
    details: ['Attach required forms', 'Reuse templates', 'Clearance status'],
    webImage: {
      src: '/landing/document_creation_web.png',
      alt: 'Web signable document creation screen',
      width: 1919,
      height: 907,
    },
    mobileImage: null,
    icon: FileSignature,
  },
  {
    id: 'communication',
    eyebrow: 'Communication',
    title: 'Updates in context.',
    points: ['Chat', 'Announcements'],
    details: ['Message the right group', 'Send event updates', 'Keep context attached'],
    webImage: {
      src: '/landing/chat_screenshot_web.png',
      alt: 'Web chat conversations and event updates view',
      width: 1918,
      height: 907,
    },
    mobileImage: null,
    icon: MessageSquareText,
  },
  {
    id: 'personal-schedules',
    eyebrow: 'Personal Schedules',
    title: 'Everyone knows where to be.',
    points: ['Game times', 'Locations'],
    details: ['Show each assignment', 'Surface locations', 'Reflect schedule changes'],
    webImage: {
      src: '/landing/my_schedule_auth_screenshot_web.png',
      alt: 'Web personal schedule dashboard',
      width: 1440,
      height: 900,
    },
    mobileImage: null,
    icon: CalendarDays,
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

const utilitySignals = [
  { label: 'Web + mobile', detail: 'One operating layer for staff and participants.', icon: MonitorSmartphone },
  { label: 'Free app access', detail: 'Run events without a platform subscription.', icon: BadgeCheck },
  { label: '1-3% payment fee', detail: 'Fees only apply when payments are processed.', icon: CreditCard },
  { label: 'Website integration included', detail: 'Publish live event data where your audience already goes.', icon: Globe2 },
];

const commandStats = [
  { label: 'Schedules', value: 'Live', detail: 'Courts, fields, brackets' },
  { label: 'Payments', value: '1-3%', detail: 'Only on processed payments' },
  { label: 'Documents', value: 'Signed', detail: 'Waivers and agreements' },
  { label: 'Updates', value: 'Instant', detail: 'Chat and notifications' },
];

const platformColumns = [
  {
    label: 'Organizer console',
    title: 'A web dashboard for facility and tournament operations.',
    points: [
      'Create events, leagues, and tournaments',
      'Manage teams, divisions, schedules',
      'Handle payments, payouts, and billing',
      'Broadcast updates and announcements',
      'Track documents and waivers',
    ],
    image: {
      src: '/landing/org_home_web.png',
      alt: 'Web organizer organization home dashboard screenshot',
      width: 1919,
      height: 909,
    },
    icon: PanelsTopLeft,
  },
  {
    label: 'Mobile participant layer',
    title: 'A mobile app for players, parents, and teams.',
    points: [
      'Discover and join events quickly',
      'Pay fees and track registration status',
      'Chat in team and group channels',
      'Receive push notifications instantly',
      'View schedules, locations, and updates',
    ],
    image: {
      src: '/landing/discover_screen_mobile.png',
      alt: 'Mobile discover screenshot',
      width: 1344,
      height: 2992,
    },
    icon: MonitorSmartphone,
  },
];

const workflowSteps = [
  {
    label: 'Build',
    title: 'Set up the operating model',
    detail: 'Create the event, divisions, fields, documents, pricing, and registration paths from one clean admin surface.',
  },
  {
    label: 'Publish',
    title: 'Open registration and schedules',
    detail: 'Let teams and players join, pay, sign documents, and see what is live on web, mobile, or your existing site.',
  },
  {
    label: 'Run',
    title: 'Manage game day from the same system',
    detail: 'Update brackets, send announcements, keep chat moving, and make changes without rebuilding the operation.',
  },
];

const useCases = [
  {
    label: 'Tournaments',
    detail: 'Brackets, pools, payments',
  },
  {
    label: 'Leagues',
    detail: 'Recurring schedules, standings',
  },
  {
    label: 'Clubs',
    detail: 'Teams, rosters, communication',
  },
  {
    label: 'Training Camps',
    detail: 'Sessions, courts, attendance',
  },
  {
    label: 'Facility Programs',
    detail: 'Events, rentals, documents',
  },
  {
    label: 'Community Events',
    detail: 'Discovery, updates, registration',
  },
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

const resourceHighlights = [
  {
    label: 'Format',
    title: 'Build the bracket.',
    detail: 'Pools, playoffs, divisions',
    icon: LayoutDashboard,
  },
  {
    label: 'Conflicts',
    title: 'Protect the schedule.',
    detail: 'Courts, times, capacity',
    icon: CalendarDays,
  },
  {
    label: 'Updates',
    title: 'Keep teams synced.',
    detail: 'Changes, chat, alerts',
    icon: Sparkles,
  },
];

const feeHighlights = [
  {
    title: 'No subscription',
    detail: 'Run events without a monthly platform bill.',
    value: '$0',
    icon: WalletCards,
  },
  {
    title: '1-3% payment fee',
    detail: 'Only when BracketIQ processes payments.',
    value: '1-3%',
    icon: BadgeDollarSign,
  },
  {
    title: 'No payments required',
    detail: 'Use BracketIQ even when collecting elsewhere.',
    value: 'Free',
    icon: ShieldCheck,
  },
];

export default function LandingPage({
  brandHref = '/',
  anchorHrefPrefix = '',
  heroMediaLayout = 'stacked',
}: LandingPageProps) {
  const { user, isAuthenticated, isGuest } = useApp();
  const router = useRouter();
  const [startingGuestSession, setStartingGuestSession] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [activeOperationIndex, setActiveOperationIndex] = useState(0);
  const operationPanelRefs = useRef<Array<HTMLElement | null>>([]);
  const appHref = getHomePathForUser(user);
  const showAppCta = isAuthenticated && !isGuest;
  const isHeroMediaHorizontal = heroMediaLayout === 'horizontal';
  const activeOperationFeature = featureSections[activeOperationIndex] ?? featureSections[0];
  const landingImageProps = {
    unoptimized: true,
  } as const;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frame = 0;

    const updateActiveOperation = () => {
      frame = 0;
      const activeY = window.innerHeight * 0.48;

      let nextOperationIndex: number | null = null;
      let nextOperationDistance = Number.POSITIVE_INFINITY;

      operationPanelRefs.current.forEach((node, index) => {
        if (!node) {
          return;
        }

        const rect = node.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          return;
        }

        const panelFocus = rect.top + rect.height * 0.42;
        const distance = Math.abs(panelFocus - activeY);
        if (distance < nextOperationDistance) {
          nextOperationIndex = index;
          nextOperationDistance = distance;
        }
      });

      if (nextOperationIndex !== null) {
        const nextIndex = nextOperationIndex;
        setActiveOperationIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
      }
    };

    const scheduleActiveOperationUpdate = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(updateActiveOperation);
    };

    updateActiveOperation();
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(scheduleActiveOperationUpdate, {
          root: null,
          rootMargin: '-18% 0px -34% 0px',
          threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
        })
      : null;

    operationPanelRefs.current.forEach((node) => {
      if (node) {
        observer?.observe(node);
      }
    });

    window.addEventListener('scroll', scheduleActiveOperationUpdate, { passive: true });
    window.addEventListener('resize', scheduleActiveOperationUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
      window.removeEventListener('scroll', scheduleActiveOperationUpdate);
      window.removeEventListener('resize', scheduleActiveOperationUpdate);
    };
  }, []);

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

  return (
    <div className="landing-root min-h-screen">
      <MarketingHeader brandHref={brandHref} anchorHrefPrefix={anchorHrefPrefix} />

      <main className="relative">
        <section className="landing-hero-section container-responsive pb-16 pt-14 lg:pb-24 lg:pt-20">
          <div className="landing-hero-copy mx-auto max-w-5xl space-y-7 text-center" data-reveal>
            <p className="landing-kicker inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase">
              <Radio aria-hidden="true" className="h-4 w-4" />
              Facility operations platform
            </p>
            <div className="space-y-5">
              <h1 className="landing-title mx-auto max-w-5xl text-5xl font-semibold leading-none sm:text-6xl lg:text-7xl">
                Bring your facility operations into one command center.
              </h1>
              <p className="landing-copy mx-auto max-w-2xl text-base sm:text-lg">
                Create events, assign courts and fields, collect payments, publish schedules, and support teams from one clean web and mobile platform.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {showAppCta ? (
                <>
                  <Link href={appHref} className="landing-btn-primary landing-btn-large">
                    Go to app
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  <Link href="/request-demo" className="landing-btn-secondary landing-btn-large">
                    Request demo
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="landing-btn-primary landing-btn-large">
                    Sign up
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  <Link href="/login" className="landing-btn-secondary landing-btn-large">
                    Sign in
                  </Link>
                  <Link href="/request-demo" className="landing-btn-secondary landing-btn-large">
                    Request demo
                  </Link>
                  <button
                    type="button"
                    onClick={handleContinueAsGuest}
                    disabled={startingGuestSession}
                    className="landing-btn-outline landing-btn-large disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {startingGuestSession ? 'Opening discover...' : 'Continue as guest'}
                  </button>
                </>
              )}
            </div>

            <div className="landing-support-grid" aria-label="Included platform capabilities">
              {['Payments', 'Chat', 'Notifications', 'Waivers'].map((label) => (
                <span key={label} className="landing-support-chip">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  {label}
                </span>
              ))}
            </div>
            {guestError ? (
              <p className="landing-error px-4 py-3 text-sm" role="alert">
                {guestError}
              </p>
            ) : null}
          </div>

          <div className="landing-command-wrap mx-auto mt-12 w-full max-w-7xl" data-reveal data-delay="1">
            <div className="landing-command-console">
              <div className="landing-command-header">
                <div>
                  <p className="landing-command-label">Live operations view</p>
                  <p className="landing-command-title">Discover dashboard</p>
                </div>
                <div className="landing-command-status">
                  <span aria-hidden="true" />
                  Online
                </div>
              </div>

              <div className={`landing-hero-stack ${isHeroMediaHorizontal ? 'landing-hero-stack-horizontal' : ''}`}>
                <div className="landing-shot-image landing-shot-image-equal landing-command-screen">
                  <Image
                    {...landingImageProps}
                    src={heroScreenshots.web.src}
                    alt={heroScreenshots.web.alt}
                    width={heroScreenshots.web.width}
                    height={heroScreenshots.web.height}
                    sizes="(min-width: 1024px) 54vw, 100vw"
                    className="landing-shot-image-content landing-shot-image-content-equal"
                    preload
                  />
                </div>
                <div className="landing-hero-phone-wrap flex justify-center">
                  <div className="landing-phone-frame landing-phone-frame-hero">
                    <div className="landing-phone-screen">
                      <Image
                        {...landingImageProps}
                        src={heroScreenshots.mobile.src}
                        alt={heroScreenshots.mobile.alt}
                        width={heroScreenshots.mobile.width}
                        height={heroScreenshots.mobile.height}
                        sizes="(min-width: 1024px) 12vw, 52vw"
                        className="landing-phone-image"
                        preload
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="landing-command-stats">
                {commandStats.map((stat) => (
                  <article key={stat.label} className="landing-stat-tile">
                    <p className="landing-stat-label">{stat.label}</p>
                    <p className="landing-stat-value">{stat.value}</p>
                    <p className="landing-stat-detail">{stat.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-proof-band">
          <div className="container-responsive grid gap-3 py-5 md:grid-cols-4">
            {utilitySignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <article key={signal.label} className="landing-proof-item">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  <div>
                    <h2 className="landing-proof-label">{signal.label}</h2>
                    <p className="landing-proof-detail">{signal.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="platform" className="landing-anchor-section container-responsive py-20">
          <div className="landing-section-heading landing-section-heading-center landing-section-heading-compact">
            <h2 className="landing-section-title">Web for staff. Mobile for everyone else.</h2>
            <p className="landing-section-copy">
              Staff manage the operation from the dashboard. Players and parents follow along from mobile.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {platformColumns.map((column) => {
              const Icon = column.icon;
              const isMobileLayer = column.label.includes('Mobile');
              return (
                <article key={column.label} className="landing-platform-card">
                  <div className="flex items-start gap-3">
                    <div className="landing-icon-box">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="landing-label">{column.label}</p>
                      <h3 className="landing-card-title">{column.title}</h3>
                    </div>
                  </div>
                  <ul className="landing-check-list mt-5">
                    {column.points.map((point) => (
                      <li key={point}>
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={isMobileLayer ? 'landing-phone-frame landing-phone-frame-two-sides mt-6' : 'landing-shot-image landing-shot-image-equal mt-6'}>
                    {isMobileLayer ? (
                      <div className="landing-phone-screen">
                        <Image
                          {...landingImageProps}
                          src={column.image.src}
                          alt={column.image.alt}
                          width={column.image.width}
                          height={column.image.height}
                          sizes="(min-width: 1280px) 18rem, (min-width: 768px) 34vw, 58vw"
                          className="landing-phone-image"
                        />
                      </div>
                    ) : (
                      <Image
                        {...landingImageProps}
                        src={column.image.src}
                        alt={column.image.alt}
                        width={column.image.width}
                        height={column.image.height}
                        sizes="(min-width: 1280px) 560px, (min-width: 1024px) 44vw, 100vw"
                        className="landing-shot-image-content landing-shot-image-content-equal"
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="operations" className="landing-anchor-section landing-operations-section container-responsive pb-20">
          <div className="landing-operations-pin-panel">
            <div className="landing-section-heading landing-section-heading-compact landing-operation-pin-heading">
              <div className="landing-operation-active-copy">
                <p className="landing-operation-active-label">{activeOperationFeature.eyebrow}</p>
                <h2 id="landing-operations-title" className="landing-section-title mt-3">
                  {activeOperationFeature.title}
                </h2>
                <ul className="landing-operation-active-points" aria-label={`${activeOperationFeature.eyebrow} highlights`}>
                  {activeOperationFeature.points.map((point) => (
                    <li key={point}>
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="landing-operation-progress" aria-label="Operations progress">
                {featureSections.map((feature, index) => (
                  <span
                    key={feature.id}
                    className={index === activeOperationIndex ? 'is-active' : ''}
                    aria-current={index === activeOperationIndex ? 'step' : undefined}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ))}
              </div>
            </div>

            <div className="landing-operation-scroll" aria-label="Operations feature sections">
              {featureSections.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.id}
                    ref={(node) => {
                      operationPanelRefs.current[index] = node;
                    }}
                    data-operation-index={index}
                    className={`landing-operation-scroll-panel ${index === activeOperationIndex ? 'is-active' : ''}`}
                  >
                    <div className="landing-operation-scroll-copy">
                      <h3 className="sr-only">{feature.title}</h3>
                      <div className="landing-icon-box">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <p className="landing-operation-feature-label">Key features</p>
                      <ul className="landing-check-list landing-operation-feature-list">
                        {feature.details.map((detail) => (
                          <li key={detail}>
                            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className={`landing-operation-scroll-media landing-media-grid grid gap-3 ${feature.mobileImage ? 'landing-media-grid-paired' : ''}`}>
                      <div className={`landing-shot-image ${feature.mobileImage ? 'landing-media-pair-item' : ''}`}>
                        <Image
                          {...landingImageProps}
                          src={feature.webImage.src}
                          alt={feature.webImage.alt}
                          width={feature.webImage.width}
                          height={feature.webImage.height}
                          sizes="(min-width: 1280px) 760px, (min-width: 1024px) 54vw, 100vw"
                          className={`landing-shot-image-content ${feature.mobileImage ? 'landing-shot-image-content-equal' : ''}`}
                          loading={feature.webImage.src === heroScreenshots.web.src ? 'eager' : undefined}
                        />
                      </div>
                      {feature.mobileImage ? (
                        <div className="landing-phone-frame landing-phone-frame-compact landing-phone-frame-equal landing-media-pair-item">
                          <div className="landing-phone-screen">
                            <Image
                              {...landingImageProps}
                              src={feature.mobileImage.src}
                              alt={feature.mobileImage.alt}
                              width={feature.mobileImage.width}
                              height={feature.mobileImage.height}
                              sizes="(min-width: 1024px) 12vw, 36vw"
                              className="landing-phone-image"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-workflow-section container-responsive pb-20" aria-labelledby="landing-workflow-title">
          <div className="landing-workflow-panel">
            <div className="landing-section-heading landing-section-heading-compact landing-workflow-heading">
              <p className="landing-label">How it works</p>
              <h2 id="landing-workflow-title" className="landing-section-title mt-3">
                From setup to game day, the same system keeps moving.
              </h2>
            </div>
            <div className="landing-workflow-grid">
              {workflowSteps.map((step, index) => (
                <article key={step.label} className="landing-workflow-step">
                  <span className="landing-step-index">{String(index + 1).padStart(2, '0')}</span>
                  <p className="landing-operation-code">{step.label}</p>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="landing-anchor-section container-responsive pb-20">
          <div className="landing-integration-panel">
            <div className="landing-integration-copy landing-section-heading-compact">
              <p className="landing-label">Website Integration</p>
              <h2 className="landing-section-title mt-3">Your site stays live.</h2>
              <p className="landing-section-copy mt-5">
                Publish schedules, brackets, registration, payments, and documents from BracketIQ to the website your
                facility already uses.
              </p>
              <div className="landing-integration-chip-row" aria-label="Website integration capabilities">
                {['Event pages', 'Embeds', 'Checkout', 'Documents'].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="landing-integration-visual" aria-label="Connected integration services">
              <div className="landing-website-node">
                <Globe2 aria-hidden="true" className="h-5 w-5" />
                <div>
                  <span>Your website</span>
                  <strong>Live event data</strong>
                </div>
              </div>
              {integrations.map((integration) => (
                <article key={integration.name} className={`landing-integration-logo ${integration.name === 'Google Maps' ? 'gap-2' : ''}`}>
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

        <section id="use-cases" className="landing-anchor-section landing-use-case-section container-responsive pb-20">
          <div className="landing-section-heading landing-section-heading-center landing-section-heading-compact">
            <p className="landing-label">Use cases</p>
            <h2 className="landing-section-title mt-3">Built for every run of play.</h2>
          </div>

          <div className="landing-use-case-row">
            <div className="landing-use-case-copy">
              <p className="landing-label">Use cases</p>
              <h3>One operating layer for the programs that fill your facility.</h3>
              <p>
                Mix leagues, rentals, camps, clubs, and tournaments without changing systems for each format.
              </p>
              <div className="landing-use-case-list">
                {useCases.map((useCase) => (
                  <article key={useCase.label} className="landing-use-case">
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    <div>
                      <h4>{useCase.label}</h4>
                      <p>{useCase.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="landing-use-case-visual">
              <div className="landing-use-case-visual-image">
                <Image
                  {...landingImageProps}
                  src="/landing/org_home_web.png"
                  alt="Facility operations dashboard for mixed programs"
                  width={1919}
                  height={909}
                  sizes="(min-width: 1280px) 760px, (min-width: 768px) 58vw, 100vw"
                  className="landing-use-case-image-content"
                />
              </div>
              <div className="landing-use-case-visual-card landing-use-case-visual-card-primary">
                <span>Formats</span>
                <strong>6</strong>
              </div>
              <div className="landing-use-case-visual-card landing-use-case-visual-card-secondary">
                <span>System</span>
                <strong>One</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="resources" className="landing-anchor-section container-responsive pb-20">
          <div className="landing-resource-panel">
            <div className="landing-resource-copy">
              <p className="landing-label">Resources</p>
              <h2 className="landing-section-title mt-3">Playbooks for better event days.</h2>
              <p className="landing-section-copy mt-4">
                Short guides for scheduling, payments, and team updates.
              </p>
              <Link href="/blog/tournament-schedule-maker" className="landing-btn-primary landing-btn-large mt-7">
                Read schedule guide
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>

            <div className="landing-resource-board" aria-label="Resource highlights">
              <article className="landing-featured-guide">
                <div className="landing-featured-guide-header">
                  <p className="landing-operation-code">Featured guide</p>
                  <span>12 min</span>
                </div>
                <h3>Tournament schedule maker</h3>
                <ul className="landing-resource-point-list">
                  {['Choose format', 'Check conflicts', 'Publish updates'].map((item) => (
                    <li key={item}>
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <div className="landing-resource-highlight-grid">
                {resourceHighlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.label} className="landing-resource-highlight">
                      <div className="landing-icon-box">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="landing-operation-code">{item.label}</p>
                        <h3>{item.title}</h3>
                        <p>{item.detail}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="fees" className="landing-anchor-section container-responsive pb-20">
          <div className="landing-fees-panel">
            <div className="landing-fees-copy landing-section-heading-compact">
              <p className="landing-label">Free To Use</p>
              <h2 className="landing-section-title mt-3">Free to use. Pay only on processing.</h2>
              <p className="landing-section-copy mt-4">
                Run events without a subscription. BracketIQ only takes a 1-3% fee when payments are processed.
              </p>
            </div>

            <div className="landing-payment-visual" aria-hidden="true">
              <span className="landing-money-float landing-money-float-one">$</span>
              <span className="landing-money-float landing-money-float-two">USD</span>
              <span className="landing-money-float landing-money-float-three">$</span>
              <div className="landing-payment-terminal">
                <div className="landing-payment-terminal-header">
                  <div>
                    <p>Payment flow</p>
                    <h3>Processed only when needed</h3>
                  </div>
                  <div className="landing-payment-live">
                    <span />
                    Live
                  </div>
                </div>
                <div className="landing-payment-total-row">
                  <Banknote aria-hidden="true" className="h-6 w-6" />
                  <div>
                    <p>Platform access</p>
                    <strong>$0</strong>
                  </div>
                </div>
                <div className="landing-payment-meter">
                  <span />
                </div>
                <div className="landing-payment-fee-row">
                  <div>
                    <p>Processing fee</p>
                    <strong>1-3%</strong>
                  </div>
                  <ReceiptText aria-hidden="true" className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="landing-fee-grid">
              {feeHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="landing-fee-card">
                    <div className="landing-fee-card-top">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                      <span>{item.value}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="container-responsive pb-10">
          <div className="landing-cta landing-final-cta">
            <div>
              <p className="landing-label-alt">Next step</p>
              <h2 className="landing-section-title mt-3">Bring the next event into one system.</h2>
              <p className="landing-cta-copy mt-4">
                Start with your first league, tournament, facility program, or rental workflow and bring your teams into
                one organized system.
              </p>
            </div>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {showAppCta ? (
                <>
                  <Link href={appHref} className="landing-btn-primary landing-btn-large">
                    Go to app
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  <Link href="/request-demo" className="landing-btn-secondary landing-btn-large">
                    Request demo
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="landing-btn-primary landing-btn-large">
                    Sign up
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  <Link href="/request-demo" className="landing-btn-secondary landing-btn-large">
                    Request demo
                  </Link>
                  <button
                    type="button"
                    onClick={handleContinueAsGuest}
                    disabled={startingGuestSession}
                    className="landing-btn-outline landing-btn-large disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {startingGuestSession ? 'Opening discover...' : 'Continue as guest'}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
