import { useCallback, useEffect, useRef, useState } from 'react';

type SectionNavigationItem = {
    id: string;
};

type UseEventFormSectionNavigationParams = {
    open: boolean;
    visibleItems: SectionNavigationItem[];
    collapseDefaults: Record<string, boolean>;
    defaultSectionId: string;
    scrollOffset: number;
};

export const useEventFormSectionNavigation = ({
    open,
    visibleItems,
    collapseDefaults,
    defaultSectionId,
    scrollOffset,
}: UseEventFormSectionNavigationParams) => {
    const [activeSectionId, setActiveSectionId] = useState<string>(visibleItems[0]?.id ?? defaultSectionId);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(collapseDefaults);
    const [fieldNamesCollapsed, setFieldNamesCollapsed] = useState(false);
    const sectionNavTargetRef = useRef<string | null>(null);
    const sectionNavSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const toggleSectionCollapse = useCallback((sectionId: string) => {
        setCollapsedSections((previous) => ({
            ...previous,
            [sectionId]: !previous[sectionId],
        }));
    }, []);

    const expandSection = useCallback((sectionId: string) => {
        setCollapsedSections((previous) => (
            previous[sectionId]
                ? { ...previous, [sectionId]: false }
                : previous
        ));
    }, []);

    useEffect(() => {
        const firstVisibleSection = visibleItems[0]?.id;
        if (!firstVisibleSection) return;
        if (!visibleItems.some((item) => item.id === activeSectionId)) {
            setActiveSectionId(firstVisibleSection);
        }
    }, [activeSectionId, visibleItems]);

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;

        const handleScroll = () => {
            const pendingTarget = sectionNavTargetRef.current;
            if (pendingTarget) {
                const pendingElement = document.getElementById(pendingTarget);
                if (pendingElement) {
                    const distanceFromAnchor = Math.abs(
                        pendingElement.getBoundingClientRect().top - scrollOffset,
                    );
                    if (distanceFromAnchor > 36) {
                        return;
                    }
                }
                setActiveSectionId((previous) => (previous === pendingTarget ? previous : pendingTarget));
                return;
            }
            const viewportMiddle = window.innerHeight / 2;
            let currentSection: string | null = null;
            let closestSection: string | null = visibleItems[0]?.id ?? null;
            let closestDistance = Number.POSITIVE_INFINITY;
            for (const section of visibleItems) {
                const sectionElement = document.getElementById(section.id);
                if (!sectionElement) continue;
                const rect = sectionElement.getBoundingClientRect();
                if (rect.top <= viewportMiddle && rect.bottom >= viewportMiddle) {
                    currentSection = section.id;
                    break;
                }
                const distanceToMiddle = Math.min(
                    Math.abs(rect.top - viewportMiddle),
                    Math.abs(rect.bottom - viewportMiddle),
                );
                if (distanceToMiddle < closestDistance) {
                    closestDistance = distanceToMiddle;
                    closestSection = section.id;
                }
            }
            const nextActiveSection = currentSection ?? closestSection;
            if (nextActiveSection) {
                setActiveSectionId((previous) => (previous === nextActiveSection ? previous : nextActiveSection));
            }
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [open, scrollOffset, visibleItems]);

    useEffect(() => {
        return () => {
            if (sectionNavSettleTimerRef.current) {
                clearTimeout(sectionNavSettleTimerRef.current);
            }
        };
    }, []);

    const scrollToSection = useCallback((sectionId: string) => {
        expandSection(sectionId);
        const target = document.getElementById(sectionId);
        if (!target) return;
        if (sectionNavSettleTimerRef.current) {
            clearTimeout(sectionNavSettleTimerRef.current);
        }
        sectionNavTargetRef.current = sectionId;
        setActiveSectionId(sectionId);
        const nextTop = target.getBoundingClientRect().top + window.scrollY - scrollOffset;
        const scrollTop = Math.max(nextTop, 0);
        const settleMs = Math.min(1600, Math.max(700, Math.abs(window.scrollY - scrollTop) * 0.9));
        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
        sectionNavSettleTimerRef.current = setTimeout(() => {
            sectionNavTargetRef.current = null;
            sectionNavSettleTimerRef.current = null;
        }, settleMs);
    }, [expandSection, scrollOffset]);

    return {
        activeSectionId,
        collapsedSections,
        fieldNamesCollapsed,
        setFieldNamesCollapsed,
        toggleSectionCollapse,
        expandSection,
        scrollToSection,
    };
};
