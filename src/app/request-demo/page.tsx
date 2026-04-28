import type { Metadata } from 'next';
import { ArrowRight, BadgeCheck, CalendarDays, MessageSquareText, MonitorSmartphone } from 'lucide-react';
import RequestDemoForm from './RequestDemoForm';
import { SITE_URL } from '@/lib/siteUrl';
import MarketingHeader from '@/components/marketing/MarketingHeader';

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
  const demoHighlights = [
    {
      title: 'Map the event flow',
      detail: 'Formats, divisions, courts, fields, and team movement.',
      icon: CalendarDays,
    },
    {
      title: 'Review admin work',
      detail: 'Registration, payments, waivers, refunds, and day-of updates.',
      icon: BadgeCheck,
    },
    {
      title: 'Cover web + mobile',
      detail: 'Staff controls on web and participant updates on mobile.',
      icon: MonitorSmartphone,
    },
  ];

  return (
    <div className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <MarketingHeader anchorHrefPrefix="/info" hideRequestDemoCta />

      <main className="relative">
        <section className="marketing-page-hero container-responsive relative grid gap-10 pb-16 pt-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:pb-24 lg:pt-16">
          <div className="marketing-hero-copy space-y-7" data-reveal>
            <p className="landing-kicker inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <MessageSquareText aria-hidden="true" className="h-4 w-4" />
              Request Demo
            </p>
            <h1 className="landing-title max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
              See BracketIQ around the event you need to run.
            </h1>
            <p className="landing-copy max-w-2xl text-base leading-8 sm:text-lg">
              Share the format, volume, and workflow you care about. We will follow up with a walkthrough focused on your operation.
            </p>

            <div className="marketing-signal-grid">
              {demoHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="marketing-signal-card">
                    <div className="landing-icon-box">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div>
                      <h2>{item.title}</h2>
                      <p>{item.detail}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <a href="mailto:support@bracket-iq.com" className="landing-btn-secondary landing-btn-large">
              Email support
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>

          <div className="marketing-form-wrap" data-reveal data-delay="1">
            <div className="landing-command-header marketing-form-header">
              <div>
                <p className="landing-command-label">Demo intake</p>
                <p className="landing-command-title">Tell us what you run</p>
              </div>
              <div className="landing-command-status">
                <span aria-hidden="true" />
                Open
              </div>
            </div>
            <RequestDemoForm />
          </div>
        </section>
      </main>
    </div>
  );
}
