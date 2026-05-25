import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Building2, CalendarCheck, CreditCard, Megaphone, Trophy, UsersRound } from 'lucide-react';
import GuideTopicNav from '@/components/guides/GuideTopicNav';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import { getGuideTopics } from '@/lib/blog';
import { SITE_URL } from '@/lib/siteUrl';

const guidesHeaderNavItems = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

const capabilitySections = [
  {
    title: 'Events, leagues, and tournaments',
    description:
      'Create one-off events, recurring leagues, and tournament formats from the same organizer workspace.',
    icon: CalendarCheck,
    points: ['Public event pages', 'Divisions and registration rules', 'Schedules, brackets, and standings'],
  },
  {
    title: 'Teams, players, and organizations',
    description:
      'Keep participants, rosters, staff, facilities, and organization pages connected instead of split across spreadsheets and messages.',
    icon: UsersRound,
    points: ['Team and player records', 'Organization public pages', 'Staff access and operational context'],
  },
  {
    title: 'Payments and registration',
    description:
      'Let players register online, see event details, and pay from the same flow organizers use to manage the event.',
    icon: CreditCard,
    points: ['Paid pickup events', 'League and tournament registration', 'Payment status visibility'],
  },
  {
    title: 'Day-of operations',
    description:
      'Use BracketIQ as the source of truth when schedules change, teams check in, scores are entered, or brackets move forward.',
    icon: Trophy,
    points: ['Schedule review', 'Score entry workflows', 'Bracket and advancement checks'],
  },
  {
    title: 'Facility and club workflows',
    description:
      'Support clubs, facilities, and event organizers that need public listings, rentals, payments, staff workflows, and repeat participants.',
    icon: Building2,
    points: ['Facilities and clubs', 'Courts, fields, and rentals', 'Multi-sport operations'],
  },
  {
    title: 'Communication and mobile access',
    description:
      'Give participants and staff a clear place to find event updates from the web or mobile app.',
    icon: Megaphone,
    points: ['Public updates', 'Participant access', 'Mobile-friendly workflows'],
  },
];

export const metadata: Metadata = {
  title: 'Guides | BracketIQ by Razumly',
  description:
    'Step-by-step BracketIQ guides for creating and managing events, tournaments, leagues, and sports organizations.',
  alternates: {
    canonical: '/guides',
  },
  openGraph: {
    title: 'Guides | BracketIQ by Razumly',
    description:
      'Step-by-step BracketIQ guides for creating and managing events, tournaments, leagues, and sports organizations.',
    url: `${SITE_URL}/guides`,
  },
};

export default function GuidesPage() {
  const topics = getGuideTopics();

  return (
    <div className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <MarketingHeader navItems={guidesHeaderNavItems} />

      <main className="relative">
        <section className="marketing-page-hero container-responsive relative pb-10 pt-12 lg:pb-12 lg:pt-16">
          <div className="max-w-4xl space-y-6" data-reveal>
            <p className="landing-kicker inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <BookOpen aria-hidden="true" className="h-4 w-4" />
              BracketIQ Guides
            </p>
            <h1 className="landing-title text-4xl font-semibold sm:text-5xl">
              Learn the BracketIQ workflows that run your events.
            </h1>
            <p className="landing-copy max-w-3xl text-base sm:text-lg">
              Guides are product tutorials for setting up and managing BracketIQ. Use them when you need the exact workflow for events, tournaments, leagues, or organizations.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="landing-btn-primary landing-btn-large">
                Open BracketIQ
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href="/blog" className="landing-btn-secondary landing-btn-large">
                Read the blog
              </Link>
            </div>
          </div>
        </section>

        <section className="container-responsive relative pb-20">
          <div className="guide-shell">
            <GuideTopicNav topics={topics} />
            <div className="guide-main space-y-10">
              <section className="guide-overview">
                <div>
                  <p className="landing-label">BracketIQ overview</p>
                  <h2 className="landing-section-title mt-3 text-3xl font-semibold">
                    BracketIQ connects the moving parts behind recreational sports operations.
                  </h2>
                  <p className="landing-section-copy mt-4 max-w-3xl text-base leading-8">
                    Use this page to understand what the platform can manage. When you need exact click-by-click steps, use the guide menu on the left to open the workflow for events, tournaments, leagues, or organizations.
                  </p>
                </div>
              </section>

              <section className="guide-capability-band">
                <div className="marketing-section-row">
                  <div>
                    <p className="landing-label">Platform capabilities</p>
                    <h2 className="landing-section-title mt-2 text-3xl font-semibold">What BracketIQ helps you run</h2>
                  </div>
                  <p className="landing-section-copy text-sm">
                    The guides explain the workflows. This overview explains the operating system those workflows fit into.
                  </p>
                </div>
                <div className="guide-capability-grid mt-8">
                  {capabilitySections.map((section) => {
                    const Icon = section.icon;
                    return (
                      <article key={section.title} className="guide-capability-card">
                        <div className="guide-capability-icon">
                          <Icon aria-hidden="true" className="h-5 w-5" />
                        </div>
                        <div>
                          <h3>{section.title}</h3>
                          <p>{section.description}</p>
                          <ul>
                            {section.points.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="guide-workflow-note">
                <div>
                  <p className="landing-label">How to use guides</p>
                  <h2 className="landing-section-title mt-2 text-3xl font-semibold">Start with the job you need to finish.</h2>
                </div>
                <div className="guide-workflow-steps">
                  {[
                    'Choose the guide topic in the left menu.',
                    'Open the setup or management workflow that matches your task.',
                    'Follow the screenshots and end-user instructions inside the guide.',
                  ].map((step, index) => (
                    <article key={step}>
                      <span>{index + 1}</span>
                      <p>{step}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
