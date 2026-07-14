import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { RegistrationQuestionDraft } from '@/types';

import {
    buildEventFormSectionNavigationItems,
    getVisibleSectionNavigationItems,
} from '../components/SectionNavigation';
import { isTournamentPoolPlayFormEnabled, supportsScheduleSlotsForEvent } from '../eventRules';
import { hasParentEventRef } from '../eventRules';
import type { EventFormValues } from '../formTypes';
import { useEventFormSectionNavigation } from './useEventFormSectionNavigation';
import { useRegistrationQuestionEditorActions } from './useRegistrationQuestionEditorActions';

type UseEventFormSectionsControllerParams = {
    collapseDefaults: Record<string, boolean>;
    eventData: EventFormValues;
    isAffiliateEvent: boolean;
    manualPaymentsEnabled: boolean;
    open: boolean;
    scrollOffset: number;
    setManualPaymentsEnabled: (enabled: boolean) => void;
    setRegistrationQuestionDrafts: Dispatch<SetStateAction<RegistrationQuestionDraft[]>>;
    usesRentalSlots: boolean;
};

export const useEventFormSectionsController = ({
    collapseDefaults,
    eventData,
    isAffiliateEvent,
    manualPaymentsEnabled,
    open,
    scrollOffset,
    setManualPaymentsEnabled,
    setRegistrationQuestionDrafts,
    usesRentalSlots,
}: UseEventFormSectionsControllerParams) => {
    const leagueData = eventData.leagueData;
    const isSchedulableEventType = !isAffiliateEvent && supportsScheduleSlotsForEvent(
        eventData.eventType,
        eventData.parentEvent,
    );
    const isWeeklyChildEvent = eventData.eventType === 'WEEKLY_EVENT'
        && hasParentEventRef(eventData.parentEvent);
    const supportsEditableTeamSignup = !isAffiliateEvent
        && (eventData.eventType === 'EVENT' || eventData.eventType === 'WEEKLY_EVENT');
    const showsFixedTeamEventToggle = !isAffiliateEvent
        && (eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT');
    const showScheduleConfig = !isAffiliateEvent
        && (isSchedulableEventType || usesRentalSlots || isWeeklyChildEvent);
    const showMatchRulesSection = !isAffiliateEvent
        && eventData.eventType !== 'EVENT'
        && eventData.eventType !== 'WEEKLY_EVENT';
    const showStaffSection = !isAffiliateEvent;
    const showScoringConfigSection = !isAffiliateEvent && (
        eventData.eventType === 'LEAGUE'
        || isTournamentPoolPlayFormEnabled(eventData.eventType, leagueData.includePlayoffs)
    );
    const scoringConfigSectionLabel = eventData.eventType === 'TOURNAMENT'
        ? 'Pool Scoring Config'
        : 'League Scoring Config';
    const showManualPaymentsSection = !isAffiliateEvent && manualPaymentsEnabled;
    const visibleSectionNavItems = useMemo(
        () => getVisibleSectionNavigationItems(buildEventFormSectionNavigationItems({
            showMatchRulesSection,
            showStaffSection,
            showManualPaymentsSection,
            scoringConfigSectionLabel,
            divisionSettingsSectionLabel: 'Divisions',
            showScoringConfigSection,
            showScheduleConfig,
        })),
        [
            scoringConfigSectionLabel,
            showManualPaymentsSection,
            showMatchRulesSection,
            showScheduleConfig,
            showScoringConfigSection,
            showStaffSection,
        ],
    );
    const navigation = useEventFormSectionNavigation({
        open,
        visibleItems: visibleSectionNavItems,
        collapseDefaults,
        defaultSectionId: 'section-basic-information',
        scrollOffset,
    });
    const questionActions = useRegistrationQuestionEditorActions({
        expandSection: navigation.expandSection,
        setDrafts: setRegistrationQuestionDrafts,
    });
    const handleManualPaymentsChange = useCallback((checked: boolean) => {
        setManualPaymentsEnabled(checked);
        if (checked) {
            navigation.expandSection('section-manual-payments');
        }
    }, [navigation, setManualPaymentsEnabled]);

    return {
        ...navigation,
        handleManualPaymentsChange,
        isSchedulableEventType,
        isWeeklyChildEvent,
        questionActions,
        scoringConfigSectionLabel,
        showManualPaymentsSection,
        showMatchRulesSection,
        showScheduleConfig,
        showScoringConfigSection,
        showStaffSection,
        showsFixedTeamEventToggle,
        supportsEditableTeamSignup,
        visibleSectionNavItems,
    };
};
