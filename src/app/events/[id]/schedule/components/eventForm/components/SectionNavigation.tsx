import { Text } from '@mantine/core';

export type SectionNavigationItem = {
    id: string;
    label: string;
};

type SectionNavigationProps = {
    items: SectionNavigationItem[];
    activeSectionId: string;
    variant: 'desktop' | 'mobile';
    onSelectSection: (sectionId: string) => void;
};

export const SectionNavigation = ({
    items,
    activeSectionId,
    variant,
    onSelectSection,
}: SectionNavigationProps) => {
    if (variant === 'desktop') {
        return (
            <aside className="hidden xl:block">
                <div className="sticky top-20 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                    <Text fw={700} size="sm" c="gray.8" mb="xs">
                        Sections
                    </Text>
                    <Text size="xs" c="dimmed" mb="md">
                        Jump to any section. Changes are preserved as you move.
                    </Text>
                    <div className="space-y-1">
                        {items.map((section) => {
                            const isActive = activeSectionId === section.id;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => onSelectSection(section.id)}
                                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                                        isActive
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    {section.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </aside>
        );
    }

    return (
        <div className="mb-4 xl:hidden overflow-x-auto">
            <div className="flex min-w-max gap-2 pb-1">
                {items.map((section) => {
                    const isActive = activeSectionId === section.id;
                    return (
                        <button
                            key={`mobile-${section.id}`}
                            type="button"
                            onClick={() => onSelectSection(section.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                isActive
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {section.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
