import type { LeagueScoringConfig, Sport } from '@/types';
import LeagueScoringConfigPanel from '@/app/discover/components/LeagueScoringConfigPanel';

import { AnimatedSection } from '../components/AnimatedSection';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

type LeagueScoringConfigKey = keyof LeagueScoringConfig;

type LeagueScoringConfigSectionProps = {
    visible: boolean;
    collapsed: boolean;
    title: string;
    value: LeagueScoringConfig;
    sport?: Sport;
    editable: boolean;
    onToggle: () => void;
    errorCount?: number;
    firstErrorMessage?: string;
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
    errorCount,
    firstErrorMessage,
    onChange,
}: LeagueScoringConfigSectionProps) => (
    <AnimatedSection in={visible}>
        <CollapsibleEventFormSection
            id="section-league-scoring-config"
            title={title}
            collapsed={collapsed}
            onToggle={onToggle}
            errorCount={errorCount}
            firstErrorMessage={firstErrorMessage}
        >
            <div className="mt-4">
                <LeagueScoringConfigPanel
                    value={value}
                    sport={sport}
                    editable={editable}
                    onChange={onChange}
                />
            </div>
        </CollapsibleEventFormSection>
    </AnimatedSection>
);
