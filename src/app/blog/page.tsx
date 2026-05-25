import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Newspaper, Sparkles } from 'lucide-react';
import BlogCard from '@/components/blog/BlogCard';
import { getPublishedBlogPosts, getPublishedGuidePosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/siteUrl';
import MarketingHeader from '@/components/marketing/MarketingHeader';

const blogHeaderNavItems = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

export const metadata: Metadata = {
  title: 'Blog | BracketIQ by Razumly',
  description:
    'Sport-specific and operational articles for hosting recreational sports events, leagues, tournaments, and club programs.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Blog | BracketIQ by Razumly',
    description:
      'Sport-specific and operational articles for hosting recreational sports events, leagues, tournaments, and club programs.',
    url: `${SITE_URL}/blog`,
  },
};

export default function BlogIndexPage() {
  const posts = getPublishedBlogPosts();
  const guidePosts = getPublishedGuidePosts();
  const latestGuide = guidePosts[0] ?? null;

  return (
    <div className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <MarketingHeader navItems={blogHeaderNavItems} />

      <main className="relative">
        <section className="marketing-page-hero container-responsive relative grid gap-10 pb-14 pt-12 lg:grid-cols-[0.92fr_0.72fr] lg:items-center lg:pb-20 lg:pt-16">
          <div className="max-w-4xl space-y-6" data-reveal>
            <p className="landing-kicker inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              BracketIQ Blog
            </p>
            <h1 className="landing-title text-4xl font-semibold sm:text-5xl">
              Articles for hosting better recreational sports events.
            </h1>
            <p className="landing-copy max-w-3xl text-base sm:text-lg">
              The blog is for sport logistics, event operations, and practical hosting ideas. BracketIQ product tutorials now live in Guides.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/guides"
                className="landing-btn-primary landing-btn-large"
              >
                Browse BracketIQ guides
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="landing-btn-secondary landing-btn-large"
              >
                Start with BracketIQ
              </Link>
            </div>
          </div>

          {latestGuide ? (
            <aside className="landing-command-console marketing-featured-guide-card" data-reveal data-delay="1">
              <div className="landing-command-header">
                <div>
                  <p className="landing-command-label">Guide library</p>
                  <p className="landing-command-title">BracketIQ workflows</p>
                </div>
                <div className="landing-command-status">
                  <span aria-hidden="true" />
                  Live
                </div>
              </div>
              <div className="marketing-guide-metrics">
                <article>
                  <BookOpen aria-hidden="true" className="h-5 w-5" />
                  <span>{guidePosts.length} product guides</span>
                </article>
                <article>
                  <Newspaper aria-hidden="true" className="h-5 w-5" />
                  <span>Blog articles separate</span>
                </article>
              </div>
              <h2 className="landing-card-title mt-6">Need the exact BracketIQ steps?</h2>
              <p className="landing-section-copy mt-4 text-sm leading-7">
                Start in Guides for setup and management tutorials such as {latestGuide.title}.
              </p>
              <Link href="/guides" className="landing-btn-primary landing-btn-large mt-7">
                Open guides
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </aside>
          ) : null}
        </section>

        <section className="container-responsive relative pb-20 pt-0">
          <div className="marketing-section-row">
            <p className="landing-label">Latest blog articles</p>
            <p className="landing-section-copy text-sm">General hosting articles for sports, facilities, clubs, and event organizers.</p>
          </div>
          {posts.length > 0 ? (
            <div className="marketing-blog-grid mt-8">
              {posts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <div className="guide-empty-state mt-8">
              <p>Sport-specific hosting articles are coming soon. For product tutorials, use the BracketIQ guide library.</p>
              <Link href="/guides" className="landing-btn-secondary landing-btn-large">
                Go to guides
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
