import type {
    EventOfficialPosition,
    MatchRulesConfig,
    Sport,
} from '@/types';

import MatchRulesSection from '../../MatchRulesSection';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

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
    errorCount?: number;
    firstErrorMessage?: string;
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
    errorCount,
    firstErrorMessage,
}: MatchRulesConfigSectionProps) => {
    if (!visible) {
        return null;
    }

    return (
        <CollapsibleEventFormSection
            id="section-match-rules"
            title="Match Rules"
            collapsed={collapsed}
            onToggle={onToggle}
            errorCount={errorCount}
            firstErrorMessage={firstErrorMessage}
        >
            <div className="mt-4">
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
        </CollapsibleEventFormSection>
    );
};
