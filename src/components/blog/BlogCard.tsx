import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatBlogDate } from '@/lib/blog';
import type { BlogPostEntry } from '@/lib/blog/types';

export default function BlogCard({ post }: { post: BlogPostEntry }) {
  return (
    <article className="landing-surface-strong marketing-blog-card rounded-3xl p-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span className="landing-kicker rounded-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em]">
          {post.primaryKeyword}
        </span>
        <span>{formatBlogDate(post.publishedAt)}</span>
        <span>{post.readingMinutes} min read</span>
      </div>
      <h2 className="landing-section-title mt-5 text-2xl font-semibold sm:text-3xl">
        <Link href={post.canonicalPath} className="hover:text-[var(--ocean-primary)]">
          {post.title}
        </Link>
      </h2>
      <p className="landing-section-copy mt-4 text-base leading-8">{post.description}</p>
      <div className="mt-6">
        <Link
          href={post.canonicalPath}
          className="landing-btn-secondary landing-btn-large"
        >
          Read the guide
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
