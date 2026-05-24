import Image from 'next/image';
import { formatBlogDate } from '@/lib/blog';
import type { BlogPostMeta } from '@/lib/blog/types';

export default function BlogAuthorFooter({ post }: { post: BlogPostMeta }) {
  return (
    <section className="border-t border-slate-200/80 pt-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Image
            src={post.author.image}
            alt={`${post.author.name} profile photo`}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-full object-cover"
            sizes="72px"
          />
          <div>
            <p className="landing-label-alt text-xs uppercase tracking-[0.16em]">Written by</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{post.author.name}</p>
          </div>
        </div>
        <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 sm:text-right">
          <div>
            <dt className="font-semibold text-slate-900">Created on</dt>
            <dd>{formatBlogDate(post.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Updated on</dt>
            <dd>{formatBlogDate(post.updatedAt)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
