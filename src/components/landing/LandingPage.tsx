'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react';
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

const BRACKET_NODES = [
  { label: '01', title: 'Schedule' },
  { label: '02', title: 'Rosters' },
  { label: '03', title: 'Pay' },
  { label: '04', title: 'Docs' },
  { label: '05', title: 'Comms' },
  { label: 'FINAL', title: 'Ops', final: true },
] as const;

const STICKY_FEATURE_SECTIONS = featureSections;

const FEATURE_STORY_THEMES = [
  'radial-gradient(circle at 78% 18%, rgba(125, 211, 252, 0.38), transparent 30%), linear-gradient(150deg, #082f5f 0%, #075985 52%, #0891b2 100%)',
  'radial-gradient(circle at 78% 18%, rgba(253, 186, 116, 0.34), transparent 30%), linear-gradient(150deg, #4a1d12 0%, #9a3412 52%, #b45309 100%)',
  'radial-gradient(circle at 76% 16%, rgba(134, 239, 172, 0.34), transparent 30%), linear-gradient(150deg, #064e3b 0%, #047857 52%, #4d7c0f 100%)',
  'radial-gradient(circle at 76% 16%, rgba(165, 180, 252, 0.36), transparent 30%), linear-gradient(150deg, #1e1b4b 0%, #3730a3 52%, #2563eb 100%)',
  'radial-gradient(circle at 78% 18%, rgba(251, 113, 133, 0.34), transparent 30%), linear-gradient(150deg, #4a174f 0%, #9d174d 52%, #be123c 100%)',
  'radial-gradient(circle at 78% 18%, rgba(250, 204, 21, 0.34), transparent 30%), linear-gradient(150deg, #0b1220 0%, #243447 52%, #854d0e 100%)',
] as const;

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
    label: 'Mobile participant app',
    title: 'A mobile app for players, parents, and teams.',
    points: [
      'Discover and join events quickly',
      'Register and pay from mobile',
      'Chat in team and group channels',
      'Get push notifications instantly',
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

type LandingImageProps = {
  unoptimized: true;
};

function OperationsFeatureStory({ landingImageProps }: { landingImageProps: LandingImageProps }) {
  const storyRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const clamped = Math.min(0.999, Math.max(0, latest));
    const nextIndex = Math.min(STICKY_FEATURE_SECTIONS.length - 1, Math.floor(clamped * STICKY_FEATURE_SECTIONS.length + 0.08));

    setActiveIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
  });

  if (prefersReducedMotion) {
    return (
      <section id="operations" className="landing-anchor-section landing-operations-section">
        <StaticOperationsContent landingImageProps={landingImageProps} />
      </section>
    );
  }

  return (
    <section id="operations" className="landing-anchor-section landing-operations-section relative overflow-clip">
      <div className="xl:hidden">
        <StaticOperationsContent landingImageProps={landingImageProps} />
      </div>

      <div ref={storyRef} className="relative z-10 hidden h-[600vh] xl:block">
        <div className="sticky top-0 h-screen overflow-hidden [perspective:1600px]">
          {STICKY_FEATURE_SECTIONS.map((feature, index) => (
            <FeatureStoryPage
              key={feature.id}
              feature={feature}
              index={index}
              storyCount={STICKY_FEATURE_SECTIONS.length}
              activeIndex={activeIndex}
              progress={scrollYProgress}
              landingImageProps={landingImageProps}
            />
          ))}
          <div className="landing-feature-progress pointer-events-none absolute bottom-4 left-1/2 z-50 w-[min(58rem,70vw)] -translate-x-1/2">
            <FeatureBracketProgress activeIndex={activeIndex} progress={scrollYProgress} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureStoryPage({
  feature,
  index,
  storyCount,
  activeIndex,
  progress,
  landingImageProps,
}: {
  feature: FeatureSection;
  index: number;
  storyCount: number;
  activeIndex: number;
  progress: MotionValue<number>;
  landingImageProps: LandingImageProps;
}) {
  const transitionCount = Math.max(1, storyCount - 1);
  const segment = 1 / transitionCount;
  const start = Math.min(1, index / transitionCount);
  const end = Math.min(1, (index + 1) / transitionCount);
  const enterPre = Math.max(0, start - segment * 0.92);
  const enterStart = Math.max(enterPre, start - segment * 0.82);
  const enterPeek = Math.max(enterStart, start - segment * 0.56);
  const shrinkStart = start + segment * 0.18;
  const pitchStart = start + segment * 0.44;
  const fallStart = start + segment * 0.66;
  const postExit = Math.min(1, end + segment * 0.42);
  const exitDirection = index % 2 === 0 ? -1 : 1;
  const isLastPage = index === storyCount - 1;
  const Icon = feature.icon;
  const pageProgress: number[] =
    index === 0
      ? [0, shrinkStart, pitchStart, fallStart, end, postExit]
      : isLastPage
        ? [enterPre, enterStart, enterPeek, 1]
        : [enterPre, enterStart, enterPeek, start, shrinkStart, pitchStart, fallStart, end, postExit];
  const yRange: string[] =
    index === 0
      ? ['0%', '0%', '0%', '2%', '6%', '10%']
      : isLastPage
        ? ['112%', '97%', '74%', '0%']
        : ['112%', '97%', '74%', '0%', '0%', '0%', '2%', '6%', '10%'];
  const scaleRange: number[] =
    index === 0
      ? [1, 0.993, 0.982, 0.968, 0.955, 0.945]
      : isLastPage
        ? [1, 1, 1, 1]
        : [1, 1, 1, 1, 0.993, 0.982, 0.968, 0.955, 0.945];
  const rotateZRange: number[] =
    index === 0
      ? [0, exitDirection * 0.08, exitDirection * 0.34, exitDirection * 0.95, exitDirection * 1.55, exitDirection * 1.85]
      : isLastPage
        ? [0, 0, 0, 0]
      : [
          0,
          0,
          0,
          0,
          exitDirection * 0.08,
          exitDirection * 0.34,
          exitDirection * 0.95,
          exitDirection * 1.55,
          exitDirection * 1.85,
        ];
  const rotateXRange: number[] =
    index === 0 ? [0, 1.2, 7, 22, 40, 46] : isLastPage ? [0, 0, 0, 0] : [0, 0, 0, 0, 1.2, 7, 22, 40, 46];
  const rotateYRange: number[] =
    index === 0
      ? [0, exitDirection * 0.14, exitDirection * 0.62, exitDirection * 1.55, exitDirection * 2.7, exitDirection * 3.2]
      : isLastPage
        ? [0, 0, 0, 0]
      : [
          0,
          0,
          0,
          0,
          exitDirection * 0.14,
          exitDirection * 0.62,
          exitDirection * 1.55,
          exitDirection * 2.7,
          exitDirection * 3.2,
        ];
  const y = useTransform(progress, pageProgress, yRange);
  const scale = useTransform(progress, pageProgress, scaleRange);
  const rotateZ = useTransform(progress, pageProgress, rotateZRange);
  const rotateX = useTransform(progress, pageProgress, rotateXRange);
  const rotateY = useTransform(progress, pageProgress, rotateYRange);

  return (
    <motion.div
      aria-hidden={index !== activeIndex}
      className="absolute inset-0 overflow-hidden rounded-b-[2rem]"
      style={{
        y,
        scale,
        rotateZ,
        rotateX,
        rotateY,
        zIndex: index + 1,
        transformOrigin: '50% 100%',
        background: FEATURE_STORY_THEMES[index] ?? FEATURE_STORY_THEMES[0],
      }}
    >
      <div className="landing-feature-story-grid" aria-hidden="true" />
      <div className="pointer-events-none absolute right-10 top-20 z-20 font-sans text-[7rem] font-light leading-none text-white/80 2xl:text-[8rem]">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="relative z-10 mx-auto grid h-full max-w-[1840px] grid-cols-[0.44fr_1.56fr] items-center gap-16 px-12 pb-32 pt-24 2xl:gap-24 2xl:px-16">
        <aside className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm backdrop-blur">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {feature.eyebrow}
          </div>

          <h2 className="mt-5 max-w-2xl text-6xl font-normal leading-[0.94] text-white xl:text-[4.25rem] 2xl:text-7xl">
            {feature.title}
          </h2>

          <p className="mt-5 max-w-md text-base font-semibold leading-7 text-white/74 2xl:mt-7 2xl:text-lg 2xl:leading-8">
            Six connected rounds for scheduling, rosters, payments, documents, communication, and live operations.
          </p>

          <ul
            className="mt-6 grid grid-cols-2 border border-white/18 text-base font-semibold text-white/88 2xl:mt-8"
            aria-label={`${feature.eyebrow} highlights`}
          >
            {feature.points.map((point) => (
              <li key={point} className="flex min-h-[4rem] items-center gap-3 border-r border-white/18 px-5 last:border-r-0 2xl:min-h-[4.75rem] 2xl:px-6">
                <span className="h-2 w-2 rounded-sm bg-white" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>

          <ul className="mt-6 grid gap-3 2xl:mt-9 2xl:gap-4">
            {feature.details.map((detail) => (
              <li key={detail} className="flex items-center gap-3 text-base font-semibold text-white/86 2xl:text-lg">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-white" aria-hidden="true" />
                {detail}
              </li>
            ))}
          </ul>
        </aside>

        <div className="relative flex min-h-[34rem] flex-col justify-end pb-2">
          <div className="relative h-[min(48vh,500px)] min-h-[26rem]">
            <div className="absolute left-8 top-7 z-20 flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm backdrop-blur">
              BracketIQ
              <span className="h-1 w-1 rounded-full bg-white/50" />
              {feature.eyebrow}
            </div>

            <FeatureScene feature={feature} landingImageProps={landingImageProps} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FeatureBracketProgress({
  activeIndex,
  progress,
}: {
  activeIndex: number;
  progress: MotionValue<number>;
}) {
  const progressScale = useTransform(progress, [0, 1], [0, 1]);

  return (
    <div
      className="mx-auto w-full rounded-full bg-slate-950 px-7 py-5 shadow-[0_34px_90px_-52px_rgba(0,0,0,0.86)]"
      role="img"
      aria-label="BracketIQ feature progress toward the final"
    >
      <div className="relative flex min-h-16 items-center justify-between">
        <div className="absolute left-8 right-8 top-7 h-1 rounded-full bg-white/18" aria-hidden="true" />
        <motion.div
          className="absolute left-8 top-7 h-1 origin-left rounded-full bg-white"
          style={{ right: '2rem', scaleX: progressScale }}
          aria-hidden="true"
        />

        {BRACKET_NODES.map((node, index) => {
          const isFinal = 'final' in node && Boolean(node.final);
          const isActive = index === activeIndex;
          const isComplete = index < activeIndex;

          if (isFinal) {
            return (
              <div key={node.label} className="relative z-10 flex min-w-16 flex-col items-center gap-2">
                <span
                  className={`grid min-h-9 min-w-16 place-items-center rounded-full border px-3 text-[0.62rem] font-black transition ${
                    isActive
                      ? 'border-white bg-white text-slate-950'
                      : 'border-white/24 bg-slate-950 text-white/70'
                  }`}
                >
                  FINAL
                </span>
                <span className={`text-[0.62rem] font-black ${isActive ? 'text-white' : 'text-white/52'}`}>
                  {node.title}
                </span>
              </div>
            );
          }

          return (
            <div key={node.label} className="relative z-10 flex min-w-16 flex-col items-center gap-2">
              <span
                className={`grid h-9 w-9 place-items-center rounded-full border text-[0.68rem] font-black transition ${
                  isActive
                    ? 'border-white bg-white text-slate-950'
                    : isComplete
                      ? 'border-white bg-white/95 text-slate-950'
                      : 'border-white/24 bg-slate-950 text-white/55'
                }`}
              >
                {node.label}
              </span>
              <span className={`text-[0.62rem] font-black ${isActive || isComplete ? 'text-white' : 'text-white/52'}`}>
                {node.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeatureScene({
  feature,
  landingImageProps,
}: {
  feature: FeatureSection;
  landingImageProps: LandingImageProps;
}) {
  return (
    <div className="absolute inset-0">
      <div className="absolute left-[2%] top-[13%] w-[74%] overflow-hidden rounded-[2.2rem] bg-white shadow-[0_46px_120px_-72px_rgba(15,23,42,0.82)] ring-1 ring-slate-200/80 2xl:w-[78%] 2xl:rounded-[2.6rem]">
        <Image
          {...landingImageProps}
          src={feature.webImage.src}
          alt={feature.webImage.alt}
          width={feature.webImage.width}
          height={feature.webImage.height}
          sizes="(min-width: 1280px) 920px, 70vw"
          className="h-full w-full object-contain"
        />
      </div>

      {feature.mobileImage ? (
        <div className="absolute right-[1%] top-[5%] w-40 overflow-hidden rounded-[2.25rem] border-[7px] border-slate-950 bg-slate-950 shadow-[0_38px_86px_-48px_rgba(15,23,42,0.84)] 2xl:w-48">
          <Image
            {...landingImageProps}
            src={feature.mobileImage.src}
            alt={feature.mobileImage.alt}
            width={feature.mobileImage.width}
            height={feature.mobileImage.height}
            sizes="160px"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
    </div>
  );
}

function StaticOperationsContent({ landingImageProps }: { landingImageProps: LandingImageProps }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
      <div className="max-w-3xl">
        <p className="inline-flex w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-800">
          Features
        </p>

        <h2 className="mt-4 text-5xl font-black leading-[0.95] text-slate-950 sm:text-6xl">
          From setup to final.
        </h2>

        <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-slate-600">
          BracketIQ connects scheduling, teams, payments, documents, communication, and live operations in one
          tournament management engine.
        </p>
      </div>

      <div className="mt-10 grid gap-5">
        {featureSections.map((feature, index) => {
          const Icon = feature.icon;

          return (
            <article
              key={feature.id}
              className="landing-operation-scroll-panel overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-[0_34px_86px_-68px_rgba(15,23,42,0.78)] ring-1 ring-slate-200/70 backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-800 ring-1 ring-blue-100">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>

                  <p className="mt-5 text-xs font-black uppercase tracking-wide text-blue-800">
                    Round {String(index + 1).padStart(2, '0')} / {feature.eyebrow}
                  </p>

                  <h3 className="mt-2 text-3xl font-black text-slate-950">{feature.title}</h3>
                </div>
              </div>

              <ul className="mt-5 grid gap-3">
                {feature.details.map((detail) => (
                  <li key={detail} className="flex items-center gap-2 text-sm font-black text-slate-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                    {detail}
                  </li>
                ))}
              </ul>

              <div className="mt-6 grid min-w-0 items-center gap-3 sm:grid-cols-[1fr_auto]">
                <div className="overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-54px_rgba(15,23,42,0.72)] ring-1 ring-slate-200">
                  <Image
                    {...landingImageProps}
                    src={feature.webImage.src}
                    alt={feature.webImage.alt}
                    width={feature.webImage.width}
                    height={feature.webImage.height}
                    sizes="100vw"
                    className="h-full w-full object-contain"
                  />
                </div>

                {feature.mobileImage ? (
                  <div className="hidden w-28 overflow-hidden rounded-[1.75rem] border-4 border-slate-950 bg-slate-950 shadow-xl sm:block">
                    <Image
                      {...landingImageProps}
                      src={feature.mobileImage.src}
                      alt={feature.mobileImage.alt}
                      width={feature.mobileImage.width}
                      height={feature.mobileImage.height}
                      sizes="112px"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function LandingPage({
  brandHref = '/',
  anchorHrefPrefix = '',
  heroMediaLayout = 'stacked',
}: LandingPageProps) {
  const { user, isAuthenticated, isGuest } = useApp();
  const router = useRouter();
  const [startingGuestSession, setStartingGuestSession] = useState(false);
  const [guestError, setGuestError] = useState('');
  const appHref = getHomePathForUser(user);
  const showAppCta = isAuthenticated && !isGuest;
  const isHeroMediaHorizontal = heroMediaLayout === 'horizontal';
  const landingImageProps = {
    unoptimized: true,
  } as const;

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
          <div className="landing-hero-shapes" aria-hidden="true">
            <span className="landing-hero-shape landing-hero-shape-one" />
            <span className="landing-hero-shape landing-hero-shape-two" />
            <span className="landing-hero-shape landing-hero-shape-three" />
          </div>
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
                  <Link href="/request-demo" className="landing-btn-primary landing-btn-large">
                    Request demo
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
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

        <section id="platform" className="landing-anchor-section landing-platform-section container-responsive py-20">
          <div className="landing-platform-layout">
            <div className="landing-platform-intro">
              <h2 className="landing-platform-title">
                Run tournaments from the web.
                <span>Keep everyone updated from mobile.</span>
              </h2>
            </div>
            {platformColumns.map((column) => {
              const Icon = column.icon;
              const isMobileLayer = column.label.includes('Mobile');
              return (
                <article key={column.label} className={`landing-platform-card ${isMobileLayer ? 'landing-platform-card-mobile' : 'landing-platform-card-web'}`}>
                  <div className="landing-platform-card-copy">
                    <div className="landing-platform-icon-box">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <p className="landing-label">{column.label}</p>
                    <h3 className="landing-card-title">{column.title}</h3>
                    <ul className="landing-check-list">
                      {column.points.map((point) => (
                        <li key={point}>
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    <a href={isMobileLayer ? '#operations' : '#operations'} className="landing-platform-link">
                      {isMobileLayer ? 'See the mobile experience' : 'Explore organizer tools'}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </a>
                  </div>
                  <div className={isMobileLayer ? 'landing-platform-device landing-platform-device-phone' : 'landing-platform-device landing-platform-device-laptop'}>
                    {isMobileLayer ? (
                      <div className="landing-phone-frame landing-platform-phone-frame">
                        <div className="landing-phone-screen">
                          <Image
                            {...landingImageProps}
                            src={column.image.src}
                            alt={column.image.alt}
                            width={column.image.width}
                            height={column.image.height}
                            sizes="(min-width: 1280px) 13rem, (min-width: 768px) 18vw, 46vw"
                            className="landing-phone-image"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="landing-macbook-frame">
                        <div className="landing-macbook-screen">
                          <Image
                            {...landingImageProps}
                            src={column.image.src}
                            alt={column.image.alt}
                            width={column.image.width}
                            height={column.image.height}
                            sizes="(min-width: 1280px) 30rem, (min-width: 1024px) 28vw, 88vw"
                            className="landing-macbook-image"
                          />
                        </div>
                        <div className="landing-macbook-base" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <OperationsFeatureStory landingImageProps={landingImageProps} />

        <section
          className="landing-post-scroll-section landing-workflow-section container-responsive pb-20"
          aria-labelledby="landing-workflow-title"
        >
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

        <section id="integrations" className="landing-anchor-section landing-post-scroll-section container-responsive pb-20">
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

        <section
          id="use-cases"
          className="landing-anchor-section landing-post-scroll-section landing-use-case-section container-responsive pb-20"
        >
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

        <section id="resources" className="landing-anchor-section landing-post-scroll-section container-responsive pb-20">
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

        <section id="fees" className="landing-anchor-section landing-post-scroll-section container-responsive pb-20">
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

      </main>

      <footer className="landing-final-cta relative overflow-hidden bg-slate-950 text-white">
        <div className="landing-final-cta-bg" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-5 py-28 lg:px-8">
          <h2 className="max-w-5xl text-6xl font-black leading-[0.92] text-white sm:text-7xl lg:text-8xl">
            Run the whole tournament, not just the bracket.
          </h2>

          <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/65">
            BracketIQ keeps courts, teams, payments, documents, updates, and live operations connected from setup
            through championship day.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            {showAppCta ? (
              <>
                <Link
                  href={appHref}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-black text-slate-950 transition hover:bg-white/90"
                >
                  Go to app
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  href="/request-demo"
                  className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Request demo
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-black text-slate-950 transition hover:bg-white/90"
                >
                  Sign up
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  href="/request-demo"
                  className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Request demo
                </Link>
                <button
                  type="button"
                  onClick={handleContinueAsGuest}
                  disabled={startingGuestSession}
                  className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {startingGuestSession ? 'Opening discover...' : 'Continue as guest'}
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
