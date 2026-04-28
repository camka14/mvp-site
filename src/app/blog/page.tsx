import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarDays, LayoutDashboard, Sparkles } from 'lucide-react';
import BlogCard from '@/components/blog/BlogCard';
import { getPublishedBlogPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/siteUrl';
import MarketingHeader from '@/components/marketing/MarketingHeader';

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
  const featuredPost = posts[0] ?? null;

  return (
    <div className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <MarketingHeader anchorHrefPrefix="/info" />

      <main className="relative">
        <section className="marketing-page-hero container-responsive relative grid gap-10 pb-14 pt-12 lg:grid-cols-[0.92fr_0.72fr] lg:items-center lg:pb-20 lg:pt-16">
          <div className="max-w-4xl space-y-6" data-reveal>
            <p className="landing-kicker inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              BracketIQ Blog
            </p>
            <h1 className="landing-title text-4xl font-semibold sm:text-5xl">
              Guides for cleaner schedules, brackets, and event days.
            </h1>
            <p className="landing-copy max-w-3xl text-base sm:text-lg">
              Practical playbooks for organizers who need fewer conflicts, faster updates, and a calmer event desk.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="landing-btn-primary landing-btn-large"
              >
                Start with BracketIQ
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/discover"
                className="landing-btn-secondary landing-btn-large"
              >
                Browse public events
              </Link>
            </div>
          </div>

          {featuredPost ? (
            <aside className="landing-command-console marketing-featured-guide-card" data-reveal data-delay="1">
              <div className="landing-command-header">
                <div>
                  <p className="landing-command-label">Featured guide</p>
                  <p className="landing-command-title">{featuredPost.primaryKeyword}</p>
                </div>
                <div className="landing-command-status">
                  <span aria-hidden="true" />
                  Live
                </div>
              </div>
              <div className="marketing-guide-metrics">
                <article>
                  <CalendarDays aria-hidden="true" className="h-5 w-5" />
                  <span>{featuredPost.readingMinutes} min read</span>
                </article>
                <article>
                  <LayoutDashboard aria-hidden="true" className="h-5 w-5" />
                  <span>Schedule workflow</span>
                </article>
              </div>
              <h2 className="landing-card-title mt-6">Tournament scheduling playbook</h2>
              <p className="landing-section-copy mt-4 text-sm leading-7">{featuredPost.description}</p>
              <Link href={featuredPost.canonicalPath} className="landing-btn-primary landing-btn-large mt-7">
                Read featured guide
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </aside>
          ) : null}
        </section>

        <section className="container-responsive relative pb-20 pt-0">
          <div className="marketing-section-row">
            <p className="landing-label">Latest resources</p>
            <p className="landing-section-copy text-sm">Built for event operators, facility teams, and tournament directors.</p>
          </div>
          <div className="marketing-blog-grid mt-8">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
