import type { ReactNode } from 'react';
import { Text } from '@mantine/core';

export type ReadOnlyDetailField = {
    label: string;
    value: string;
};

export function ReadOnlyDetailsGrid({ items }: { items: ReadOnlyDetailField[] }) {
    const visibleItems = items.filter((item) => item.value.trim().length > 0);
    if (!visibleItems.length) {
        return null;
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleItems.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                    <Text size="sm" c="dimmed">{item.label}</Text>
                    <Text fw={600}>{item.value}</Text>
                </div>
            ))}
        </div>
    );
}

export function PublicEventSection({
    eyebrow,
    title,
    children,
    className = '',
}: {
    eyebrow?: string;
    title?: string;
    children: ReactNode;
    className?: string;
}) {
    const hasHeader = Boolean(eyebrow || title);

    return (
        <section className={`border-b border-slate-200 py-7 first:pt-0 last:border-b-0 last:pb-0 ${className}`}>
            {hasHeader ? (
                <div className="mb-5">
                    {eyebrow ? (
                        <Text size="xs" c="dimmed" tt="uppercase" fw={800} className="tracking-normal">
                            {eyebrow}
                        </Text>
                    ) : null}
                    {title ? (
                        <h2 className={`${eyebrow ? 'mt-1' : ''} text-xl font-bold leading-tight text-slate-950`}>
                            {title}
                        </h2>
                    ) : null}
                </div>
            ) : null}
            {children}
        </section>
    );
}

export function PublicEventMetaPill({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    if (!value.trim()) {
        return null;
    }

    return (
        <div className="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} className="tracking-normal">
                {label}
            </Text>
            <Text size="sm" fw={700} className="mt-1 text-slate-950">
                {value}
            </Text>
        </div>
    );
}
