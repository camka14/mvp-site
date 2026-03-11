import type { MDXComponents } from 'mdx/types';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function TableWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-left text-sm text-slate-700">{children}</table>
    </div>
  );
}

function Anchor(props: ComponentPropsWithoutRef<'a'>) {
  const isExternal = Boolean(props.href?.startsWith('http'));
  return (
    <a
      {...props}
      className="font-semibold text-[var(--ocean-primary)] underline underline-offset-4 hover:text-[var(--ocean-primary-hover)]"
      rel={isExternal ? 'noreferrer' : props.rel}
      target={isExternal ? '_blank' : props.target}
    />
  );
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: (props) => <h2 className="mt-12 scroll-mt-24 text-2xl font-semibold text-slate-900 sm:text-3xl" {...props} />,
    h3: (props) => <h3 className="mt-8 scroll-mt-24 text-xl font-semibold text-slate-900" {...props} />,
    p: (props) => <p className="mt-4 text-base leading-8 text-slate-700" {...props} />,
    ul: (props) => <ul className="mt-4 list-disc space-y-3 pl-6 text-base leading-8 text-slate-700" {...props} />,
    ol: (props) => <ol className="mt-4 list-decimal space-y-3 pl-6 text-base leading-8 text-slate-700" {...props} />,
    li: (props) => <li className="pl-1" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="my-6 rounded-2xl border-l-4 border-[var(--ocean-primary)] bg-[color:var(--landing-highlight-bg)] px-5 py-4 text-base leading-8 text-slate-700"
        {...props}
      />
    ),
    table: TableWrapper,
    thead: (props) => <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500" {...props} />,
    tbody: (props) => <tbody {...props} />,
    tr: (props) => <tr className="border-t border-slate-200" {...props} />,
    th: (props) => <th className="px-4 py-3 font-semibold text-slate-700" {...props} />,
    td: (props) => <td className="px-4 py-3 align-top" {...props} />,
    a: Anchor,
    ...components,
  };
}
