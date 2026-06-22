import { Button, Collapse, Paper } from '@mantine/core';
import type { LeagueScoringConfig, Sport } from '@/types';
import LeagueScoringConfigPanel from '@/app/discover/components/LeagueScoringConfigPanel';

import { AnimatedSection } from '../components/AnimatedSection';
import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type LeagueScoringConfigKey = keyof LeagueScoringConfig;

type LeagueScoringConfigSectionProps = {
    visible: boolean;
    collapsed: boolean;
    title: string;
    value: LeagueScoringConfig;
    sport?: Sport;
    editable: boolean;
    onToggle: () => void;
    onChange: <K extends LeagueScoringConfigKey>(key: K, next: LeagueScoringConfig[K]) => void;
};

export const LeagueScoringConfigSection = ({
    visible,
    collapsed,
    title,
    value,
    sport,
    editable,
    onToggle,
    onChange,
}: LeagueScoringConfigSectionProps) => (
    <AnimatedSection in={visible}>
        <Paper
            id="section-league-scoring-config"
            shadow="xs"
            radius="md"
            withBorder
            p="lg"
            className="scroll-mt-20 bg-gray-50"
        >
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{title}</h3>
                <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    aria-expanded={!collapsed}
                    aria-controls="section-league-scoring-config-content"
                    onClick={onToggle}
                >
                    {collapsed ? 'Expand' : 'Collapse'}
                </Button>
            </div>
            <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                <div id="section-league-scoring-config-content" className="mt-4">
                    <LeagueScoringConfigPanel
                        value={value}
                        sport={sport}
                        editable={editable}
                        onChange={onChange}
                    />
                </div>
            </Collapse>
        </Paper>
    </AnimatedSection>
);
