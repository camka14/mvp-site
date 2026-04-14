import Link from 'next/link';

const termsSections = [
  {
    title: 'Content Creation Access',
    body: 'Creating chats, events, or other user-generated content requires agreement to the Bracket IQ Terms and EULA. If you do not agree, those creation flows stay unavailable until you accept.',
  },
  {
    title: 'No Tolerance Policy',
    body: 'Bracket IQ does not tolerate objectionable content, abusive users, harassment, threats, or other harmful conduct.',
  },
  {
    title: 'Reports And Blocks',
    body: 'Users can report chat groups, report events, and block abusive users. Blocking can immediately remove shared chats from the blocker’s feed and may also remove the blocker from shared chats.',
  },
  {
    title: 'Moderation Timeline',
    body: 'Moderation reports are reviewed within 24 hours. When objectionable content is confirmed, the content is removed and the offending user is ejected or suspended.',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Bracket IQ Terms And EULA
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Content creation consent and moderation terms</h1>
          <p className="max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
            These terms apply when you create chats, create events, report content, block abusive users, and use other user-generated content flows in Bracket IQ.
          </p>
        </div>

        <div className="grid gap-4">
          {termsSections.map((section) => (
            <section
              key={section.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-5"
            >
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-5">
          <h2 className="text-lg font-semibold">Key enforcement points</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--muted-foreground)]">
            <li>Event names and descriptions are filtered against objectionable-language denylist rules.</li>
            <li>Reporting an event hides that event from the reporting user’s event results.</li>
            <li>Chat groups and messages are preserved for moderator review even when they are hidden from end users.</li>
            <li>Unblocking removes the block relationship but does not restore friendships, follows, or chat memberships.</li>
          </ul>
        </section>

        <p className="text-sm text-[var(--muted-foreground)]">
          Questions about moderation can be sent to{' '}
          <Link className="underline" href="mailto:support@bracket-iq.com">
            support@bracket-iq.com
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
