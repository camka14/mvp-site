import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Terms and EULA | BracketIQ by Razumly',
  description:
    'Terms of Service and End User License Agreement for BracketIQ, including user content, payments, staff payroll tools, QuickBooks, and third-party integrations.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms and EULA | BracketIQ by Razumly',
    description:
      'Review the BracketIQ Terms of Service and End User License Agreement for web, mobile, and connected services.',
    url: `${SITE_URL}/terms`,
  },
};

const lastUpdated = 'June 10, 2026';

const sections = [
  {
    title: '1. Agreement to these terms',
    body: [
      'These Terms of Service and End User License Agreement apply to BracketIQ by Razumly, including the BracketIQ website, mobile apps, organization tools, event tools, team tools, payment workflows, staff finance tools, and connected integrations. By creating an account, using BracketIQ, joining an event, sending messages, creating content, managing an organization, or connecting an external service, you agree to these terms.',
      'If you use BracketIQ on behalf of an organization, club, facility, team, or business, you represent that you have authority to bind that organization to these terms. If you do not agree, do not use BracketIQ.',
    ],
  },
  {
    title: '2. Account and organization responsibilities',
    body: [
      'You are responsible for the information, settings, permissions, registrations, prices, refund rules, schedules, staff assignments, payroll records, and customer communications you create or manage in BracketIQ.',
      'Organization owners and staff administrators are responsible for choosing who can access organization data and for removing access when staff, contractors, or service providers no longer need it.',
    ],
  },
  {
    title: '3. License to use BracketIQ',
    body: [
      'Razumly grants you a limited, revocable, non-exclusive, non-transferable license to use BracketIQ for lawful event, team, facility, organization, registration, communication, billing, and operations purposes.',
      'You may not copy, sell, sublicense, reverse engineer, disrupt, scrape, overload, bypass access controls, or use BracketIQ to build a competing service except where applicable law gives you a non-waivable right to do so.',
    ],
  },
  {
    title: '4. User content and moderation',
    body: [
      'You retain responsibility for event names, descriptions, chat messages, files, images, team data, organization pages, documents, and other content you provide. You grant Razumly the rights needed to host, process, display, transmit, moderate, and back up that content so BracketIQ can operate.',
      'BracketIQ does not tolerate objectionable content, abusive users, harassment, threats, hate, sexual exploitation, attempts to evade moderation, or other harmful conduct. Users can report chats, report events, and block abusive users. Moderation reports are reviewed within 24 hours, and confirmed violations may result in hidden content, ejection, suspension, or account termination.',
    ],
  },
  {
    title: '5. Events, registrations, payments, and refunds',
    body: [
      'BracketIQ provides tools for organizers to create events, collect registrations, schedule fields or courts, manage teams, track payments, and communicate with participants. Organizers remain responsible for event safety, eligibility rules, refund decisions, taxes, permits, insurance, venue policies, and compliance with applicable laws.',
      'Payment processing may be handled through Stripe or another payment provider. Provider fees, chargebacks, disputes, taxes, payout holds, account requirements, and refund timing may be controlled by the payment provider and are not guaranteed by BracketIQ.',
    ],
  },
  {
    title: '6. Staff finance, payroll, and accounting tools',
    body: [
      'BracketIQ may provide staff wage records, labor line items, pay-run approvals, CSV exports, accounting handoffs, and profit or cost analysis. These tools are operational records and planning aids. BracketIQ is not a payroll provider, employer of record, accounting firm, tax advisor, or law firm.',
      'Organizations are responsible for wage classifications, pay rates, overtime, payroll taxes, tax forms, worker authorization, employment law compliance, approvals, record retention, and payment of staff, contractors, officials, coaches, and managers.',
    ],
  },
  {
    title: '7. QuickBooks and external services',
    body: [
      'BracketIQ may let you connect external products such as QuickBooks Online, Stripe, BoldSign, Google services, Apple services, mapping providers, email providers, storage providers, or other third-party tools. Connecting an external service authorizes BracketIQ to send, receive, store, transform, and display data as needed for the features you enable.',
      'External services are provided by their own companies and are governed by their own agreements, privacy practices, account requirements, permissions, outages, limits, fees, and support policies. You are responsible for reviewing data before syncing, exporting, or relying on it for accounting, payroll, tax, payment, legal, or compliance purposes.',
      'You can disconnect optional integrations through BracketIQ settings where available or through the external provider. Disconnecting may not delete historical records, audit logs, transactions, exported files, signed documents, or data already processed by the external service.',
    ],
  },
  {
    title: '8. Third-party links and provider terms',
    body: [
      'Third-party links are provided for convenience. BracketIQ is not responsible for third-party services, websites, documentation, terms, privacy statements, accuracy, uptime, security incidents, support, pricing changes, or product decisions.',
      'For connected services, your use may also be subject to provider agreements such as Intuit/QuickBooks terms, Intuit privacy statements, Stripe services agreements, Stripe connected account terms, BoldSign legal terms, app store terms, and any other provider terms that apply to the products you choose to use.',
    ],
  },
  {
    title: '9. Privacy and data handling',
    body: [
      'Our Privacy Policy explains what information BracketIQ collects, how it is used, how long certain records are retained, and how deletion requests are handled. Some records may be retained for billing, security, audit, dispute, legal, tax, or operational reasons even after an account or integration is disconnected.',
    ],
  },
  {
    title: '10. Availability, changes, and termination',
    body: [
      'BracketIQ may change, suspend, limit, or discontinue features, integrations, or access when needed for maintenance, security, abuse prevention, provider requirements, legal compliance, or product changes.',
      'We may suspend or terminate accounts, organizations, events, integrations, or access when users violate these terms, create risk for other users, fail payment or provider requirements, or use BracketIQ unlawfully.',
    ],
  },
  {
    title: '11. Disclaimers and limitation of liability',
    body: [
      'BracketIQ is provided on an as-is and as-available basis. To the fullest extent permitted by law, Razumly disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, uninterrupted operation, error-free operation, and accuracy of projections, schedules, accounting outputs, payroll exports, or integration data.',
      'To the fullest extent permitted by law, Razumly will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost revenue, lost data, business interruption, event cancellation, provider outages, payment disputes, payroll errors, tax consequences, or reliance on analysis outputs.',
    ],
  },
  {
    title: '12. Updates and contact',
    body: [
      'We may update these terms as BracketIQ changes. The updated date above identifies the current version. Continued use after changes means you accept the updated terms.',
      'Questions about these terms can be sent to support@bracket-iq.com.',
    ],
  },
];

