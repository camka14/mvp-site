import Link from 'next/link';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="container-responsive flex flex-col gap-4 py-6 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-slate-900">BracketIQ by Razumly</p>
          <p>Discover events, manage teams, and run leagues and tournaments in one place.</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/privacy-policy" className="transition hover:text-slate-900">
            Privacy Policy
          </Link>
          <Link href="/delete-data" className="transition hover:text-slate-900">
            Delete Data
          </Link>
          <a href="mailto:support@bracket-iq.com" className="transition hover:text-slate-900">
            support@bracket-iq.com
          </a>
          <span className="text-slate-500">{year} BracketIQ</span>
        </div>
      </div>
    </footer>
  );
}
