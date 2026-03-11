import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Delete Data | BracketIQ by Razumly',
  description:
    'How to request deletion of your BracketIQ account data, what is removed, what is retained, and how long retained data stays on file.',
  alternates: {
    canonical: '/delete-data',
  },
  openGraph: {
    title: 'Delete Data | BracketIQ by Razumly',
    description:
      'Request account deletion for BracketIQ and review what data is deleted, retained, or delayed for recordkeeping.',
    url: 'https://mvp.razumly.com/delete-data',
  },
};

const requestSteps = [
  'Email support@bracket-iq.com from the email address associated with your BracketIQ account.',
  'Include your full name and username so BracketIQ by Razumly can verify the request and locate the correct account.',
  'Any pending refund requests owed to you must be addressed before the account can be deleted.',
];

const deletedData = [
  'Authentication data, including sign-in access and active account sessions.',
  'Friend connections and related social graph cleanup.',
  'Saved templates associated with the account.',
  'Outstanding invites are declined.',
  'Active subscriptions are cancelled.',
  'The user is removed from active teams.',
];

const delayedDeletion = [
  'Messages are retained for 90 days before deletion.',
  'Files are retained for 90 days before deletion.',
];

const retainedRecords = [
  'First name, last name, and username remain attached to historical event records and billing records.',
  'The limited UserData record is retained in an inactive state because event history and bills are matters of record.',
  'Signed documents remain on file as a matter of record.',
  'The Stripe account associated with the user remains on file as a matter of record.',
  'The user is not removed from events that have already finished.',
  'Pending refund requests created toward other parties remain open until the other party addresses them.',
];

const additionalNotes = [
  'Once the deletion request is processed, the account is no longer considered active.',
  'BracketIQ may contact you by email if more information is needed to verify the request or resolve refund issues first.',
];

function SectionCard({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: string[];
}) {
  return (
    <section className="landing-surface rounded-3xl p-6 sm:p-7">
      <p className="landing-label text-xs uppercase tracking-[0.16em]">{eyebrow}</p>
      <h2 className="landing-section-title mt-3 text-2xl font-semibold">{title}</h2>
      <ul className="landing-section-copy mt-4 space-y-3 text-sm sm:text-base">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden="true" className="mt-1 text-[0.8rem] text-[var(--landing-accent-text)]">
              ●
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DeleteDataPage() {
  return (
    <main className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <header className="landing-header sticky top-0 z-20 backdrop-blur-lg">
        <div className="container-responsive flex items-center justify-between py-4">
          <Link href="/" className="landing-brand text-lg font-semibold tracking-wide">
            BracketIQ
          </Link>
          <Link
            href="/login"
            className="landing-btn-secondary inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold transition"
          >
            Login
          </Link>
        </div>
      </header>

      <section className="container-responsive relative py-16 sm:py-20">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
              Data Deletion Instructions
            </p>
            <div className="space-y-4">
              <h1 className="landing-title max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                Delete your BracketIQ account data.
              </h1>
              <p className="landing-copy max-w-2xl text-base sm:text-lg">
                This page explains how users of <strong>BracketIQ by Razumly</strong> can request account deletion,
                what data is deleted, what data is retained, and the retention periods that apply.
              </p>
            </div>
            <div className="landing-surface-strong rounded-3xl p-6 sm:p-7">
              <p className="landing-label text-xs uppercase tracking-[0.16em]">How To Request Deletion</p>
              <ol className="landing-section-copy mt-4 space-y-4 text-sm sm:text-base">
                {requestSteps.map((step, index) => (
                  <li key={step} className="flex gap-4">
                    <span className="landing-note-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="landing-note-secondary mt-5 rounded-2xl p-4 text-sm">
                Contact email:{' '}
                <a className="font-semibold text-[var(--landing-accent-text)] underline underline-offset-4" href="mailto:support@bracket-iq.com">
                  support@bracket-iq.com
                </a>
              </div>
            </div>
          </div>

          <aside className="landing-cta rounded-3xl p-6 sm:p-7">
            <p className="landing-label-alt text-xs uppercase tracking-[0.16em]">Before Deletion Can Finish</p>
            <h2 className="landing-section-title mt-3 text-2xl font-semibold">Refund requests matter.</h2>
            <div className="landing-cta-copy mt-4 space-y-3 text-sm sm:text-base">
              <p>
                If there is a pending refund request owed to you, it must be addressed before BracketIQ can complete
                account deletion.
              </p>
              <p>
                If you opened a refund request toward someone else, that request stays on file until the other party
                addresses it.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="container-responsive relative grid gap-6 pb-20 md:grid-cols-2">
        <SectionCard eyebrow="Deleted" title="Data deleted when the request is processed" items={deletedData} />
        <SectionCard eyebrow="90-Day Retention" title="Data kept briefly before deletion" items={delayedDeletion} />
        <SectionCard eyebrow="Retained" title="Data kept for historical, billing, and compliance records" items={retainedRecords} />
        <SectionCard eyebrow="Notes" title="Additional details" items={additionalNotes} />
      </section>
    </main>
  );
}
