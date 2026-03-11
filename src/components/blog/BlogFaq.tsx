import type { BlogFaqItem } from '@/lib/blog/types';

export default function BlogFaq({ items }: { items: BlogFaqItem[] }) {
  return (
    <section className="landing-surface rounded-3xl p-6 sm:p-8">
      <h2 className="landing-section-title text-2xl font-semibold sm:text-3xl">FAQs</h2>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <article key={item.question} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-900">{item.question}</h3>
            <p className="mt-3 text-base leading-8 text-slate-700">{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
