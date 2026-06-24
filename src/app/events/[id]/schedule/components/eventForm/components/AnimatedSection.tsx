import React from 'react';
import { Collapse } from '@mantine/core';
import { AnimatePresence, motion } from 'motion/react';

import {
    DIVISION_LAYOUT_TRANSITION,
    SECTION_ANIMATION_DURATION_MS,
} from '../constants';

export const AnimatedSection = ({
    in: inProp,
    children,
    className,
    collapseClassName,
}: {
    in: boolean;
    children: React.ReactNode;
    className?: string;
    collapseClassName?: string;
}) => (
    <Collapse
        in={inProp}
        transitionDuration={SECTION_ANIMATION_DURATION_MS}
        transitionTimingFunction="ease"
        animateOpacity
        className={collapseClassName}
    >
        {className ? <div className={className}>{children}</div> : children}
    </Collapse>
);

export const AnimatedLayoutSection = ({
    in: inProp,
    children,
    className,
}: {
    in: boolean;
    children: React.ReactNode;
    className?: string;
}) => (
    <AnimatePresence initial={false} mode="popLayout">
        {inProp ? (
            <motion.div
                layout
                className={className}
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={DIVISION_LAYOUT_TRANSITION}
                style={{ overflow: 'hidden' }}
            >
                {children}
            </motion.div>
        ) : null}
    </AnimatePresence>
);
