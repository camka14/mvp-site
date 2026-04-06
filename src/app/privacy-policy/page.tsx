import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Privacy Policy | BracketIQ by Razumly',
  description: 'Privacy Policy for BracketIQ by Razumly, including what data we collect, how it is used, and how data deletion requests are handled.',
  alternates: {
    canonical: '/privacy-policy',
  },
  openGraph: {
    title: 'Privacy Policy | BracketIQ by Razumly',
    description: 'Review how BracketIQ by Razumly collects, uses, retains, and protects personal information.',
    url: `${SITE_URL}/privacy-policy`,
  },
};

const lastUpdated = 'March 11, 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container-responsive py-10 sm:py-14">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 space-y-4">
            <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
              Privacy Policy
            </p>
            <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">Privacy Policy</h1>
            <p className="text-sm text-slate-500">Last updated: {lastUpdated}</p>
          </div>

          <div className="space-y-6">
            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Introduction</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
                Welcome to <strong>BracketIQ by Razumly</strong> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). This Privacy Policy explains how we collect, use, protect, retain, and disclose information when you use BracketIQ to discover events, register for leagues and tournaments, manage teams, communicate with participants, sign documents, and process payments.
              </p>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Information We Collect</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700 sm:text-base">
                <li><strong>Account information:</strong> Name, username, email address, date of birth, profile image, and other profile details you provide.</li>
                <li><strong>Event and team data:</strong> Information about events, organizations, teams, registrations, schedules, invites, and participation history.</li>
                <li><strong>Payments and billing records:</strong> Subscription details, bills, Stripe-related account identifiers, refund requests, and payment records.</li>
                <li><strong>Messages and files:</strong> Chat messages, uploaded files, signed documents, and document workflow records.</li>
                <li><strong>Device and usage data:</strong> Technical information such as device type, browser, IP address, session data, and feature usage.</li>
                <li><strong>Location-related data:</strong> Approximate or provided location information used for discovery, maps, or venue context where applicable.</li>
              </ul>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">How We Use Information</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700 sm:text-base">
                <li>Provide and maintain BracketIQ features and user accounts.</li>
                <li>Support event creation, registration, team management, scheduling, standings, chat, billing, and documents.</li>
                <li>Process subscriptions, bills, refunds, and other payment-related activity.</li>
                <li>Authenticate users, secure accounts, prevent abuse, and enforce permissions.</li>
                <li>Improve product performance, reliability, and user experience.</li>
                <li>Communicate service updates, account notices, billing issues, support responses, and policy updates.</li>
              </ul>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Data Sharing</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
                We do not sell your personal information. We may share limited information in the following situations:
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700 sm:text-base">
                <li><strong>With other users:</strong> Basic profile and participation information may be visible within teams, events, organizations, schedules, or historical results.</li>
                <li><strong>With service providers:</strong> Vendors that support payments, maps, storage, authentication, document signing, notifications, or infrastructure may process data on our behalf.</li>
                <li><strong>For legal compliance:</strong> We may disclose information when required by law, regulation, legal process, or to protect rights, safety, and platform integrity.</li>
              </ul>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Data Retention and Account Deletion</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 sm:text-base">
                <p>
                  We retain information only as long as needed for operational, legal, billing, security, and recordkeeping purposes. If you want to request deletion of your BracketIQ account data, review our{' '}
                  <Link href="/delete-data" className="font-semibold text-[var(--ocean-primary)] underline underline-offset-4">
                    Delete Data
                  </Link>{' '}
                  page.
                </p>
                <p>
                  When a deletion request is approved, authentication data is deleted and the account is cleaned up, including friend connections, templates, active subscriptions, invites, and active team membership.
                </p>
                <p>
                  Some records are retained because they are matters of public, billing, compliance, or historical record. These include the user&apos;s name, username, limited inactive user record, Stripe account association, signed documents, completed-event participation records, and refund workflows that must remain open until resolved.
                </p>
                <p>
                  Messages and files are retained for 90 days before deletion. Pending refund requests owed to the user must be addressed before account deletion can be completed.
                </p>
              </div>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Your Rights</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700 sm:text-base">
                <li>Access information we maintain about your account.</li>
                <li>Request correction of inaccurate account information.</li>
                <li>Request deletion of account data, subject to legal, billing, operational, and recordkeeping constraints.</li>
                <li>Contact us with questions about how your data is used or retained.</li>
              </ul>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Security</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
                We use administrative, technical, and organizational safeguards designed to protect personal information. No method of transmission or storage is completely secure, but we take reasonable steps to limit unauthorized access, disclosure, or misuse.
              </p>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Children&apos;s Privacy</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
                Some BracketIQ workflows support parent, guardian, and family registration scenarios. If you believe information was provided inappropriately or have a privacy concern involving a minor, contact us and we will review the matter.
              </p>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Changes to This Policy</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
                We may update this Privacy Policy from time to time. If material changes are made, we will update the date on this page and may provide additional notice where appropriate.
              </p>
            </section>

            <section className="landing-surface rounded-3xl p-6 sm:p-7">
              <h2 className="text-2xl font-semibold text-slate-900">Contact</h2>
              <div className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Questions about privacy or data requests</p>
                <p className="mt-2">
                  Email:{' '}
                  <a className="font-semibold text-[var(--ocean-primary)] underline underline-offset-4" href="mailto:support@bracket-iq.com">
                    support@bracket-iq.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
