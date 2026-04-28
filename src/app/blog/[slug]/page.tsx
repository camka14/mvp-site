import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, Clock3, LayoutDashboard } from 'lucide-react';
import BlogCtaCard from '@/components/blog/BlogCtaCard';
import BlogFaq from '@/components/blog/BlogFaq';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import { formatBlogDate, getBlogPostBySlug, getPublishedBlogPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/siteUrl';
import { createArticleStructuredData, createFaqStructuredData } from '@/lib/blog/structuredData';
import MarketingHeader from '@/components/marketing/MarketingHeader';

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} | BracketIQ by Razumly`,
    description: post.description,
    keywords: [post.primaryKeyword, ...post.longTailKeywords],
    alternates: {
      canonical: post.canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${SITE_URL}${post.canonicalPath}`,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      images: [
        {
          url: `${SITE_URL}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: post.ogImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const { default: ArticleContent } = await post.load();
  const articleStructuredData = createArticleStructuredData(post);
  const faqStructuredData = createFaqStructuredData(post);

  return (
    <div className="landing-root min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-aura landing-aura-left" />
        <div className="landing-aura landing-aura-right" />
        <div className="landing-grid-pattern" />
      </div>

      <MarketingHeader anchorHrefPrefix="/info" />

      <main className="relative">
        <section className="marketing-article-hero container-responsive relative grid gap-8 pb-12 pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(18rem,0.42fr)] lg:items-end lg:pb-16 lg:pt-16">
          <div className="max-w-4xl" data-reveal>
            <Link href="/blog" className="landing-label inline-flex items-center gap-2 text-sm font-semibold hover:text-[var(--ocean-primary)]">
              <ArrowRight aria-hidden="true" className="h-4 w-4 rotate-180" />
              Back to blog
            </Link>
            <div className="mt-6 space-y-5">
              <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                {post.primaryKeyword}
              </p>
              <h1 className="landing-title text-4xl font-semibold leading-tight sm:text-5xl">{post.title}</h1>
              <p className="landing-copy max-w-3xl text-base sm:text-lg">{post.description}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                <span>{formatBlogDate(post.publishedAt)}</span>
                <span>{post.readingMinutes} min read</span>
              </div>
            </div>
          </div>

          <aside className="landing-surface-strong marketing-article-brief rounded-3xl p-6" data-reveal data-delay="1">
            <p className="landing-label-alt text-xs uppercase tracking-[0.16em]">Guide brief</p>
            <div className="mt-5 grid gap-4">
              <div>
                <Clock3 aria-hidden="true" className="h-5 w-5" />
                <span>{post.readingMinutes} minute read</span>
              </div>
              <div>
                <CalendarDays aria-hidden="true" className="h-5 w-5" />
                <span>{formatBlogDate(post.publishedAt)}</span>
              </div>
              <div>
                <LayoutDashboard aria-hidden="true" className="h-5 w-5" />
                <span>Scheduling operations</span>
              </div>
            </div>
          </aside>
        </section>

        <section className="container-responsive relative pb-10">
          <div className="landing-surface-strong marketing-article-shell rounded-3xl px-6 py-8 sm:px-10 sm:py-10">
            <article className="blog-article mx-auto max-w-3xl">
              <ArticleContent />
            </article>
          </div>
        </section>

        <section className="container-responsive relative space-y-8 pb-20">
          <BlogFaq items={post.faq} />
          <BlogCtaCard
            title="Ready to build a tournament schedule your teams can trust?"
            description="Create the event, assign your venues, publish the bracket, and keep updates moving from one official source."
            actions={post.ctas}
          />
        </section>
      </main>

      <BlogStructuredData data={articleStructuredData} />
      <BlogStructuredData data={faqStructuredData} />
    </div>
  );
}
