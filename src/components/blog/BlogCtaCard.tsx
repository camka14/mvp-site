import Link from 'next/link';
import type { BlogCta } from '@/lib/blog/types';

const variantClassNames: Record<BlogCta['variant'], string> = {
  primary: 'landing-btn-primary',
  secondary: 'landing-btn-secondary',
  tertiary: 'landing-btn-outline',
};

function BlogAction({ action }: { action: BlogCta }) {
  const className = `${variantClassNames[action.variant]} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition`;

  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noreferrer" className={className}>
        {action.label}
      </a>
    );
  }

  if (action.href.startsWith('#')) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }

  return (
    <Link href={action.href} className={className}>
      {action.label}
    </Link>
  );
}

export default function BlogCtaCard({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: BlogCta[];
}) {
  return (
    <section className="landing-cta rounded-3xl p-8">
      <p className="landing-label-alt text-xs uppercase tracking-[0.16em]">Ready to build faster?</p>
      <h2 className="landing-section-title mt-3 text-3xl font-semibold sm:text-4xl">{title}</h2>
      <p className="landing-cta-copy mt-4 max-w-3xl text-base leading-8">{description}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {actions.map((action) => (
          <BlogAction key={action.label} action={action} />
        ))}
      </div>
    </section>
  );
}