const providerLinks = [
  {
    label: 'QuickBooks Online Terms',
    href: 'https://www.intuit.com/legal/terms/en-us/quickbooks/online/',
  },
  {
    label: 'Intuit Privacy Statement',
    href: 'https://www.intuit.com/privacy/statement/',
  },
  {
    label: 'Stripe Services Agreement',
    href: 'https://stripe.com/legal/ssa',
  },
  {
    label: 'Stripe Connected Account Agreement',
    href: 'https://stripe.com/legal/connect-account',
  },
  {
    label: 'BoldSign Legal Center',
    href: 'https://boldsign.com/legalcenter/',
  },
  {
    label: 'Apple Standard EULA',
    href: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container-responsive py-10 sm:py-14">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 space-y-4">
            <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
              Terms and EULA
            </p>
            <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
              BracketIQ Terms of Service and End User License Agreement
            </h1>
            <p className="text-sm text-slate-500">Last updated: {lastUpdated}</p>
            <p className="text-base leading-7 text-slate-700">
              This agreement covers use of BracketIQ on the web and mobile apps, including organization
              management, events, teams, payments, documents, staff finance tools, payroll exports,
              QuickBooks connections, and other external integrations.
            </p>
          </div>

          <div className="space-y-6">
            {sections.map((section) => (
              <section key={section.title} className="landing-surface rounded-3xl p-6 sm:p-7">
                <h2 className="text-2xl font-semibold text-slate-900">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 sm:text-base">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Provider terms and resources</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
                These links may help you review terms for external products you choose to connect or use
                with BracketIQ.
              </p>
              <ul className="mt-4 grid gap-2 text-sm leading-7 text-slate-700 sm:grid-cols-2 sm:text-base">
                {providerLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      className="font-semibold text-[var(--ocean-primary)] underline underline-offset-4"
                      href={link.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Related BracketIQ policies</h2>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold sm:text-base">
                <Link
                  className="rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  href="/privacy-policy"
                >
                  Privacy Policy
                </Link>
                <Link
                  className="rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  href="/delete-data"
                >
                  Delete Data
                </Link>
              </div>
            </section>

            <p className="text-sm text-slate-500">
              Questions about these terms can be sent to{' '}
              <Link className="underline" href="mailto:support@bracket-iq.com">
                support@bracket-iq.com
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
