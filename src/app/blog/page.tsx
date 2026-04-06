import type { Metadata } from 'next';
import Link from 'next/link';
import BlogCard from '@/components/blog/BlogCard';
import { getPublishedBlogPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Blog | BracketIQ by Razumly',
  description:
    'Practical guides for tournament hosts, league organizers, and facilities running sports events with BracketIQ.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Blog | BracketIQ by Razumly',
    description:
      'Practical guides for tournament hosts, league organizers, and facilities running sports events with BracketIQ.',
    url: `${SITE_URL}/blog`,
  },
};

export default function BlogIndexPage() {
  const posts = getPublishedBlogPosts();

  return (
    <main className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <section className="container-responsive relative py-16 sm:py-20">
        <div className="max-w-4xl space-y-5">
          <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
            BracketIQ Blog
          </p>
          <h1 className="landing-title text-4xl font-semibold sm:text-5xl">
            Guides for building better schedules, brackets, and event operations.
          </h1>
          <p className="landing-copy max-w-3xl text-base sm:text-lg">
            These articles are built for organizers who need clearer tournament workflows, fewer conflicts,
            and faster updates when the day gets busy.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="landing-btn-primary inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
            >
              Start with BracketIQ
            </Link>
            <Link
              href="/discover"
              className="landing-btn-secondary inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
            >
              Browse public events
            </Link>
          </div>
        </div>
      </section>

      <section className="container-responsive relative pb-20">
        <div className="grid gap-6">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
    </main>
  );
}
