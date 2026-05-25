import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, Clock3, LayoutDashboard } from 'lucide-react';
import BlogAuthorFooter from '@/components/blog/BlogAuthorFooter';
import BlogCtaCard from '@/components/blog/BlogCtaCard';
import BlogFaq from '@/components/blog/BlogFaq';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import GuideTopicNav from '@/components/guides/GuideTopicNav';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import { formatBlogDate, getGuidePostBySlug, getGuideTopics, getPublishedGuidePosts } from '@/lib/blog';
import { createArticleStructuredData, createFaqStructuredData } from '@/lib/blog/structuredData';
import { SITE_URL } from '@/lib/siteUrl';

const guidesHeaderNavItems = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Blog', href: '/blog' },
];

type GuidePostPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedGuidePosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: GuidePostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getGuidePostBySlug(slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} | BracketIQ Guides`,
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
      modifiedTime: post.updatedAt,
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

export default async function GuidePostPage({ params }: GuidePostPageProps) {
  const { slug } = await params;
  const post = getGuidePostBySlug(slug);

  if (!post) {
    notFound();
  }

  const topics = getGuideTopics();
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

      <MarketingHeader navItems={guidesHeaderNavItems} />

      <main className="relative">
        <section className="marketing-article-hero container-responsive relative grid gap-8 pb-12 pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(18rem,0.42fr)] lg:items-end lg:pb-16 lg:pt-16">
          <div className="max-w-4xl" data-reveal>
            <Link href="/guides" className="landing-label inline-flex items-center gap-2 text-sm font-semibold hover:text-[var(--ocean-primary)]">
              <ArrowRight aria-hidden="true" className="h-4 w-4 rotate-180" />
              Back to guides
            </Link>
            <div className="mt-6 space-y-5">
              <p className="landing-kicker inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                {post.primaryKeyword}
              </p>
              <h1 className="landing-title text-4xl font-semibold leading-tight sm:text-5xl">{post.title}</h1>
              <p className="landing-copy max-w-3xl text-base sm:text-lg">{post.description}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                <span>Created on {formatBlogDate(post.createdAt)}</span>
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
                <span>Created on {formatBlogDate(post.createdAt)}</span>
              </div>
              <div>
                <LayoutDashboard aria-hidden="true" className="h-5 w-5" />
                <span>BracketIQ workflow</span>
              </div>
            </div>
          </aside>
        </section>

        <section className="container-responsive relative pb-20">
          <div className="guide-shell guide-article-shell">
            <GuideTopicNav topics={topics} activeSlug={post.slug} />
            <div className="guide-main space-y-8">
              <div className="landing-surface-strong marketing-article-shell rounded-3xl px-6 py-8 sm:px-10 sm:py-10">
                <article className="blog-article mx-auto max-w-3xl">
                  <ArticleContent />
                </article>
              </div>
              <BlogFaq items={post.faq} />
              <BlogCtaCard
                title="Ready to run it in BracketIQ?"
                description="Create the workflow, publish the page, and give players one place to register, pay, and check updates."
                actions={post.ctas}
              />
              <BlogAuthorFooter post={post} />
            </div>
          </div>
        </section>
      </main>

      <BlogStructuredData data={articleStructuredData} />
      <BlogStructuredData data={faqStructuredData} />
    </div>
  );
}
