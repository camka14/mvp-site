import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { GuideTopic } from '@/lib/blog';
import type { BlogPostEntry, GuideTopicId } from '@/lib/blog/types';

type GuideTopicWithPosts = GuideTopic & {
  posts: BlogPostEntry[];
};

type GuideTopicNavProps = {
  topics: GuideTopicWithPosts[];
  activeSlug?: string;
};

export default function GuideTopicNav({ topics, activeSlug }: GuideTopicNavProps) {
  const activeTopicId = topics.find((topic) => topic.posts.some((post) => post.slug === activeSlug))?.id;

  return (
    <aside className="guide-topic-nav landing-surface-strong rounded-2xl p-4">
      <Link href="/guides" className="guide-topic-nav-home">
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        Guide Home
      </Link>
      <div className="mt-4 space-y-2">
        {topics.map((topic) => (
          <GuideTopicGroup
            key={topic.id}
            topic={topic}
            activeSlug={activeSlug}
            defaultOpen={topic.id === activeTopicId || (!activeTopicId && topic.posts.length > 0)}
          />
        ))}
      </div>
    </aside>
  );
}

function GuideTopicGroup({
  topic,
  activeSlug,
  defaultOpen,
}: {
  topic: GuideTopicWithPosts;
  activeSlug?: string;
  defaultOpen: boolean;
}) {
  return (
    <details className="guide-topic-group" open={defaultOpen}>
      <summary>
        <span>{topic.title}</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </summary>
      <div className="guide-topic-links">
        {topic.posts.length > 0 ? (
          topic.posts.map((post) => (
            <Link
              key={post.slug}
              href={post.canonicalPath}
              className={post.slug === activeSlug ? 'guide-topic-link guide-topic-link-active' : 'guide-topic-link'}
            >
              {post.title}
            </Link>
          ))
        ) : (
          <p>{getEmptyTopicCopy(topic.id)}</p>
        )}
      </div>
    </details>
  );
}

function getEmptyTopicCopy(topicId: GuideTopicId) {
  if (topicId === 'leagues') {
    return 'League guides are planned next.';
  }
  if (topicId === 'organizations') {
    return 'Organization guides are planned next.';
  }
  return 'Guides are coming soon.';
}
