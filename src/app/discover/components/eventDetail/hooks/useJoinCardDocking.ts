import { useEffect, useRef, useState } from 'react';

type JoinCardLayout = {
    docked: boolean;
    height: number;
    left: number;
    width: number;
};

const EMPTY_LAYOUT: JoinCardLayout = {
    docked: false,
    height: 0,
    left: 0,
    width: 0,
};

function layoutsMatch(left: JoinCardLayout, right: JoinCardLayout): boolean {
    return left.docked === right.docked
        && left.height === right.height
        && left.left === right.left
        && left.width === right.width;
}

export function useJoinCardDocking({
    active,
    inline,
}: {
    active: boolean;
    inline: boolean;
}) {
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [layout, setLayout] = useState<JoinCardLayout>(EMPTY_LAYOUT);

    useEffect(() => {
        if (!active || !inline) {
            return undefined;
        }

        const updateLayout = () => {
            const anchor = anchorRef.current;
            const card = cardRef.current;
            if (!anchor || !card || window.innerWidth < 1024) {
                setLayout((previous) => (
                    previous.docked ? { ...previous, docked: false } : previous
                ));
                return;
            }

            const anchorRect = anchor.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            setLayout((previous) => {
                const measuredHeight = cardRect.height || previous.height;
                const holdingBottomGap = 96;
                const holdingTop = Math.max(24, window.innerHeight - measuredHeight - holdingBottomGap);
                const nextLayout: JoinCardLayout = {
                    docked: anchorRect.top <= holdingTop,
                    height: measuredHeight,
                    left: anchorRect.left,
                    width: anchorRect.width,
                };
                return layoutsMatch(previous, nextLayout) ? previous : nextLayout;
            });
        };

        const animationFrame = window.requestAnimationFrame(updateLayout);
        window.addEventListener('scroll', updateLayout, { passive: true });
        window.addEventListener('resize', updateLayout);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && cardRef.current) {
            resizeObserver = new ResizeObserver(updateLayout);
            resizeObserver.observe(cardRef.current);
        }

        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.removeEventListener('scroll', updateLayout);
            window.removeEventListener('resize', updateLayout);
            resizeObserver?.disconnect();
        };
    }, [active, inline]);

    return {
        anchorRef,
        cardRef,
        layout: active && inline ? layout : EMPTY_LAYOUT,
    };
}
