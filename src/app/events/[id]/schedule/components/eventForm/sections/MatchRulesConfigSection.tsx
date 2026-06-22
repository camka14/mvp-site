import { Button, Collapse, Paper } from '@mantine/core';
import type {
    EventOfficialPosition,
    MatchRulesConfig,
    Sport,
} from '@/types';

import MatchRulesSection from '../../MatchRulesSection';
import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type MatchRulesConfigSectionProps = {
    visible: boolean;
    collapsed: boolean;
    sport?: Sport | null;
    usesSets?: boolean | null;
    setsPerMatch?: number | null;
    winnerSetCount?: number | null;
    officialPositions?: EventOfficialPosition[] | null;
    value?: MatchRulesConfig | null;
    onChange: (next: MatchRulesConfig | null) => void;
    autoCreatePointMatchIncidents: boolean;
    onAutoCreatePointMatchIncidentsChange: (checked: boolean) => void;
    disabled?: boolean;
    incidentToggleDisabled?: boolean;
    comboboxProps?: Record<string, unknown>;
    onToggle: () => void;
};

export const MatchRulesConfigSection = ({
    visible,
    collapsed,
    sport,
    usesSets,
    setsPerMatch,
    winnerSetCount,
    officialPositions,
    value,
    onChange,
    autoCreatePointMatchIncidents,
    onAutoCreatePointMatchIncidentsChange,
    disabled,
    incidentToggleDisabled,
    comboboxProps,
    onToggle,
}: MatchRulesConfigSectionProps) => {
    if (!visible) {
        return null;
    }

    return (
        <Paper
            id="section-match-rules"
            shadow="xs"
            radius="md"
            withBorder
            p="lg"
            className="scroll-mt-20 bg-gray-50"
        >
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Match Rules</h3>
                <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    aria-expanded={!collapsed}
                    aria-controls="section-match-rules-content"
                    onClick={onToggle}
                >
                    {collapsed ? 'Expand' : 'Collapse'}
                </Button>
            </div>
            <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                <div id="section-match-rules-content" className="mt-4">
                    <MatchRulesSection
                        sport={sport ?? undefined}
                        usesSets={usesSets}
                        setsPerMatch={setsPerMatch}
                        winnerSetCount={winnerSetCount}
                        officialPositions={officialPositions}
                        value={value}
                        onChange={onChange}
                        autoCreatePointMatchIncidents={autoCreatePointMatchIncidents}
                        onAutoCreatePointMatchIncidentsChange={onAutoCreatePointMatchIncidentsChange}
                        disabled={disabled}
                        incidentToggleDisabled={incidentToggleDisabled}
                        comboboxProps={comboboxProps}
                    />
                </div>
            </Collapse>
        </Paper>
    );
};
