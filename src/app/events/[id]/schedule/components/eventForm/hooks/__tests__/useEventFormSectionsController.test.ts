import { act, renderHook } from '@testing-library/react';

import type { EventFormValues } from '../../formTypes';
import { useEventFormSectionsController } from '../useEventFormSectionsController';

const mockExpandSection = jest.fn();
const mockNavigation = {
    activeSectionId: 'section-basic-information',
    collapsedSections: {},
    expandSection: mockExpandSection,
    fieldNamesCollapsed: false,
    scrollToSection: jest.fn(),
    setFieldNamesCollapsed: jest.fn(),
    toggleSectionCollapse: jest.fn(),
};

jest.mock('../useEventFormSectionNavigation', () => ({
    useEventFormSectionNavigation: () => mockNavigation,
}));

jest.mock('../useRegistrationQuestionEditorActions', () => ({
    useRegistrationQuestionEditorActions: () => ({
        addQuestion: jest.fn(),
        changePrompt: jest.fn(),
        changeRequired: jest.fn(),
        removeQuestion: jest.fn(),
    }),
}));

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    eventType: 'LEAGUE',
    leagueData: { includePlayoffs: false },
    ...overrides,
} as EventFormValues);

const renderController = (overrides: Partial<Parameters<typeof useEventFormSectionsController>[0]> = {}) => {
    const setManualPaymentsEnabled = jest.fn();
    const rendered = renderHook(() => useEventFormSectionsController({
        collapseDefaults: {},
        eventData: buildEventData(),
        isAffiliateEvent: false,
        manualPaymentsEnabled: true,
        open: true,
        scrollOffset: 80,
        setManualPaymentsEnabled,
        setRegistrationQuestionDrafts: jest.fn(),
        usesRentalSlots: false,
        ...overrides,
    }));
    return { ...rendered, setManualPaymentsEnabled };
};

describe('useEventFormSectionsController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('derives the league section catalog and labels', () => {
        const { result } = renderController();

        expect(result.current.showMatchRulesSection).toBe(true);
        expect(result.current.showStaffSection).toBe(true);
        expect(result.current.showScoringConfigSection).toBe(true);
        expect(result.current.scoringConfigSectionLabel).toBe('League Scoring Config');
        expect(result.current.visibleSectionNavItems.map((item) => item.label)).toEqual(expect.arrayContaining([
            'Manual Payments',
            'Match Rules',
            'Staff',
            'League Scoring Config',
            'Schedule',
        ]));
    });

    it('hides operational sections for affiliate listings', () => {
        const { result } = renderController({ isAffiliateEvent: true });

        expect(result.current.showManualPaymentsSection).toBe(false);
        expect(result.current.showMatchRulesSection).toBe(false);
        expect(result.current.showStaffSection).toBe(false);
        expect(result.current.showScoringConfigSection).toBe(false);
        expect(result.current.showScheduleConfig).toBe(false);
        expect(result.current.visibleSectionNavItems.map((item) => item.label)).toEqual([
            'Basic Information',
            'Event Details',
            'Divisions',
        ]);
    });

    it('expands manual payment settings when they are enabled', () => {
        const { result, setManualPaymentsEnabled } = renderController({ manualPaymentsEnabled: false });

        act(() => result.current.handleManualPaymentsChange(true));

        expect(setManualPaymentsEnabled).toHaveBeenCalledWith(true);
        expect(mockExpandSection).toHaveBeenCalledWith('section-manual-payments');
    });
});
