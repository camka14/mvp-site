import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { Controller, useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'motion/react';

import { eventService } from '@/lib/eventService';
import { teamService } from '@/lib/teamService';
import TournamentFields from '@/app/discover/components/TournamentFields';
import { getEventImageUrl, Event, EventState, Division as CoreDivision, UserData, Team, LeagueConfig, Field, TimeSlot, Organization, LeagueScoringConfig, MatchRulesConfig, Sport, TournamentConfig, TemplateDocument, Invite, StaffMemberType, OfficialSchedulingMode, EventOfficial, EventOfficialPosition, formatBillAmount, formatPrice, RegistrationQuestionDraft } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import { useSports } from '@/app/hooks/useSports';

import { TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Checkbox, Group, Button, Alert, Loader, Paper, Text, Title, Stack, ActionIcon, SimpleGrid, Collapse, Badge } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import { locationService } from '@/lib/locationService';
import { userService } from '@/lib/userService';
import { organizationService } from '@/lib/organizationService';
import { fieldService } from '@/lib/fieldService';
import {
    normalizeEntityId,
    sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';
import {
    formatDateTimeInTimeZone,
    formatLocalDateTime,
    getSystemTimeZone,
    hasExplicitTimeZoneOffset,
    normalizeTimeZone,
    nowLocalDateTimeString,
    parseLocalDateTime,
} from '@/lib/dateUtils';
import { createClientId } from '@/lib/clientId';
import LeagueFields, { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { apiRequest } from '@/lib/apiClient';
import {
    requiresOrganizationEventFieldSelection,
    resolveOrganizationEventFieldIds,
} from './eventFieldSelection';
import { applyLeagueScoringConfigFieldChange } from './leagueScoringConfigForm';
import { resolveDraftSportForScoring } from './eventDraftSport';
import { resolveTournamentSetMode } from './tournamentSetMode';
import { applyEventDefaultsToDivisionDetails } from './divisionDefaults';
import { mergeSlotPayloadsForForm } from './slotPayloadMerge';
import { getFieldOrganizationId, hasExternalRentalFieldForEvent } from './externalRentalField';
import CentsInput from '@/components/ui/CentsInput';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import UserCard from '@/components/ui/UserCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import {
    buildDivisionName,
    buildDivisionToken,
    buildEventDivisionId,
    cleanDivisionDisplayName,
    getDivisionTypeById,
    getDivisionTypeOptionsForSport,
    inferDivisionDetails,
    normalizeDivisionGender,
    normalizeDivisionRatingType,
} from '@/lib/divisionTypes';
import {
    getRequiredSignerTypeLabel,
    normalizeRequiredSignerType,
} from '@/lib/templateSignerTypes';
import { canOrganizationUsePaidBilling } from '@/lib/organizationVerification';
import { getFieldDisplayName, sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import { normalizePriceCents, normalizePriceCentsArray } from '@/lib/priceUtils';
import type { EventTaxHandling } from '@/lib/taxPolicy';
import {
    normalizeOrganizerManualTaxRateBps,
    normalizeEventTaxHandling,
    normalizeOrganizationDefaultEventTaxHandling,
    resolvePurchaseTaxPolicy,
    taxPolicyRequiresStripeTaxCalculation,
} from '@/lib/taxPolicy';
import {
    buildCompositeDivisionTypeId,
    buildDefaultDivisionDetailsForSport,
    buildSlotDivisionLookup,
    buildUniqueDivisionIdForToken,
    deriveTournamentPoolSettingsByBracketId,
    DIVISION_GENDER_OPTIONS,
    type DivisionDetailForm,
    type DivisionEditorKind,
    divisionFieldIdsEqual,
    formatPlayoffDivisionParticipantCount,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionFieldIds,
    normalizeDivisionKeys,
    normalizeDivisionNameKey,
    normalizeDivisionTokenPart,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionParticipantCount,
    normalizeSlotDivisionIdsWithLookup,
    normalizeSlotDivisionKeysWithLookup,
    parseCompositeDivisionTypeId,
    type PlayoffDivisionDetailForm,
    resolveSportInput,
    type TournamentPoolSettings,
    applyDivisionAgeCutoff,
} from './eventForm/divisionForm';
import {
    normalizeDirtyTrackedIdList,
    normalizeDirtyTrackedPendingStaffInvites,
} from './eventForm/dirtyDraft';
import {
    buildOfficialPositionsFromTemplates,
    getEventOfficialUserIds,
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
    normalizeSportOfficialPositionTemplates,
} from './eventForm/officials';
import {
    fieldsEqual,
    isEventLocalField,
    isGeneratedLocalFieldPlaceholder,
    isRentedResourceForOrganization,
    isSelectableOrganizationResource,
    mergeFieldsById,
    mergeOrganizationFieldsIntoPool,
    removeOrganizationFieldsFromPool,
    toFieldIdList,
    withOrganizationFieldOwner,
} from './eventForm/resourceGroups';
import {
    buildRentalBookingTimeSlot,
    getRentalBookingSelectorId,
    isRentalBookingSelectorId,
    isRentalLockedTimeSlot,
    mapRentalBookingsToResourceOptions,
    mergeRentalLockedTimeSlots,
    type RentalBookingResourceOption,
    type RentalBookingsResponse,
} from './eventForm/rentalResources';
import { normalizeFieldIds, normalizeSlotFieldIds, normalizeWeekdays, timeSlotsEqual } from './eventForm/slotForm';
import {
    type AssignedStaffCard,
    createEmptyStaffInvite,
    type EventInviteStaffType,
    formatStaffRoleLabel,
    formatStaffStatusLabel,
    getStaffStatusColor,
    getUserEmail,
    mapInviteStaffTypeToRole,
    mapRoleToInviteStaffType,
    normalizeInviteEmail,
    normalizeInviteStaffTypes,
    normalizeInviteStatusToken,
    normalizePendingStaffInvite,
    normalizeRosterStaffTypes,
    type PendingStaffInvite,
    type StaffAssignmentRole,
    type StaffRosterEntry,
    type StaffRosterStatus,
} from './eventForm/staffInvites';
import {
    nullableNumbersEqual,
    normalizeResourceText,
    stringArraysEqual,
    stringSetsEqual,
} from './eventForm/shared';
import {
    DIVISION_LAYOUT_TRANSITION,
    SECTION_ANIMATION_DURATION_MS,
} from './eventForm/constants';
import { AnimatedLayoutSection, AnimatedSection } from './eventForm/components/AnimatedSection';
import { FacilityResourceSelector } from './eventForm/components/FacilityResourceSelector';
import { SectionNavigation } from './eventForm/components/SectionNavigation';
import { BasicInformationSection } from './eventForm/sections/BasicInformationSection';
import { EventDetailsLocationControls } from './eventForm/sections/EventDetailsLocationControls';
import { EventDetailsResourceControls } from './eventForm/sections/EventDetailsResourceControls';
import { LeagueScoringConfigSection } from './eventForm/sections/LeagueScoringConfigSection';
import { MatchRulesConfigSection } from './eventForm/sections/MatchRulesConfigSection';
import { RegistrationQuestionsSection } from './eventForm/sections/RegistrationQuestionsSection';

// UI state will track divisions as string[] of skill keys (e.g., 'beginner')

interface EventFormProps {
    isOpen?: boolean;
    onClose?: () => void;
    currentUser: UserData;
    event: Event;
    organization: Organization | null;
    immutableDefaults?: Partial<Event>;
    formId?: string;
    defaultLocation?: DefaultLocation;
    isCreateMode?: boolean;
    rentalPurchase?: RentalPurchaseContext;
    templateOrganizationId?: string;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    onDraftStateChange?: (state: {
        draft: Partial<Event>;
        baselineDraft: Partial<Event>;
    }) => void;
}

export type EventFormHandle = {
    getDraft: () => Partial<Event>;
    getRegistrationQuestionDrafts: () => RegistrationQuestionDraft[];
    validate: () => Promise<boolean>;
    getValidationErrors: () => Array<{ path: string; message: string }>;
    validatePendingStaffAssignments: () => Promise<void>;
    commitDirtyBaseline: () => void;
    submitPendingStaffInvites: (eventId: string) => Promise<void>;
};

type RentalPurchaseContext = {
    start: string;
    end: string;
    fieldId?: string;
    organization?: Organization | null;
    organizationEmail?: string | null;
    priceCents?: number;
    requiredTemplateIds?: string[];
};

type EventType = Event['eventType'];

type DefaultLocation = {
    location?: string;
    address?: string;
    coordinates?: [number, number];
};

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const alignedDetailsFieldStyles = {
    label: {
        minHeight: '3rem',
        display: 'flex',
        alignItems: 'flex-end',
        lineHeight: 1.25,
    },
} as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STANDARD_NUMBER = 99_999;
const MAX_PRICE_NUMBER = 9_999_999;
const MAX_PRICE_CENTS = MAX_PRICE_NUMBER * 100;
const SECTION_SCROLL_OFFSET = 80;
const SECTION_COLLAPSE_DEFAULTS: Record<string, boolean> = {
    'section-basic-information': false,
    'section-event-details': true,
    'section-registration-questions': true,
    'section-match-rules': true,
    'section-officials': true,
    'section-division-settings': true,
    'section-league-scoring-config': true,
    'section-schedule-config': true,
};
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 80;
const MAX_MEDIUM_TEXT_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1000;
const formatEventDateTimeForForm = (
    value: Date | string | null | undefined,
    timeZone: string,
): string => {
    if (typeof value === 'string' && value.trim() && !hasExplicitTimeZoneOffset(value)) {
        return formatLocalDateTime(value);
    }
    return formatDateTimeInTimeZone(value, timeZone) || formatLocalDateTime(value);
};

const maybeExtendVisibleCountOnScroll = (
    event: React.UIEvent<HTMLDivElement>,
    total: number,
    setVisibleCount: React.Dispatch<React.SetStateAction<number>>,
) => {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 24) {
        return;
    }
    setVisibleCount((prev) => (
        prev >= total ? prev : Math.min(prev + 5, total)
    ));
};

const parseDateValue = (value?: string | null): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const supportsScheduleSlots = (eventType: EventType): boolean =>
    eventType === 'LEAGUE' || eventType === 'TOURNAMENT' || eventType === 'WEEKLY_EVENT';

const hasParentEventRef = (value?: string | null): boolean =>
    typeof value === 'string' && value.trim().length > 0;

const supportsScheduleSlotsForEvent = (eventType: EventType, parentEvent?: string | null): boolean => (
    supportsScheduleSlots(eventType)
    && !(eventType === 'WEEKLY_EVENT' && hasParentEventRef(parentEvent))
);

const supportsFieldCountForEvent = (eventType: EventType): boolean =>
    eventType === 'EVENT' || eventType === 'LEAGUE' || eventType === 'TOURNAMENT';

const supportsOrganizationFieldSelectionForEvent = (eventType: EventType, parentEvent?: string | null): boolean =>
    eventType === 'EVENT' || (eventType === 'WEEKLY_EVENT' && !hasParentEventRef(parentEvent));

const isTournamentPoolPlayFormEnabled = (eventType: EventType, includePlayoffs: boolean): boolean => (
    eventType === 'TOURNAMENT' && includePlayoffs
);

const derivePoolTeamCount = (
    maxTeams: unknown,
    poolCount: unknown,
): number | undefined => {
    const normalizedMaxTeams = Number.isFinite(Number(maxTeams))
        ? Math.max(2, Math.trunc(Number(maxTeams)))
        : null;
    const normalizedPoolCount = Number.isFinite(Number(poolCount))
        ? Math.max(1, Math.trunc(Number(poolCount)))
        : null;
    if (!normalizedMaxTeams || !normalizedPoolCount || normalizedMaxTeams % normalizedPoolCount !== 0) {
        return undefined;
    }
    return normalizedMaxTeams / normalizedPoolCount;
};

const tournamentConfigEqual = (left: TournamentConfig, right: TournamentConfig): boolean => (
    left.doubleElimination === right.doubleElimination
    && left.winnerSetCount === right.winnerSetCount
    && left.loserSetCount === right.loserSetCount
    && left.prize === right.prize
    && left.fieldCount === right.fieldCount
    && left.restTimeMinutes === right.restTimeMinutes
    && left.usesSets === right.usesSets
    && left.matchDurationMinutes === right.matchDurationMinutes
    && left.setDurationMinutes === right.setDurationMinutes
    && stringArraysEqual(
        (left.winnerBracketPointsToVictory || []).map((value) => String(value)),
        (right.winnerBracketPointsToVictory || []).map((value) => String(value)),
    )
    && stringArraysEqual(
        (left.loserBracketPointsToVictory || []).map((value) => String(value)),
        (right.loserBracketPointsToVictory || []).map((value) => String(value)),
    )
);

const leagueConfigEqual = (left: LeagueConfig, right: LeagueConfig): boolean => (
    left.gamesPerOpponent === right.gamesPerOpponent
    && left.includePlayoffs === right.includePlayoffs
    && left.playoffTeamCount === right.playoffTeamCount
    && left.usesSets === right.usesSets
    && nullableNumbersEqual(left.matchDurationMinutes, right.matchDurationMinutes)
    && left.restTimeMinutes === right.restTimeMinutes
    && nullableNumbersEqual(left.setDurationMinutes, right.setDurationMinutes)
    && left.setsPerMatch === right.setsPerMatch
    && stringArraysEqual(
        (left.pointsToVictory || []).map((value) => String(value)),
        (right.pointsToVictory || []).map((value) => String(value)),
    )
);

const normalizeLeagueConfigForSetMode = (
    source: Partial<LeagueConfig> | undefined,
    usesSets: boolean,
): LeagueConfig => {
    const sourceRecord = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    const hasValue = (key: keyof LeagueConfig): boolean => Object.prototype.hasOwnProperty.call(sourceRecord, key);
    const normalizeOptionalDuration = (value: unknown, fallback: number | undefined): number | undefined => {
        if (value === null || value === undefined || value === '') {
            return fallback;
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }
        return Math.max(0, Math.trunc(parsed));
    };
    const normalizedMatchDuration = normalizeOptionalDuration(
        source?.matchDurationMinutes,
        hasValue('matchDurationMinutes') ? undefined : 60,
    );
    const normalizedRestTime = Number.isFinite(Number(source?.restTimeMinutes))
        ? Math.max(0, Math.trunc(Number(source?.restTimeMinutes)))
        : 0;
    const normalizedGamesPerOpponent = Number.isFinite(Number(source?.gamesPerOpponent))
        ? Math.max(1, Math.trunc(Number(source?.gamesPerOpponent)))
        : 1;
    const normalizedIncludePlayoffs = Boolean(source?.includePlayoffs);
    const normalizedPlayoffTeamCount = Number.isFinite(Number(source?.playoffTeamCount))
        ? Math.max(2, Math.trunc(Number(source?.playoffTeamCount)))
        : undefined;

    if (usesSets) {
        const allowedSetCounts = [1, 3, 5];
        const normalizedSetsPerMatch = Number.isFinite(Number(source?.setsPerMatch))
            && allowedSetCounts.includes(Math.trunc(Number(source?.setsPerMatch)))
            ? Math.trunc(Number(source?.setsPerMatch))
            : 1;
        const normalizedSetDuration = normalizeOptionalDuration(
            source?.setDurationMinutes,
            hasValue('setDurationMinutes') ? undefined : 20,
        );
        const normalizedPoints = Array.isArray(source?.pointsToVictory)
            ? source.pointsToVictory
                .slice(0, normalizedSetsPerMatch)
                .map((value) => {
                    const parsed = Number(value);
                    return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 21;
                })
            : [];
        while (normalizedPoints.length < normalizedSetsPerMatch) {
            normalizedPoints.push(21);
        }
        return {
            gamesPerOpponent: normalizedGamesPerOpponent,
            includePlayoffs: normalizedIncludePlayoffs,
            playoffTeamCount: normalizedPlayoffTeamCount,
            usesSets: true,
            matchDurationMinutes: normalizedMatchDuration,
            restTimeMinutes: normalizedRestTime,
            setDurationMinutes: normalizedSetDuration,
            setsPerMatch: normalizedSetsPerMatch,
            pointsToVictory: normalizedPoints,
        };
    }

    return {
        gamesPerOpponent: normalizedGamesPerOpponent,
        includePlayoffs: normalizedIncludePlayoffs,
        playoffTeamCount: normalizedPlayoffTeamCount,
        usesSets: false,
        matchDurationMinutes: normalizedMatchDuration,
        restTimeMinutes: normalizedRestTime,
        setDurationMinutes: undefined,
        setsPerMatch: undefined,
        pointsToVictory: undefined,
    };
};

const buildDivisionLeagueConfig = (
    detail: Partial<DivisionDetailForm> | undefined,
    fallback: LeagueConfig,
    usesSets: boolean,
): LeagueConfig => {
    const hasDetailValue = (key: keyof DivisionDetailForm): boolean => Boolean(
        detail && Object.prototype.hasOwnProperty.call(detail, key),
    );
    return normalizeLeagueConfigForSetMode({
        ...fallback,
        gamesPerOpponent: detail?.gamesPerOpponent ?? fallback.gamesPerOpponent,
        includePlayoffs: fallback.includePlayoffs,
        playoffTeamCount: fallback.playoffTeamCount,
        usesSets: detail?.usesSets ?? fallback.usesSets,
        matchDurationMinutes: hasDetailValue('matchDurationMinutes')
            ? detail?.matchDurationMinutes
            : fallback.matchDurationMinutes,
        restTimeMinutes: detail?.restTimeMinutes ?? fallback.restTimeMinutes,
        setDurationMinutes: hasDetailValue('setDurationMinutes')
            ? detail?.setDurationMinutes
            : fallback.setDurationMinutes,
        setsPerMatch: detail?.setsPerMatch ?? fallback.setsPerMatch,
        pointsToVictory: Array.isArray(detail?.pointsToVictory) && detail.pointsToVictory.length
            ? detail.pointsToVictory
            : fallback.pointsToVictory,
    }, usesSets);
};

const leagueConfigToDivisionFields = (config: LeagueConfig): Pick<
    DivisionDetailForm,
    'gamesPerOpponent'
    | 'restTimeMinutes'
    | 'usesSets'
    | 'matchDurationMinutes'
    | 'setDurationMinutes'
    | 'setsPerMatch'
    | 'pointsToVictory'
> => ({
    gamesPerOpponent: config.gamesPerOpponent,
    restTimeMinutes: config.restTimeMinutes,
    usesSets: config.usesSets,
    matchDurationMinutes: config.matchDurationMinutes,
    setDurationMinutes: config.setDurationMinutes,
    setsPerMatch: config.setsPerMatch,
    pointsToVictory: Array.isArray(config.pointsToVictory) ? [...config.pointsToVictory] : undefined,
});

const leagueSlotsEqual = (left: LeagueSlotForm[], right: LeagueSlotForm[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const first = left[index];
        const second = right[index];
        if (
            first.key !== second.key
            || first.$id !== second.$id
            || !stringSetsEqual(normalizeSlotFieldIds(first), normalizeSlotFieldIds(second))
            || !stringSetsEqual(
                normalizeWeekdays(first).map((value) => String(value)),
                normalizeWeekdays(second).map((value) => String(value)),
            )
            || !stringSetsEqual(normalizeDivisionKeys(first.divisions), normalizeDivisionKeys(second.divisions))
            || first.startDate !== second.startDate
            || first.endDate !== second.endDate
            || first.startTimeMinutes !== second.startTimeMinutes
            || first.endTimeMinutes !== second.endTimeMinutes
            || Boolean(first.repeating) !== Boolean(second.repeating)
            || Boolean(first.checking) !== Boolean(second.checking)
            || (first.error ?? '') !== (second.error ?? '')
            || !slotConflictsEqual(first.conflicts, second.conflicts)
        ) {
            return false;
        }
    }
    return true;
};

const normalizeTemplateType = (value: unknown): TemplateDocument['type'] => {
    if (typeof value === 'string' && value.toUpperCase() === 'TEXT') {
        return 'TEXT';
    }
    return 'PDF';
};

const mapTemplateRow = (row: Record<string, any>): TemplateDocument => {
    const roleIndexRaw = row?.roleIndex;
    const roleIndex = typeof roleIndexRaw === 'number' ? roleIndexRaw : Number(roleIndexRaw);
    const roleIndexesRaw = Array.isArray(row?.roleIndexes) ? row.roleIndexes : undefined;
    const roleIndexes = roleIndexesRaw
        ? roleIndexesRaw
            .map((entry: unknown) => Number(entry))
            .filter((value: number) => Number.isFinite(value))
        : undefined;
    const signerRolesRaw = Array.isArray(row?.signerRoles) ? row.signerRoles : undefined;
    const signerRoles = signerRolesRaw
        ? signerRolesRaw
            .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
            .map((entry: string) => entry.trim())
        : undefined;
    const signOnceRaw = row?.signOnce;
    const requiredSignerType = normalizeRequiredSignerType(row?.requiredSignerType);

    return {
        $id: String(row?.$id ?? ''),
        templateId: row?.templateId ?? undefined,
        organizationId: row?.organizationId ?? '',
        title: row?.title ?? 'Untitled Template',
        description: row?.description ?? undefined,
        signOnce: typeof signOnceRaw === 'boolean' ? signOnceRaw : signOnceRaw == null ? true : Boolean(signOnceRaw),
        status: row?.status ?? undefined,
        roleIndex: Number.isFinite(roleIndex) ? roleIndex : undefined,
        roleIndexes: roleIndexes && roleIndexes.length ? roleIndexes : undefined,
        signerRoles: signerRoles && signerRoles.length ? signerRoles : undefined,
        requiredSignerType,
        type: normalizeTemplateType(row?.type),
        content: row?.content ?? undefined,
        $createdAt: row?.$createdAt ?? undefined,
    };
};

// Compares two numeric start/end pairs to detect overlapping minutes within the same day.
const slotsOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
    Math.max(startA, startB) < Math.min(endA, endB);

const slotDateTimeRangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
    startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

const CONFLICT_LOOKUP_START = '1970-01-01T00:00:00.000Z';
const CONFLICT_LOOKUP_END = '2100-01-01T00:00:00.000Z';
const AUTO_RESOLVE_STEP_MINUTES = 15;
const AUTO_RESOLVE_MAX_STEPS = 96;
const MAX_REPEATING_CONFLICT_SCAN_DAYS = 730;

type SlotConflictSnapshot = {
    key: string;
    $id?: string;
    scheduledFieldId?: string;
    scheduledFieldIds: string[];
    dayOfWeek?: number;
    daysOfWeek: number[];
    divisions: string[];
    startDate?: string;
    endDate?: string;
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    repeating: boolean;
};

type SlotConflictPayload = {
    eventId: string;
    eventType: EventType;
    parentEvent?: string | null;
    eventStart?: string;
    eventEnd?: string;
    slots: SlotConflictSnapshot[];
};

type SlotConflictContext = {
    eventId: string;
    eventStart?: string;
    eventEnd?: string;
};

type ComparableConflictSlot = {
    repeating?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    dayOfWeek?: number;
    daysOfWeek?: number[];
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    scheduledFieldId?: string;
    scheduledFieldIds?: string[];
};

const addMinutesToDate = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60 * 1000);

const atStartOfDay = (date: Date): Date =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const withMinutesOnDay = (day: Date, minutes: number): Date =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);

const mondayFirstDay = (date: Date): number => (date.getDay() + 6) % 7;

const toSlotConflictSignature = (conflict: LeagueSlotForm['conflicts'][number]): string => (
    `${String(conflict.event?.$id ?? '')}|${String(conflict.schedule?.$id ?? '')}|${conflict.event?.start ?? ''}|${conflict.event?.end ?? ''}`
);

const slotConflictsEqual = (
    left: LeagueSlotForm['conflicts'],
    right: LeagueSlotForm['conflicts'],
): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    const leftKeys = left.map(toSlotConflictSignature).sort();
    const rightKeys = right.map(toSlotConflictSignature).sort();
    return leftKeys.every((value, index) => value === rightKeys[index]);
};

type FlattenedFormError = {
    path: string;
    message: string;
};

const flattenFormErrors = (value: unknown, path: string[] = []): FlattenedFormError[] => {
    if (!value || typeof value !== 'object') {
        return [];
    }

    const node = value as Record<string, unknown>;
    const flattened: FlattenedFormError[] = [];
    if (typeof node.message === 'string' && node.message.trim().length > 0) {
        flattened.push({
            path: path.length ? path.join('.') : 'form',
            message: node.message,
        });
    }

    for (const [key, child] of Object.entries(node)) {
        if (key === 'message' || key === 'type' || key === 'ref') {
            continue;
        }
        flattened.push(...flattenFormErrors(child, [...path, key]));
    }

    return flattened;
};

const dedupeValidationErrors = (issues: FlattenedFormError[]): FlattenedFormError[] => {
    const seen = new Set<string>();
    return issues.filter((issue) => {
        const path = issue.path.trim();
        const message = issue.message.trim();
        if (!message) {
            return false;
        }
        const key = `${path}::${message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const flattenZodIssues = (issues: z.ZodIssue[]): FlattenedFormError[] => issues
    .map((issue) => ({
        path: issue.path.length ? issue.path.join('.') : 'form',
        message: issue.message,
    }))
    .filter((issue) => issue.message.trim().length > 0);

const parseEventRange = (event: Event): { start: Date; end: Date } | null => {
    const start = parseLocalDateTime(event.start ?? null);
    const end = parseLocalDateTime(event.end ?? null);
    if (!start || !end || end.getTime() <= start.getTime()) {
        return null;
    }
    return { start, end };
};

const resolveSlotWindowRange = (
    slot: Pick<ComparableConflictSlot, 'startDate' | 'endDate'>,
    eventStart?: string,
    eventEnd?: string,
): { start: Date; end: Date } | null => {
    const start = parseLocalDateTime(slot.startDate ?? eventStart ?? null);
    if (!start) {
        return null;
    }

    const end = parseLocalDateTime(slot.endDate ?? eventEnd ?? null)
        ?? addMinutesToDate(start, 90 * 24 * 60);
    if (end.getTime() <= start.getTime()) {
        return null;
    }

    return { start, end };
};

const repeatingSlotOverlapsEvent = (
    slot: Pick<ComparableConflictSlot, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    eventRange: { start: Date; end: Date },
    eventStart?: string,
    eventEnd?: string,
): boolean => {
    const slotDays = normalizeWeekdays(slot);
    if (
        !slotDays.length ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number' ||
        slot.endTimeMinutes <= slot.startTimeMinutes
    ) {
        return false;
    }

    const slotWindow = resolveSlotWindowRange(slot, eventStart, eventEnd);
    if (!slotWindow || !slotDateTimeRangesOverlap(slotWindow.start, slotWindow.end, eventRange.start, eventRange.end)) {
        return false;
    }

    const overlapStart = new Date(Math.max(slotWindow.start.getTime(), eventRange.start.getTime()));
    const overlapEnd = new Date(Math.min(slotWindow.end.getTime(), eventRange.end.getTime()));
    if (overlapEnd.getTime() <= overlapStart.getTime()) {
        return false;
    }

    let cursor = atStartOfDay(overlapStart);
    const lastDay = atStartOfDay(overlapEnd);
    let scannedDays = 0;

    while (cursor.getTime() <= lastDay.getTime() && scannedDays <= MAX_REPEATING_CONFLICT_SCAN_DAYS) {
        if (slotDays.includes(mondayFirstDay(cursor))) {
            const slotStart = withMinutesOnDay(cursor, slot.startTimeMinutes);
            const slotEnd = withMinutesOnDay(cursor, slot.endTimeMinutes);
            if (slotDateTimeRangesOverlap(slotStart, slotEnd, eventRange.start, eventRange.end)) {
                return true;
            }
        }
        cursor = addMinutesToDate(cursor, 24 * 60);
        scannedDays += 1;
    }

    return false;
};

const parseExplicitSlotRange = (
    slot: Pick<ComparableConflictSlot, 'startDate' | 'endDate'>,
): { start: Date; end: Date } | null => {
    const start = parseLocalDateTime(slot.startDate ?? null);
    const end = parseLocalDateTime(slot.endDate ?? null);
    if (!start || !end || end.getTime() <= start.getTime()) {
        return null;
    }
    return { start, end };
};

const normalizeSlotBoundaryOverrideForForm = (
    slotValue: string | Date | null | undefined,
    eventBoundary: string | Date | null | undefined,
    timeZone: string,
): string | undefined => {
    const normalizedSlotValue = formatEventDateTimeForForm(slotValue ?? null, timeZone);
    if (!normalizedSlotValue) {
        return undefined;
    }

    const normalizedEventBoundary = formatEventDateTimeForForm(eventBoundary ?? null, timeZone);
    return normalizedEventBoundary && normalizedSlotValue === normalizedEventBoundary
        ? undefined
        : normalizedSlotValue;
};

const repeatingSlotsOverlap = (
    slotA: Pick<ComparableConflictSlot, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    contextA: { eventStart?: string; eventEnd?: string },
    slotB: Pick<ComparableConflictSlot, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    contextB: { eventStart?: string; eventEnd?: string },
): boolean => {
    const slotADays = normalizeWeekdays(slotA);
    const slotBDays = normalizeWeekdays(slotB);
    if (!slotADays.length || !slotBDays.length) {
        return false;
    }

    if (
        typeof slotA.startTimeMinutes !== 'number'
        || typeof slotA.endTimeMinutes !== 'number'
        || typeof slotB.startTimeMinutes !== 'number'
        || typeof slotB.endTimeMinutes !== 'number'
        || slotA.endTimeMinutes <= slotA.startTimeMinutes
        || slotB.endTimeMinutes <= slotB.startTimeMinutes
    ) {
        return false;
    }

    if (!slotsOverlap(slotA.startTimeMinutes, slotA.endTimeMinutes, slotB.startTimeMinutes, slotB.endTimeMinutes)) {
        return false;
    }

    const slotAWindow = resolveSlotWindowRange(slotA, contextA.eventStart, contextA.eventEnd);
    const slotBWindow = resolveSlotWindowRange(slotB, contextB.eventStart, contextB.eventEnd);
    if (!slotAWindow || !slotBWindow || !slotDateTimeRangesOverlap(slotAWindow.start, slotAWindow.end, slotBWindow.start, slotBWindow.end)) {
        return false;
    }

    const overlapStart = new Date(Math.max(slotAWindow.start.getTime(), slotBWindow.start.getTime()));
    const overlapEnd = new Date(Math.min(slotAWindow.end.getTime(), slotBWindow.end.getTime()));
    if (overlapEnd.getTime() <= overlapStart.getTime()) {
        return false;
    }

    let cursor = atStartOfDay(overlapStart);
    const lastDay = atStartOfDay(overlapEnd);
    let scannedDays = 0;

    while (cursor.getTime() <= lastDay.getTime() && scannedDays <= MAX_REPEATING_CONFLICT_SCAN_DAYS) {
        const weekday = mondayFirstDay(cursor);
        if (slotADays.includes(weekday) && slotBDays.includes(weekday)) {
            const slotAStart = withMinutesOnDay(cursor, slotA.startTimeMinutes);
            const slotAEnd = withMinutesOnDay(cursor, slotA.endTimeMinutes);
            const slotBStart = withMinutesOnDay(cursor, slotB.startTimeMinutes);
            const slotBEnd = withMinutesOnDay(cursor, slotB.endTimeMinutes);
            if (
                slotDateTimeRangesOverlap(slotAStart, slotAEnd, slotBStart, slotBEnd)
                && slotDateTimeRangesOverlap(slotAStart, slotAEnd, overlapStart, overlapEnd)
                && slotDateTimeRangesOverlap(slotBStart, slotBEnd, overlapStart, overlapEnd)
            ) {
                return true;
            }
        }

        cursor = addMinutesToDate(cursor, 24 * 60);
        scannedDays += 1;
    }

    return false;
};

const slotOverlapsExistingSlot = (
    slot: Pick<ComparableConflictSlot, 'repeating' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    slotContext: { eventStart?: string; eventEnd?: string },
    existingSlot: Pick<ComparableConflictSlot, 'repeating' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    existingSlotContext: { eventStart?: string; eventEnd?: string },
): boolean => {
    const slotRepeating = slot.repeating !== false;
    const existingRepeating = existingSlot.repeating !== false;

    if (!slotRepeating && !existingRepeating) {
        const slotRange = parseExplicitSlotRange(slot);
        const existingRange = parseExplicitSlotRange(existingSlot);
        if (!slotRange || !existingRange) {
            return false;
        }
        return slotDateTimeRangesOverlap(slotRange.start, slotRange.end, existingRange.start, existingRange.end);
    }

    if (slotRepeating && existingRepeating) {
        return repeatingSlotsOverlap(slot, slotContext, existingSlot, existingSlotContext);
    }

    if (slotRepeating) {
        const existingRange = parseExplicitSlotRange(existingSlot)
            ?? resolveSlotWindowRange(existingSlot, existingSlotContext.eventStart, existingSlotContext.eventEnd);
        if (!existingRange) {
            return false;
        }
        return repeatingSlotOverlapsEvent(slot, existingRange, slotContext.eventStart, slotContext.eventEnd);
    }

    const slotRange = parseExplicitSlotRange(slot)
        ?? resolveSlotWindowRange(slot, slotContext.eventStart, slotContext.eventEnd);
    if (!slotRange) {
        return false;
    }
    return repeatingSlotOverlapsEvent(existingSlot, slotRange, existingSlotContext.eventStart, existingSlotContext.eventEnd);
};

const findOverlappingEventSlotForField = (
    slot: Pick<ComparableConflictSlot, 'repeating' | 'startDate' | 'endDate' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes'>,
    event: Event,
    context: SlotConflictContext,
    fieldId?: string,
): TimeSlot | null => {
    if (!event?.$id || event.$id === context.eventId) {
        return null;
    }
    if (!Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
        return null;
    }
    const normalizedFieldId = typeof fieldId === 'string' ? fieldId.trim() : '';
    if (!normalizedFieldId) {
        return null;
    }

    const eventSlotContext = {
        eventStart: event.start ?? undefined,
        eventEnd: event.end ?? undefined,
    };

    for (const eventSlot of event.timeSlots) {
        const eventSlotFieldIds = normalizeSlotFieldIds({
            scheduledFieldId: eventSlot.scheduledFieldId,
            scheduledFieldIds: eventSlot.scheduledFieldIds,
        });
        if (!eventSlotFieldIds.includes(normalizedFieldId)) {
            continue;
        }
        if (slotOverlapsExistingSlot(slot, context, eventSlot, eventSlotContext)) {
            return eventSlot;
        }
    }

    return null;
};

const slotOverlapsExistingEvent = (
    slot: Pick<ComparableConflictSlot, 'repeating' | 'startDate' | 'endDate' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes'>,
    event: Event,
    context: SlotConflictContext,
    fieldId?: string,
): boolean => {
    if (!event?.$id || event.$id === context.eventId) {
        return false;
    }

    const normalizedEventType = typeof event.eventType === 'string' ? event.eventType.toUpperCase() : '';
    const isSlotBasedEventType = (
        normalizedEventType === 'LEAGUE'
        || normalizedEventType === 'TOURNAMENT'
        || (normalizedEventType === 'WEEKLY_EVENT' && !hasParentEventRef(event.parentEvent ?? null))
    );
    const overlappingEventSlot = findOverlappingEventSlotForField(slot, event, context, fieldId);
    if (overlappingEventSlot) {
        return true;
    }
    if (isSlotBasedEventType) {
        // Slot-based events (league/tournament/weekly parent) should only conflict via slot overlap.
        return false;
    }

    const eventRange = parseEventRange(event);
    if (!eventRange) {
        return false;
    }

    if (slot.repeating === false) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
            return false;
        }
        return slotDateTimeRangesOverlap(slotStart, slotEnd, eventRange.start, eventRange.end);
    }

    return repeatingSlotOverlapsEvent(slot, eventRange, context.eventStart, context.eventEnd);
};

const snapshotToSlotForm = (slot: SlotConflictSnapshot): LeagueSlotForm => ({
    key: slot.key,
    $id: slot.$id,
    scheduledFieldId: slot.scheduledFieldId,
    scheduledFieldIds: slot.scheduledFieldIds,
    dayOfWeek: slot.dayOfWeek as LeagueSlotForm['dayOfWeek'],
    daysOfWeek: slot.daysOfWeek as LeagueSlotForm['daysOfWeek'],
    divisions: slot.divisions,
    startDate: slot.startDate,
    endDate: slot.endDate,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    repeating: slot.repeating,
    conflicts: [],
    checking: false,
    error: undefined,
});

const slotCanCheckExternalConflicts = (
    slot: LeagueSlotForm,
    context: SlotConflictContext,
): boolean => {
    if (!normalizeSlotFieldIds(slot).length) {
        return false;
    }

    if (slot.repeating === false) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        return Boolean(slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime());
    }

    const hasTimeRange = (
        typeof slot.startTimeMinutes === 'number' &&
        typeof slot.endTimeMinutes === 'number' &&
        slot.endTimeMinutes > slot.startTimeMinutes
    );
    if (!hasTimeRange || normalizeWeekdays(slot).length === 0) {
        return false;
    }

    return Boolean(resolveSlotWindowRange(slot, context.eventStart, context.eventEnd));
};

const minutesFromDate = (value: Date | null): number | undefined => {
    if (!value) {
        return undefined;
    }
    return value.getHours() * 60 + value.getMinutes();
};

const buildConflictEntry = (
    slot: LeagueSlotForm,
    event: Event,
    fieldId: string,
    context: SlotConflictContext,
): LeagueSlotForm['conflicts'][number] => {
    const overlappingEventSlot = findOverlappingEventSlotForField(slot, event, context, fieldId);
    if (overlappingEventSlot) {
        const overlappingFieldIds = normalizeSlotFieldIds({
            scheduledFieldId: overlappingEventSlot.scheduledFieldId,
            scheduledFieldIds: overlappingEventSlot.scheduledFieldIds,
        });
        return {
            event,
            schedule: {
                $id: overlappingEventSlot.$id || `event-${event.$id}-field-${fieldId}`,
                repeating: overlappingEventSlot.repeating !== false,
                dayOfWeek: overlappingEventSlot.dayOfWeek,
                daysOfWeek: overlappingEventSlot.daysOfWeek,
                startDate: overlappingEventSlot.startDate,
                endDate: overlappingEventSlot.endDate ?? undefined,
                startTimeMinutes: overlappingEventSlot.startTimeMinutes,
                endTimeMinutes: overlappingEventSlot.endTimeMinutes,
                scheduledFieldId: overlappingFieldIds[0] ?? fieldId,
                scheduledFieldIds: overlappingFieldIds.length ? overlappingFieldIds : [fieldId],
            },
        };
    }

    const eventStart = parseLocalDateTime(event.start ?? null);
    const eventEnd = parseLocalDateTime(event.end ?? null);

    return {
        event,
        schedule: {
            $id: `event-${event.$id}-field-${fieldId}`,
            repeating: false,
            startDate: event.start ?? undefined,
            endDate: event.end ?? undefined,
            startTimeMinutes: minutesFromDate(eventStart),
            endTimeMinutes: minutesFromDate(eventEnd),
            scheduledFieldId: fieldId,
            scheduledFieldIds: [fieldId],
        },
    };
};

const buildExternalSlotConflicts = (
    slot: LeagueSlotForm,
    eventsByFieldId: Map<string, Event[]>,
    context: SlotConflictContext,
): LeagueSlotForm['conflicts'] => {
    const seen = new Set<string>();
    const conflicts: LeagueSlotForm['conflicts'] = [];

    normalizeSlotFieldIds(slot).forEach((fieldId) => {
        const fieldEvents = eventsByFieldId.get(fieldId) ?? [];
        fieldEvents.forEach((event) => {
            if (!slotOverlapsExistingEvent(slot, event, context, fieldId)) {
                return;
            }
            const key = `${event.$id}:${fieldId}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            conflicts.push(buildConflictEntry(slot, event, fieldId, context));
        });
    });

    return conflicts.sort((left, right) => {
        const leftStart = parseLocalDateTime(left.event.start ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightStart = parseLocalDateTime(right.event.start ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftStart - rightStart;
    });
};

const hasConflictingEvents = (
    slot: LeagueSlotForm,
    conflicts: LeagueSlotForm['conflicts'],
    context: SlotConflictContext,
): boolean => conflicts.some((conflict) => slotOverlapsExistingEvent(
    slot,
    conflict.event,
    context,
    normalizeSlotFieldIds({
        scheduledFieldId: conflict.schedule?.scheduledFieldId,
        scheduledFieldIds: conflict.schedule?.scheduledFieldIds,
    })[0],
));

const buildAutoResolvedSlotUpdate = (
    slot: LeagueSlotForm,
    context: SlotConflictContext,
): Partial<LeagueSlotForm> | null => {
    if (!slot.conflicts.length) {
        return null;
    }

    if (slot.repeating === false) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
            return null;
        }
        const durationMinutes = Math.max(
            AUTO_RESOLVE_STEP_MINUTES,
            Math.ceil((slotEnd.getTime() - slotStart.getTime()) / (60 * 1000)),
        );
        const latestConflictEnd = slot.conflicts
            .map((conflict) => parseLocalDateTime(conflict.event.end ?? null))
            .filter((value): value is Date => Boolean(value))
            .sort((left, right) => right.getTime() - left.getTime())[0];
        let candidateStart = latestConflictEnd && latestConflictEnd.getTime() > slotStart.getTime()
            ? addMinutesToDate(latestConflictEnd, AUTO_RESOLVE_STEP_MINUTES)
            : addMinutesToDate(slotStart, AUTO_RESOLVE_STEP_MINUTES);

        for (let step = 0; step < AUTO_RESOLVE_MAX_STEPS; step += 1) {
            const candidateEnd = addMinutesToDate(candidateStart, durationMinutes);
            const candidateSlot: LeagueSlotForm = {
                ...slot,
                startDate: formatLocalDateTime(candidateStart) || undefined,
                endDate: formatLocalDateTime(candidateEnd) || undefined,
            };
            if (!hasConflictingEvents(candidateSlot, slot.conflicts, context)) {
                return {
                    startDate: candidateSlot.startDate,
                    endDate: candidateSlot.endDate,
                };
            }
            candidateStart = addMinutesToDate(candidateStart, AUTO_RESOLVE_STEP_MINUTES);
        }

        return null;
    }

    if (
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number' ||
        slot.endTimeMinutes <= slot.startTimeMinutes
    ) {
        return null;
    }

    const durationMinutes = slot.endTimeMinutes - slot.startTimeMinutes;
    for (let step = 1; step < AUTO_RESOLVE_MAX_STEPS; step += 1) {
        const candidateStart = slot.startTimeMinutes + step * AUTO_RESOLVE_STEP_MINUTES;
        const candidateEnd = candidateStart + durationMinutes;
        if (candidateEnd > 24 * 60) {
            break;
        }
        const candidateSlot: LeagueSlotForm = {
            ...slot,
            startTimeMinutes: candidateStart,
            endTimeMinutes: candidateEnd,
        };
        if (!hasConflictingEvents(candidateSlot, slot.conflicts, context)) {
            return {
                startTimeMinutes: candidateStart,
                endTimeMinutes: candidateEnd,
            };
        }
    }

    return null;
};

// Evaluates the current slot against other form slots to surface inline validation errors for schedulable event types.
const computeSlotError = (
    slots: LeagueSlotForm[],
    index: number,
    eventType: EventType,
    parentEvent?: string | null,
): string | undefined => {
    if (!supportsScheduleSlotsForEvent(eventType, parentEvent)) {
        return undefined;
    }

    const slot = slots[index];
    if (!slot) {
        return undefined;
    }

    const slotFieldIds = normalizeSlotFieldIds(slot);
    if (!slotFieldIds.length) {
        return undefined;
    }

    const isRepeating = slot.repeating !== false;
    if (!isRepeating) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd) {
            return undefined;
        }
        if (slotEnd.getTime() <= slotStart.getTime()) {
            return 'Timeslot must end after it starts.';
        }

        const hasOverlap = slots.some((other, otherIndex) => {
            if (otherIndex === index || other.repeating !== false) {
                return false;
            }
            const otherFieldIds = normalizeSlotFieldIds(other);
            if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
                return false;
            }
            const otherStart = parseLocalDateTime(other.startDate ?? null);
            const otherEnd = parseLocalDateTime(other.endDate ?? null);
            if (!otherStart || !otherEnd) {
                return false;
            }
            return slotDateTimeRangesOverlap(slotStart, slotEnd, otherStart, otherEnd);
        });

        return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
    }

    const slotDays = normalizeWeekdays(slot);
    if (
        slotDays.length === 0 ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number'
    ) {
        return undefined;
    }

    const slotStartTime = slot.startTimeMinutes;
    const slotEndTime = slot.endTimeMinutes;
    if (slotEndTime <= slotStartTime) {
        return 'Timeslot must end after it starts.';
    }

    const hasOverlap = slots.some((other, otherIndex) => {
        if (otherIndex === index || other.repeating === false) {
            return false;
        }
        const otherFieldIds = normalizeSlotFieldIds(other);
        if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
            return false;
        }
        const otherDays = normalizeWeekdays(other);
        if (otherDays.length === 0 || !otherDays.some((day) => slotDays.includes(day))) {
            return false;
        }
        if (
            typeof other.startTimeMinutes !== 'number' ||
            typeof other.endTimeMinutes !== 'number'
        ) {
            return false;
        }
        return slotsOverlap(slotStartTime, slotEndTime, other.startTimeMinutes, other.endTimeMinutes);
    });

    return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
};

// Resets conflict bookkeeping and assigns slot errors so UI can block submission when overlaps exist.
const normalizeSlotState = (slots: LeagueSlotForm[], eventType: EventType, parentEvent?: string | null): LeagueSlotForm[] => {
    let mutated = false;

    const normalized = slots.map((slot, index) => {
        const error = computeSlotError(slots, index, eventType, parentEvent);
        const needsUpdate = slot.error !== error;

        if (!needsUpdate) {
            return slot;
        }

        mutated = true;
        return {
            ...slot,
            error,
        };
    });

    return mutated ? normalized : slots;
};

// Converts mixed input values into numbers while respecting optional fallbacks for blank fields.
const normalizeNumber = (value: unknown, fallback?: number): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return undefined;
};

const normalizeInstallmentAmounts = (amounts: unknown): number[] => normalizePriceCentsArray(amounts);

const sumInstallmentAmounts = (amounts: unknown): number => (
    normalizeInstallmentAmounts(amounts).reduce((sum, amount) => sum + amount, 0)
);

const hasMobileBlockingPaymentPlanConfig = (config: {
    allowPaymentPlans?: boolean | null;
    installmentCount?: number | null;
    installmentAmounts?: unknown;
    installmentDueDates?: unknown;
    installmentDueRelativeDays?: unknown;
}): boolean => {
    const installmentCount = Number.isFinite(Number(config.installmentCount))
        ? Math.max(0, Math.trunc(Number(config.installmentCount)))
        : 0;
    return Boolean(config.allowPaymentPlans)
        || installmentCount > 0
        || normalizeInstallmentAmounts(config.installmentAmounts).length > 0
        || (Array.isArray(config.installmentDueDates) && config.installmentDueDates.length > 0)
        || (Array.isArray(config.installmentDueRelativeDays) && config.installmentDueRelativeDays.length > 0);
};

const formatMobileEditUnsupportedReasons = (reasons: string[]): string => {
    if (reasons.length === 0) return 'unsupported settings';
    if (reasons.length === 1) return reasons[0];
    if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
    return `${reasons.slice(0, -1).join(', ')}, and ${reasons[reasons.length - 1]}`;
};

const normalizeInstallmentDates = (dates: unknown): string[] => {
    if (!Array.isArray(dates)) return [];
    return dates
        .map((entry) => parseDateValue(typeof entry === 'string' ? entry : String(entry ?? '')))
        .filter((value): value is Date => Boolean(value))
        .map((value) => value.toISOString());
};

const normalizeInstallmentRelativeDays = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.trunc(entry));
};

const sanitizeMatchRulesOverrideForEditor = (value: unknown): MatchRulesConfig | null => {
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

const formatLatLngLabel = (lat?: number, lng?: number): string => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return '';
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return '';
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const getLongitudeFromCoordinates = (coordinates?: [number, number]): number | undefined => {
    if (!Array.isArray(coordinates)) {
        return undefined;
    }
    const [lng] = coordinates;
    return typeof lng === 'number' && Number.isFinite(lng) ? lng : undefined;
};

const getLatitudeFromCoordinates = (coordinates?: [number, number]): number | undefined => {
    if (!Array.isArray(coordinates)) {
        return undefined;
    }
    const lat = coordinates[1];
    return typeof lat === 'number' && Number.isFinite(lat) ? lat : undefined;
};

const coordinatesAreSet = (coordinates?: [number, number]): boolean => {
    const lat = getLatitudeFromCoordinates(coordinates);
    const lng = getLongitudeFromCoordinates(coordinates);
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return false;
    }
    return !(lat === 0 && lng === 0);
};

const toUserLabel = (user: Partial<UserData> | undefined, fallbackId: string): string => {
    const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
    const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) {
        return fullName;
    }
    if (typeof user?.userName === 'string' && user.userName.trim().length > 0) {
        return user.userName.trim();
    }
    return fallbackId;
};

const userMatchesSearch = (candidate: Partial<UserData> | undefined, query: string): boolean => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery.length) {
        return true;
    }
    const tokens = [
        `${candidate?.firstName ?? ''} ${candidate?.lastName ?? ''}`.trim(),
        candidate?.userName ?? '',
        candidate?.fullName ?? '',
        candidate?.$id ?? '',
    ]
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
    return tokens.some((value) => value.includes(normalizedQuery));
};

// Drop match back-references to avoid circular data when React Hook Form clones defaults.
const sanitizeFieldForForm = (field: Field): Field => {
    const { matches: _matches, ...rest } = field as Field & { matches?: unknown };
    return { ...rest } as Field;
};

const sanitizeFieldsForForm = (fields?: Field[] | null): Field[] =>
    Array.isArray(fields) ? fields.map(sanitizeFieldForForm) : [];

const defaultFieldLocationForEvent = (eventLocation?: string | null): string => {
    const trimmed = typeof eventLocation === 'string' ? eventLocation.trim() : '';
    return trimmed.length ? trimmed : '';
};

const withEventFieldLocationDefault = (
    field: Field,
    eventLocation?: string | null,
    previousEventLocation?: string | null,
): Field => {
    const defaultLocation = defaultFieldLocationForEvent(eventLocation);
    const previousDefaultLocation = defaultFieldLocationForEvent(previousEventLocation);
    const currentLocation = typeof field.location === 'string' ? field.location.trim() : '';

    if (!defaultLocation) {
        return previousDefaultLocation && currentLocation === previousDefaultLocation
            ? { ...field, location: '' }
            : field;
    }

    if (!currentLocation || (previousDefaultLocation && currentLocation === previousDefaultLocation)) {
        return { ...field, location: defaultLocation };
    }

    return field;
};

type EventFormState = {
    $id: string;
    name: string;
    description: string;
    location: string;
    address: string;
    coordinates: [number, number];
    start: string;
    end: string;
    timeZone: string;
    state: EventState;
    eventType: EventType;
    parentEvent?: string;
    sportId: string;
    sportConfig: Sport | null;
    price: number;
    taxHandling: EventTaxHandling;
    organizerManualTaxRateBps: number;
    minAge?: number;
    maxAge?: number;
    allowPaymentPlans: boolean;
    installmentCount?: number;
    installmentDueDates: string[];
    installmentDueRelativeDays: number[];
    installmentAmounts: number[];
    allowTeamSplitDefault: boolean;
    maxParticipants: number | null;
    teamSizeLimit: number | null;
    teamSignup: boolean;
    singleDivision: boolean;
    splitLeaguePlayoffDivisions: boolean;
    registrationByDivisionType: boolean;
    divisions: string[];
    divisionDetails: DivisionDetailForm[];
    playoffDivisionDetails: PlayoffDivisionDetailForm[];
    divisionFieldIds: Record<string, string[]>;
    selectedFieldIds: string[];
    cancellationRefundHours: number | null;
    registrationCutoffHours: number;
    organizationId?: string;
    requiredTemplateIds: string[];
    hostId?: string;
    noFixedEndDateTime: boolean;
    imageId: string;
    seedColor: number;
    waitList: string[];
    freeAgents: string[];
    players: UserData[];
    teams: Team[];
    officials: UserData[];
    officialIds: string[];
    officialSchedulingMode: OfficialSchedulingMode;
    officialPositions: EventOfficialPosition[];
    eventOfficials: EventOfficial[];
    pendingStaffInvites: PendingStaffInvite[];
    assistantHostIds: string[];
    doTeamsOfficiate: boolean;
    teamOfficialsMaySwap: boolean;
    matchRulesOverride: MatchRulesConfig | null;
    autoCreatePointMatchIncidents: boolean;
    leagueScoringConfig: LeagueScoringConfig;
};

const divisionIdFromValue = (value: string | CoreDivision): string => {
    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }
    const fallback = (
        value.id
        || (value as any).$id
        || value.key
        || value.skillLevel
        || value.name
        || ''
    ).toString();
    return fallback.trim().toLowerCase();
};

const normalizeDivisionDetailEntry = (
    entry: unknown,
    eventId: string,
    sportInput?: string | null,
    referenceDate?: Date | null,
    valuesStoredInCents: boolean = true,
): DivisionDetailForm | null => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const row = entry as Record<string, unknown>;
    const rawId = normalizeDivisionKeys([row.id ?? row.$id])[0];
    const inferred = inferDivisionDetails({
        identifier: (row.key ?? rawId ?? row.name ?? 'c_skill_open') as string,
        sportInput: sportInput ?? undefined,
        fallbackName: typeof row.name === 'string' ? row.name : undefined,
    });
    const defaults = getDefaultDivisionTypeSelectionsForSport(sportInput ?? undefined);
    const rawDivisionTypeId = normalizeDivisionKeys([row.divisionTypeId])[0] || inferred.divisionTypeId;
    const parsedComposite = parseCompositeDivisionTypeId(row.divisionTypeId ?? rawDivisionTypeId);
    const rawSkillDivisionTypeId = normalizeDivisionKeys([row.skillDivisionTypeId])[0];
    const rawAgeDivisionTypeId = normalizeDivisionKeys([row.ageDivisionTypeId])[0];
    const ratingType = parsedComposite || rawSkillDivisionTypeId || rawAgeDivisionTypeId
        ? 'SKILL'
        : (normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType);
    const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
    const skillDivisionTypeId = rawSkillDivisionTypeId
        ?? parsedComposite?.skillDivisionTypeId
        ?? (ratingType === 'SKILL' ? rawDivisionTypeId : defaults.skillDivisionTypeId);
    const ageDivisionTypeId = rawAgeDivisionTypeId
        ?? parsedComposite?.ageDivisionTypeId
        ?? (ratingType === 'AGE' ? rawDivisionTypeId : defaults.ageDivisionTypeId);
    const skillDivisionTypeName = typeof row.skillDivisionTypeName === 'string' && row.skillDivisionTypeName.trim().length > 0
        ? row.skillDivisionTypeName.trim()
        : (
            getDivisionTypeById(sportInput ?? null, skillDivisionTypeId, 'SKILL')?.name
            ?? defaults.skillDivisionTypeName
        );
    const ageDivisionTypeName = typeof row.ageDivisionTypeName === 'string' && row.ageDivisionTypeName.trim().length > 0
        ? row.ageDivisionTypeName.trim()
        : (
            getDivisionTypeById(sportInput ?? null, ageDivisionTypeId, 'AGE')?.name
            ?? defaults.ageDivisionTypeName
        );
    const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
    const divisionTypeName = buildDivisionName({
        gender,
        sportInput,
        skillDivisionTypeId,
        ageDivisionTypeId,
    });
    const key = normalizeDivisionKeys([row.key])[0] || buildDivisionToken({
        gender,
        ratingType: 'SKILL',
        divisionTypeId,
    });
    const id = rawId || buildEventDivisionId(eventId, key);
    const name = cleanDivisionDisplayName(
        row.name,
        divisionTypeName,
    );
    const rawDivisionPriceCents = typeof row.price === 'number'
        ? row.price
        : Number.isFinite(Number(row.price))
            ? Number(row.price)
            : 0;
    const rawDivisionMaxParticipants = typeof row.maxParticipants === 'number'
        ? row.maxParticipants
        : Number.isFinite(Number(row.maxParticipants))
            ? Number(row.maxParticipants)
            : 10;
    const rawDivisionPlayoffTeamCount = typeof row.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : Number.isFinite(Number(row.playoffTeamCount))
            ? Number(row.playoffTeamCount)
            : undefined;
    const rawPoolCount = typeof row.poolCount === 'number'
        ? row.poolCount
        : Number.isFinite(Number(row.poolCount))
            ? Number(row.poolCount)
            : undefined;
    const rawPoolTeamCount = typeof row.poolTeamCount === 'number'
        ? row.poolTeamCount
        : Number.isFinite(Number(row.poolTeamCount))
            ? Number(row.poolTeamCount)
            : undefined;
    const rawLeagueConfigSource = row.leagueConfig && typeof row.leagueConfig === 'object' && !Array.isArray(row.leagueConfig)
        ? row.leagueConfig as Partial<LeagueConfig>
        : row as Partial<LeagueConfig>;
    const rawLeagueConfig = normalizeLeagueConfigForSetMode(
        rawLeagueConfigSource,
        Boolean(rawLeagueConfigSource.usesSets),
    );
    const rawPlayoffConfig = extractTournamentConfigFromEvent(row as unknown as Partial<Event>) ?? undefined;
    const rawPlayoffPlacementDivisionIds = normalizePlacementDivisionIds(row.playoffPlacementDivisionIds);
    const rawAllowPaymentPlans = normalizeBoolean(row.allowPaymentPlans) ?? false;
    const rawInstallmentAmounts = Array.isArray(row.installmentAmounts)
        ? row.installmentAmounts.map((value) => {
            const parsed = typeof value === 'number' ? value : Number(value);
            return valuesStoredInCents
                ? normalizePriceCents(parsed)
                : normalizePriceCents(Number.isFinite(parsed) ? parsed * 100 : 0);
        })
        : [];
    const rawInstallmentDueDates = normalizeInstallmentDates(row.installmentDueDates);
    const rawInstallmentDueRelativeDays = normalizeInstallmentRelativeDays(row.installmentDueRelativeDays);
    const rawInstallmentCount = Number.isFinite(Number(row.installmentCount))
        ? Math.max(0, Math.trunc(Number(row.installmentCount)))
        : rawInstallmentAmounts.length;

    const baseDetail: DivisionDetailForm = {
        id,
        key,
        kind: typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE',
        name,
        divisionTypeId,
        divisionTypeName,
        ratingType,
        gender,
        skillDivisionTypeId,
        skillDivisionTypeName,
        ageDivisionTypeId,
        ageDivisionTypeName,
        price: valuesStoredInCents
            ? normalizePriceCents(rawDivisionPriceCents)
            : normalizePriceCents(rawDivisionPriceCents * 100),
        maxParticipants: Math.max(2, Math.trunc(rawDivisionMaxParticipants)),
        playoffTeamCount: Number.isFinite(rawDivisionPlayoffTeamCount)
            ? Math.max(2, Math.trunc(rawDivisionPlayoffTeamCount as number))
            : undefined,
        poolCount: Number.isFinite(rawPoolCount)
            ? Math.max(1, Math.trunc(rawPoolCount as number))
            : undefined,
        poolTeamCount: Number.isFinite(rawPoolTeamCount)
            ? Math.max(1, Math.trunc(rawPoolTeamCount as number))
            : undefined,
        playoffPlacementDivisionIds: rawPlayoffPlacementDivisionIds,
        ...leagueConfigToDivisionFields(rawLeagueConfig),
        ...(rawPlayoffConfig ? { playoffConfig: rawPlayoffConfig } : {}),
        allowPaymentPlans: rawAllowPaymentPlans,
        installmentCount: rawAllowPaymentPlans
            ? (rawInstallmentCount || rawInstallmentAmounts.length || 0)
            : 0,
        installmentDueDates: rawAllowPaymentPlans ? rawInstallmentDueDates : [],
        installmentDueRelativeDays: rawAllowPaymentPlans ? rawInstallmentDueRelativeDays : [],
        installmentAmounts: rawAllowPaymentPlans ? rawInstallmentAmounts : [],
        sportId: typeof row.sportId === 'string' ? row.sportId : sportInput ?? undefined,
        fieldIds: Array.isArray(row.fieldIds)
            ? row.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)
            : [],
        ageCutoffDate: typeof row.ageCutoffDate === 'string' ? row.ageCutoffDate : undefined,
        ageCutoffLabel: typeof row.ageCutoffLabel === 'string' ? row.ageCutoffLabel : undefined,
        ageCutoffSource: typeof row.ageCutoffSource === 'string' ? row.ageCutoffSource : undefined,
    };
    return applyDivisionAgeCutoff(baseDetail, sportInput, referenceDate);
};

const normalizePlayoffDivisionDetailEntry = (
    entry: unknown,
    eventId: string,
    fallbackPlayoffConfig?: TournamentConfig,
    sportInput?: string | null,
    referenceDate?: Date | null,
): PlayoffDivisionDetailForm | null => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const row = entry as Record<string, unknown>;
    const rawId = normalizeDivisionKeys([row.id ?? row.$id])[0];
    const rawKey = normalizeDivisionKeys([row.key])[0];
    const key = rawKey || `playoff_${Math.max(1, Math.trunc(Number(row.seed) || 1))}`;
    const id = rawId || buildEventDivisionId(eventId, key);
    const name = typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name.trim()
        : `Playoff Division ${key.replace(/^playoff_/, '')}`;
    const maxParticipantsRaw = normalizePlayoffDivisionParticipantCount(row.maxParticipants);
    const playoffConfig = extractTournamentConfigFromEvent(row as unknown as Partial<Event>)
        ?? buildTournamentConfig(fallbackPlayoffConfig);
    const normalizedDivision = normalizeDivisionDetailEntry(
        {
            ...row,
            id,
            key,
            kind: 'PLAYOFF',
            name,
            maxParticipants: maxParticipantsRaw,
        },
        eventId,
        typeof row.sportId === 'string' ? row.sportId : sportInput,
        referenceDate,
    );

    return {
        ...(normalizedDivision
            ? {
                divisionTypeId: normalizedDivision.divisionTypeId,
                divisionTypeName: normalizedDivision.divisionTypeName,
                ratingType: normalizedDivision.ratingType,
                gender: normalizedDivision.gender,
                skillDivisionTypeId: normalizedDivision.skillDivisionTypeId,
                skillDivisionTypeName: normalizedDivision.skillDivisionTypeName,
                ageDivisionTypeId: normalizedDivision.ageDivisionTypeId,
                ageDivisionTypeName: normalizedDivision.ageDivisionTypeName,
                price: normalizedDivision.price,
                playoffTeamCount: normalizedDivision.playoffTeamCount,
                poolCount: normalizedDivision.poolCount,
                poolTeamCount: normalizedDivision.poolTeamCount,
                allowPaymentPlans: normalizedDivision.allowPaymentPlans,
                installmentCount: normalizedDivision.installmentCount,
                installmentDueDates: normalizedDivision.installmentDueDates,
                installmentDueRelativeDays: normalizedDivision.installmentDueRelativeDays,
                installmentAmounts: normalizedDivision.installmentAmounts,
                sportId: normalizedDivision.sportId,
                ageCutoffDate: normalizedDivision.ageCutoffDate,
                ageCutoffLabel: normalizedDivision.ageCutoffLabel,
                ageCutoffSource: normalizedDivision.ageCutoffSource,
                fieldIds: normalizedDivision.fieldIds,
            }
            : {}),
        id,
        key,
        kind: 'PLAYOFF',
        name,
        maxParticipants: maxParticipantsRaw,
        playoffConfig,
    };
};

const buildTournamentConfig = (source?: Partial<TournamentConfig>): TournamentConfig => {
    const normalizePoints = (points: number[] | undefined, len: number): number[] => {
        const next = Array.isArray(points) ? points.slice(0, len) : [];
        while (next.length < len) next.push(21);
        return next;
    };
    const normalizeOptionalDuration = (value: unknown): number | undefined => {
        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
            return undefined;
        }
        return Math.max(0, Math.trunc(parsed));
    };

    const doubleElimination = Boolean(source?.doubleElimination);
    const winnerSetCount = source?.winnerSetCount ?? 1;
    const loserSetCount = doubleElimination ? source?.loserSetCount ?? 1 : source?.loserSetCount ?? 1;

    return {
        doubleElimination,
        winnerSetCount,
        loserSetCount,
        winnerBracketPointsToVictory: normalizePoints(source?.winnerBracketPointsToVictory, winnerSetCount),
        loserBracketPointsToVictory: normalizePoints(
            source?.loserBracketPointsToVictory,
            doubleElimination ? loserSetCount : 1
        ),
        prize: source?.prize ?? '',
        fieldCount: source?.fieldCount ?? 1,
        restTimeMinutes: source?.restTimeMinutes ?? 0,
        usesSets: Boolean(source?.usesSets),
        matchDurationMinutes: normalizeOptionalDuration(source?.matchDurationMinutes),
        setDurationMinutes: normalizeOptionalDuration(source?.setDurationMinutes),
    };
};

const normalizeTournamentConfigForSetMode = (
    source: Partial<TournamentConfig> | undefined,
    usesSets: boolean,
): TournamentConfig => {
    const normalized = buildTournamentConfig(source);
    if (usesSets) {
        return {
            ...normalized,
            usesSets: true,
            matchDurationMinutes: normalizeNumber(normalized.matchDurationMinutes),
            setDurationMinutes: normalizeNumber(normalized.setDurationMinutes),
        };
    }

    const winnerTarget = Number.isFinite(Number(normalized.winnerBracketPointsToVictory?.[0]))
        ? Math.max(1, Math.trunc(Number(normalized.winnerBracketPointsToVictory?.[0])))
        : 21;
    const loserTarget = Number.isFinite(Number(normalized.loserBracketPointsToVictory?.[0]))
        ? Math.max(1, Math.trunc(Number(normalized.loserBracketPointsToVictory?.[0])))
        : 21;

    return {
        ...normalized,
        usesSets: false,
        matchDurationMinutes: normalizeNumber(normalized.matchDurationMinutes),
        setDurationMinutes: undefined,
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [winnerTarget],
        loserBracketPointsToVictory: [loserTarget],
    };
};

const TOURNAMENT_CONFIG_KEYS: (keyof TournamentConfig)[] = [
    'doubleElimination',
    'winnerSetCount',
    'loserSetCount',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'prize',
    'fieldCount',
    'restTimeMinutes',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
];

const TOURNAMENT_ARRAY_CONFIG_KEYS = new Set<keyof TournamentConfig>([
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
]);

const extractTournamentConfigFromEvent = (event?: Partial<Event> | null): TournamentConfig | null => {
    if (!event) {
        return null;
    }

    const legacyPlayoff = (event as { playoffConfig?: Partial<TournamentConfig> | null }).playoffConfig;
    if (legacyPlayoff) {
        return buildTournamentConfig(legacyPlayoff ?? undefined);
    }

    const partial: Partial<TournamentConfig> = {};
    let hasDefinedValue = false;
    for (const key of TOURNAMENT_CONFIG_KEYS) {
        const candidate = (event as Record<string, unknown>)[key as string];
        if (candidate !== undefined && candidate !== null) {
            hasDefinedValue = true;
            (partial as Record<string, unknown>)[key as string] = candidate;
        }
    }

    if (!hasDefinedValue) {
        return null;
    }

    return buildTournamentConfig(partial);
};

const mapEventToFormState = (event: Event): EventFormState => {
    const isSchedulableType = supportsScheduleSlotsForEvent(event.eventType, event.parentEvent);
    const derivedNoFixedEndDateTime = (() => {
        if (typeof event.noFixedEndDateTime === 'boolean') {
            return event.noFixedEndDateTime;
        }
        return false;
    })();
    const eventTimeZone = normalizeTimeZone(event.timeZone, getSystemTimeZone());

    const resolvedSportId = (() => {
        // `event.sport` is historically inconsistent: it may be a Sport object, a string id, or absent.
        // Keep runtime compatibility by treating it as unknown and narrowing safely.
        const sport = (event as { sport?: unknown }).sport;
        if (sport && typeof sport === 'object' && '$id' in sport) {
            return (sport as Sport).$id;
        }
        if (typeof sport === 'string' && sport.trim().length > 0) {
            return sport;
        }
        if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
            return event.sportId;
        }
        return '';
    })();
    const resolvedSportInput = (event.sport && typeof event.sport === 'object'
        ? ((event.sport as Sport).name || (event.sport as Sport).$id || '')
        : resolvedSportId) || '';
    const officialPositionTemplates = normalizeSportOfficialPositionTemplates(
        event.sport && typeof event.sport === 'object'
            ? (event.sport as Sport).officialPositionTemplates
            : undefined,
    );
    const normalizedOfficialPositions = normalizeEventOfficialPositions(
        event.officialPositions,
        officialPositionTemplates,
    );
    const normalizedEventOfficials = normalizeEventOfficials(
        event.eventOfficials,
        Array.isArray(event.eventOfficials)
            ? []
            : Array.isArray(event.officialIds)
                ? event.officialIds.map((officialId) => String(officialId)).filter(Boolean)
                : [],
        normalizedOfficialPositions,
    );
    const normalizedOfficialIds = getEventOfficialUserIds(normalizedEventOfficials);
    const divisionReferenceDate = parseDateValue(event.start ?? null);
    const defaultEventInstallmentAmounts = normalizeInstallmentAmounts(event.installmentAmounts);
    const defaultEventInstallmentDueDates = Array.isArray(event.installmentDueDates)
        ? event.installmentDueDates.map((value) => String(value))
        : [];
    const defaultEventInstallmentDueRelativeDays = normalizeInstallmentRelativeDays((event as any).installmentDueRelativeDays);
    const defaultEventInstallmentCount = Number.isFinite(event.installmentCount)
        ? Math.max(0, Math.trunc(event.installmentCount as number))
        : defaultEventInstallmentAmounts.length;
    const defaultEventAllowPaymentPlans = Boolean(event.allowPaymentPlans);
    const defaultEventPrice = defaultEventAllowPaymentPlans && defaultEventInstallmentAmounts.length
        ? sumInstallmentAmounts(defaultEventInstallmentAmounts)
        : normalizePriceCents(event.price);

    const normalizedDivisionIds = Array.isArray(event.divisions)
        ? Array.from(
            new Set(
                (event.divisions as (string | CoreDivision)[])
                    .map(divisionIdFromValue)
                    .filter((divisionId) => divisionId.length > 0),
            ),
        )
        : [];
    const normalizedDivisionDetails = (() => {
        const details = Array.isArray(event.divisionDetails)
            ? event.divisionDetails
                .map((entry) => normalizeDivisionDetailEntry(entry, event.$id, resolvedSportInput, divisionReferenceDate))
                .filter((entry): entry is DivisionDetailForm => Boolean(entry))
            : [];
        const detailsById = new Map<string, DivisionDetailForm>();
        details.forEach((detail) => detailsById.set(detail.id, detail));

        normalizedDivisionIds.forEach((divisionId) => {
            if (detailsById.has(divisionId)) {
                return;
            }
            const inferred = inferDivisionDetails({
                identifier: divisionId,
                sportInput: resolvedSportInput,
            });
            const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(resolvedSportInput);
            const parsedComposite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
            const skillDivisionTypeId = parsedComposite?.skillDivisionTypeId
                ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
            const ageDivisionTypeId = parsedComposite?.ageDivisionTypeId
                ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
            const skillDivisionTypeName = getDivisionTypeById(
                resolvedSportInput,
                skillDivisionTypeId,
                'SKILL',
            )?.name ?? defaultsForSport.skillDivisionTypeName;
            const ageDivisionTypeName = getDivisionTypeById(
                resolvedSportInput,
                ageDivisionTypeId,
                'AGE',
            )?.name ?? defaultsForSport.ageDivisionTypeName;
            const compositeDivisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
            const divisionTypeName = buildDivisionName({
                gender: inferred.gender,
                sportInput: resolvedSportInput,
                skillDivisionTypeId,
                ageDivisionTypeId,
            });
            const inferredToken = buildDivisionToken({
                gender: inferred.gender,
                ratingType: 'SKILL',
                divisionTypeId: compositeDivisionTypeId,
            });
            detailsById.set(divisionId, applyDivisionAgeCutoff({
                id: divisionId,
                key: inferredToken,
                kind: 'LEAGUE',
                name: divisionTypeName,
                divisionTypeId: compositeDivisionTypeId,
                divisionTypeName,
                ratingType: 'SKILL',
                gender: inferred.gender,
                skillDivisionTypeId,
                skillDivisionTypeName,
                ageDivisionTypeId,
                ageDivisionTypeName,
                price: defaultEventPrice,
                maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : 10,
                playoffTeamCount: Number.isFinite(event.playoffTeamCount)
                    ? Math.max(2, Math.trunc(event.playoffTeamCount as number))
                    : undefined,
                playoffPlacementDivisionIds: [],
                allowPaymentPlans: defaultEventAllowPaymentPlans,
                installmentCount: defaultEventAllowPaymentPlans
                    ? (defaultEventInstallmentCount || defaultEventInstallmentAmounts.length || 0)
                    : 0,
                installmentDueDates: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentDueDates] : [],
                installmentDueRelativeDays: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentDueRelativeDays] : [],
                installmentAmounts: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentAmounts] : [],
                sportId: resolvedSportInput || undefined,
                fieldIds: [],
            }, resolvedSportInput, divisionReferenceDate));
        });

        const preferredOrder = normalizedDivisionIds.length
            ? normalizedDivisionIds
            : Array.from(detailsById.keys());
        const ordered: DivisionDetailForm[] = preferredOrder
            .map((divisionId) => detailsById.get(divisionId))
            .filter((entry): entry is DivisionDetailForm => Boolean(entry));
        if (ordered.length === detailsById.size) {
            return ordered;
        }
        detailsById.forEach((detail) => {
            if (!ordered.some((entry) => entry.id === detail.id)) {
                ordered.push(detail);
            }
        });
        return ordered;
    })();
    const normalizedDivisionDetailsWithCapacity: DivisionDetailForm[] = normalizedDivisionDetails.map((detail): DivisionDetailForm => ({
        ...detail,
        kind: detail.kind === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE',
        price: detail.allowPaymentPlans && normalizeInstallmentAmounts(detail.installmentAmounts).length
            ? sumInstallmentAmounts(detail.installmentAmounts)
            : Number.isFinite(detail.price)
                ? Math.max(0, detail.price)
                : defaultEventPrice,
        maxParticipants: Number.isFinite(detail.maxParticipants)
            ? Math.max(2, Math.trunc(detail.maxParticipants))
            : Number.isFinite(event.maxParticipants)
                ? Math.max(2, Math.trunc(event.maxParticipants))
                : 10,
        playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
            ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
            : Number.isFinite(event.playoffTeamCount)
                ? Math.max(2, Math.trunc(event.playoffTeamCount as number))
                : undefined,
        poolCount: Number.isFinite(detail.poolCount)
            ? Math.max(1, Math.trunc(detail.poolCount as number))
            : undefined,
        poolTeamCount: Number.isFinite(detail.poolTeamCount)
            ? Math.max(1, Math.trunc(detail.poolTeamCount as number))
            : undefined,
        playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
        allowPaymentPlans: typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : defaultEventAllowPaymentPlans,
        installmentAmounts: (() => {
            const divisionInstallments = normalizeInstallmentAmounts(detail.installmentAmounts);
            if (detail.allowPaymentPlans) {
                return divisionInstallments;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentAmounts];
            }
            return [];
        })(),
        installmentDueDates: (() => {
            const divisionDueDates = Array.isArray(detail.installmentDueDates)
                ? detail.installmentDueDates
                    .map((value) => String(value))
                    .filter((value) => value.trim().length > 0)
                : [];
            if (detail.allowPaymentPlans) {
                return divisionDueDates;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentDueDates];
            }
            return [];
        })(),
        installmentDueRelativeDays: (() => {
            const divisionRelativeDays = normalizeInstallmentRelativeDays(detail.installmentDueRelativeDays);
            if (detail.allowPaymentPlans) {
                return divisionRelativeDays;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentDueRelativeDays];
            }
            return [];
        })(),
        installmentCount: (() => {
            if (detail.allowPaymentPlans) {
                if (typeof detail.installmentCount === 'number' && Number.isFinite(detail.installmentCount)) {
                    return Math.max(0, Math.trunc(detail.installmentCount));
                }
                return Array.isArray(detail.installmentAmounts) ? detail.installmentAmounts.length : 0;
            }
            if (defaultEventAllowPaymentPlans) {
                return defaultEventInstallmentCount || defaultEventInstallmentAmounts.length || 0;
            }
            return 0;
        })(),
    }));
    const fallbackPlayoffConfig = extractTournamentConfigFromEvent(event) ?? buildTournamentConfig();
    const normalizedPlayoffDivisionDetails: PlayoffDivisionDetailForm[] = Array.isArray((event as any).playoffDivisionDetails)
        ? (event as any).playoffDivisionDetails
            .map((entry: unknown) => normalizePlayoffDivisionDetailEntry(
                entry,
                event.$id,
                fallbackPlayoffConfig,
                resolvedSportInput,
                divisionReferenceDate,
            ))
            .filter((entry: PlayoffDivisionDetailForm | null): entry is PlayoffDivisionDetailForm => Boolean(entry))
        : [];
    const tournamentPoolPlayEnabled = isTournamentPoolPlayFormEnabled(
        event.eventType,
        Boolean((event as any).includePlayoffsOrPools ?? event.includePlayoffs),
    );
    const derivedTournamentPoolSettingsByBracketId = tournamentPoolPlayEnabled
        ? deriveTournamentPoolSettingsByBracketId(normalizedDivisionDetailsWithCapacity)
        : new Map<string, TournamentPoolSettings>();
    const tournamentPoolBracketDivisionDetails: DivisionDetailForm[] = tournamentPoolPlayEnabled
        ? normalizedPlayoffDivisionDetails
            .map((division) => {
                const bracketDivisionId = normalizeDivisionKeys([division.id])[0];
                const derivedPoolSettings = bracketDivisionId
                    ? derivedTournamentPoolSettingsByBracketId.get(bracketDivisionId)
                    : undefined;
                const poolCount = Number.isFinite(division.poolCount)
                    ? Math.max(1, Math.trunc(division.poolCount as number))
                    : derivedPoolSettings?.poolCount;
                const rawMaxParticipants = Number.isFinite(division.maxParticipants)
                    ? Math.max(2, Math.trunc(division.maxParticipants as number))
                    : Number.isFinite(event.maxParticipants)
                        ? Math.max(2, Math.trunc(event.maxParticipants as number))
                        : undefined;
                const maxParticipantsFromPools = typeof poolCount === 'number'
                    && typeof derivedPoolSettings?.poolTeamCount === 'number'
                    ? poolCount * derivedPoolSettings.poolTeamCount
                    : undefined;
                const maxParticipants = typeof maxParticipantsFromPools === 'number'
                    ? Math.max(rawMaxParticipants ?? 2, maxParticipantsFromPools)
                    : rawMaxParticipants;
                const poolTeamCount = derivePoolTeamCount(maxParticipants, poolCount)
                    ?? (Number.isFinite(division.poolTeamCount)
                        ? Math.max(1, Math.trunc(division.poolTeamCount as number))
                        : derivedPoolSettings?.poolTeamCount);
                return normalizeDivisionDetailEntry(
                    {
                        ...division,
                        kind: 'LEAGUE',
                        price: typeof division.price === 'number' ? division.price : event.price,
                        maxParticipants,
                        poolCount,
                        poolTeamCount,
                        allowPaymentPlans: typeof division.allowPaymentPlans === 'boolean'
                            ? division.allowPaymentPlans
                            : defaultEventAllowPaymentPlans,
                        installmentCount: typeof division.installmentCount === 'number'
                            ? division.installmentCount
                            : defaultEventInstallmentCount,
                        installmentDueDates: Array.isArray(division.installmentDueDates)
                            ? division.installmentDueDates
                            : defaultEventInstallmentDueDates,
                        installmentDueRelativeDays: Array.isArray(division.installmentDueRelativeDays)
                            ? division.installmentDueRelativeDays
                            : defaultEventInstallmentDueRelativeDays,
                        installmentAmounts: Array.isArray(division.installmentAmounts)
                            ? division.installmentAmounts
                            : defaultEventInstallmentAmounts,
                    },
                    event.$id,
                    resolvedSportInput,
                    divisionReferenceDate,
                );
            })
            .filter((entry: DivisionDetailForm | null): entry is DivisionDetailForm => Boolean(entry))
        : [];
    const formDivisionDetails: DivisionDetailForm[] = tournamentPoolBracketDivisionDetails.length
        ? tournamentPoolBracketDivisionDetails
        : normalizedDivisionDetailsWithCapacity;
    const finalDivisionIds = formDivisionDetails.map((detail) => detail.id);
    const splitLeaguePlayoffDivisions = event.eventType === 'LEAGUE'
        ? Boolean(
            event.splitLeaguePlayoffDivisions
            || (normalizedPlayoffDivisionDetails.length > 0 && normalizedDivisionDetailsWithCapacity.some((detail) => (
                Array.isArray(detail.playoffPlacementDivisionIds) && detail.playoffPlacementDivisionIds.length > 0
            ))),
        )
        : false;
    const officialSchedulingMode = normalizeOfficialSchedulingMode(event.officialSchedulingMode);
    const doTeamsOfficiate = officialSchedulingMode === 'TEAM_STAFFING' || Boolean(event.doTeamsOfficiate);

    return {
    $id: event.$id,
    name: event.name,
    description: event.description ?? '',
    location: event.location ?? '',
    address: event.address ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates as [number, number] : [0, 0],
    start: formatEventDateTimeForForm(event.start, eventTimeZone) || event.start,
    end: event.end ? (formatEventDateTimeForForm(event.end, eventTimeZone) || event.end) : '',
    timeZone: eventTimeZone,
    state: (event.state as EventState) ?? 'DRAFT',
    eventType: event.eventType,
    parentEvent: event.parentEvent || undefined,
    sportId: resolvedSportId,
    sportConfig: event.sport && typeof event.sport === 'object'
        ? { ...(event.sport as Sport) }
        : null,
    price: defaultEventPrice,
    taxHandling: normalizeEventTaxHandling(event.taxHandling),
    organizerManualTaxRateBps: normalizeOrganizerManualTaxRateBps(event.organizerManualTaxRateBps),
    minAge: Number.isFinite(event.minAge) ? event.minAge : undefined,
    maxAge: Number.isFinite(event.maxAge) ? event.maxAge : undefined,
    allowPaymentPlans: Boolean(event.allowPaymentPlans),
    installmentAmounts: normalizeInstallmentAmounts(event.installmentAmounts),
    installmentCount: (() => {
        const amounts = Array.isArray(event.installmentAmounts) ? event.installmentAmounts as number[] : [];
        return Number.isFinite(event.installmentCount) ? (event.installmentCount as number) : (amounts.length || 0);
    })(),
    installmentDueDates: Array.isArray(event.installmentDueDates) ? event.installmentDueDates as string[] : [],
    installmentDueRelativeDays: normalizeInstallmentRelativeDays((event as any).installmentDueRelativeDays),
    allowTeamSplitDefault: Boolean(event.allowTeamSplitDefault),
    maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : null,
    teamSizeLimit: Number.isFinite(event.teamSizeLimit) ? event.teamSizeLimit : null,
    teamSignup: Boolean(event.teamSignup),
    singleDivision: Boolean(event.singleDivision),
    splitLeaguePlayoffDivisions,
    registrationByDivisionType: Boolean(event.registrationByDivisionType),
    organizationId: event.organizationId || undefined,
    divisions: finalDivisionIds,
    divisionDetails: formDivisionDetails,
    playoffDivisionDetails: normalizedPlayoffDivisionDetails,
    divisionFieldIds: event.divisionFieldIds && typeof event.divisionFieldIds === 'object'
        ? Object.fromEntries(
            Object.entries(event.divisionFieldIds).map(([divisionKey, fieldIds]) => [
                String(divisionKey).toLowerCase(),
                Array.isArray(fieldIds)
                    ? Array.from(new Set(fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
                    : [],
            ]),
        )
        : {},
    selectedFieldIds: Array.isArray(event.fieldIds)
        ? Array.from(new Set(event.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
        : [],
    cancellationRefundHours: event.cancellationRefundHours != null && Number.isFinite(Number(event.cancellationRefundHours))
        ? Number(event.cancellationRefundHours)
        : null,
    registrationCutoffHours: event.registrationCutoffHours != null && Number.isFinite(Number(event.registrationCutoffHours))
        ? Number(event.registrationCutoffHours)
        : 2,
    hostId: event.hostId || undefined,
    noFixedEndDateTime: isSchedulableType ? derivedNoFixedEndDateTime : false,
    requiredTemplateIds: Array.isArray(event.requiredTemplateIds)
        ? event.requiredTemplateIds
        : [],
    imageId: event.imageId ?? '',
    seedColor: event.seedColor || 0,
    waitList: event.waitListIds || [],
    freeAgents: event.freeAgentIds || [],
    players: event.players || [],
    teams: event.teams || [],
    officials: event.officials || [],
    officialIds: normalizedOfficialIds,
    officialSchedulingMode,
    officialPositions: normalizedOfficialPositions,
    eventOfficials: normalizedEventOfficials,
    pendingStaffInvites: Array.isArray((event as { pendingStaffInvites?: PendingStaffInvite[] }).pendingStaffInvites)
        && (event as { pendingStaffInvites?: PendingStaffInvite[] }).pendingStaffInvites!.length > 0
        ? (event as { pendingStaffInvites?: PendingStaffInvite[] }).pendingStaffInvites!.map((invite) => ({
            firstName: invite.firstName ?? '',
            lastName: invite.lastName ?? '',
            email: invite.email ?? '',
            roles: Array.isArray(invite.roles) ? invite.roles.filter((role): role is StaffAssignmentRole => (
                role === 'OFFICIAL' || role === 'ASSISTANT_HOST'
            )) : [],
        }))
        : [],
    assistantHostIds: Array.isArray(event.assistantHostIds) ? event.assistantHostIds : [],
    doTeamsOfficiate,
    teamOfficialsMaySwap: doTeamsOfficiate && Boolean((event as any).teamOfficialsMaySwap),
    matchRulesOverride: sanitizeMatchRulesOverrideForEditor((event as any).matchRulesOverride),
    autoCreatePointMatchIncidents: Boolean((event as any).autoCreatePointMatchIncidents),
    leagueScoringConfig: createLeagueScoringConfig(
        typeof event.leagueScoringConfig === 'object'
            ? (event.leagueScoringConfig as Partial<LeagueScoringConfig>)
            : undefined
    ),
};
};

export type EventFormValues = EventFormState & {
    leagueSlots: LeagueSlotForm[];
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    fields: Field[];
    fieldCount: number;
    joinAsParticipant: boolean;
};

const leagueSlotSchema: z.ZodType<LeagueSlotForm> = z.object({
    key: z.string(),
    $id: z.string().optional(),
    scheduledFieldId: z.string().optional(),
    scheduledFieldIds: z.array(z.string()).default([]),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    divisions: z.array(z.string()).default([]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    timeZone: z.string().optional(),
    startTimeMinutes: z.number().int().nonnegative().optional(),
    endTimeMinutes: z.number().int().positive().optional(),
    price: z.number().int().nonnegative().optional(),
    sourceType: z.string().nullable().optional(),
    rentalBookingId: z.string().nullable().optional(),
    rentalBookingItemId: z.string().nullable().optional(),
    rentalLocked: z.boolean().optional(),
    requiredTemplateIds: z.array(z.string()).optional(),
    hostRequiredTemplateIds: z.array(z.string()).optional(),
    repeating: z.boolean().optional(),
    conflicts: z.array(z.any()).default([]),
    checking: z.boolean().default(false),
    error: z.string().optional(),
});

const RENTAL_SLOT_MISMATCH_ERROR_PREFIX = 'This rental resource is only available for ';

const leagueConfigSchema = z.object({
    gamesPerOpponent: z.number().min(1),
    includePlayoffs: z.boolean(),
    playoffTeamCount: z.number().optional(),
    usesSets: z.boolean().optional(),
    matchDurationMinutes: z.number().optional(),
    restTimeMinutes: z.number().min(0).optional(),
    setDurationMinutes: z.number().optional(),
    setsPerMatch: z.number().optional(),
    pointsToVictory: z.array(z.number()).optional(),
});

const matchRulesConfigSchema = z.object({
    scoringModel: z.enum(['SETS', 'PERIODS', 'INNINGS', 'POINTS_ONLY']).optional(),
    segmentLabel: z.string().trim().optional(),
    supportsDraw: z.boolean().optional(),
    supportsOvertime: z.boolean().optional(),
    supportsShootout: z.boolean().optional(),
    canUseOvertime: z.boolean().optional(),
    canUseShootout: z.boolean().optional(),
    officialRoles: z.array(z.string()).optional(),
    supportedIncidentTypes: z.array(z.string()).optional(),
    incidentTypeDefinitions: z.array(z.object({
        code: z.string().trim(),
        label: z.string().trim(),
        kind: z.enum(['SCORING', 'DISCIPLINE', 'NOTE', 'ADMIN']),
        cardColor: z.enum(['yellow', 'red', 'blue']).nullable().optional(),
        requiresTeam: z.boolean().optional(),
        requiresParticipant: z.boolean().optional(),
        defaultEnabled: z.boolean().optional(),
        linkedPointDelta: z.number().int().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    })).optional(),
    autoCreatePointIncidentType: z.string().trim().optional(),
    timekeeping: z.object({
        timerMode: z.enum(['NONE', 'COUNT_UP']).optional(),
        segmentDurationMinutes: z.number().int().positive().nullable().optional(),
        segmentDurationMinutesBySequence: z.array(z.number().int().positive()).optional(),
        canUseAddedTime: z.boolean().optional(),
        addedTimeEnabled: z.boolean().optional(),
        stopAtRegulationEnd: z.boolean().optional(),
    }).optional(),
}).nullable().optional();

const tournamentConfigSchema = z.object({
    doubleElimination: z.boolean(),
    winnerSetCount: z.number().min(1),
    loserSetCount: z.number().min(1),
    winnerBracketPointsToVictory: z.array(z.number()),
    loserBracketPointsToVictory: z.array(z.number()),
    prize: z.string(),
    fieldCount: z.number().min(0),
    restTimeMinutes: z.number().min(0),
    usesSets: z.boolean().optional(),
    matchDurationMinutes: z.number().optional(),
    setDurationMinutes: z.number().optional(),
});

type EventFormSchemaOptions = {
    allowMissingEventImage?: boolean;
    allowMissingEventDivisions?: boolean;
};

const buildEventFormSchema = (options: EventFormSchemaOptions = {}) => z
    .object({
        $id: z.string(),
        name: z.string().trim().min(1, 'Event name is required'),
        description: z.string().default(''),
        location: z.string().trim(),
        address: z.string().trim().default(''),
        coordinates: z.tuple([z.number(), z.number()]),
        start: z.string(),
        end: z
            .string()
            .nullable()
            .optional()
            .transform((value) => value ?? ''),
        timeZone: z.string().trim().default('UTC'),
        state: z.string().default('DRAFT'),
        eventType: z.enum(['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT']),
        parentEvent: z.string().optional().nullable(),
        sportId: z.string().trim(),
        sportConfig: z.any().nullable(),
        price: z.number().int().min(0, 'Price must be at least 0'),
        minAge: z.number().int().min(0).optional(),
        maxAge: z.number().int().min(0).optional(),
        allowPaymentPlans: z.boolean().default(false),
        installmentCount: z.number().int().min(0).default(0),
        installmentDueDates: z.array(z.string()).default([]),
        installmentDueRelativeDays: z.array(z.number().int()).default([]),
        installmentAmounts: z.array(z.number().int().min(0)).default([]),
        allowTeamSplitDefault: z.boolean().default(false),
        maxParticipants: z.number().min(2, 'Enter at least 2').nullable(),
        teamSizeLimit: z.number().min(1, 'Enter at least 1').nullable(),
        teamSignup: z.boolean(),
        singleDivision: z.boolean(),
        splitLeaguePlayoffDivisions: z.boolean().default(false),
        registrationByDivisionType: z.boolean().default(false),
        divisions: z.array(z.string()),
        divisionDetails: z.array(
            z.object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                kind: z.enum(['LEAGUE', 'PLAYOFF']).optional(),
                name: z.string().trim().min(1),
                divisionTypeId: z.string().trim().min(1),
                divisionTypeName: z.string().trim().min(1),
                ratingType: z.enum(['AGE', 'SKILL']),
                gender: z.enum(['M', 'F', 'C']),
                skillDivisionTypeId: z.string().trim().min(1),
                skillDivisionTypeName: z.string().trim().min(1),
                ageDivisionTypeId: z.string().trim().min(1),
                ageDivisionTypeName: z.string().trim().min(1),
                price: z.number().int().min(0),
                maxParticipants: z.number().int().min(2),
                playoffTeamCount: z.number().optional(),
                poolCount: z.number().int().min(1).optional(),
                poolTeamCount: z.number().int().min(1).optional(),
                playoffPlacementDivisionIds: z.array(z.string()).optional(),
                gamesPerOpponent: z.number().min(1).optional(),
                restTimeMinutes: z.number().min(0).optional(),
                usesSets: z.boolean().optional(),
                matchDurationMinutes: z.number().optional(),
                setDurationMinutes: z.number().optional(),
                setsPerMatch: z.number().optional(),
                pointsToVictory: z.array(z.number()).optional(),
                playoffConfig: z.any().optional(),
                allowPaymentPlans: z.boolean().default(false),
                installmentCount: z.number().int().min(0).default(0),
                installmentDueDates: z.array(z.string()).default([]),
                installmentDueRelativeDays: z.array(z.number().int()).default([]),
                installmentAmounts: z.array(z.number().int().min(0)).default([]),
                sportId: z.string().optional(),
                fieldIds: z.array(z.string()).optional(),
                ageCutoffDate: z.string().optional(),
                ageCutoffLabel: z.string().optional(),
                ageCutoffSource: z.string().optional(),
            }),
        ).default([]),
        playoffDivisionDetails: z.array(
            z.object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                kind: z.literal('PLAYOFF').default('PLAYOFF'),
                name: z.string().trim().min(1),
                maxParticipants: z.number().int().nullable(),
                playoffConfig: z.any(),
            }),
        ).default([]),
        divisionFieldIds: z.record(z.string(), z.array(z.string())).default({}),
        selectedFieldIds: z.array(z.string()).default([]),
        cancellationRefundHours: z.number().min(0).nullable(),
        registrationCutoffHours: z.number().min(0),
        organizationId: z.string().optional(),
        taxHandling: z.enum([
            'INHERIT_ORG',
            'STRIPE_TAX',
            'EXEMPT_PARTICIPANT_SPORTS',
            'ORGANIZER_MANUAL_TAX',
            'ORGANIZER_STRIPE_TAX',
        ]).default('INHERIT_ORG'),
        organizerManualTaxRateBps: z.number().int().min(0).max(2500).default(0),
        requiredTemplateIds: z.array(z.string()).default([]),
        hostId: z.string().optional(),
        noFixedEndDateTime: z.boolean().default(false),
        imageId: options.allowMissingEventImage
            ? z.string().trim().default('')
            : z.string().trim().min(1, 'Event image is required'),
        seedColor: z.number(),
        waitList: z.array(z.string()),
        freeAgents: z.array(z.string()),
        players: z.array(z.any()),
        teams: z.array(z.any()),
        officials: z.array(z.any()),
        officialIds: z.array(z.string()),
        officialSchedulingMode: z.enum(['STAFFING', 'TEAM_STAFFING', 'SCHEDULE', 'OFF']).default('SCHEDULE'),
        officialPositions: z.array(
            z.object({
                id: z.string().trim().min(1),
                name: z.string().trim().min(1),
                count: z.number().int().min(1),
                order: z.number().int().min(0),
            }),
        ).default([]),
        eventOfficials: z.array(
            z.object({
                id: z.string().trim().min(1),
                userId: z.string().trim().min(1),
                positionIds: z.array(z.string()).default([]),
                fieldIds: z.array(z.string()).default([]),
                isActive: z.boolean().optional(),
            }),
        ).default([]),
        pendingStaffInvites: z.array(
            z.object({
                firstName: z.string().default(''),
                lastName: z.string().default(''),
                email: z.string().default(''),
                roles: z.array(z.enum(['OFFICIAL', 'ASSISTANT_HOST'])).default([]),
            }),
        ).default([]),
        assistantHostIds: z.array(z.string()).default([]),
        doTeamsOfficiate: z.boolean(),
        teamOfficialsMaySwap: z.boolean().default(false),
        matchRulesOverride: matchRulesConfigSchema.default(null),
        autoCreatePointMatchIncidents: z.boolean().default(false),
        leagueScoringConfig: z.any(),
        leagueSlots: z.array(leagueSlotSchema),
        leagueData: z.object({
            gamesPerOpponent: z.number().min(1),
            includePlayoffs: z.boolean(),
            playoffTeamCount: z.number().optional(),
            usesSets: z.boolean().optional(),
            matchDurationMinutes: z.number().optional(),
            restTimeMinutes: z.number().min(0).optional(),
            setDurationMinutes: z.number().optional(),
            setsPerMatch: z.number().optional(),
            pointsToVictory: z.array(z.number()).optional(),
        }),
        playoffData: tournamentConfigSchema,
        tournamentData: tournamentConfigSchema,
        fields: z.array(z.any()),
        fieldCount: z.number().min(0),
        joinAsParticipant: z.boolean(),
    })
    .superRefine((values, ctx) => {
        if (values.singleDivision && values.maxParticipants == null) {
            ctx.addIssue({
                code: 'custom',
                message: values.teamSignup ? 'Max teams is required' : 'Max participants is required',
                path: ['maxParticipants'],
            });
        }

        if (values.teamSizeLimit == null) {
            ctx.addIssue({
                code: 'custom',
                message: 'Team size is required',
                path: ['teamSizeLimit'],
            });
        }

        if (!coordinatesAreSet(values.coordinates)) {
            ctx.addIssue({
                code: "custom",
                message: 'Select an event address from suggestions or the map',
                path: ['location'],
            });
        }

        const requiresDivisionSelection = !(options.allowMissingEventDivisions && values.eventType === 'EVENT');
        if (requiresDivisionSelection && values.divisions.length === 0) {
            ctx.addIssue({
                code: "custom",
                message: 'Select at least one division',
                path: ['divisions'],
            });
        }
        if (requiresDivisionSelection && values.divisionDetails.length === 0) {
            ctx.addIssue({
                code: "custom",
                message: 'Add at least one division',
                path: ['divisionDetails'],
            });
        }

        if (supportsScheduleSlotsForEvent(values.eventType, values.parentEvent) && !values.noFixedEndDateTime) {
            const parsedStart = parseLocalDateTime(values.start);
            const parsedEnd = parseLocalDateTime(values.end);
            if (!parsedStart || !parsedEnd || parsedEnd.getTime() <= parsedStart.getTime()) {
                ctx.addIssue({
                    code: "custom",
                    message: 'End date/time must be after start date/time when no fixed end datetime scheduling is disabled.',
                    path: ['end'],
                });
            }
        }

        const divisionIds = normalizeDivisionKeys(values.divisions);
        const detailIds = normalizeDivisionKeys(
            values.divisionDetails
                .map((detail) => detail?.id)
                .filter((value): value is string => typeof value === 'string'),
        );
        if (!stringSetsEqual(divisionIds, detailIds)) {
            ctx.addIssue({
                code: "custom",
                message: 'Division details are out of sync. Re-add the affected division.',
                path: ['divisionDetails'],
            });
        }
        if (requiresOrganizationEventFieldSelection(values.eventType, values.organizationId, values.selectedFieldIds)) {
            ctx.addIssue({
                code: "custom",
                message: 'Select at least one organization resource for this event.',
                path: ['selectedFieldIds'],
            });
        }
        const localFieldCount = values.fields.filter((field) => isEventLocalField(field as Field)).length;
        const selectedOrganizationFieldCount = values.selectedFieldIds.length;
        const scheduledFieldCount = Array.from(
            new Set(values.leagueSlots.flatMap((slot) => normalizeSlotFieldIds(slot))),
        ).length;
        const hasAtLeastOneField = selectedOrganizationFieldCount > 0
            || localFieldCount > 0
            || scheduledFieldCount > 0
            || values.fieldCount > 0;
        if ((values.eventType === 'EVENT' || values.eventType === 'WEEKLY_EVENT') && !hasAtLeastOneField) {
            ctx.addIssue({
                code: "custom",
                message: 'Select or create at least one resource for this event.',
                path: ['fieldCount'],
            });
        }

        const usesRelativePaymentPlanDueDates = values.eventType === 'WEEKLY_EVENT' && !values.parentEvent;
        if (values.allowPaymentPlans) {
            const amounts = values.installmentAmounts || [];
            const dueDates = values.installmentDueDates || [];
            const relativeDueDays = values.installmentDueRelativeDays || [];
            if (values.installmentCount && amounts.length !== values.installmentCount) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Installment count must match number of installments',
                    path: ['installmentCount'],
                });
            }
            if (!amounts.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one installment amount',
                    path: ['installmentAmounts'],
                });
            }
            if (usesRelativePaymentPlanDueDates) {
                if (relativeDueDays.length !== amounts.length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Each installment needs a due date offset',
                        path: ['installmentDueRelativeDays'],
                    });
                }
            } else if (dueDates.length && dueDates.length !== amounts.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Each installment needs a due date',
                    path: ['installmentDueDates'],
                });
            }
        }

        if (!values.singleDivision) {
            values.divisionDetails.forEach((detail, index) => {
                if (!detail.allowPaymentPlans) {
                    return;
                }
                const amounts = Array.isArray(detail.installmentAmounts) ? detail.installmentAmounts : [];
                const dueDates = Array.isArray(detail.installmentDueDates) ? detail.installmentDueDates : [];
                const relativeDueDays = Array.isArray(detail.installmentDueRelativeDays)
                    ? detail.installmentDueRelativeDays
                    : [];
                const expectedCount = Number.isFinite(detail.installmentCount) ? detail.installmentCount : amounts.length;
                if (expectedCount > 0 && amounts.length !== expectedCount) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Division installment count must match number of installments',
                        path: ['divisionDetails', index, 'installmentCount'],
                    });
                }
                if (!amounts.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Add at least one division installment amount',
                        path: ['divisionDetails', index, 'installmentAmounts'],
                    });
                }
                if (usesRelativePaymentPlanDueDates) {
                    if (relativeDueDays.length !== amounts.length) {
                        ctx.addIssue({
                            code: 'custom',
                            message: 'Each division installment needs a due date offset',
                            path: ['divisionDetails', index, 'installmentDueRelativeDays'],
                        });
                    }
                } else if (dueDates.length && dueDates.length !== amounts.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Each division installment needs a due date',
                        path: ['divisionDetails', index, 'installmentDueDates'],
                    });
                }
            });
        }

        if (typeof values.minAge === 'number' && typeof values.maxAge === 'number') {
            if (values.minAge > values.maxAge) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Minimum age must be less than or equal to maximum age',
                    path: ['minAge'],
                });
            }
        }

        if (supportsScheduleSlotsForEvent(values.eventType, values.parentEvent)) {
            const slotDivisionLookup = buildSlotDivisionLookup(
                values.divisionDetails,
                values.eventType === 'LEAGUE' && values.leagueData.includePlayoffs && values.splitLeaguePlayoffDivisions
                    ? values.playoffDivisionDetails
                    : [],
            );
            const selectedDivisionKeys = slotDivisionLookup.keys;
            if (values.eventType === 'LEAGUE' && values.leagueData.includePlayoffs) {
                if (values.splitLeaguePlayoffDivisions) {
                    if (!values.playoffDivisionDetails.length) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Add at least one playoff division when split playoffs are enabled.',
                            path: ['playoffDivisionDetails'],
                        });
                    }

                    const playoffDivisionById = new Map(
                        values.playoffDivisionDetails.map((division) => [
                            normalizeDivisionKeys([division.id])[0],
                            division,
                        ]),
                    );
                    const mappingReferences = new Map<string, number>();

                    values.divisionDetails.forEach((detail, index) => {
                        if (!(typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2)) {
                            ctx.addIssue({
                                code: "custom",
                                message: 'Division playoff team count is required when playoffs are enabled',
                                path: ['divisionDetails', index, 'playoffTeamCount'],
                            });
                            return;
                        }

                        const mapping = Array.isArray(detail.playoffPlacementDivisionIds)
                            ? detail.playoffPlacementDivisionIds
                            : [];
                        for (let placementIndex = 0; placementIndex < detail.playoffTeamCount; placementIndex += 1) {
                            const mappedDivisionId = normalizeDivisionKeys([mapping[placementIndex]])[0];
                            if (!mappedDivisionId) {
                                ctx.addIssue({
                                    code: "custom",
                                    message: `Map placement ${placementIndex + 1} to a playoff division.`,
                                    path: ['divisionDetails', index, 'playoffPlacementDivisionIds', placementIndex],
                                });
                                continue;
                            }
                            if (!playoffDivisionById.has(mappedDivisionId)) {
                                ctx.addIssue({
                                    code: "custom",
                                    message: `Placement ${placementIndex + 1} references an invalid playoff division.`,
                                    path: ['divisionDetails', index, 'playoffPlacementDivisionIds', placementIndex],
                                });
                                continue;
                            }
                            mappingReferences.set(mappedDivisionId, (mappingReferences.get(mappedDivisionId) ?? 0) + 1);
                        }
                    });

                    values.playoffDivisionDetails.forEach((division, index) => {
                        const normalizedId = normalizeDivisionKeys([division.id])[0];
                        if (!normalizedId) {
                            return;
                        }
                        const assignedCount = mappingReferences.get(normalizedId) ?? 0;
                        const capacity = normalizePlayoffDivisionParticipantCount(division.maxParticipants);
                        if (typeof capacity !== 'number' || capacity < 2) {
                            ctx.addIssue({
                                code: "custom",
                                message: values.teamSignup
                                    ? 'Playoff division teams count must be at least 2.'
                                    : 'Playoff division participants count must be at least 2.',
                                path: ['playoffDivisionDetails', index, 'maxParticipants'],
                            });
                            return;
                        }
                        if (assignedCount > capacity) {
                            ctx.addIssue({
                                code: "custom",
                                message: `Playoff division "${division.name}" has ${assignedCount} mapped positions but only ${capacity} slots.`,
                                path: ['playoffDivisionDetails', index, 'maxParticipants'],
                            });
                        }
                    });
                } else if (values.singleDivision) {
                    if (!(typeof values.leagueData.playoffTeamCount === 'number' && values.leagueData.playoffTeamCount >= 2)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Playoff team count is required when playoffs are enabled',
                            path: ['leagueData', 'playoffTeamCount'],
                        });
                    }
                } else {
                    values.divisionDetails.forEach((detail, index) => {
                        if (!(typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2)) {
                            ctx.addIssue({
                                code: "custom",
                                message: 'Division playoff team count is required when playoffs are enabled',
                                path: ['divisionDetails', index, 'playoffTeamCount'],
                            });
                        }
                    });
                }
            }

            if (isTournamentPoolPlayFormEnabled(values.eventType, values.leagueData.includePlayoffs)) {
                values.divisionDetails.forEach((detail, index) => {
                    const maxTeams = values.singleDivision
                        ? Math.max(2, Math.trunc(values.maxParticipants || detail.maxParticipants || 0))
                        : Math.max(2, Math.trunc(detail.maxParticipants || 0));
                    const poolCount = Number.isFinite(detail.poolCount)
                        ? Math.max(1, Math.trunc(detail.poolCount as number))
                        : null;
                    const bracketTeams = Number.isFinite(detail.playoffTeamCount)
                        ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                        : null;
                    if (!poolCount) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Pool count is required when pool play is enabled.',
                            path: ['divisionDetails', index, 'poolCount'],
                        });
                        return;
                    }
                    if (!bracketTeams) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Bracket team count is required when pool play is enabled.',
                            path: ['divisionDetails', index, 'playoffTeamCount'],
                        });
                    }
                    if (maxTeams % poolCount !== 0) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Division max teams must divide evenly by pool count.',
                            path: ['divisionDetails', index, 'poolCount'],
                        });
                    }
                    if (bracketTeams && bracketTeams % poolCount !== 0) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Bracket team count must divide evenly by pool count.',
                            path: ['divisionDetails', index, 'playoffTeamCount'],
                        });
                    }
                });
            }

            if (!values.leagueSlots.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one timeslot',
                    path: ['leagueSlots'],
                });
            }
            const coveredDivisionKeys = new Set<string>();
            values.leagueSlots.forEach((slot, index) => {
                if (!normalizeSlotFieldIds(slot).length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select at least one resource',
                        path: ['leagueSlots', index, 'scheduledFieldIds'],
                    });
                }
                if (slot.repeating === false) {
                    const slotStart = parseLocalDateTime(slot.startDate ?? null);
                    const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                    if (!slotStart) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select a start date/time',
                            path: ['leagueSlots', index, 'startDate'],
                        });
                    }
                    if (!slotEnd) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select an end date/time',
                            path: ['leagueSlots', index, 'endDate'],
                        });
                    }
                    if (slotStart && slotEnd && slotEnd.getTime() <= slotStart.getTime()) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'End date/time must be after start date/time',
                            path: ['leagueSlots', index, 'endDate'],
                        });
                    }
                } else {
                    if (!normalizeWeekdays(slot).length) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select at least one day',
                            path: ['leagueSlots', index, 'daysOfWeek'],
                        });
                    }
                    if (!Number.isFinite(slot.startTimeMinutes)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select a start time',
                            path: ['leagueSlots', index, 'startTimeMinutes'],
                        });
                    }
                    if (!Number.isFinite(slot.endTimeMinutes)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select an end time',
                            path: ['leagueSlots', index, 'endTimeMinutes'],
                        });
                    }
                }
                const normalizedSlotDivisionKeys = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
                if (!values.singleDivision && selectedDivisionKeys.length && !normalizedSlotDivisionKeys.length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select at least one division for this timeslot.',
                        path: ['leagueSlots', index, 'divisions'],
                    });
                }
                normalizedSlotDivisionKeys.forEach((divisionKey) => coveredDivisionKeys.add(divisionKey));
                if (
                    values.singleDivision &&
                    selectedDivisionKeys.length &&
                    !stringSetsEqual(
                        normalizedSlotDivisionKeys,
                        selectedDivisionKeys,
                    )
                ) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Single division requires every timeslot to include all selected divisions.',
                        path: ['leagueSlots', index, 'divisions'],
                    });
                }
                const error = computeSlotError(values.leagueSlots, index, values.eventType, values.parentEvent);
                if (error) {
                    ctx.addIssue({
                        code: "custom",
                        message: error,
                        path: ['leagueSlots', index, 'error'],
                    });
                }
                if (
                    typeof slot.error === 'string' &&
                    slot.error.trim().startsWith(RENTAL_SLOT_MISMATCH_ERROR_PREFIX)
                ) {
                    ctx.addIssue({
                        code: "custom",
                        message: slot.error,
                        path: ['leagueSlots', index, 'error'],
                    });
                }
            });
            selectedDivisionKeys.forEach((divisionKey) => {
                if (coveredDivisionKeys.has(divisionKey)) {
                    return;
                }
                const division = values.divisionDetails.find((detail) => (
                    normalizeDivisionKeys([detail.id, detail.key]).includes(divisionKey)
                ));
                ctx.addIssue({
                    code: "custom",
                    message: `${division?.name || 'Each division'} needs at least one timeslot.`,
                    path: ['leagueSlots'],
                });
            });
        }
    });

const EventForm = React.forwardRef<EventFormHandle, EventFormProps>(({
    isOpen,
    currentUser,
    event: incomingEvent,
    organization,
    immutableDefaults,
    formId,
    defaultLocation,
    isCreateMode = false,
    rentalPurchase,
    templateOrganizationId: templateOrganizationIdProp,
    onDirtyStateChange,
    onDraftStateChange,
}, ref) => {
    const open = isOpen ?? true;
    const lastResetSourceRef = useRef<string | null>(null);
    const dirtyBaselineValuesRef = useRef<EventFormValues | null>(null);
    const pendingInitialDirtyRebaseRef = useRef(false);
    const pendingInitialDirtyRebaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastValidationErrorsRef = useRef<FlattenedFormError[]>([]);
    const buildDraftForDirtyTrackingRef = useRef<(values: EventFormValues) => Partial<Event>>(
        () => ({}),
    );
    const previousEventTypeRef = useRef<EventType | null>(null);
    const previousEditableScheduleModeRef = useRef<boolean | null>(null);
    const previousEventFieldLocationRef = useRef<string>('');
    const slotConflictRequestRef = useRef(0);
    // Builds the mutable slot model consumed by LeagueFields whenever we add or hydrate time slots.
    const createSlotForm = useCallback((
        slot?: Partial<TimeSlot>,
        fallbackDivisions: string[] = [],
        fallbackEventStart?: string | Date | null,
        fallbackEventEnd?: string | Date | null,
        fallbackTimeZone?: string | null,
    ): LeagueSlotForm => {
        const slotTimeZone = normalizeTimeZone(slot?.timeZone, fallbackTimeZone || getSystemTimeZone());
        const normalizedDays = normalizeWeekdays({
            dayOfWeek: typeof slot?.dayOfWeek === 'number' ? slot.dayOfWeek : undefined,
            daysOfWeek: Array.isArray(slot?.daysOfWeek) ? slot.daysOfWeek : undefined,
        });
        const normalizedDivisions = normalizeDivisionKeys(slot?.divisions);
        const normalizedFieldIds = normalizeSlotFieldIds({
            scheduledFieldId: slot?.scheduledFieldId,
            scheduledFieldIds: slot?.scheduledFieldIds,
        });
        const isRepeating = slot?.repeating ?? true;
        const normalizedStartDate = isRepeating
            ? normalizeSlotBoundaryOverrideForForm(slot?.startDate ?? null, fallbackEventStart ?? null, slotTimeZone)
            : formatEventDateTimeForForm(slot?.startDate ?? null, slotTimeZone) || undefined;
        const normalizedEndDate = isRepeating
            ? normalizeSlotBoundaryOverrideForForm(slot?.endDate ?? null, fallbackEventEnd ?? null, slotTimeZone)
            : formatEventDateTimeForForm(slot?.endDate ?? null, slotTimeZone) || undefined;
        return {
            key: slot?.$id ?? createClientId(),
            $id: slot?.$id,
            timeZone: slotTimeZone,
            scheduledFieldId: normalizedFieldIds[0],
            scheduledFieldIds: normalizedFieldIds,
            dayOfWeek: normalizedDays[0],
            daysOfWeek: normalizedDays,
            divisions: normalizedDivisions.length ? normalizedDivisions : fallbackDivisions,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            startTimeMinutes: slot?.startTimeMinutes,
            endTimeMinutes: slot?.endTimeMinutes,
            price: typeof slot?.price === 'number' && Number.isFinite(slot.price) ? slot.price : undefined,
            sourceType: typeof slot?.sourceType === 'string' && slot.sourceType.trim().length > 0 ? slot.sourceType : undefined,
            rentalBookingId: typeof slot?.rentalBookingId === 'string' && slot.rentalBookingId.trim().length > 0 ? slot.rentalBookingId : undefined,
            rentalBookingItemId: typeof slot?.rentalBookingItemId === 'string' && slot.rentalBookingItemId.trim().length > 0 ? slot.rentalBookingItemId : undefined,
            rentalLocked: Boolean(slot?.rentalLocked),
            requiredTemplateIds: normalizeFieldIds(slot?.requiredTemplateIds),
            hostRequiredTemplateIds: normalizeFieldIds(slot?.hostRequiredTemplateIds),
            repeating: isRepeating,
            conflicts: [],
            checking: false,
            error: undefined,
        };
    }, []);
    const [hydratedOrganization, setHydratedOrganization] = useState<Organization | null>(organization ?? null);
    // Reflects whether the Stripe onboarding call is running to disable repeated clicks.
    const [connectingStripe, setConnectingStripe] = useState(false);
    const resolvedOrganization = hydratedOrganization ?? organization ?? null;
    const resolvedOrganizationId = (resolvedOrganization?.$id ?? '').trim();
    const resolvedOrganizationFields = resolvedOrganization?.fields;
    // Organization events must use org billing; personal events use the current user billing account.
    const hasStripeAccount = resolvedOrganization
        ? canOrganizationUsePaidBilling(resolvedOrganization)
        : Boolean(currentUser?.hasStripeAccount);
    const [templateDocuments, setTemplateDocuments] = useState<TemplateDocument[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [registrationQuestionDrafts, setRegistrationQuestionDrafts] = useState<RegistrationQuestionDraft[]>([]);
    const [registrationQuestionsLoading, setRegistrationQuestionsLoading] = useState(false);
    const [registrationQuestionsError, setRegistrationQuestionsError] = useState<string | null>(null);

    const activeEditingEvent = incomingEvent ?? null;

    const isEditMode = Boolean(activeEditingEvent && !isCreateMode);
    const isRentalCreateFlow = Boolean(!isEditMode && rentalPurchase);
    const eventValidationSchema = useMemo(
        () => buildEventFormSchema({
            allowMissingEventImage: isRentalCreateFlow,
            allowMissingEventDivisions: isRentalCreateFlow,
        }),
        [isRentalCreateFlow],
    );

    useEffect(() => {
        const eventId = activeEditingEvent?.$id;
        if (!open || !eventId || isCreateMode) {
            setRegistrationQuestionDrafts([]);
            setRegistrationQuestionsLoading(false);
            setRegistrationQuestionsError(null);
            return undefined;
        }

        let cancelled = false;
        setRegistrationQuestionsLoading(true);
        setRegistrationQuestionsError(null);
        teamService.getRegistrationQuestions('EVENT', eventId, 'edit')
            .then((questions) => {
                if (cancelled) {
                    return;
                }
                setRegistrationQuestionDrafts(questions.map((question, index) => ({
                    id: question.id,
                    prompt: question.prompt,
                    answerType: question.answerType,
                    required: question.required,
                    sortOrder: question.sortOrder ?? index,
                })));
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }
                setRegistrationQuestionDrafts([]);
                setRegistrationQuestionsError(error instanceof Error ? error.message : 'Failed to load registration questions.');
            })
            .finally(() => {
                if (!cancelled) {
                    setRegistrationQuestionsLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [activeEditingEvent?.$id, isCreateMode, open]);

    const { sports, sportsById, loading: sportsLoading, error: sportsError } = useSports();
    const sportOptions = useMemo(() => sports.map((sport) => ({ value: sport.$id, label: sport.name })), [sports]);

    const immutableDefaultsMemo = useMemo(() => immutableDefaults ?? {}, [immutableDefaults]);

    useEffect(() => {
        setHydratedOrganization(organization ?? null);
    }, [organization]);

    const immutableFields = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.fields)) {
            return [] as Field[];
        }
        return sanitizeFieldsForForm(
            (immutableDefaultsMemo.fields as Field[]).filter((field): field is Field => Boolean(field && field.$id))
        );
    }, [immutableDefaultsMemo.fields]);

    const hasImmutableFields = immutableFields.length > 0;

    const immutableTimeSlotsFromDefaults = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.timeSlots)) {
            return [] as TimeSlot[];
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        return (immutableDefaultsMemo.timeSlots as TimeSlot[])
            .map((slot) => {
                if (!slot) {
                    return null;
                }
                const { event: _ignoredEvent, ...rest } = slot;
                const normalized: TimeSlot = {
                    ...rest,
                    scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                    scheduledFieldIds: normalizeSlotFieldIds({
                        scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                        scheduledFieldIds: rest.scheduledFieldIds,
                    }),
                };
                return normalized;
            })
            .filter((slot): slot is TimeSlot => Boolean(slot));
    }, [immutableDefaultsMemo.timeSlots, immutableFields]);

    const isImmutableField = useCallback(
        (key: keyof Event) => immutableDefaultsMemo[key] !== undefined,
        [immutableDefaultsMemo]
    );

    const applyImmutableDefaults = useCallback((state: EventFormState): EventFormState => {
        const defaults = immutableDefaultsMemo;
        if (!defaults || Object.keys(defaults).length === 0) {
            return state;
        }

        const next = { ...state };

        if (defaults.name !== undefined) next.name = defaults.name ?? '';
        if (defaults.description !== undefined) next.description = defaults.description ?? '';
        if (defaults.location !== undefined) next.location = defaults.location ?? '';
        if (defaults.address !== undefined) next.address = defaults.address ?? '';
        if (Array.isArray(defaults.coordinates) && defaults.coordinates.length === 2) {
            next.coordinates = defaults.coordinates as [number, number];
        }
        if (defaults.timeZone !== undefined) {
            next.timeZone = normalizeTimeZone(defaults.timeZone, next.timeZone || getSystemTimeZone());
        }
        const defaultsTimeZone = normalizeTimeZone(next.timeZone, getSystemTimeZone());
        if (defaults.start !== undefined) next.start = formatEventDateTimeForForm(defaults.start, defaultsTimeZone);
        if (defaults.end !== undefined) next.end = formatEventDateTimeForForm(defaults.end, defaultsTimeZone);
        if (defaults.eventType !== undefined) next.eventType = defaults.eventType as EventFormState['eventType'];
        if (defaults.sport !== undefined) {
            if (typeof defaults.sport === 'string') {
                const sportId = defaults.sport ?? '';
                next.sportId = sportId;
                next.sportConfig = sportsById.get(sportId) ?? null;
            } else if (defaults.sport && typeof defaults.sport === 'object') {
                const sport = defaults.sport as Sport;
                const sportId = sport.$id ?? sport.name ?? '';
                next.sportId = sportId;
                next.sportConfig = sportsById.get(sportId) ?? { ...sport };
            } else {
                next.sportId = '';
                next.sportConfig = null;
            }
        }
        if (defaults.leagueScoringConfig && typeof defaults.leagueScoringConfig === 'object') {
            next.leagueScoringConfig = createLeagueScoringConfig(defaults.leagueScoringConfig as Partial<LeagueScoringConfig>);
        }
        if (typeof defaults.price === 'number') next.price = normalizePriceCents(defaults.price);
        if (typeof defaults.minAge === 'number') next.minAge = defaults.minAge;
        if (typeof defaults.maxAge === 'number') next.maxAge = defaults.maxAge;
        if (typeof defaults.maxParticipants === 'number') next.maxParticipants = defaults.maxParticipants;
        if (typeof defaults.teamSizeLimit === 'number') next.teamSizeLimit = defaults.teamSizeLimit;
        if (typeof defaults.teamSignup === 'boolean') next.teamSignup = defaults.teamSignup;
        if (typeof defaults.singleDivision === 'boolean') next.singleDivision = defaults.singleDivision;
        if (typeof (defaults as any).splitLeaguePlayoffDivisions === 'boolean') {
            next.splitLeaguePlayoffDivisions = Boolean((defaults as any).splitLeaguePlayoffDivisions);
        }
        if (typeof (defaults as any).noFixedEndDateTime === 'boolean') {
            next.noFixedEndDateTime = (defaults as any).noFixedEndDateTime;
        }
        if (typeof defaults.registrationByDivisionType === 'boolean') {
            next.registrationByDivisionType = defaults.registrationByDivisionType;
        }
        if (typeof (defaults as any).doTeamsOfficiate === 'boolean') {
            next.doTeamsOfficiate = Boolean((defaults as any).doTeamsOfficiate);
        }
        if (typeof (defaults as any).teamOfficialsMaySwap === 'boolean') {
            next.teamOfficialsMaySwap = next.doTeamsOfficiate ? Boolean((defaults as any).teamOfficialsMaySwap) : false;
        }
        if ((defaults as any).matchRulesOverride && typeof (defaults as any).matchRulesOverride === 'object') {
            next.matchRulesOverride = sanitizeMatchRulesOverrideForEditor((defaults as any).matchRulesOverride);
        } else if ((defaults as any).matchRulesOverride === null) {
            next.matchRulesOverride = null;
        }
        if (typeof (defaults as any).autoCreatePointMatchIncidents === 'boolean') {
            next.autoCreatePointMatchIncidents = Boolean((defaults as any).autoCreatePointMatchIncidents);
        }
        if ((defaults as any).officialSchedulingMode !== undefined) {
            next.officialSchedulingMode = normalizeOfficialSchedulingMode((defaults as any).officialSchedulingMode);
            if (next.officialSchedulingMode === 'TEAM_STAFFING') {
                next.doTeamsOfficiate = true;
            }
        }
        if (Array.isArray((defaults as any).officialPositions)) {
            next.officialPositions = normalizeEventOfficialPositions((defaults as any).officialPositions);
        }
        if (Array.isArray((defaults as any).eventOfficials) || Array.isArray((defaults as any).officialIds)) {
            next.eventOfficials = normalizeEventOfficials(
                (defaults as any).eventOfficials,
                !Array.isArray((defaults as any).eventOfficials) && Array.isArray((defaults as any).officialIds)
                    ? (defaults as any).officialIds.map((id: unknown) => String(id).trim()).filter(Boolean)
                    : [],
                next.officialPositions,
            );
            next.officialIds = getEventOfficialUserIds(next.eventOfficials);
        }
        if (Array.isArray((defaults as any).divisionDetails)) {
            const referenceDate = parseDateValue(next.start ?? null);
            next.divisionDetails = (defaults as any).divisionDetails
                .map((entry: unknown) => normalizeDivisionDetailEntry(
                    entry,
                    next.$id,
                    resolveSportInput(next.sportConfig ?? next.sportId),
                    referenceDate,
                ))
                .filter((entry: DivisionDetailForm | null): entry is DivisionDetailForm => Boolean(entry));
        }
        if (Array.isArray((defaults as any).playoffDivisionDetails)) {
            next.playoffDivisionDetails = (defaults as any).playoffDivisionDetails
                .map((entry: unknown) => normalizePlayoffDivisionDetailEntry(entry, next.$id))
                .filter((entry: PlayoffDivisionDetailForm | null): entry is PlayoffDivisionDetailForm => Boolean(entry));
        }
        if (defaults.divisions !== undefined) {
            next.divisions = Array.isArray(defaults.divisions)
                ? defaults.divisions.map(divisionIdFromValue).filter((divisionId) => divisionId.length > 0)
                : [];
        }
        if (!next.divisionDetails.length && next.divisions.length) {
            next.divisionDetails = next.divisions.map((divisionId) => {
                const inferred = inferDivisionDetails({
                    identifier: divisionId,
                    sportInput: resolveSportInput(next.sportConfig ?? next.sportId),
                });
                const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(
                    resolveSportInput(next.sportConfig ?? next.sportId),
                );
                const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
                const skillDivisionTypeId = composite?.skillDivisionTypeId
                    ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
                const ageDivisionTypeId = composite?.ageDivisionTypeId
                    ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
                const skillDivisionTypeName = getDivisionTypeById(
                    resolveSportInput(next.sportConfig ?? next.sportId),
                    skillDivisionTypeId,
                    'SKILL',
                )?.name ?? defaultsForSport.skillDivisionTypeName;
                const ageDivisionTypeName = getDivisionTypeById(
                    resolveSportInput(next.sportConfig ?? next.sportId),
                    ageDivisionTypeId,
                    'AGE',
                )?.name ?? defaultsForSport.ageDivisionTypeName;
                const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
                const divisionTypeName = buildDivisionName({
                    gender: inferred.gender,
                    sportInput: resolveSportInput(next.sportConfig ?? next.sportId),
                    skillDivisionTypeId,
                    ageDivisionTypeId,
                });
                const token = buildDivisionToken({
                    gender: inferred.gender,
                    ratingType: 'SKILL',
                    divisionTypeId,
                });
                return applyDivisionAgeCutoff({
                    id: divisionId,
                    key: token,
                    kind: 'LEAGUE',
                    name: divisionTypeName,
                    divisionTypeId,
                    divisionTypeName,
                    ratingType: 'SKILL',
                    gender: inferred.gender,
                    skillDivisionTypeId,
                    skillDivisionTypeName,
                    ageDivisionTypeId,
                    ageDivisionTypeName,
                    price: Math.max(0, next.price || 0),
                    maxParticipants: Math.max(2, Math.trunc(next.maxParticipants || 2)),
                    playoffTeamCount: Number.isFinite((defaults as any).playoffTeamCount)
                        ? Math.max(2, Math.trunc((defaults as any).playoffTeamCount))
                        : undefined,
                    playoffPlacementDivisionIds: [],
                    allowPaymentPlans: Boolean((defaults as any).allowPaymentPlans),
                    installmentCount: Number.isFinite((defaults as any).installmentCount)
                        ? Math.max(0, Math.trunc((defaults as any).installmentCount))
                        : normalizeInstallmentAmounts((defaults as any).installmentAmounts).length,
                    installmentDueDates: Array.isArray((defaults as any).installmentDueDates)
                        ? (defaults as any).installmentDueDates.map((value: unknown) => String(value))
                        : [],
                    installmentDueRelativeDays: normalizeInstallmentRelativeDays((defaults as any).installmentDueRelativeDays),
                    installmentAmounts: normalizeInstallmentAmounts((defaults as any).installmentAmounts),
                    sportId: resolveSportInput(next.sportConfig ?? next.sportId) || undefined,
                    fieldIds: [],
                }, resolveSportInput(next.sportConfig ?? next.sportId), parseDateValue(next.start ?? null));
            });
        }
        if (!next.divisions.length && next.divisionDetails.length) {
            next.divisions = next.divisionDetails.map((detail) => detail.id);
        }
        if (defaults.divisionFieldIds && typeof defaults.divisionFieldIds === 'object') {
            next.divisionFieldIds = Object.fromEntries(
                Object.entries(defaults.divisionFieldIds).map(([divisionKey, fieldIds]) => [
                    String(divisionKey).toLowerCase(),
                    Array.isArray(fieldIds)
                        ? Array.from(new Set(fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
                        : [],
                ]),
            );
        }
        if (Array.isArray(defaults.fieldIds)) {
            next.selectedFieldIds = Array.from(new Set(defaults.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)));
        }
        if ('cancellationRefundHours' in defaults) {
            next.cancellationRefundHours = typeof defaults.cancellationRefundHours === 'number'
                ? defaults.cancellationRefundHours
                : null;
        }
        if (typeof defaults.registrationCutoffHours === 'number') {
            next.registrationCutoffHours = defaults.registrationCutoffHours;
        }
        if (Array.isArray(defaults.requiredTemplateIds)) {
            next.requiredTemplateIds = [...defaults.requiredTemplateIds];
        }
        if (defaults.imageId !== undefined) next.imageId = defaults.imageId ?? '';
        if (typeof defaults.seedColor === 'number') next.seedColor = defaults.seedColor;
        if (Array.isArray(defaults.waitListIds)) next.waitList = [...defaults.waitListIds];
        if (Array.isArray(defaults.freeAgentIds)) next.freeAgents = [...defaults.freeAgentIds];
        if (Array.isArray(defaults.players)) next.players = [...defaults.players];
        if (Array.isArray(defaults.teams)) next.teams = [...defaults.teams];

        return next;
    }, [immutableDefaultsMemo, sportsById]);

    const buildDefaultFormValues = useCallback((): EventFormValues => {
        const defaultLocationLabel = (defaultLocation?.location ?? '').trim();
        const defaultLocationAddress = (defaultLocation?.address ?? '').trim();
        const defaultLocationCoordinates = defaultLocation?.coordinates;

        const base = (() => {
            const initial = applyImmutableDefaults(mapEventToFormState(activeEditingEvent));
            const normalizedSportId = typeof initial.sportId === 'string' ? initial.sportId.trim() : '';
            if (normalizedSportId) {
                initial.sportId = normalizedSportId;
                const hydratedSport = sportsById.get(normalizedSportId);
                if (hydratedSport) {
                    initial.sportConfig = hydratedSport;
                }
            }
            if (!initial.location && defaultLocationLabel) {
                initial.location = defaultLocationLabel;
            }
            if (!initial.address && defaultLocationAddress) {
                initial.address = defaultLocationAddress;
            }
            if (!coordinatesAreSet(initial.coordinates) && defaultLocationCoordinates) {
                initial.coordinates = defaultLocationCoordinates;
            }
            return initial;
        })();

        base.timeZone = normalizeTimeZone(base.timeZone, getSystemTimeZone());
        base.allowPaymentPlans = Boolean(base.allowPaymentPlans);
        base.installmentAmounts = Array.isArray(base.installmentAmounts) ? base.installmentAmounts : [];
        base.installmentDueDates = Array.isArray(base.installmentDueDates) ? base.installmentDueDates : [];
        base.installmentDueRelativeDays = normalizeInstallmentRelativeDays(base.installmentDueRelativeDays);
        base.requiredTemplateIds = Array.isArray(base.requiredTemplateIds)
            ? base.requiredTemplateIds
            : [];
        const normalizedInstallmentCount = Number.isFinite(base.installmentCount)
            ? Number(base.installmentCount)
            : base.installmentAmounts.length;
        base.installmentCount = normalizedInstallmentCount || 0;
        base.allowTeamSplitDefault = Boolean(base.allowTeamSplitDefault);
        if (!base.organizationId && resolvedOrganizationId) {
            base.organizationId = resolvedOrganizationId;
        }
        const hostedOrganizationId = (
            resolvedOrganizationId
            || base.organizationId
            || (activeEditingEvent?.organization as Organization | undefined)?.$id
            || activeEditingEvent?.organizationId
            || ''
        ).trim();

        const defaultFieldLocation = defaultFieldLocationForEvent(base.location);
        const defaultOrganizationFields = hostedOrganizationId && Array.isArray(resolvedOrganizationFields)
            ? sortFieldsByCreatedAt(
                sanitizeFieldsForForm(resolvedOrganizationFields as Field[])
                    .map((field) => withOrganizationFieldOwner(field, hostedOrganizationId)),
            )
            : [];
        const baseFields = (base as EventFormState & { fields?: Field[] }).fields;
        const inputEventFields = Array.isArray(baseFields)
            ? sortFieldsByCreatedAt(sanitizeFieldsForForm(baseFields as Field[]))
            : [];
        const activeEventFields = Array.isArray(activeEditingEvent?.fields)
            ? sortFieldsByCreatedAt(sanitizeFieldsForForm(activeEditingEvent.fields))
            : inputEventFields;
        const activeEventLocalFields = activeEventFields.filter(isEventLocalField);
        const supportsOrganizationFieldSelectionForDefault = supportsOrganizationFieldSelectionForEvent(
            base.eventType,
            base.parentEvent,
        );
        const supportsFieldCountForDefault = supportsFieldCountForEvent(base.eventType);
        const hasReusableOrganizationFieldsForDefaultCount = Boolean(
            hostedOrganizationId
            && (
                defaultOrganizationFields.length > 0
                || activeEventFields.some((field) => getFieldOrganizationId(field) === hostedOrganizationId)
            ),
        );
        const allowsDefaultLocalFields = supportsFieldCountForDefault
            || supportsOrganizationFieldSelectionForDefault;
        const defaults = immutableDefaults ?? {};
        const hasRentalBackedSlotsForDefaultCount = Boolean(
            (Array.isArray(defaults.timeSlots) && (defaults.timeSlots as TimeSlot[]).some(isRentalLockedTimeSlot))
            || (activeEditingEvent?.timeSlots ?? []).some(isRentalLockedTimeSlot)
        );
        const activeLocalFieldsAreOnlyPlaceholders = activeEventLocalFields.length > 0
            && activeEventLocalFields.every((field, index) => isGeneratedLocalFieldPlaceholder(field, index));
        const shouldKeepActiveLocalFieldDefaults = activeEventLocalFields.length > 0 && (
            !hostedOrganizationId
            || !isCreateMode
            || !activeLocalFieldsAreOnlyPlaceholders
            || (!hasReusableOrganizationFieldsForDefaultCount && !hasRentalBackedSlotsForDefaultCount)
        );

        const defaultFieldCount = (() => {
            if (shouldKeepActiveLocalFieldDefaults) {
                return activeEventLocalFields.length;
            }
            if (hostedOrganizationId && isCreateMode) {
                return hasReusableOrganizationFieldsForDefaultCount || hasRentalBackedSlotsForDefaultCount ? 0 : 1;
            }
            if (
                activeEditingEvent
                && !hasReusableOrganizationFieldsForDefaultCount
                && !hasRentalBackedSlotsForDefaultCount
                && typeof (activeEditingEvent as any)?.fieldCount === 'number'
            ) {
                const parsed = Number((activeEditingEvent as any).fieldCount);
                return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
            }
            if (hasReusableOrganizationFieldsForDefaultCount || hasRentalBackedSlotsForDefaultCount) {
                return 0;
            }
            return allowsDefaultLocalFields || !hostedOrganizationId ? 1 : 0;
        })();

        const defaultFields: Field[] = (() => {
            if (hasImmutableFields) {
                return sanitizeFieldsForForm(immutableFields);
            }
            if (hostedOrganizationId && defaultOrganizationFields.length) {
                const retainedActiveFields = activeEventFields.filter((field) => {
                    if (isEventLocalField(field)) {
                        return shouldKeepActiveLocalFieldDefaults;
                    }
                    const fieldOrganizationId = getFieldOrganizationId(field);
                    return !fieldOrganizationId || fieldOrganizationId !== hostedOrganizationId;
                });
                return mergeOrganizationFieldsIntoPool(
                    retainedActiveFields,
                    defaultOrganizationFields,
                    hostedOrganizationId,
                );
            }
            if (activeEventFields.length) {
                return activeEventFields;
            }
            if ((allowsDefaultLocalFields || !hostedOrganizationId) && defaultFieldCount > 0) {
                return Array.from({ length: defaultFieldCount }, (_, idx) => ({
                    $id: createClientId(),
                    name: `Field ${idx + 1}`,
                    location: defaultFieldLocation,
                } as Field));
            }
            return [];
        })();
        const allDefaultFieldIds = toFieldIdList(defaultFields);
        const defaultOrganizationFieldIds = hostedOrganizationId
            ? toFieldIdList(defaultFields.filter((field) => isSelectableOrganizationResource(field, hostedOrganizationId)))
            : [];
        const defaultHasRentalLockedTimeSlots = Array.isArray(defaults.timeSlots)
            && (defaults.timeSlots as TimeSlot[]).some(isRentalLockedTimeSlot);
        const activeRentalSelectorFieldIds = Array.from(
            new Set(
                (activeEditingEvent?.timeSlots ?? [])
                    .map((slot) => normalizeResourceText(slot?.rentalBookingItemId))
                    .filter(Boolean)
                    .map(getRentalBookingSelectorId),
            ),
        );
        const includeActiveRentalSelectors = (fieldIds: string[]) => Array.from(
            new Set([...fieldIds, ...activeRentalSelectorFieldIds]),
        );
        const defaultSelectedFieldIds = (() => {
            if (isCreateMode && defaultHasRentalLockedTimeSlots && !activeRentalSelectorFieldIds.length) {
                return [];
            }
            const selectableFieldIds = hostedOrganizationId && supportsOrganizationFieldSelectionForDefault
                ? defaultOrganizationFieldIds
                : allDefaultFieldIds;
            const selectableFieldIdSet = new Set(selectableFieldIds);
            const defaultFieldById = new Map(defaultFields.map((field) => [field.$id, field] as const));
            const canSelectFieldId = (fieldId: string): boolean => {
                if (selectableFieldIdSet.has(fieldId)) {
                    return true;
                }
                const field = defaultFieldById.get(fieldId);
                return Boolean(field && hostedOrganizationId && isRentedResourceForOrganization(field, hostedOrganizationId));
            };
            if (Array.isArray(base.selectedFieldIds)) {
                return includeActiveRentalSelectors(
                    Array.from(new Set(base.selectedFieldIds.filter(canSelectFieldId))),
                );
            }
            if (Array.isArray(activeEditingEvent?.fieldIds)) {
                return includeActiveRentalSelectors(
                    Array.from(
                        new Set(
                            activeEditingEvent.fieldIds
                                .map((fieldId) => String(fieldId))
                                .filter(canSelectFieldId),
                        ),
                    ),
                );
            }
            return includeActiveRentalSelectors([]);
        })();
        const availableFieldIdsForDivisions = defaultSelectedFieldIds.length
            ? defaultSelectedFieldIds
            : allDefaultFieldIds;
        const defaultDivisionDetails = (() => {
            const normalized = Array.isArray(base.divisionDetails)
                ? base.divisionDetails.filter((detail) => detail && detail.id)
                : [];
            if (normalized.length) {
                return normalized;
            }
            return [];
        })();
        const baseLeagueIncludesPlayoffs = Boolean(
            base.eventType === 'LEAGUE'
            && (
                (immutableDefaults && typeof (immutableDefaults as any).includePlayoffs === 'boolean'
                    ? Boolean((immutableDefaults as any).includePlayoffs)
                    : undefined)
                ?? (immutableDefaults && typeof (immutableDefaults as any).leagueData?.includePlayoffs === 'boolean'
                    ? Boolean((immutableDefaults as any).leagueData.includePlayoffs)
                    : undefined)
                ??
                activeEditingEvent?.leagueConfig?.includePlayoffs
                ?? activeEditingEvent?.includePlayoffs
                ?? false
            ),
        );
        const defaultSlotDivisionKeys = buildSlotDivisionLookup(
            defaultDivisionDetails,
            base.eventType === 'LEAGUE' && baseLeagueIncludesPlayoffs && base.splitLeaguePlayoffDivisions
                ? (base.playoffDivisionDetails || [])
                : [],
        ).keys;
        const defaultDivisionKeys = (() => {
            const normalizedFromDetails = normalizeDivisionKeys(defaultDivisionDetails.map((detail) => detail.id));
            if (normalizedFromDetails.length) {
                return normalizedFromDetails;
            }
            const normalized = normalizeDivisionKeys(base.divisions);
            if (normalized.length) {
                return normalized;
            }
            return [];
        })();
        const defaultDivisionFieldIds = normalizeDivisionFieldIds(
            base.divisionFieldIds,
            defaultDivisionKeys,
            availableFieldIdsForDivisions,
        );

        const defaultFieldId = Array.isArray(defaults.fields) && defaults.fields.length > 0
            ? (defaults.fields[0] as Field).$id
            : undefined;

        const defaultSlots = (() => {
            const defaultUsesEditableScheduleSlots = supportsScheduleSlotsForEvent(base.eventType, base.parentEvent);
            if (!defaultUsesEditableScheduleSlots && Array.isArray(defaults.timeSlots) && defaults.timeSlots.length > 0) {
                return mergeSlotPayloadsForForm(defaults.timeSlots as TimeSlot[], defaultFieldId)
                    .map((slot) => createSlotForm(slot, defaultSlotDivisionKeys, base.start, base.end, base.timeZone));
            }

            if (
                activeEditingEvent
                && supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)
                && activeEditingEvent.timeSlots?.length
            ) {
                return mergeSlotPayloadsForForm(activeEditingEvent.timeSlots || [])
                    .map((slot) => createSlotForm(slot, defaultSlotDivisionKeys, base.start, base.end, base.timeZone));
            }
            return [createSlotForm(undefined, defaultSlotDivisionKeys, base.start, base.end, base.timeZone)];
        })();

        const defaultLeagueData: LeagueConfig = (() => {
            const selectedSport = base.sportConfig
                ?? (base.sportId ? sportsById.get(base.sportId) : null);
            const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
            if (
                activeEditingEvent
                && (activeEditingEvent.eventType === 'LEAGUE' || activeEditingEvent.eventType === 'TOURNAMENT')
            ) {
                const divisionLeagueDetail = activeEditingEvent.eventType === 'LEAGUE' && Array.isArray(defaultDivisionDetails)
                    ? defaultDivisionDetails.find((detail) => typeof detail?.gamesPerOpponent === 'number')
                    : undefined;
                const eventLeagueFallback = normalizeLeagueConfigForSetMode({
                    ...(activeEditingEvent.leagueConfig || activeEditingEvent),
                    gamesPerOpponent: activeEditingEvent.leagueConfig?.gamesPerOpponent ?? activeEditingEvent.gamesPerOpponent ?? 1,
                    includePlayoffs: Boolean(
                        (activeEditingEvent as any)?.includePlayoffsOrPools
                        ?? activeEditingEvent.leagueConfig?.includePlayoffs
                        ?? activeEditingEvent.includePlayoffs,
                    ),
                    playoffTeamCount: activeEditingEvent.leagueConfig?.playoffTeamCount ?? activeEditingEvent.playoffTeamCount,
                }, requiresSets);
                const source = divisionLeagueDetail
                    ? buildDivisionLeagueConfig(divisionLeagueDetail, eventLeagueFallback, requiresSets)
                    : eventLeagueFallback;
                return normalizeLeagueConfigForSetMode({
                    ...source,
                    gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                    includePlayoffs: Boolean(
                        (source as any)?.includePlayoffsOrPools
                        ?? source?.includePlayoffs
                        ?? (activeEditingEvent as any)?.includePlayoffsOrPools
                        ?? activeEditingEvent.includePlayoffs,
                    ),
                    playoffTeamCount: source?.playoffTeamCount ?? activeEditingEvent.playoffTeamCount,
                }, requiresSets);
            }
            return normalizeLeagueConfigForSetMode({
                gamesPerOpponent: 1,
                includePlayoffs: false,
                playoffTeamCount: undefined,
                usesSets: false,
                matchDurationMinutes: 60,
                restTimeMinutes: 0,
                setDurationMinutes: undefined,
                setsPerMatch: undefined,
                pointsToVictory: undefined,
            }, requiresSets);
        })();

        const defaultTournamentData = (() => {
            if (activeEditingEvent && activeEditingEvent.eventType === 'TOURNAMENT') {
                return buildTournamentConfig({
                    doubleElimination: activeEditingEvent.doubleElimination,
                    winnerSetCount: activeEditingEvent.winnerSetCount,
                    loserSetCount: activeEditingEvent.loserSetCount,
                    winnerBracketPointsToVictory: activeEditingEvent.winnerBracketPointsToVictory,
                    loserBracketPointsToVictory: activeEditingEvent.loserBracketPointsToVictory,
                    prize: activeEditingEvent.prize,
                    fieldCount: activeEditingEvent.fieldCount ?? activeEditingEvent.fields?.length ?? 1,
                    restTimeMinutes: normalizeNumber(activeEditingEvent.restTimeMinutes, 0) ?? 0,
                    usesSets: activeEditingEvent.usesSets,
                    matchDurationMinutes: normalizeNumber(activeEditingEvent.matchDurationMinutes),
                    setDurationMinutes: normalizeNumber(activeEditingEvent.setDurationMinutes),
                });
            }
            return buildTournamentConfig();
        })();

        const defaultPlayoffData = (() => {
            if (activeEditingEvent?.includePlayoffs) {
                const extractedPlayoff = extractTournamentConfigFromEvent(activeEditingEvent);
                if (extractedPlayoff) {
                    return extractedPlayoff;
                }
            }
            return buildTournamentConfig();
        })();

        return {
            ...base,
            divisions: defaultDivisionKeys,
            divisionDetails: defaultDivisionDetails,
            divisionFieldIds: defaultDivisionFieldIds,
            selectedFieldIds: defaultSelectedFieldIds,
            leagueSlots: normalizeSlotState(defaultSlots, base.eventType, base.parentEvent),
            leagueData: defaultLeagueData,
            playoffData: defaultPlayoffData,
            tournamentData: defaultTournamentData,
            fields: defaultFields,
            fieldCount: defaultFieldCount,
            joinAsParticipant: false,
        };
    }, [
        activeEditingEvent,
        applyImmutableDefaults,
        createSlotForm,
      defaultLocation?.coordinates,
      defaultLocation?.address,
      defaultLocation?.location,
        hasImmutableFields,
        immutableDefaults,
        immutableFields,
        isCreateMode,
        resolvedOrganizationFields,
        resolvedOrganizationId,
        sportsById,
    ]);

    const {
        control,
        watch,
        setValue: rawSetValue,
        getValues,
        reset,
        clearErrors,
        trigger,
        formState: { errors, isDirty, dirtyFields: formDirtyFields },
    } = useForm<EventFormValues>({
        resolver: zodResolver(eventValidationSchema) as Resolver<EventFormValues>,
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        defaultValues: buildDefaultFormValues(),
    });
    const [isDirtyTrackingReady, setIsDirtyTrackingReady] = useState(false);
    const setValue = useCallback((
        name: string,
        value: unknown,
        options?: Record<string, unknown>,
    ) => {
        (rawSetValue as (
            fieldName: string,
            fieldValue: unknown,
            fieldOptions?: Record<string, unknown>,
        ) => void)(name, value, options);
    }, [rawSetValue]);
    const formValues = watch();

    useEffect(() => {
        if (!open) {
            setIsDirtyTrackingReady(false);
            lastResetSourceRef.current = null;
            previousEventTypeRef.current = null;
            previousEventFieldLocationRef.current = '';
            dirtyBaselineValuesRef.current = null;
            pendingInitialDirtyRebaseRef.current = false;
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
            onDirtyStateChange?.(false);
            onDraftStateChange?.({
                draft: {},
                baselineDraft: {},
            });
            return;
        }
        const sourceKey = isCreateMode
            ? 'create'
            : `event:${String(activeEditingEvent?.$id ?? '')}`;
        const sourceChanged = lastResetSourceRef.current !== sourceKey;
        if (!sourceChanged) {
            return;
        }
        lastResetSourceRef.current = sourceKey;
        setIsDirtyTrackingReady(false);
        pendingInitialDirtyRebaseRef.current = true;
        if (pendingInitialDirtyRebaseTimeoutRef.current) {
            clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
            pendingInitialDirtyRebaseTimeoutRef.current = null;
        }
        onDirtyStateChange?.(false);
        const nextDefaults = buildDefaultFormValues();
        previousEventTypeRef.current = nextDefaults.eventType;
        previousEventFieldLocationRef.current = defaultFieldLocationForEvent(nextDefaults.location);
        dirtyBaselineValuesRef.current = null;
        reset(nextDefaults);
    }, [
        activeEditingEvent,
        buildDefaultFormValues,
        isCreateMode,
        onDirtyStateChange,
        onDraftStateChange,
        reset,
        open,
    ]);

    useEffect(() => {
        const baselineValues = dirtyBaselineValuesRef.current ?? formValues;
        onDraftStateChange?.({
            draft: buildDraftForDirtyTrackingRef.current(formValues),
            baselineDraft: buildDraftForDirtyTrackingRef.current(baselineValues),
        });
        if (!isDirtyTrackingReady) {
            onDirtyStateChange?.(false);
            return;
        }
        onDirtyStateChange?.(isDirty);
    }, [formValues, isDirty, isDirtyTrackingReady, onDirtyStateChange, onDraftStateChange]);

    const eventData = formValues;
    const [rentalLockedTimeSlots, setRentalLockedTimeSlots] = useState<TimeSlot[]>([]);
    const eventSupportsScheduleSlots = supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    const hasRestrictedImmutableFields = hasImmutableFields && !eventSupportsScheduleSlots;
    const immutableDefaultRentalTimeSlots = useMemo(
        () => immutableTimeSlotsFromDefaults.filter(isRentalLockedTimeSlot),
        [immutableTimeSlotsFromDefaults],
    );
    const immutableTimeSlots = useMemo(() => {
        if (eventSupportsScheduleSlots) {
            return [];
        }
        if (rentalLockedTimeSlots.length) {
            return rentalLockedTimeSlots;
        }
        return immutableTimeSlotsFromDefaults;
    }, [eventSupportsScheduleSlots, immutableTimeSlotsFromDefaults, rentalLockedTimeSlots]);
    const hasImmutableTimeSlots = immutableTimeSlots.length > 0;
    const rentalLockedSlotsForDraft = useMemo(
        () => eventSupportsScheduleSlots
            ? mergeRentalLockedTimeSlots([...immutableDefaultRentalTimeSlots, ...rentalLockedTimeSlots])
            : rentalLockedTimeSlots,
        [eventSupportsScheduleSlots, immutableDefaultRentalTimeSlots, rentalLockedTimeSlots],
    );
    const automaticRefundsAvailable = useMemo(() => {
        if (!hasStripeAccount) {
            return false;
        }
        if (eventData.singleDivision) {
            return Math.max(0, Number(eventData.price) || 0) > 0;
        }
        const details = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        return details.some((detail) => Math.max(0, Number(detail.price) || 0) > 0);
    }, [
        eventData.divisionDetails,
        eventData.price,
        eventData.singleDivision,
        hasStripeAccount,
    ]);
    const hasUnsetTeamCapacityLimits = eventData.teamSizeLimit == null
        || (eventData.singleDivision && eventData.maxParticipants == null);
    const leagueSlots = formValues.leagueSlots;
    const leagueData = formValues.leagueData;
    const tournamentData = formValues.tournamentData;
    const playoffData = formValues.playoffData;
    const fields = formValues.fields;
    const fieldCount = formValues.fieldCount;
    const selectedFieldIds = useMemo(
        () => (Array.isArray(formValues.selectedFieldIds) ? formValues.selectedFieldIds : []),
        [formValues.selectedFieldIds],
    );
    const resolvedOrganizationFieldSignature = useMemo(
        () => (
            Array.isArray(resolvedOrganization?.fields)
                ? resolvedOrganization.fields
                    .map((field) => {
                        const fieldId = normalizeEntityId((field as Field | undefined)?.$id) ?? '';
                        const fieldCreatedAt = String((field as Field | undefined)?.$createdAt ?? (field as Field | undefined)?.createdAt ?? '').trim();
                        const fieldName = String((field as Field | undefined)?.name ?? '').trim();
                        return `${fieldId}:${fieldCreatedAt}:${fieldName}`;
                    })
                    .sort()
                    .join('|')
                : ''
        ),
        [resolvedOrganization?.fields],
    );
    const divisionFieldIds = useMemo(
        () => (
            formValues.divisionFieldIds && typeof formValues.divisionFieldIds === 'object'
                ? formValues.divisionFieldIds
                : {}
        ),
        [formValues.divisionFieldIds],
    );
    const joinAsParticipant = formValues.joinAsParticipant;
    const organizationId = resolvedOrganization?.$id ?? eventData.organizationId;
    const templateOrganizationId = templateOrganizationIdProp ?? organizationId;

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }

        const currentPrice = Number.isFinite(Number(eventData.price))
            ? Number(eventData.price)
            : 0;
        if (currentPrice !== 0) {
            setValue('price', 0, { shouldDirty: false, shouldValidate: true });
        }

        if (eventData.allowPaymentPlans) {
            setValue('allowPaymentPlans', false, { shouldDirty: false, shouldValidate: true });
        }

        const currentInstallmentCount = Number.isFinite(Number(eventData.installmentCount))
            ? Number(eventData.installmentCount)
            : 0;
        if (currentInstallmentCount !== 0) {
            setValue('installmentCount', 0, { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentAmounts = Array.isArray(eventData.installmentAmounts)
            && eventData.installmentAmounts.length > 0;
        if (hasInstallmentAmounts) {
            setValue('installmentAmounts', [], { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentDueDates = Array.isArray(eventData.installmentDueDates)
            && eventData.installmentDueDates.length > 0;
        if (hasInstallmentDueDates) {
            setValue('installmentDueDates', [], { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentDueRelativeDays = Array.isArray(eventData.installmentDueRelativeDays)
            && eventData.installmentDueRelativeDays.length > 0;
        if (hasInstallmentDueRelativeDays) {
            setValue('installmentDueRelativeDays', [], { shouldDirty: false, shouldValidate: true });
        }

        const currentDivisionDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDivisionDetails = currentDivisionDetails.map((detail) => {
            const detailPrice = Number.isFinite(Number(detail.price))
                ? Number(detail.price)
                : 0;
            const detailInstallmentCount = Number.isFinite(Number(detail.installmentCount))
                ? Number(detail.installmentCount)
                : 0;
            const hasDetailInstallmentAmounts = Array.isArray(detail.installmentAmounts)
                && detail.installmentAmounts.length > 0;
            const hasDetailInstallmentDueDates = Array.isArray(detail.installmentDueDates)
                && detail.installmentDueDates.length > 0;
            const hasDetailInstallmentDueRelativeDays = Array.isArray(detail.installmentDueRelativeDays)
                && detail.installmentDueRelativeDays.length > 0;
            const hasPaidSettings = detailPrice !== 0
                || Boolean(detail.allowPaymentPlans)
                || detailInstallmentCount !== 0
                || hasDetailInstallmentAmounts
                || hasDetailInstallmentDueDates
                || hasDetailInstallmentDueRelativeDays;
            if (!hasPaidSettings) {
                return detail;
            }
            return {
                ...detail,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            };
        });
        const divisionPricingChanged = nextDivisionDetails.some(
            (detail, index) => detail !== currentDivisionDetails[index],
        );
        if (divisionPricingChanged) {
            setValue('divisionDetails', nextDivisionDetails, { shouldDirty: false, shouldValidate: true });
        }

    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.price,
        hasStripeAccount,
        isCreateMode,
        setValue,
    ]);

    const templateOptions = useMemo(
        () => templateDocuments.map((template) => {
            const templateType = template.type ?? 'PDF';
            const signerLabel = getRequiredSignerTypeLabel(template.requiredSignerType);
            return {
                value: template.$id,
                label: `${template.title || 'Untitled Template'} (${templateType}, ${signerLabel})`,
            };
        }),
        [templateDocuments],
    );

    useEffect(() => {
        if (!templateOrganizationId) {
            setTemplateDocuments([]);
            setTemplatesError(null);
            return;
        }

        let cancelled = false;
        const loadTemplates = async () => {
            try {
                setTemplatesLoading(true);
                setTemplatesError(null);
                const response = await apiRequest<{ templates?: any[] }>(
                    `/api/organizations/${templateOrganizationId}/templates`,
                );
                const rows = Array.isArray(response.templates) ? response.templates : [];
                if (!cancelled) {
                    setTemplateDocuments(rows.map((row) => mapTemplateRow(row)));
                }
            } catch (error) {
                if (!cancelled) {
                    setTemplateDocuments([]);
                    setTemplatesError(
                        error instanceof Error ? error.message : 'Failed to load templates.',
                    );
                }
            } finally {
                if (!cancelled) {
                    setTemplatesLoading(false);
                }
            }
        };

        loadTemplates();

        return () => {
            cancelled = true;
        };
    }, [templateOrganizationId]);

    const setEventData = useCallback(
        (
            updater: React.SetStateAction<EventFormValues>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues();
            const next = typeof updater === 'function' ? (updater as (prev: EventFormValues) => EventFormValues)(current) : updater;
            if (next === current) {
                return;
            }
            const shouldDirty = options.shouldDirty ?? true;
            const shouldValidate = options.shouldValidate ?? true;
            (Object.keys(next) as (keyof EventFormValues)[]).forEach((key) => {
                const currentVal = current[key];
                const nextVal = next[key];
                if (Object.is(currentVal, nextVal)) return;
                setValue(key, nextVal, { shouldDirty, shouldValidate });
            });
        },
        [getValues, setValue],
    );

    const setLeagueData = useCallback(
        (
            updater: React.SetStateAction<LeagueConfig>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('leagueData');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueConfig) => LeagueConfig)(current) : updater;
            if (leagueConfigEqual(current, next)) {
                return;
            }
            setValue('leagueData', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setPendingStaffInvites = useCallback(
        (updater: React.SetStateAction<PendingStaffInvite[]>) => {
            const current = getValues('pendingStaffInvites') ?? [];
            const next = typeof updater === 'function'
                ? (updater as (prev: PendingStaffInvite[]) => PendingStaffInvite[])(current)
                : updater;
            setValue('pendingStaffInvites', next.map(normalizePendingStaffInvite), { shouldDirty: true, shouldValidate: false });
        },
        [getValues, setValue],
    );

    const setTournamentData = useCallback(
        (updater: React.SetStateAction<TournamentConfig>) => {
            const current = getValues('tournamentData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('tournamentData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setPlayoffData = useCallback(
        (
            updater: React.SetStateAction<TournamentConfig>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('playoffData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('playoffData', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setLeagueSlots = useCallback(
        (
            updater: React.SetStateAction<LeagueSlotForm[]>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('leagueSlots');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueSlotForm[]) => LeagueSlotForm[])(current) : updater;
            if (leagueSlotsEqual(current, next)) {
                return;
            }
            setValue('leagueSlots', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setFields = useCallback(
        (
            updater: React.SetStateAction<Field[]>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('fields');
            const next = typeof updater === 'function' ? (updater as (prev: Field[]) => Field[])(current) : updater;
            if (fieldsEqual(current, next)) {
                return;
            }
            setValue('fields', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setFieldCount = useCallback(
        (value: number) => {
            if (Object.is(getValues('fieldCount'), value)) {
                return;
            }
            setValue('fieldCount', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setSelectedFieldIds = useCallback(
        (value: string[]) => {
            if (Object.is(getValues('selectedFieldIds'), value)) {
                return;
            }
            setValue('selectedFieldIds', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setDivisionFieldIds = useCallback(
        (value: Record<string, string[]>) => {
            if (Object.is(getValues('divisionFieldIds'), value)) {
                return;
            }
            setValue('divisionFieldIds', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setJoinAsParticipant = useCallback(
        (value: boolean) => {
            if (Object.is(getValues('joinAsParticipant'), value)) {
                return;
            }
            (setValue as (name: string, value: unknown, options?: { shouldDirty?: boolean; shouldValidate?: boolean }) => void)(
                'joinAsParticipant',
                value,
                { shouldDirty: true, shouldValidate: true },
            );
        },
        [getValues, setValue],
    );

    const syncInstallmentCount = useCallback(
        (count: number) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(getValues('installmentAmounts') || [])];
            const dueDates = [...(getValues('installmentDueDates') || [])];
            const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
            const price = getValues('price') || 0;
            const startDate = getValues('start');
            const useRelativeDueDates = getValues('eventType') === 'WEEKLY_EVENT' && !getValues('parentEvent');
            while (amounts.length < safeCount) {
                amounts.push(amounts.length === 0 ? price : 0);
                dueDates.push(startDate);
                relativeDueDays.push(0);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
                relativeDueDays.pop();
            }
            setValue('installmentCount', safeCount, { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('price', sumInstallmentAmounts(amounts), { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', useRelativeDueDates ? [] : dueDates, { shouldDirty: true, shouldValidate: true });
            setValue(
                'installmentDueRelativeDays',
                useRelativeDueDates ? relativeDueDays : [],
                { shouldDirty: true, shouldValidate: true },
            );
        },
        [getValues, setValue],
    );

    const setInstallmentAmount = useCallback(
        (index: number, value: number) => {
            const amounts = [...(getValues('installmentAmounts') || [])];
            if (index >= amounts.length) return;
            amounts[index] = normalizePriceCents(value);
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('price', sumInstallmentAmounts(amounts), { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setInstallmentDueDate = useCallback(
        (index: number, value: Date | string | null) => {
            const dueDates = [...(getValues('installmentDueDates') || [])];
            if (index >= dueDates.length) return;
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setInstallmentDueRelativeDay = useCallback(
        (index: number, value: number | string) => {
            const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
            const amounts = getValues('installmentAmounts') || [];
            if (index < 0 || index >= amounts.length) return;
            while (relativeDueDays.length < amounts.length) {
                relativeDueDays.push(0);
            }
            const parsed = typeof value === 'number' ? value : Number(value);
            relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
            setValue('installmentDueRelativeDays', relativeDueDays, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', [], { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const removeInstallment = useCallback(
        (index: number) => {
            const amounts = [...(getValues('installmentAmounts') || [])];
            const dueDates = [...(getValues('installmentDueDates') || [])];
            const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
            if (amounts.length <= 1) return;
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            relativeDueDays.splice(index, 1);
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('price', sumInstallmentAmounts(amounts), { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueRelativeDays', relativeDueDays, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', amounts.length, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const syncDivisionInstallmentCount = useCallback((count: number) => {
        setDivisionEditor((prev) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            const price = Math.max(0, Number(prev.price) || 0);
            const fallbackDueDate = eventData.start;
            const useRelativeDueDates = eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent;

            while (amounts.length < safeCount) {
                amounts.push(amounts.length === 0 ? price : 0);
                dueDates.push(fallbackDueDate);
                relativeDueDays.push(0);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
                relativeDueDays.pop();
            }

            return {
                ...prev,
                installmentCount: safeCount,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                installmentDueDates: useRelativeDueDates ? [] : dueDates,
                installmentDueRelativeDays: useRelativeDueDates ? relativeDueDays : [],
                error: null,
            };
        });
    }, [eventData.eventType, eventData.parentEvent, eventData.start]);

    const setDivisionInstallmentAmount = useCallback((index: number, value: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts[index] = normalizePriceCents(value);
            return {
                ...prev,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueDate = useCallback((index: number, value: Date | string | null) => {
        setDivisionEditor((prev) => {
            const dueDates = [...(prev.installmentDueDates || [])];
            if (index < 0 || index >= dueDates.length) {
                return prev;
            }
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            return {
                ...prev,
                installmentDueDates: dueDates,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueRelativeDay = useCallback((index: number, value: number | string) => {
        setDivisionEditor((prev) => {
            const amounts = prev.installmentAmounts || [];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            while (relativeDueDays.length < amounts.length) {
                relativeDueDays.push(0);
            }
            const parsed = typeof value === 'number' ? value : Number(value);
            relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
            return {
                ...prev,
                installmentDueRelativeDays: relativeDueDays,
                installmentDueDates: [],
                error: null,
            };
        });
    }, []);

    const removeDivisionInstallment = useCallback((index: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            if (amounts.length <= 1 || index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            relativeDueDays.splice(index, 1);
            return {
                ...prev,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                installmentDueDates: dueDates,
                installmentDueRelativeDays: relativeDueDays,
                installmentCount: amounts.length,
                error: null,
            };
        });
    }, []);

    useEffect(() => {
        if (isEditMode) {
            return;
        }
        const ids = getEventOfficialUserIds(eventData.eventOfficials);
        const refs = eventData.officials || [];
        const missingIds = ids.filter((id) => !refs.some((ref) => ref.$id === id));
        if (!missingIds.length) {
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const fetched = await userService.getUsersByIds(missingIds);
                if (!cancelled && fetched.length) {
                    setEventData((prev) => ({
                        ...prev,
                        officials: [...(prev.officials || []), ...fetched.filter((ref) => ref.$id)],
                    }), { shouldDirty: false, shouldValidate: false });
                }
            } catch (error) {
                console.warn('Failed to hydrate officials for event:', error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [eventData.eventOfficials, eventData.officials, isEditMode, setEventData]);

    const [assistantHostUsers, setAssistantHostUsers] = useState<UserData[]>([]);
    const [staffInviteError, setStaffInviteError] = useState<string | null>(null);
    const [organizationStaffSearch, setOrganizationStaffSearch] = useState('');
    const [organizationStaffTypeFilter, setOrganizationStaffTypeFilter] = useState<'all' | StaffMemberType>('all');
    const [organizationStaffStatusFilter, setOrganizationStaffStatusFilter] = useState<'all' | StaffRosterStatus>('all');
    const [nonOrgStaffSearch, setNonOrgStaffSearch] = useState('');
    const [nonOrgStaffResults, setNonOrgStaffResults] = useState<UserData[]>([]);
    const [nonOrgStaffSearchLoading, setNonOrgStaffSearchLoading] = useState(false);
    const [nonOrgStaffError, setNonOrgStaffError] = useState<string | null>(null);
    const [newStaffInvite, setNewStaffInvite] = useState<PendingStaffInvite>(createEmptyStaffInvite());
    const [organizationStaffVisibleCount, setOrganizationStaffVisibleCount] = useState(5);
    const [officialCardVisibleCount, setOfficialCardVisibleCount] = useState(5);
    const [hostCardVisibleCount, setHostCardVisibleCount] = useState(5);

    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [rentalResourceOptions, setRentalResourceOptions] = useState<RentalBookingResourceOption[]>([]);
    const [rentalResourcesLoading, setRentalResourcesLoading] = useState(false);
    const [rentalResourcesError, setRentalResourcesError] = useState<string | null>(null);
    const organizationHostedEventId = (
        resolvedOrganization?.$id
        || eventData.organizationId
        || (activeEditingEvent?.organization as Organization | undefined)?.$id
        || activeEditingEvent?.organizationId
        || ''
    );
    const isOrganizationHostedEvent = organizationHostedEventId.length > 0;
    const supportsOrganizationFieldSelection = supportsOrganizationFieldSelectionForEvent(
        eventData.eventType,
        eventData.parentEvent,
    );
    const shouldLoadRentalResources = supportsOrganizationFieldSelection || eventSupportsScheduleSlots;
    const shouldManageLocalFields = !hasRestrictedImmutableFields && supportsFieldCountForEvent(eventData.eventType);
    const shouldProvisionFields = shouldManageLocalFields;
    const isOrganizationManagedEvent = isOrganizationHostedEvent && !shouldManageLocalFields;
    const organizationDefaultEventTaxHandling = normalizeOrganizationDefaultEventTaxHandling(
        resolvedOrganization?.defaultEventTaxHandling,
    );

    useEffect(() => {
        if (!open || !shouldLoadRentalResources) {
            setRentalResourceOptions([]);
            setRentalResourcesError(null);
            setRentalResourcesLoading(false);
            return undefined;
        }

        let cancelled = false;
        const params = new URLSearchParams();
        if (isEditMode && activeEditingEvent?.$id) {
            params.set('eventId', activeEditingEvent.$id);
        }
        if (organizationHostedEventId) {
            params.set('organizationId', organizationHostedEventId);
        }

        const loadRentalResources = async () => {
            try {
                setRentalResourcesLoading(true);
                setRentalResourcesError(null);
                const suffix = params.toString();
                const response = await apiRequest<RentalBookingsResponse>(
                    `/api/rentals/bookings${suffix ? `?${suffix}` : ''}`,
                );
                if (cancelled) {
                    return;
                }
                const options = mapRentalBookingsToResourceOptions(response);
                setRentalResourceOptions(options);
                const rentalFields = options.map((option) => option.field);
                setFields((previous) => {
                    const withoutPreviousRentalFields = previous.filter((field) => {
                        const marker = (field as { rentalResource?: boolean; _rentalResource?: boolean });
                        return !marker.rentalResource && !marker._rentalResource;
                    });
                    return rentalFields.length
                        ? mergeFieldsById(withoutPreviousRentalFields, rentalFields)
                        : withoutPreviousRentalFields;
                }, { shouldDirty: false, shouldValidate: false });
            } catch (error) {
                if (cancelled) {
                    return;
                }
                setRentalResourceOptions([]);
                setRentalResourcesError(error instanceof Error ? error.message : 'Failed to load reserved resources.');
            } finally {
                if (!cancelled) {
                    setRentalResourcesLoading(false);
                }
            }
        };

        loadRentalResources();

        return () => {
            cancelled = true;
        };
    }, [
        activeEditingEvent?.$id,
        isEditMode,
        open,
        organizationHostedEventId,
        setFields,
        shouldLoadRentalResources,
    ]);

    useEffect(() => {
        if (
            !isCreateMode
            || rentalResourcesLoading
            || rentalResourceOptions.length === 0
            || hasRestrictedImmutableFields
            || (formDirtyFields as Record<string, unknown>).fieldCount
            || (formDirtyFields as Record<string, unknown>).fields
        ) {
            return;
        }

        const currentFieldCount = Number(getValues('fieldCount'));
        if (!Number.isFinite(currentFieldCount) || currentFieldCount <= 0) {
            return;
        }

        const currentLocalFields = (getValues('fields') ?? []).filter((field) => isEventLocalField(field as Field));
        const onlyGeneratedLocalFields = currentLocalFields.every((field, index) => (
            isGeneratedLocalFieldPlaceholder(field as Field, index)
        ));
        if (!onlyGeneratedLocalFields) {
            return;
        }

        setValue('fieldCount', 0, { shouldDirty: false, shouldValidate: true });
    }, [
        formDirtyFields,
        getValues,
        hasRestrictedImmutableFields,
        isCreateMode,
        rentalResourceOptions.length,
        rentalResourcesLoading,
        setValue,
    ]);

    useEffect(() => {
        const previousEventType = previousEventTypeRef.current;
        previousEventTypeRef.current = eventData.eventType;

        if (!previousEventType || previousEventType === eventData.eventType) {
            return;
        }
        if (!isCreateMode || !isOrganizationHostedEvent || hasRestrictedImmutableFields) {
            return;
        }
        if (!supportsFieldCountForEvent(eventData.eventType) || supportsFieldCountForEvent(previousEventType)) {
            return;
        }

        setFieldCount(0);
    }, [
        eventData.eventType,
        hasRestrictedImmutableFields,
        isCreateMode,
        isOrganizationHostedEvent,
        setFieldCount,
    ]);

    const eventTaxPolicyForPreview = resolvePurchaseTaxPolicy({
        purchaseType: 'event',
        taxCategory: 'EVENT_PARTICIPANT',
        event: {
            address: eventData.address,
            location: eventData.location,
            organizationId: eventData.organizationId || resolvedOrganizationId || undefined,
            taxHandling: eventData.taxHandling,
            organizerManualTaxRateBps: eventData.organizerManualTaxRateBps,
        },
        organization: resolvedOrganization
            ? {
                defaultEventTaxHandling: organizationDefaultEventTaxHandling,
                taxResponsibilityAcceptedAt: resolvedOrganization.taxResponsibilityAcceptedAt,
            }
            : null,
    });
    const eventTaxableForPreview = hasStripeAccount && taxPolicyRequiresStripeTaxCalculation(eventTaxPolicyForPreview);
    const organizerTaxCollectionAllowed = eventTaxPolicyForPreview.liabilityParty === 'ORGANIZER';
    const organizerManualTaxSelected = organizerTaxCollectionAllowed
        && eventTaxPolicyForPreview.collectionStrategy === 'ORGANIZER_MANUAL_TAX';
    const organizationStaffAssignmentIds = useMemo(() => {
        const hostUserIds = new Set<string>();
        const officialUserIds = new Set<string>();
        const addByTypes = (userId: unknown, staffTypes: unknown, status: StaffRosterStatus) => {
            const normalizedUserId = normalizeEntityId(userId);
            if (!normalizedUserId || status !== 'active') {
                return;
            }
            const types = normalizeRosterStaffTypes(staffTypes);
            if (types.includes('HOST')) {
                hostUserIds.add(normalizedUserId);
            }
            if (types.includes('OFFICIAL')) {
                officialUserIds.add(normalizedUserId);
            }
        };

        if (resolvedOrganization?.ownerId) {
            hostUserIds.add(resolvedOrganization.ownerId);
        }
        (Array.isArray(resolvedOrganization?.staffMembers) ? resolvedOrganization.staffMembers : []).forEach((member) => {
            addByTypes(member.userId, member.types, normalizeInviteStatusToken(member.invite?.status));
        });
        (Array.isArray(resolvedOrganization?.staffInvites) ? resolvedOrganization.staffInvites : []).forEach((invite) => {
            addByTypes(invite.userId, invite.staffTypes, normalizeInviteStatusToken(invite.status));
        });

        return {
            hostUserIds: Array.from(hostUserIds),
            officialUserIds: Array.from(officialUserIds),
        };
    }, [resolvedOrganization?.ownerId, resolvedOrganization?.staffInvites, resolvedOrganization?.staffMembers]);
    const organizationAllowedHostIds = useMemo(
        () => organizationStaffAssignmentIds.hostUserIds,
        [organizationStaffAssignmentIds],
    );
    const organizationAllowedHostIdSet = useMemo(
        () => new Set(organizationAllowedHostIds),
        [organizationAllowedHostIds],
    );
    const organizationAllowedOfficialIds = useMemo(
        () => organizationStaffAssignmentIds.officialUserIds,
        [organizationStaffAssignmentIds],
    );
    const organizationAllowedOfficialIdSet = useMemo(
        () => new Set(organizationAllowedOfficialIds),
        [organizationAllowedOfficialIds],
    );
    const organizationUsersById = useMemo(() => {
        const map = new Map<string, Partial<UserData>>();
        const addUser = (candidate?: UserData | null) => {
            if (candidate?.$id) {
                map.set(candidate.$id, candidate);
            }
        };
        addUser(resolvedOrganization?.owner);
        (resolvedOrganization?.hosts || []).forEach((host) => addUser(host));
        addUser(currentUser);
        return map;
    }, [currentUser, resolvedOrganization?.hosts, resolvedOrganization?.owner]);
    const organizationOfficialsById = useMemo(() => {
        const map = new Map<string, UserData>();
        (resolvedOrganization?.officials || []).forEach((official) => {
            if (official?.$id && organizationAllowedOfficialIdSet.has(official.$id)) {
                map.set(official.$id, official);
            }
        });
        (eventData.officials || []).forEach((official) => {
            if (!official?.$id) {
                return;
            }
            if (!organizationAllowedOfficialIdSet.has(official.$id)) {
                return;
            }
            if (!map.has(official.$id)) {
                map.set(official.$id, official);
            }
        });
        return map;
    }, [eventData.officials, resolvedOrganization?.officials, organizationAllowedOfficialIdSet]);
    const assistantHostValue = useMemo(
        () => Array.from(
            new Set(
                (eventData.assistantHostIds || [])
                    .map((id) => String(id))
                    .filter((id) => id.length > 0 && id !== eventData.hostId),
            ),
        ),
        [eventData.assistantHostIds, eventData.hostId],
    );
    const hostStaffUserIds = useMemo(
        () => Array.from(
            new Set(
                [
                    normalizeEntityId(eventData.hostId),
                    ...assistantHostValue,
                ].filter((id): id is string => Boolean(id)),
            ),
        ),
        [assistantHostValue, eventData.hostId],
    );
    const assistantHostUsersById = useMemo(() => {
        const map = new Map<string, UserData>();
        assistantHostUsers.forEach((userEntry) => {
            if (userEntry?.$id) {
                map.set(userEntry.$id, userEntry);
            }
        });
        return map;
    }, [assistantHostUsers]);
    const currentEventStaffInvites = useMemo(
        () => (
            Array.isArray(activeEditingEvent?.staffInvites)
                ? activeEditingEvent.staffInvites
                : Array.isArray(incomingEvent?.staffInvites)
                    ? incomingEvent.staffInvites
                    : []
        )
            .map((invite) => {
                const inviteId = normalizeEntityId(
                    (invite as { $id?: string | null; id?: string | null } | null)?.$id
                    ?? (invite as { $id?: string | null; id?: string | null } | null)?.id,
                );
                if (!inviteId) {
                    return null;
                }
                return {
                    ...(invite as Invite),
                    $id: inviteId,
                };
            })
            .filter((invite): invite is Invite => {
                if (!invite) {
                    return false;
                }
                return (
                    invite.type === 'STAFF'
                    && invite.eventId === (activeEditingEvent?.$id ?? incomingEvent?.$id)
                );
            }),
        [activeEditingEvent?.$id, activeEditingEvent?.staffInvites, incomingEvent?.$id, incomingEvent?.staffInvites],
    );
    const currentEventStaffInviteByUserId = useMemo(() => {
        const map = new Map<string, Invite>();
        currentEventStaffInvites.forEach((invite) => {
            const normalizedUserId = normalizeEntityId(invite.userId);
            if (normalizedUserId) {
                map.set(normalizedUserId, invite);
            }
        });
        return map;
    }, [currentEventStaffInvites]);
    const existingAssignedStaffUserIds = useMemo(() => {
        const source = activeEditingEvent ?? incomingEvent;
        const sourceOfficialIds = getEventOfficialUserIds(source?.eventOfficials);
        const assignedIds = [
            ...(sourceOfficialIds.length
                ? sourceOfficialIds
                : (Array.isArray(source?.officialIds) ? source.officialIds : [])),
            ...(Array.isArray(source?.assistantHostIds) ? source.assistantHostIds : []),
        ];
        return new Set(
            assignedIds
                .map((id) => normalizeEntityId(id))
                .filter((id): id is string => Boolean(id)),
        );
    }, [activeEditingEvent, incomingEvent]);
    const organizationStaffRosterEntries = useMemo<StaffRosterEntry[]>(() => {
        const entries: StaffRosterEntry[] = [];
        const seen = new Set<string>();
        const staffMembers = Array.isArray(resolvedOrganization?.staffMembers) ? resolvedOrganization.staffMembers : [];
        const staffInvites = Array.isArray(resolvedOrganization?.staffInvites) ? resolvedOrganization.staffInvites : [];

        if (resolvedOrganization?.ownerId) {
            entries.push({
                id: resolvedOrganization.ownerId,
                userId: resolvedOrganization.ownerId,
                fullName: toUserLabel(resolvedOrganization.owner, resolvedOrganization.ownerId),
                userName: resolvedOrganization.owner?.userName ?? null,
                email: resolvedOrganization.staffEmailsByUserId?.[resolvedOrganization.ownerId] ?? getUserEmail(resolvedOrganization.owner),
                user: resolvedOrganization.owner ?? null,
                status: 'active',
                subtitle: 'Owner',
                types: ['HOST'],
            });
            seen.add(resolvedOrganization.ownerId);
        }

        staffMembers.forEach((staffMember) => {
            if (!staffMember.userId || seen.has(staffMember.userId) || staffMember.userId === resolvedOrganization?.ownerId) {
                return;
            }
            entries.push({
                id: staffMember.$id,
                userId: staffMember.userId,
                fullName: toUserLabel(staffMember.user, staffMember.userId),
                userName: staffMember.user?.userName ?? null,
                email: resolvedOrganization?.staffEmailsByUserId?.[staffMember.userId] ?? getUserEmail(staffMember.user),
                user: staffMember.user ?? null,
                status: normalizeInviteStatusToken(staffMember.invite?.status),
                subtitle: null,
                types: normalizeRosterStaffTypes(staffMember.types),
            });
            seen.add(staffMember.userId);
        });

        staffInvites.forEach((invite) => {
            if (!invite.userId || seen.has(invite.userId) || invite.userId === resolvedOrganization?.ownerId) {
                return;
            }
            entries.push({
                id: invite.$id,
                userId: invite.userId,
                fullName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email || invite.userId,
                userName: null,
                email: invite.email ?? null,
                user: null,
                status: normalizeInviteStatusToken(invite.status),
                subtitle: null,
                types: normalizeRosterStaffTypes(invite.staffTypes),
            });
            seen.add(invite.userId);
        });

        return entries;
    }, [
        resolvedOrganization?.owner,
        resolvedOrganization?.ownerId,
        resolvedOrganization?.staffEmailsByUserId,
        resolvedOrganization?.staffInvites,
        resolvedOrganization?.staffMembers,
    ]);
    const filteredOrganizationStaffEntries = useMemo(
        () => organizationStaffRosterEntries.filter((entry) => {
            if (organizationStaffTypeFilter !== 'all' && !entry.types.includes(organizationStaffTypeFilter)) {
                return false;
            }
            if (organizationStaffStatusFilter !== 'all' && entry.status !== organizationStaffStatusFilter) {
                return false;
            }
            const query = organizationStaffSearch.trim().toLowerCase();
            if (!query.length) {
                return true;
            }
            return [
                entry.fullName,
                entry.userName ?? '',
                entry.email ?? '',
                entry.subtitle ?? '',
            ]
                .map((value) => value.toLowerCase())
                .some((value) => value.includes(query));
        }),
        [
            organizationStaffRosterEntries,
            organizationStaffSearch,
            organizationStaffStatusFilter,
            organizationStaffTypeFilter,
        ],
    );
    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        const sanitized = sanitizeOrganizationEventAssignments(
            {
                hostId: eventData.hostId,
                assistantHostIds: eventData.assistantHostIds || [],
                officialIds: [],
            },
            {
                ownerId: resolvedOrganization?.ownerId,
                staffMembers: resolvedOrganization?.staffMembers,
                staffInvites: resolvedOrganization?.staffInvites,
            },
        );
        const normalizedCurrentHostId = normalizeEntityId(eventData.hostId) ?? null;
        const normalizedCurrentAssistantHostIds = Array.from(
            new Set(
                (eventData.assistantHostIds || [])
                    .map((id) => normalizeEntityId(id))
                    .filter((id): id is string => Boolean(id) && id !== normalizedCurrentHostId),
            ),
        );
        const nextHostId = sanitized.hostId;
        if (
            normalizedCurrentHostId === nextHostId
            && stringArraysEqual(normalizedCurrentAssistantHostIds, sanitized.assistantHostIds)
        ) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: nextHostId ?? prev.hostId,
            assistantHostIds: sanitized.assistantHostIds,
        }), { shouldDirty: false });
    }, [
        eventData.assistantHostIds,
        eventData.hostId,
        isOrganizationHostedEvent,
        resolvedOrganization?.ownerId,
        resolvedOrganization?.staffInvites,
        resolvedOrganization?.staffMembers,
        setEventData,
    ]);
    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        const nextEventOfficials = normalizeEventOfficials(
            (eventData.eventOfficials || []).filter((official) => organizationAllowedOfficialIdSet.has(official.userId)),
            [],
            eventData.officialPositions || [],
        );
        const nextOfficialIds = getEventOfficialUserIds(nextEventOfficials);
        const nextOfficials = nextOfficialIds
            .map((id) => organizationOfficialsById.get(id))
            .filter((candidate): candidate is UserData => Boolean(candidate));
        if (
            stringArraysEqual((eventData.officialIds || []).map((id) => String(id)).filter(Boolean), nextOfficialIds)
            && JSON.stringify(eventData.eventOfficials || []) === JSON.stringify(nextEventOfficials)
            && stringArraysEqual(
                (eventData.officials || []).map((official) => official?.$id).filter((id): id is string => Boolean(id)),
                nextOfficials.map((official) => official.$id),
            )
        ) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            officialIds: nextOfficialIds,
            eventOfficials: nextEventOfficials,
            officials: nextOfficials,
        }), { shouldDirty: false });
    }, [
        eventData.eventOfficials,
        eventData.officialPositions,
        eventData.officialIds,
        eventData.officials,
        isOrganizationHostedEvent,
        organizationAllowedOfficialIdSet,
        organizationOfficialsById,
        setEventData,
    ]);
    useEffect(() => {
        if (!hostStaffUserIds.length) {
            setAssistantHostUsers((prev) => (prev.length > 0 ? [] : prev));
            return;
        }
        const knownIds = new Set([
            ...assistantHostUsers.map((userEntry) => userEntry.$id).filter(Boolean),
            ...organizationUsersById.keys(),
        ]);
        const missingIds = hostStaffUserIds.filter((id) => !knownIds.has(id));
        if (!missingIds.length) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const fetched = await userService.getUsersByIds(missingIds);
                if (cancelled || !fetched.length) {
                    return;
                }
                setAssistantHostUsers((prev) => {
                    const byId = new Map(prev.map((entry) => [entry.$id, entry]));
                    fetched.forEach((entry) => {
                        if (entry?.$id) {
                            byId.set(entry.$id, entry);
                        }
                    });
                    return hostStaffUserIds
                        .map((id) => byId.get(id))
                        .filter((entry): entry is UserData => Boolean(entry));
                });
            } catch (error) {
                console.warn('Failed to hydrate host staff for event:', error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [assistantHostUsers, hostStaffUserIds, organizationUsersById]);
    useEffect(() => {
        if (isOrganizationHostedEvent) {
            setNonOrgStaffResults([]);
            setNonOrgStaffError(null);
            return;
        }
        const query = nonOrgStaffSearch.trim();
        if (query.length < 2) {
            setNonOrgStaffResults([]);
            setNonOrgStaffError(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setNonOrgStaffSearchLoading(true);
                setNonOrgStaffError(null);
                const results = await userService.searchUsers(query);
                if (!cancelled) {
                    setNonOrgStaffResults(results.filter((candidate) => Boolean(candidate?.$id)));
                }
            } catch (error) {
                console.error('Failed to search staff:', error);
                if (!cancelled) {
                    setNonOrgStaffError('Failed to search staff. Try again.');
                }
            } finally {
                if (!cancelled) {
                    setNonOrgStaffSearchLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOrganizationHostedEvent, nonOrgStaffSearch]);
    const handleHostChange = useCallback((value: string | null) => {
        if (!value) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(value)) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: value,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== value),
        }));
    }, [isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);
    const cacheAssistantHostUser = useCallback((assistantHost?: UserData | null) => {
        if (!assistantHost?.$id) {
            return;
        }
        setAssistantHostUsers((prev) => {
            if (prev.some((candidate) => candidate.$id === assistantHost.$id)) {
                return prev;
            }
            return [...prev, assistantHost];
        });
    }, []);
    const handleAddAssistantHost = useCallback((assistantHost: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const assistantHostId = normalizeEntityId(assistantHost.$id ?? assistantHost.userId);
        if (!assistantHostId) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(assistantHostId)) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: Array.from(
                new Set(
                    [...(prev.assistantHostIds || []), assistantHostId]
                        .map((id) => String(id).trim())
                        .filter((id) => id.length > 0 && id !== prev.hostId),
                ),
            ),
        }));
        cacheAssistantHostUser(assistantHost.$id ? (assistantHost as UserData) : null);
    }, [cacheAssistantHostUser, isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);
    const handleRemoveAssistantHost = useCallback((assistantHostId: string) => {
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== assistantHostId),
        }));
    }, [setEventData]);
    const fieldCountOptions = useMemo(
        () => {
            const start = isOrganizationHostedEvent ? 0 : 1;
            return Array.from({ length: 13 - start }, (_, idx) => {
                const value = start + idx;
                return { value: String(value), label: String(value) };
            });
        },
        [isOrganizationHostedEvent],
    );
    const slotDivisionLookup = useMemo(
        () => buildSlotDivisionLookup(
            eventData.divisionDetails || [],
            eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && eventData.splitLeaguePlayoffDivisions
                ? (eventData.playoffDivisionDetails || [])
                : [],
        ),
        [
            eventData.divisionDetails,
            eventData.eventType,
            eventData.playoffDivisionDetails,
            eventData.splitLeaguePlayoffDivisions,
            leagueData.includePlayoffs,
        ],
    );
    const slotDivisionKeys = slotDivisionLookup.keys;
    const slotDivisionKeysRef = useRef<string[]>(slotDivisionKeys);
    useEffect(() => {
        slotDivisionKeysRef.current = slotDivisionKeys;
    }, [slotDivisionKeys]);
    const divisionOptions = useMemo(
        () => slotDivisionLookup.options,
        [slotDivisionLookup],
    );
    const slotConflictCheckKey = useMemo(() => JSON.stringify({
        eventId: activeEditingEvent?.$id ?? eventData.$id ?? '',
        eventType: eventData.eventType,
        parentEvent: eventData.parentEvent ?? null,
        eventStart: eventData.start ?? undefined,
        eventEnd: eventData.end ?? undefined,
        slots: leagueSlots.map((slot) => {
            const normalizedDays = normalizeWeekdays(slot);
            const normalizedFieldIds = normalizeSlotFieldIds(slot);
            return {
                key: slot.key,
                $id: slot.$id,
                scheduledFieldId: normalizedFieldIds[0],
                scheduledFieldIds: normalizedFieldIds,
                dayOfWeek: normalizedDays[0],
                daysOfWeek: normalizedDays,
                divisions: normalizeDivisionKeys(slot.divisions),
                startDate: formatLocalDateTime(slot.startDate ?? null) || undefined,
                endDate: formatLocalDateTime(slot.endDate ?? null) || undefined,
                startTimeMinutes: typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : undefined,
                endTimeMinutes: typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : undefined,
                repeating: slot.repeating !== false,
            } satisfies SlotConflictSnapshot;
        }),
    } satisfies SlotConflictPayload), [
        activeEditingEvent?.$id,
        eventData.$id,
        eventData.end,
        eventData.eventType,
        eventData.parentEvent,
        eventData.start,
        leagueSlots,
    ]);
    const slotConflictContext = useMemo<SlotConflictContext>(() => ({
        eventId: activeEditingEvent?.$id ?? eventData.$id ?? '',
        eventStart: eventData.start ?? undefined,
        eventEnd: eventData.end ?? undefined,
    }), [activeEditingEvent?.$id, eventData.$id, eventData.end, eventData.start]);
    const { hasPendingExternalConflictChecks, hasExternalSlotConflictWarnings } = useMemo(() => {
        if (!supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent)) {
            return {
                hasPendingExternalConflictChecks: false,
                hasExternalSlotConflictWarnings: false,
            };
        }

        let hasPending = false;
        let hasConflicts = false;
        for (const slot of leagueSlots) {
            if (!slotCanCheckExternalConflicts(slot, slotConflictContext)) {
                continue;
            }
            if (slot.checking) {
                hasPending = true;
            }
            if (slot.conflicts.length > 0) {
                hasConflicts = true;
            }
            if (hasPending && hasConflicts) {
                break;
            }
        }

        return {
            hasPendingExternalConflictChecks: hasPending,
            hasExternalSlotConflictWarnings: hasConflicts,
        };
    }, [eventData.eventType, eventData.parentEvent, leagueSlots, slotConflictContext]);
    const divisionTypeOptions = useMemo(() => {
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const catalogOptions = getDivisionTypeOptionsForSport(sportInput);
        const detailSkillOptions = (eventData.divisionDetails || []).map((detail) => ({
            id: detail.skillDivisionTypeId || detail.divisionTypeId,
            name: detail.skillDivisionTypeName || detail.divisionTypeName,
            ratingType: 'SKILL' as const,
            sportKey: sportInput || 'event',
        }));
        const detailAgeOptions = (eventData.divisionDetails || []).map((detail) => ({
            id: detail.ageDivisionTypeId || detail.divisionTypeId,
            name: detail.ageDivisionTypeName || detail.divisionTypeName,
            ratingType: 'AGE' as const,
            sportKey: sportInput || 'event',
        }));
        const merged = [...catalogOptions, ...detailSkillOptions, ...detailAgeOptions];
        const seen = new Set<string>();
        return merged.filter((option) => {
            const key = `${option.ratingType}:${option.id}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId]);
    const skillDivisionTypeSelectOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'SKILL')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const ageDivisionTypeSelectOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'AGE')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const defaultDivisionTypeSelections = useMemo(
        () => getDefaultDivisionTypeSelectionsForSport(resolveSportInput(eventData.sportConfig ?? eventData.sportId)),
        [eventData.sportConfig, eventData.sportId],
    );

    const [divisionEditor, setDivisionEditor] = useState<{
        editingId: string | null;
        divisionKind: DivisionEditorKind;
        gender: '' | 'M' | 'F' | 'C';
        skillDivisionTypeId: string;
        ageDivisionTypeId: string;
        name: string;
        price: number;
        maxParticipants: number | null;
        playoffTeamCount: number | null;
        poolCount: number | null;
        playoffPlacementDivisionIds: string[];
        leagueConfig: LeagueConfig;
        playoffConfig: TournamentConfig;
        allowPaymentPlans: boolean;
        installmentCount: number;
        installmentDueDates: string[];
        installmentDueRelativeDays: number[];
        installmentAmounts: number[];
        nameTouched: boolean;
        error: string | null;
    }>({
        editingId: null,
        divisionKind: 'LEAGUE',
        gender: '',
        skillDivisionTypeId: '',
        ageDivisionTypeId: '',
        name: '',
        price: Math.max(0, eventData.price || 0),
        maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        playoffTeamCount: Math.max(
            2,
            Math.trunc(
                typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants || 2,
            ),
        ),
        poolCount: null,
        playoffPlacementDivisionIds: [],
        leagueConfig: normalizeLeagueConfigForSetMode(leagueData, Boolean(eventData.sportConfig?.usePointsPerSetWin)),
        playoffConfig: buildTournamentConfig(),
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentDueRelativeDays: [],
        installmentAmounts: [],
        nameTouched: false,
        error: null,
    });
    const previousSingleDivisionRef = useRef<boolean | null>(null);
    const firstDivisionDetailForDefaults = useMemo(
        () => (Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails[0] : undefined),
        [eventData.divisionDetails],
    );
    const singleDivisionPoolPlayDefaults = useMemo(() => {
        const bracketTeams = typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(firstDivisionDetailForDefaults.playoffTeamCount))
            : divisionEditor.playoffTeamCount;
        const poolCount = typeof firstDivisionDetailForDefaults?.poolCount === 'number'
            ? Math.max(1, Math.trunc(firstDivisionDetailForDefaults.poolCount))
            : divisionEditor.poolCount;
        return {
            bracketTeams,
            poolCount,
            poolTeamCount: derivePoolTeamCount(eventData.maxParticipants, poolCount),
        };
    }, [
        divisionEditor.playoffTeamCount,
        divisionEditor.poolCount,
        eventData.maxParticipants,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
    ]);
    const splitDivisionEditorEnabled = Boolean(
        eventData.eventType === 'LEAGUE'
        && leagueData.includePlayoffs
        && eventData.splitLeaguePlayoffDivisions
        && !eventData.singleDivision,
    );
    const mobileEditUnsupportedReasons = useMemo(() => {
        const reasons: string[] = [];
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && eventData.splitLeaguePlayoffDivisions
        ) {
            reasons.push('split league/playoff divisions');
        }
        const hasEventPaymentPlans = hasMobileBlockingPaymentPlanConfig({
            allowPaymentPlans: eventData.allowPaymentPlans,
            installmentCount: eventData.installmentCount,
            installmentAmounts: eventData.installmentAmounts,
            installmentDueDates: eventData.installmentDueDates,
            installmentDueRelativeDays: eventData.installmentDueRelativeDays,
        });
        const hasDivisionPaymentPlans = (eventData.divisionDetails || [])
            .some((detail) => hasMobileBlockingPaymentPlanConfig(detail));
        const hasEditorPaymentPlans = hasMobileBlockingPaymentPlanConfig(divisionEditor);
        if (hasEventPaymentPlans || hasDivisionPaymentPlans || hasEditorPaymentPlans) {
            reasons.push('payment plans/installments');
        }
        return reasons;
    }, [
        divisionEditor,
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
    ]);
    const mobileEditUnsupportedWarning = mobileEditUnsupportedReasons.length > 0
        ? `This event is not editable on mobile because it uses ${formatMobileEditUnsupportedReasons(mobileEditUnsupportedReasons)}. Teams and matches can still be managed from mobile.`
        : null;
    const currentSportRequiresSets = useMemo(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        return Boolean(selectedSport?.usePointsPerSetWin);
    }, [eventData.sportConfig, eventData.sportId, sportsById]);

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }
        setDivisionEditor((prev) => {
            const hasEditorPaidSettings = prev.price !== 0
                || prev.allowPaymentPlans
                || (prev.installmentCount || 0) !== 0
                || (prev.installmentAmounts?.length || 0) > 0
                || (prev.installmentDueDates?.length || 0) > 0
                || (prev.installmentDueRelativeDays?.length || 0) > 0;
            if (!hasEditorPaidSettings) {
                return prev;
            }
            return {
                ...prev,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
                error: null,
            };
        });
    }, [hasStripeAccount, isCreateMode]);

    const createNextPlayoffDivision = useCallback((
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ): PlayoffDivisionDetailForm => {
        let index = Math.max(1, existing.length + 1);
        while (index < 500) {
            const key = `playoff_${index}`;
            const id = buildEventDivisionId(eventData.$id, key);
            if (!existing.some((division) => division.id === id || division.key === key)) {
                return {
                    id,
                    key,
                    kind: 'PLAYOFF',
                    name: `Playoff Division ${index}`,
                    maxParticipants: 2,
                    playoffConfig: buildTournamentConfig(configTemplate),
                };
            }
            index += 1;
        }
        const fallbackKey = `playoff_${Date.now()}`;
        return {
            id: buildEventDivisionId(eventData.$id, fallbackKey),
            key: fallbackKey,
            kind: 'PLAYOFF',
            name: 'Playoff Division',
            maxParticipants: 2,
            playoffConfig: buildTournamentConfig(configTemplate),
        };
    }, [eventData.$id]);

    const handleRemovePlayoffDivision = useCallback((playoffDivisionId: string) => {
        const normalizedPlayoffDivisionId = normalizeDivisionKeys([playoffDivisionId])[0];
        if (!normalizedPlayoffDivisionId) {
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivisions = currentPlayoffDivisions.filter((division) => (
            normalizeDivisionKeys([division.id])[0] !== normalizedPlayoffDivisionId
        ));
        setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const remappedLeagueDivisions = currentLeagueDivisions.map((division) => {
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            const nextMapping = mapping.map((entry) => {
                const normalizedEntry = normalizeDivisionKeys([entry])[0];
                return normalizedEntry === normalizedPlayoffDivisionId ? '' : entry;
            });
            if (stringArraysEqual(mapping, nextMapping)) {
                return division;
            }
            return {
                ...division,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        setValue('divisionDetails', remappedLeagueDivisions, { shouldDirty: true, shouldValidate: true });
        setDivisionEditor((prev) => {
            if (prev.editingId === normalizedPlayoffDivisionId && prev.divisionKind === 'PLAYOFF') {
                return {
                    ...prev,
                    editingId: null,
                    divisionKind: 'LEAGUE',
                    error: null,
                };
            }
            if (!prev.playoffPlacementDivisionIds.some((entry) => normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId)) {
                return prev;
            }
            return {
                ...prev,
                playoffPlacementDivisionIds: prev.playoffPlacementDivisionIds.map((entry) => (
                    normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId ? '' : entry
                )),
                error: null,
            };
        });
    }, [eventData.divisionDetails, eventData.playoffDivisionDetails, setValue]);

    const playoffDivisionSelectOptions = useMemo(
        () => (eventData.playoffDivisionDetails || []).map((division) => ({
            value: division.id,
            label: division.name,
        })),
        [eventData.playoffDivisionDetails],
    );

    const playoffDivisionCapacityWarnings = useMemo(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return [] as string[];
        }

        const assignmentCounts = new Map<string, number>();
        const playoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];

        (eventData.divisionDetails || []).forEach((division) => {
            const playoffTeamCount = Number.isFinite(division.playoffTeamCount)
                ? Math.max(0, Math.trunc(division.playoffTeamCount as number))
                : 0;
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            for (let index = 0; index < playoffTeamCount; index += 1) {
                const mappedDivisionId = normalizeDivisionKeys([mapping[index]])[0];
                if (!mappedDivisionId) {
                    continue;
                }
                assignmentCounts.set(mappedDivisionId, (assignmentCounts.get(mappedDivisionId) ?? 0) + 1);
            }
        });

        return playoffDivisions
            .map((division) => {
                const normalizedId = normalizeDivisionKeys([division.id])[0];
                if (!normalizedId) {
                    return null;
                }
                const assigned = assignmentCounts.get(normalizedId) ?? 0;
                const capacity = normalizePlayoffDivisionParticipantCount(division.maxParticipants) ?? 0;
                if (assigned > capacity) {
                    return `${division.name} has ${assigned} mapped teams but only ${capacity} slots.`;
                }
                return null;
            })
            .filter((message): message is string => Boolean(message));
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
    ]);

    const selectedSportForOfficials = useMemo(
        () => (
            (eventData.sportId ? sportsById.get(eventData.sportId) : null)
            ?? eventData.sportConfig
            ?? null
        ),
        [eventData.sportConfig, eventData.sportId, sportsById],
    );
    const sportOfficialPositionTemplates = useMemo(
        () => normalizeSportOfficialPositionTemplates(selectedSportForOfficials?.officialPositionTemplates),
        [selectedSportForOfficials],
    );
    const availableOfficialFieldOptions = useMemo(() => {
        const localFieldIds = toFieldIdList(fields.filter(isEventLocalField));
        const allowedFieldIdSet = selectedFieldIds.length > 0
            ? new Set([...selectedFieldIds, ...localFieldIds])
            : null;
        return fields
            .filter((field) => {
                const fieldId = String(field?.$id ?? '').trim();
                if (!fieldId) {
                    return false;
                }
                return allowedFieldIdSet ? allowedFieldIdSet.has(fieldId) : true;
            })
            .map((field) => ({
                value: field.$id,
                label: getFieldDisplayName(field),
            }));
    }, [fields, selectedFieldIds]);
    const eventOfficialByUserId = useMemo(
        () => new Map((eventData.eventOfficials || []).map((official) => [official.userId, official] as const)),
        [eventData.eventOfficials],
    );

    useEffect(() => {
        const normalized = normalizeEventOfficials(
            eventData.eventOfficials,
            Array.isArray(eventData.eventOfficials) ? [] : eventData.officialIds || [],
            eventData.officialPositions || [],
        );
        const normalizedOfficialIds = getEventOfficialUserIds(normalized);
        if (
            JSON.stringify(eventData.eventOfficials || []) === JSON.stringify(normalized)
            && stringArraysEqual((eventData.officialIds || []).map((id) => String(id)).filter(Boolean), normalizedOfficialIds)
        ) {
            return;
        }
        setValue('eventOfficials', normalized, { shouldDirty: false, shouldValidate: false });
        setValue('officialIds', normalizedOfficialIds, { shouldDirty: false, shouldValidate: false });
    }, [eventData.eventOfficials, eventData.officialIds, eventData.officialPositions, setValue]);

    const handleResetOfficialPositionsFromSport = useCallback(() => {
        const nextPositions = buildOfficialPositionsFromTemplates(sportOfficialPositionTemplates);
        setEventData((prev) => ({
            ...prev,
            officialPositions: nextPositions,
            eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
            officialIds: getEventOfficialUserIds(prev.eventOfficials),
        }));
    }, [setEventData, sportOfficialPositionTemplates]);

    const handleAddOfficialPosition = useCallback(() => {
        setEventData((prev) => {
            const nextPositions = [
                ...(prev.officialPositions || []),
                {
                    id: createClientId(),
                    name: '',
                    count: 1,
                    order: (prev.officialPositions || []).length,
                } satisfies EventOfficialPosition,
            ];
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateOfficialPosition = useCallback((
        positionId: string,
        updates: Partial<Pick<EventOfficialPosition, 'name' | 'count'>>,
    ) => {
        setEventData((prev) => {
            const nextPositions = (prev.officialPositions || []).map((position, index) => (
                position.id === positionId
                    ? {
                        ...position,
                        name: updates.name ?? position.name,
                        count: updates.count !== undefined
                            ? Math.max(1, Math.trunc(updates.count || 1))
                            : position.count,
                        order: index,
                    }
                    : { ...position, order: index }
            ));
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleRemoveOfficialPosition = useCallback((positionId: string) => {
        setEventData((prev) => {
            const nextPositions = (prev.officialPositions || [])
                .filter((position) => position.id !== positionId)
                .map((position, index) => ({ ...position, order: index }));
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateEventOfficialEligibility = useCallback((
        userId: string,
        updates: Partial<Pick<EventOfficial, 'positionIds' | 'fieldIds'>>,
    ) => {
        setEventData((prev) => {
            const nextPositions = prev.officialPositions || [];
            const nextOfficials = normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions).map((official) => {
                if (official.userId !== userId) {
                    return official;
                }
                return {
                    ...official,
                    positionIds: updates.positionIds !== undefined
                        ? Array.from(new Set(updates.positionIds.filter(Boolean)))
                        : official.positionIds,
                    fieldIds: updates.fieldIds !== undefined
                        ? Array.from(new Set(updates.fieldIds.filter(Boolean)))
                        : official.fieldIds,
                };
            });
            return {
                ...prev,
                eventOfficials: normalizeEventOfficials(nextOfficials, getEventOfficialUserIds(nextOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(nextOfficials),
            };
        });
    }, [setEventData]);

    const handleAddOfficial = useCallback((official: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const officialId = normalizeEntityId(official.$id ?? official.userId);
        if (!officialId) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedOfficialIdSet.has(officialId)) {
            return;
        }
        setEventData((prev) => {
            const nextPositions = prev.officialPositions || [];
            const existingOfficials = normalizeEventOfficials(
                prev.eventOfficials,
                getEventOfficialUserIds(prev.eventOfficials),
                nextPositions,
            );
            const nextEventOfficials = normalizeEventOfficials(
                existingOfficials.some((entry) => entry.userId === officialId)
                    ? existingOfficials
                    : [
                        ...existingOfficials,
                        {
                            id: createClientId(),
                            userId: officialId,
                            positionIds: nextPositions.map((position) => position.id),
                            fieldIds: [],
                            isActive: true,
                        } satisfies EventOfficial,
                    ],
                [],
                nextPositions,
            );
            const nextIds = getEventOfficialUserIds(nextEventOfficials);
            const nextRefs = official.$id && !(prev.officials || []).some((ref) => ref.$id === official.$id)
                ? [...(prev.officials || []), official as UserData]
                : prev.officials || [];
            return {
                ...prev,
                officialIds: nextIds,
                eventOfficials: nextEventOfficials,
                officials: nextRefs,
            };
        });
    }, [isOrganizationHostedEvent, organizationAllowedOfficialIdSet, setEventData]);

    const handleRemoveOfficial = useCallback((officialId: string) => {
        setEventData((prev) => ({
            ...prev,
            eventOfficials: normalizeEventOfficials(
                (prev.eventOfficials || []).filter((official) => official.userId !== officialId),
                [],
                prev.officialPositions || [],
            ),
            officialIds: getEventOfficialUserIds(
                (prev.eventOfficials || []).filter((official) => official.userId !== officialId),
            ),
            officials: (prev.officials || []).filter((ref) => ref.$id !== officialId),
        }));
    }, [setEventData]);

    const assignedUserIdsByRole = useMemo(() => ({
        OFFICIAL: normalizeDirtyTrackedIdList(getEventOfficialUserIds(eventData.eventOfficials)),
        ASSISTANT_HOST: normalizeDirtyTrackedIdList([...(eventData.hostId ? [eventData.hostId] : []), ...assistantHostValue]),
    }) satisfies Record<StaffAssignmentRole, string[]>, [assistantHostValue, eventData.eventOfficials, eventData.hostId]);

    const assignedUserIdSetByRole = useMemo(() => ({
        OFFICIAL: new Set(assignedUserIdsByRole.OFFICIAL),
        ASSISTANT_HOST: new Set(assignedUserIdsByRole.ASSISTANT_HOST),
    }) satisfies Record<StaffAssignmentRole, Set<string>>, [assignedUserIdsByRole]);

    const assignedStaffUserIds = useMemo(
        () => Array.from(new Set([...assignedUserIdsByRole.OFFICIAL, ...assignedUserIdsByRole.ASSISTANT_HOST])),
        [assignedUserIdsByRole],
    );
    const requiredOfficialSlotsPerMatch = useMemo(
        () => (eventData.officialPositions || []).reduce(
            (total, position) => total + Math.max(1, Number(position.count) || 1),
            0,
        ),
        [eventData.officialPositions],
    );
    const assignedActiveOfficialsForStaffing = useMemo(() => {
        const normalizedOfficialIds = Array.from(
            new Set(
                getEventOfficialUserIds(eventData.eventOfficials)
                    .map((id) => String(id).trim())
                    .filter((id) => id.length > 0),
            ),
        );
        if (!normalizedOfficialIds.length) {
            return 0;
        }
        const normalizedEventOfficials = normalizeEventOfficials(
            eventData.eventOfficials,
            normalizedOfficialIds,
            eventData.officialPositions || [],
        );
        const allowedPositionIds = new Set((eventData.officialPositions || []).map((position) => position.id));
        return normalizedEventOfficials.filter((official) => {
            if (official.isActive === false) {
                return false;
            }
            if (!official.userId || !normalizedOfficialIds.includes(official.userId)) {
                return false;
            }
            if (!allowedPositionIds.size) {
                return true;
            }
            return official.positionIds.some((positionId) => allowedPositionIds.has(positionId));
        }).length;
    }, [eventData.eventOfficials, eventData.officialPositions]);
    const officialStaffingCoverageError = useMemo(() => {
        if (eventData.officialSchedulingMode !== 'STAFFING') {
            return null;
        }
        if (requiredOfficialSlotsPerMatch <= 0) {
            return null;
        }
        if (assignedActiveOfficialsForStaffing >= requiredOfficialSlotsPerMatch) {
            return null;
        }
        const requiredLabel = requiredOfficialSlotsPerMatch === 1 ? 'official' : 'officials';
        const assignedLabel = assignedActiveOfficialsForStaffing === 1 ? 'is' : 'are';
        return `STAFFING requires at least ${requiredOfficialSlotsPerMatch} ${requiredLabel} for each match, but only ${assignedActiveOfficialsForStaffing} ${assignedLabel} assigned to this event.`;
    }, [assignedActiveOfficialsForStaffing, eventData.officialSchedulingMode, requiredOfficialSlotsPerMatch]);

    const lookupPendingStaffInviteMembership = useCallback(async (pendingInvites: PendingStaffInvite[]) => {
        const pendingEmails = Array.from(new Set(
            pendingInvites
                .map((invite) => normalizeInviteEmail(invite.email))
                .filter((email) => email.length > 0),
        ));
        if (!pendingEmails.length || !assignedStaffUserIds.length) {
            return new Map<string, Set<string>>();
        }

        const matches = await userService.lookupEmailMembership(pendingEmails, assignedStaffUserIds);
        const membershipByEmail = new Map<string, Set<string>>();
        matches.forEach((match) => {
            const email = normalizeInviteEmail(match.email);
            const userId = normalizeEntityId(match.userId);
            if (!email || !userId) {
                return;
            }
            const matchedUserIds = membershipByEmail.get(email) ?? new Set<string>();
            matchedUserIds.add(userId);
            membershipByEmail.set(email, matchedUserIds);
        });
        return membershipByEmail;
    }, [assignedStaffUserIds]);

    const findPendingStaffInviteConflictMessage = useCallback((
        pendingInvites: PendingStaffInvite[],
        membershipByEmail: Map<string, Set<string>>,
    ): string | null => {
        for (const invite of pendingInvites) {
            const matchedUserIds = membershipByEmail.get(invite.email);
            if (!matchedUserIds || matchedUserIds.size === 0) {
                continue;
            }
            for (const role of invite.roles) {
                if (Array.from(matchedUserIds).some((userId) => assignedUserIdSetByRole[role].has(userId))) {
                    return `${invite.email} is already added as ${formatStaffRoleLabel(role).toLowerCase()} for this event.`;
                }
            }
        }
        return null;
    }, [assignedUserIdSetByRole]);


    const validatePendingStaffInvites = useCallback(async (pendingInvitesInput: PendingStaffInvite[]) => {
        if (isOrganizationHostedEvent) {
            setStaffInviteError(null);
            return new Map<string, Set<string>>();
        }

        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(pendingInvitesInput);
        for (const invite of pendingInvites) {
            if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email) || invite.roles.length === 0) {
                const message = 'Enter first name, last name, valid email, and at least one role for every email invite before saving.';
                setStaffInviteError(message);
                throw new Error(message);
            }
        }

        const membershipByEmail = await lookupPendingStaffInviteMembership(pendingInvites);
        const conflictMessage = findPendingStaffInviteConflictMessage(pendingInvites, membershipByEmail);
        if (conflictMessage) {
            setStaffInviteError(conflictMessage);
            throw new Error(conflictMessage);
        }

        setStaffInviteError(null);
        return membershipByEmail;
    }, [findPendingStaffInviteConflictMessage, isOrganizationHostedEvent, lookupPendingStaffInviteMembership]);

    const validatePendingStaffAssignments = useCallback(async () => {
        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(getValues('pendingStaffInvites') ?? []);
        await validatePendingStaffInvites(pendingInvites);
    }, [getValues, validatePendingStaffInvites]);

    const handleStagePendingStaffInvite = useCallback(async () => {
        if (isOrganizationHostedEvent) {
            return;
        }

        const nextInvite = normalizePendingStaffInvite(newStaffInvite);
        if (!nextInvite.firstName || !nextInvite.lastName || !EMAIL_REGEX.test(nextInvite.email) || nextInvite.roles.length === 0) {
            setStaffInviteError('Enter first name, last name, valid email, and at least one role before adding an email invite.');
            return;
        }

        const membershipByEmail = await lookupPendingStaffInviteMembership([nextInvite]);
        const conflictMessage = findPendingStaffInviteConflictMessage([nextInvite], membershipByEmail);
        if (conflictMessage) {
            setStaffInviteError(conflictMessage);
            return;
        }

        setPendingStaffInvites((prev) => {
            const existingIndex = prev.findIndex((invite) => normalizeInviteEmail(invite.email) === nextInvite.email);
            if (existingIndex === -1) {
                return [...prev, nextInvite];
            }
            const updated = [...prev];
            updated[existingIndex] = normalizePendingStaffInvite({
                ...updated[existingIndex],
                firstName: nextInvite.firstName,
                lastName: nextInvite.lastName,
                email: nextInvite.email,
                roles: [...updated[existingIndex].roles, ...nextInvite.roles],
            });
            return updated;
        });
        setNewStaffInvite(createEmptyStaffInvite());
        setStaffInviteError(null);
    }, [findPendingStaffInviteConflictMessage, isOrganizationHostedEvent, lookupPendingStaffInviteMembership, newStaffInvite, setPendingStaffInvites]);


    const submitPendingStaffInvites = useCallback(async (eventId: string) => {
        if (isOrganizationHostedEvent) {
            return;
        }
        if (!currentUser?.$id) {
            const message = 'You must be signed in to manage staff invites.';
            setStaffInviteError(message);
            throw new Error(message);
        }

        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(getValues('pendingStaffInvites') ?? []);
        const pendingInviteMembershipByEmail = await validatePendingStaffInvites(pendingInvites);
        const targetRolesByUserId = new Map<string, Set<EventInviteStaffType>>();
        const addTargetRole = (userId: string | null | undefined, role: EventInviteStaffType) => {
            const normalizedUserId = normalizeEntityId(userId);
            if (!normalizedUserId) {
                return;
            }
            const roles = targetRolesByUserId.get(normalizedUserId) ?? new Set<EventInviteStaffType>();
            roles.add(role);
            targetRolesByUserId.set(normalizedUserId, roles);
        };

        getEventOfficialUserIds(eventData.eventOfficials).forEach((officialId) => addTargetRole(officialId, 'OFFICIAL'));
        assistantHostValue.forEach((assistantHostId) => addTargetRole(assistantHostId, 'HOST'));

        const unresolvedEmailInvites: PendingStaffInvite[] = [];
        pendingInvites.forEach((invite) => {
            const knownUserId = Array.from(pendingInviteMembershipByEmail.get(invite.email) ?? [])[0] ?? null;
            if (knownUserId) {
                invite.roles.forEach((role) => addTargetRole(knownUserId, mapRoleToInviteStaffType(role)));
                return;
            }
            unresolvedEmailInvites.push(invite);
        });

        const payload = [
            ...Array.from(targetRolesByUserId.entries()).flatMap(([userId, roles]) => {
                const normalizedUserId = normalizeEntityId(userId);
                if (!normalizedUserId) {
                    return [];
                }
                const targetStaffTypes = Array.from(roles).sort();
                const existingInvite = currentEventStaffInviteByUserId.get(normalizedUserId);
                const existingStatus = normalizeInviteStatusToken(existingInvite?.status);
                const existingStaffTypes = normalizeInviteStaffTypes(existingInvite?.staffTypes);
                const isExistingInviteUpdate = Boolean(existingInvite)
                    && existingStatus !== 'active'
                    && JSON.stringify(existingStaffTypes) !== JSON.stringify(targetStaffTypes);
                const isNewAssignment = !existingAssignedStaffUserIds.has(normalizedUserId);
                if (!isExistingInviteUpdate && !isNewAssignment) {
                    return [];
                }
                return [{
                    userId: normalizedUserId,
                    type: 'STAFF' as const,
                    eventId,
                    staffTypes: targetStaffTypes,
                    replaceStaffTypes: true,
                }];
            }),
            ...unresolvedEmailInvites.map((invite) => ({
                firstName: invite.firstName,
                lastName: invite.lastName,
                email: invite.email,
                type: 'STAFF' as const,
                eventId,
                staffTypes: invite.roles.map(mapRoleToInviteStaffType),
                replaceStaffTypes: true,
            })),
        ];

        const result = payload.length > 0
            ? await userService.inviteUsersByEmail(currentUser.$id, payload)
            : { sent: [], not_sent: [], failed: [] };
        if ((result.failed || []).length > 0) {
            const message = 'Failed to create one or more staff invites.';
            setStaffInviteError(message);
            throw new Error(message);
        }

        const resolvedUserIds = new Set<string>();
        const inviteRolesByEmail = new Map(unresolvedEmailInvites.map((invite) => [invite.email, invite.roles] as const));
        const fetchedInvites = [...(result.sent || []), ...(result.not_sent || [])];
        fetchedInvites.forEach((invite) => {
            if (invite.userId) {
                resolvedUserIds.add(invite.userId);
            }
        });

        if (resolvedUserIds.size > 0) {
            try {
                const fetchedUsers = await userService.getUsersByIds(Array.from(resolvedUserIds));
                setEventData((prev) => {
                    const nextPositions = prev.officialPositions || [];
                    let nextEventOfficials = normalizeEventOfficials(
                        prev.eventOfficials,
                        getEventOfficialUserIds(prev.eventOfficials),
                        nextPositions,
                    );
                    const nextAssistantHostIds = new Set(prev.assistantHostIds || []);
                    const nextOfficials = [...(prev.officials || [])];
                    fetchedUsers.forEach((userEntry) => {
                        const matchingInvite = fetchedInvites.find((invite) => invite.userId === userEntry.$id || normalizeInviteEmail(invite.email) === getUserEmail(userEntry));
                        const roles = matchingInvite
                            ? (matchingInvite.staffTypes || [])
                                .map(mapInviteStaffTypeToRole)
                                .filter((role): role is StaffAssignmentRole => Boolean(role))
                            : inviteRolesByEmail.get(getUserEmail(userEntry) ?? '') || [];
                        if (roles.includes('OFFICIAL')) {
                            nextEventOfficials = normalizeEventOfficials(
                                nextEventOfficials.some((official) => official.userId === userEntry.$id)
                                    ? nextEventOfficials
                                    : [
                                        ...nextEventOfficials,
                                        {
                                            id: createClientId(),
                                            userId: userEntry.$id,
                                            positionIds: nextPositions.map((position) => position.id),
                                            fieldIds: [],
                                            isActive: true,
                                        } satisfies EventOfficial,
                                    ],
                                [],
                                nextPositions,
                            );
                            if (!nextOfficials.some((official) => official.$id === userEntry.$id)) {
                                nextOfficials.push(userEntry);
                            }
                        }
                        if (roles.includes('ASSISTANT_HOST') && userEntry.$id !== prev.hostId) {
                            nextAssistantHostIds.add(userEntry.$id);
                            cacheAssistantHostUser(userEntry);
                        }
                    });
                    return {
                        ...prev,
                        officials: nextOfficials,
                        eventOfficials: nextEventOfficials,
                        officialIds: getEventOfficialUserIds(nextEventOfficials),
                        assistantHostIds: Array.from(nextAssistantHostIds),
                    };
                });
            } catch (error) {
                console.warn('Failed to hydrate staff invite users:', error);
            }
        }

        const finalTargetUserIds = new Set<string>([
            ...getEventOfficialUserIds(eventData.eventOfficials),
            ...assistantHostValue,
            ...Array.from(resolvedUserIds),
        ]);
        const invitesToDelete = currentEventStaffInvites.filter((invite) => invite.userId && !finalTargetUserIds.has(invite.userId));
        if (invitesToDelete.length > 0) {
            const inviteIdsToDelete = invitesToDelete
                .map((invite) => normalizeEntityId(invite.$id))
                .filter((inviteId): inviteId is string => Boolean(inviteId));
            await Promise.all(inviteIdsToDelete.map((inviteId) => userService.deleteInviteById(inviteId)));
        }

        setPendingStaffInvites([]);
        setStaffInviteError(null);
    }, [
        assistantHostValue,
        cacheAssistantHostUser,
        currentEventStaffInvites,
        currentUser,
        eventData.eventOfficials,
        getValues,
        isOrganizationHostedEvent,
        setEventData,
        setPendingStaffInvites,
        validatePendingStaffInvites,
        existingAssignedStaffUserIds,
        currentEventStaffInviteByUserId,
    ]);
    const assignedOfficialCards = useMemo<AssignedStaffCard[]>(() => {
        const cards: AssignedStaffCard[] = getEventOfficialUserIds(eventData.eventOfficials).map((officialId) => {
            const official = (eventData.officials || []).find((candidate) => candidate.$id === officialId)
                ?? organizationOfficialsById.get(officialId)
                ?? nonOrgStaffResults.find((candidate) => candidate.$id === officialId)
                ?? null;
            const invite = currentEventStaffInviteByUserId.get(officialId);
            const inviteStatus = invite?.staffTypes?.includes('OFFICIAL') ? normalizeInviteStatusToken(invite.status) : null;
            return {
                key: `official:${officialId}`,
                role: 'OFFICIAL',
                userId: officialId,
                user: official,
                email: getUserEmail(official),
                displayName: toUserLabel(official ?? undefined, officialId),
                status: inviteStatus && inviteStatus !== 'active' ? inviteStatus : null,
                source: 'assigned',
            };
        });
        (eventData.pendingStaffInvites || []).forEach((invite) => {
            if (!invite.roles.includes('OFFICIAL')) {
                return;
            }
            cards.push({
                key: `draft-official:${invite.email}`,
                role: 'OFFICIAL',
                userId: null,
                user: null,
                email: invite.email,
                displayName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email,
                status: 'email_invite',
                source: 'draft',
            });
        });
        return cards;
    }, [currentEventStaffInviteByUserId, eventData.eventOfficials, eventData.pendingStaffInvites, eventData.officials, nonOrgStaffResults, organizationOfficialsById]);
    const assignedHostCards = useMemo<AssignedStaffCard[]>(() => {
        const cards: AssignedStaffCard[] = [];
        const primaryHostId = normalizeEntityId(eventData.hostId);
        if (primaryHostId) {
            const hostUser = assistantHostUsersById.get(primaryHostId) ?? organizationUsersById.get(primaryHostId) ?? null;
            cards.push({
                key: `host:${primaryHostId}`,
                role: 'HOST',
                userId: primaryHostId,
                user: (hostUser as UserData | null) ?? null,
                email: getUserEmail(hostUser),
                displayName: toUserLabel(hostUser ?? undefined, primaryHostId),
                status: null,
                source: 'assigned',
            });
        }
        assistantHostValue.forEach((assistantHostId) => {
            const assistantHost = assistantHostUsersById.get(assistantHostId) ?? organizationUsersById.get(assistantHostId) ?? null;
            const invite = currentEventStaffInviteByUserId.get(assistantHostId);
            const inviteStatus = invite?.staffTypes?.includes('HOST') ? normalizeInviteStatusToken(invite.status) : null;
            cards.push({
                key: `assistant-host:${assistantHostId}`,
                role: 'ASSISTANT_HOST',
                userId: assistantHostId,
                user: (assistantHost as UserData | null) ?? null,
                email: getUserEmail(assistantHost),
                displayName: toUserLabel(assistantHost ?? undefined, assistantHostId),
                status: inviteStatus && inviteStatus !== 'active' ? inviteStatus : null,
                source: 'assigned',
            });
        });
        (eventData.pendingStaffInvites || []).forEach((invite) => {
            if (!invite.roles.includes('ASSISTANT_HOST')) {
                return;
            }
            cards.push({
                key: `draft-assistant:${invite.email}`,
                role: 'ASSISTANT_HOST',
                userId: null,
                user: null,
                email: invite.email,
                displayName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email,
                status: 'email_invite',
                source: 'draft',
            });
        });
        return cards;
    }, [assistantHostUsersById, assistantHostValue, currentEventStaffInviteByUserId, eventData.hostId, eventData.pendingStaffInvites, organizationUsersById]);
    useEffect(() => {
        setOrganizationStaffVisibleCount(5);
    }, [filteredOrganizationStaffEntries.length, organizationStaffSearch, organizationStaffStatusFilter, organizationStaffTypeFilter]);
    useEffect(() => {
        setOfficialCardVisibleCount(5);
    }, [assignedOfficialCards.length]);
    useEffect(() => {
        setHostCardVisibleCount(5);
    }, [assignedHostCards.length]);

    // Normalizes slot state every time LeagueFields mutates the slot array so errors stay in sync.
    const updateLeagueSlots = useCallback((
        updater: (slots: LeagueSlotForm[]) => LeagueSlotForm[],
        options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        setLeagueSlots(prev => normalizeSlotState(updater(prev), eventData.eventType), options);
    }, [eventData.eventType, hasImmutableTimeSlots, setLeagueSlots]);

    const handleLeagueScoringConfigChange = useCallback(
        (key: keyof LeagueScoringConfig, value: LeagueScoringConfig[keyof LeagueScoringConfig]) => {
            const currentConfig = (
                getValues('leagueScoringConfig') as LeagueScoringConfig | undefined
            ) ?? eventData.leagueScoringConfig;
            const nextConfig = applyLeagueScoringConfigFieldChange(
                currentConfig,
                key,
                value,
                (config) => setValue('leagueScoringConfig', config, { shouldDirty: true, shouldValidate: false }),
            );
            setEventData(prev => ({
                ...prev,
                leagueScoringConfig: nextConfig,
            }));
        },
        [eventData.leagueScoringConfig, getValues, setEventData, setValue]
    );

    const handleMatchRulesOverrideChange = useCallback((nextValue: MatchRulesConfig | null) => {
        const sanitized = sanitizeMatchRulesOverrideForEditor(nextValue);
        setValue('matchRulesOverride', sanitized, { shouldDirty: true, shouldValidate: false });
        const template = (selectedSportForOfficials?.matchRulesTemplate ?? null) as MatchRulesConfig | null;
        const templateTimekeeping = template?.timekeeping ?? null;
        const overrideTimekeeping = sanitized?.timekeeping ?? null;
        const timerMode = overrideTimekeeping?.timerMode ?? templateTimekeeping?.timerMode;
        const segmentDuration = normalizeNumber(
            overrideTimekeeping?.segmentDurationMinutes
            ?? templateTimekeeping?.segmentDurationMinutes,
        );
        const segmentCount = normalizeNumber(template?.segmentCount)
            ?? (eventData.eventType === 'TOURNAMENT'
                ? normalizeNumber(tournamentData.winnerSetCount)
                : normalizeNumber(leagueData.setsPerMatch))
            ?? 1;
        if (timerMode === 'COUNT_UP' && segmentDuration && segmentCount > 0) {
            const totalMatchDuration = Math.max(1, Math.trunc(segmentDuration * segmentCount));
            if (eventData.eventType === 'LEAGUE') {
                setLeagueData((previous) => ({
                    ...previous,
                    usesSets: false,
                    matchDurationMinutes: totalMatchDuration,
                    setDurationMinutes: undefined,
                }));
            } else if (eventData.eventType === 'TOURNAMENT') {
                setTournamentData((previous) => ({
                    ...previous,
                    matchDurationMinutes: totalMatchDuration,
                    setDurationMinutes: undefined,
                }));
            }
        }
    }, [
        eventData.eventType,
        leagueData.setsPerMatch,
        selectedSportForOfficials,
        setLeagueData,
        setTournamentData,
        setValue,
        tournamentData.winnerSetCount,
    ]);

    const handleIncludePlayoffsToggle = useCallback((checked: boolean) => {
        if (!checked) {
            setLeagueData((prev) => ({
                ...prev,
                includePlayoffs: false,
                playoffTeamCount: undefined,
            }));
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
            return;
        }

        if (eventData.singleDivision) {
            const fallback = typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.maxParticipants || 2;
            setLeagueData((prev) => ({
                ...prev,
                includePlayoffs: true,
                playoffTeamCount: Math.max(2, Math.trunc(fallback)),
            }));
            return;
        }

        setLeagueData((prev) => ({
            ...prev,
            includePlayoffs: true,
            playoffTeamCount: typeof prev.playoffTeamCount === 'number'
                ? Math.max(2, Math.trunc(prev.playoffTeamCount))
                : Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        }));
    }, [eventData.maxParticipants, eventData.singleDivision, leagueData.playoffTeamCount, setLeagueData, setValue]);

    const updateSingleDivisionTournamentPoolDefaults = useCallback((
        updates: Partial<Pick<typeof divisionEditor, 'playoffTeamCount' | 'poolCount'>>,
    ) => {
        setDivisionEditor((prev) => ({
            ...prev,
            ...updates,
            error: null,
        }));

        if (!eventData.singleDivision || eventData.eventType !== 'TOURNAMENT' || !leagueData.includePlayoffs) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }

        const nextPlayoffTeamCount = Object.prototype.hasOwnProperty.call(updates, 'playoffTeamCount')
            ? updates.playoffTeamCount
            : singleDivisionPoolPlayDefaults.bracketTeams;
        const nextPoolCount = Object.prototype.hasOwnProperty.call(updates, 'poolCount')
            ? updates.poolCount
            : singleDivisionPoolPlayDefaults.poolCount;
        const normalizedMaxParticipants = Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const normalizedPlayoffTeamCount = typeof nextPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(nextPlayoffTeamCount))
            : undefined;
        const normalizedPoolCount = typeof nextPoolCount === 'number'
            ? Math.max(1, Math.trunc(nextPoolCount))
            : undefined;
        const normalizedPoolTeamCount = derivePoolTeamCount(normalizedMaxParticipants, normalizedPoolCount);

        const nextDetails = currentDetails.map((detail) => ({
            ...detail,
            maxParticipants: normalizedMaxParticipants,
            playoffTeamCount: normalizedPlayoffTeamCount,
            poolCount: normalizedPoolCount,
            poolTeamCount: normalizedPoolTeamCount,
        }));
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
        singleDivisionPoolPlayDefaults.bracketTeams,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    const resetDivisionEditor = useCallback(() => {
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? normalizeInstallmentAmounts(eventData.installmentAmounts)
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
            ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
            : [];
        setDivisionEditor({
            editingId: null,
            divisionKind: 'LEAGUE',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: Math.max(0, eventData.price || 0),
            maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                        ? firstDivisionDetailForDefaults.playoffTeamCount
                        : typeof leagueData.playoffTeamCount === 'number'
                        ? leagueData.playoffTeamCount
                        : eventData.maxParticipants || 2,
                ),
            ),
            poolCount: eventData.eventType === 'TOURNAMENT'
                && leagueData.includePlayoffs
                && typeof firstDivisionDetailForDefaults?.poolCount === 'number'
                ? Math.max(1, Math.trunc(firstDivisionDetailForDefaults.poolCount))
                : null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(playoffData),
            allowPaymentPlans: Boolean(eventData.allowPaymentPlans),
            installmentCount: eventData.allowPaymentPlans
                ? (eventData.installmentCount || defaultInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: defaultInstallmentDueDates,
            installmentDueRelativeDays: defaultInstallmentDueRelativeDays,
            installmentAmounts: defaultInstallmentAmounts,
            nameTouched: false,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.price,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        currentSportRequiresSets,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        leagueData,
        playoffData,
    ]);

    const handleDivisionEditorKindChange = useCallback((value: string | null) => {
        const nextKind: DivisionEditorKind = value === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE';
        if (nextKind === 'LEAGUE') {
            resetDivisionEditor();
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivision = createNextPlayoffDivision(currentPlayoffDivisions, playoffData);
        setDivisionEditor({
            editingId: null,
            divisionKind: 'PLAYOFF',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: nextPlayoffDivision.name,
            price: 0,
            maxParticipants: nextPlayoffDivision.maxParticipants,
            playoffTeamCount: null,
            poolCount: null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(nextPlayoffDivision.playoffConfig),
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            installmentAmounts: [],
            nameTouched: true,
            error: null,
        });
    }, [
        createNextPlayoffDivision,
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData,
        playoffData,
        resetDivisionEditor,
    ]);

    const setDivisionEditorPlayoffConfig = useCallback((updater: React.SetStateAction<TournamentConfig>) => {
        setDivisionEditor((prev) => {
            const previousConfig = buildTournamentConfig(prev.playoffConfig);
            const resolved = typeof updater === 'function'
                ? (updater as (previous: TournamentConfig) => TournamentConfig)(previousConfig)
                : updater;
            return {
                ...prev,
                playoffConfig: buildTournamentConfig(resolved),
                error: null,
            };
        });
    }, []);

    const setDivisionEditorLeagueConfig = useCallback((updates: Partial<LeagueConfig>) => {
        setDivisionEditor((prev) => ({
            ...prev,
            leagueConfig: normalizeLeagueConfigForSetMode(
                {
                    ...prev.leagueConfig,
                    ...updates,
                    includePlayoffs: prev.leagueConfig.includePlayoffs,
                    playoffTeamCount: prev.leagueConfig.playoffTeamCount,
                },
                currentSportRequiresSets,
            ),
            error: null,
        }));
    }, [currentSportRequiresSets]);

    useEffect(() => {
        if (splitDivisionEditorEnabled || divisionEditor.divisionKind !== 'PLAYOFF') {
            return;
        }
        resetDivisionEditor();
    }, [divisionEditor.divisionKind, resetDivisionEditor, splitDivisionEditorEnabled]);

    useEffect(() => {
        const isSingleDivision = Boolean(eventData.singleDivision);
        if (previousSingleDivisionRef.current === null) {
            previousSingleDivisionRef.current = isSingleDivision;
            return;
        }
        const wasSingleDivision = previousSingleDivisionRef.current;
        previousSingleDivisionRef.current = isSingleDivision;
        if (!wasSingleDivision || isSingleDivision) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            resetDivisionEditor();
            return;
        }

        const { details: nextDetails, changed } = applyEventDefaultsToDivisionDetails({
            details: currentDetails,
            defaultPrice: Number(eventData.price) || 0,
            defaultMaxParticipants: Number(eventData.maxParticipants) || 2,
            includePlayoffs: eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs,
            defaultPlayoffTeamCount: typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.eventType === 'TOURNAMENT' && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                    ? firstDivisionDetailForDefaults.playoffTeamCount
                    : typeof eventData.maxParticipants === 'number'
                    ? eventData.maxParticipants
                    : undefined,
            includeTournamentPoolPlay: eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs,
            defaultPoolCount: eventData.eventType === 'TOURNAMENT'
                ? firstDivisionDetailForDefaults?.poolCount ?? singleDivisionPoolPlayDefaults.poolCount
                : undefined,
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
        }
        resetDivisionEditor();
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.price,
        eventData.singleDivision,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        resetDivisionEditor,
        setValue,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    const getDivisionTypeNameForEditor = useCallback(
        (ratingType: 'AGE' | 'SKILL', divisionTypeId: string): string => {
            if (!divisionTypeId) {
                return '';
            }
            const fromCatalog = divisionTypeOptions.find((option) =>
                option.id === divisionTypeId && option.ratingType === ratingType,
            );
            if (fromCatalog) {
                return fromCatalog.name;
            }
            return getDivisionTypeById(
                resolveSportInput(eventData.sportConfig ?? eventData.sportId),
                divisionTypeId,
                ratingType,
            )?.name ?? divisionTypeId.toUpperCase();
        },
        [divisionTypeOptions, eventData.sportConfig, eventData.sportId],
    );

    const updateDivisionEditorSelection = useCallback((
        updates: Partial<Pick<typeof divisionEditor, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    ) => {
        setDivisionEditor((prev) => {
            const next = { ...prev, ...updates, error: null };
            if (Object.prototype.hasOwnProperty.call(updates, 'skillDivisionTypeId') && !updates.skillDivisionTypeId) {
                next.skillDivisionTypeId = '';
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'ageDivisionTypeId') && !updates.ageDivisionTypeId) {
                next.ageDivisionTypeId = '';
            }

            const hasRequiredFields = Boolean(next.gender && next.skillDivisionTypeId && next.ageDivisionTypeId);
            if (!hasRequiredFields) {
                next.name = '';
                next.nameTouched = false;
                return next;
            }

            next.name = buildDivisionName({
                gender: next.gender as 'M' | 'F' | 'C',
                sportInput: resolveSportInput(eventData.sportConfig ?? eventData.sportId),
                skillDivisionTypeId: next.skillDivisionTypeId,
                ageDivisionTypeId: next.ageDivisionTypeId,
            });
            next.nameTouched = false;
            return next;
        });
    }, [eventData.sportConfig, eventData.sportId]);

    const handleEditDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.divisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        const composite = parseCompositeDivisionTypeId(detail.divisionTypeId);
        const fallbackSelections = getDefaultDivisionTypeSelectionsForSport(
            resolveSportInput(eventData.sportConfig ?? eventData.sportId),
        );
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? normalizeInstallmentAmounts(eventData.installmentAmounts)
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
            ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
            : [];
        const detailAllowPaymentPlans = typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : Boolean(eventData.allowPaymentPlans);
        const detailInstallmentAmounts = detailAllowPaymentPlans
            ? ((detail.installmentAmounts?.length
                ? detail.installmentAmounts
                : defaultInstallmentAmounts).map((value) => normalizePriceCents(value)))
            : [];
        const detailInstallmentDueDates = detailAllowPaymentPlans
            ? (detail.installmentDueDates?.length
                ? [...detail.installmentDueDates]
                : defaultInstallmentDueDates)
            : [];
        const detailInstallmentDueRelativeDays = detailAllowPaymentPlans
            ? (detail.installmentDueRelativeDays?.length
                ? normalizeInstallmentRelativeDays(detail.installmentDueRelativeDays)
                : defaultInstallmentDueRelativeDays)
            : [];
        setDivisionEditor({
            editingId: detail.id,
            divisionKind: 'LEAGUE',
            gender: detail.gender,
            skillDivisionTypeId: detail.skillDivisionTypeId
                || composite?.skillDivisionTypeId
                || (detail.ratingType === 'SKILL' ? detail.divisionTypeId : fallbackSelections.skillDivisionTypeId),
            ageDivisionTypeId: detail.ageDivisionTypeId
                || composite?.ageDivisionTypeId
                || (detail.ratingType === 'AGE' ? detail.divisionTypeId : fallbackSelections.ageDivisionTypeId),
            name: detail.name,
            price: Math.max(0, detail.price || 0),
            maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    detail.playoffTeamCount
                        || detail.maxParticipants
                        || eventData.maxParticipants
                        || 2,
                ),
            ),
            poolCount: typeof detail.poolCount === 'number'
                ? Math.max(1, Math.trunc(detail.poolCount))
                : null,
            playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
            leagueConfig: buildDivisionLeagueConfig(detail, leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(detail.playoffConfig ?? playoffData),
            allowPaymentPlans: detailAllowPaymentPlans,
            installmentCount: detailAllowPaymentPlans
                ? (detail.installmentCount || detailInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: detailInstallmentDueDates,
            installmentDueRelativeDays: detailInstallmentDueRelativeDays,
            installmentAmounts: detailInstallmentAmounts,
            nameTouched: true,
            error: null,
        });
    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.sportConfig,
        eventData.sportId,
        currentSportRequiresSets,
        leagueData,
        playoffData,
    ]);

    const handleEditPlayoffDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.playoffDivisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        setDivisionEditor({
            editingId: detail.id,
            divisionKind: 'PLAYOFF',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: detail.name,
            price: 0,
            maxParticipants: normalizePlayoffDivisionParticipantCount(detail.maxParticipants),
            playoffTeamCount: null,
            poolCount: null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(detail.playoffConfig),
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            installmentAmounts: [],
            nameTouched: true,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData,
    ]);

    const handleRemoveDivisionDetail = useCallback((divisionId: string) => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDetails = currentDetails.filter((detail) => detail.id !== divisionId);
        const nextDivisionIds = nextDetails.map((detail) => detail.id);
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const cleanedFieldMap = Object.fromEntries(
            Object.entries(currentFieldMap).filter(([divisionKey]) => nextDivisionIds.includes(divisionKey)),
        );
        setValue('divisionFieldIds', cleanedFieldMap, { shouldDirty: true, shouldValidate: true });

        if (divisionEditor.editingId === divisionId) {
            resetDivisionEditor();
        }
    }, [
        divisionEditor.editingId,
        eventData.divisionDetails,
        getValues,
        resetDivisionEditor,
        setValue,
    ]);

    const handleSaveDivisionDetail = useCallback(() => {
        if (divisionEditor.divisionKind === 'PLAYOFF') {
            const name = divisionEditor.name.trim();
            const normalizedMaxParticipants = normalizePlayoffDivisionParticipantCount(divisionEditor.maxParticipants);

            if (!name.length) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Playoff division name is required.' }));
                return;
            }
            if (typeof normalizedMaxParticipants !== 'number' || normalizedMaxParticipants < 2) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: eventData.teamSignup
                        ? 'Playoff division teams count must be at least 2.'
                        : 'Playoff division participants count must be at least 2.',
                }));
                return;
            }

            const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
                ? [...eventData.playoffDivisionDetails]
                : [];
            const normalizedName = normalizeDivisionNameKey(name);
            const duplicateByName = currentPlayoffDivisions.find((detail) =>
                detail.id !== divisionEditor.editingId
                && normalizeDivisionNameKey(detail.name) === normalizedName,
            );
            if (duplicateByName) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Division name must be unique within this event.',
                }));
                return;
            }

            const existingDetail = divisionEditor.editingId
                ? currentPlayoffDivisions.find((detail) => detail.id === divisionEditor.editingId)
                : null;
            const defaultDetail = existingDetail ?? createNextPlayoffDivision(
                currentPlayoffDivisions,
                divisionEditor.playoffConfig,
            );
            const nextDetail: PlayoffDivisionDetailForm = {
                ...defaultDetail,
                name,
                maxParticipants: normalizedMaxParticipants,
                playoffConfig: buildTournamentConfig(divisionEditor.playoffConfig),
            };
            const nextPlayoffDivisions = existingDetail
                ? currentPlayoffDivisions.map((detail) => (
                    detail.id === existingDetail.id ? nextDetail : detail
                ))
                : [...currentPlayoffDivisions, nextDetail];

            setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });
            resetDivisionEditor();
            return;
        }

        const gender = divisionEditor.gender;
        const skillDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.skillDivisionTypeId);
        const ageDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.ageDivisionTypeId);
        const ratingType: 'SKILL' = 'SKILL';
        const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
        const skillDivisionTypeName = getDivisionTypeNameForEditor('SKILL', skillDivisionTypeId);
        const ageDivisionTypeName = getDivisionTypeNameForEditor('AGE', ageDivisionTypeId);
        const name = divisionEditor.name.trim();
        const rawNormalizedDivisionPrice = eventData.singleDivision
            ? Math.max(0, eventData.price || 0)
            : Math.max(0, divisionEditor.price || 0);
        const rawDivisionMaxParticipants = eventData.singleDivision
            ? eventData.maxParticipants
            : divisionEditor.maxParticipants;
        const isDivisionMaxParticipantsMissing = !eventData.singleDivision
            && typeof rawDivisionMaxParticipants !== 'number';
        const normalizedDivisionMaxParticipants = typeof rawDivisionMaxParticipants === 'number'
            ? Math.max(0, Math.trunc(rawDivisionMaxParticipants))
            : Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const rawDivisionPlayoffTeamCount = (() => {
            if (
                (eventData.eventType !== 'LEAGUE' && eventData.eventType !== 'TOURNAMENT')
                || !leagueData.includePlayoffs
            ) {
                return undefined;
            }
            if (eventData.eventType === 'LEAGUE' && eventData.singleDivision) {
                return typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants;
            }
            return divisionEditor.playoffTeamCount;
        })();
        const normalizedDivisionPlayoffTeamCount = typeof rawDivisionPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(rawDivisionPlayoffTeamCount))
            : undefined;
        const normalizedDivisionPoolCount = (
            eventData.eventType === 'TOURNAMENT'
            && leagueData.includePlayoffs
            && typeof divisionEditor.poolCount === 'number'
        )
            ? Math.max(1, Math.trunc(divisionEditor.poolCount))
            : undefined;
        const normalizedDivisionPoolTeamCount = eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs
            ? derivePoolTeamCount(normalizedDivisionMaxParticipants, normalizedDivisionPoolCount)
            : undefined;
        const normalizedDivisionAllowPaymentPlans = eventData.singleDivision
            ? Boolean(eventData.allowPaymentPlans)
            : Boolean(divisionEditor.allowPaymentPlans);
        const normalizedDivisionInstallmentAmounts = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? normalizeInstallmentAmounts(eventData.installmentAmounts)
                : normalizeInstallmentAmounts(divisionEditor.installmentAmounts))
            : [];
        const normalizedDivisionInstallmentDueDates = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? [...(eventData.installmentDueDates || [])]
                : [...(divisionEditor.installmentDueDates || [])])
            : [];
        const normalizedDivisionInstallmentDueRelativeDays = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
                : normalizeInstallmentRelativeDays(divisionEditor.installmentDueRelativeDays))
            : [];
        const normalizedDivisionInstallmentCount = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? (eventData.installmentCount || normalizedDivisionInstallmentAmounts.length || 0)
                : (divisionEditor.installmentCount || normalizedDivisionInstallmentAmounts.length || 0))
            : 0;
        const normalizedDivisionPrice = normalizedDivisionAllowPaymentPlans
            ? sumInstallmentAmounts(normalizedDivisionInstallmentAmounts)
            : rawNormalizedDivisionPrice;

        if (!gender || !skillDivisionTypeId || !ageDivisionTypeId) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: 'Select gender, skill division, and age division before adding.',
            }));
            return;
        }
        const divisionTypeName = buildDivisionName({
            gender,
            sportInput: resolveSportInput(eventData.sportConfig ?? eventData.sportId),
            skillDivisionTypeId,
            ageDivisionTypeId,
        });
        if (!name.length) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division name is required.' }));
            return;
        }
        if (isDivisionMaxParticipantsMissing) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: eventData.teamSignup
                    ? 'Division max teams is required.'
                    : 'Division max participants is required.',
            }));
            return;
        }
        if (!eventData.singleDivision && normalizedDivisionMaxParticipants < 2) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: eventData.teamSignup
                    ? 'Division max teams must be at least 2.'
                    : 'Division max participants must be at least 2.',
            }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && typeof rawDivisionPlayoffTeamCount !== 'number'
        ) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division playoff team count is required.' }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)
        ) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division playoff team count must be at least 2.' }));
            return;
        }
        if (eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs) {
            if (!(typeof normalizedDivisionPoolCount === 'number' && normalizedDivisionPoolCount >= 1)) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Pool count is required.' }));
                return;
            }
            if (!(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Bracket team count is required.' }));
                return;
            }
            if (normalizedDivisionMaxParticipants % normalizedDivisionPoolCount !== 0) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Division max teams must divide evenly by pool count.' }));
                return;
            }
            if (normalizedDivisionPlayoffTeamCount % normalizedDivisionPoolCount !== 0) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Bracket team count must divide evenly by pool count.' }));
                return;
            }
        }
        if (!eventData.singleDivision && normalizedDivisionAllowPaymentPlans) {
            if (!normalizedDivisionInstallmentAmounts.length) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Add at least one installment amount for this division.',
                }));
                return;
            }
            if (
                normalizedDivisionInstallmentCount > 0
                && normalizedDivisionInstallmentAmounts.length !== normalizedDivisionInstallmentCount
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Division installment count must match number of installment rows.',
                }));
                return;
            }
            if (
                eventData.eventType === 'WEEKLY_EVENT'
                && !eventData.parentEvent
                && normalizedDivisionInstallmentDueRelativeDays.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Each division installment amount needs a due date offset.',
                }));
                return;
            }
            if (
                !(eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent)
                && normalizedDivisionInstallmentDueDates.length
                && normalizedDivisionInstallmentDueDates.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Each division installment amount needs a due date.',
                }));
                return;
            }
        }

        const token = buildDivisionToken({ gender, ratingType, divisionTypeId });
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId) || undefined;
        const referenceDate = parseDateValue(eventData.start ?? null);

        const currentDetails = Array.isArray(eventData.divisionDetails) ? [...eventData.divisionDetails] : [];
        const existingDetail = divisionEditor.editingId
            ? currentDetails.find((detail) => detail.id === divisionEditor.editingId)
            : null;
        const normalizedName = normalizeDivisionNameKey(name);
        const duplicateByName = currentDetails.find((detail) =>
            detail.id !== divisionEditor.editingId
            && normalizeDivisionNameKey(detail.name) === normalizedName,
        );
        if (duplicateByName) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: 'Division name must be unique within this event.',
            }));
            return;
        }
        const nextId = existingDetail?.id ?? buildUniqueDivisionIdForToken({
            eventId: eventData.$id,
            token,
            existingDivisionIds: currentDetails.map((detail) => detail.id),
        });
        const normalizedPlacementMapping = (() => {
            if (
                eventData.eventType === 'LEAGUE'
                && leagueData.includePlayoffs
                && eventData.splitLeaguePlayoffDivisions
                && !eventData.singleDivision
                && typeof normalizedDivisionPlayoffTeamCount === 'number'
            ) {
                const mapping = normalizePlacementDivisionIds(divisionEditor.playoffPlacementDivisionIds)
                    .slice(0, normalizedDivisionPlayoffTeamCount);
                while (mapping.length < normalizedDivisionPlayoffTeamCount) {
                    mapping.push('');
                }
                return mapping;
            }
            return Array.isArray(existingDetail?.playoffPlacementDivisionIds)
                ? [...existingDetail.playoffPlacementDivisionIds]
                : [];
        })();
        const storesLeagueDivisionPlayoffConfig = (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !eventData.splitLeaguePlayoffDivisions
        );
        const storesTournamentDivisionConfig = (
            eventData.eventType === 'TOURNAMENT'
            && !eventData.singleDivision
        );
        const normalizedDivisionPlayoffConfig = storesLeagueDivisionPlayoffConfig
            ? normalizeTournamentConfigForSetMode(
                divisionEditor.playoffConfig,
                resolveTournamentSetMode(currentSportRequiresSets, divisionEditor.playoffConfig),
            )
            : undefined;
        const normalizedDivisionTournamentConfig = storesTournamentDivisionConfig
            ? normalizeTournamentConfigForSetMode(
                divisionEditor.playoffConfig,
                resolveTournamentSetMode(currentSportRequiresSets, divisionEditor.playoffConfig),
            )
            : undefined;

        const nextDetail = applyDivisionAgeCutoff({
            id: nextId,
            key: token,
            kind: 'LEAGUE',
            name,
            divisionTypeId,
            divisionTypeName,
            ratingType,
            gender,
            skillDivisionTypeId,
            skillDivisionTypeName,
            ageDivisionTypeId,
            ageDivisionTypeName,
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: normalizedDivisionPlayoffTeamCount,
            poolCount: normalizedDivisionPoolCount,
            poolTeamCount: normalizedDivisionPoolTeamCount,
            playoffPlacementDivisionIds: normalizedPlacementMapping,
            ...((eventData.eventType === 'LEAGUE' || (eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs))
                ? leagueConfigToDivisionFields(normalizeLeagueConfigForSetMode(divisionEditor.leagueConfig, currentSportRequiresSets))
                : {}),
            ...((normalizedDivisionPlayoffConfig || normalizedDivisionTournamentConfig)
                ? { playoffConfig: normalizedDivisionPlayoffConfig ?? normalizedDivisionTournamentConfig }
                : {}),
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans && !(eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent)
                ? normalizedDivisionInstallmentDueDates
                : [],
            installmentDueRelativeDays: normalizedDivisionAllowPaymentPlans && eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent
                ? normalizedDivisionInstallmentDueRelativeDays
                : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            sportId: sportInput,
            fieldIds: [],
        }, sportInput, referenceDate);

        let nextDetails: DivisionDetailForm[] = [];
        if (divisionEditor.editingId) {
            nextDetails = currentDetails.map((detail) =>
                detail.id === divisionEditor.editingId ? nextDetail : detail,
            );
        } else {
            nextDetails = [...currentDetails, nextDetail];
        }
        const nextDivisionIds = nextDetails.map((detail) => detail.id);

        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const remappedFieldMap: Record<string, string[]> = {};
        Object.entries(currentFieldMap).forEach(([divisionKey, fieldIds]) => {
            if (divisionEditor.editingId && divisionKey === divisionEditor.editingId) {
                remappedFieldMap[nextId] = Array.isArray(fieldIds) ? [...fieldIds] : [];
                return;
            }
            if (nextDivisionIds.includes(divisionKey)) {
                remappedFieldMap[divisionKey] = Array.isArray(fieldIds) ? [...fieldIds] : [];
            }
        });
        setValue('divisionFieldIds', remappedFieldMap, { shouldDirty: true, shouldValidate: true });
        if (!eventData.singleDivision) {
            setValue('price', normalizedDivisionPrice, { shouldDirty: true, shouldValidate: false });
            setValue('maxParticipants', normalizedDivisionMaxParticipants, { shouldDirty: true, shouldValidate: true });
            setValue('allowPaymentPlans', normalizedDivisionAllowPaymentPlans, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueRelativeDays', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueRelativeDays : [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [], { shouldDirty: true, shouldValidate: true });
            if (
                eventData.eventType === 'LEAGUE'
                && leagueData.includePlayoffs
                && typeof normalizedDivisionPlayoffTeamCount === 'number'
            ) {
                setLeagueData((prev) => ({
                    ...prev,
                    playoffTeamCount: normalizedDivisionPlayoffTeamCount,
                }), { shouldDirty: true, shouldValidate: true });
            }
        }
        setDivisionEditor({
            editingId: null,
            divisionKind: 'LEAGUE',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: typeof normalizedDivisionPlayoffTeamCount === 'number'
                ? normalizedDivisionPlayoffTeamCount
                : Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            poolCount: typeof normalizedDivisionPoolCount === 'number'
                ? normalizedDivisionPoolCount
                : null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(divisionEditor.leagueConfig, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(divisionEditor.playoffConfig),
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [],
            installmentDueRelativeDays: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueRelativeDays : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            nameTouched: false,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        divisionEditor,
        eventData.$id,
        eventData.divisionDetails,
        eventData.sportConfig,
        eventData.sportId,
        eventData.start,
        eventData.singleDivision,
        eventData.splitLeaguePlayoffDivisions,
        eventData.teamSignup,
        eventData.eventType,
        eventData.allowPaymentPlans,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.parentEvent,
        eventData.price,
        eventData.maxParticipants,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        playoffData,
        createNextPlayoffDivision,
        getDivisionTypeNameForEditor,
        getValues,
        resetDivisionEditor,
        setLeagueData,
        setValue,
        splitDivisionEditorEnabled,
    ]);

    const leagueDivisionEditorReady = Boolean(
        divisionEditor.gender
        && divisionEditor.skillDivisionTypeId
        && divisionEditor.ageDivisionTypeId,
    );
    const divisionEditorReady = leagueDivisionEditorReady;
    const divisionMaxParticipantsWarning = !eventData.singleDivision
        && typeof divisionEditor.maxParticipants === 'number'
        && divisionEditor.maxParticipants < 2
        ? (eventData.teamSignup
            ? 'Warning: make division max teams at least 2.'
            : 'Warning: make division max participants at least 2.')
        : null;

    useEffect(() => {
        if (sportsLoading) {
            return;
        }
        const selectedSportId = String(getValues('sportId') ?? '').trim();
        const currentSportConfig = getValues('sportConfig') as Sport | null | undefined;
        const currentSportConfigId = currentSportConfig && typeof currentSportConfig === 'object'
            ? String((currentSportConfig as any).$id ?? '')
            : '';

        if (!selectedSportId) {
            if (currentSportConfig) {
                setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
            }
            return;
        }

        const selected = sportsById.get(selectedSportId) ?? null;
        if (selected && currentSportConfigId !== selected.$id) {
            setValue('sportConfig', selected, { shouldDirty: false, shouldValidate: false });
            return;
        }
        if (!selected && currentSportConfig) {
            setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.sportId, getValues, setValue, sportsLoading, sportsById]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
            if (currentDivisionIds.length) {
                setValue('divisions', [], { shouldDirty: false, shouldValidate: true });
            }
            return;
        }

        const idsFromDetails = normalizeDivisionKeys(currentDetails.map((detail) => detail.id));
        const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
        if (!stringArraysEqual(idsFromDetails, currentDivisionIds)) {
            setValue('divisions', idsFromDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [eventData.$id, eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, getValues, setValue]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const referenceDate = parseDateValue(eventData.start ?? null);
        const nextDetails = currentDetails.map((detail) => applyDivisionAgeCutoff({
            ...detail,
            sportId: detail.sportId ?? (sportInput || undefined),
        }, sportInput, referenceDate));

        const changed = nextDetails.some((detail, index) => {
            const current = currentDetails[index];
            if (!current) {
                return true;
            }
            return detail.ageCutoffDate !== current.ageCutoffDate
                || detail.ageCutoffLabel !== current.ageCutoffLabel
                || detail.ageCutoffSource !== current.ageCutoffSource
                || detail.sportId !== current.sportId;
        });

        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, setValue]);

    useEffect(() => {
        const selectedDivisionKeys = slotDivisionKeys;
        if (!selectedDivisionKeys.length) {
            return;
        }
        const selectedDivisionSet = new Set(selectedDivisionKeys);
        const enforceAllSlotDivisions = Boolean(eventData.singleDivision);
        const hasMismatch = leagueSlots.some((slot) => {
            const currentRaw = normalizeDivisionKeys(slot.divisions);
            const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
            if (!stringArraysEqual(currentRaw, current)) {
                return true;
            }
            if (enforceAllSlotDivisions) {
                return !stringSetsEqual(current, selectedDivisionKeys);
            }
            const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
            return filtered.length === 0 || !stringArraysEqual(current, filtered);
        });
        if (!hasMismatch) {
            return;
        }
        updateLeagueSlots(
            (prev) =>
                prev.map((slot) => {
                    const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
                    const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
                    return {
                        ...slot,
                        divisions: enforceAllSlotDivisions
                            ? selectedDivisionKeys
                            : (filtered.length ? filtered : selectedDivisionKeys),
                    };
                }),
            { shouldDirty: false },
        );
    }, [eventData.singleDivision, leagueSlots, slotDivisionKeys, slotDivisionLookup, updateLeagueSlots]);

    useEffect(() => {
        if (eventData.eventType === 'LEAGUE') {
            return;
        }

        if (eventData.splitLeaguePlayoffDivisions) {
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: false, shouldValidate: true });
        }
        if ((eventData.playoffDivisionDetails || []).length > 0) {
            setValue('playoffDivisionDetails', [], { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        setValue,
    ]);

    useEffect(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                : 0;
            if (playoffTeamCount <= 0) {
                if (!Array.isArray(detail.playoffPlacementDivisionIds) || detail.playoffPlacementDivisionIds.length === 0) {
                    return detail;
                }
                changed = true;
                return {
                    ...detail,
                    playoffPlacementDivisionIds: [],
                };
            }
            const currentMapping = Array.isArray(detail.playoffPlacementDivisionIds)
                ? detail.playoffPlacementDivisionIds
                : [];
            const nextMapping = currentMapping.slice(0, playoffTeamCount);
            while (nextMapping.length < playoffTeamCount) {
                nextMapping.push('');
            }
            if (stringArraysEqual(currentMapping, nextMapping)) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || !eventData.singleDivision) {
            return;
        }
        if (typeof leagueData.playoffTeamCount === 'number' && leagueData.playoffTeamCount >= 2) {
            return;
        }
        const fallbackFromDivision = eventData.divisionDetails?.[0]?.playoffTeamCount
            ?? eventData.divisionDetails?.[0]?.maxParticipants
            ?? eventData.maxParticipants
            ?? 2;
        setLeagueData((prev) => ({
            ...prev,
            playoffTeamCount: Math.max(2, Math.trunc(fallbackFromDivision)),
        }), { shouldDirty: false });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        setLeagueData,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || eventData.singleDivision) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            if (typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffTeamCount: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
        setLeagueData((prev) => {
            const normalized = normalizeLeagueConfigForSetMode(prev, requiresSets);
            return leagueConfigEqual(prev, normalized) ? prev : normalized;
        }, { shouldDirty: false });
    }, [eventData.sportConfig, eventData.sportId, setLeagueData, sportsById]);

    useEffect(() => {
        setDivisionEditor((prev) => {
            if (prev.divisionKind !== 'LEAGUE') {
                return prev;
            }
            const normalized = normalizeLeagueConfigForSetMode(prev.leagueConfig, currentSportRequiresSets);
            if (leagueConfigEqual(prev.leagueConfig, normalized)) {
                return prev;
            }
            return {
                ...prev,
                leagueConfig: normalized,
            };
        });
    }, [currentSportRequiresSets]);

    useEffect(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
        if (requiresSets) {
            return;
        }

        const normalizedPlayoff = normalizeTournamentConfigForSetMode(playoffData, false);
        if (!tournamentConfigEqual(playoffData, normalizedPlayoff)) {
            setPlayoffData(normalizedPlayoff, { shouldDirty: false });
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        if (!currentPlayoffDivisions.length) {
            const currentLeagueDivisions = Array.isArray(eventData.divisionDetails)
                ? eventData.divisionDetails
                : [];
            let leagueChanged = false;
            const nextLeagueDivisions = currentLeagueDivisions.map((division) => {
                if (!division.playoffConfig) {
                    return division;
                }
                const previousConfig = buildTournamentConfig(division.playoffConfig);
                const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
                if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                    return division;
                }
                leagueChanged = true;
                return {
                    ...division,
                    playoffConfig: normalizedConfig,
                };
            });

            if (leagueChanged) {
                setValue('divisionDetails', nextLeagueDivisions, { shouldDirty: false, shouldValidate: true });
            }
            return;
        }

        let changed = false;
        const nextPlayoffDivisions = currentPlayoffDivisions.map((division) => {
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            changed = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });

        if (changed) {
            setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: false, shouldValidate: true });
        }

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails)
            ? eventData.divisionDetails
            : [];
        let leagueChanged = false;
        const nextLeagueDivisions = currentLeagueDivisions.map((division) => {
            if (!division.playoffConfig) {
                return division;
            }
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            leagueChanged = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });

        if (leagueChanged) {
            setValue('divisionDetails', nextLeagueDivisions, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.playoffDivisionDetails,
        eventData.sportConfig,
        eventData.sportId,
        playoffData,
        setPlayoffData,
        setValue,
        sportsById,
    ]);

    useEffect(() => {
        if (!hasRestrictedImmutableFields) {
            return;
        }
        setFields(sanitizeFieldsForForm(immutableFields), { shouldDirty: false });
    }, [hasRestrictedImmutableFields, immutableFields, setFields]);

    // When provisioning local fields, mirror count changes into the generated list.
    useEffect(() => {
        const previousEventLocation = previousEventFieldLocationRef.current;
        const eventFieldLocation = defaultFieldLocationForEvent(eventData.location);
        previousEventFieldLocationRef.current = eventFieldLocation;

        if (!shouldManageLocalFields) {
            return;
        }
        setFields(prev => {
            const retainedFields = prev.filter((field) => !isEventLocalField(field));
            const normalizedLocalFields: Field[] = prev
                .filter(isEventLocalField)
                .slice(0, fieldCount)
                .map((field) => withEventFieldLocationDefault(
                    field,
                    eventFieldLocation,
                    previousEventLocation,
                ));

            if (normalizedLocalFields.length < fieldCount) {
                for (let index = normalizedLocalFields.length; index < fieldCount; index += 1) {
                    normalizedLocalFields.push({
                        $id: createClientId(),
                        name: `Field ${index + 1}`,
                        location: eventFieldLocation,
                        lat: 0,
                        long: 0,
                    } as Field);
                }
            }

            return [...retainedFields, ...normalizedLocalFields];
        }, { shouldDirty: false });
    }, [eventData.location, fieldCount, shouldManageLocalFields, setFields]);

    // For non-organization events with existing facilities, seed the field list with event ordering.
    useEffect(() => {
        if (shouldManageLocalFields || isOrganizationManagedEvent || !activeEditingEvent?.fields?.length) {
            return;
        }
        const sorted = sortFieldsByCreatedAt(sanitizeFieldsForForm(activeEditingEvent.fields));
        setFields(sorted, { shouldDirty: false });
    }, [activeEditingEvent?.fields, isOrganizationManagedEvent, setFields, shouldManageLocalFields]);

    useEffect(() => {
        const availableFields = isOrganizationHostedEvent && supportsOrganizationFieldSelection
            ? fields.filter((field) => isSelectableOrganizationResource(field, organizationHostedEventId))
            : fields;
        const availableFieldIds = toFieldIdList(availableFields);
        const rentalSelectorFieldIds = rentalResourceOptions
            .map((option) => normalizeResourceText(option.selectorId))
            .filter(Boolean);
        const pendingRentalSelectorFieldIds = rentalResourcesLoading || rentalResourceOptions.length === 0
            ? selectedFieldIds.filter(isRentalBookingSelectorId)
            : [];
        const allowed = new Set([...availableFieldIds, ...rentalSelectorFieldIds, ...pendingRentalSelectorFieldIds]);
        const normalizedSelected = Array.from(
            new Set(
                selectedFieldIds
                    .map((fieldId) => String(fieldId))
                    .filter((fieldId) => allowed.has(fieldId)),
            ),
        );
        if (!stringArraysEqual(selectedFieldIds, normalizedSelected)) {
            setValue('selectedFieldIds', normalizedSelected, { shouldDirty: false, shouldValidate: true });
        }
    }, [fields, isOrganizationHostedEvent, organizationHostedEventId, rentalResourceOptions, rentalResourcesLoading, selectedFieldIds, setValue, supportsOrganizationFieldSelection]);

    useEffect(() => {
        const divisionKeys = normalizeDivisionKeys(eventData.divisions);
        const availableFieldIds = toFieldIdList(fields);

        const nextDivisionFieldIds = normalizeDivisionFieldIds(
            divisionFieldIds,
            divisionKeys,
            availableFieldIds,
        );

        if (!divisionFieldIdsEqual(divisionFieldIds, nextDivisionFieldIds)) {
            setValue('divisionFieldIds', nextDivisionFieldIds, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        divisionFieldIds,
        eventData.divisions,
        fields,
        setValue,
    ]);

    // Clear slot field references that point to fields no longer selected/available.
    useEffect(() => {
        const availableFieldIds = toFieldIdList(fields);
        if (!availableFieldIds.length) {
            return;
        }
        const validIds = new Set(availableFieldIds);

        const hasInvalidSlots = leagueSlots.some((slot) => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            return slotFieldIds.some((fieldId) => !validIds.has(fieldId));
        });
        if (!hasInvalidSlots) {
            return;
        }

        updateLeagueSlots(prev => prev.map(slot => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            const nextFieldIds = slotFieldIds.filter((fieldId) => validIds.has(fieldId));
            if (stringSetsEqual(slotFieldIds, nextFieldIds)) {
                return slot;
            }
            return {
                ...slot,
                scheduledFieldId: nextFieldIds[0],
                scheduledFieldIds: nextFieldIds,
            };
        }), { shouldDirty: false });
    }, [fields, leagueSlots, updateLeagueSlots]);

    useEffect(() => {
        if (hasImmutableTimeSlots) {
            return;
        }

        let payload: SlotConflictPayload;
        try {
            payload = JSON.parse(slotConflictCheckKey) as SlotConflictPayload;
        } catch {
            return;
        }

        const clearConflicts = () => {
            setLeagueSlots((prev) => {
                let changed = false;
                const next = prev.map((slot) => {
                    if (!slot.conflicts.length && slot.checking === false) {
                        return slot;
                    }
                    changed = true;
                    return {
                        ...slot,
                        conflicts: [],
                        checking: false,
                    };
                });
                return changed ? next : prev;
            }, { shouldDirty: false });
        };

        if (!supportsScheduleSlotsForEvent(payload.eventType, payload.parentEvent) || payload.slots.length === 0) {
            clearConflicts();
            return;
        }

        const context: SlotConflictContext = {
            eventId: payload.eventId,
            eventStart: payload.eventStart,
            eventEnd: payload.eventEnd,
        };
        const slotForms = payload.slots.map((slot) => snapshotToSlotForm(slot));
        const eligibleSlots = slotForms.filter((slot) => slotCanCheckExternalConflicts(slot, context));
        const fieldIds = Array.from(
            new Set(
                eligibleSlots.flatMap((slot) => normalizeSlotFieldIds(slot)),
            ),
        );
        if (!fieldIds.length) {
            clearConflicts();
            return;
        }

        const requestId = slotConflictRequestRef.current + 1;
        slotConflictRequestRef.current = requestId;
        setLeagueSlots((prev) => {
            let changed = false;
            const next = prev.map((slot) => {
                const shouldCheck = slotCanCheckExternalConflicts(slot, context);
                if (slot.checking === shouldCheck) {
                    return slot;
                }
                changed = true;
                return {
                    ...slot,
                    checking: shouldCheck,
                };
            });
            return changed ? next : prev;
        }, { shouldDirty: false });

        let cancelled = false;
        const loadConflicts = async () => {
            try {
                const blockingByFieldRows = await Promise.all(fieldIds.map(async (fieldId) => {
                    const blocking = await eventService.getBlockingForFieldInRange(
                        fieldId,
                        CONFLICT_LOOKUP_START,
                        CONFLICT_LOOKUP_END,
                        {
                            organizationId: resolvedOrganizationId || undefined,
                            excludeEventId: context.eventId || undefined,
                        },
                    );
                    return [fieldId, blocking] as const;
                }));
                if (cancelled || slotConflictRequestRef.current !== requestId) {
                    return;
                }

                const eventsByFieldId = new Map(
                    blockingByFieldRows.map(([fieldId, blocking]) => [fieldId, blocking.events]),
                );
                const conflictsBySlotKey = new Map(
                    slotForms.map((slot) => [
                        slot.key,
                        slotCanCheckExternalConflicts(slot, context)
                            ? buildExternalSlotConflicts(slot, eventsByFieldId, context)
                            : [],
                    ]),
                );

                setLeagueSlots((prev) => {
                    let changed = false;
                    const next = prev.map((slot) => {
                        const nextConflicts = conflictsBySlotKey.get(slot.key) ?? [];
                        if (slot.checking === false && slotConflictsEqual(slot.conflicts, nextConflicts)) {
                            return slot;
                        }
                        changed = true;
                        return {
                            ...slot,
                            conflicts: nextConflicts,
                            checking: false,
                        };
                    });
                    return changed ? next : prev;
                }, { shouldDirty: false });
            } catch (error) {
                if (cancelled || slotConflictRequestRef.current !== requestId) {
                    return;
                }
                console.warn('Failed to load event scheduling conflicts:', error);
                setLeagueSlots((prev) => {
                    let changed = false;
                    const next = prev.map((slot) => {
                        if (slot.checking === false && slot.conflicts.length === 0) {
                            return slot;
                        }
                        changed = true;
                        return {
                            ...slot,
                            conflicts: [],
                            checking: false,
                        };
                    });
                    return changed ? next : prev;
                }, { shouldDirty: false });
            }
        };

        void loadConflicts();

        return () => {
            cancelled = true;
        };
    }, [hasImmutableTimeSlots, resolvedOrganizationId, setLeagueSlots, slotConflictCheckKey]);

    // Adds a blank slot row in the LeagueFields list when the user taps "Add Timeslot".
    const handleAddSlot = () => {
        if (hasImmutableTimeSlots) {
            return;
        }
        clearErrors('leagueSlots');
        updateLeagueSlots(prev => [...prev, createSlotForm(undefined, slotDivisionKeys)]);
    };

    // Drops a specific slot by index, leaving at least one slot for the scheduler UI to edit.
    const handleRemoveSlot = (index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        updateLeagueSlots(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, idx) => idx !== index);
        });
    };

    // Applies granular updates coming back from LeagueFields inputs before revalidating the array.
    const handleUpdateSlot = (index: number, updates: Partial<LeagueSlotForm>) => {
        const isDivisionOnlyUpdate = Object.keys(updates).every((key) => key === 'divisions');
        const isResourceOnlyUpdate = Object.keys(updates).every((key) => (
            key === 'scheduledFieldId'
            || key === 'scheduledFieldIds'
            || key === 'sourceType'
            || key === 'rentalBookingId'
            || key === 'rentalBookingItemId'
            || key === 'rentalLocked'
            || key === 'price'
            || key === 'requiredTemplateIds'
            || key === 'hostRequiredTemplateIds'
            || key === 'error'
        ));
        const allowRentalDivisionEditOnLockedSlots = hasExternalRentalField && !eventData.singleDivision;
        const allowRentalResourceEditOnLockedSlots = hasExternalRentalField && isResourceOnlyUpdate;
        const allowUpdateOnLockedSlots = hasImmutableTimeSlots && (
            (allowRentalDivisionEditOnLockedSlots && isDivisionOnlyUpdate)
            || allowRentalResourceEditOnLockedSlots
        );
        if (hasImmutableTimeSlots && !allowUpdateOnLockedSlots) {
            return;
        }
        const current = leagueSlots[index];
        if (!current) return;

        const updated: LeagueSlotForm = {
            ...current,
            ...updates,
        };
        const normalizedDays = normalizeWeekdays(updated);
        const normalizedFieldIds = normalizeSlotFieldIds(updated);
        const selectedDivisionKeys = slotDivisionKeys;
        const normalizedDivisions = normalizeSlotDivisionKeysWithLookup(updated.divisions, slotDivisionLookup);
        const normalizedStartDate = formatLocalDateTime(updated.startDate ?? null);
        const normalizedEndDate = formatLocalDateTime(updated.endDate ?? null);
        updated.scheduledFieldId = normalizedFieldIds[0];
        updated.scheduledFieldIds = normalizedFieldIds;
        updated.divisions = eventData.singleDivision
            ? selectedDivisionKeys
            : (normalizedDivisions.length ? normalizedDivisions : selectedDivisionKeys);
        updated.startDate = normalizedStartDate || undefined;
        updated.endDate = normalizedEndDate || undefined;

        const repeating = updated.repeating !== false;
        if (repeating) {
            const parsedStart = parseLocalDateTime(updated.startDate ?? null);
            const parsedEnd = parseLocalDateTime(updated.endDate ?? null);
            const nextDays = normalizedDays.length
                ? normalizedDays
                : parsedStart
                    ? [((parsedStart.getDay() + 6) % 7)]
                    : [];
            if (nextDays.length) {
                updated.dayOfWeek = nextDays[0] as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = nextDays as LeagueSlotForm['daysOfWeek'];
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
            }

            if (!Number.isFinite(updated.startTimeMinutes) && parsedStart) {
                updated.startTimeMinutes = parsedStart.getHours() * 60 + parsedStart.getMinutes();
            }
            if (!Number.isFinite(updated.endTimeMinutes) && parsedEnd) {
                updated.endTimeMinutes = parsedEnd.getHours() * 60 + parsedEnd.getMinutes();
            }
        } else {
            let slotStart = parseLocalDateTime(updated.startDate ?? null);
            let slotEnd = parseLocalDateTime(updated.endDate ?? null);
            if (!slotStart) {
                const fallbackEventStart = parseLocalDateTime(eventData.start ?? null);
                if (fallbackEventStart) {
                    slotStart = fallbackEventStart;
                }
            }
            if (!slotEnd && slotStart) {
                const fallbackEventEnd = parseLocalDateTime(eventData.end ?? null);
                if (fallbackEventEnd && fallbackEventEnd.getTime() > slotStart.getTime()) {
                    slotEnd = fallbackEventEnd;
                } else {
                    const startMinutes = Number.isFinite(updated.startTimeMinutes) ? Number(updated.startTimeMinutes) : null;
                    const endMinutes = Number.isFinite(updated.endTimeMinutes) ? Number(updated.endTimeMinutes) : null;
                    const durationMinutes = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
                        ? endMinutes - startMinutes
                        : 60;
                    slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
                }
            }

            if (slotStart) {
                const dayOfWeek = ((slotStart.getDay() + 6) % 7);
                updated.dayOfWeek = dayOfWeek as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = [dayOfWeek] as LeagueSlotForm['daysOfWeek'];
                updated.startDate = formatLocalDateTime(slotStart);
                updated.startTimeMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
                updated.startDate = undefined;
                updated.startTimeMinutes = undefined;
            }

            if (slotEnd) {
                updated.endDate = formatLocalDateTime(slotEnd);
                updated.endTimeMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
            } else {
                updated.endDate = undefined;
                updated.endTimeMinutes = undefined;
            }
        }

        if (allowUpdateOnLockedSlots) {
            setLeagueSlots(prev => {
                const next = [...prev];
                next[index] = updated;
                return normalizeSlotState(next, eventData.eventType);
            });
        } else {
            updateLeagueSlots(prev => {
                const next = [...prev];
                next[index] = updated;
                return next;
            });
        }

        clearErrors('leagueSlots');
    };

    const handleAutoResolveSlotConflict = (index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }

        const slot = leagueSlots[index];
        if (!slot || slot.conflicts.length === 0) {
            return;
        }

        const context: SlotConflictContext = {
            eventId: activeEditingEvent?.$id ?? eventData.$id ?? '',
            eventStart: eventData.start ?? undefined,
            eventEnd: eventData.end ?? undefined,
        };
        const updates = buildAutoResolvedSlotUpdate(slot, context);
        if (!updates) {
            return;
        }

        handleUpdateSlot(index, updates);
    };

    // Updates locally managed event fields without mutating reusable organization fields.
    const handleLocalFieldNameChange = useCallback((fieldId: string, name: string) => {
        if (!shouldManageLocalFields || hasRestrictedImmutableFields) {
            return;
        }
        setFields(prev => {
            return prev.map((field) => (
                field.$id === fieldId && isEventLocalField(field)
                    ? { ...field, name }
                    : field
            ));
        });
    }, [hasRestrictedImmutableFields, setFields, shouldManageLocalFields]);

    // Hydrate schedule state and slots when opening the modal for an existing event.
    useEffect(() => {
        if (isEditMode) {
            return;
        }
        if (hasImmutableTimeSlots) {
            return;
        }
        if (activeEditingEvent && supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)) {
            if (activeEditingEvent.eventType === 'LEAGUE' || activeEditingEvent.eventType === 'TOURNAMENT') {
                const source = activeEditingEvent.leagueConfig || activeEditingEvent;
                const includePlayoffsOrPools = Boolean((source as any)?.includePlayoffsOrPools ?? source?.includePlayoffs);
                setLeagueData({
                    gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                    includePlayoffs: includePlayoffsOrPools,
                    playoffTeamCount: source?.playoffTeamCount ?? undefined,
                    usesSets: source?.usesSets ?? false,
                    matchDurationMinutes: normalizeNumber(source?.matchDurationMinutes),
                    restTimeMinutes: normalizeNumber(source?.restTimeMinutes, 0) ?? 0,
                    setDurationMinutes: normalizeNumber(source?.setDurationMinutes),
                    setsPerMatch: normalizeNumber(source?.setsPerMatch),
                    pointsToVictory: Array.isArray(source?.pointsToVictory) ? source.pointsToVictory as number[] : undefined,
                }, { shouldDirty: false });

                if (activeEditingEvent.eventType === 'LEAGUE' && activeEditingEvent.includePlayoffs) {
                    const extractedPlayoff = extractTournamentConfigFromEvent(activeEditingEvent);
                    if (extractedPlayoff) {
                        setPlayoffData(extractedPlayoff, { shouldDirty: false });
                    } else {
                        setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
                    }
                } else {
                    setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
                }
            } else {
                setLeagueData({
                    gamesPerOpponent: 1,
                    includePlayoffs: false,
                    playoffTeamCount: undefined,
                    usesSets: false,
                    matchDurationMinutes: 60,
                    restTimeMinutes: 0,
                    setDurationMinutes: undefined,
                    setsPerMatch: undefined,
                }, { shouldDirty: false });
                setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
            }

            const fallbackFieldId = activeEditingEvent.fields?.[0]?.$id;
            const activeEventSlotsForEditor = supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)
                ? (activeEditingEvent.timeSlots || []).filter((slot) => !isRentalLockedTimeSlot(slot))
                : (activeEditingEvent.timeSlots || []);
            const slots = mergeSlotPayloadsForForm(activeEventSlotsForEditor, fallbackFieldId)
                .map((slot) => createSlotForm(
                    slot,
                    slotDivisionKeysRef.current,
                    activeEditingEvent.start,
                    activeEditingEvent.end,
                ));

            const initialSlots = slots.length > 0
                ? slots
                : [createSlotForm(undefined, slotDivisionKeysRef.current)];
            setLeagueSlots(normalizeSlotState(initialSlots, activeEditingEvent.eventType), { shouldDirty: false });
        } else if (!activeEditingEvent) {
            setLeagueData({
                gamesPerOpponent: 1,
                includePlayoffs: false,
                playoffTeamCount: undefined,
                usesSets: false,
                matchDurationMinutes: 60,
                    restTimeMinutes: 0,
                    setDurationMinutes: undefined,
                    setsPerMatch: undefined,
                }, { shouldDirty: false });
            setLeagueSlots(normalizeSlotState([createSlotForm(undefined, slotDivisionKeysRef.current)], 'EVENT'), { shouldDirty: false });
            setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
        }
    }, [activeEditingEvent, createSlotForm, hasImmutableTimeSlots, isEditMode, setLeagueData, setLeagueSlots, setPlayoffData]);

    useEffect(() => {
        if (!hasImmutableTimeSlots) {
            return;
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        const slotForms = mergeSlotPayloadsForForm(immutableTimeSlots, fallbackFieldId)
            .map((slot) => createSlotForm(
                slot,
                slotDivisionKeysRef.current,
                eventData.start,
                eventData.end,
            ));
        const normalizedSlots = normalizeSlotState(slotForms, eventData.eventType);
        setLeagueSlots((prev) => (leagueSlotsEqual(prev, normalizedSlots) ? prev : normalizedSlots), { shouldDirty: false });
    }, [
        hasImmutableTimeSlots,
        immutableTimeSlots,
        immutableFields,
        createSlotForm,
        eventData.eventType,
        eventData.start,
        eventData.end,
        setLeagueSlots,
    ]);

    useEffect(() => {
        const previousMode = previousEditableScheduleModeRef.current;
        previousEditableScheduleModeRef.current = eventSupportsScheduleSlots;
        if (previousMode === null || previousMode === eventSupportsScheduleSlots || !eventSupportsScheduleSlots) {
            return;
        }
        if (!rentalLockedSlotsForDraft.length) {
            return;
        }

        const dateValuesMatch = (left?: string | null, right?: string | null): boolean => {
            const parsedLeft = parseLocalDateTime(left ?? null);
            const parsedRight = parseLocalDateTime(right ?? null);
            if (!parsedLeft && !parsedRight) {
                return true;
            }
            return Boolean(parsedLeft && parsedRight && parsedLeft.getTime() === parsedRight.getTime());
        };

        const slotMatchesLockedRental = (slot: LeagueSlotForm, lockedSlot: TimeSlot): boolean => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            const lockedFieldIds = normalizeSlotFieldIds(lockedSlot);
            if (!slotFieldIds.length || !stringSetsEqual(slotFieldIds, lockedFieldIds)) {
                return false;
            }
            if (dateValuesMatch(slot.startDate, lockedSlot.startDate) && dateValuesMatch(slot.endDate, lockedSlot.endDate)) {
                return true;
            }
            return slot.startTimeMinutes === lockedSlot.startTimeMinutes
                && slot.endTimeMinutes === lockedSlot.endTimeMinutes
                && normalizeWeekdays(slot).some((day) => normalizeWeekdays(lockedSlot).includes(day));
        };

        setLeagueSlots((previousSlots) => {
            const seededFromRentalDefaults = previousSlots.length > 0
                && previousSlots.every((slot) => rentalLockedSlotsForDraft.some((lockedSlot) => (
                    slotMatchesLockedRental(slot, lockedSlot)
                )));
            if (!seededFromRentalDefaults) {
                return previousSlots;
            }
            return normalizeSlotState(
                [createSlotForm(undefined, slotDivisionKeysRef.current, eventData.start, eventData.end, eventData.timeZone)],
                eventData.eventType,
                eventData.parentEvent,
            );
        }, { shouldDirty: false });
    }, [
        createSlotForm,
        eventData.end,
        eventData.eventType,
        eventData.parentEvent,
        eventData.start,
        eventData.timeZone,
        eventSupportsScheduleSlots,
        rentalLockedSlotsForDraft,
        setLeagueSlots,
    ]);

    // Pull the organization's full field list so timeslot field options are complete in edit/create mode.
    useEffect(() => {
        let cancelled = false;

        if (isEditMode) {
            return () => {
                cancelled = true;
            };
        }

        if (hasRestrictedImmutableFields) {
            return () => {
                cancelled = true;
            };
        }

        if (!organizationHostedEventId) {
            return () => {
                cancelled = true;
            };
        }

        const hydrateOrganizationFields = async () => {
            const seededFields = Array.isArray(resolvedOrganization?.fields)
                ? sortFieldsByCreatedAt(sanitizeFieldsForForm(resolvedOrganization.fields as Field[]))
                : [];
            if (seededFields.length) {
                setFields(
                    (prev) => mergeOrganizationFieldsIntoPool(prev, seededFields, organizationHostedEventId),
                    { shouldDirty: false, shouldValidate: false },
                );
                setFieldsLoading(false);
                return;
            }

            try {
                setFieldsLoading(true);
                const fetchedOrganization = await (
                    organizationService.getOrganizationByIdForEventForm
                        ? organizationService.getOrganizationByIdForEventForm(organizationHostedEventId)
                        : organizationService.getOrganizationById(organizationHostedEventId, true)
                );
                if (cancelled) return;
                if (fetchedOrganization) {
                    setHydratedOrganization(fetchedOrganization);
                }

                let resolvedFields = Array.isArray(fetchedOrganization?.fields)
                    ? sortFieldsByCreatedAt(sanitizeFieldsForForm(fetchedOrganization.fields as Field[]))
                    : seededFields;
                if (!resolvedFields.length) {
                    const fallbackOrganizationId = fetchedOrganization?.$id
                        ?? resolvedOrganization?.$id
                        ?? organizationHostedEventId;
                    if (fallbackOrganizationId) {
                        const fetchedFields = await fieldService.listFields({ organizationId: fallbackOrganizationId });
                        if (cancelled) return;
                        resolvedFields = sortFieldsByCreatedAt(sanitizeFieldsForForm(fetchedFields));
                    }
                }
                if (resolvedFields.length) {
                    setFields(
                        (prev) => mergeOrganizationFieldsIntoPool(prev, resolvedFields, organizationHostedEventId),
                        { shouldDirty: false, shouldValidate: false },
                    );
                } else {
                    setFields(
                        (prev) => removeOrganizationFieldsFromPool(prev, organizationHostedEventId),
                        { shouldDirty: false, shouldValidate: false },
                    );
                }
            } catch (error) {
                console.warn('Failed to hydrate organization fields for event form:', error);
            } finally {
                if (!cancelled) {
                    setFieldsLoading(false);
                }
            }
        };

        hydrateOrganizationFields();

        return () => {
            cancelled = true;
        };
    }, [
        resolvedOrganizationFieldSignature,
        hasRestrictedImmutableFields,
        isEditMode,
        organizationHostedEventId,
        setFields,
    ]);

    // Merge any newly loaded fields from the event into local state without losing existing edits.
    useEffect(() => {
        if (isEditMode) {
            return;
        }
        if (hasRestrictedImmutableFields) {
            return;
        }
        if (activeEditingEvent?.fields) {
            setFields(prev => {
                const map = new Map<string, Field>();
                const incoming = sanitizeFieldsForForm(activeEditingEvent.fields as Field[]);
                [...prev, ...incoming].forEach(field => {
                    if (field?.$id) {
                        map.set(field.$id, field);
                    }
                });
                return Array.from(map.values());
            }, { shouldDirty: false });
        }
    }, [activeEditingEvent?.fields, hasRestrictedImmutableFields, isEditMode, setFields]);

    // Re-run slot normalization when the modal switches event types (e.g., league -> tournament).
    useEffect(() => {
        updateLeagueSlots(prev => prev, { shouldDirty: false });
    }, [eventData.eventType, updateLeagueSlots]);

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));
    const rentalResourceFields = useMemo(
        () => mergeFieldsById([], rentalResourceOptions.map((option) => option.field)),
        [rentalResourceOptions],
    );
    const rentalResourceSelectorFields = useMemo(
        () => mergeFieldsById([], rentalResourceOptions.map((option) => option.selectorField)),
        [rentalResourceOptions],
    );
    const rentalResourceOptionsBySelectorId = useMemo(() => (
        new Map(rentalResourceOptions.map((option) => [option.selectorId, option] as const))
    ), [rentalResourceOptions]);
    const rentalResourceOptionsByFieldId = useMemo(() => {
        const byFieldId = new Map<string, RentalBookingResourceOption[]>();
        rentalResourceOptions.forEach((option) => {
            const fieldId = normalizeResourceText(option.fieldId);
            if (!fieldId) {
                return;
            }
            byFieldId.set(fieldId, [...(byFieldId.get(fieldId) ?? []), option]);
        });
        return byFieldId;
    }, [rentalResourceOptions]);
    const selectedRentalResourceOptions = useMemo(() => (
        Array.from(
            new Map(
                selectedFieldIds
                    .flatMap((fieldId) => {
                        const selectorOption = rentalResourceOptionsBySelectorId.get(fieldId);
                        if (selectorOption) {
                            return [selectorOption];
                        }
                        return rentalResourceOptionsByFieldId.get(fieldId) ?? [];
                    })
                    .map((option) => [option.id, option] as const),
            ).values(),
        )
    ), [rentalResourceOptionsByFieldId, rentalResourceOptionsBySelectorId, selectedFieldIds]);
    const selectedRentalFieldIds = useMemo(
        () => Array.from(new Set(selectedRentalResourceOptions.map((option) => option.fieldId))),
        [selectedRentalResourceOptions],
    );
    const selectedRentedFieldIds = useMemo(() => {
        if (!organizationHostedEventId || selectedFieldIds.length === 0) {
            return selectedRentalFieldIds;
        }
        const selectedFieldIdSet = new Set(selectedFieldIds.map(normalizeResourceText).filter(Boolean));
        const sourceFields = mergeFieldsById(
            mergeFieldsById(fields, Array.isArray(activeEditingEvent?.fields) ? activeEditingEvent.fields : []),
            mergeFieldsById(immutableFields, rentalResourceFields),
        );
        const externalSelectedIds = sourceFields
            .filter((field): field is Field & { $id: string } => (
                typeof field?.$id === 'string'
                && selectedFieldIdSet.has(normalizeResourceText(field.$id))
                && isRentedResourceForOrganization(field, organizationHostedEventId)
            ))
            .map((field) => field.$id);
        return Array.from(new Set([...selectedRentalFieldIds, ...externalSelectedIds]));
    }, [
        activeEditingEvent?.fields,
        fields,
        immutableFields,
        organizationHostedEventId,
        rentalResourceFields,
        selectedFieldIds,
        selectedRentalFieldIds,
    ]);
    const fieldById = useMemo(() => (
        new Map(fields.map((field) => [normalizeResourceText(field.$id), field] as const))
    ), [fields]);
    const hasSelectedRentalResource = useMemo(() => (
        selectedFieldIds.some((fieldId) => {
            if (isRentalBookingSelectorId(fieldId)) {
                return true;
            }
            const field = fieldById.get(normalizeResourceText(fieldId));
            return field ? isRentedResourceForOrganization(field, organizationHostedEventId) : false;
        })
    ), [fieldById, organizationHostedEventId, selectedFieldIds]);
    const selectedRentalLockedSlots = useMemo(() => (
        selectedRentalResourceOptions
            .map((option) => buildRentalBookingTimeSlot(option, slotDivisionKeys, eventData.timeZone))
            .filter((slot): slot is TimeSlot => Boolean(slot))
    ), [eventData.timeZone, selectedRentalResourceOptions, slotDivisionKeys]);
    const selectedFields = useMemo(() => {
        return fields;
    }, [fields]);
    const organizationResourcePool = useMemo(() => {
        const selectedResourceIds = new Set(selectedFieldIds.map(normalizeResourceText).filter(Boolean));
        const baseFields = organizationHostedEventId
            ? fields.filter((field) => isSelectableOrganizationResource(field, organizationHostedEventId))
                .filter((field) => {
                    if (!isRentedResourceForOrganization(field, organizationHostedEventId)) {
                        return true;
                    }
                    return selectedResourceIds.has(normalizeResourceText(field.$id));
                })
            : [];
        return rentalResourceFields.length
            ? mergeFieldsById(baseFields, rentalResourceSelectorFields)
            : baseFields;
    }, [fields, organizationHostedEventId, rentalResourceFields.length, rentalResourceSelectorFields, selectedFieldIds]);
    const eventLocalFields = useMemo(
        () => fields.filter(isEventLocalField),
        [fields],
    );
    const leagueFieldOptions = useMemo(() => {
        const rentalResourceFieldIds = new Set(
            rentalResourceOptions.map((option) => normalizeResourceText(option.fieldId)).filter(Boolean),
        );
        const regularOptions = selectedFields
            .filter((field): field is Field & { $id: string } => {
                if (typeof field.$id !== 'string' || field.$id.length === 0) {
                    return false;
                }
                const marker = field as { rentalResource?: boolean; _rentalResource?: boolean };
                return !marker.rentalResource
                    && !marker._rentalResource
                    && !rentalResourceFieldIds.has(field.$id);
            })
            .map((field) => ({
                value: field.$id,
                fieldId: field.$id,
                label: getFieldDisplayName(field, 'Resource'),
            }));
        const rentalOptions = rentalResourceOptions
            .map((option) => {
                return {
                    value: option.selectorId,
                    fieldId: option.fieldId,
                    label: option.label,
                    rentalBookingId: option.bookingId,
                    rentalBookingItemId: option.bookingItemId,
                    rentalStart: option.start,
                    rentalEnd: option.end,
                    rentalTimeZone: option.timeZone ?? null,
                    rentalPriceCents: option.priceCents ?? null,
                    rentalRequiredTemplateIds: option.requiredTemplateIds ?? [],
                    rentalHostRequiredTemplateIds: option.hostRequiredTemplateIds ?? [],
                };
            });
        return [...regularOptions, ...rentalOptions];
    }, [rentalResourceOptions, selectedFields]);

    const eventOrganizationId = organizationHostedEventId;

    const hasExternalRentalField = useMemo(() => {
        const sourceFields = fields.length ? fields : (activeEditingEvent?.fields ?? []);
        const referencedFieldIds = new Set<string>();
        sourceFields.forEach((field) => {
            if (typeof field?.$id === 'string' && field.$id.trim().length > 0) {
                referencedFieldIds.add(field.$id.trim());
            }
        });
        normalizeFieldIds(activeEditingEvent?.fieldIds).forEach((fieldId) => referencedFieldIds.add(fieldId));
        normalizeFieldIds(eventData.selectedFieldIds).forEach((fieldId) => referencedFieldIds.add(fieldId));
        immutableFields.forEach((field) => {
            if (typeof field?.$id === 'string' && field.$id.trim().length > 0) {
                referencedFieldIds.add(field.$id.trim());
            }
        });
        (activeEditingEvent?.timeSlots ?? []).forEach((slot) => {
            normalizeSlotFieldIds(slot).forEach((fieldId) => referencedFieldIds.add(fieldId));
        });

        return hasExternalRentalFieldForEvent({
            eventOrganizationId,
            sourceFields,
            organizationFieldIds: [
                ...normalizeFieldIds((resolvedOrganization?.fields ?? []).map((field) => field?.$id)),
            ],
            referencedFieldIds: Array.from(referencedFieldIds),
            isEditMode,
        });
    }, [
        activeEditingEvent?.fieldIds,
        activeEditingEvent?.fields,
        activeEditingEvent?.timeSlots,
        eventData.selectedFieldIds,
        eventOrganizationId,
        fields,
        immutableFields,
        isEditMode,
        resolvedOrganization?.fields,
    ]);
    const restrictLocalFieldCreationForRentalEvent = eventData.eventType === 'EVENT' && (
        hasSelectedRentalResource
        || hasImmutableTimeSlots
        || Boolean(rentalPurchase?.fieldId)
        || (activeEditingEvent?.timeSlots ?? []).some(isRentalLockedTimeSlot)
    );
    const showLocalFieldCreationControls = shouldManageLocalFields && !restrictLocalFieldCreationForRentalEvent;

    useEffect(() => {
        const fallbackFieldId = immutableFields[0]?.$id || (activeEditingEvent?.fields?.[0] as Field | undefined)?.$id;
        const existingLockedSlots = hasExternalRentalField
            ? (activeEditingEvent?.timeSlots ?? [])
                .map((slot) => {
                    if (!slot || slot.rentalLocked !== true) return null;
                    const { event: _ignored, ...rest } = slot as any;
                    const normalized: TimeSlot = {
                        ...rest,
                        sourceType: rest.sourceType ?? 'RENTAL_BOOKING',
                        rentalLocked: true,
                        scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                        scheduledFieldIds: normalizeSlotFieldIds({
                            scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                            scheduledFieldIds: rest.scheduledFieldIds,
                        }),
                    };
                    return normalized;
                })
                .filter((slot): slot is TimeSlot => Boolean(slot))
            : [];
        const mergedByKey = new Map<string, TimeSlot>();
        [...existingLockedSlots, ...selectedRentalLockedSlots].forEach((slot) => {
            const key = slot.rentalBookingItemId
                || `${slot.rentalBookingId ?? ''}:${normalizeSlotFieldIds(slot).join(',')}:${slot.startDate ?? ''}:${slot.endDate ?? ''}`
                || slot.$id;
            mergedByKey.set(key, slot);
        });
        const nextSlots = Array.from(mergedByKey.values()).sort((left, right) => {
            const startCompare = String(left.startDate ?? '').localeCompare(String(right.startDate ?? ''));
            if (startCompare !== 0) return startCompare;
            return normalizeSlotFieldIds(left).join('|').localeCompare(normalizeSlotFieldIds(right).join('|'));
        });
        setRentalLockedTimeSlots((previous) => (timeSlotsEqual(previous, nextSlots) ? previous : nextSlots));
    }, [
        activeEditingEvent?.fields,
        activeEditingEvent?.timeSlots,
        hasExternalRentalField,
        immutableFields,
        selectedRentalLockedSlots,
    ]);

    useEffect(() => {
        if (!eventData.singleDivision || hasExternalRentalField) {
            return;
        }
        if (!eventData.splitLeaguePlayoffDivisions) {
            return;
        }
        setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: false, shouldValidate: true });
    }, [eventData.singleDivision, eventData.splitLeaguePlayoffDivisions, hasExternalRentalField, setValue]);

    const fieldsReferencedInSlots = useMemo(() => {
        const availableFields = selectedFields;
        if (!leagueSlots.length) {
            if (availableFields.length) {
                return availableFields;
            }
            return hasRestrictedImmutableFields ? immutableFields : ([] as Field[]);
        }

        const fieldMap = new Map<string, Field>();
        availableFields.forEach(field => {
            if (field?.$id) {
                fieldMap.set(field.$id, field);
            }
        });

        const seen = new Set<string>();
        const picked: Field[] = [];

        leagueSlots.forEach(slot => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            slotFieldIds.forEach((slotFieldId) => {
                if (seen.has(slotFieldId)) {
                    return;
                }
                const resolved = fieldMap.get(slotFieldId);
                if (resolved) {
                    picked.push(resolved);
                }
                seen.add(slotFieldId);
            });
        });

        if (!picked.length && availableFields.length) {
            return availableFields;
        }

        if (!picked.length && hasRestrictedImmutableFields) {
            return immutableFields;
        }

        return picked;
    }, [hasRestrictedImmutableFields, immutableFields, leagueSlots, selectedFields]);

    const selectedImageId = eventData.imageId;
    const selectedImageUrl = useMemo(
        () => (selectedImageId ? getEventImageUrl({ imageId: selectedImageId, width: 800 }) : ''),
        [selectedImageId],
    );

    const eventTypeOptions = useMemo(
        () => [
            { value: 'EVENT', label: 'Event' },
            { value: 'TOURNAMENT', label: 'Tournament' },
            { value: 'LEAGUE', label: 'League' },
            ...(isRentalCreateFlow ? [] : [{ value: 'WEEKLY_EVENT', label: 'Weekly Event' }]),
        ],
        [isRentalCreateFlow],
    );
    const supportsNoFixedEndDateTime = supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    useEffect(() => {
        if (!isRentalCreateFlow) {
            return;
        }
        if (eventData.eventType === 'WEEKLY_EVENT') {
            setValue('eventType', 'EVENT', { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, isRentalCreateFlow, setValue]);
    useEffect(() => {
        if (isEditMode || hasExternalRentalField) {
            return;
        }
        if (!supportsNoFixedEndDateTime) {
            return;
        }
        if (!eventData.noFixedEndDateTime) {
            setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, eventData.parentEvent, hasExternalRentalField, isEditMode, setValue, supportsNoFixedEndDateTime]);

    useEffect(() => {
        if ((eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT') &&
            !eventData.teamSignup) {
            setEventData(prev => {
                if (prev.teamSignup) {
                    return prev;
                }
                return {
                    ...prev,
                    teamSignup: true,
                };
            }, { shouldDirty: false });
        }
    }, [eventData.eventType, eventData.teamSignup, setEventData]);

    

    // Prevents the creator from joining twice when they toggle team-based registration on.
    useEffect(() => {
        if (eventData.teamSignup && joinAsParticipant) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup, joinAsParticipant, setJoinAsParticipant]);

    // Populate human-readable location if empty
    // Converts coordinates into a city/state label when the user hasn't typed an address manually.
    useEffect(() => {
        const lat = getLatitudeFromCoordinates(eventData.coordinates);
        const lng = getLongitudeFromCoordinates(eventData.coordinates);
        const hasCoords = coordinatesAreSet(eventData.coordinates);

        if (!isEditMode && eventData.location.trim().length === 0 && hasCoords && typeof lat === 'number' && typeof lng === 'number') {
            locationService.reverseGeocode(lat, lng)
                .then(info => {
                    const label = [info.city, info.state].filter(Boolean).join(', ')
                        || `${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}`;
                    setEventData(prev => ({ ...prev, location: label }));
                })
                .catch(() => { /* ignore */ });
        }
    }, [isEditMode, eventData.location, eventData.coordinates, setEventData]);

    const leagueWarning = (() => {
        if (hasPendingExternalConflictChecks) {
            return 'Checking field conflicts for timeslots. You can still save while this warning check finishes.';
        }
        if (hasExternalSlotConflictWarnings) {
            return 'Timeslot field conflicts are warnings. The scheduler will avoid overlaps when building matches, but review or auto resolve the affected slots if needed.';
        }
        return null;
    })();

    const leagueError = (() => {
        const issue = errors.leagueSlots;
        if (!issue) {
            return null;
        }
        const message = typeof issue.message === 'string' ? issue.message : null;
        return message && message.trim().length > 0
            ? message
            : 'Please resolve schedule timeslot issues before submitting.';
    })();

    // Launches the Stripe onboarding flow before allowing event owners to set paid pricing.
    const handleConnectStripe = async () => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;
        try {
            setConnectingStripe(true);
            const origin = resolveClientPublicOrigin();
            if (!origin) {
                console.error('Unable to determine public URL for Stripe onboarding.');
                return;
            }
            const refreshUrl = `${origin}/discover?stripe=refresh`;
            const returnUrl = `${origin}/discover?stripe=return`;
            const result = await paymentService.connectStripeAccount({
                user: currentUser,
                refreshUrl,
                returnUrl,
            });
            if (result?.onboardingUrl) {
                window.location.href = result.onboardingUrl;
            }
        } catch (error) {
            console.error('Failed to connect Stripe account:', error);
        } finally {
            setConnectingStripe(false);
        }
    };

    // Builds the event payload used for draft updates.
    const buildDraftEvent = useCallback((formValues?: EventFormValues): Partial<Event> => {
        const source = formValues ?? eventData;
        const finalImageId = source.imageId;
        const sportSelection = source.sportConfig;
        const selectedSportId = source.sportId?.trim() || '';
        const fallbackSportId = (sportSelection?.$id && String(sportSelection.$id)) || '';
        const sportId = selectedSportId || fallbackSportId;
        const resolvedSport = resolveDraftSportForScoring({
            sportId,
            sportConfig: sportSelection,
            sportsById,
        });
        const baseCoordinates: [number, number] = source.coordinates;
        const toIdList = <T extends { $id?: string | undefined }>(items: T[] | undefined): string[] => {
            if (!Array.isArray(items)) {
                return [];
            }
            return items
                .map((item) => {
                    if (item && typeof item === 'object' && item.$id) {
                        return String(item.$id);
                    }
                    return '';
                })
                .filter((id): id is string => id.length > 0);
        };

        const pricingEnabled = hasStripeAccount;
        const eventAllowPaymentPlans = pricingEnabled ? Boolean(source.allowPaymentPlans) : false;
        const installmentAmountsCents = eventAllowPaymentPlans
            ? normalizeInstallmentAmounts(source.installmentAmounts)
            : [];
        const eventPriceCents = pricingEnabled
            ? (eventAllowPaymentPlans ? sumInstallmentAmounts(installmentAmountsCents) : normalizePriceCents(source.price))
            : 0;
        const minAge = normalizeNumber(source.minAge);
        const maxAge = normalizeNumber(source.maxAge);
        const sportInput = resolveSportInput(resolvedSport ?? sportId);
        const divisionReferenceDate = parseDateValue(source.start ?? null);
        const normalizedDivisionDetails = (() => {
            const fromDetails = Array.isArray(source.divisionDetails)
                ? source.divisionDetails
                    .map((entry) => normalizeDivisionDetailEntry(
                        entry,
                        source.$id,
                        sportInput,
                        divisionReferenceDate,
                    ))
                    .filter((entry): entry is DivisionDetailForm => Boolean(entry))
                : [];
            if (fromDetails.length) {
                return fromDetails;
            }
            const fromIds = normalizeDivisionKeys(source.divisions).map((divisionId) => {
                const inferred = inferDivisionDetails({
                    identifier: divisionId,
                    sportInput,
                });
                const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(sportInput);
                const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
                const skillDivisionTypeId = composite?.skillDivisionTypeId
                    ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
                const ageDivisionTypeId = composite?.ageDivisionTypeId
                    ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
                const skillDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    skillDivisionTypeId,
                    'SKILL',
                )?.name ?? defaultsForSport.skillDivisionTypeName;
                const ageDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    ageDivisionTypeId,
                    'AGE',
                )?.name ?? defaultsForSport.ageDivisionTypeName;
                const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
                const divisionTypeName = buildDivisionName({
                    gender: inferred.gender,
                    sportInput,
                    skillDivisionTypeId,
                    ageDivisionTypeId,
                });
                const token = buildDivisionToken({
                    gender: inferred.gender,
                    ratingType: 'SKILL',
                    divisionTypeId,
                });
                return applyDivisionAgeCutoff({
                    id: divisionId,
                    key: token,
                    kind: 'LEAGUE',
                    name: divisionTypeName,
                    divisionTypeId,
                    divisionTypeName,
                    ratingType: 'SKILL',
                    gender: inferred.gender,
                    skillDivisionTypeId,
                    skillDivisionTypeName,
                    ageDivisionTypeId,
                    ageDivisionTypeName,
                    price: eventPriceCents,
                    maxParticipants: Math.max(2, Math.trunc(source.maxParticipants || 2)),
                    playoffTeamCount: Number.isFinite(source.leagueData?.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined,
                    playoffPlacementDivisionIds: [],
                    allowPaymentPlans: eventAllowPaymentPlans,
                    installmentCount: eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0,
                    installmentDueDates: eventAllowPaymentPlans && !(source.eventType === 'WEEKLY_EVENT' && !source.parentEvent)
                        ? [...(source.installmentDueDates || [])]
                        : [],
                    installmentDueRelativeDays: eventAllowPaymentPlans && source.eventType === 'WEEKLY_EVENT' && !source.parentEvent
                        ? normalizeInstallmentRelativeDays(source.installmentDueRelativeDays)
                        : [],
                    installmentAmounts: eventAllowPaymentPlans
                        ? normalizeInstallmentAmounts(source.installmentAmounts)
                        : [],
                    sportId: sportInput || undefined,
                    fieldIds: [],
                } satisfies DivisionDetailForm, sportInput, divisionReferenceDate);
            });
            if (fromIds.length) {
                return fromIds;
            }
            return [];
        })();
        const normalizedDivisionKeys = (() => {
            const normalized = normalizeDivisionKeys(normalizedDivisionDetails.map((detail) => detail.id));
            if (normalized.length) {
                return normalized;
            }
            return normalizeDivisionKeys(source.divisions);
        })();
        const sportRequiresSets = Boolean(resolvedSport?.usePointsPerSetWin);
        const tournamentRequiresSets = resolveTournamentSetMode(
            sportRequiresSets,
            source.tournamentData,
        );
        const playoffRequiresSets = resolveTournamentSetMode(
            sportRequiresSets,
            source.playoffData,
        );
        const splitLeaguePlayoffDivisions = Boolean(
            source.eventType === 'LEAGUE'
            && source.leagueData.includePlayoffs
            && source.splitLeaguePlayoffDivisions,
        );
        const tournamentPoolPlayEnabled = isTournamentPoolPlayFormEnabled(
            source.eventType,
            Boolean(source.leagueData.includePlayoffs),
        );
        const singleDivisionEnabled = Boolean(source.singleDivision);
        const tournamentBracketConfig = normalizeTournamentConfigForSetMode(
            source.tournamentData,
            tournamentRequiresSets,
        );
        const normalizedTournamentPoolBracketDetails: PlayoffDivisionDetailForm[] = tournamentPoolPlayEnabled
            ? normalizedDivisionDetails.map((detail) => {
                const maxParticipants = singleDivisionEnabled
                    ? Math.max(2, Math.trunc(source.maxParticipants || detail.maxParticipants || 2))
                    : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2));
                const poolCount = Number.isFinite(detail.poolCount)
                    ? Math.max(1, Math.trunc(detail.poolCount as number))
                    : undefined;
                return {
                    ...detail,
                    kind: 'PLAYOFF' as const,
                    maxParticipants,
                    playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                        ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                        : undefined,
                    poolCount,
                    poolTeamCount: derivePoolTeamCount(maxParticipants, poolCount),
                    playoffPlacementDivisionIds: [],
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? tournamentBracketConfig,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? tournamentBracketConfig,
                        ),
                    ),
                };
            })
            : [];
        const normalizedPlayoffDivisionDetails = splitLeaguePlayoffDivisions
            ? (source.playoffDivisionDetails || [])
                .map((entry) => normalizePlayoffDivisionDetailEntry(
                    entry,
                    source.$id,
                    source.playoffData,
                    sportInput,
                    divisionReferenceDate,
                ))
                .filter((entry): entry is PlayoffDivisionDetailForm => Boolean(entry))
            : tournamentPoolPlayEnabled
                ? normalizedTournamentPoolBracketDetails
            : [];
        const slotDivisionLookupForDraft = buildSlotDivisionLookup(
            normalizedDivisionDetails,
            splitLeaguePlayoffDivisions ? normalizedPlayoffDivisionDetails : [],
        );
        const normalizedDivisionDetailsForPayload = normalizedDivisionDetails.map((detail) => ({
            ...detail,
            kind: 'LEAGUE' as const,
            price: pricingEnabled
                ? (
                    singleDivisionEnabled
                        ? eventPriceCents
                        : Boolean(detail.allowPaymentPlans)
                            ? sumInstallmentAmounts(detail.installmentAmounts)
                            : normalizePriceCents(detail.price)
                )
                : 0,
            maxParticipants: singleDivisionEnabled
                ? Math.max(2, Math.trunc(source.maxParticipants || 2))
                : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2)),
            playoffTeamCount: (() => {
                if (source.eventType !== 'LEAGUE' || !source.leagueData.includePlayoffs) {
                    return undefined;
                }
                if (singleDivisionEnabled && !splitLeaguePlayoffDivisions) {
                    return Number.isFinite(source.leagueData.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined;
                }
                return Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined;
            })(),
            playoffPlacementDivisionIds: (() => {
                if (!splitLeaguePlayoffDivisions) {
                    return [] as string[];
                }
                const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                    : 0;
                const mapping = normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds);
                if (playoffTeamCount <= 0) {
                    return mapping;
                }
                return mapping.slice(0, playoffTeamCount);
            })(),
            ...((source.eventType === 'LEAGUE' || (source.eventType === 'TOURNAMENT' && source.leagueData.includePlayoffs))
                ? leagueConfigToDivisionFields(
                    singleDivisionEnabled
                        ? normalizeLeagueConfigForSetMode(source.leagueData, sportRequiresSets)
                        : buildDivisionLeagueConfig(detail, source.leagueData, sportRequiresSets),
                )
                : {}),
            ...(source.eventType === 'LEAGUE'
                && source.leagueData.includePlayoffs
                && !singleDivisionEnabled
                && !splitLeaguePlayoffDivisions
                ? {
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? source.playoffData,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? source.playoffData,
                        ),
                    ),
                }
                : {}),
            ...(source.eventType === 'TOURNAMENT' && !singleDivisionEnabled
                ? {
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? source.tournamentData,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? source.tournamentData,
                        ),
                    ),
                }
                : {}),
            allowPaymentPlans: pricingEnabled
                ? (
                    singleDivisionEnabled
                        ? eventAllowPaymentPlans
                        : Boolean(detail.allowPaymentPlans)
                )
                : false,
            installmentCount: (() => {
                if (!pricingEnabled) {
                    return 0;
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0;
                }
                if (!detail.allowPaymentPlans) {
                    return 0;
                }
                return detail.installmentCount || detail.installmentAmounts.length || 0;
            })(),
            installmentAmounts: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans
                        ? normalizeInstallmentAmounts(source.installmentAmounts)
                        : [];
                }
                if (!detail.allowPaymentPlans) {
                    return [];
                }
                return normalizeInstallmentAmounts(detail.installmentAmounts);
            })(),
            installmentDueDates: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans ? [...(source.installmentDueDates || [])] : [];
                }
                if (!detail.allowPaymentPlans) {
                    return [];
                }
                return Array.isArray(detail.installmentDueDates) ? [...detail.installmentDueDates] : [];
            })(),
        }));

        const organizationAssignments = isOrganizationHostedEvent
            ? sanitizeOrganizationEventAssignments(
                {
                    hostId: source.hostId || currentUser?.$id || null,
                    assistantHostIds: source.assistantHostIds || [],
                    officialIds: getEventOfficialUserIds(source.eventOfficials),
                },
                {
                    ownerId: resolvedOrganization?.ownerId,
                    staffMembers: resolvedOrganization?.staffMembers,
                    staffInvites: resolvedOrganization?.staffInvites,
                },
            )
            : null;
        const normalizedHostId = (
            organizationAssignments?.hostId
            || normalizeEntityId(source.hostId)
            || normalizeEntityId(currentUser?.$id)
            || ''
        );
        const normalizedAssistantHostIds = organizationAssignments
            ? organizationAssignments.assistantHostIds
            : Array.from(
                new Set(
                    (source.assistantHostIds || [])
                        .map((id) => String(id))
                    .filter((id) => id.length > 0 && id !== normalizedHostId),
                ),
            );
        const normalizedOfficialPositionsForPayload = normalizeEventOfficialPositions(
            source.officialPositions,
            normalizeSportOfficialPositionTemplates(resolvedSport?.officialPositionTemplates),
        );
        const normalizedEventOfficials = normalizeEventOfficials(
            source.eventOfficials,
            Array.isArray(source.eventOfficials) ? [] : source.officialIds || [],
            normalizedOfficialPositionsForPayload,
        ).filter((official) => (
            organizationAssignments ? organizationAssignments.officialIds.includes(official.userId) : true
        ));
        const normalizedOfficialIds = getEventOfficialUserIds(normalizedEventOfficials);
        const officialPoolById = new Map<string, UserData>();
        (source.officials || []).forEach((official) => {
            if (official?.$id) {
                officialPoolById.set(official.$id, official);
            }
        });
        if (isOrganizationHostedEvent) {
            organizationOfficialsById.forEach((official, id) => {
                officialPoolById.set(id, official);
            });
        }
        const normalizedOfficials = normalizedOfficialIds
            .map((id) => officialPoolById.get(id))
            .filter((official): official is UserData => Boolean(official));
        const normalizedEnd = (() => {
            if (typeof source.end === 'string') {
                const trimmed = source.end.trim();
                return trimmed.length > 0 ? trimmed : null;
            }
            return source.end ?? null;
        })();
        const eventFieldLocation = defaultFieldLocationForEvent(source.location);
        const previousEventFieldLocation = previousEventFieldLocationRef.current;

        const draft: Partial<Event> = {
            $id: activeEditingEvent?.$id,
            hostId: normalizedHostId,
            name: (source.name ?? '').trim(),
            description: source.description,
            location: source.location,
            address: source.address?.trim() || undefined,
            start: source.start,
            end: normalizedEnd,
            timeZone: normalizeTimeZone(source.timeZone, getSystemTimeZone()),
            eventType: source.eventType,
            parentEvent: source.parentEvent || undefined,
            noFixedEndDateTime: supportsScheduleSlotsForEvent(source.eventType, source.parentEvent)
                ? Boolean(source.noFixedEndDateTime)
                : false,
            state: isEditMode ? activeEditingEvent?.state ?? 'PUBLISHED' : 'UNPUBLISHED',
            sportId: sportId || undefined,
            price: eventPriceCents,
            taxHandling: normalizeEventTaxHandling(source.taxHandling),
            organizerManualTaxRateBps: normalizeOrganizerManualTaxRateBps(source.organizerManualTaxRateBps),
            minAge,
            maxAge,
            allowPaymentPlans: eventAllowPaymentPlans,
            installmentCount: eventAllowPaymentPlans
                ? source.installmentCount || installmentAmountsCents.length || 0
                : undefined,
            installmentAmounts: eventAllowPaymentPlans ? installmentAmountsCents : [],
            installmentDueDates: eventAllowPaymentPlans ? source.installmentDueDates : [],
            allowTeamSplitDefault: source.allowTeamSplitDefault,
            maxParticipants: source.maxParticipants ?? undefined,
            teamSizeLimit: source.teamSizeLimit ?? undefined,
            teamSignup: source.teamSignup,
            singleDivision: source.singleDivision,
            splitLeaguePlayoffDivisions,
            registrationByDivisionType: source.registrationByDivisionType,
            divisions: normalizedDivisionKeys,
            divisionDetails: (tournamentPoolPlayEnabled ? [] : normalizedDivisionDetailsForPayload).map((detail) => ({
                ...detail,
                price: normalizePriceCents(detail.price),
                maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || 2)),
                playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(detail.allowPaymentPlans),
                installmentCount: detail.allowPaymentPlans
                    ? (detail.installmentCount || detail.installmentAmounts.length || 0)
                    : 0,
                installmentAmounts: detail.allowPaymentPlans
                    ? normalizeInstallmentAmounts(detail.installmentAmounts)
                    : [],
                installmentDueDates: detail.allowPaymentPlans
                    ? (Array.isArray(detail.installmentDueDates)
                        ? detail.installmentDueDates
                        : [])
                    : [],
            })),
            playoffDivisionDetails: normalizedPlayoffDivisionDetails.map((division) => ({
                id: division.id,
                key: division.key,
                kind: 'PLAYOFF' as const,
                name: division.name,
                divisionTypeId: division.divisionTypeId,
                divisionTypeName: division.divisionTypeName,
                ratingType: division.ratingType,
                gender: division.gender,
                sportId: division.sportId,
                price: Number.isFinite(division.price)
                    ? normalizePriceCents(division.price as number)
                    : undefined,
                maxParticipants: normalizePlayoffDivisionParticipantCount(division.maxParticipants) ?? undefined,
                playoffTeamCount: Number.isFinite(division.playoffTeamCount)
                    ? Math.max(2, Math.trunc(division.playoffTeamCount as number))
                    : undefined,
                poolCount: Number.isFinite(division.poolCount)
                    ? Math.max(1, Math.trunc(division.poolCount as number))
                    : undefined,
                poolTeamCount: Number.isFinite(division.poolTeamCount)
                    ? Math.max(1, Math.trunc(division.poolTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(division.allowPaymentPlans),
                installmentCount: division.allowPaymentPlans
                    ? (division.installmentCount || division.installmentAmounts?.length || 0)
                    : 0,
                installmentAmounts: division.allowPaymentPlans
                    ? normalizeInstallmentAmounts(division.installmentAmounts)
                    : [],
                installmentDueDates: division.allowPaymentPlans && Array.isArray(division.installmentDueDates)
                    ? division.installmentDueDates
                    : [],
                installmentDueRelativeDays: division.allowPaymentPlans
                    ? normalizeInstallmentRelativeDays(division.installmentDueRelativeDays)
                    : [],
                playoffConfig: normalizeTournamentConfigForSetMode(
                    division.playoffConfig,
                    resolveTournamentSetMode(
                        sportRequiresSets,
                        division.playoffConfig,
                    ),
                ),
            })),
            cancellationRefundHours: source.cancellationRefundHours,
            registrationCutoffHours: source.registrationCutoffHours,
            requiredTemplateIds: source.requiredTemplateIds,
            imageId: finalImageId,
            seedColor: source.seedColor,
            waitListIds: source.waitList,
            freeAgentIds: source.freeAgents,
            teams: source.teams,
            players: source.players,
            officials: normalizedOfficials,
            officialIds: normalizedOfficialIds,
            officialSchedulingMode: normalizeOfficialSchedulingMode(source.officialSchedulingMode),
            officialPositions: normalizedOfficialPositionsForPayload,
            eventOfficials: normalizedEventOfficials,
            assistantHostIds: normalizedAssistantHostIds,
            doTeamsOfficiate: source.doTeamsOfficiate,
            teamOfficialsMaySwap: source.doTeamsOfficiate ? Boolean(source.teamOfficialsMaySwap) : false,
            matchRulesOverride: source.matchRulesOverride ?? null,
            autoCreatePointMatchIncidents: Boolean(source.autoCreatePointMatchIncidents),
            coordinates: baseCoordinates,
        };

        const organizationId = source.organizationId || organizationHostedEventId || undefined;
        const sourceFields = hasRestrictedImmutableFields ? immutableFields : fields;
        const organizationFieldIds = organizationHostedEventId
            ? toFieldIdList(sourceFields.filter((field) => getFieldOrganizationId(field) === organizationHostedEventId))
            : [];
        const selectedOrganizationFieldIds = isOrganizationHostedEvent && supportsOrganizationFieldSelectionForEvent(
            source.eventType,
            source.parentEvent,
        )
            ? resolveOrganizationEventFieldIds(source.selectedFieldIds, organizationFieldIds)
            : [];

        if (!shouldManageLocalFields) {
            let fieldsToInclude = fieldsReferencedInSlots;
            if (!fieldsToInclude.length && hasRestrictedImmutableFields) {
                fieldsToInclude = immutableFields;
            }
            if (isOrganizationManagedEvent) {
                const defaultOrganizationFieldIds = toIdList(fields.length ? fields : fieldsToInclude);
                const fieldIds = supportsOrganizationFieldSelectionForEvent(source.eventType, source.parentEvent)
                    ? resolveOrganizationEventFieldIds(source.selectedFieldIds, defaultOrganizationFieldIds)
                    : toIdList(fieldsToInclude);
                selectedRentedFieldIds.forEach((fieldId) => {
                    if (!fieldIds.includes(fieldId)) {
                        fieldIds.push(fieldId);
                    }
                });
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            } else if (fieldsToInclude.length) {
                draft.fields = fieldsToInclude.map(field => withEventFieldLocationDefault(
                    { ...field },
                    eventFieldLocation,
                    previousEventFieldLocation,
                ));
                const fieldIds = toIdList(fieldsToInclude);
                selectedRentedFieldIds.forEach((fieldId) => {
                    if (!fieldIds.includes(fieldId)) {
                        fieldIds.push(fieldId);
                    }
                });
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            }
            if ((!draft.fieldIds || draft.fieldIds.length === 0) && rentalPurchase?.fieldId) {
                draft.fieldIds = [rentalPurchase.fieldId];
            } else if ((!draft.fieldIds || draft.fieldIds.length === 0) && selectedRentedFieldIds.length) {
                draft.fieldIds = selectedRentedFieldIds;
            }
        } else {
            const localFields = sourceFields.filter(isEventLocalField);
            if (localFields.length) {
                draft.fields = localFields.map((field) => withEventFieldLocationDefault(
                    { ...field },
                    eventFieldLocation,
                    previousEventFieldLocation,
                ));
            }
            const fieldIds = Array.from(new Set([
                ...selectedOrganizationFieldIds,
                ...selectedRentedFieldIds,
                ...toIdList(localFields),
            ]));
            if (fieldIds.length) {
                draft.fieldIds = fieldIds;
            }
        }

        const normalizedFieldIds = Array.isArray(draft.fieldIds)
            ? Array.from(new Set(draft.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
            : [];
        if (normalizedFieldIds.length) {
            draft.fieldIds = normalizedFieldIds;
        }
        delete (draft as Partial<Event>).divisionFieldIds;

        if (organizationId) {
            draft.organizationId = organizationId;
        }

        if (!isEditMode) {
            if (currentUser?.$id) {
                draft.hostId = currentUser.$id;
            }
            draft.waitListIds = [];
            draft.freeAgentIds = [];
            draft.players = joinAsParticipant && currentUser ? [currentUser] : [];
            draft.userIds = joinAsParticipant && currentUser?.$id ? [currentUser.$id] : [];
            if (shouldProvisionFields) {
                draft.fieldCount = fieldCount;
            }
        }

        if (hasImmutableTimeSlots) {
            draft.timeSlots = immutableTimeSlots.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : slotDivisions,
                };
            });
            const slotIds = toIdList(immutableTimeSlots);
            if (slotIds.length) {
                draft.timeSlotIds = slotIds;
            }
        }

        const teamIds = toIdList(draft.teams as Team[] | undefined);
        if (teamIds.length) {
            draft.teamIds = teamIds;
        }

        const userIds = toIdList(draft.players as UserData[] | undefined);
        if (userIds.length && !draft.userIds?.length) {
            draft.userIds = userIds;
        }

        const sourceUsesStandingsScoring = source.eventType === 'LEAGUE'
            || isTournamentPoolPlayFormEnabled(source.eventType, Boolean(source.leagueData.includePlayoffs));

        if (sourceUsesStandingsScoring) {
            if (source.leagueScoringConfig?.$id) {
                draft.leagueScoringConfigId = source.leagueScoringConfig.$id;
            }
            if (source.leagueScoringConfig) {
                draft.leagueScoringConfig = source.leagueScoringConfig;
            }
        } else {
            draft.leagueScoringConfigId = undefined;
            draft.leagueScoringConfig = undefined;
        }

        if (source.eventType === 'LEAGUE') {
            const restTime = normalizeNumber(source.leagueData.restTimeMinutes);
            const setsPerMatchValue = source.leagueData.setsPerMatch ?? 1;
            const normalizedPoints = sportRequiresSets
                ? (() => {
                    const base = Array.isArray(source.leagueData.pointsToVictory)
                        ? source.leagueData.pointsToVictory.slice(0, setsPerMatchValue)
                    : [];
                    while (base.length < setsPerMatchValue) base.push(21);
                    return base;
                })()
                : undefined;

            draft.gamesPerOpponent = source.leagueData.gamesPerOpponent;
            draft.includePlayoffs = source.leagueData.includePlayoffs;
            (draft as any).includePlayoffsOrPools = source.leagueData.includePlayoffs;
            draft.playoffTeamCount = source.leagueData.includePlayoffs
                ? (Number.isFinite(source.leagueData.playoffTeamCount)
                    ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                    : undefined)
                : undefined;

            if (sportRequiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(source.leagueData.setDurationMinutes);
                draft.setsPerMatch = setsPerMatchValue;
                draft.pointsToVictory = normalizedPoints;
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(source.leagueData.matchDurationMinutes);
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            }

            if (source.leagueData.includePlayoffs && source.playoffData && !splitLeaguePlayoffDivisions) {
                const normalizedPlayoffConfig = normalizeTournamentConfigForSetMode(
                    source.playoffData,
                    playoffRequiresSets,
                );
                draft.doubleElimination = normalizedPlayoffConfig.doubleElimination;
                draft.winnerSetCount = normalizedPlayoffConfig.winnerSetCount;
                draft.loserSetCount = normalizedPlayoffConfig.loserSetCount;
                draft.winnerBracketPointsToVictory = normalizedPlayoffConfig.winnerBracketPointsToVictory;
                draft.loserBracketPointsToVictory = normalizedPlayoffConfig.loserBracketPointsToVictory;
                draft.restTimeMinutes = normalizeNumber(normalizedPlayoffConfig.restTimeMinutes, 0) ?? 0;
            }

        }

        if (source.eventType === 'TOURNAMENT') {
            const normalizedTournamentConfig = normalizeTournamentConfigForSetMode(
                source.tournamentData,
                tournamentRequiresSets,
            );
            draft.includePlayoffs = Boolean(source.leagueData.includePlayoffs);
            (draft as any).includePlayoffsOrPools = Boolean(source.leagueData.includePlayoffs);
            draft.playoffTeamCount = undefined;
            draft.doubleElimination = normalizedTournamentConfig.doubleElimination;
            draft.winnerSetCount = normalizedTournamentConfig.winnerSetCount;
            draft.loserSetCount = normalizedTournamentConfig.loserSetCount;
            draft.winnerBracketPointsToVictory = normalizedTournamentConfig.winnerBracketPointsToVictory;
            draft.loserBracketPointsToVictory = normalizedTournamentConfig.loserBracketPointsToVictory;
            draft.prize = normalizedTournamentConfig.prize;
            draft.fieldCount = fieldCount;
            draft.restTimeMinutes = normalizeNumber(normalizedTournamentConfig.restTimeMinutes, 0) ?? 0;
            if (tournamentRequiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(normalizedTournamentConfig.setDurationMinutes);
                draft.matchDurationMinutes = undefined;
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(normalizedTournamentConfig.matchDurationMinutes);
                draft.setDurationMinutes = undefined;
            }
        }

        if (!hasImmutableTimeSlots && supportsScheduleSlotsForEvent(source.eventType, source.parentEvent)) {
            const rentalLockedSlotDocuments = rentalLockedSlotsForDraft.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : slotDivisions,
                };
            });
            const editableSlotDocuments = source.leagueSlots
                .filter((slot) => {
                    if (!normalizeSlotFieldIds(slot).length) {
                        return false;
                    }
                    if (slot.repeating === false) {
                        const slotStart = parseLocalDateTime(slot.startDate ?? null);
                        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                        return Boolean(slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime());
                    }
                    return normalizeWeekdays(slot).length > 0
                        && typeof slot.startTimeMinutes === 'number'
                        && typeof slot.endTimeMinutes === 'number';
                })
                .map((slot) => {
                    const slotId = slot.$id || slot.key;
                    const repeating = slot.repeating !== false;
                    const slotTimeZone = normalizeTimeZone(slot.timeZone, source.timeZone);
                    const slotFieldIds = normalizeSlotFieldIds(slot);
                    const slotDivisionKeys = normalizeSlotDivisionIdsWithLookup(
                        slot.divisions,
                        slotDivisionLookupForDraft,
                    );
                    const explicitStart = parseLocalDateTime(slot.startDate ?? null);
                    const explicitEnd = parseLocalDateTime(slot.endDate ?? null);
                    const fallbackStart = parseLocalDateTime(source.start ?? null);
                    const nonRepeatingDay = explicitStart
                        ? ((explicitStart.getDay() + 6) % 7)
                        : fallbackStart
                            ? ((fallbackStart.getDay() + 6) % 7)
                            : 0;
                    const normalizedDays = repeating
                        ? normalizeWeekdays(slot)
                        : [nonRepeatingDay];
                    const startTimeMinutes = repeating
                        ? Number(slot.startTimeMinutes)
                        : (explicitStart
                            ? explicitStart.getHours() * 60 + explicitStart.getMinutes()
                            : Number(slot.startTimeMinutes));
                    const endTimeMinutes = repeating
                        ? Number(slot.endTimeMinutes)
                        : (explicitEnd
                            ? explicitEnd.getHours() * 60 + explicitEnd.getMinutes()
                            : Number(slot.endTimeMinutes));
                    const serialized: TimeSlot = {
                        $id: slotId,
                        dayOfWeek: normalizedDays[0] as TimeSlot['dayOfWeek'],
                        daysOfWeek: normalizedDays as TimeSlot['daysOfWeek'],
                        scheduledFieldId: slotFieldIds[0],
                        scheduledFieldIds: slotFieldIds,
                        divisions: singleDivisionEnabled
                            ? normalizedDivisionKeys
                            : slotDivisionKeys,
                        timeZone: slotTimeZone,
                        startTimeMinutes,
                        endTimeMinutes,
                        repeating,
                        price: typeof slot.price === 'number' && Number.isFinite(slot.price) ? slot.price : undefined,
                        requiredTemplateIds: normalizeFieldIds(slot.requiredTemplateIds),
                        hostRequiredTemplateIds: normalizeFieldIds(slot.hostRequiredTemplateIds),
                        sourceType: typeof slot.sourceType === 'string' && slot.sourceType.trim().length > 0
                            ? slot.sourceType
                            : (slot.rentalLocked ? 'RENTAL_BOOKING' : undefined),
                        rentalBookingId: typeof slot.rentalBookingId === 'string' && slot.rentalBookingId.trim().length > 0
                            ? slot.rentalBookingId
                            : undefined,
                        rentalBookingItemId: typeof slot.rentalBookingItemId === 'string' && slot.rentalBookingItemId.trim().length > 0
                            ? slot.rentalBookingItemId
                            : undefined,
                        rentalLocked: Boolean(slot.rentalLocked),
                    };

                    if (!repeating) {
                        if (explicitStart) {
                            serialized.startDate = formatLocalDateTime(explicitStart);
                        }
                        if (explicitEnd) {
                            serialized.endDate = formatLocalDateTime(explicitEnd);
                        }
                    } else {
                        const slotStartDateOverride = normalizeSlotBoundaryOverrideForForm(
                            slot.startDate ?? null,
                            activeEditingEvent?.start ?? null,
                            slotTimeZone,
                        );
                        if (slotStartDateOverride) {
                            serialized.startDate = slotStartDateOverride;
                        } else if (source.start) {
                            serialized.startDate = source.start;
                        }
                        // Open-ended scheduling should not force recurring slot end bounds.
                        if (!source.noFixedEndDateTime && source.end) {
                            serialized.endDate = source.end;
                        }
                    }

                    return serialized;
                });
            const editableSlotIds = new Set(
                editableSlotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id.trim() : ''))
                    .filter((slotId) => slotId.length > 0),
            );
            const retainedRentalLockedSlotDocuments = rentalLockedSlotDocuments.filter((slot) => {
                const slotId = typeof slot.$id === 'string' ? slot.$id.trim() : '';
                return !slotId || !editableSlotIds.has(slotId);
            });
            const slotDocumentsByKey = new Map<string, TimeSlot>();
            [...retainedRentalLockedSlotDocuments, ...editableSlotDocuments].forEach((slot) => {
                const key = slot.rentalBookingItemId
                    || slot.$id
                    || `${normalizeSlotFieldIds(slot).join(',')}:${slot.startDate ?? ''}:${slot.endDate ?? ''}:${slot.startTimeMinutes ?? ''}:${slot.endTimeMinutes ?? ''}`;
                slotDocumentsByKey.set(key, slot);
            });
            const slotDocuments = Array.from(slotDocumentsByKey.values());

            if (slotDocuments.length) {
                draft.timeSlots = slotDocuments;
                const slotIds = slotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id : null))
                    .filter((id): id is string => Boolean(id));
                if (slotIds.length) {
                    draft.timeSlotIds = slotIds;
                }
                const slotFieldIds = Array.from(
                    new Set(
                        slotDocuments.flatMap((slot) => normalizeSlotFieldIds(slot)),
                    ),
                );
                if (slotFieldIds.length) {
                    draft.fieldIds = slotFieldIds;
                }
            }
        }

        return draft;
    }, [
        activeEditingEvent?.state,
        activeEditingEvent?.$id,
        activeEditingEvent?.start,
        eventData,
        fields,
        fieldsReferencedInSlots,
        hasRestrictedImmutableFields,
        hasImmutableTimeSlots,
        hasStripeAccount,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationManagedEvent,
        isOrganizationHostedEvent,
        organizationHostedEventId,
        resolvedOrganization?.ownerId,
        resolvedOrganization?.officials,
        organizationAllowedHostIds,
        organizationAllowedOfficialIds,
        organizationOfficialsById,
        currentUser,
        joinAsParticipant,
        rentalPurchase,
        rentalLockedSlotsForDraft,
        selectedRentedFieldIds,
        sportsById,
        shouldManageLocalFields,
        shouldProvisionFields,
        fieldCount,
    ]);
    buildDraftForDirtyTrackingRef.current = buildDraftEvent;

    useEffect(() => {
        if (!open || !pendingInitialDirtyRebaseRef.current || sportsLoading || fieldsLoading) {
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
            return;
        }

        const expectedDraftFingerprint = JSON.stringify(buildDraftEvent(getValues()));
        if (pendingInitialDirtyRebaseTimeoutRef.current) {
            clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
        }

        // Rebase only after normalization effects stop mutating draft-backed values.
        pendingInitialDirtyRebaseTimeoutRef.current = setTimeout(() => {
            pendingInitialDirtyRebaseTimeoutRef.current = null;
            if (!pendingInitialDirtyRebaseRef.current) {
                return;
            }

            const latestDraftFingerprint = JSON.stringify(buildDraftEvent(getValues()));
            if (latestDraftFingerprint !== expectedDraftFingerprint) {
                return;
            }

            const stabilizedValues = getValues();
            dirtyBaselineValuesRef.current = stabilizedValues;
            pendingInitialDirtyRebaseRef.current = false;
            reset(stabilizedValues);
            setIsDirtyTrackingReady(true);
            onDirtyStateChange?.(false);
        }, 0);

        return () => {
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
        };
    }, [
        buildDraftEvent,
        fieldsLoading,
        formValues,
        getValues,
        onDirtyStateChange,
        open,
        reset,
        sportsLoading,
    ]);

    const getDraftSnapshot = useCallback(
        () => buildDraftEvent(getValues()),
        [buildDraftEvent, getValues],
    );
    const getRegistrationQuestionDrafts = useCallback((): RegistrationQuestionDraft[] => (
        registrationQuestionDrafts
            .map((question, index) => ({
                id: question.id,
                prompt: String(question.prompt ?? '').trim(),
                answerType: question.answerType ?? 'TEXT',
                required: Boolean(question.required),
                sortOrder: Number.isFinite(Number(question.sortOrder)) ? Number(question.sortOrder) : index,
            }))
            .filter((question) => question.prompt.length > 0)
    ), [registrationQuestionDrafts]);

    const validateDraft = useCallback(async () => {
        const isFormValid = await trigger();
        if (!isFormValid) {
            const currentValues = getValues();
            const schemaResult = eventValidationSchema.safeParse(currentValues);
            const flattenedErrors = dedupeValidationErrors([
                ...(schemaResult.success ? [] : flattenZodIssues(schemaResult.error.issues)),
                ...flattenFormErrors(errors),
            ]);
            lastValidationErrorsRef.current = flattenedErrors;
            console.warn('Event form validation failed.', {
                errorCount: flattenedErrors.length,
                errors: flattenedErrors,
            });
            return false;
        }

        if (officialStaffingCoverageError) {
            lastValidationErrorsRef.current = [
                {
                    path: 'officialSchedulingMode',
                    message: officialStaffingCoverageError,
                },
            ];
            console.warn('Event form submission blocked by official staffing requirements.', {
                requiredOfficialSlotsPerMatch,
                assignedActiveOfficialsForStaffing,
                mode: eventData.officialSchedulingMode,
            });
            return false;
        }

        if (!supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent)) {
            lastValidationErrorsRef.current = [];
            return true;
        }

        lastValidationErrorsRef.current = [];
        return true;
    }, [
        assignedActiveOfficialsForStaffing,
        eventData.eventType,
        eventData.officialSchedulingMode,
        eventData.parentEvent,
        errors,
        eventValidationSchema,
        getValues,
        officialStaffingCoverageError,
        requiredOfficialSlotsPerMatch,
        trigger,
    ]);

    const commitDirtyBaseline = useCallback(() => {
        const currentValues = getValues();
        dirtyBaselineValuesRef.current = currentValues;
        reset(currentValues);
        onDirtyStateChange?.(false);
    }, [getValues, onDirtyStateChange, reset]);

    useImperativeHandle(
        ref,
        () => ({
            getDraft: getDraftSnapshot,
            getRegistrationQuestionDrafts,
            validate: validateDraft,
            getValidationErrors: () => lastValidationErrorsRef.current,
            validatePendingStaffAssignments,
            commitDirtyBaseline,
            submitPendingStaffInvites,
        }),
        [commitDirtyBaseline, getDraftSnapshot, getRegistrationQuestionDrafts, submitPendingStaffInvites, validateDraft, validatePendingStaffAssignments],
    );

    // Syncs the selected event image with component state after uploads or picker changes.
    const handleImageChange = (fileId: string, _url: string) => {
        if (isImmutableField('imageId')) {
            return;
        }
        setValue('imageId', fileId, { shouldDirty: true, shouldValidate: true });
    };

    const allowImageEdit = !isImmutableField('imageId');
    const isLocationImmutable = isImmutableField('location') || isImmutableField('coordinates') || hasExternalRentalField;
    const splitLeaguePlayoffDivisionsLocked = isImmutableField('splitLeaguePlayoffDivisions') && !hasExternalRentalField;
    const isSchedulableEventType = supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    const isWeeklyChildEvent = eventData.eventType === 'WEEKLY_EVENT' && hasParentEventRef(eventData.parentEvent);
    const supportsEditableTeamSignup = eventData.eventType === 'EVENT' || eventData.eventType === 'WEEKLY_EVENT';
    const showsFixedTeamEventToggle = eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT';
    const usesRentalSlots = hasExternalRentalField || hasImmutableTimeSlots || Boolean(rentalPurchase?.fieldId);
    const showScheduleConfig = isSchedulableEventType || usesRentalSlots || isWeeklyChildEvent;
    const resourceSelectorLoading = fieldsLoading || rentalResourcesLoading;
    const showOrganizationFieldsInEventDetails = (
        isOrganizationHostedEvent || rentalResourceOptions.length > 0
    ) && supportsOrganizationFieldSelection;
    const localFieldCreationControl = showLocalFieldCreationControls ? (
        <MantineSelect
            label="Number of Resources"
            placeholder="Select resource count"
            data={fieldCountOptions}
            value={String(fieldCount)}
            w="100%"
            styles={alignedDetailsFieldStyles}
            onChange={(val) => {
                const parsed = Number(val);
                setFieldCount(Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0);
            }}
            error={errors.fieldCount?.message as string | undefined}
            comboboxProps={sharedComboboxProps}
        />
    ) : null;
    const showMatchRulesSection = eventData.eventType !== 'EVENT' && eventData.eventType !== 'WEEKLY_EVENT';
    const showScoringConfigSection = eventData.eventType === 'LEAGUE'
        || isTournamentPoolPlayFormEnabled(eventData.eventType, leagueData.includePlayoffs);
    const scoringConfigSectionLabel = eventData.eventType === 'TOURNAMENT'
        ? 'Pool Scoring Config'
        : 'League Scoring Config';
    const sectionNavItems = useMemo(
        () => [
            { id: 'section-basic-information', label: 'Basic Information', visible: true },
            { id: 'section-event-details', label: 'Event Details', visible: true },
            { id: 'section-match-rules', label: 'Match Rules', visible: showMatchRulesSection },
            { id: 'section-officials', label: 'Officials', visible: true },
            { id: 'section-division-settings', label: 'Divisions', visible: true },
            { id: 'section-league-scoring-config', label: scoringConfigSectionLabel, visible: showScoringConfigSection },
            { id: 'section-schedule-config', label: 'Schedule', visible: showScheduleConfig },
        ],
        [scoringConfigSectionLabel, showMatchRulesSection, showScheduleConfig, showScoringConfigSection],
    );
    const visibleSectionNavItems = useMemo(
        () => sectionNavItems.filter((item) => item.visible),
        [sectionNavItems],
    );
    const [activeSectionId, setActiveSectionId] = useState<string>(visibleSectionNavItems[0]?.id ?? 'section-basic-information');
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(SECTION_COLLAPSE_DEFAULTS);
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
        const firstVisibleSection = visibleSectionNavItems[0]?.id;
        if (!firstVisibleSection) return;
        if (!visibleSectionNavItems.some((item) => item.id === activeSectionId)) {
            setActiveSectionId(firstVisibleSection);
        }
    }, [activeSectionId, visibleSectionNavItems]);

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;

        const handleScroll = () => {
            const pendingTarget = sectionNavTargetRef.current;
            if (pendingTarget) {
                const pendingElement = document.getElementById(pendingTarget);
                if (pendingElement) {
                    const distanceFromAnchor = Math.abs(
                        pendingElement.getBoundingClientRect().top - SECTION_SCROLL_OFFSET,
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
            let closestSection: string | null = visibleSectionNavItems[0]?.id ?? null;
            let closestDistance = Number.POSITIVE_INFINITY;
            for (const section of visibleSectionNavItems) {
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
    }, [open, visibleSectionNavItems]);

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
        const nextTop = target.getBoundingClientRect().top + window.scrollY - SECTION_SCROLL_OFFSET;
        const scrollTop = Math.max(nextTop, 0);
        const settleMs = Math.min(1600, Math.max(700, Math.abs(window.scrollY - scrollTop) * 0.9));
        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
        sectionNavSettleTimerRef.current = setTimeout(() => {
            sectionNavTargetRef.current = null;
            sectionNavSettleTimerRef.current = null;
        }, settleMs);
    }, [expandSection]);

    const handleAddRegistrationQuestion = useCallback(() => {
        expandSection('section-registration-questions');
        setRegistrationQuestionDrafts((current) => [
            ...current,
            {
                id: createClientId(),
                prompt: '',
                answerType: 'TEXT',
                required: false,
                sortOrder: current.length,
            },
        ]);
    }, [expandSection]);

    const handleRegistrationQuestionPromptChange = useCallback((index: number, prompt: string) => {
        setRegistrationQuestionDrafts((current) => current.map((entry, entryIndex) => (
            entryIndex === index
                ? { ...entry, prompt, sortOrder: index }
                : entry
        )));
    }, []);

    const handleRegistrationQuestionRequiredChange = useCallback((index: number, required: boolean) => {
        setRegistrationQuestionDrafts((current) => current.map((entry, entryIndex) => (
            entryIndex === index
                ? { ...entry, required, sortOrder: index }
                : entry
        )));
    }, []);

    const handleRemoveRegistrationQuestion = useCallback((index: number) => {
        setRegistrationQuestionDrafts((current) => current
            .filter((_, entryIndex) => entryIndex !== index)
            .map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex })));
    }, []);

    const registrationQuestionsEditor = (
        <RegistrationQuestionsSection
            collapsed={collapsedSections['section-registration-questions']}
            questions={registrationQuestionDrafts}
            loading={registrationQuestionsLoading}
            error={registrationQuestionsError}
            onToggle={() => toggleSectionCollapse('section-registration-questions')}
            onAddQuestion={handleAddRegistrationQuestion}
            onPromptChange={handleRegistrationQuestionPromptChange}
            onRequiredChange={handleRegistrationQuestionRequiredChange}
            onRemoveQuestion={handleRemoveRegistrationQuestion}
        />
    );

    const sheetContent = (
        <div className="w-full space-y-6">
            <div className="p-4">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                    <SectionNavigation
                        items={visibleSectionNavItems}
                        activeSectionId={activeSectionId}
                        variant="desktop"
                        onSelectSection={scrollToSection}
                    />

                    <div className="min-w-0">
                        <SectionNavigation
                            items={visibleSectionNavItems}
                            activeSectionId={activeSectionId}
                            variant="mobile"
                            onSelectSection={scrollToSection}
                        />
                        <div className="w-full">
                            <form id={formId} className="space-y-8">
                        {mobileEditUnsupportedWarning && (
                            <Alert color="yellow" variant="light" radius="md">
                                {mobileEditUnsupportedWarning}
                            </Alert>
                        )}
                        <BasicInformationSection
                            collapsed={collapsedSections['section-basic-information']}
                            control={control}
                            errors={errors}
                            selectedImageUrl={selectedImageUrl}
                            allowImageEdit={allowImageEdit}
                            sportsLoading={sportsLoading}
                            sportOptions={sportOptions}
                            sportsById={sportsById}
                            sportsError={sportsError}
                            comboboxProps={sharedComboboxProps}
                            maxEventNameLength={MAX_EVENT_NAME_LENGTH}
                            maxDescriptionLength={MAX_DESCRIPTION_LENGTH}
                            isImmutableField={isImmutableField}
                            setValue={setValue}
                            onToggle={() => toggleSectionCollapse('section-basic-information')}
                            onImageChange={handleImageChange}
                        />

                        {/* Event Details */}
                        <Paper
                            id="section-event-details"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-20 bg-gray-50"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-lg font-semibold">Event Details</h3>
                                <Button
                                    type="button"
                                    variant="subtle"
                                    size="xs"
                                    aria-expanded={!collapsedSections['section-event-details']}
                                    aria-controls="section-event-details-content"
                                    onClick={() => toggleSectionCollapse('section-event-details')}
                                >
                                    {collapsedSections['section-event-details'] ? 'Expand' : 'Collapse'}
                                </Button>
                            </div>
                            <Collapse in={!collapsedSections['section-event-details']} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>

                            <div id="section-event-details-content" className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 mb-4 md:items-start">
                                <div className="md:col-span-2">
                                    <Controller
                                        name="eventType"
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <div className="space-y-2">
                                                <MantineSelect
                                                    label="Event Type"
                                                    data={eventTypeOptions}
                                                    value={field.value}
                                                    comboboxProps={sharedComboboxProps}
                                                    styles={alignedDetailsFieldStyles}
                                                    disabled={isImmutableField('eventType')}
                                                    onChange={(value) => {
                                                        if (isImmutableField('eventType')) return;
                                                        if (!value) return;
                                                        clearErrors('leagueSlots');
                                                        const nextType = value as EventType;
                                                        const enforcingTeamSettings = nextType === 'LEAGUE' || nextType === 'TOURNAMENT';
                                                        field.onChange(nextType);
                                                        if (enforcingTeamSettings) {
                                                            setValue('teamSignup', true, { shouldDirty: true });
                                                            setValue('singleDivision', true, { shouldDirty: true, shouldValidate: true });
                                                            setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
                                                        } else {
                                                            setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
                                                            const parsedStart = parseLocalDateTime(getValues('start'));
                                                            const parsedEnd = parseLocalDateTime(getValues('end'));
                                                            if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                                                                const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                                                                setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
                                                            }
                                                        }
                                                    }}
                                                    w="100%"
                                                />
                                                <AnimatedSection in={eventData.eventType === 'LEAGUE'}>
                                                    <Checkbox
                                                        size="xs"
                                                        label="Include playoffs"
                                                        checked={Boolean(leagueData.includePlayoffs)}
                                                        disabled={isImmutableField('includePlayoffs')}
                                                        onChange={(event) => {
                                                            if (isImmutableField('includePlayoffs')) return;
                                                            handleIncludePlayoffsToggle(event.currentTarget.checked);
                                                        }}
                                                    />
                                                </AnimatedSection>
                                                <AnimatedSection in={eventData.eventType === 'TOURNAMENT'}>
                                                    <Checkbox
                                                        size="xs"
                                                        label="Include pool play"
                                                        checked={Boolean(leagueData.includePlayoffs)}
                                                        disabled={isImmutableField('includePlayoffs')}
                                                        onChange={(event) => {
                                                            if (isImmutableField('includePlayoffs')) return;
                                                            const checked = event.currentTarget.checked;
                                                            setLeagueData((prev) => ({
                                                                ...prev,
                                                                includePlayoffs: checked,
                                                                playoffTeamCount: checked ? prev.playoffTeamCount : undefined,
                                                            }));
                                                            if (!checked) {
                                                                const currentDetails = Array.isArray(eventData.divisionDetails)
                                                                    ? eventData.divisionDetails
                                                                    : [];
                                                                setValue(
                                                                    'divisionDetails',
                                                                    currentDetails.map((detail) => ({
                                                                        ...detail,
                                                                        playoffTeamCount: undefined,
                                                                        poolCount: undefined,
                                                                        poolTeamCount: undefined,
                                                                    })),
                                                                    { shouldDirty: true, shouldValidate: true },
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </AnimatedSection>
                                            </div>
                                        )}
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-1" data-testid="team-size-control">
                                    <Controller
                                        name="teamSizeLimit"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <NumberInput
                                                label="Team Size"
                                                min={1}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value ?? ''}
                                                w="100%"
                                                styles={alignedDetailsFieldStyles}
                                                clampBehavior="blur"
                                                disabled={isImmutableField('teamSizeLimit')}
                                                onChange={(val) => {
                                                    if (isImmutableField('teamSizeLimit')) return;
                                                    const numeric = typeof val === 'number' && Number.isFinite(val)
                                                        ? Math.trunc(val)
                                                        : null;
                                                    field.onChange(numeric);
                                                }}
                                                error={fieldState.error?.message as string | undefined}
                                            />
                                        )}
                                    />
                                    <AnimatedSection in={supportsEditableTeamSignup} className="pt-1">
                                        <Controller
                                            name="teamSignup"
                                            control={control}
                                            render={({ field: teamSignupField }) => (
                                                <Checkbox
                                                    data-testid="team-signup-switch"
                                                    size="xs"
                                                    label="Use teams"
                                                    aria-label="Use teams"
                                                    checked={Boolean(teamSignupField.value)}
                                                    disabled={isImmutableField('teamSignup')}
                                                    onChange={(event) => {
                                                        if (isImmutableField('teamSignup')) return;
                                                        teamSignupField.onChange(event.currentTarget.checked);
                                                    }}
                                                />
                                            )}
                                        />
                                    </AnimatedSection>
                                    <AnimatedSection in={showsFixedTeamEventToggle} className="pt-1">
                                        <Checkbox
                                            data-testid="team-event-checkbox"
                                            size="xs"
                                            label="Team Event"
                                            aria-label="Team Event"
                                            checked
                                            disabled
                                        />
                                    </AnimatedSection>
                                </div>
                                <div className="md:col-span-2">
                                    <Controller
                                        name="start"
                                        control={control}
                                        render={({ field }) => (
                                            <DateTimePicker
                                                label="Start Date & Time"
                                                valueFormat="MM/DD/YYYY hh:mm A"
                                                value={parseLocalDateTime(field.value)}
                                                styles={alignedDetailsFieldStyles}
                                                disabled={isImmutableField('start')}
                                                onChange={(val) => {
                                                    if (isImmutableField('start')) return;
                                                    const parsed = parseLocalDateTime(val as Date | string | null);
                                                    if (!parsed) return;
                                                    setValue('start', formatLocalDateTime(parsed), { shouldDirty: true, shouldValidate: true });
                                                }}
                                                minDate={todaysDate}
                                                timePickerProps={{
                                                    withDropdown: true,
                                                    format: '12h',
                                                }}
                                                popoverProps={sharedPopoverProps}
                                                style={{ width: '100%' }}
                                            />
                                        )}
                                    />
                                </div>
                                <AnimatedSection
                                    in={eventData.eventType === 'EVENT' || supportsNoFixedEndDateTime}
                                    collapseClassName="md:col-span-2"
                                >
                                    <Controller
                                        name="end"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <div className="space-y-2">
                                                <DateTimePicker
                                                    label="End Date & Time"
                                                    valueFormat="MM/DD/YYYY hh:mm A"
                                                    value={parseLocalDateTime(field.value)}
                                                    styles={alignedDetailsFieldStyles}
                                                    disabled={
                                                        isImmutableField('end')
                                                        || (supportsNoFixedEndDateTime && eventData.noFixedEndDateTime)
                                                    }
                                                    onChange={(val) => {
                                                        if (isImmutableField('end')) return;
                                                        const parsed = parseLocalDateTime(val as Date | string | null);
                                                        if (!parsed) return;
                                                        setValue('end', formatLocalDateTime(parsed), { shouldDirty: true, shouldValidate: true });
                                                    }}
                                                    minDate={parseLocalDateTime(eventData.start) ?? todaysDate}
                                                    timePickerProps={{
                                                        withDropdown: true,
                                                        format: '12h',
                                                    }}
                                                    popoverProps={sharedPopoverProps}
                                                    style={{ width: '100%' }}
                                                    error={fieldState.error?.message as string | undefined}
                                                />
                                                {supportsNoFixedEndDateTime ? (
                                                    <div className="space-y-1">
                                                        <Checkbox
                                                            size="xs"
                                                            label="No fixed end datetime scheduling"
                                                            checked={Boolean(eventData.noFixedEndDateTime)}
                                                            disabled={isImmutableField('noFixedEndDateTime')}
                                                            onChange={(event) => {
                                                                if (isImmutableField('noFixedEndDateTime')) return;
                                                                const checked = event.currentTarget.checked;
                                                                setValue('noFixedEndDateTime', checked, { shouldDirty: true, shouldValidate: true });
                                                                if (checked) return;
                                                                const parsedStart = parseLocalDateTime(getValues('start'));
                                                                const parsedEnd = parseLocalDateTime(getValues('end'));
                                                                if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                                                                    const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                                                                    setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    />
                                </AnimatedSection>
                                <div className="md:col-span-2">
                                    <Controller
                                        name="registrationCutoffHours"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <NumberInput
                                                label="Registration Cutoff (Hours)"
                                                min={0}
                                                max={MAX_STANDARD_NUMBER}
                                                value={typeof field.value === 'number' && field.value > 0 ? field.value : ''}
                                                w="100%"
                                                styles={alignedDetailsFieldStyles}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('registrationCutoffHours')}
                                                onChange={(val) => {
                                                    if (isImmutableField('registrationCutoffHours')) return;
                                                    const numeric = typeof val === 'number' && Number.isFinite(val)
                                                        ? val
                                                        : Number(val);
                                                    field.onChange(Number.isFinite(numeric)
                                                        ? Math.max(0, Math.trunc(numeric))
                                                        : 0);
                                                }}
                                                error={fieldState.error?.message as string | undefined}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Controller
                                        name="cancellationRefundHours"
                                        control={control}
                                        render={({ field, fieldState }) => {
                                            const automaticRefundsChecked = field.value != null;
                                            const automaticRefundsImmutable = isImmutableField('cancellationRefundHours');
                                            const automaticRefundsInputDisabled = automaticRefundsImmutable
                                                || !automaticRefundsAvailable
                                                || !automaticRefundsChecked;
                                            const automaticRefundsToggleDisabled = automaticRefundsImmutable
                                                || !automaticRefundsAvailable;

                                            return (
                                                <Stack gap={6}>
                                                    <NumberInput
                                                        label="Refund Cutoff (Hours)"
                                                        min={0}
                                                        max={MAX_STANDARD_NUMBER}
                                                        value={
                                                            automaticRefundsChecked
                                                            && typeof field.value === 'number'
                                                            && field.value > 0
                                                                ? field.value
                                                                : ''
                                                        }
                                                        w="100%"
                                                        styles={alignedDetailsFieldStyles}
                                                        clampBehavior="strict"
                                                        disabled={automaticRefundsInputDisabled}
                                                        onChange={(val) => {
                                                            if (automaticRefundsInputDisabled) return;
                                                            const numeric = typeof val === 'number' && Number.isFinite(val)
                                                                ? val
                                                                : Number(val);
                                                            field.onChange(Number.isFinite(numeric)
                                                                ? Math.max(0, Math.trunc(numeric))
                                                                : 0);
                                                        }}
                                                        error={fieldState.error?.message as string | undefined}
                                                    />
                                                    <Checkbox
                                                        size="xs"
                                                        label="Automatic Refunds"
                                                        checked={automaticRefundsChecked}
                                                        disabled={automaticRefundsToggleDisabled}
                                                        onChange={(event) => {
                                                            if (automaticRefundsToggleDisabled) return;
                                                            field.onChange(event.currentTarget.checked ? field.value ?? 0 : null);
                                                        }}
                                                    />
                                                </Stack>
                                            );
                                        }}
                                    />
                                </div>
                            </div>

                            <EventDetailsLocationControls
                                control={control}
                                coordinates={eventData.coordinates}
                                defaultCoordinates={defaultLocation?.coordinates}
                                coordinatesSelected={coordinatesAreSet(eventData.coordinates)}
                                onSelectedAddressChange={(nextCoordinates, nextAddress) => {
                                    setValue('coordinates', nextCoordinates, { shouldDirty: true, shouldValidate: true });
                                    setValue('address', nextAddress, { shouldDirty: true, shouldValidate: true });
                                }}
                                isLocationImmutable={isLocationImmutable}
                                isImmutableField={isImmutableField}
                                templatesLoading={templatesLoading}
                                templatesError={templatesError}
                                templateOrganizationId={templateOrganizationId}
                                templateOptions={templateOptions}
                                comboboxProps={sharedComboboxProps}
                                multiSelectStyles={alignedDetailsFieldStyles}
                                numberInputStyles={alignedDetailsFieldStyles}
                                maxStandardNumber={MAX_STANDARD_NUMBER}
                                normalizeNumberValue={normalizeNumber}
                                minAge={eventData.minAge}
                                maxAge={eventData.maxAge}
                                localFieldCreationControl={localFieldCreationControl}
                                registrationQuestionsEditor={registrationQuestionsEditor}
                                hasUnsetTeamCapacityLimits={hasUnsetTeamCapacityLimits}
                                teamSignup={Boolean(eventData.teamSignup)}
                            />

                            <EventDetailsResourceControls
                                control={control}
                                showOrganizationFields={showOrganizationFieldsInEventDetails}
                                organizationResourcePool={organizationResourcePool}
                                resourceSelectorLoading={resourceSelectorLoading}
                                organizationHostedEventId={organizationHostedEventId}
                                isImmutableField={isImmutableField}
                                rentalResourcesError={rentalResourcesError}
                                showLocalFieldCreationControls={showLocalFieldCreationControls}
                                eventLocalFields={eventLocalFields}
                                fieldNamesCollapsed={fieldNamesCollapsed}
                                setFieldNamesCollapsed={setFieldNamesCollapsed}
                                maxResourceNameLength={MAX_MEDIUM_TEXT_LENGTH}
                                onLocalFieldNameChange={handleLocalFieldNameChange}
                            />
                            </Collapse>
                        </Paper>

                        <MatchRulesConfigSection
                            visible={showMatchRulesSection}
                            collapsed={collapsedSections['section-match-rules']}
                            sport={selectedSportForOfficials}
                            usesSets={eventData.eventType === 'LEAGUE'
                                ? Boolean(leagueData.usesSets)
                                : eventData.eventType === 'TOURNAMENT'
                                    ? Boolean(tournamentData.usesSets)
                                    : Boolean(selectedSportForOfficials?.usePointsPerSetWin)}
                            setsPerMatch={eventData.eventType === 'LEAGUE' ? leagueData.setsPerMatch : undefined}
                            winnerSetCount={eventData.eventType === 'TOURNAMENT' ? tournamentData.winnerSetCount : undefined}
                            officialPositions={eventData.officialPositions}
                            value={eventData.matchRulesOverride}
                            onChange={handleMatchRulesOverrideChange}
                            autoCreatePointMatchIncidents={eventData.autoCreatePointMatchIncidents}
                            onAutoCreatePointMatchIncidentsChange={(checked) => setValue('autoCreatePointMatchIncidents', checked, { shouldDirty: true, shouldValidate: false })}
                            disabled={isImmutableField('matchRulesOverride')}
                            incidentToggleDisabled={isImmutableField('matchRulesOverride') || isImmutableField('autoCreatePointMatchIncidents')}
                            comboboxProps={sharedComboboxProps}
                            onToggle={() => toggleSectionCollapse('section-match-rules')}
                        />

                        <Paper
                            id="section-officials"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-20 bg-gray-50"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-lg font-semibold">Staff</h3>
                                <Button
                                    type="button"
                                    variant="subtle"
                                    size="xs"
                                    aria-expanded={!collapsedSections['section-officials']}
                                    aria-controls="section-officials-content"
                                    onClick={() => toggleSectionCollapse('section-officials')}
                                >
                                    {collapsedSections['section-officials'] ? 'Expand' : 'Collapse'}
                                </Button>
                            </div>
                            <Collapse in={!collapsedSections['section-officials']} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                                <Stack id="section-officials-content" gap="md" mt="md">
                                    <Controller
                                        name="doTeamsOfficiate"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Teams provide officials"
                                                description="Allow assigning team officials alongside dedicated staff refs."
                                                checked={field.value}
                                                onChange={(e) => {
                                                    const checked = e?.currentTarget?.checked ?? false;
                                                    field.onChange(checked);
                                                    if (!checked) {
                                                        setValue('teamOfficialsMaySwap', false, { shouldDirty: true, shouldValidate: true });
                                                        if (eventData.officialSchedulingMode === 'TEAM_STAFFING') {
                                                            setValue('officialSchedulingMode', 'SCHEDULE', { shouldDirty: true, shouldValidate: true });
                                                        }
                                                    }
                                                }}
                                            />
                                        )}
                                    />
                                    {eventData.doTeamsOfficiate && (
                                        <Controller
                                            name="teamOfficialsMaySwap"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Team officials may swap"
                                                    description="Allow any participating team to take over officiating a match."
                                                    checked={field.value}
                                                    onChange={(e) => field.onChange(e?.currentTarget?.checked ?? false)}
                                                />
                                            )}
                                        />
                                    )}
                                    <Paper withBorder radius="md" p="md" bg="white">
                                        <Stack gap="sm">
                                            <MantineSelect
                                                label="Official scheduling mode"
                                                description="Choose how the scheduler should prioritize staffing requirements."
                                                data={[
                                                    { value: 'STAFFING', label: 'STAFFING - Requires each match be fully staffed with no conflicts' },
                                                    { value: 'TEAM_STAFFING', label: 'TEAM STAFFING - Requires each match to have a team official with no conflicts' },
                                                    { value: 'SCHEDULE', label: 'SCHEDULE - Matches do not need to be fully staffed' },
                                                    { value: 'OFF', label: 'NONE - Fully staffed matches, but conflicts allowed' },
                                                ]}
                                                value={eventData.officialSchedulingMode}
                                                onChange={(value) => {
                                                    const nextMode = normalizeOfficialSchedulingMode(value);
                                                    setValue('officialSchedulingMode', nextMode, { shouldDirty: true, shouldValidate: true });
                                                    if (nextMode === 'TEAM_STAFFING' && !eventData.doTeamsOfficiate) {
                                                        setValue('doTeamsOfficiate', true, { shouldDirty: true, shouldValidate: true });
                                                    }
                                                }}
                                                comboboxProps={sharedComboboxProps}
                                                error={officialStaffingCoverageError ?? undefined}
                                            />
                                            {officialStaffingCoverageError && (
                                                <Alert color="yellow" variant="light">
                                                    {officialStaffingCoverageError}
                                                </Alert>
                                            )}
                                            <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
                                                <div>
                                                    <Title order={6}>Official Positions</Title>
                                                    <Text size="sm" c="dimmed">
                                                        Edit the event-specific official positions and slot counts. Sport defaults only seed this list.
                                                    </Text>
                                                </div>
                                                <Group gap="xs">
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        variant="default"
                                                        disabled={sportOfficialPositionTemplates.length === 0}
                                                        onClick={handleResetOfficialPositionsFromSport}
                                                    >
                                                        Load sport defaults
                                                    </Button>
                                                    <Button type="button" size="xs" onClick={handleAddOfficialPosition}>
                                                        Add position
                                                    </Button>
                                                </Group>
                                            </Group>
                                            <Stack gap="xs">
                                                {(eventData.officialPositions || []).map((position) => (
                                                    <Group key={position.id} align="flex-end" gap="sm" wrap="nowrap">
                                                        <TextInput
                                                            label="Position"
                                                            placeholder="Referee"
                                                            value={position.name}
                                                            onChange={(event) => handleUpdateOfficialPosition(position.id, { name: event.currentTarget.value })}
                                                            maxLength={MAX_SHORT_TEXT_LENGTH}
                                                            className="flex-1"
                                                        />
                                                        <NumberInput
                                                            label="Count"
                                                            value={position.count}
                                                            min={1}
                                                            allowDecimal={false}
                                                            clampBehavior="strict"
                                                            onChange={(value) => handleUpdateOfficialPosition(position.id, { count: Number(value) || 1 })}
                                                            maw={120}
                                                        />
                                                        <ActionIcon
                                                            type="button"
                                                            variant="subtle"
                                                            color="red"
                                                            aria-label={`Remove ${position.name || 'official position'}`}
                                                            onClick={() => handleRemoveOfficialPosition(position.id)}
                                                        >
                                                            <span aria-hidden="true">×</span>
                                                        </ActionIcon>
                                                    </Group>
                                                ))}
                                                {(!eventData.officialPositions || eventData.officialPositions.length === 0) && (
                                                    <Text size="sm" c="dimmed">
                                                        No official positions configured yet. Add them here or load the sport defaults.
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Stack>
                                    </Paper>

                                    {isOrganizationHostedEvent ? (
                                        <Paper withBorder radius="md" p="md" bg="white">
                                            <Stack gap="sm">
                                                <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
                                                    <div>
                                                        <Title order={6}>Organization Staff</Title>
                                                        <Text size="sm" c="dimmed">
                                                            Search the organization roster and assign staff directly to this event.
                                                        </Text>
                                                    </div>
                                                </Group>
                                                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                                                    <TextInput
                                                        label="Search staff"
                                                        placeholder="Search by name or email"
                                                        value={organizationStaffSearch}
                                                        onChange={(event) => setOrganizationStaffSearch(event.currentTarget.value)}
                                                        maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                                    />
                                                    <MantineSelect
                                                        label="Role filter"
                                                        data={[
                                                            { value: 'all', label: 'All roles' },
                                                            { value: 'HOST', label: 'Host' },
                                                            { value: 'OFFICIAL', label: 'Official' },
                                                            { value: 'STAFF', label: 'Staff' },
                                                        ]}
                                                        value={organizationStaffTypeFilter}
                                                        onChange={(value) => setOrganizationStaffTypeFilter((value as 'all' | StaffMemberType) ?? 'all')}
                                                        comboboxProps={sharedComboboxProps}
                                                    />
                                                    <MantineSelect
                                                        label="Status filter"
                                                        data={[
                                                            { value: 'all', label: 'All statuses' },
                                                            { value: 'active', label: 'Active' },
                                                            { value: 'pending', label: 'Pending' },
                                                            { value: 'declined', label: 'Declined' },
                                                        ]}
                                                        value={organizationStaffStatusFilter}
                                                        onChange={(value) => setOrganizationStaffStatusFilter((value as 'all' | StaffRosterStatus) ?? 'all')}
                                                        comboboxProps={sharedComboboxProps}
                                                    />
                                                </SimpleGrid>
                                                <div
                                                    className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                                                    onScroll={(event) => maybeExtendVisibleCountOnScroll(event, filteredOrganizationStaffEntries.length, setOrganizationStaffVisibleCount)}
                                                >
                                                    {filteredOrganizationStaffEntries.slice(0, organizationStaffVisibleCount).map((entry) => {
                                                        const userId = entry.userId;
                                                        const isOfficialAssigned = Boolean(userId && assignedUserIdSetByRole.OFFICIAL.has(userId));
                                                        const isHostAssigned = Boolean(userId && userId === eventData.hostId);
                                                        const isAssistantAssigned = Boolean(userId && assistantHostValue.includes(userId));
                                                        const assignmentsDisabled = !userId;
                                                        const canAssignOfficial = entry.status === 'active' && entry.types.includes('OFFICIAL');
                                                        const canAssignHost = entry.status === 'active' && entry.types.includes('HOST');
                                                        return (
                                                            <Paper key={entry.id} withBorder radius="md" p="sm">
                                                                <Stack gap="xs">
                                                                    <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                                                                        <div className="flex-1 min-w-0">
                                                                            {entry.user ? (
                                                                                <UserCard user={entry.user} className="!p-0 !shadow-none" />
                                                                            ) : (
                                                                                <Stack gap={2}>
                                                                                    <Text fw={600}>{entry.fullName}</Text>
                                                                                    {entry.email && <Text size="xs" c="dimmed">{entry.email}</Text>}
                                                                                </Stack>
                                                                            )}
                                                                        </div>
                                                                        <Badge radius="xl" variant="light" color={getStaffStatusColor(entry.status)}>
                                                                            {formatStaffStatusLabel(entry.status)}
                                                                        </Badge>
                                                                    </Group>
                                                                    <Group gap="xs" wrap="wrap">
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            disabled={assignmentsDisabled || !canAssignOfficial || isOfficialAssigned || isImmutableField('eventOfficials')}
                                                                            onClick={() => handleAddOfficial({ ...((entry.user ?? {}) as UserData), $id: userId ?? undefined })}
                                                                        >
                                                                            Add as official
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            variant="default"
                                                                            disabled={assignmentsDisabled || !canAssignHost || isAssistantAssigned || isHostAssigned || isImmutableField('assistantHostIds')}
                                                                            onClick={() => handleAddAssistantHost({ ...((entry.user ?? {}) as UserData), $id: userId ?? undefined })}
                                                                        >
                                                                            Add as assistant
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            variant="light"
                                                                            disabled={assignmentsDisabled || !canAssignHost || isHostAssigned || isImmutableField('hostId')}
                                                                            onClick={() => handleHostChange(userId)}
                                                                        >
                                                                            Set as host
                                                                        </Button>
                                                                    </Group>
                                                                </Stack>
                                                            </Paper>
                                                        );
                                                    })}
                                                    {filteredOrganizationStaffEntries.length === 0 && (
                                                        <Text size="sm" c="dimmed">No organization staff matched your filters.</Text>
                                                    )}
                                                </div>
                                            </Stack>
                                        </Paper>
                                    ) : (
                                        <Paper withBorder radius="md" p="md" bg="white">
                                            <Stack gap="sm">
                                                <div>
                                                    <Title order={6}>Add / Invite Staff</Title>
                                                    <Text size="sm" c="dimmed">
                                                        Add existing users or stage email invites as officials and assistant hosts.
                                                    </Text>
                                                </div>
                                                <TextInput
                                                    label="Search users"
                                                    placeholder="Search by name or username"
                                                    value={nonOrgStaffSearch}
                                                    onChange={(event) => setNonOrgStaffSearch(event.currentTarget.value)}
                                                    maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                                />
                                                {nonOrgStaffError && (
                                                    <Text size="xs" c="red">{nonOrgStaffError}</Text>
                                                )}
                                                {nonOrgStaffSearchLoading ? (
                                                    <Text size="sm" c="dimmed">Searching staff...</Text>
                                                ) : nonOrgStaffSearch.trim().length >= 2 ? (
                                                    <Stack gap="xs">
                                                        {nonOrgStaffResults.length > 0 ? nonOrgStaffResults.map((result) => {
                                                            const isOfficialAssigned = assignedUserIdSetByRole.OFFICIAL.has(result.$id);
                                                            const isHostAssigned = result.$id === eventData.hostId;
                                                            const isAssistantAssigned = assistantHostValue.includes(result.$id);
                                                            return (
                                                                <Group key={result.$id} justify="space-between" align="center" gap="sm">
                                                                    <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                                                                    <Group gap="xs">
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            disabled={isOfficialAssigned || isImmutableField('eventOfficials')}
                                                                            onClick={() => handleAddOfficial(result)}
                                                                        >
                                                                            Add as official
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            variant="default"
                                                                            disabled={isAssistantAssigned || isHostAssigned || isImmutableField('assistantHostIds')}
                                                                            onClick={() => handleAddAssistantHost(result)}
                                                                        >
                                                                            Add as assistant host
                                                                        </Button>
                                                                    </Group>
                                                                </Group>
                                                            );
                                                        }) : (
                                                            <Text size="sm" c="dimmed">No users found.</Text>
                                                        )}
                                                    </Stack>
                                                ) : (
                                                    <Text size="sm" c="dimmed">Type at least 2 characters to search existing users.</Text>
                                                )}
                                                <Paper withBorder radius="md" p="sm" bg="gray.0">
                                                    <Stack gap="sm">
                                                        <Title order={6}>Invite by email</Title>
                                                        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                                                            <TextInput
                                                                label="First name"
                                                                value={newStaffInvite.firstName}
                                                                onChange={(event) => {
                                                                    const value = event.currentTarget.value;
                                                                    setNewStaffInvite((prev) => ({ ...prev, firstName: value }));
                                                                }}
                                                                maxLength={MAX_SHORT_TEXT_LENGTH}
                                                            />
                                                            <TextInput
                                                                label="Last name"
                                                                value={newStaffInvite.lastName}
                                                                onChange={(event) => {
                                                                    const value = event.currentTarget.value;
                                                                    setNewStaffInvite((prev) => ({ ...prev, lastName: value }));
                                                                }}
                                                                maxLength={MAX_SHORT_TEXT_LENGTH}
                                                            />
                                                            <TextInput
                                                                label="Email"
                                                                value={newStaffInvite.email}
                                                                onChange={(event) => {
                                                                    const value = event.currentTarget.value;
                                                                    setNewStaffInvite((prev) => ({ ...prev, email: value }));
                                                                }}
                                                                maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                                            />
                                                        </SimpleGrid>
                                                        <Group gap="xs">
                                                            <Button
                                                                type="button"
                                                                size="xs"
                                                                variant={newStaffInvite.roles.includes('OFFICIAL') ? 'filled' : 'default'}
                                                                onClick={() => setNewStaffInvite((prev) => ({
                                                                    ...prev,
                                                                    roles: prev.roles.includes('OFFICIAL')
                                                                        ? prev.roles.filter((role) => role !== 'OFFICIAL')
                                                                        : [...prev.roles, 'OFFICIAL'],
                                                                }))}
                                                            >
                                                                Official
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="xs"
                                                                variant={newStaffInvite.roles.includes('ASSISTANT_HOST') ? 'filled' : 'default'}
                                                                onClick={() => setNewStaffInvite((prev) => ({
                                                                    ...prev,
                                                                    roles: prev.roles.includes('ASSISTANT_HOST')
                                                                        ? prev.roles.filter((role) => role !== 'ASSISTANT_HOST')
                                                                        : [...prev.roles, 'ASSISTANT_HOST'],
                                                                }))}
                                                            >
                                                                Assistant host
                                                            </Button>
                                                            <Button type="button" size="xs" onClick={handleStagePendingStaffInvite}>
                                                                Add email invite
                                                            </Button>
                                                        </Group>
                                                        <Text size="xs" c="dimmed">
                                                            Email-invite cards stay labeled as Email invite until you save the event.
                                                        </Text>
                                                    </Stack>
                                                </Paper>
                                            </Stack>
                                        </Paper>
                                    )}

                                    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                                        <Paper withBorder radius="md" p="md" bg="white">
                                            <Stack gap="sm">
                                                <Group justify="space-between" align="center">
                                                    <Title order={6}>Officials</Title>
                                                    <Badge radius="xl" variant="light">{assignedOfficialCards.length}</Badge>
                                                </Group>
                                                <div
                                                    className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                                                    onScroll={(event) => maybeExtendVisibleCountOnScroll(event, assignedOfficialCards.length, setOfficialCardVisibleCount)}
                                                >
                                                    {assignedOfficialCards.slice(0, officialCardVisibleCount).map((card) => (
                                                        <Paper key={card.key} withBorder radius="md" p="sm">
                                                            <Stack gap="xs">
                                                                <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                                                                    <div className="flex-1 min-w-0">
                                                                        {card.user ? (
                                                                            <UserCard user={card.user} className="!p-0 !shadow-none" />
                                                                        ) : (
                                                                            <Stack gap={2}>
                                                                                <Text fw={600}>{card.displayName}</Text>
                                                                                {card.email && <Text size="xs" c="dimmed">{card.email}</Text>}
                                                                            </Stack>
                                                                        )}
                                                                    </div>
                                                                    {card.status && (
                                                                        <Badge radius="xl" variant="light" color={getStaffStatusColor(card.status)}>
                                                                            {formatStaffStatusLabel(card.status)}
                                                                        </Badge>
                                                                    )}
                                                                </Group>
                                                                <Group gap="xs" wrap="wrap">
                                                                    <Badge variant="outline">{formatStaffRoleLabel(card.role)}</Badge>
                                                                    <Button
                                                                        type="button"
                                                                        variant="subtle"
                                                                        color="red"
                                                                        size="xs"
                                                                        disabled={card.source === 'assigned' ? isImmutableField('eventOfficials') : false}
                                                                        onClick={() => {
                                                                            if (card.source === 'draft' && card.email) {
                                                                                setPendingStaffInvites((prev) => prev.flatMap((invite) => {
                                                                                    if (normalizeInviteEmail(invite.email) !== normalizeInviteEmail(card.email)) {
                                                                                        return [invite];
                                                                                    }
                                                                                    const nextRoles = invite.roles.filter((role) => role !== 'OFFICIAL');
                                                                                    if (!nextRoles.length) {
                                                                                        return [];
                                                                                    }
                                                                                    return [{ ...invite, roles: nextRoles }];
                                                                                }));
                                                                                return;
                                                                            }
                                                                            if (card.userId) {
                                                                                handleRemoveOfficial(card.userId);
                                                                            }
                                                                        }}
                                                                    >
                                                                        Remove
                                                                    </Button>
                                                                </Group>
                                                                {card.userId && card.source === 'assigned' && (
                                                                    <SimpleGrid cols={{ base: 1, md: availableOfficialFieldOptions.length > 0 ? 2 : 1 }} spacing="sm">
                                                                        <MantineMultiSelect
                                                                            label="Eligible positions"
                                                                            description="Used by the scheduler when assigning this official."
                                                                            data={(eventData.officialPositions || []).map((position) => ({
                                                                                value: position.id,
                                                                                label: `${position.name} (${position.count})`,
                                                                            }))}
                                                                            value={eventOfficialByUserId.get(card.userId)?.positionIds || []}
                                                                            onChange={(value) => handleUpdateEventOfficialEligibility(card.userId!, { positionIds: value })}
                                                                            searchable
                                                                            clearable={false}
                                                                            comboboxProps={sharedComboboxProps}
                                                                        />
                                                                        {availableOfficialFieldOptions.length > 0 && (
                                                                            <MantineMultiSelect
                                                                                label="Eligible fields"
                                                                                description="Leave empty to allow all event fields."
                                                                                data={availableOfficialFieldOptions}
                                                                                value={eventOfficialByUserId.get(card.userId)?.fieldIds || []}
                                                                                onChange={(value) => handleUpdateEventOfficialEligibility(card.userId!, { fieldIds: value })}
                                                                                searchable
                                                                                clearable
                                                                                comboboxProps={sharedComboboxProps}
                                                                            />
                                                                        )}
                                                                    </SimpleGrid>
                                                                )}
                                                                {card.status === 'failed' && (
                                                                    <Text size="xs" c="red">
                                                                        Email likely failed to send. Remove and re-add this invite to retry.
                                                                    </Text>
                                                                )}
                                                            </Stack>
                                                        </Paper>
                                                    ))}
                                                    {assignedOfficialCards.length === 0 && (
                                                        <Text size="sm" c="dimmed">No officials assigned.</Text>
                                                    )}
                                                </div>
                                            </Stack>
                                        </Paper>

                                        <Paper withBorder radius="md" p="md" bg="white">
                                            <Stack gap="sm">
                                                <Group justify="space-between" align="center">
                                                    <Title order={6}>Host Staff</Title>
                                                    <Badge radius="xl" variant="light">{assignedHostCards.length}</Badge>
                                                </Group>
                                                <div
                                                    className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                                                    onScroll={(event) => maybeExtendVisibleCountOnScroll(event, assignedHostCards.length, setHostCardVisibleCount)}
                                                >
                                                    {assignedHostCards.slice(0, hostCardVisibleCount).map((card) => (
                                                        <Paper key={card.key} withBorder radius="md" p="sm">
                                                            <Stack gap="xs">
                                                                <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                                                                    <div className="flex-1 min-w-0">
                                                                        {card.user ? (
                                                                            <UserCard user={card.user} className="!p-0 !shadow-none" />
                                                                        ) : (
                                                                            <Stack gap={2}>
                                                                                <Text fw={600}>{card.displayName}</Text>
                                                                                {card.email && <Text size="xs" c="dimmed">{card.email}</Text>}
                                                                            </Stack>
                                                                        )}
                                                                    </div>
                                                                    {card.status && (
                                                                        <Badge radius="xl" variant="light" color={getStaffStatusColor(card.status)}>
                                                                            {formatStaffStatusLabel(card.status)}
                                                                        </Badge>
                                                                    )}
                                                                </Group>
                                                                <Group gap="xs" wrap="wrap">
                                                                    <Badge variant="outline">{formatStaffRoleLabel(card.role)}</Badge>
                                                                    {card.role !== 'HOST' && (
                                                                        <Button
                                                                            type="button"
                                                                            variant="subtle"
                                                                            color="red"
                                                                            size="xs"
                                                                            disabled={card.source === 'assigned' ? isImmutableField('assistantHostIds') : false}
                                                                            onClick={() => {
                                                                                if (card.source === 'draft' && card.email) {
                                                                                    setPendingStaffInvites((prev) => prev.flatMap((invite) => {
                                                                                        if (normalizeInviteEmail(invite.email) !== normalizeInviteEmail(card.email)) {
                                                                                            return [invite];
                                                                                        }
                                                                                        const nextRoles = invite.roles.filter((role) => role !== 'ASSISTANT_HOST');
                                                                                        if (!nextRoles.length) {
                                                                                            return [];
                                                                                        }
                                                                                        return [{ ...invite, roles: nextRoles }];
                                                                                    }));
                                                                                    return;
                                                                                }
                                                                                if (card.userId) {
                                                                                    handleRemoveAssistantHost(card.userId);
                                                                                }
                                                                            }}
                                                                        >
                                                                            Remove
                                                                        </Button>
                                                                    )}
                                                                </Group>
                                                                {card.status === 'failed' && (
                                                                    <Text size="xs" c="red">
                                                                        Email likely failed to send. Remove and re-add this invite to retry.
                                                                    </Text>
                                                                )}
                                                            </Stack>
                                                        </Paper>
                                                    ))}
                                                    {assignedHostCards.length === 0 && (
                                                        <Text size="sm" c="dimmed">No host-side staff assigned.</Text>
                                                    )}
                                                </div>
                                            </Stack>
                                        </Paper>
                                    </SimpleGrid>
                                    {staffInviteError && (
                                        <Text size="xs" c="red">
                                            {staffInviteError}
                                        </Text>
                                    )}
                                </Stack>
                            </Collapse>
                        </Paper>

                        {/* Divisions */}
                        <Paper
                            id="section-division-settings"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-20 bg-gray-50"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-lg font-semibold">Divisions</h3>
                                <Button
                                    type="button"
                                    variant="subtle"
                                    size="xs"
                                    aria-expanded={!collapsedSections['section-division-settings']}
                                    aria-controls="section-division-settings-content"
                                    onClick={() => toggleSectionCollapse('section-division-settings')}
                                >
                                    {collapsedSections['section-division-settings'] ? 'Expand' : 'Collapse'}
                                </Button>
                            </div>
                            <Collapse in={!collapsedSections['section-division-settings']} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>

                            <div id="section-division-settings-content" className="mt-4 space-y-4">
                                {supportsEditableTeamSignup ? (
                                    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid="division-mode-switches">
                                        <Controller
                                            name="singleDivision"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Single Division (all skill levels play together)"
                                                    checked={field.value}
                                                    disabled={isImmutableField('singleDivision')}
                                                    onChange={(e) => {
                                                        if (isImmutableField('singleDivision')) return;
                                                        field.onChange(e?.currentTarget?.checked ?? field.value);
                                                    }}
                                                />
                                            )}
                                        />
                                        <Controller
                                            name="registrationByDivisionType"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Register by Division Type"
                                                    description="When enabled, users pick a division type and are auto-assigned to one matching division."
                                                    checked={field.value}
                                                    disabled={isImmutableField('registrationByDivisionType')}
                                                    onChange={(e) => {
                                                        if (isImmutableField('registrationByDivisionType')) return;
                                                        field.onChange(e?.currentTarget?.checked ?? field.value);
                                                    }}
                                                />
                                            )}
                                        />
                                    </div>
                                ) : showsFixedTeamEventToggle ? (
                                    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2" data-testid="division-mode-switches">
                                        <Controller
                                            name="singleDivision"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Single Division (all skill levels play together)"
                                                    checked={field.value}
                                                    disabled={isImmutableField('singleDivision')}
                                                    onChange={(e) => {
                                                        if (isImmutableField('singleDivision')) return;
                                                        field.onChange(e?.currentTarget?.checked ?? field.value);
                                                    }}
                                                />
                                            )}
                                        />
                                        <Controller
                                            name="registrationByDivisionType"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Register by Division Type"
                                                    description="When enabled, users pick a division type and are auto-assigned to one matching division."
                                                    checked={field.value}
                                                    disabled={isImmutableField('registrationByDivisionType')}
                                                    onChange={(e) => {
                                                        if (isImmutableField('registrationByDivisionType')) return;
                                                        field.onChange(e?.currentTarget?.checked ?? field.value);
                                                    }}
                                                />
                                            )}
                                        />
                                        {eventData.eventType === 'LEAGUE' ? (
                                            <Controller
                                                name="splitLeaguePlayoffDivisions"
                                                control={control}
                                                render={({ field }) => (
                                                    <Switch
                                                        label="Split League & Playoff Divisions"
                                                        description={leagueData.includePlayoffs
                                                            ? 'Configure league divisions separately from playoff bracket divisions.'
                                                            : 'Enable playoffs to configure split league/playoff divisions.'}
                                                        checked={field.value}
                                                        disabled={
                                                            splitLeaguePlayoffDivisionsLocked
                                                            || !leagueData.includePlayoffs
                                                            || (eventData.singleDivision && !hasExternalRentalField)
                                                        }
                                                        onChange={(event) => {
                                                            if (
                                                                splitLeaguePlayoffDivisionsLocked
                                                                || (eventData.singleDivision && !hasExternalRentalField)
                                                            ) {
                                                                return;
                                                            }
                                                            field.onChange(event.currentTarget.checked);
                                                        }}
                                                    />
                                                )}
                                            />
                                        ) : null}
                                        <Text size="sm" c="dimmed">
                                            Leagues and tournaments are always team events. When single division is enabled,
                                            each timeslot is automatically assigned all selected divisions.
                                        </Text>
                                    </div>
                                ) : null}
                                {eventData.singleDivision ? (
                                <div className="rounded-lg border border-gray-200 bg-white p-4">
                                    <Stack gap="md">
                                        <div>
                                            <Title order={6}>Single Division</Title>
                                            <Text size="sm" c="dimmed">
                                                Price, capacity, and payment plans apply to every selected division.
                                            </Text>
                                        </div>
                                        <motion.div
                                            id="division-defaults-content"
                                            layout
                                            className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start"
                                            transition={DIVISION_LAYOUT_TRANSITION}
                                        >
                                            <AnimatedLayoutSection in={eventData.singleDivision} className="md:col-span-3">
                                                <Controller
                                                    name="maxParticipants"
                                                    control={control}
                                                    render={({ field, fieldState }) => (
                                                        <NumberInput
                                                            label={eventData.teamSignup ? 'Max Teams' : 'Max Participants'}
                                                            min={2}
                                                            max={MAX_STANDARD_NUMBER}
                                                            value={field.value ?? ''}
                                                            w="100%"
                                                            styles={alignedDetailsFieldStyles}
                                                            clampBehavior="blur"
                                                            disabled={isImmutableField('maxParticipants')}
                                                            onChange={(val) => {
                                                                if (isImmutableField('maxParticipants')) return;
                                                                const numeric = typeof val === 'number' && Number.isFinite(val)
                                                                    ? Math.trunc(val)
                                                                    : null;
                                                                field.onChange(numeric);
                                                            }}
                                                            error={fieldState.error?.message as string | undefined}
                                                        />
                                                    )}
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs}
                                                className="md:col-span-3"
                                            >
                                                <NumberInput
                                                    label={eventData.singleDivision ? 'Playoff Team Count' : 'Default Playoff Team Count'}
                                                    min={2}
                                                    max={MAX_STANDARD_NUMBER}
                                                    w="100%"
                                                    styles={alignedDetailsFieldStyles}
                                                    value={typeof leagueData.playoffTeamCount === 'number' ? leagueData.playoffTeamCount : undefined}
                                                    disabled={isImmutableField('playoffTeamCount')}
                                                    clampBehavior="strict"
                                                    onChange={(value) => {
                                                        if (isImmutableField('playoffTeamCount')) return;
                                                        const numeric = typeof value === 'number' ? value : Number(value);
                                                        setLeagueData((prev) => ({
                                                            ...prev,
                                                            playoffTeamCount: Number.isFinite(numeric) ? Math.max(2, Math.trunc(numeric)) : undefined,
                                                        }));
                                                    }}
                                                    error={errors.leagueData?.playoffTeamCount?.message as string | undefined}
                                                />
                                                {!eventData.singleDivision ? (
                                                    <Text size="xs" c="dimmed" mt="xs">
                                                        Used as the default for new divisions.
                                                    </Text>
                                                ) : null}
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'LEAGUE'}
                                                className="md:col-span-12"
                                            >
                                                <LeagueFields
                                                    leagueData={leagueData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    participantCount={eventData.maxParticipants ?? undefined}
                                                    onLeagueDataChange={(updates) => setLeagueData((prev) => ({ ...prev, ...updates }))}
                                                    slots={[]}
                                                    onAddSlot={() => undefined}
                                                    onUpdateSlot={() => undefined}
                                                    onRemoveSlot={() => undefined}
                                                    fields={[]}
                                                    fieldsLoading={false}
                                                    showPlayoffSettings={false}
                                                    showTimeslots={false}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && !eventData.splitLeaguePlayoffDivisions}
                                                className="md:col-span-12"
                                            >
                                                <TournamentFields
                                                    title="Playoff Configuration"
                                                    tournamentData={playoffData}
                                                    setTournamentData={setPlayoffData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                                className="md:col-span-6"
                                            >
                                                <NumberInput
                                                    label="Bracket Teams"
                                                    min={2}
                                                    max={MAX_STANDARD_NUMBER}
                                                    value={singleDivisionPoolPlayDefaults.bracketTeams ?? ''}
                                                    w="100%"
                                                    styles={alignedDetailsFieldStyles}
                                                    clampBehavior="strict"
                                                    disabled={isImmutableField('divisions')}
                                                    onChange={(val) => {
                                                        if (isImmutableField('divisions')) {
                                                            return;
                                                        }
                                                        const numeric = typeof val === 'number' ? val : Number(val);
                                                        updateSingleDivisionTournamentPoolDefaults({
                                                            playoffTeamCount: Number.isFinite(numeric)
                                                                ? Math.max(2, Math.trunc(numeric))
                                                                : null,
                                                        });
                                                    }}
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                                className="md:col-span-6"
                                            >
                                                <NumberInput
                                                    label="Pool Count"
                                                    min={1}
                                                    max={MAX_STANDARD_NUMBER}
                                                    value={singleDivisionPoolPlayDefaults.poolCount ?? ''}
                                                    w="100%"
                                                    styles={alignedDetailsFieldStyles}
                                                    clampBehavior="strict"
                                                    disabled={isImmutableField('divisions')}
                                                    onChange={(val) => {
                                                        if (isImmutableField('divisions')) {
                                                            return;
                                                        }
                                                        const numeric = typeof val === 'number' ? val : Number(val);
                                                        updateSingleDivisionTournamentPoolDefaults({
                                                            poolCount: Number.isFinite(numeric)
                                                                ? Math.max(1, Math.trunc(numeric))
                                                                : null,
                                                        });
                                                    }}
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                                className="md:col-span-6"
                                            >
                                                <NumberInput
                                                    label="Pool Team Count"
                                                    value={singleDivisionPoolPlayDefaults.poolTeamCount ?? ''}
                                                    w="100%"
                                                    styles={alignedDetailsFieldStyles}
                                                    disabled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                                className="md:col-span-12"
                                            >
                                                <LeagueFields
                                                    configurationTitle="Pool Configuration"
                                                    leagueData={leagueData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    participantCount={eventData.maxParticipants ?? undefined}
                                                    onLeagueDataChange={(updates) => setLeagueData((prev) => ({ ...prev, ...updates }))}
                                                    slots={[]}
                                                    onAddSlot={() => undefined}
                                                    onUpdateSlot={() => undefined}
                                                    onRemoveSlot={() => undefined}
                                                    fields={[]}
                                                    fieldsLoading={false}
                                                    showPlayoffSettings={false}
                                                    showTimeslots={false}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT'}
                                                className="md:col-span-12"
                                            >
                                                <TournamentFields
                                                    title="Tournament Configuration"
                                                    tournamentData={tournamentData}
                                                    setTournamentData={setTournamentData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && !eventData.allowPaymentPlans}
                                                className="md:col-span-3 md:col-start-1"
                                            >
                                                <Controller
                                                    name="price"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <CentsInput
                                                            label="Price"
                                                            maxCents={MAX_PRICE_CENTS}
                                                            value={field.value}
                                                            w="100%"
                                                            onChange={(nextValue) => {
                                                                if (isImmutableField('price')) return;
                                                                field.onChange(nextValue);
                                                            }}
                                                            disabled={!hasStripeAccount || isImmutableField('price')}
                                                        />
                                                    )}
                                                />
                                                <PriceWithFeesPreview
                                                    amountCents={eventData.price}
                                                    eventType={eventData.eventType}
                                                    taxable={eventTaxableForPreview}
                                                    helperText={null}
                                                />
                                                <AnimatedSection in={organizerTaxCollectionAllowed}>
                                                    <Alert color="yellow" variant="light" mt="sm">
                                                        {eventTaxPolicyForPreview.organizerResponsibilityMessage}
                                                    </Alert>
                                                </AnimatedSection>
                                                <AnimatedSection in={isOrganizationHostedEvent || organizerTaxCollectionAllowed}>
                                                    <div className="mt-3">
                                                        <Controller
                                                            name="taxHandling"
                                                            control={control}
                                                            render={({ field }) => (
                                                                <MantineSelect
                                                                    label="Tax handling"
                                                                    value={field.value}
                                                                    data={organizerTaxCollectionAllowed
                                                                        ? [
                                                                            { value: 'INHERIT_ORG', label: 'Choose tax collection method' },
                                                                            { value: 'ORGANIZER_MANUAL_TAX', label: 'Enter a sales tax rate' },
                                                                            { value: 'ORGANIZER_STRIPE_TAX', label: 'Use Stripe Tax calculator' },
                                                                        ]
                                                                        : [
                                                                            { value: 'INHERIT_ORG', label: `Use organization default (${organizationDefaultEventTaxHandling === 'STRIPE_TAX' ? 'Stripe Tax' : 'sports registration exempt'})` },
                                                                            { value: 'STRIPE_TAX', label: 'Use Stripe Tax' },
                                                                            { value: 'EXEMPT_PARTICIPANT_SPORTS', label: 'Sports registration is exempt' },
                                                                        ]}
                                                                    onChange={(value) => {
                                                                        field.onChange(normalizeEventTaxHandling(value));
                                                                    }}
                                                                    disabled={isImmutableField('price')}
                                                                />
                                                            )}
                                                        />
                                                        <AnimatedSection in={organizerManualTaxSelected}>
                                                            <div className="mt-3">
                                                                <Controller
                                                                    name="organizerManualTaxRateBps"
                                                                    control={control}
                                                                    render={({ field }) => (
                                                                        <NumberInput
                                                                            label="Sales tax rate"
                                                                            min={0}
                                                                            max={25}
                                                                            suffix="%"
                                                                            decimalScale={3}
                                                                            value={(Number(field.value) || 0) / 100}
                                                                            w="100%"
                                                                            styles={alignedDetailsFieldStyles}
                                                                            clampBehavior="blur"
                                                                            disabled={isImmutableField('price')}
                                                                            onChange={(value) => {
                                                                                const numeric = typeof value === 'number' && Number.isFinite(value)
                                                                                    ? value
                                                                                    : Number(value);
                                                                                field.onChange(normalizeOrganizerManualTaxRateBps(numeric * 100));
                                                                            }}
                                                                        />
                                                                    )}
                                                                />
                                                            </div>
                                                        </AnimatedSection>
                                                    </div>
                                                </AnimatedSection>
                                                <AnimatedSection in={!hasStripeAccount}>
                                                    <div className="mt-2">
                                                        <button
                                                            type="button"
                                                            onClick={handleConnectStripe}
                                                            disabled={connectingStripe}
                                                            className={`px-4 py-2 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${connectingStripe ? 'bg-blue-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                        >
                                                            {connectingStripe ? (
                                                                <span className="inline-flex items-center gap-2">
                                                                    <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                                                                    Connecting...
                                                                </span>
                                                            ) : (
                                                                'Connect Stripe Account'
                                                            )}
                                                        </button>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            Connect your Stripe account to enable paid events and set a price.
                                                        </p>
                                                    </div>
                                                </AnimatedSection>
                                            </AnimatedLayoutSection>
                                            <motion.div
                                                layout
                                                className={eventData.allowPaymentPlans ? 'md:col-span-12 md:col-start-1' : 'md:col-span-9'}
                                                transition={DIVISION_LAYOUT_TRANSITION}
                                            >
                                                <div className="rounded-lg border border-gray-200 bg-white p-4">
                                                    <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
                                                        <div>
                                                            <Title order={6}>Payment Plans</Title>
                                                            <Text size="sm" c="dimmed">
                                                                Offer installments.
                                                            </Text>
                                                        </div>
                                                        <Switch
                                                            checked={eventData.allowPaymentPlans}
                                                            onChange={(e) => {
                                                                const next = e.currentTarget.checked;
                                                                setValue('allowPaymentPlans', next, { shouldDirty: true, shouldValidate: true });
                                                                if (next && (!eventData.installmentAmounts?.length || eventData.installmentAmounts.length === 0)) {
                                                                    syncInstallmentCount((eventData.installmentCount || 1));
                                                                } else if (next) {
                                                                    setValue('price', sumInstallmentAmounts(eventData.installmentAmounts), {
                                                                        shouldDirty: true,
                                                                        shouldValidate: true,
                                                                    });
                                                                }
                                                            }}
                                                            disabled={!hasStripeAccount}
                                                        />
                                                    </Group>

                                                    <AnimatedSection in={eventData.allowPaymentPlans}>
                                                        <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                                                            <Group align="flex-start" gap="md">
                                                                <NumberInput
                                                                    label="Installments"
                                                                    min={1}
                                                                    max={MAX_STANDARD_NUMBER}
                                                                    value={eventData.installmentCount || eventData.installmentAmounts.length || 1}
                                                                    onChange={(val) => syncInstallmentCount(Number(val) || 1)}
                                                                    clampBehavior="strict"
                                                                    maw={180}
                                                                />
                                                                {eventData.teamSignup && (
                                                                    <Switch
                                                                        checked={eventData.allowTeamSplitDefault}
                                                                        onChange={(e) =>
                                                                            setValue('allowTeamSplitDefault', e.currentTarget.checked, {
                                                                                shouldDirty: true,
                                                                                shouldValidate: true,
                                                                            })
                                                                        }
                                                                        label="Allow team bill splitting by default"
                                                                    />
                                                                )}
                                                            </Group>

                                                            <Stack gap="sm">
                                                                {(eventData.installmentAmounts || []).map((amount, idx) => {
                                                                    const useRelativeDueDates = eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent;
                                                                    const dueDateValue = parseLocalDateTime(
                                                                        eventData.installmentDueDates?.[idx] || eventData.start,
                                                                    );
                                                                    return (
                                                                        <Group key={idx} align="flex-end" gap="sm" wrap="wrap">
                                                                            {useRelativeDueDates ? (
                                                                                <NumberInput
                                                                                    label={`Installment ${idx + 1} due date offset`}
                                                                                    description="0 = session day; negative = days before session; positive = days after session"
                                                                                    value={eventData.installmentDueRelativeDays?.[idx] ?? 0}
                                                                                    onChange={(val) => setInstallmentDueRelativeDay(idx, Number(val) || 0)}
                                                                                    min={-MAX_STANDARD_NUMBER}
                                                                                    max={MAX_STANDARD_NUMBER}
                                                                                    clampBehavior="strict"
                                                                                    style={{ flex: '1 1 300px', maxWidth: 360 }}
                                                                                />
                                                                            ) : (
                                                                                <DateTimePicker
                                                                                    label={`Installment ${idx + 1} due`}
                                                                                    value={dueDateValue}
                                                                                    onChange={(val) => setInstallmentDueDate(idx, val)}
                                                                                    valueFormat="MM/DD/YYYY hh:mm A"
                                                                                    timePickerProps={{
                                                                                        withDropdown: true,
                                                                                        format: '12h',
                                                                                    }}
                                                                                    style={{ flex: '1 1 260px', maxWidth: 280 }}
                                                                                />
                                                                            )}
                                                                            <CentsInput
                                                                                label="Amount"
                                                                                maxCents={MAX_PRICE_CENTS}
                                                                                value={amount}
                                                                                onChange={(nextValue) => setInstallmentAmount(idx, nextValue)}
                                                                                maw={180}
                                                                            />
                                                                            <PriceWithFeesPreview
                                                                                amountCents={amount}
                                                                                baseLabel={`Installment ${idx + 1} amount`}
                                                                                eventType={eventData.eventType}
                                                                                taxable={eventTaxableForPreview}
                                                                                className="min-w-[220px] flex-[1_1_220px]"
                                                                            />
                                                                            {eventData.installmentAmounts.length > 1 && (
                                                                                <ActionIcon
                                                                                    variant="light"
                                                                                    color="red"
                                                                                    aria-label="Remove installment"
                                                                                    onClick={() => removeInstallment(idx)}
                                                                                >
                                                                                    x
                                                                                </ActionIcon>
                                                                            )}
                                                                        </Group>
                                                                    );
                                                                })}
                                                                <Group justify="space-between" align="center">
                                                                    <Button variant="light" onClick={() => syncInstallmentCount((eventData.installmentAmounts?.length || 0) + 1)}>
                                                                        Add installment
                                                                    </Button>
                                                                    <Text
                                                                        size="sm"
                                                                        c="dimmed"
                                                                    >
                                                                        Installment total: {formatBillAmount(sumInstallmentAmounts(eventData.installmentAmounts))}
                                                                    </Text>
                                                                </Group>
                                                            </Stack>
                                                        </div>
                                                    </AnimatedSection>
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    </Stack>
                                </div>
                                ) : null}
                                <div className="space-y-3">
                                    <Text size="sm" fw={600}>
                                        {divisionEditor.editingId ? 'Edit Division' : 'New Division'}
                                    </Text>
                                    <AnimatedSection in={splitDivisionEditorEnabled} collapseClassName="max-w-xs">
                                        <MantineSelect
                                            label="Division Type"
                                            data={[
                                                { value: 'LEAGUE', label: 'League' },
                                                { value: 'PLAYOFF', label: 'Playoff' },
                                            ]}
                                            value={divisionEditor.divisionKind}
                                            comboboxProps={sharedComboboxProps}
                                            disabled={isImmutableField('divisions')}
                                            onChange={handleDivisionEditorKindChange}
                                        />
                                    </AnimatedSection>
                                </div>
                                <AnimatedSection in={!splitDivisionEditorEnabled || divisionEditor.divisionKind === 'LEAGUE'}>
                                    <motion.div
                                        layout
                                        className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start"
                                        transition={DIVISION_LAYOUT_TRANSITION}
                                    >
                                    <MantineSelect
                                        label="Gender"
                                        placeholder="Select gender"
                                        data={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                                        value={divisionEditor.gender || null}
                                        className="md:col-span-4"
                                        maw={280}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        onChange={(value) => updateDivisionEditorSelection({
                                            gender: (value as '' | 'M' | 'F' | 'C') || '',
                                        })}
                                    />
                                    <MantineSelect
                                        label="Skill Division"
                                        placeholder="Select skill division"
                                        data={skillDivisionTypeSelectOptions}
                                        value={divisionEditor.skillDivisionTypeId || null}
                                        className="md:col-span-4"
                                        maw={280}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        searchable
                                        allowDeselect={false}
                                        onChange={(value) => updateDivisionEditorSelection({
                                            skillDivisionTypeId: value || '',
                                        })}
                                    />
                                    <MantineSelect
                                        label="Age Division"
                                        placeholder="Select age division"
                                        data={ageDivisionTypeSelectOptions}
                                        value={divisionEditor.ageDivisionTypeId || null}
                                        className="md:col-span-4"
                                        maw={320}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        searchable
                                        allowDeselect={false}
                                        onChange={(value) => updateDivisionEditorSelection({
                                            ageDivisionTypeId: value || '',
                                        })}
                                    />
                                    <TextInput
                                        label="Division Name"
                                        placeholder="Division display name"
                                        value={divisionEditor.name}
                                        className="md:col-span-6"
                                        maw={520}
                                        maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                        disabled={isImmutableField('divisions') || !divisionEditorReady}
                                        onChange={(event) => {
                                            const nextName = event.currentTarget.value;
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                name: nextName,
                                                nameTouched: true,
                                                error: null,
                                            }));
                                        }}
                                    />
                                    <AnimatedLayoutSection in={!eventData.singleDivision} className="md:col-span-3">
                                        <NumberInput
                                            label={eventData.teamSignup ? 'Division Max Teams' : 'Division Max Participants'}
                                            min={0}
                                            max={MAX_STANDARD_NUMBER}
                                            value={divisionEditor.maxParticipants ?? ''}
                                            w="100%"
                                            maw={220}
                                            clampBehavior="strict"
                                            disabled={isImmutableField('divisions') || !divisionEditorReady}
                                            onChange={(val) => {
                                                if (isImmutableField('divisions') || !divisionEditorReady) {
                                                    return;
                                                }
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    maxParticipants: normalizePlayoffDivisionParticipantCount(val),
                                                    error: null,
                                                }));
                                            }}
                                        />
                                        {divisionMaxParticipantsWarning ? (
                                            <Text size="xs" c="orange.7" mt={4}>
                                                {divisionMaxParticipantsWarning}
                                            </Text>
                                        ) : null}
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={!eventData.singleDivision && !divisionEditor.allowPaymentPlans}
                                        className="md:col-span-3 md:col-start-1"
                                    >
                                        <div>
                                            <CentsInput
                                                label="Division Price"
                                                maxCents={MAX_PRICE_CENTS}
                                                value={divisionEditor.price}
                                                maw={220}
                                                disabled={
                                                    isImmutableField('divisions')
                                                    || !divisionEditorReady
                                                    || !hasStripeAccount
                                                }
                                                onChange={(nextValue) => {
                                                    if (
                                                        isImmutableField('divisions')
                                                        || !divisionEditorReady
                                                        || !hasStripeAccount
                                                    ) {
                                                        return;
                                                    }
                                                    setDivisionEditor((prev) => ({
                                                        ...prev,
                                                        price: normalizePriceCents(nextValue),
                                                        error: null,
                                                    }));
                                                }}
                                            />
                                            <PriceWithFeesPreview
                                                amountCents={divisionEditor.price}
                                                eventType={eventData.eventType}
                                                taxable={eventTaxableForPreview}
                                            />
                                        </div>
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={!eventData.singleDivision}
                                        className={divisionEditor.allowPaymentPlans ? 'md:col-span-12 md:col-start-1' : 'md:col-span-9'}
                                    >
                                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                                            <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
                                                <div>
                                                    <Text fw={600} size="sm">Division Payment Plan</Text>
                                                    <Text size="xs" c="dimmed">
                                                        Configure installments for this division only.
                                                    </Text>
                                                </div>
                                                <Switch
                                                    checked={divisionEditor.allowPaymentPlans}
                                                    disabled={isImmutableField('divisions') || !divisionEditorReady || !hasStripeAccount}
                                                    onChange={(event) => {
                                                        if (isImmutableField('divisions') || !divisionEditorReady || !hasStripeAccount) {
                                                            return;
                                                        }
                                                        const checked = event.currentTarget.checked;
                                                        setDivisionEditor((prev) => ({
                                                            ...prev,
                                                            allowPaymentPlans: checked,
                                                            price: checked && prev.installmentAmounts.length
                                                                ? sumInstallmentAmounts(prev.installmentAmounts)
                                                                : prev.price,
                                                            installmentCount: checked
                                                                ? (prev.installmentCount || prev.installmentAmounts.length || 1)
                                                                : 0,
                                                            installmentDueDates: checked ? prev.installmentDueDates : [],
                                                            installmentDueRelativeDays: checked ? prev.installmentDueRelativeDays : [],
                                                            installmentAmounts: checked ? prev.installmentAmounts : [],
                                                            error: null,
                                                        }));
                                                        if (checked && (!divisionEditor.installmentAmounts || divisionEditor.installmentAmounts.length === 0)) {
                                                            syncDivisionInstallmentCount(divisionEditor.installmentCount || 1);
                                                        }
                                                    }}
                                                />
                                            </Group>

                                            <AnimatedSection in={divisionEditor.allowPaymentPlans}>
                                                <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                                                    <NumberInput
                                                        label="Installments"
                                                        min={1}
                                                        max={MAX_STANDARD_NUMBER}
                                                        value={divisionEditor.installmentCount || divisionEditor.installmentAmounts.length || 1}
                                                        onChange={(value) => syncDivisionInstallmentCount(Number(value) || 1)}
                                                        clampBehavior="strict"
                                                        maw={180}
                                                    />
                                                    <Stack gap="sm">
                                                        {(divisionEditor.installmentAmounts || []).map((amount, idx) => {
                                                            const useRelativeDueDates = eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent;
                                                            const dueDateValue = parseLocalDateTime(
                                                                divisionEditor.installmentDueDates?.[idx] || eventData.start,
                                                            );
                                                            return (
                                                                <Group key={idx} align="flex-end" gap="sm" wrap="wrap">
                                                                    {useRelativeDueDates ? (
                                                                        <NumberInput
                                                                            label={`Installment ${idx + 1} due date offset`}
                                                                            description="0 = session day; negative = days before session; positive = days after session"
                                                                            value={divisionEditor.installmentDueRelativeDays?.[idx] ?? 0}
                                                                            onChange={(value) => setDivisionInstallmentDueRelativeDay(idx, Number(value) || 0)}
                                                                            min={-MAX_STANDARD_NUMBER}
                                                                            max={MAX_STANDARD_NUMBER}
                                                                            clampBehavior="strict"
                                                                            style={{ flex: '1 1 300px', maxWidth: 360 }}
                                                                        />
                                                                    ) : (
                                                                        <DateTimePicker
                                                                            label={`Installment ${idx + 1} due`}
                                                                            value={dueDateValue}
                                                                            onChange={(value) => setDivisionInstallmentDueDate(idx, value)}
                                                                            valueFormat="MM/DD/YYYY hh:mm A"
                                                                            timePickerProps={{
                                                                                withDropdown: true,
                                                                                format: '12h',
                                                                            }}
                                                                            style={{ flex: '1 1 260px', maxWidth: 280 }}
                                                                        />
                                                                    )}
                                                                    <CentsInput
                                                                        label="Amount"
                                                                        maxCents={MAX_PRICE_CENTS}
                                                                        value={amount}
                                                                        onChange={(nextValue) => setDivisionInstallmentAmount(idx, nextValue)}
                                                                        maw={180}
                                                                    />
                                                                    <PriceWithFeesPreview
                                                                        amountCents={amount}
                                                                        baseLabel={`Installment ${idx + 1} amount`}
                                                                        eventType={eventData.eventType}
                                                                        taxable={eventTaxableForPreview}
                                                                        className="min-w-[220px] flex-[1_1_220px]"
                                                                    />
                                                                    {divisionEditor.installmentAmounts.length > 1 && (
                                                                        <ActionIcon
                                                                            variant="light"
                                                                            color="red"
                                                                            aria-label="Remove division installment"
                                                                            onClick={() => removeDivisionInstallment(idx)}
                                                                        >
                                                                            ×
                                                                        </ActionIcon>
                                                                    )}
                                                                </Group>
                                                            );
                                                        })}
                                                        <Group justify="space-between" align="center">
                                                            <Button
                                                                variant="light"
                                                                onClick={() => syncDivisionInstallmentCount((divisionEditor.installmentAmounts?.length || 0) + 1)}
                                                            >
                                                                Add installment
                                                            </Button>
                                                            <Text
                                                                size="sm"
                                                                c="dimmed"
                                                            >
                                                                Installment total: {formatBillAmount(sumInstallmentAmounts(divisionEditor.installmentAmounts))}
                                                            </Text>
                                                        </Group>
                                                    </Stack>
                                                </div>
                                            </AnimatedSection>
                                        </div>
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'LEAGUE' && !eventData.singleDivision}
                                        className="md:col-span-12"
                                    >
                                        <LeagueFields
                                            leagueData={divisionEditor.leagueConfig}
                                            sport={eventData.sportConfig ?? undefined}
                                            participantCount={divisionEditor.maxParticipants ?? undefined}
                                            onLeagueDataChange={setDivisionEditorLeagueConfig}
                                            slots={[]}
                                            onAddSlot={() => undefined}
                                            onUpdateSlot={() => undefined}
                                            onRemoveSlot={() => undefined}
                                            fields={[]}
                                            fieldsLoading={false}
                                            showPlayoffSettings={false}
                                            showTimeslots={false}
                                            unstyled
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'LEAGUE' && !eventData.singleDivision && leagueData.includePlayoffs}
                                        className="md:col-span-3"
                                    >
                                        <NumberInput
                                            label="Division Playoff Team Count"
                                            min={2}
                                            max={MAX_STANDARD_NUMBER}
                                            w="100%"
                                            styles={alignedDetailsFieldStyles}
                                            maw={220}
                                            value={divisionEditor.playoffTeamCount ?? ''}
                                            clampBehavior="strict"
                                            disabled={
                                                isImmutableField('divisions')
                                                || !divisionEditorReady
                                            }
                                            onChange={(val) => {
                                                if (
                                                    isImmutableField('divisions')
                                                    || !divisionEditorReady
                                                ) {
                                                    return;
                                                }
                                                const numeric = typeof val === 'number' ? val : Number(val);
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    playoffTeamCount: Number.isFinite(numeric)
                                                        ? Math.max(2, Math.trunc(numeric))
                                                        : null,
                                                    error: null,
                                                }));
                                            }}
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={
                                            eventData.eventType === 'LEAGUE'
                                            && !eventData.singleDivision
                                            && leagueData.includePlayoffs
                                            && !eventData.splitLeaguePlayoffDivisions
                                        }
                                        className="md:col-span-12"
                                    >
                                        <TournamentFields
                                            title="Playoff Configuration"
                                            tournamentData={buildTournamentConfig(divisionEditor.playoffConfig)}
                                            setTournamentData={setDivisionEditorPlayoffConfig}
                                            sport={eventData.sportConfig ?? undefined}
                                            unstyled
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={splitDivisionEditorEnabled && typeof divisionEditor.playoffTeamCount === 'number' && divisionEditor.playoffTeamCount > 0}
                                        className="md:col-span-9"
                                    >
                                        <div className="space-y-2">
                                            <Text size="sm" fw={600}>Playoff Placement Mapping</Text>
                                            {playoffDivisionSelectOptions.length === 0 ? (
                                                <Text size="xs" c="red">
                                                    Add a playoff division before mapping placements.
                                                </Text>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    {Array.from({ length: Math.max(0, Math.trunc(divisionEditor.playoffTeamCount ?? 0)) }).map((_, placementIndex) => (
                                                        <MantineSelect
                                                            key={`editor-placement-${placementIndex}`}
                                                            label={`Placement #${placementIndex + 1}`}
                                                            placeholder="Select playoff division"
                                                            data={playoffDivisionSelectOptions}
                                                            value={normalizeDivisionKeys([
                                                                divisionEditor.playoffPlacementDivisionIds?.[placementIndex] ?? '',
                                                            ])[0] ?? null}
                                                            comboboxProps={sharedComboboxProps}
                                                            disabled={isImmutableField('divisions')}
                                                            onChange={(value) => {
                                                                const normalizedValue = normalizeDivisionKeys([value ?? ''])[0] ?? '';
                                                                setDivisionEditor((prev) => {
                                                                    const nextMapping = [...prev.playoffPlacementDivisionIds];
                                                                    while (nextMapping.length <= placementIndex) {
                                                                        nextMapping.push('');
                                                                    }
                                                                    nextMapping[placementIndex] = normalizedValue;
                                                                    return {
                                                                        ...prev,
                                                                        playoffPlacementDivisionIds: nextMapping,
                                                                        error: null,
                                                                    };
                                                                });
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && !eventData.singleDivision}
                                        className="md:col-span-6"
                                    >
                                        <NumberInput
                                            label="Bracket Teams"
                                            min={2}
                                            max={MAX_STANDARD_NUMBER}
                                            value={divisionEditor.playoffTeamCount ?? ''}
                                            w="100%"
                                            styles={alignedDetailsFieldStyles}
                                            clampBehavior="strict"
                                            disabled={isImmutableField('divisions') || !divisionEditorReady}
                                            onChange={(val) => {
                                                if (isImmutableField('divisions') || !divisionEditorReady) {
                                                    return;
                                                }
                                                const numeric = typeof val === 'number' ? val : Number(val);
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    playoffTeamCount: Number.isFinite(numeric)
                                                        ? Math.max(2, Math.trunc(numeric))
                                                        : null,
                                                    error: null,
                                                }));
                                            }}
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && !eventData.singleDivision}
                                        className="md:col-span-6"
                                    >
                                        <NumberInput
                                            label="Pool Count"
                                            min={1}
                                            max={MAX_STANDARD_NUMBER}
                                            value={divisionEditor.poolCount ?? ''}
                                            w="100%"
                                            styles={alignedDetailsFieldStyles}
                                            clampBehavior="strict"
                                            disabled={isImmutableField('divisions') || !divisionEditorReady}
                                            onChange={(val) => {
                                                if (isImmutableField('divisions') || !divisionEditorReady) {
                                                    return;
                                                }
                                                const numeric = typeof val === 'number' ? val : Number(val);
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    poolCount: Number.isFinite(numeric)
                                                        ? Math.max(1, Math.trunc(numeric))
                                                        : null,
                                                    error: null,
                                                }));
                                            }}
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && !eventData.singleDivision}
                                        className="md:col-span-6"
                                    >
                                        <NumberInput
                                            label="Pool Team Count"
                                            value={derivePoolTeamCount(
                                                eventData.singleDivision
                                                    ? eventData.maxParticipants
                                                    : divisionEditor.maxParticipants,
                                                divisionEditor.poolCount,
                                            ) ?? ''}
                                            w="100%"
                                            styles={alignedDetailsFieldStyles}
                                            disabled
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                        className="md:col-span-12"
                                    >
                                        <LeagueFields
                                            configurationTitle="Pool Configuration"
                                            leagueData={divisionEditor.leagueConfig}
                                            sport={eventData.sportConfig ?? undefined}
                                            participantCount={divisionEditor.maxParticipants ?? undefined}
                                            onLeagueDataChange={setDivisionEditorLeagueConfig}
                                            slots={[]}
                                            onAddSlot={() => undefined}
                                            onUpdateSlot={() => undefined}
                                            onRemoveSlot={() => undefined}
                                            fields={[]}
                                            fieldsLoading={false}
                                            showPlayoffSettings={false}
                                            showTimeslots={false}
                                            unstyled
                                        />
                                    </AnimatedLayoutSection>
                                    <AnimatedLayoutSection
                                        in={eventData.eventType === 'TOURNAMENT' && !eventData.singleDivision}
                                        className="md:col-span-12"
                                    >
                                        <TournamentFields
                                            title="Tournament Configuration"
                                            tournamentData={buildTournamentConfig(divisionEditor.playoffConfig)}
                                            setTournamentData={setDivisionEditorPlayoffConfig}
                                            sport={eventData.sportConfig ?? undefined}
                                            unstyled
                                        />
                                    </AnimatedLayoutSection>
                                </motion.div>
                                <AnimatedLayoutSection in={eventData.singleDivision}>
                                    <Text size="xs" c="dimmed">
                                        {eventData.eventType === 'LEAGUE'
                                            ? 'Division price, capacity, payment plan, league schedule settings, and playoff settings apply to the single combined schedule.'
                                            : eventData.eventType === 'TOURNAMENT'
                                                ? 'Division price, capacity, payment plan, and pool-play settings apply to every selected division while single division is enabled.'
                                                : 'Division price, capacity, and payment plan mirror event-level values while single division is enabled.'}
                                    </Text>
                                </AnimatedLayoutSection>
                                </AnimatedSection>
                                <AnimatedSection in={splitDivisionEditorEnabled && divisionEditor.divisionKind === 'PLAYOFF'}>
                                    <motion.div
                                        layout
                                        className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start"
                                        transition={DIVISION_LAYOUT_TRANSITION}
                                    >
                                        <TextInput
                                            label="Playoff Division Name"
                                            placeholder="Division display name"
                                            value={divisionEditor.name}
                                            className="md:col-span-6"
                                            maw={520}
                                            maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                            disabled={isImmutableField('divisions')}
                                            onChange={(event) => {
                                                const nextName = event.currentTarget.value;
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    name: nextName,
                                                    nameTouched: true,
                                                    error: null,
                                                }));
                                            }}
                                        />
                                        <NumberInput
                                            label={eventData.teamSignup ? 'Teams Count' : 'Participants Count'}
                                            value={divisionEditor.maxParticipants ?? ''}
                                            max={MAX_STANDARD_NUMBER}
                                            maw={220}
                                            clampBehavior="none"
                                            disabled={isImmutableField('divisions')}
                                            className="md:col-span-3"
                                            onChange={(value) => {
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    maxParticipants: normalizePlayoffDivisionParticipantCount(value),
                                                    error: null,
                                                }));
                                            }}
                                        />
                                        <div className="md:col-span-12">
                                            <TournamentFields
                                                title="Playoff Configuration"
                                                tournamentData={buildTournamentConfig(divisionEditor.playoffConfig)}
                                                setTournamentData={setDivisionEditorPlayoffConfig}
                                                sport={eventData.sportConfig ?? undefined}
                                                unstyled
                                            />
                                        </div>
                                    </motion.div>
                                </AnimatedSection>
                                <Group justify="space-between" align="center">
                                    <Button
                                        variant="light"
                                        onClick={handleSaveDivisionDetail}
                                        disabled={isImmutableField('divisions')}
                                    >
                                        {divisionEditor.editingId ? 'Update Division' : 'Add Division'}
                                    </Button>
                                    {divisionEditor.editingId ? (
                                        <Button variant="subtle" color="gray" onClick={resetDivisionEditor}>
                                            Cancel Edit
                                        </Button>
                                    ) : null}
                                </Group>
                                {divisionEditor.error && (
                                    <Text size="sm" c="red">
                                        {divisionEditor.error}
                                    </Text>
                                )}
                                {errors.divisions?.message && (
                                    <Text size="sm" c="red">
                                        {errors.divisions.message as string}
                                    </Text>
                                )}
                                {errors.divisionDetails?.message && (
                                    <Text size="sm" c="red">
                                        {errors.divisionDetails.message as string}
                                    </Text>
                                )}
                                {splitDivisionEditorEnabled && (eventData.playoffDivisionDetails || []).length === 0 ? (
                                    <Alert color="yellow" radius="md">
                                        Add at least one playoff division before saving split league/playoff divisions.
                                    </Alert>
                                ) : null}
                                {errors.playoffDivisionDetails?.message && (
                                    <Text size="sm" c="red">
                                        {errors.playoffDivisionDetails.message as string}
                                    </Text>
                                )}
                                <div className="space-y-3">
                                    <Text size="sm" fw={600}>Divisions</Text>
                                    {(eventData.divisionDetails || []).length === 0
                                        && (!splitDivisionEditorEnabled || (eventData.playoffDivisionDetails || []).length === 0) ? (
                                        <Text size="sm" c="dimmed">
                                            No divisions added yet.
                                        </Text>
                                    ) : (
                                        <ResponsiveCardGrid maxCardWidth={300}>
                                            {(eventData.divisionDetails || []).map((detail) => {
                                                const effectiveDivisionPrice = eventData.singleDivision
                                                    ? Math.max(0, eventData.price || 0)
                                                    : Math.max(0, detail.price || 0);
                                                const effectiveDivisionCapacity = eventData.singleDivision
                                                    ? Math.max(2, Math.trunc(eventData.maxParticipants || 2))
                                                    : Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2));
                                                const effectiveDivisionPlayoffTeamCount = eventData.eventType === 'TOURNAMENT'
                                                    ? (typeof detail.playoffTeamCount === 'number'
                                                        ? Math.max(2, Math.trunc(detail.playoffTeamCount))
                                                        : undefined)
                                                    : eventData.singleDivision
                                                        ? (typeof leagueData.playoffTeamCount === 'number'
                                                            ? Math.max(2, Math.trunc(leagueData.playoffTeamCount))
                                                            : undefined)
                                                        : (typeof detail.playoffTeamCount === 'number'
                                                            ? Math.max(2, Math.trunc(detail.playoffTeamCount))
                                                            : undefined);
                                                const effectivePoolCount = typeof detail.poolCount === 'number'
                                                    ? Math.max(1, Math.trunc(detail.poolCount))
                                                    : undefined;
                                                const effectivePoolTeamCount = detail.poolTeamCount
                                                    ?? derivePoolTeamCount(effectiveDivisionCapacity, effectivePoolCount);
                                                const effectiveDivisionAllowPaymentPlans = eventData.singleDivision
                                                    ? Boolean(eventData.allowPaymentPlans)
                                                    : Boolean(detail.allowPaymentPlans);
                                                const effectiveDivisionInstallmentAmounts = effectiveDivisionAllowPaymentPlans
                                                    ? (
                                                        eventData.singleDivision
                                                            ? (eventData.installmentAmounts || [])
                                                            : (detail.installmentAmounts || [])
                                                    ).map((value) => Math.max(0, Number(value) || 0))
                                                    : [];
                                                const effectiveDivisionInstallmentCount = effectiveDivisionAllowPaymentPlans
                                                    ? (
                                                        eventData.singleDivision
                                                            ? (eventData.installmentCount || effectiveDivisionInstallmentAmounts.length || 0)
                                                            : (detail.installmentCount || effectiveDivisionInstallmentAmounts.length || 0)
                                                    )
                                                    : 0;
                                                const divisionTypeSummary = [
                                                    detail.skillDivisionTypeName,
                                                    detail.ageDivisionTypeName,
                                                ]
                                                    .map((part) => String(part ?? '').trim())
                                                    .filter(Boolean)
                                                    .join(' ')
                                                    || detail.divisionTypeName
                                                    || 'Open 18+';
                                                const mappedPlacementCount = normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds)
                                                    .filter(Boolean)
                                                    .length;
                                                return (
                                                    <Paper key={detail.id} withBorder radius={0} p="sm" className="bg-white">
                                                        <div className="space-y-3">
                                                            <div className="space-y-1">
                                                                <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                                                                    <Text fw={700} size="sm" lineClamp={2}>{detail.name}</Text>
                                                                    <Badge size="sm" radius="sm" variant="light">League</Badge>
                                                                </Group>
                                                                <Text size="xs" c="dimmed">Division Type: League</Text>
                                                                <Text size="xs" c="dimmed">{divisionTypeSummary}</Text>
                                                                <Text size="xs" c="dimmed">
                                                                    {`Price: ${formatPrice(effectiveDivisionPrice)} • ${eventData.teamSignup ? 'Max teams' : 'Max participants'}: ${effectiveDivisionCapacity}`}
                                                                </Text>
                                                                <Text size="xs" c="dimmed">
                                                                    {effectiveDivisionAllowPaymentPlans
                                                                        ? `Payment plan: ${effectiveDivisionInstallmentCount || effectiveDivisionInstallmentAmounts.length || 0} installment(s) totaling ${formatBillAmount(effectiveDivisionInstallmentAmounts.reduce((sum, value) => sum + (Number(value) || 0), 0))}`
                                                                        : 'Payment plan: disabled'}
                                                                </Text>
                                                                {eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && (
                                                                    <Text size="xs" c="dimmed">
                                                                        {`Playoff teams: ${effectiveDivisionPlayoffTeamCount ?? 'Not set'}`}
                                                                    </Text>
                                                                )}
                                                                {splitDivisionEditorEnabled && typeof effectiveDivisionPlayoffTeamCount === 'number' ? (
                                                                    <Text size="xs" c="dimmed">
                                                                        {`Mapped placements: ${mappedPlacementCount}/${effectiveDivisionPlayoffTeamCount}`}
                                                                    </Text>
                                                                ) : null}
                                                                {eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && (
                                                                    <Text size="xs" c="dimmed">
                                                                        {`Bracket teams: ${effectiveDivisionPlayoffTeamCount ?? 'Not set'} - Pools: ${effectivePoolCount ?? 'Not set'} - Pool teams: ${effectivePoolTeamCount ?? 'Not set'}`}
                                                                    </Text>
                                                                )}
                                                                {detail.ageCutoffLabel && (
                                                                    <Text size="xs" c="dimmed">
                                                                        {detail.ageCutoffLabel}
                                                                    </Text>
                                                                )}
                                                            </div>
                                                            <Group gap="xs" justify="flex-end">
                                                                <Button
                                                                    size="xs"
                                                                    variant="subtle"
                                                                    onClick={() => handleEditDivisionDetail(detail.id)}
                                                                    disabled={isImmutableField('divisions')}
                                                                >
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="subtle"
                                                                    color="red"
                                                                    onClick={() => handleRemoveDivisionDetail(detail.id)}
                                                                    disabled={isImmutableField('divisions')}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </Group>
                                                        </div>
                                                    </Paper>
                                                );
                                            })}
                                            {splitDivisionEditorEnabled
                                                ? (eventData.playoffDivisionDetails || []).map((playoffDivision) => {
                                                    const playoffConfig = buildTournamentConfig(playoffDivision.playoffConfig);
                                                    return (
                                                        <Paper key={playoffDivision.id} withBorder radius={0} p="sm" className="bg-white">
                                                            <div className="space-y-3">
                                                                <div className="space-y-1">
                                                                    <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                                                                        <Text fw={700} size="sm" lineClamp={2}>{playoffDivision.name}</Text>
                                                                        <Badge size="sm" radius="sm" variant="light" color="grape">Playoff</Badge>
                                                                    </Group>
                                                                    <Text size="xs" c="dimmed">Division Type: Playoff</Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        {`${eventData.teamSignup ? 'Teams' : 'Participants'} count: ${formatPlayoffDivisionParticipantCount(playoffDivision.maxParticipants)}`}
                                                                    </Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        {playoffConfig.doubleElimination ? 'Format: Double elimination' : 'Format: Single elimination'}
                                                                    </Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        {`Rest time: ${playoffConfig.restTimeMinutes ?? 0} min`}
                                                                    </Text>
                                                                </div>
                                                                <Group gap="xs" justify="flex-end">
                                                                    <Button
                                                                        size="xs"
                                                                        variant="subtle"
                                                                        onClick={() => handleEditPlayoffDivisionDetail(playoffDivision.id)}
                                                                        disabled={isImmutableField('divisions')}
                                                                    >
                                                                        Edit
                                                                    </Button>
                                                                    <Button
                                                                        size="xs"
                                                                        variant="subtle"
                                                                        color="red"
                                                                        onClick={() => handleRemovePlayoffDivision(playoffDivision.id)}
                                                                        disabled={isImmutableField('divisions')}
                                                                    >
                                                                        Remove
                                                                    </Button>
                                                                </Group>
                                                            </div>
                                                        </Paper>
                                                    );
                                                })
                                                : null}
                                        </ResponsiveCardGrid>
                                    )}

                                    {playoffDivisionCapacityWarnings.length > 0 && (
                                        <Alert color="yellow" radius="md">
                                            <Stack gap={2}>
                                                {playoffDivisionCapacityWarnings.map((warning) => (
                                                    <Text key={warning} size="sm">{warning}</Text>
                                                ))}
                                            </Stack>
                                        </Alert>
                                    )}
                                </div>
                            </div>

                            </Collapse>
                        </Paper>

                        <LeagueScoringConfigSection
                            visible={showScoringConfigSection}
                            collapsed={collapsedSections['section-league-scoring-config']}
                            title={scoringConfigSectionLabel}
                            value={eventData.leagueScoringConfig}
                            sport={eventData.sportConfig ?? undefined}
                            editable={!isImmutableField('leagueScoringConfig')}
                            onToggle={() => toggleSectionCollapse('section-league-scoring-config')}
                            onChange={handleLeagueScoringConfigChange}
                        />

                        <AnimatedSection in={showScheduleConfig}>
                            <Paper
                                id="section-schedule-config"
                                shadow="xs"
                                radius="md"
                                withBorder
                                p="lg"
                                className="scroll-mt-20 bg-gray-50"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold">Schedule</h3>
                                    <Button
                                        type="button"
                                        variant="subtle"
                                        size="xs"
                                        aria-expanded={!collapsedSections['section-schedule-config']}
                                        aria-controls="section-schedule-config-content"
                                        onClick={() => toggleSectionCollapse('section-schedule-config')}
                                    >
                                        {collapsedSections['section-schedule-config'] ? 'Expand' : 'Collapse'}
                                    </Button>
                                </div>
                                <Collapse in={!collapsedSections['section-schedule-config']} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                                    <div id="section-schedule-config-content" className="mt-4 space-y-6">
                                        {!isSchedulableEventType && usesRentalSlots ? (
                                            <div className="rounded-lg border border-gray-200 bg-white p-4">
                                                <Text fw={600} size="sm">Rental Slot Schedule</Text>
                                                <Text size="sm" c="dimmed">
                                                    This event uses pre-booked rental slots. Slot scheduling is managed by the rental reservation.
                                                </Text>
                                                <Text size="sm" c="dimmed" mt="xs">
                                                    Linked slots: {immutableTimeSlots.length}
                                                </Text>
                                            </div>
                                        ) : null}

                                        {isWeeklyChildEvent ? (
                                            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                                                <Text fw={600} size="sm">Weekly Session Schedule</Text>
                                                <Text size="sm" c="dimmed">
                                                    Older parent-linked weekly rows use fixed start/end times from the selected session. New weekly registrations use the parent event slot and occurrence date.
                                                </Text>
                                                <Controller
                                                    name="selectedFieldIds"
                                                    control={control}
                                                    render={({ field, fieldState }) => (
                                                        <FacilityResourceSelector
                                                            label="Session Resources"
                                                            description="Choose which resources this weekly child session can use."
                                                            placeholder={resourceSelectorLoading ? 'Loading resources...' : 'Select one or more resources'}
                                                            fields={selectedFields}
                                                            value={Array.isArray(field.value) ? field.value : []}
                                                            disabled={resourceSelectorLoading || isImmutableField('fieldIds')}
                                                            loading={resourceSelectorLoading}
                                                            eventOrganizationId={organizationHostedEventId}
                                                            onChange={(values) => {
                                                                if (isImmutableField('fieldIds')) return;
                                                                field.onChange(values);
                                                            }}
                                                            error={fieldState.error?.message || rentalResourcesError}
                                                        />
                                                    )}
                                                />
                                            </div>
                                        ) : null}

                                        {isSchedulableEventType ? (
                                            <div className="space-y-4">
                                                <AnimatedSection in={isOrganizationManagedEvent}>
                                                    <Text size="xs" c="dimmed">
                                                        Select event resources directly inside each timeslot.
                                                    </Text>
                                                </AnimatedSection>

                                                <LeagueFields
                                                    leagueData={leagueData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    participantCount={eventData.singleDivision
                                                        ? (eventData.maxParticipants ?? 0)
                                                        : (() => {
                                                            const total = (eventData.divisionDetails || []).reduce((sum, detail) => (
                                                                sum + Math.max(0, Math.trunc(detail.maxParticipants || 0))
                                                            ), 0);
                                                            return total > 0 ? total : (eventData.maxParticipants ?? 0);
                                                        })()}
                                                    onLeagueDataChange={(updates) => setLeagueData(prev => ({ ...prev, ...updates }))}
                                                    slots={leagueSlots}
                                                    onAddSlot={handleAddSlot}
                                                    onUpdateSlot={handleUpdateSlot}
                                                    onRemoveSlot={handleRemoveSlot}
                                                    onAutoResolveSlotConflict={handleAutoResolveSlotConflict}
                                                    fields={selectedFields}
                                                    fieldsLoading={resourceSelectorLoading}
                                                    fieldOptions={leagueFieldOptions}
                                                    divisionOptions={divisionOptions}
                                                    eventStartDate={eventData.start}
                                                    lockSlotDivisions={Boolean(eventData.singleDivision)}
                                                    lockedDivisionKeys={slotDivisionKeys}
                                                    readOnly={hasImmutableTimeSlots}
                                                    allowDivisionEditsWhenReadOnly={hasExternalRentalField && !eventData.singleDivision}
                                                    allowResourceEditsWhenReadOnly={hasExternalRentalField}
                                                    showPlayoffSettings={false}
                                                    showLeagueConfiguration={false}
                                                    emptyFieldsMessage={isOrganizationManagedEvent
                                                        ? 'No resources found. Create a resource on the Organizations page first, then return here to attach weekly availability.'
                                                        : undefined}
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                </Collapse>
                            </Paper>
                        </AnimatedSection>
                    </form>
                </div>

                {/* Footer */}
                <div className="border-t p-6 flex justify-between items-center">
                    <div className="flex flex-col gap-3">
                        {leagueWarning && (
                            <Alert color="yellow" radius="md">
                                {leagueWarning}
                            </Alert>
                        )}
                        {leagueError && (
                            <Alert color="red" radius="md">
                                {leagueError}
                            </Alert>
                        )}
                    </div>
                </div>
            </div>
        </div>
            </div>
        </div>
    );

    if (!open) {
        return null;
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            {sheetContent}
        </div>
    );
});

EventForm.displayName = 'EventForm';

export default EventForm;
