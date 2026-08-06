import type { Metadata } from 'next';
import Navigation from '@/components/layout/Navigation';
import FeedbackPageClient from './FeedbackPageClient';

export const metadata: Metadata = {
  title: 'Send Feedback | BracketIQ',
  description: 'Report a problem, suggest an idea, or send general feedback to BracketIQ.',
  alternates: {
    canonical: '/feedback',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function FeedbackPage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">BracketIQ feedback</p>
            <h1 className="mt-3 text-4xl font-bold text-slate-900">Send feedback</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Tell us what is working, what is not, or what would make your sports workflow better.
            </p>
          </div>
          <FeedbackPageClient />
        </div>
      </main>
    </>
  );
}
