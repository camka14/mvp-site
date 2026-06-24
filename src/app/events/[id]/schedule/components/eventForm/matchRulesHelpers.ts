import type { MatchRulesConfig } from '@/types';

export const sanitizeMatchRulesOverrideForEditor = (value: unknown): MatchRulesConfig | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key, entry]) => (
            key !== 'segmentCount'
            && key !== 'pointIncidentRequiresParticipant'
            && entry !== undefined
        ));
    return entries.length > 0 ? Object.fromEntries(entries) as MatchRulesConfig : null;
};
