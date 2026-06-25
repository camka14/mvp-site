import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Button, Select as MantineSelect, Paper, Alert, Text, ActionIcon, Group, Modal, Checkbox, PasswordInput, Stack, Collapse, Progress, TextInput, Textarea } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { QrCode } from 'lucide-react';
import {
    BillingAddress,
    Event,
    UserData,
    Team,
    TimeSlot,
    getEventDateTime,
    getUserAvatarUrl,
    getUserFullName,
    getUserHandle,
    getTeamAvatarUrl,
    PaymentIntent,
    getEventImageFallbackUrl,
    getEventImageUrl,
    formatEventDivisionPriceRange,
    formatPrice,
    RegistrationQuestion,
    RegistrationQuestionAnswerInput,
} from '@/types';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { ApiError, authService } from '@/lib/auth';
import { eventService, type EventParticipantRegistrationEntry, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { billService } from '@/lib/billService';
import { createId } from '@/lib/id';
import { boldsignService, SignStep } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { familyService, FamilyChild } from '@/lib/familyService';
import { registrationService, type DivisionRegistrationSelection, ConsentLinks, EventRegistration } from '@/lib/registrationService';
import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime } from '@/lib/dateUtils';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { buildDivisionCapacityBreakdown, isDivisionAtCapacity, resolveDivisionCapacitySnapshot } from '@/lib/divisionCapacity';
import {
    buildDivisionToken,
    cleanDivisionDisplayName,
    deriveDivisionTypeDisplayName,
    evaluateDivisionAgeEligibility,
    extractDivisionTokenFromId,
    inferDivisionDetails,
    normalizeDivisionGender,
    normalizeDivisionRatingType,
    parseDivisionToken,
} from '@/lib/divisionTypes';
import { buildDivisionDisplayNameIndex, resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import { collectOrganizationHostIds } from '@/lib/organizationEventAccess';
import { useApp } from '@/app/providers';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
import UserCard from '@/components/ui/UserCard';
import TeamRegistrationFlow from '@/components/ui/TeamRegistrationFlow';
import RegistrationHoldTimer from '@/components/ui/RegistrationHoldTimer';
import {
    buildRegistrationProgressKey,
    clearRegistrationProgress,
    loadRegistrationProgress,
    saveRegistrationProgress,
    type RegistrationProgressStep,
} from '@/lib/registrationProgressStorage';
// Replaced shadcn Select with Mantine Select

interface EventDetailSheetProps {
    event: Event;
    isOpen: boolean;
    onClose: () => void;
    renderInline?: boolean;
    selectedOccurrence?: WeeklyOccurrenceSelection | null;
    onWeeklyOccurrenceChange?: (occurrence: { slotId: string; occurrenceDate: string } | null) => void;
    publicCompletion?: {
        slug: string;
        redirectUrl?: string | null;
    };
}

const SHEET_POPOVER_Z_INDEX = 1800;
const SIGN_MODAL_Z_INDEX = SHEET_POPOVER_Z_INDEX + 200;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const JOIN_API_TIMEOUT_MS = 5_000;
const WEEKLY_SESSION_VISIBLE_ROWS = 10;
const WEEKLY_SESSION_CARD_HEIGHT_PX = 72;
const WEEKLY_SESSION_CARD_GAP_PX = 8;
const WEEKLY_SESSION_LIST_MAX_HEIGHT_PX = (
    WEEKLY_SESSION_VISIBLE_ROWS * WEEKLY_SESSION_CARD_HEIGHT_PX
) + ((WEEKLY_SESSION_VISIBLE_ROWS - 1) * WEEKLY_SESSION_CARD_GAP_PX);

type JoinIntent = {
    mode: 'user' | 'team' | 'child' | 'child_free_agent' | 'user_waitlist' | 'team_waitlist' | 'child_waitlist';
    team?: Team | null;
    childId?: string;
    childEmail?: string | null;
    answers?: RegistrationQuestionAnswerInput[];
};

type PaymentPlanPreviewState = {
    intent: JoinIntent;
    ownerLabel: string;
};

type PendingEventCheckoutState = {
    event: Event;
    team?: Team;
    selection?: DivisionRegistrationSelection;
    answers?: RegistrationQuestionAnswerInput[];
    discountCode?: string | null;
};

type LoadEventDetailsOptions = {
    automatic?: boolean;
};

type AuthModalMode = 'login' | 'signup';

type AuthModalFormState = {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    userName: string;
    dateOfBirth: string;
};

const emptyAuthModalForm: AuthModalFormState = {
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    userName: '',
    dateOfBirth: '',
};

const isChildJoinIntent = (intent: JoinIntent): boolean => (
    intent.mode === 'child' || intent.mode === 'child_free_agent' || intent.mode === 'child_waitlist'
);

const dedupeSignSteps = (steps: SignStep[], fallbackSignerContext: 'participant' | 'parent_guardian' | 'child'): SignStep[] => {
    const seen = new Set<string>();
    return steps.filter((step) => {
        const key = `${step.signerContext ?? fallbackSignerContext}:${step.templateId}:${step.documentId ?? ''}:${step.type}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const normalizeRequestToken = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

const buildEventDetailsLoadKey = (
    eventId: unknown,
    occurrence?: WeeklyOccurrenceSelection,
): string | null => {
    const normalizedEventId = normalizeRequestToken(eventId);
    if (!normalizedEventId) {
        return null;
    }

    const slotId = normalizeRequestToken(occurrence?.slotId);
    const occurrenceDate = normalizeRequestToken(occurrence?.occurrenceDate);
    return slotId && occurrenceDate
        ? `${normalizedEventId}:${slotId}:${occurrenceDate}`
        : `${normalizedEventId}:all`;
};

const parseDateValue = (value?: string | Date | number | null): Date | null => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value === 'number') {
        const parsedNumber = new Date(value);
        return Number.isNaN(parsedNumber.getTime()) ? null : parsedNumber;
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        if (![year, month, day].some(Number.isNaN)) {
            return new Date(year, (month ?? 1) - 1, day ?? 1);
        }
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

type WeeklySessionOption = {
    id: string;
    slotId: string;
    occurrenceDate: string;
    start: Date;
    end: Date;
    label: string;
    divisionLabel: string;
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const startOfWeekMonday = (value: Date): Date => {
    const copy = new Date(value.getTime());
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - toMondayIndex(copy));
    return copy;
};

const addDays = (value: Date, days: number): Date => {
    const copy = new Date(value.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
};

const toIsoDateString = (value: Date): string => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatWeeklyTimeLabel = (value: Date): string => (
    value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        .replace(' ', '')
        .toLowerCase()
);

const formatWeeklySessionLabel = (start: Date, end: Date): string => {
    const dateLabel = `${start.toLocaleDateString('en-US', { weekday: 'short' })} ${start.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}`;
    return `${dateLabel}, ${formatWeeklyTimeLabel(start)}-${formatWeeklyTimeLabel(end)}`;
};

const buildWeeklySessionOptions = (event: Event | null, weeks: number = 3): WeeklySessionOption[] => {
    if (!event || event.eventType !== 'WEEKLY_EVENT' || !Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
        return [];
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sessions: WeeklySessionOption[] = [];
    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? null;
    const divisionNameIndex = buildDivisionDisplayNameIndex(event.divisionDetails);
    const resolveDivisionNames = (entries: unknown[]): string[] => {
        const labels: string[] = [];
        const seen = new Set<string>();

        entries.forEach((entry) => {
            const divisionId = getDivisionIdFromEventEntry(entry);
            const fromDivisionId = divisionId
                ? resolveDivisionDisplayName({
                    division: divisionId,
                    divisionNameIndex,
                    sportInput,
                })
                : null;
            const fromEntryString = typeof entry === 'string'
                ? resolveDivisionDisplayName({
                    division: entry,
                    divisionNameIndex,
                    sportInput,
                })
                : null;
            const fromObjectName = entry && typeof entry === 'object'
                ? (() => {
                    const row = entry as Record<string, unknown>;
                    return typeof row.name === 'string' ? row.name : null;
                })()
                : null;

            const label = (fromDivisionId ?? fromEntryString ?? fromObjectName ?? '').trim();
            if (!label.length) {
                return;
            }
            const dedupeKey = label.toLowerCase();
            if (seen.has(dedupeKey)) {
                return;
            }
            seen.add(dedupeKey);
            labels.push(label);
        });

        return labels;
    };
    const fallbackDivisionNames = resolveDivisionNames(Array.isArray(event.divisions) ? event.divisions : []);

    event.timeSlots.forEach((slot) => {
        const slotStartDate = parseDateValue(slot.startDate ?? null);
        if (!slotStartDate) {
            return;
        }
        slotStartDate.setHours(0, 0, 0, 0);
        const slotEndDate = parseDateValue(slot.endDate ?? null);
        if (slotEndDate) {
            slotEndDate.setHours(0, 0, 0, 0);
        }

        const normalizedDays = Array.from(
            new Set(
                (
                    Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
                        ? slot.daysOfWeek
                        : typeof slot.dayOfWeek === 'number'
                            ? [slot.dayOfWeek]
                            : []
                )
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
            ),
        ).sort((left, right) => left - right);
        const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
        const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
        if (!normalizedDays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
            return;
        }
        const slotDivisionNames = resolveDivisionNames(
            Array.isArray(slot.divisions) && slot.divisions.length
                ? slot.divisions
                : (Array.isArray(event.divisions) ? event.divisions : []),
        );
        const divisionLabel = (slotDivisionNames.length ? slotDivisionNames : fallbackDivisionNames).join(', ') || 'All divisions';

        const anchor = new Date(Math.max(now.getTime(), slotStartDate.getTime()));
        const anchorWeek = startOfWeekMonday(anchor);

        for (let weekOffset = 0; weekOffset < weeks; weekOffset += 1) {
            const weekStart = addDays(anchorWeek, weekOffset * 7);
            normalizedDays.forEach((weekday) => {
                const occurrence = addDays(weekStart, weekday);
                if (occurrence < anchor || occurrence < slotStartDate) {
                    return;
                }
                if (slotEndDate && occurrence > slotEndDate) {
                    return;
                }
                const sessionStart = new Date(occurrence.getTime());
                sessionStart.setHours(0, startMinutes, 0, 0);
                const sessionEnd = new Date(occurrence.getTime());
                sessionEnd.setHours(0, endMinutes, 0, 0);

                sessions.push({
                    id: `${slot.$id}-${toIsoDateString(occurrence)}`,
                    slotId: String(slot.$id ?? ''),
                    occurrenceDate: toIsoDateString(occurrence),
                    start: sessionStart,
                    end: sessionEnd,
                    label: formatWeeklySessionLabel(sessionStart, sessionEnd),
                    divisionLabel,
                });
            });
        }
    });

    return sessions.sort((left, right) => left.start.getTime() - right.start.getTime());
};

const resolveSelectedWeeklySessionOption = (
    event: Event | null,
    selection: WeeklyOccurrenceSelection | null,
): WeeklySessionOption | null => {
    if (!event || !selection) {
        return null;
    }
    const selectedSlotId = typeof selection.slotId === 'string' ? selection.slotId.trim() : '';
    const selectedOccurrenceDate = typeof selection.occurrenceDate === 'string' ? selection.occurrenceDate.trim() : '';
    if (!selectedSlotId || !selectedOccurrenceDate) {
        return null;
    }

    const occurrenceDate = parseDateValue(selectedOccurrenceDate);
    if (!occurrenceDate) {
        return null;
    }
    occurrenceDate.setHours(0, 0, 0, 0);

    const originalTimeSlots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
    const matchingSlot = originalTimeSlots.find((slot) => String(slot?.$id ?? '').trim() === selectedSlotId);
    if (!matchingSlot) {
        return null;
    }

    const slotStartDate = parseDateValue(matchingSlot.startDate ?? null);
    const slotEndDate = parseDateValue(matchingSlot.endDate ?? null);
    if (!slotStartDate) {
        return null;
    }
    slotStartDate.setHours(0, 0, 0, 0);
    if (slotEndDate) {
        slotEndDate.setHours(0, 0, 0, 0);
    }

    const normalizedDays = Array.from(
        new Set(
            (Array.isArray(matchingSlot.daysOfWeek) && matchingSlot.daysOfWeek.length
                ? matchingSlot.daysOfWeek
                : Number.isInteger(matchingSlot.dayOfWeek)
                    ? [matchingSlot.dayOfWeek]
                    : [])
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
        ),
    ).sort((left, right) => left - right);
    const startMinutes = typeof matchingSlot.startTimeMinutes === 'number' ? matchingSlot.startTimeMinutes : null;
    const endMinutes = typeof matchingSlot.endTimeMinutes === 'number' ? matchingSlot.endTimeMinutes : null;
    if (!normalizedDays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
    }
    if (!normalizedDays.includes(toMondayIndex(occurrenceDate))) {
        return null;
    }
    if (occurrenceDate < slotStartDate) {
        return null;
    }
    if (slotEndDate && occurrenceDate > slotEndDate) {
        return null;
    }

    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? null;
    const divisionNameIndex = buildDivisionDisplayNameIndex(event.divisionDetails);
    const slotDivisionEntries = Array.isArray(matchingSlot.divisions) && matchingSlot.divisions.length
        ? matchingSlot.divisions
        : (Array.isArray(event.divisions) ? event.divisions : []);
    const divisionLabel = slotDivisionEntries
        .map((entry) => {
            const resolved = resolveDivisionDisplayName({
                division: getDivisionIdFromEventEntry(entry) ?? (typeof entry === 'string' ? entry : null),
                divisionNameIndex,
                sportInput,
            });
            if (resolved) {
                return resolved;
            }
            if (entry && typeof entry === 'object') {
                const candidate = entry as { name?: unknown };
                return typeof candidate.name === 'string' ? candidate.name : null;
            }
            return null;
        })
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .filter((value, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
        .join(', ') || 'All divisions';

    const start = new Date(occurrenceDate.getTime());
    start.setHours(0, startMinutes, 0, 0);
    const end = new Date(occurrenceDate.getTime());
    end.setHours(0, endMinutes, 0, 0);

    return {
        id: `${selectedSlotId}-${selectedOccurrenceDate}`,
        slotId: selectedSlotId,
        occurrenceDate: selectedOccurrenceDate,
        start,
        end,
        label: formatWeeklySessionLabel(start, end),
        divisionLabel,
    };
};

const normalizeUserId = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const collectUniqueUserIds = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    const ids = value
        .map((entry) => normalizeUserId(entry))
        .filter((entry): entry is string => Boolean(entry));
    return Array.from(new Set(ids));
};

const normalizeEmailValue = (value?: string | null): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
};

type DivisionSelectionPayload = {
    divisionId?: string;
    divisionTypeId?: string;
    divisionTypeKey?: string;
};

type EventDivisionOption = {
    id: string;
    key: string;
    name: string;
    divisionTypeId: string;
    divisionTypeName: string;
    divisionTypeKey: string;
    ratingType: 'AGE' | 'SKILL';
    gender: 'M' | 'F' | 'C';
    priceCents?: number;
    maxParticipants?: number;
    playoffTeamCount?: number;
    allowPaymentPlans?: boolean;
    installmentCount?: number;
    installmentDueDates?: string[];
    installmentDueRelativeDays?: number[];
    installmentAmounts?: number[];
    sportId?: string;
    ageCutoffDate?: string;
    ageCutoffLabel?: string;
    ageCutoffSource?: string;
};

const isPaymentFailedRegistration = (registration: EventParticipantRegistrationEntry): boolean =>
    String(registration.status ?? '').trim().toUpperCase() === 'PAYMENT_FAILED';

const collectPaymentFailedRegistrationState = (
    registrations: {
        teams?: EventParticipantRegistrationEntry[];
        users?: EventParticipantRegistrationEntry[];
        children?: EventParticipantRegistrationEntry[];
    } | undefined,
    currentUserId: string | null,
): { userFailed: boolean; teamIds: string[] } => {
    const normalizedUserId = normalizeUserId(currentUserId);
    const failedUsers = (registrations?.users ?? []).filter(isPaymentFailedRegistration);
    const failedTeams = (registrations?.teams ?? []).filter(isPaymentFailedRegistration);

    return {
        userFailed: Boolean(
            normalizedUserId &&
            failedUsers.some((registration) => normalizeUserId(registration.registrantId) === normalizedUserId),
        ),
        teamIds: Array.from(new Set(
            failedTeams
                .map((registration) => normalizeUserId(registration.registrantId))
                .filter((teamId): teamId is string => Boolean(teamId)),
        )),
    };
};

type EventDivisionDetail = NonNullable<Event['divisionDetails']>[number];

const normalizeDivisionKey = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
};

const getNormalizedDivisionAliases = (value: unknown): string[] => {
    const normalized = normalizeDivisionKey(value);
    if (!normalized) {
        return [];
    }
    const aliases = new Set([normalized]);
    const token = extractDivisionTokenFromId(normalized);
    if (token) {
        aliases.add(token);
    }
    return Array.from(aliases);
};

const getDivisionDetailAliases = (detail: Pick<EventDivisionDetail, 'id' | 'key'>): string[] => {
    const aliases = new Set<string>();
    getNormalizedDivisionAliases(detail.id).forEach((alias) => aliases.add(alias));
    getNormalizedDivisionAliases(detail.key).forEach((alias) => aliases.add(alias));
    return Array.from(aliases);
};

const isPlayoffDivisionDetail = (detail: Pick<EventDivisionDetail, 'kind'> | null | undefined): boolean => (
    normalizeDivisionKey(detail?.kind) === 'playoff'
);

const stripTournamentPoolSuffix = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const stripped = value.trim().replace(/[\s_-]+pool[\s_-]*[a-z0-9]+$/i, '').trim();
    return stripped.length > 0 ? stripped : null;
};

const inferTournamentBracketIdFromPoolId = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
        return null;
    }
    const stripped = trimmed.replace(/[\s_-]+pool[\s_-]*[a-z0-9]+$/i, '').trim();
    return stripped.length > 0 && stripped !== trimmed ? stripped : null;
};

const getFirstTournamentPoolPlacementId = (detail: Pick<EventDivisionDetail, 'playoffPlacementDivisionIds'>): string | null => {
    if (!Array.isArray(detail.playoffPlacementDivisionIds)) {
        return null;
    }
    return detail.playoffPlacementDivisionIds
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .find((entry) => entry.length > 0) ?? null;
};

const getTournamentPoolBracketId = (detail: EventDivisionDetail): string | null => (
    getFirstTournamentPoolPlacementId(detail)
    ?? inferTournamentBracketIdFromPoolId(detail.id)
    ?? inferTournamentBracketIdFromPoolId(detail.key)
);

const hasTournamentPoolPlayRegistration = (event: Event, detailRows: EventDivisionDetail[]): boolean => {
    const eventType = typeof event.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
    const includePools = typeof event.includePlayoffsOrPools === 'boolean'
        ? event.includePlayoffsOrPools
        : event.includePlayoffs === true;
    if (eventType !== 'TOURNAMENT' || !includePools) {
        return false;
    }
    return detailRows.some((detail) => !isPlayoffDivisionDetail(detail) && Boolean(getTournamentPoolBracketId(detail)))
        || (Array.isArray(event.divisions) && event.divisions.some((entry) => {
            const divisionId = getDivisionIdFromEventEntry(entry);
            return Boolean(inferTournamentBracketIdFromPoolId(divisionId));
        }));
};

const dedupeDivisionDetails = (rows: EventDivisionDetail[]): EventDivisionDetail[] => {
    const seen = new Set<string>();
    const deduped: EventDivisionDetail[] = [];
    rows.forEach((row) => {
        const aliases = getDivisionDetailAliases(row);
        const identity = aliases[0] ?? normalizeDivisionKey(row.name);
        if (!identity || seen.has(identity)) {
            return;
        }
        aliases.forEach((alias) => seen.add(alias));
        deduped.push(row);
    });
    return deduped;
};

const buildTournamentBracketRegistrationRows = (
    event: Event,
    detailRows: EventDivisionDetail[],
    playoffRows: EventDivisionDetail[],
): EventDivisionDetail[] => {
    const explicitBracketRows = dedupeDivisionDetails([
        ...playoffRows,
        ...detailRows.filter(isPlayoffDivisionDetail),
    ]);
    if (explicitBracketRows.length > 0) {
        return explicitBracketRows;
    }

    const detailsByAlias = new Map<string, EventDivisionDetail>();
    detailRows.forEach((detail) => {
        getDivisionDetailAliases(detail).forEach((alias) => detailsByAlias.set(alias, detail));
    });

    const poolRows = new Map<string, EventDivisionDetail>();
    detailRows
        .filter((detail) => !isPlayoffDivisionDetail(detail) && Boolean(getTournamentPoolBracketId(detail)))
        .forEach((detail) => {
            const id = normalizeDivisionKey(detail.id) ?? normalizeDivisionKey(detail.key);
            if (id) {
                poolRows.set(id, detail);
            }
        });

    if (Array.isArray(event.divisions)) {
        event.divisions.forEach((entry) => {
            const divisionId = getDivisionIdFromEventEntry(entry);
            if (!divisionId || poolRows.has(divisionId)) {
                return;
            }
            const bracketId = inferTournamentBracketIdFromPoolId(divisionId);
            if (!bracketId) {
                return;
            }
            const detail = detailsByAlias.get(divisionId) ?? {
                id: divisionId,
                key: divisionId,
                name: stripTournamentPoolSuffix(divisionId) ?? divisionId,
                playoffPlacementDivisionIds: [bracketId],
            };
            poolRows.set(divisionId, detail);
        });
    }

    const bracketRows = new Map<string, EventDivisionDetail>();
    poolRows.forEach((pool) => {
        const bracketId = getTournamentPoolBracketId(pool);
        const normalizedBracketId = normalizeDivisionKey(bracketId);
        if (!bracketId || !normalizedBracketId || bracketRows.has(normalizedBracketId)) {
            return;
        }
        const existingBracketDetail = getNormalizedDivisionAliases(bracketId)
            .map((alias) => detailsByAlias.get(alias))
            .find((detail): detail is EventDivisionDetail => Boolean(detail));
        const bracketKey = stripTournamentPoolSuffix(pool.key)
            ?? extractDivisionTokenFromId(bracketId)
            ?? bracketId;
        const bracketName = stripTournamentPoolSuffix(pool.name)
            ?? stripTournamentPoolSuffix(pool.key)
            ?? stripTournamentPoolSuffix(pool.id)
            ?? bracketId;
        const sourceDetail = existingBracketDetail ?? pool;
        bracketRows.set(normalizedBracketId, {
            ...sourceDetail,
            id: bracketId,
            key: existingBracketDetail?.key ?? bracketKey,
            kind: 'PLAYOFF',
            name: existingBracketDetail?.name ?? bracketName,
            playoffPlacementDivisionIds: [],
        });
    });

    return Array.from(bracketRows.values());
};

const normalizePriceCents = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.round(parsed));
};

const normalizeInstallmentAmountsCents = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => normalizePriceCents(entry))
        .filter((entry) => entry >= 0);
};

const normalizeInstallmentDueDateValues = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => parseDateValue(typeof entry === 'string' ? entry : String(entry ?? '')))
        .filter((entry): entry is Date => Boolean(entry))
        .map((entry) => entry.toISOString());
};

const normalizeInstallmentDueRelativeDayValues = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.trunc(entry));
};

const formatInstallmentDueDateLabel = (value: string): string => {
    const parsed = parseDateValue(value);
    if (!parsed) {
        return 'TBD';
    }
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatPaymentPlanPreviewPrice = (amountCents: number): string => `${formatPrice(amountCents)} + fees`;

const formatInstallmentRelativeDueDayLabel = (offsetDays: number): string => {
    if (!Number.isFinite(offsetDays) || offsetDays === 0) {
        return 'Session day';
    }
    const absDays = Math.abs(Math.trunc(offsetDays));
    const unit = absDays === 1 ? 'day' : 'days';
    return offsetDays > 0
        ? `${absDays} ${unit} after session`
        : `${absDays} ${unit} before session`;
};

const getDivisionIdFromEventEntry = (entry: unknown): string | null => {
    if (typeof entry === 'string') {
        return normalizeDivisionKey(entry);
    }
    if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        return normalizeDivisionKey(row.id)
            ?? normalizeDivisionKey(row.$id)
            ?? normalizeDivisionKey(row.key)
            ?? normalizeDivisionKey(row.name);
    }
    return null;
};

const buildDivisionOptionsForEvent = (event: Event | null): EventDivisionOption[] => {
    if (!event) {
        return [];
    }
    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? '';
    const referenceDate = parseDateValue(event.start ?? null);
    const baseDetailRows = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
    const playoffRows = Array.isArray(event.playoffDivisionDetails) ? event.playoffDivisionDetails : [];
    const tournamentBracketRows = hasTournamentPoolPlayRegistration(event, baseDetailRows)
        ? buildTournamentBracketRegistrationRows(event, baseDetailRows, playoffRows)
        : [];
    const useTournamentBracketRegistration = tournamentBracketRows.length > 0;
    const detailRows = useTournamentBracketRegistration
        ? tournamentBracketRows
        : baseDetailRows.filter((detail) => !isPlayoffDivisionDetail(detail));
    const playoffAliases = new Set<string>();
    if (!useTournamentBracketRegistration) {
        [...baseDetailRows, ...playoffRows]
            .filter(isPlayoffDivisionDetail)
            .forEach((detail) => {
                getDivisionDetailAliases(detail).forEach((alias) => playoffAliases.add(alias));
            });
    }
    const defaultPriceCents = normalizePriceCents(event.price);
    const defaultAllowPaymentPlans = Boolean(event.allowPaymentPlans);
    const defaultInstallmentAmounts = normalizeInstallmentAmountsCents(event.installmentAmounts);
    const defaultInstallmentDueDates = normalizeInstallmentDueDateValues(event.installmentDueDates);
    const defaultInstallmentDueRelativeDays = normalizeInstallmentDueRelativeDayValues((event as any).installmentDueRelativeDays);
    const defaultInstallmentCount = Number.isFinite(Number(event.installmentCount))
        ? Math.max(0, Math.trunc(Number(event.installmentCount)))
        : defaultInstallmentAmounts.length;
    const detailsById = new Map<string, NonNullable<Event['divisionDetails']>[number]>();
    const detailsByKey = new Map<string, NonNullable<Event['divisionDetails']>[number]>();
    detailRows.forEach((detail) => {
        const detailId = normalizeDivisionKey(detail?.id);
        const detailKey = normalizeDivisionKey(detail?.key);
        if (detailId) {
            detailsById.set(detailId, detail);
            const token = extractDivisionTokenFromId(detailId);
            if (token) {
                detailsByKey.set(token, detail);
            }
        }
        if (detailKey) {
            detailsByKey.set(detailKey, detail);
        }
    });

    const divisionIds = useTournamentBracketRegistration
        ? []
        : Array.isArray(event.divisions)
            ? Array.from(
                new Set(
                    event.divisions
                        .map(getDivisionIdFromEventEntry)
                        .filter((entry): entry is string => Boolean(entry))
                        .filter((entry) => !getNormalizedDivisionAliases(entry).some((alias) => playoffAliases.has(alias))),
                ),
            )
            : [];

    const orderedIds = divisionIds.length
        ? divisionIds
        : Array.from(detailsById.keys());

    const options: EventDivisionOption[] = [];
    const seen = new Set<string>();

    orderedIds.forEach((divisionId) => {
        const row = detailsById.get(divisionId)
            ?? detailsByKey.get(divisionId)
            ?? detailsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
            ?? null;

        const inferred = inferDivisionDetails({
            identifier: (row?.key ?? row?.id ?? divisionId) as string,
            sportInput,
            fallbackName: typeof row?.name === 'string' ? row.name : undefined,
        });

        const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
        const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
        const divisionTypeId = normalizeDivisionKey(row?.divisionTypeId) ?? inferred.divisionTypeId;
        const key = normalizeDivisionKey(row?.key) ?? inferred.token;
        const parsedKey = parseDivisionToken(key);
        const divisionTypeKey = parsedKey
            ? key
            : buildDivisionToken({ gender, ratingType, divisionTypeId });
        const ageEligibility = evaluateDivisionAgeEligibility({
            divisionTypeId,
            sportInput: row?.sportId ?? sportInput,
            referenceDate: referenceDate ?? undefined,
        });

        const option: EventDivisionOption = {
            id: row?.id ?? divisionId,
            key,
            name: cleanDivisionDisplayName(row?.name, inferred.defaultName),
            divisionTypeId,
            divisionTypeName: deriveDivisionTypeDisplayName({
                sportInput,
                gender,
                ratingType,
                divisionTypeId,
            }),
            divisionTypeKey,
            ratingType,
            gender,
            priceCents: typeof row?.price === 'number'
                ? normalizePriceCents(row.price)
                : defaultPriceCents,
            maxParticipants: typeof row?.maxParticipants === 'number'
                ? Math.max(2, Math.trunc(row.maxParticipants))
                : undefined,
            playoffTeamCount: typeof row?.playoffTeamCount === 'number'
                ? Math.max(2, Math.trunc(row.playoffTeamCount))
                : undefined,
            allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
                ? row.allowPaymentPlans
                : defaultAllowPaymentPlans,
            installmentCount: (() => {
                if (typeof row?.installmentCount === 'number') {
                    return Math.max(0, Math.trunc(row.installmentCount));
                }
                return defaultInstallmentCount;
            })(),
            installmentDueDates: (() => {
                const normalized = normalizeInstallmentDueDateValues(row?.installmentDueDates);
                if (normalized.length) {
                    return normalized;
                }
                return [...defaultInstallmentDueDates];
            })(),
            installmentDueRelativeDays: (() => {
                const normalized = normalizeInstallmentDueRelativeDayValues(row?.installmentDueRelativeDays);
                if (normalized.length) {
                    return normalized;
                }
                return [...defaultInstallmentDueRelativeDays];
            })(),
            installmentAmounts: (() => {
                const normalized = normalizeInstallmentAmountsCents(row?.installmentAmounts);
                if (normalized.length) {
                    return normalized;
                }
                return [...defaultInstallmentAmounts];
            })(),
            sportId: row?.sportId ?? (sportInput || undefined),
            ageCutoffDate: typeof row?.ageCutoffDate === 'string'
                ? row.ageCutoffDate
                : (ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : undefined),
            ageCutoffLabel: typeof row?.ageCutoffLabel === 'string'
                ? row.ageCutoffLabel
                : ageEligibility.message ?? undefined,
            ageCutoffSource: typeof row?.ageCutoffSource === 'string'
                ? row.ageCutoffSource
                : (ageEligibility.applies ? ageEligibility.cutoffRule.source : undefined),
        };

        if (seen.has(option.id)) {
            return;
        }
        seen.add(option.id);
        options.push(option);
    });

    return options;
};

type ReadOnlyDetailField = {
    label: string;
    value: string;
};

const uniqueNonEmptyStrings = (values: Array<string | null | undefined>): string[] => {
    const normalizedValues = values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0);
    return Array.from(new Set(normalizedValues));
};

const formatReadOnlyValueList = (
    values: Array<string | null | undefined>,
    emptyText: string = 'None',
): string => {
    const normalizedValues = uniqueNonEmptyStrings(values);
    return normalizedValues.length > 0 ? normalizedValues.join(', ') : emptyText;
};

const getOrganizationName = (organization: Event['organization'] | null | undefined): string | null => {
    if (organization && typeof organization === 'object' && typeof organization.name === 'string') {
        const normalized = organization.name.trim();
        return normalized.length > 0 ? normalized : null;
    }
    return null;
};

const getSportLabel = (event: Event): string => {
    const rawSport: unknown = (event as { sport?: unknown }).sport;
    if (typeof rawSport === 'string' && rawSport.trim().length > 0) {
        return rawSport.trim();
    }
    if (
        rawSport
        && typeof rawSport === 'object'
        && typeof (rawSport as { name?: unknown }).name === 'string'
        && ((rawSport as { name: string }).name).trim().length > 0
    ) {
        return (rawSport as { name: string }).name.trim();
    }
    if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
        return event.sportId.trim();
    }
    return 'TBD';
};

const formatRegistrationCutoffSummary = (value: number | null | undefined): string => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0) {
        return 'No cutoff';
    }
    return `${Math.trunc(hours)}h before start`;
};

const formatRefundSummary = (value: number | null | undefined): string => {
    if (value == null) {
        return 'Automatic refunds disabled';
    }
    const hours = Number(value);
    if (!Number.isFinite(hours)) {
        return 'Automatic refunds disabled';
    }
    return hours <= 0 ? 'Until event start' : `${Math.trunc(hours)}h before start`;
};

const formatOfficialSchedulingModeLabel = (value: Event['officialSchedulingMode']): string => {
    switch (value) {
        case 'STAFFING':
            return 'Staffing first';
        case 'TEAM_STAFFING':
            return 'Team staffing';
        case 'SCHEDULE':
            return 'Schedule first';
        case 'OFF':
            return 'Ignore staffing conflicts';
        default:
            return 'Schedule first';
    }
};

const formatMinutesTo12Hour = (totalMinutes: number): string => {
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hour24 = Math.floor(normalizedMinutes / 60);
    const minute = normalizedMinutes % 60;
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};

const formatSlotTimeRange = (
    startMinutes: number | null | undefined,
    endMinutes: number | null | undefined,
): string => {
    const startLabel = typeof startMinutes === 'number' ? formatMinutesTo12Hour(startMinutes) : 'Start not set';
    const endLabel = typeof endMinutes === 'number' ? formatMinutesTo12Hour(endMinutes) : 'End not set';
    return `${startLabel} - ${endLabel}`;
};

const getDayOfWeekLabel = (day: number): string => {
    switch (day) {
        case 0:
            return 'Monday';
        case 1:
            return 'Tuesday';
        case 2:
            return 'Wednesday';
        case 3:
            return 'Thursday';
        case 4:
            return 'Friday';
        case 5:
            return 'Saturday';
        case 6:
            return 'Sunday';
        default:
            return 'Unassigned day';
    }
};

const buildScheduleTimeslotGroups = (slots: TimeSlot[]): Array<[number, TimeSlot[]]> => {
    if (!slots.length) {
        return [];
    }

    const grouped = new Map<number, TimeSlot[]>();
    slots.forEach((slot) => {
        const sourceDays = (
            Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
                ? slot.daysOfWeek
                : typeof slot.dayOfWeek === 'number'
                    ? [slot.dayOfWeek]
                    : []
        )
            .map((value): number => Number(value))
            .filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6);
        const normalizedDays = Array.from(new Set<number>(sourceDays));
        const targetDays = normalizedDays.length > 0 ? normalizedDays : [-1];
        targetDays.forEach((day) => {
            const existing = grouped.get(day) ?? [];
            existing.push(slot);
            grouped.set(day, existing);
        });
    });

    const dayOrder = [0, 1, 2, 3, 4, 5, 6, -1];
    return Array.from(grouped.entries())
        .sort((left, right) => dayOrder.indexOf(left[0]) - dayOrder.indexOf(right[0]))
        .map(([day, daySlots]) => [
            day,
            [...daySlots].sort((left, right) => {
                const leftStart = typeof left.startTimeMinutes === 'number' ? left.startTimeMinutes : Number.MAX_SAFE_INTEGER;
                const rightStart = typeof right.startTimeMinutes === 'number' ? right.startTimeMinutes : Number.MAX_SAFE_INTEGER;
                if (leftStart !== rightStart) {
                    return leftStart - rightStart;
                }
                const leftEnd = typeof left.endTimeMinutes === 'number' ? left.endTimeMinutes : Number.MAX_SAFE_INTEGER;
                const rightEnd = typeof right.endTimeMinutes === 'number' ? right.endTimeMinutes : Number.MAX_SAFE_INTEGER;
                return leftEnd - rightEnd;
            }),
        ]);
};

function ReadOnlyDetailsGrid({ items }: { items: ReadOnlyDetailField[] }) {
    const visibleItems = items.filter((item) => item.value.trim().length > 0);
    if (!visibleItems.length) {
        return null;
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleItems.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                    <Text size="sm" c="dimmed">{item.label}</Text>
                    <Text fw={600}>{item.value}</Text>
                </div>
            ))}
        </div>
    );
}

export default function EventDetailSheet({
    event,
    isOpen,
    onClose,
    renderInline = false,
    selectedOccurrence = null,
    onWeeklyOccurrenceChange,
    publicCompletion,
}: EventDetailSheetProps) {
    const { user, authUser, refreshSession } = useApp();
    const router = useRouter();
    const [detailedEvent, setDetailedEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<UserData[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [freeAgents, setFreeAgents] = useState<UserData[]>([]);
    const [currentUserPaymentFailed, setCurrentUserPaymentFailed] = useState(false);
    const [paymentFailedTeamIds, setPaymentFailedTeamIds] = useState<string[]>([]);
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
    const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
    const [showFreeAgentsDropdown, setShowFreeAgentsDropdown] = useState(false);
    const [showCapacityBreakdown, setShowCapacityBreakdown] = useState(false);
    const [selectedFreeAgentActionUser, setSelectedFreeAgentActionUser] = useState<UserData | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
    const [registrationHoldExpiresAt, setRegistrationHoldExpiresAt] = useState<string | null>(null);
    const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
    const [showDiscountCodeModal, setShowDiscountCodeModal] = useState(false);
    const [discountCode, setDiscountCode] = useState('');
    const [pendingEventCheckout, setPendingEventCheckout] = useState<PendingEventCheckoutState | null>(null);
    const [confirmingPurchase, setConfirmingPurchase] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signLinks, setSignLinks] = useState<SignStep[]>([]);
    const [currentSignIndex, setCurrentSignIndex] = useState(0);
    const [pendingJoin, setPendingJoin] = useState<JoinIntent | null>(null);
    const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);
    const [pendingSignatureOperationId, setPendingSignatureOperationId] = useState<string | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [confirmingPassword, setConfirmingPassword] = useState(false);
    const [recordingSignature, setRecordingSignature] = useState(false);
    const [textAccepted, setTextAccepted] = useState(false);
    const [children, setChildren] = useState<FamilyChild[]>([]);
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [childrenError, setChildrenError] = useState<string | null>(null);
    const [selectedChildId, setSelectedChildId] = useState('');
    const [registeringChild, setRegisteringChild] = useState(false);
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(false);
    const [childRegistration, setChildRegistration] = useState<EventRegistration | null>(null);
    const [childConsent, setChildConsent] = useState<ConsentLinks | null>(null);
    const [childRegistrationChildId, setChildRegistrationChildId] = useState<string | null>(null);
    const [showJoinChoiceModal, setShowJoinChoiceModal] = useState(false);
    const [showRegistrationQuestionsModal, setShowRegistrationQuestionsModal] = useState(false);
    const [registrationQuestions, setRegistrationQuestions] = useState<RegistrationQuestion[]>([]);
    const [registrationQuestionAnswers, setRegistrationQuestionAnswers] = useState<Record<string, string>>({});
    const [registrationQuestionsIntent, setRegistrationQuestionsIntent] = useState<JoinIntent | null>(null);
    const [paymentPlanPreview, setPaymentPlanPreview] = useState<PaymentPlanPreviewState | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
    const [authModalForm, setAuthModalForm] = useState<AuthModalFormState>(emptyAuthModalForm);
    const [authModalLoading, setAuthModalLoading] = useState(false);
    const [authModalError, setAuthModalError] = useState('');
    const [authVerificationEmail, setAuthVerificationEmail] = useState('');
    const [authVerificationMessage, setAuthVerificationMessage] = useState('');
    const [authVerificationMessageType, setAuthVerificationMessageType] = useState<'info' | 'success'>('info');
    const [authResendingVerification, setAuthResendingVerification] = useState(false);
    const [showQrCodeModal, setShowQrCodeModal] = useState(false);
    const [hostUser, setHostUser] = useState<UserData | null>(null);
    const eventRef = React.useRef<Event | null>(event);
    const loadedEventDetailsKeyRef = useRef<string | null>(null);

    // Team-signup join controls
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');

    const currentEvent = detailedEvent || event;
    useEffect(() => {
        if (!currentEvent?.$id || (!isOpen && !renderInline)) {
            setRegistrationQuestions([]);
            setRegistrationQuestionAnswers({});
            return undefined;
        }

        let cancelled = false;
        const loadQuestions = async () => {
            try {
                const questions = await teamService.getRegistrationQuestions('EVENT', currentEvent.$id);
                if (cancelled) {
                    return;
                }
                setRegistrationQuestions(questions);
                setRegistrationQuestionAnswers((current) => {
                    const next = { ...current };
                    questions.forEach((question) => {
                        if (!(question.id in next)) {
                            next[question.id] = '';
                        }
                    });
                    return next;
                });
            } catch {
                if (!cancelled) {
                    setRegistrationQuestions([]);
                    setRegistrationQuestionAnswers({});
                }
            }
        };
        void loadQuestions();
        return () => {
            cancelled = true;
        };
    }, [currentEvent?.$id, isOpen, renderInline]);

    const currentEventPublicUrl = React.useMemo(
        () => (currentEvent?.$id ? buildEventPublicUrl(currentEvent.$id) : ''),
        [currentEvent?.$id],
    );
    const currentOrganizationLogoId = React.useMemo(() => {
        const organization = currentEvent.organization;
        if (organization && typeof organization === 'object' && typeof organization.logoId === 'string') {
            return organization.logoId;
        }
        return null;
    }, [currentEvent.organization]);
    const isWeeklyParentEvent = currentEvent.eventType === 'WEEKLY_EVENT' && !currentEvent.parentEvent;
    const weeklySessionOptions = React.useMemo(
        () => (isWeeklyParentEvent ? buildWeeklySessionOptions(currentEvent, 3) : []),
        [currentEvent, isWeeklyParentEvent],
    );
    const normalizedSelectedOccurrence = React.useMemo<WeeklyOccurrenceSelection | null>(() => {
        const slotId = typeof selectedOccurrence?.slotId === 'string' ? selectedOccurrence.slotId.trim() : '';
        const occurrenceDate = typeof selectedOccurrence?.occurrenceDate === 'string' ? selectedOccurrence.occurrenceDate.trim() : '';
        if (!slotId || !occurrenceDate) {
            return null;
        }
        return { slotId, occurrenceDate };
    }, [selectedOccurrence?.occurrenceDate, selectedOccurrence?.slotId]);
    const selectedWeeklyOccurrenceOption = React.useMemo(
        () => (
            normalizedSelectedOccurrence
                ? weeklySessionOptions.find((option) => (
                    option.slotId === normalizedSelectedOccurrence.slotId
                    && option.occurrenceDate === normalizedSelectedOccurrence.occurrenceDate
                )) ?? resolveSelectedWeeklySessionOption(currentEvent, normalizedSelectedOccurrence)
                : null
        ),
        [currentEvent, normalizedSelectedOccurrence, weeklySessionOptions],
    );
    const selectedWeeklyOccurrence = React.useMemo<WeeklyOccurrenceSelection | undefined>(
        () => {
            if (!selectedWeeklyOccurrenceOption) {
                return undefined;
            }
            return {
                slotId: selectedWeeklyOccurrenceOption.slotId,
                occurrenceDate: selectedWeeklyOccurrenceOption.occurrenceDate,
            };
        },
        [selectedWeeklyOccurrenceOption],
    );
    const selectedWeeklyOccurrenceSlotId = selectedWeeklyOccurrence?.slotId ?? null;
    const selectedWeeklyOccurrenceDate = selectedWeeklyOccurrence?.occurrenceDate ?? null;
    const weeklySelectionRequired = isWeeklyParentEvent && !selectedWeeklyOccurrence;
    const eventRegistrationProgressKey = React.useMemo(() => buildRegistrationProgressKey({
        scope: 'event',
        userId: user?.$id,
        subjectId: currentEvent?.$id,
        slotId: selectedWeeklyOccurrenceSlotId,
        occurrenceDate: selectedWeeklyOccurrenceDate,
    }), [currentEvent?.$id, selectedWeeklyOccurrenceDate, selectedWeeklyOccurrenceSlotId, user?.$id]);
    const saveEventRegistrationProgress = useCallback((patch: {
        step?: RegistrationProgressStep;
        answers?: Record<string, string>;
        selectedTeamId?: string | null;
        selectedDivisionId?: string | null;
        selectedDivisionTypeKey?: string | null;
        registrationId?: string | null;
        holdExpiresAt?: string | null;
    } = {}) => {
        if (!eventRegistrationProgressKey || !user?.$id || !currentEvent?.$id) {
            return;
        }
        saveRegistrationProgress(eventRegistrationProgressKey, {
            scope: 'event',
            userId: user.$id,
            subjectId: currentEvent.$id,
            step: patch.step ?? 'questions',
            answers: patch.answers ?? registrationQuestionAnswers,
            selectedTeamId: (patch.selectedTeamId ?? selectedTeamId) || null,
            selectedDivisionId: (patch.selectedDivisionId ?? selectedDivisionId) || null,
            selectedDivisionTypeKey: (patch.selectedDivisionTypeKey ?? selectedDivisionTypeKey) || null,
            slotId: selectedWeeklyOccurrenceSlotId,
            occurrenceDate: selectedWeeklyOccurrenceDate,
            registrationId: patch.registrationId ?? paymentData?.registrationId ?? null,
            holdExpiresAt: patch.holdExpiresAt ?? registrationHoldExpiresAt,
        });
    }, [
        currentEvent?.$id,
        eventRegistrationProgressKey,
        paymentData?.registrationId,
        registrationHoldExpiresAt,
        registrationQuestionAnswers,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedTeamId,
        selectedWeeklyOccurrenceDate,
        selectedWeeklyOccurrenceSlotId,
        user?.$id,
    ]);
    const clearEventRegistrationProgress = useCallback(() => {
        clearRegistrationProgress(eventRegistrationProgressKey);
        setRegistrationHoldExpiresAt(null);
    }, [eventRegistrationProgressKey]);
    const handleEventRegistrationHoldExpired = useCallback(() => {
        clearEventRegistrationProgress();
        setShowPaymentModal(false);
        setPaymentData(null);
        setPendingEventCheckout(null);
        setShowBillingAddressModal(false);
        setJoinError('Registration hold expired. Start registration again to reserve a new spot.');
    }, [clearEventRegistrationProgress]);
    useEffect(() => {
        const draft = loadRegistrationProgress(eventRegistrationProgressKey);
        if (!draft) {
            setRegistrationHoldExpiresAt(null);
            return;
        }
        if (draft.answers) {
            setRegistrationQuestionAnswers((current) => ({
                ...current,
                ...draft.answers,
            }));
        }
        if (draft.selectedTeamId) {
            setSelectedTeamId(draft.selectedTeamId);
        }
        if (draft.selectedDivisionId) {
            setSelectedDivisionId(draft.selectedDivisionId);
        }
        if (draft.selectedDivisionTypeKey) {
            setSelectedDivisionTypeKey(draft.selectedDivisionTypeKey);
        }
        setRegistrationHoldExpiresAt(draft.holdExpiresAt ?? null);
    }, [eventRegistrationProgressKey]);
    const effectiveEventStartDate = selectedWeeklyOccurrenceOption?.start ?? parseDateValue(currentEvent?.start ?? null);
    const eventImageFallbackUrl = React.useMemo(
        () => getEventImageFallbackUrl({ event: currentEvent, width: 800, height: 200 }),
        [currentEvent],
    );
    const eventImageUrl = React.useMemo(
        () => getEventImageUrl({
            imageId: currentEvent?.imageId,
            width: 800,
            placeholderUrl: eventImageFallbackUrl,
        }),
        [currentEvent?.imageId, eventImageFallbackUrl],
    );
    const registrationByDivisionType = Boolean(currentEvent?.registrationByDivisionType);
    const divisionOptions = React.useMemo(
        () => buildDivisionOptionsForEvent(currentEvent),
        [currentEvent],
    );
    const divisionDisplayNameIndex = React.useMemo(
        () => buildDivisionDisplayNameIndex(currentEvent?.divisionDetails),
        [currentEvent?.divisionDetails],
    );
    const eventDivisionLabels = React.useMemo(() => {
        const nameById = new Map<string, string>();
        divisionOptions.forEach((option) => {
            const normalizedId = normalizeDivisionKey(option.id);
            if (normalizedId && !nameById.has(normalizedId)) {
                nameById.set(normalizedId, option.name);
            }
        });

        const labels: string[] = [];
        const seen = new Set<string>();
        const appendLabel = (value: string | null | undefined) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed.length) return;
            const dedupeKey = trimmed.toLowerCase();
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            labels.push(trimmed);
        };

        if (!Array.isArray(currentEvent?.divisions)) {
            return labels;
        }

        currentEvent.divisions.forEach((division) => {
            const divisionId = getDivisionIdFromEventEntry(division);
            const fromOptions = divisionId ? nameById.get(divisionId) : null;
            if (fromOptions) {
                appendLabel(fromOptions);
                return;
            }

            if (division && typeof division === 'object') {
                const explicitName = typeof division.name === 'string' ? division.name : null;
                if (explicitName) {
                    appendLabel(explicitName);
                    return;
                }
            }

            if (divisionId) {
                const inferred = inferDivisionDetails({
                    identifier: extractDivisionTokenFromId(divisionId) ?? divisionId,
                    sportInput:
                        typeof currentEvent.sport === 'string'
                            ? currentEvent.sport
                            : currentEvent.sport?.name ?? currentEvent.sportId ?? undefined,
                });
                appendLabel(inferred.defaultName || divisionId);
                return;
            }

            if (typeof division === 'string') {
                appendLabel(division);
            }
        });

        return labels;
    }, [currentEvent?.divisions, currentEvent?.sport, currentEvent?.sportId, divisionOptions]);
    const divisionTypeOptions = React.useMemo(() => {
        const grouped = new Map<string, EventDivisionOption>();
        divisionOptions.forEach((option) => {
            if (!grouped.has(option.divisionTypeKey)) {
                grouped.set(option.divisionTypeKey, option);
            }
        });
        return Array.from(grouped.values()).map((option) => ({
            value: option.divisionTypeKey,
            label: option.divisionTypeName,
        }));
    }, [divisionOptions]);
    const selectedDivisionOption = React.useMemo(() => {
        if (!divisionOptions.length) {
            return null;
        }
        if (registrationByDivisionType) {
            const matchingByType = divisionOptions.filter((option) => option.divisionTypeKey === selectedDivisionTypeKey);
            if (matchingByType.length) {
                return [...matchingByType].sort((left, right) => left.name.localeCompare(right.name))[0];
            }
            return divisionOptions[0];
        }
        return divisionOptions.find((option) => option.id === selectedDivisionId) ?? divisionOptions[0];
    }, [divisionOptions, registrationByDivisionType, selectedDivisionId, selectedDivisionTypeKey]);
    const divisionSelectionPayload = React.useMemo<DivisionSelectionPayload>(() => {
        if (!selectedDivisionOption) {
            return {};
        }
        if (registrationByDivisionType) {
            return {
                divisionTypeKey: selectedDivisionTypeKey || selectedDivisionOption.divisionTypeKey,
                divisionTypeId: selectedDivisionOption.divisionTypeId,
                divisionId: selectedDivisionOption.id,
            };
        }
        return {
            divisionId: selectedDivisionOption.id,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            divisionTypeKey: selectedDivisionOption.divisionTypeKey,
        };
    }, [registrationByDivisionType, selectedDivisionOption, selectedDivisionTypeKey]);
    const resolvedDivisionSelectionPayload = React.useMemo<DivisionSelectionPayload>(() => (
        selectedWeeklyOccurrence
            ? {
                ...divisionSelectionPayload,
                slotId: selectedWeeklyOccurrence.slotId ?? undefined,
                occurrenceDate: selectedWeeklyOccurrence.occurrenceDate ?? undefined,
            }
            : divisionSelectionPayload
    ), [divisionSelectionPayload, selectedWeeklyOccurrence]);
    const isDivisionSelectionMissing = React.useMemo(() => {
        if (!divisionOptions.length) {
            return false;
        }
        if (registrationByDivisionType) {
            return !(selectedDivisionTypeKey || selectedDivisionOption?.divisionTypeKey);
        }
        return !(selectedDivisionId || selectedDivisionOption?.id);
    }, [
        divisionOptions.length,
        registrationByDivisionType,
        selectedDivisionId,
        selectedDivisionOption,
        selectedDivisionTypeKey,
    ]);
    const selectedDivisionCapacitySnapshot = React.useMemo(
        () => resolveDivisionCapacitySnapshot({
            event: currentEvent,
            divisionId: selectedDivisionOption?.id,
            eligibleTeamIds: teams.map((team) => team.$id),
        }),
        [currentEvent, selectedDivisionOption?.id, teams],
    );
    const selectedDivisionAtCapacity = isDivisionAtCapacity(selectedDivisionCapacitySnapshot);
    const divisionCapacityBreakdown = React.useMemo(
        () => buildDivisionCapacityBreakdown({
            event: currentEvent,
            excludePlayoffs: true,
            eligibleTeamIds: teams.map((team) => team.$id),
        }),
        [currentEvent, teams],
    );
    const selectedDivisionBilling = React.useMemo(() => {
        if (!currentEvent) {
            return {
                priceCents: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [] as number[],
                installmentDueDates: [] as string[],
                installmentDueRelativeDays: [] as number[],
            };
        }

        const eventPriceCents = normalizePriceCents(currentEvent.price);
        const eventAllowPaymentPlans = Boolean(currentEvent.allowPaymentPlans);
        const eventInstallmentAmounts = normalizeInstallmentAmountsCents(currentEvent.installmentAmounts);
        const eventInstallmentDueDates = normalizeInstallmentDueDateValues(currentEvent.installmentDueDates);
        const eventInstallmentDueRelativeDays = normalizeInstallmentDueRelativeDayValues((currentEvent as any).installmentDueRelativeDays);
        const eventInstallmentCount = Number.isFinite(Number(currentEvent.installmentCount))
            ? Math.max(0, Math.trunc(Number(currentEvent.installmentCount)))
            : eventInstallmentAmounts.length;

        if (!selectedDivisionOption) {
            return {
                priceCents: eventPriceCents,
                allowPaymentPlans: eventAllowPaymentPlans,
                installmentCount: eventAllowPaymentPlans ? (eventInstallmentCount || eventInstallmentAmounts.length || 0) : 0,
                installmentAmounts: eventAllowPaymentPlans ? eventInstallmentAmounts : [],
                installmentDueDates: eventAllowPaymentPlans ? eventInstallmentDueDates : [],
                installmentDueRelativeDays: eventAllowPaymentPlans ? eventInstallmentDueRelativeDays : [],
            };
        }

        const divisionPriceCents = typeof selectedDivisionOption.priceCents === 'number'
            ? normalizePriceCents(selectedDivisionOption.priceCents)
            : eventPriceCents;
        const divisionAllowPaymentPlans = typeof selectedDivisionOption.allowPaymentPlans === 'boolean'
            ? selectedDivisionOption.allowPaymentPlans
            : eventAllowPaymentPlans;
        const divisionInstallmentAmounts = divisionAllowPaymentPlans
            ? (
                (selectedDivisionOption.installmentAmounts?.length
                    ? selectedDivisionOption.installmentAmounts
                    : eventInstallmentAmounts)
            ).map((value) => normalizePriceCents(value))
            : [];
        const divisionInstallmentDueDates = divisionAllowPaymentPlans
            ? (
                selectedDivisionOption.installmentDueDates?.length
                    ? selectedDivisionOption.installmentDueDates
                    : eventInstallmentDueDates
            )
            : [];
        const divisionInstallmentDueRelativeDays = divisionAllowPaymentPlans
            ? (
                selectedDivisionOption.installmentDueRelativeDays?.length
                    ? selectedDivisionOption.installmentDueRelativeDays
                    : eventInstallmentDueRelativeDays
            )
            : [];
        const divisionInstallmentCount = divisionAllowPaymentPlans
            ? (
                typeof selectedDivisionOption.installmentCount === 'number'
                    ? Math.max(0, Math.trunc(selectedDivisionOption.installmentCount))
                    : (divisionInstallmentAmounts.length || eventInstallmentCount || 0)
            )
            : 0;

        return {
            priceCents: divisionPriceCents,
            allowPaymentPlans: divisionAllowPaymentPlans,
            installmentCount: divisionInstallmentCount,
            installmentAmounts: divisionInstallmentAmounts,
            installmentDueDates: divisionInstallmentDueDates,
            installmentDueRelativeDays: divisionInstallmentDueRelativeDays,
        };
    }, [currentEvent, selectedDivisionOption]);
    const checkoutEvent = React.useMemo(() => {
        if (!currentEvent) {
            return null;
        }
        return {
            ...currentEvent,
            price: selectedDivisionBilling.priceCents,
            allowPaymentPlans: selectedDivisionBilling.allowPaymentPlans,
            installmentCount: selectedDivisionBilling.installmentCount,
            installmentAmounts: selectedDivisionBilling.installmentAmounts,
            installmentDueDates: selectedDivisionBilling.installmentDueDates,
            installmentDueRelativeDays: selectedDivisionBilling.installmentDueRelativeDays,
        };
    }, [currentEvent, selectedDivisionBilling]);
    const paymentPlanPreviewRows = React.useMemo(() => {
        const normalizedAmounts = normalizeInstallmentAmountsCents(selectedDivisionBilling.installmentAmounts);
        const normalizedDueDates = normalizeInstallmentDueDateValues(selectedDivisionBilling.installmentDueDates);
        const normalizedRelativeDueDays = normalizeInstallmentDueRelativeDayValues(selectedDivisionBilling.installmentDueRelativeDays);
        const useRelativeDueDates = currentEvent?.eventType === 'WEEKLY_EVENT' && !currentEvent?.parentEvent;
        const rowCount = Math.max(
            selectedDivisionBilling.installmentCount || 0,
            normalizedAmounts.length,
            useRelativeDueDates ? normalizedRelativeDueDays.length : normalizedDueDates.length,
        );

        return Array.from({ length: rowCount }, (_, index) => ({
            id: `${index}-${normalizedAmounts[index] ?? 0}-${useRelativeDueDates ? normalizedRelativeDueDays[index] ?? '' : normalizedDueDates[index] ?? ''}`,
            installmentNumber: index + 1,
            amountCents: normalizedAmounts[index] ?? 0,
            dueDateLabel: useRelativeDueDates
                ? formatInstallmentRelativeDueDayLabel(normalizedRelativeDueDays[index] ?? 0)
                : formatInstallmentDueDateLabel(normalizedDueDates[index] ?? ''),
        }));
    }, [
        currentEvent?.eventType,
        currentEvent?.parentEvent,
        selectedDivisionBilling.installmentAmounts,
        selectedDivisionBilling.installmentCount,
        selectedDivisionBilling.installmentDueDates,
        selectedDivisionBilling.installmentDueRelativeDays,
    ]);
    const eventMinAge = typeof currentEvent?.minAge === 'number' ? currentEvent.minAge : undefined;
    const eventMaxAge = typeof currentEvent?.maxAge === 'number' ? currentEvent.maxAge : undefined;
    const hasAgeLimits = typeof eventMinAge === 'number' || typeof eventMaxAge === 'number';
    const eventStartDate = effectiveEventStartDate;
    const eventHasStarted = Boolean(eventStartDate && new Date() >= eventStartDate);
    const joinClosedMessage = isWeeklyParentEvent && selectedWeeklyOccurrenceOption
        ? 'This weekly session has already started. Joining is closed.'
        : 'This event has already started. Joining is closed.';
    const userDob = parseDateValue(user?.dateOfBirth ?? null);
    const userAge = userDob ? calculateAgeOnDate(userDob, eventStartDate ?? new Date()) : undefined;
    const hasValidUserAge = typeof userAge === 'number' && Number.isFinite(userAge);
    const isMinor = typeof userAge === 'number' && Number.isFinite(userAge) && userAge < 18;
    const isAdult = typeof userAge === 'number' && Number.isFinite(userAge) && userAge >= 18;
    const ageWithinLimits = !hasAgeLimits
        || (typeof userAge === 'number' && Number.isFinite(userAge) && isAgeWithinRange(userAge, eventMinAge, eventMaxAge));
    const selectedDivisionAgeForUser = React.useMemo(() => {
        if (!selectedDivisionOption || hasAgeLimits) {
            return null;
        }
        return evaluateDivisionAgeEligibility({
            dateOfBirth: userDob ?? undefined,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
    }, [eventStartDate, hasAgeLimits, selectedDivisionOption, userDob]);
    const selfRegistrationBlockedReason = (() => {
        if (!user) return null;
        if (eventHasStarted) {
            return joinClosedMessage;
        }
        if (!hasValidUserAge) {
            return 'Add your date of birth to your profile to register for events.';
        }
        if (!ageWithinLimits) {
            return `This event is limited to ages ${formatAgeRange(eventMinAge, eventMaxAge)}.`;
        }
        if (
            !hasAgeLimits
            && selectedDivisionAgeForUser?.applies
            && selectedDivisionAgeForUser.eligible === false
        ) {
            return selectedDivisionAgeForUser.message
                ? `Selected division age requirement: ${selectedDivisionAgeForUser.message}.`
                : 'You are not age-eligible for the selected division.';
        }
        return null;
    })();
    const canRegisterChild = isAdult && !eventHasStarted;

    const isEventHost = !!user && currentEvent && user.$id === currentEvent.hostId;
    const isFreeEvent = Boolean(currentEvent) && selectedDivisionBilling.priceCents === 0;
    const shouldBypassHostPayment = Boolean(currentEvent && isEventHost && !currentEvent.teamSignup);
    const isFreeForUser = isFreeEvent || shouldBypassHostPayment;

    const isActive = renderInline ? Boolean(isOpen) : isOpen;
    const todayForDob = new Date();
    const maxAuthDob = `${todayForDob.getFullYear()}-${String(todayForDob.getMonth() + 1).padStart(2, '0')}-${String(todayForDob.getDate()).padStart(2, '0')}`;

    const resetAuthModalFeedback = useCallback(() => {
        setAuthModalError('');
        setAuthVerificationEmail('');
        setAuthVerificationMessage('');
    }, []);

    const openAuthModal = useCallback(() => {
        setAuthModalMode('login');
        resetAuthModalFeedback();
        setShowAuthModal(true);
    }, [resetAuthModalFeedback]);

    const handleAuthModalInputChange = useCallback((field: keyof AuthModalFormState, value: string) => {
        setAuthModalForm((previous) => ({ ...previous, [field]: value }));
    }, []);

    const handleAuthModalSubmit = useCallback(async (submitEvent: React.FormEvent<HTMLFormElement>) => {
        submitEvent.preventDefault();
        setAuthModalLoading(true);
        resetAuthModalFeedback();

        try {
            if (
                authModalMode === 'signup'
                && (!authModalForm.firstName || !authModalForm.lastName || !authModalForm.userName || !authModalForm.dateOfBirth)
            ) {
                throw new Error('Please provide first name, last name, username, and date of birth.');
            }

            const authResult = authModalMode === 'login'
                ? await authService.login(authModalForm.email, authModalForm.password)
                : await authService.createAccount(
                    authModalForm.email,
                    authModalForm.password,
                    authModalForm.firstName,
                    authModalForm.lastName,
                    authModalForm.userName,
                    authModalForm.dateOfBirth,
                );

            await refreshSession();
            setShowAuthModal(false);
            setAuthModalForm(emptyAuthModalForm);
            setJoinError(null);

            if (authResult.requiresProfileCompletion) {
                const nextPath = typeof window !== 'undefined'
                    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
                    : '/discover';
                router.push(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
                return;
            }

            setJoinNotice('Signed in. Continue registration.');
        } catch (error) {
            if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
                const pendingEmail = error.email || authModalForm.email.trim().toLowerCase();
                setAuthVerificationEmail(pendingEmail);
                setAuthVerificationMessage(error.message || 'Please verify your email before signing in.');
                setAuthVerificationMessageType('info');
                setAuthModalError('');
                return;
            }
            setAuthModalError(error instanceof Error ? error.message : 'Authentication failed.');
        } finally {
            setAuthModalLoading(false);
        }
    }, [authModalForm, authModalMode, refreshSession, resetAuthModalFeedback, router]);

    const handleAuthModalResendVerification = useCallback(async () => {
        if (!authVerificationEmail) {
            return;
        }
        setAuthResendingVerification(true);
        setAuthModalError('');
        try {
            await authService.resendVerification(authVerificationEmail);
            setAuthVerificationMessage(`Verification email sent to ${authVerificationEmail}.`);
            setAuthVerificationMessageType('info');
        } catch (error) {
            setAuthModalError(error instanceof Error ? error.message : 'Failed to resend verification email.');
        } finally {
            setAuthResendingVerification(false);
        }
    }, [authVerificationEmail]);

    const handleAuthModalGoogle = useCallback(async () => {
        setAuthModalError('');
        try {
            await authService.oauthLoginWithGoogle();
        } catch (error) {
            setAuthModalError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
        }
    }, []);

    useEffect(() => {
        if (!isActive || !currentEvent?.hostId) {
            setHostUser(null);
            return;
        }

        let cancelled = false;

        const loadHostUser = async () => {
            try {
                const resolvedHost = await userService.getUserById(currentEvent.hostId, { eventId: currentEvent.$id });
                if (!cancelled) {
                    setHostUser(resolvedHost ?? null);
                }
            } catch (error) {
                console.error('Failed to load host user:', error);
                if (!cancelled) {
                    setHostUser(null);
                }
            }
        };

        void loadHostUser();

        return () => {
            cancelled = true;
        };
    }, [currentEvent?.$id, currentEvent?.hostId, isActive]);

    useEffect(() => {
        if (!isActive || !user) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const targetEvent = currentEvent ?? event;
        if (!targetEvent || !targetEvent.teamSignup) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
        if (teamIds.length === 0) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        setIsLoadingTeams(true);
        let cancelled = false;
        const loadTeams = async () => {
            try {
                const userTeamsAll = await teamService.getTeamsByIds(teamIds, true);
                const targetSportName = (() => {
                    const rawSport: unknown = (targetEvent as { sport?: unknown }).sport;
                    if (typeof rawSport === 'string' && rawSport.trim().length > 0) {
                        return rawSport.trim();
                    }
                    if (
                        rawSport
                        && typeof rawSport === 'object'
                        && typeof (rawSport as { name?: unknown }).name === 'string'
                    ) {
                        return ((rawSport as { name?: string }).name ?? '').trim();
                    }
                    if (typeof targetEvent.sportId === 'string' && targetEvent.sportId.trim().length > 0) {
                        return targetEvent.sportId.trim();
                    }
                    return '';
                })();
                const normalizedTargetSport = targetSportName.toLowerCase();
                const relevantTeams = normalizedTargetSport.length > 0
                    ? userTeamsAll.filter(
                        (team) => (team.sport || '').trim().toLowerCase() === normalizedTargetSport
                    )
                    : userTeamsAll;
                const managerTeams = relevantTeams.filter((team) => normalizeUserId(team.managerId) === user.$id);
                if (!cancelled) {
                    setUserTeams(managerTeams);
                }
            } catch (error) {
                console.error('Failed to load user teams:', error);
                if (!cancelled) {
                    setUserTeams([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTeams(false);
                }
            }
        };

        loadTeams();

        return () => {
            cancelled = true;
            setIsLoadingTeams(false);
        };
    }, [isActive, currentEvent, event, user]);

    useEffect(() => {
        if (!isActive || !user) {
            setChildren([]);
            setChildrenLoading(false);
            setChildrenError(null);
            return;
        }

        let cancelled = false;
        setChildrenLoading(true);
        setChildrenError(null);

        const loadChildren = async () => {
            try {
                const result = await familyService.listChildren();
                if (!cancelled) {
                    setChildren(result);
                }
            } catch (error) {
                if (!cancelled) {
                    setChildren([]);
                    setChildrenError(error instanceof Error ? error.message : 'Failed to load children.');
                }
            } finally {
                if (!cancelled) {
                    setChildrenLoading(false);
                }
            }
        };

        loadChildren();

        return () => {
            cancelled = true;
        };
    }, [isActive, user]);

    useEffect(() => {
        if (!divisionOptions.length) {
            setSelectedDivisionId('');
            setSelectedDivisionTypeKey('');
            return;
        }

        setSelectedDivisionId((previous) => {
            if (previous && divisionOptions.some((option) => option.id === previous)) {
                return previous;
            }
            return divisionOptions[0].id;
        });

        setSelectedDivisionTypeKey((previous) => {
            if (previous && divisionOptions.some((option) => option.divisionTypeKey === previous)) {
                return previous;
            }
            return divisionOptions[0].divisionTypeKey;
        });
    }, [divisionOptions]);

    const loadEventDetails = useCallback(async (eventId?: string, options: LoadEventDetailsOptions = {}) => {
        const sourceEvent = eventRef.current;
        const targetId = eventId ?? sourceEvent?.$id;
        if (!targetId) return;

        const selectedOccurrence = selectedWeeklyOccurrenceSlotId && selectedWeeklyOccurrenceDate
            ? {
                slotId: selectedWeeklyOccurrenceSlotId,
                occurrenceDate: selectedWeeklyOccurrenceDate,
            }
            : undefined;
        const loadKey = buildEventDetailsLoadKey(targetId, selectedOccurrence);
        if (options.automatic && loadKey && loadedEventDetailsKeyRef.current === loadKey) {
            return;
        }
        if (options.automatic) {
            loadedEventDetailsKeyRef.current = loadKey;
        }

        setIsLoadingEvent(true);
        try {
            // Fetch full event with relationships for accurate editing context
            let latest = renderInline ? sourceEvent : await eventService.getEventWithRelations(targetId);
            if (!latest && !renderInline) {
                latest = await eventService.getEvent(targetId);
            }
            const baseEvent = latest || sourceEvent;
            if (!baseEvent) {
                return;
            }

            let resolvedEvent = baseEvent;
            let eventPlayers: UserData[] = Array.isArray(baseEvent.players) ? (baseEvent.players as UserData[]) : [];
            let eventTeams: Team[] = Array.isArray(baseEvent.teams) ? (baseEvent.teams as Team[]) : [];
            let eventFreeAgents: UserData[] = [];

            if (baseEvent.eventType === 'WEEKLY_EVENT' && !baseEvent.parentEvent) {
                if (selectedOccurrence?.slotId && selectedOccurrence?.occurrenceDate) {
                    try {
                        const snapshot = await eventService.getEventParticipants(targetId, selectedOccurrence);
                        const failedState = collectPaymentFailedRegistrationState(snapshot.registrations, user?.$id ?? null);
                        setCurrentUserPaymentFailed(failedState.userFailed);
                        setPaymentFailedTeamIds(failedState.teamIds);
                        const refreshedTeamIds = Array.from(new Set(
                            (snapshot.participants.teamIds ?? [])
                                .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
                                .filter((teamId): teamId is string => teamId.length > 0),
                        ));
                        const participantUserIds = Array.from(new Set(
                            (snapshot.participants.userIds ?? [])
                                .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                                .filter((userId): userId is string => userId.length > 0),
                        ));
                        const waitListIds = Array.from(new Set(
                            (snapshot.participants.waitListIds ?? [])
                                .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                                .filter((userId): userId is string => userId.length > 0),
                        ));
                        const freeAgentIds = Array.from(new Set(
                            (snapshot.participants.freeAgentIds ?? [])
                                .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                                .filter((userId): userId is string => userId.length > 0),
                        ));

                        const teamsById = new Map((snapshot.teams ?? []).map((team) => [team.$id, team]));
                        const orderedTeams = refreshedTeamIds
                            .map((teamId) => teamsById.get(teamId))
                            .filter((team): team is Team => Boolean(team));
                        const usersById = new Map((snapshot.users ?? []).map((participant) => [participant.$id, participant]));
                        const orderedUsers = participantUserIds
                            .map((userId) => usersById.get(userId))
                            .filter((participant): participant is UserData => Boolean(participant));
                        const orderedFreeAgents = freeAgentIds
                            .map((userId) => usersById.get(userId))
                            .filter((participant): participant is UserData => Boolean(participant));

                        resolvedEvent = {
                            ...baseEvent,
                            teamIds: refreshedTeamIds,
                            teams: orderedTeams,
                            userIds: participantUserIds,
                            players: orderedUsers,
                            waitListIds,
                            freeAgentIds,
                            participantCount: snapshot.participantCount,
                            participantCapacity: snapshot.participantCapacity ?? undefined,
                        } as Event;
                        eventPlayers = orderedUsers;
                        eventTeams = orderedTeams;
                        eventFreeAgents = orderedFreeAgents;
                    } catch (error) {
                        console.error('Failed to load weekly session participants:', error);
                        setCurrentUserPaymentFailed(false);
                        setPaymentFailedTeamIds([]);
                        resolvedEvent = {
                            ...baseEvent,
                            teamIds: [],
                            teams: [],
                            userIds: [],
                            players: [],
                            waitListIds: [],
                            freeAgentIds: [],
                        } as Event;
                        eventPlayers = [];
                        eventTeams = [];
                        eventFreeAgents = [];
                    }
                } else {
                    setCurrentUserPaymentFailed(false);
                    setPaymentFailedTeamIds([]);
                    resolvedEvent = {
                        ...baseEvent,
                        teamIds: [],
                        teams: [],
                        userIds: [],
                        players: [],
                        waitListIds: [],
                        freeAgentIds: [],
                    } as Event;
                    eventPlayers = [];
                    eventTeams = [];
                    eventFreeAgents = [];
                }
            } else {
                try {
                    const snapshot = await eventService.getEventParticipants(targetId);
                    const failedState = collectPaymentFailedRegistrationState(snapshot.registrations, user?.$id ?? null);
                    setCurrentUserPaymentFailed(failedState.userFailed);
                    setPaymentFailedTeamIds(failedState.teamIds);
                    const refreshedTeamIds = Array.from(new Set(
                        (snapshot.participants.teamIds ?? [])
                            .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
                            .filter((teamId): teamId is string => teamId.length > 0),
                    ));
                    const participantUserIds = Array.from(new Set(
                        (snapshot.participants.userIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const waitListIds = Array.from(new Set(
                        (snapshot.participants.waitListIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const freeAgentIds = Array.from(new Set(
                        (snapshot.participants.freeAgentIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const snapshotTeams = (snapshot.teams ?? [])
                        .map((team) => ({
                            ...team,
                            $id: typeof team.$id === 'string' && team.$id.trim().length > 0
                                ? team.$id
                                : String((team as any).id ?? ''),
                        }))
                        .filter((team): team is Team => team.$id.length > 0);
                    const snapshotUsers = (snapshot.users ?? [])
                        .map((participant) => ({
                            ...participant,
                            $id: typeof participant.$id === 'string' && participant.$id.trim().length > 0
                                ? participant.$id
                                : String((participant as any).id ?? ''),
                        }))
                        .filter((participant): participant is UserData => participant.$id.length > 0);
                    const teamsById = new Map(snapshotTeams.map((team) => [team.$id, team]));
                    const orderedTeams = refreshedTeamIds
                        .map((teamId) => teamsById.get(teamId))
                        .filter((team): team is Team => Boolean(team));
                    const usersById = new Map(snapshotUsers.map((participant) => [participant.$id, participant]));
                    const orderedUsers = participantUserIds
                        .map((userId) => usersById.get(userId))
                        .filter((participant): participant is UserData => Boolean(participant));
                    const orderedFreeAgents = freeAgentIds
                        .map((userId) => usersById.get(userId))
                        .filter((participant): participant is UserData => Boolean(participant));

                    resolvedEvent = {
                        ...baseEvent,
                        teamIds: refreshedTeamIds,
                        teams: orderedTeams,
                        userIds: participantUserIds,
                        players: orderedUsers,
                        waitListIds,
                        freeAgentIds,
                        participantCount: snapshot.participantCount,
                        participantCapacity: snapshot.participantCapacity ?? undefined,
                    } as Event;
                    eventPlayers = orderedUsers;
                    eventTeams = orderedTeams;
                    eventFreeAgents = orderedFreeAgents;
                } catch (error) {
                    console.error('Failed to load event participants:', error);
                    setCurrentUserPaymentFailed(false);
                    setPaymentFailedTeamIds([]);
                    const freeAgentIds = collectUniqueUserIds(baseEvent.freeAgentIds);
                    const shouldLoadFreeAgents = Boolean(baseEvent.teamSignup) && freeAgentIds.length > 0;

                    if (shouldLoadFreeAgents) {
                        try {
                            eventFreeAgents = await userService.getUsersByIds(freeAgentIds, { eventId: baseEvent.$id });
                        } catch (freeAgentError) {
                            console.error('Failed to load free agents:', freeAgentError);
                            eventFreeAgents = [];
                        }
                    }
                }
            }

            setDetailedEvent(resolvedEvent);
            setPlayers(eventPlayers);
            const isSchedulableSlotEvent = resolvedEvent.eventType === 'LEAGUE' || resolvedEvent.eventType === 'TOURNAMENT';
            const filteredTeams = isSchedulableSlotEvent
                ? eventTeams.filter((team) => typeof team.parentTeamId === 'string' && team.parentTeamId.trim().length > 0)
                : eventTeams;
            setTeams(filteredTeams);
            setFreeAgents(eventFreeAgents);

        } catch (error) {
            console.error('Failed to load event details:', error);
        } finally {
            setIsLoadingEvent(false);
        }
    }, [renderInline, selectedWeeklyOccurrenceDate, selectedWeeklyOccurrenceSlotId, user?.$id]);

    useEffect(() => {
        eventRef.current = event;
        setDetailedEvent((previous) => {
            if (!event || !previous || previous.$id !== event.$id) {
                return previous;
            }
            return {
                ...previous,
                fieldIds: Array.isArray(event.fieldIds) ? event.fieldIds : previous.fieldIds,
                fields: Array.isArray(event.fields) ? event.fields : previous.fields,
                timeSlotIds: Array.isArray(event.timeSlotIds) ? event.timeSlotIds : previous.timeSlotIds,
                timeSlots: Array.isArray(event.timeSlots) ? event.timeSlots : previous.timeSlots,
                divisions: Array.isArray(event.divisions) ? event.divisions : previous.divisions,
                divisionDetails: Array.isArray(event.divisionDetails) ? event.divisionDetails : previous.divisionDetails,
                playoffDivisionDetails: Array.isArray(event.playoffDivisionDetails)
                    ? event.playoffDivisionDetails
                    : previous.playoffDivisionDetails,
            } as Event;
        });
    }, [event]);

    useEffect(() => {
        if (isActive && event) {
            setDetailedEvent(event);
            void loadEventDetails(event.$id, { automatic: true });
        } else {
            loadedEventDetailsKeyRef.current = null;
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setFreeAgents([]);
            setCurrentUserPaymentFailed(false);
            setPaymentFailedTeamIds([]);
            setIsLoadingEvent(false);
            setIsLoadingTeams(false);
            setJoinError(null); // Reset error when modal closes
            setJoinNotice(null);
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowPasswordModal(false);
            setShowJoinChoiceModal(false);
            setShowCapacityBreakdown(false);
            setPassword('');
            setPasswordError(null);
            setConfirmingPassword(false);
            setRecordingSignature(false);
            setTextAccepted(false);
            setChildren([]);
            setChildrenLoading(false);
            setChildrenError(null);
            setSelectedChildId('');
            setRegisteringChild(false);
            setJoiningChildFreeAgent(false);
            setChildRegistration(null);
            setChildConsent(null);
            setChildRegistrationChildId(null);
            setShowRegistrationQuestionsModal(false);
            setRegistrationQuestions([]);
            setRegistrationQuestionAnswers({});
            setRegistrationQuestionsIntent(null);
            setPaymentPlanPreview(null);
            setSelectedDivisionId('');
            setSelectedDivisionTypeKey('');
        }
    }, [event, event?.$id, isActive, loadEventDetails]);

    const handleViewSchedule = (tab?: string) => {
        const eventPath = `/events/${currentEvent.$id}`;
        const target = tab ? `${eventPath}?tab=${tab}` : eventPath;
        router.push(target);
        onClose();
    };

    const handleBracketClick = () => {
        if (currentEvent.eventType === 'TOURNAMENT') {
            handleViewSchedule('bracket');
        }
    };

    const handleWeeklySessionSelect = useCallback((session: WeeklySessionOption) => {
        if (!currentEvent || currentEvent.eventType !== 'WEEKLY_EVENT' || currentEvent.parentEvent) {
            return;
        }
        setJoinError(null);
        setJoinNotice(null);
        if (onWeeklyOccurrenceChange) {
            onWeeklyOccurrenceChange({
                slotId: session.slotId,
                occurrenceDate: session.occurrenceDate,
            });
            return;
        }
        if (!user) {
            openAuthModal();
            return;
        }

        setJoinNotice('Session selected. Finish registration on the event page.');
        const params = new URLSearchParams({
            tab: 'schedule',
            slotId: session.slotId,
            occurrenceDate: session.occurrenceDate,
        });
        router.push(`/events/${currentEvent.$id}?${params.toString()}`);
        onClose();
    }, [currentEvent, onClose, onWeeklyOccurrenceChange, openAuthModal, router, user]);

    const navigateToPublicEventCompletion = useCallback(() => {
        clearEventRegistrationProgress();
        if (!publicCompletion?.slug) {
            return;
        }
        navigateToPublicCompletion({
            router,
            slug: publicCompletion.slug,
            kind: 'event',
            redirectUrl: publicCompletion.redirectUrl,
        });
    }, [clearEventRegistrationProgress, publicCompletion?.redirectUrl, publicCompletion?.slug, router]);

    const createBillForOwner = useCallback(async (ownerType: 'USER' | 'TEAM', ownerId: string) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }

        const priceCents = normalizePriceCents(selectedDivisionBilling.priceCents);
        if (priceCents <= 0) {
            throw new Error('This event does not have a price set for a payment plan.');
        }

        const installmentAmounts = selectedDivisionBilling.allowPaymentPlans
            ? normalizeInstallmentAmountsCents(selectedDivisionBilling.installmentAmounts)
            : [];
        const installmentDueDates = selectedDivisionBilling.allowPaymentPlans
            ? normalizeInstallmentDueDateValues(selectedDivisionBilling.installmentDueDates)
            : [];
        const installmentDueRelativeDays = selectedDivisionBilling.allowPaymentPlans
            ? normalizeInstallmentDueRelativeDayValues(selectedDivisionBilling.installmentDueRelativeDays)
            : [];
        const useRelativeDueDates = currentEvent.eventType === 'WEEKLY_EVENT' && !currentEvent.parentEvent;
        if (useRelativeDueDates) {
            if (!selectedWeeklyOccurrence?.slotId || !selectedWeeklyOccurrence?.occurrenceDate) {
                throw new Error('Select a weekly session before starting a payment plan.');
            }
            if (installmentDueRelativeDays.length !== installmentAmounts.length) {
                throw new Error('Weekly payment plans need a due date offset for each installment.');
            }
        }

        return billService.createBill({
            ownerType,
            ownerId,
            totalAmountCents: priceCents,
            eventId: currentEvent.$id,
            slotId: useRelativeDueDates ? selectedWeeklyOccurrence?.slotId ?? null : null,
            occurrenceDate: useRelativeDueDates ? selectedWeeklyOccurrence?.occurrenceDate ?? null : null,
            organizationId: currentEvent.organizationId ?? null,
            installmentAmounts,
            installmentDueDates: useRelativeDueDates ? [] : installmentDueDates,
            installmentDueRelativeDays: useRelativeDueDates ? installmentDueRelativeDays : [],
            allowSplit: ownerType === 'TEAM' ? Boolean(currentEvent.allowTeamSplitDefault) : false,
            paymentPlanEnabled: true,
            timeoutMs: JOIN_API_TIMEOUT_MS,
            event: {
                $id: currentEvent.$id,
                start: currentEvent.start,
                price: priceCents,
                installmentAmounts,
                installmentDueDates: useRelativeDueDates ? [] : installmentDueDates,
                installmentDueRelativeDays: useRelativeDueDates ? installmentDueRelativeDays : [],
            },
            user,
        });
    }, [currentEvent, selectedDivisionBilling, selectedWeeklyOccurrence, user]);

    const registerChildForEvent = useCallback(async (
        childId: string,
        selection: DivisionSelectionPayload = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }
        const resolvedSelection = selectedWeeklyOccurrence
            ? {
                ...selection,
                slotId: selectedWeeklyOccurrence.slotId ?? undefined,
                occurrenceDate: selectedWeeklyOccurrence.occurrenceDate ?? undefined,
            }
            : selection;

        setRegisteringChild(true);
        try {
            const result = await registrationService.registerChildForEvent(currentEvent.$id, childId, resolvedSelection, answers);
            setChildRegistration(result.registration ?? null);
            setChildConsent(result.consent ?? null);
            setChildRegistrationChildId(childId);
            const notices: string[] = [];
            const registrationStatus = (result.registration?.status ?? '').toLowerCase();
            const consentStatus = (result.consent?.status ?? '').toLowerCase();
            if (registrationStatus === 'active') {
                notices.push('Child registration completed.');
            } else if (result.requiresParentApproval) {
                notices.push('Child request sent. A parent/guardian must approve before registration can continue.');
            } else if (result.consent?.requiresChildEmail) {
                notices.push('Child registration started. Add child email to continue child-signature document steps.');
            } else if (consentStatus === 'parentsigned') {
                notices.push('Parent signature completed. Registration is pending child signature.');
            } else if (consentStatus === 'childsigned') {
                notices.push('Child signature completed. Registration is pending parent/guardian signature.');
            } else if (consentStatus === 'completed') {
                notices.push('All signatures are complete. Finalizing registration.');
            } else if (result.consent?.status) {
                notices.push(`Child registration is pending. Consent status: ${result.consent.status}.`);
            } else if (registrationStatus) {
                notices.push(`Child registration is pending. Status: ${registrationStatus}.`);
            } else {
                notices.push('Child registration request submitted and is pending processing.');
            }
            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                notices.push(result.warnings[0]);
            }
            setJoinNotice(notices.join(' '));
            await loadEventDetails();
            if (registrationStatus === 'active') {
                navigateToPublicEventCompletion();
            }
        } finally {
            setRegisteringChild(false);
        }
    }, [currentEvent, loadEventDetails, navigateToPublicEventCompletion, selectedWeeklyOccurrence]);

    const loadRequiredSignLinksForIntent = useCallback(async (intent: JoinIntent): Promise<SignStep[]> => {
        if (!currentEvent || !user || !authUser?.email) {
            throw new Error('Sign-in email is required to sign documents.');
        }

        const signerContext: 'participant' | 'parent_guardian' = isChildJoinIntent(intent)
            ? 'parent_guardian'
            : 'participant';

        const parentLinks = await boldsignService.createSignLinks({
            eventId: currentEvent.$id,
            user,
            userEmail: authUser.email,
            signerContext,
            childUserId: intent.childId,
            childEmail: intent.childEmail ?? undefined,
            timeoutMs: JOIN_API_TIMEOUT_MS,
        });

        const shouldCollectChildSignatureInSameSession = isChildJoinIntent(intent) && Boolean(
            intent.childId
            && normalizeEmailValue(authUser.email)
            && normalizeEmailValue(intent.childEmail ?? null)
            && normalizeEmailValue(authUser.email) === normalizeEmailValue(intent.childEmail ?? null),
        );

        if (!shouldCollectChildSignatureInSameSession || !intent.childId) {
            return dedupeSignSteps(parentLinks, signerContext);
        }

        const childLinks = await boldsignService.createSignLinks({
            eventId: currentEvent.$id,
            user,
            userEmail: authUser.email,
            signerContext: 'child',
            childUserId: intent.childId,
            childEmail: intent.childEmail ?? undefined,
            timeoutMs: JOIN_API_TIMEOUT_MS,
        });

        return dedupeSignSteps([...parentLinks, ...childLinks], signerContext);
    }, [authUser?.email, currentEvent, user]);

    const beginSigningFlow = useCallback(async (intent: JoinIntent) => {
        if (!currentEvent || !user) {
            return false;
        }
        const requiredTemplateIds = Array.isArray(currentEvent.requiredTemplateIds)
            ? currentEvent.requiredTemplateIds
            : [];
        if (!requiredTemplateIds.length) {
            return false;
        }
        if (!authUser?.email) {
            throw new Error('Sign-in email is required to sign documents.');
        }
        const links = await loadRequiredSignLinksForIntent(intent);
        if (!links.length) {
            setPendingJoin(null);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowPasswordModal(false);
            return false;
        }

        setPendingJoin(intent);
        setSignLinks(links);
        setCurrentSignIndex(0);
        setPassword('');
        setPasswordError(null);
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setShowPasswordModal(true);
        return true;
    }, [authUser?.email, currentEvent, loadRequiredSignLinksForIntent, user]);

    const startEventCheckout = useCallback(async ({
        event: checkoutEvent,
        team,
        selection,
        answers,
        discountCode: checkoutDiscountCode,
        billingAddress,
    }: PendingEventCheckoutState & {
        billingAddress?: BillingAddress;
    }) => {
        if (!user) {
            throw new Error('You must be signed in to continue.');
        }

        try {
            const paymentIntent = await paymentService.createPaymentIntent(
                user,
                checkoutEvent,
                team,
                undefined,
                undefined,
                selection,
                billingAddress,
                selectedWeeklyOccurrence,
                answers,
                (checkoutDiscountCode ?? discountCode).trim() || null,
            );
            const holdExpiresAt = paymentIntent.registrationHoldExpiresAt ?? null;
            setRegistrationHoldExpiresAt(holdExpiresAt);
            saveEventRegistrationProgress({
                step: 'checkout',
                answers: answers?.reduce<Record<string, string>>((acc, answer) => {
                    acc[answer.questionId] = answer.answer;
                    return acc;
                }, {}) ?? registrationQuestionAnswers,
                selectedTeamId: (team?.$id ?? selectedTeamId) || null,
                selectedDivisionId: (selection?.divisionId ?? selectedDivisionId) || null,
                selectedDivisionTypeKey: (selection?.divisionTypeKey ?? selectedDivisionTypeKey) || null,
                registrationId: paymentIntent.registrationId ?? null,
                holdExpiresAt,
            });
            setPaymentData(paymentIntent);
            setShowPaymentModal(true);
            setPendingEventCheckout(null);
            setShowBillingAddressModal(false);
            setShowDiscountCodeModal(false);
        } catch (error) {
            if (
                isApiRequestError(error)
                && error.data
                && typeof error.data === 'object'
                && 'billingAddressRequired' in error.data
                && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
            ) {
                setPendingEventCheckout({
                event: checkoutEvent,
                team,
                selection,
                answers,
                discountCode: checkoutDiscountCode ?? discountCode,
            });
                setShowBillingAddressModal(true);
                return;
            }
            throw error;
        }
    }, [
        registrationQuestionAnswers,
        saveEventRegistrationProgress,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedTeamId,
        selectedWeeklyOccurrence,
        discountCode,
        user,
    ]);

    const ensureWeeklyOccurrenceSelected = useCallback((message: string = 'Select a weekly session before continuing.') => {
        if (!weeklySelectionRequired) {
            return true;
        }
        setJoinError(message);
        return false;
    }, [weeklySelectionRequired]);

    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        if (!user || !currentEvent) return;
        if (!ensureWeeklyOccurrenceSelected()) {
            return;
        }
        const requiresDivisionSelection = intent.mode !== 'child_free_agent';
        if (requiresDivisionSelection && isDivisionSelectionMissing) {
            throw new Error(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
        }
        const selection = resolvedDivisionSelectionPayload;

        if (intent.mode === 'child') {
            if (!intent.childId) {
                throw new Error('Select a child to register.');
            }
            await registerChildForEvent(intent.childId, selection, intent.answers);
            return;
        }
        if (intent.mode === 'child_free_agent') {
            if (!intent.childId) {
                throw new Error('Select a child to add as a free agent.');
            }
            await eventService.addFreeAgent(currentEvent.$id, intent.childId, selectedWeeklyOccurrence);
            setJoinNotice('Child added to free agent list.');
            await loadEventDetails();
            return;
        }
        if (intent.mode === 'child_waitlist') {
            if (!intent.childId) {
                throw new Error('Select a child to add to waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, intent.childId, 'user', selectedWeeklyOccurrence);
            setJoinNotice('Child added to waitlist.');
            await loadEventDetails();
            return;
        }

        const resolvedTeam = (() => {
            if (intent.mode !== 'team' && intent.mode !== 'team_waitlist') {
                return undefined;
            }
            if (intent.team) {
                return intent.team;
            }
            if (selectedTeamId) {
                return userTeams.find((team) => team.$id === selectedTeamId) ?? ({ $id: selectedTeamId } as Team);
            }
            return undefined;
        })();

        const totalParticipants = currentEvent.teamSignup ? teams.length : players.length;
        const participantCapacity = resolveEventParticipantCapacity(currentEvent);
        const eventAtCapacity = participantCapacity > 0 && totalParticipants >= participantCapacity;
        const joinAtCapacity = eventAtCapacity || selectedDivisionAtCapacity;

        if (joinAtCapacity && intent.mode === 'user') {
            await eventService.addToWaitlist(currentEvent.$id, user.$id, 'user', selectedWeeklyOccurrence);
            setJoinNotice('Added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (joinAtCapacity && intent.mode === 'team') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, resolvedTeam.$id, 'team', selectedWeeklyOccurrence);
            setJoinNotice('Team added to waitlist.');
            await loadEventDetails();
            return;
        }

        const shouldRegisterSelf = intent.mode === 'user'
            && !currentEvent.teamSignup
            && (isFreeForUser || selectedDivisionBilling.allowPaymentPlans);
        let registrationResult: EventRegistration | null = null;

        if (shouldRegisterSelf) {
            const result = await registrationService.registerSelfForEvent(currentEvent.$id, selection, intent.answers);
            registrationResult = result.registration ?? null;
            if (registrationResult?.status && registrationResult.status !== 'active') {
                setJoinNotice(`Registration status: ${registrationResult.status}`);
            }
        }

        if (intent.mode === 'user_waitlist') {
            await eventService.addToWaitlist(currentEvent.$id, user.$id, 'user', selectedWeeklyOccurrence);
            setJoinNotice('Added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (intent.mode === 'team_waitlist') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, resolvedTeam.$id, 'team', selectedWeeklyOccurrence);
            setJoinNotice('Team added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (selectedDivisionBilling.allowPaymentPlans) {
            const eventForJoin = checkoutEvent ?? currentEvent;
            const joinTeam = intent.mode === 'team' ? resolvedTeam : undefined;

            if (intent.mode === 'team' && !joinTeam?.$id) {
                throw new Error('Team is required to start a payment plan.');
            }

            let billCreatedDuringJoin = false;
            try {
                const joinResult = await paymentService.joinEvent(
                    user,
                    eventForJoin,
                    joinTeam,
                    selection,
                    JOIN_API_TIMEOUT_MS,
                    selectedWeeklyOccurrence,
                    intent.answers,
                );
                billCreatedDuringJoin = Boolean(joinResult?.bill);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to join event.';
                if (!message.toLowerCase().includes('already registered')) {
                    throw error;
                }
            }

            try {
                if (billCreatedDuringJoin) {
                    setJoinNotice(
                        intent.mode === 'team'
                            ? 'Team joined. Payment plan started. A bill was created - you can manage payments from your Profile.'
                            : 'Joined. Payment plan started. A bill was created - pay installments from your Profile.',
                    );
                } else if (intent.mode === 'team' && joinTeam?.$id) {
                    await createBillForOwner('TEAM', joinTeam.$id);
                    setJoinNotice(
                        'Team joined. Payment plan started. A bill was created - you can manage payments from your Profile.',
                    );
                } else {
                    await createBillForOwner('USER', user.$id);
                    setJoinNotice('Joined. Payment plan started. A bill was created - pay installments from your Profile.');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to start payment plan.';
                if (message.toLowerCase().includes('payment plan already exists')) {
                    setJoinNotice(
                        intent.mode === 'team'
                            ? 'Team joined. Payment plan already exists - you can manage payments from your Profile.'
                            : 'Joined. Payment plan already exists - you can manage payments from your Profile.',
                    );
                } else {
                    try {
                        await paymentService.leaveEvent(
                            user,
                            eventForJoin,
                            joinTeam,
                            undefined,
                            undefined,
                            JOIN_API_TIMEOUT_MS,
                            selectedWeeklyOccurrence,
                        );
                    } catch (rollbackError) {
                        console.error('Failed to rollback payment-plan join after billing error', rollbackError);
                    }
                    throw new Error(message);
                }
            }

            await loadEventDetails();
            navigateToPublicEventCompletion();
            return;
        }

        if (isFreeForUser) {
            if (!shouldRegisterSelf) {
                await paymentService.joinEvent(
                    user,
                    checkoutEvent ?? currentEvent,
                    resolvedTeam,
                    selection,
                    JOIN_API_TIMEOUT_MS,
                    selectedWeeklyOccurrence,
                    intent.answers,
                );
            }
            await loadEventDetails();
            const selfRegistrationPending = Boolean(
                shouldRegisterSelf
                && registrationResult?.status
                && registrationResult.status !== 'active',
            );
            if (!selfRegistrationPending) {
                navigateToPublicEventCompletion();
            }
        } else {
            setPendingEventCheckout({
                event: checkoutEvent ?? currentEvent,
                team: resolvedTeam,
                selection,
                answers: intent.answers,
            });
            setShowDiscountCodeModal(true);
        }
    }, [
        checkoutEvent,
        createBillForOwner,
        currentEvent,
        ensureWeeklyOccurrenceSelected,
        isDivisionSelectionMissing,
        isFreeForUser,
        loadEventDetails,
        navigateToPublicEventCompletion,
        players.length,
        registrationByDivisionType,
        registerChildForEvent,
        resolvedDivisionSelectionPayload,
        selectedDivisionBilling.allowPaymentPlans,
        selectedDivisionAtCapacity,
        selectedTeamId,
        selectedWeeklyOccurrence,
        startEventCheckout,
        teams.length,
        user,
        userTeams,
    ]);

    const buildRegistrationQuestionAnswers = useCallback((): RegistrationQuestionAnswerInput[] => (
        registrationQuestions.map((question) => ({
            questionId: question.id,
            answer: registrationQuestionAnswers[question.id] ?? '',
        }))
    ), [registrationQuestionAnswers, registrationQuestions]);

    const validateRegistrationQuestionAnswers = useCallback((): string | null => {
        const missingRequired = registrationQuestions.find((question) => (
            Boolean(question.required) && String(registrationQuestionAnswers[question.id] ?? '').trim().length === 0
        ));
        if (missingRequired) {
            return `Answer "${missingRequired.prompt}" before continuing.`;
        }
        return null;
    }, [registrationQuestionAnswers, registrationQuestions]);

    const shouldAskRegistrationQuestions = useCallback((intent: JoinIntent): boolean => (
        registrationQuestions.length > 0
        && !intent.answers
        && (intent.mode === 'user' || intent.mode === 'team' || intent.mode === 'child')
    ), [registrationQuestions.length]);

    const openRegistrationQuestionsStep = useCallback((intent: JoinIntent) => {
        setJoinError(null);
        setRegistrationQuestionsIntent(intent);
        setShowRegistrationQuestionsModal(true);
    }, []);

    const submitRegistrationQuestionsStep = useCallback(async () => {
        if (!registrationQuestionsIntent || !currentEvent || !user) {
            return;
        }
        const validationError = validateRegistrationQuestionAnswers();
        if (validationError) {
            setJoinError(validationError);
            return;
        }

        const answers = buildRegistrationQuestionAnswers();
        saveEventRegistrationProgress({
            step: 'signing',
            answers: registrationQuestionAnswers,
        });

        const intent: JoinIntent = {
            ...registrationQuestionsIntent,
            answers,
        };
        setShowRegistrationQuestionsModal(false);
        setRegistrationQuestionsIntent(null);
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (intent.mode === 'user' && isMinor) {
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, resolvedDivisionSelectionPayload, intent.answers);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow(intent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(intent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to continue registration.');
            setShowRegistrationQuestionsModal(true);
            setRegistrationQuestionsIntent(intent);
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    }, [
        beginSigningFlow,
        buildRegistrationQuestionAnswers,
        currentEvent,
        finalizeJoin,
        isMinor,
        loadEventDetails,
        registrationQuestionsIntent,
        registrationQuestionAnswers,
        resolvedDivisionSelectionPayload,
        saveEventRegistrationProgress,
        user,
        validateRegistrationQuestionAnswers,
    ]);

    const cancelPasswordConfirmation = useCallback(() => {
        setShowPasswordModal(false);
        setPassword('');
        setPasswordError(null);
        setPendingJoin(null);
        setJoining(false);
        setJoinError('Password confirmation canceled.');
    }, []);

    const confirmPasswordAndStartSigning = useCallback(async () => {
        if (!pendingJoin || !currentEvent || !user || !authUser?.email) {
            return;
        }
        if (!password.trim()) {
            setPasswordError('Password is required.');
            return;
        }

        setConfirmingPassword(true);
        setPasswordError(null);
        setJoinError(null);
        setJoinNotice(null);
        let stage: 'confirm_password' | 'finalize_join' = 'confirm_password';
        try {
            stage = 'confirm_password';
            await apiRequest<{ ok: true }>('/api/documents/confirm-password', {
                method: 'POST',
                timeoutMs: JOIN_API_TIMEOUT_MS,
                body: {
                    email: authUser.email,
                    password,
                    eventId: currentEvent.$id,
                },
            });
            const links = signLinks.length ? signLinks : await loadRequiredSignLinksForIntent(pendingJoin);

            if (!links.length) {
                stage = 'finalize_join';
                setShowPasswordModal(false);
                setPassword('');
                const intent = pendingJoin;
                setPendingJoin(null);
                await finalizeJoin(intent);
                setJoining(false);
                setJoiningChildFreeAgent(false);
                return;
            }

            setSignLinks(links);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowPasswordModal(false);
            setPassword('');
            setShowSignModal(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to confirm password.';
            if (stage === 'finalize_join') {
                setJoinError(message || 'Failed to complete registration.');
                setPendingJoin(null);
                setShowPasswordModal(false);
                setPassword('');
                setJoining(false);
                setJoiningChildFreeAgent(false);
                return;
            }
            setPasswordError(message);
        } finally {
            setConfirmingPassword(false);
        }
    }, [
        authUser?.email,
        currentEvent,
        finalizeJoin,
        loadRequiredSignLinksForIntent,
        password,
        pendingJoin,
        signLinks,
        user,
    ]);

    const recordSignature = useCallback(async (payload: {
        templateId: string;
        documentId: string;
        type: SignStep['type'];
        signerContext?: SignStep['signerContext'];
    }): Promise<{ operationId?: string; syncStatus?: string }> => {
        if (!user || !currentEvent) {
            throw new Error('User and event are required to sign documents.');
        }
        const fallbackSignerContext =
            pendingJoin?.mode === 'child' || pendingJoin?.mode === 'child_free_agent' || pendingJoin?.mode === 'child_waitlist'
                ? 'parent_guardian'
                : 'participant';
        const signerContext = payload.signerContext ?? fallbackSignerContext;
        const signingUserId = signerContext === 'child' && pendingJoin?.childId
            ? pendingJoin.childId
            : user.$id;
        const response = await fetch('/api/documents/record-signature', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                templateId: payload.templateId,
                documentId: payload.documentId,
                eventId: currentEvent.$id,
                type: payload.type,
                userId: signingUserId,
                childUserId: pendingJoin?.childId,
                signerContext,
                user,
            }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.error) {
            throw new Error(result?.error || 'Failed to record signature.');
        }
        return {
            operationId: typeof result?.operationId === 'string' ? result.operationId : undefined,
            syncStatus: typeof result?.syncStatus === 'string' ? result.syncStatus : undefined,
        };
    }, [currentEvent, pendingJoin?.childId, pendingJoin?.mode, user]);

    const handleSignedDocument = useCallback(async (messageDocumentId?: string) => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type === 'TEXT') {
            return;
        }
        if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
            return;
        }
        if (pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
            return;
        }
        if (!currentLink.documentId) {
            setJoinError('Missing document identifier for signature.');
            return;
        }

        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            const signatureResult = await recordSignature({
                templateId: currentLink.templateId,
                documentId: currentLink.documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(currentLink.documentId);
            setPendingSignatureOperationId(
                signatureResult.operationId || currentLink.operationId || null,
            );
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to record signature.');
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setJoining(false);
        } finally {
            setRecordingSignature(false);
        }
    }, [currentSignIndex, pendingSignatureOperationId, pendingSignedDocumentId, recordSignature, recordingSignature, signLinks]);

    const handleTextAcceptance = useCallback(async () => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type !== 'TEXT') {
            return;
        }
        if (!textAccepted || pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
            return;
        }

        const documentId = currentLink.documentId || createId();
        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            const signatureResult = await recordSignature({
                templateId: currentLink.templateId,
                documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(documentId);
            setPendingSignatureOperationId(
                signatureResult.operationId || currentLink.operationId || null,
            );
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to record signature.');
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setJoining(false);
        } finally {
            setRecordingSignature(false);
        }
    }, [currentSignIndex, pendingSignatureOperationId, pendingSignedDocumentId, recordSignature, recordingSignature, signLinks, textAccepted]);

    useEffect(() => {
        setTextAccepted(false);
    }, [currentSignIndex, signLinks]);

    useEffect(() => {
        if (!showSignModal) {
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
                return;
            }
            const payload = event.data;
            let eventName = '';
            if (typeof payload === 'string') {
                eventName = payload;
            } else if (payload && typeof payload === 'object') {
                eventName = payload.event || payload.eventName || payload.type || payload.name || '';
            }
            const eventLabel = eventName.toString();
            if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
                return;
            }

            const documentId =
                (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
            void handleSignedDocument(
                typeof documentId === 'string' ? documentId : undefined
            );
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleSignedDocument, showSignModal]);

    useEffect(() => {
        if (!pendingSignatureOperationId) {
            return;
        }
        if (!currentEvent || !user) {
            return;
        }

        let cancelled = false;
        const startedAt = Date.now();
        const intervalMs = 1500;
        const timeoutMs = 90_000;

        const poll = async () => {
            try {
                const operation = await boldsignService.getOperationStatus(pendingSignatureOperationId);
                if (cancelled) {
                    return;
                }

                const status = String(operation.status ?? '').toUpperCase();
                if (status === 'CONFIRMED') {
                    const nextIndex = currentSignIndex + 1;
                    if (nextIndex < signLinks.length) {
                        setCurrentSignIndex(nextIndex);
                        setPendingSignedDocumentId(null);
                        setPendingSignatureOperationId(null);
                        setShowSignModal(true);
                        setJoinNotice(null);
                        return;
                    }

                    setPendingSignedDocumentId(null);
                    setPendingSignatureOperationId(null);
                    setSignLinks([]);
                    setCurrentSignIndex(0);
                    setShowSignModal(false);
                    setJoinNotice(null);
                    const intent = pendingJoin;
                    setPendingJoin(null);
                    if (intent) {
                        await finalizeJoin(intent);
                    }
                    setJoining(false);
                    setJoiningChildFreeAgent(false);
                    return;
                }

                if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
                    throw new Error(operation.error || 'Failed to synchronize signature status.');
                }

                if (Date.now() - startedAt > timeoutMs) {
                    throw new Error('Signature sync is delayed. Please try again shortly.');
                }
            } catch (error) {
                if (cancelled) {
                    return;
                }
                const message = error instanceof Error ? error.message : 'Failed to confirm signature.';
                setJoinError(message || 'Failed to confirm signature.');
                setPendingSignedDocumentId(null);
                setPendingSignatureOperationId(null);
                setShowSignModal(false);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setPendingJoin(null);
                setJoining(false);
                setJoiningChildFreeAgent(false);
            }
        };

        const interval = window.setInterval(() => {
            void poll();
        }, intervalMs);
        void poll();
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [currentEvent, currentSignIndex, finalizeJoin, pendingJoin, pendingSignatureOperationId, signLinks.length, user]);

    useEffect(() => {
        if (!pendingSignedDocumentId || !currentEvent || !user) {
            return;
        }
        if (pendingSignatureOperationId) {
            return;
        }

        let cancelled = false;
        const poll = async () => {
            try {
                const pendingLink = signLinks[currentSignIndex];
                const pendingSignerUserId = pendingLink?.signerContext === 'child' && pendingJoin?.childId
                    ? pendingJoin.childId
                    : user.$id;
                const signed = await signedDocumentService.isDocumentSigned(pendingSignedDocumentId, pendingSignerUserId);
                if (!signed || cancelled) {
                    return;
                }

                const nextIndex = currentSignIndex + 1;
                if (nextIndex < signLinks.length) {
                    setCurrentSignIndex(nextIndex);
                    setPendingSignedDocumentId(null);
                    setShowSignModal(true);
                    setJoinNotice(null);
                    return;
                }

                setPendingSignedDocumentId(null);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setShowSignModal(false);
                setJoinNotice(null);
                const intent = pendingJoin;
                setPendingJoin(null);
                if (intent) {
                    await finalizeJoin(intent);
                }
                setJoining(false);
                setJoiningChildFreeAgent(false);
            } catch (error) {
                if (cancelled) {
                    return;
                }
                const message = error instanceof Error ? error.message : 'Failed to confirm signature.';
                setJoinError(message || 'Failed to confirm signature.');
                setPendingSignedDocumentId(null);
                setShowSignModal(false);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setPendingJoin(null);
                setJoining(false);
                setJoiningChildFreeAgent(false);
            }
        };

        const interval = window.setInterval(poll, 1000);
        poll();
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [currentEvent, currentSignIndex, finalizeJoin, pendingJoin, pendingSignatureOperationId, pendingSignedDocumentId, signLinks, user]);

    const handleRegisterChild = async () => {
        if (!user || !currentEvent) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before registering a child.')) {
            return;
        }
        if (!selectedChildId) {
            setJoinError(isTeamSignup ? 'Select a child to add as a free agent.' : 'Select a child to register.');
            return;
        }
        const bypassEligibilityCheck = (isTeamSignup && selectedChildIsFreeAgent) || (!isTeamSignup && selectedChildIsWaitlisted);
        if (!selectedChildEligible && !bypassEligibilityCheck) {
            setJoinError('Selected child is not eligible for this event.');
            return;
        }
        if (isTeamSignup) {
            setJoinError(null);
            setJoinNotice(null);
            setJoiningChildFreeAgent(true);
            try {
                if (selectedChildIsFreeAgent) {
                    await eventService.removeFreeAgent(currentEvent.$id, selectedChildId, selectedWeeklyOccurrence);
                    setJoinNotice('Child removed from free agent list.');
                } else {
                    const signingStarted = await beginSigningFlow({
                        mode: 'child_free_agent',
                        childId: selectedChildId,
                        childEmail: selectedChild?.email ?? null,
                    });
                    if (signingStarted) {
                        return;
                    }
                    await finalizeJoin({
                        mode: 'child_free_agent',
                        childId: selectedChildId,
                        childEmail: selectedChild?.email ?? null,
                    });
                    return;
                }
                await loadEventDetails();
            } catch (error) {
                setJoinError(error instanceof Error ? error.message : 'Failed to update child free agent status.');
            } finally {
                setJoiningChildFreeAgent(false);
            }
            return;
        }
        const eventCapacity = resolveEventParticipantCapacity(currentEvent);
        const eventWaitlistMode = (eventCapacity > 0 && players.length >= eventCapacity) || selectedChildIsWaitlisted;
        if (eventWaitlistMode) {
            setJoinError(null);
            setJoinNotice(null);
            try {
                if (selectedChildIsWaitlisted) {
                    setRegisteringChild(true);
                    await eventService.removeFromWaitlist(currentEvent.$id, selectedChildId, 'user', selectedWeeklyOccurrence);
                    setJoinNotice('Child removed from waitlist.');
                    await loadEventDetails();
                    return;
                }
                if (selectedChildIsRegistered) {
                    setJoinNotice('Child is already registered for this event.');
                    return;
                }
                const signingStarted = await beginSigningFlow({
                    mode: 'child_waitlist',
                    childId: selectedChildId,
                    childEmail: selectedChild?.email ?? null,
                });
                if (signingStarted) {
                    return;
                }
                await finalizeJoin({
                    mode: 'child_waitlist',
                    childId: selectedChildId,
                    childEmail: selectedChild?.email ?? null,
                });
            } catch (error) {
                setJoinError(error instanceof Error ? error.message : 'Failed to update child waitlist status.');
            } finally {
                setRegisteringChild(false);
            }
            return;
        }
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before registering a child.'
                    : 'Select a division before registering a child.',
            );
            return;
        }
        const childIntent: JoinIntent = {
            mode: 'child',
            childId: selectedChildId,
            childEmail: selectedChild?.email ?? null,
        };
        if (shouldAskRegistrationQuestions(childIntent)) {
            openRegistrationQuestionsStep(childIntent);
            return;
        }
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow(childIntent);
            if (signingStarted) {
                return;
            }
            await registerChildForEvent(selectedChildId, resolvedDivisionSelectionPayload, childIntent.answers);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to register child.');
        }
    };

    const openFreeAgentActions = useCallback((agent: UserData) => {
        setSelectedFreeAgentActionUser(agent);
    }, []);

    const handleInviteFreeAgentToTeam = useCallback(() => {
        if (!selectedFreeAgentActionUser || !currentEvent?.$id) {
            return;
        }
        const params = new URLSearchParams({
            event: currentEvent.$id,
            freeAgent: selectedFreeAgentActionUser.$id,
        });
        setShowFreeAgentsDropdown(false);
        setSelectedFreeAgentActionUser(null);
        router.push(`/teams?${params.toString()}`);
    }, [currentEvent?.$id, router, selectedFreeAgentActionUser]);

    // Update the join event handlers
    const handleJoinEvent = async (selection?: 'self' | 'child', skipPaymentPlanPreview = false) => {
        if (!user || !currentEvent) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining.')) {
            return;
        }
        if (!selection && canRegisterChild && hasActiveChildren) {
            setShowJoinChoiceModal(true);
            return;
        }
        if (selection === 'child') {
            setShowJoinChoiceModal(false);
            await handleRegisterChild();
            return;
        }
        setShowJoinChoiceModal(false);
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
            return;
        }
        if (selfRegistrationBlockedReason) {
            setJoinError(selfRegistrationBlockedReason);
            return;
        }
        if (
            !skipPaymentPlanPreview
            && !isMinor
            && selectedDivisionBilling.allowPaymentPlans
            && normalizePriceCents(selectedDivisionBilling.priceCents) > 0
        ) {
            setPaymentPlanPreview({
                intent: { mode: 'user' },
                ownerLabel: 'You',
            });
            return;
        }

        const joinIntent: JoinIntent = { mode: 'user' };
        if (shouldAskRegistrationQuestions(joinIntent)) {
            openRegistrationQuestionsStep(joinIntent);
            return;
        }

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (isMinor) {
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, resolvedDivisionSelectionPayload);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow(joinIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(joinIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join event');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const handleJoinWaitlist = async () => {
        if (!user || !currentEvent) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining the waitlist.')) {
            return;
        }
        if (selfRegistrationBlockedReason) {
            setJoinError(selfRegistrationBlockedReason);
            return;
        }
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining the waitlist.'
                    : 'Select a division before joining the waitlist.',
            );
            return;
        }
        const waitlistMinorIntent: JoinIntent = { mode: 'user' };
        if (isMinor && shouldAskRegistrationQuestions(waitlistMinorIntent)) {
            openRegistrationQuestionsStep(waitlistMinorIntent);
            return;
        }

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (isMinor) {
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, resolvedDivisionSelectionPayload);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow({ mode: 'user_waitlist' });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'user_waitlist' });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join waitlist');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const handleJoinTeamWaitlist = async () => {
        if (!user || !currentEvent || !selectedTeamId) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining the waitlist.')) {
            return;
        }
        if (!selectedTeamIsWaitlisted && isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining the waitlist.'
                    : 'Select a division before joining the waitlist.',
            );
            return;
        }

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        const team = userTeams.find((t) => t.$id === selectedTeamId) || ({ $id: selectedTeamId } as Team);
        let signingStarted = false;
        try {
            if (selectedTeamIsWaitlisted) {
                await eventService.removeFromWaitlist(currentEvent.$id, selectedTeamId, 'team', selectedWeeklyOccurrence);
                setJoinNotice('Team removed from waitlist.');
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow({ mode: 'team_waitlist', team });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'team_waitlist', team });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to update team waitlist status');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    // Team-signup: join as team or free agent
    const handleJoinAsTeam = async (skipPaymentPlanPreview = false, teamOverride?: Team) => {
        if (!user || !currentEvent || (!selectedTeamId && !teamOverride?.$id)) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining.')) {
            return;
        }
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
            return;
        }

        const team = teamOverride
            ?? userTeams.find((t) => t.$id === selectedTeamId)
            ?? ({ $id: selectedTeamId } as Team);
        const joinIntent: JoinIntent = { mode: 'team', team };
        if (
            !skipPaymentPlanPreview
            && selectedDivisionBilling.allowPaymentPlans
            && normalizePriceCents(selectedDivisionBilling.priceCents) > 0
        ) {
            const teamName = typeof team?.name === 'string' && team.name.trim().length > 0
                ? team.name.trim()
                : 'Your team';
            setPaymentPlanPreview({
                intent: { mode: 'team', team },
                ownerLabel: teamName,
            });
            return;
        }
        if (shouldAskRegistrationQuestions(joinIntent)) {
            openRegistrationQuestionsStep(joinIntent);
            return;
        }

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);
        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow(joinIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(joinIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as team');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const continuePaymentPlanPreview = () => {
        const preview = paymentPlanPreview;
        setPaymentPlanPreview(null);
        if (!preview) {
            return;
        }

        if (preview.intent.mode === 'team') {
            void handleJoinAsTeam(true, preview.intent.team ?? undefined);
            return;
        }

        void handleJoinEvent('self', true);
    };

    const handleWithdrawTeam = async () => {
        if (!user || !currentEvent || !selectedTeamId) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before withdrawing.')) {
            return;
        }

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        const selectedTeam = userTeams.find((team) => team.$id === selectedTeamId) || ({ $id: selectedTeamId } as Team);

        try {
            await paymentService.leaveEvent(
                user,
                currentEvent,
                selectedTeam,
                undefined,
                undefined,
                JOIN_API_TIMEOUT_MS,
                selectedWeeklyOccurrence,
            );

            setJoinNotice('Team withdrawn from this event.');
            await loadEventDetails();
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to withdraw team');
        } finally {
            setJoining(false);
        }
    };

    const cancelSigning = useCallback(() => {
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setShowPasswordModal(false);
        setPassword('');
        setPasswordError(null);
        setConfirmingPassword(false);
        setRecordingSignature(false);
        setTextAccepted(false);
        setJoining(false);
        setJoinError('Signature process canceled.');
    }, []);

    // After successful payment, poll for up to 30s until the webhook-backed registration is reflected
    const confirmRegistrationAfterPayment = async ({ pendingPayment = false }: { pendingPayment?: boolean } = {}) => {
        if (!user || !currentEvent) return;
        setConfirmingPurchase(true);
        setJoinError(null);

        const deadline = Date.now() + 30_000; // 30 seconds
        const pollIntervalMs = 2000; // 2 seconds
        const targetTeamId = selectedTeamId || null;

        try {
            if (currentEvent.teamSignup && !targetTeamId) {
                throw new Error('Team is required to complete registration.');
            }

            while (Date.now() < deadline) {
                if (selectedWeeklyOccurrence) {
                    const snapshot = await eventService.getEventParticipants(currentEvent.$id, selectedWeeklyOccurrence);
                    const participantTeamIds = Array.from(new Set(
                        (snapshot.participants.teamIds ?? [])
                            .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
                            .filter((teamId): teamId is string => teamId.length > 0),
                    ));
                    const participantUserIds = Array.from(new Set(
                        (snapshot.participants.userIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const participantTeams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
                    const targetTeamRegistered = Boolean(
                        targetTeamId
                        && (
                            participantTeamIds.includes(targetTeamId)
                            || participantTeams.some((team) => {
                                const teamRecord = team as { $id?: unknown; id?: unknown; parentTeamId?: unknown };
                                const eventTeamId = typeof teamRecord.$id === 'string'
                                    ? teamRecord.$id.trim()
                                    : typeof teamRecord.id === 'string'
                                        ? teamRecord.id.trim()
                                        : '';
                                const parentTeamId = typeof teamRecord.parentTeamId === 'string'
                                    ? teamRecord.parentTeamId.trim()
                                    : '';
                                return eventTeamId === targetTeamId || parentTeamId === targetTeamId;
                            })
                        ),
                    );
                    const registered = currentEvent.teamSignup
                        ? targetTeamRegistered
                        : participantUserIds.includes(user.$id);

                    if (registered) {
                        await loadEventDetails();
                        setConfirmingPurchase(false);
                        if (pendingPayment) {
                            setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
                            return;
                        }
                        navigateToPublicEventCompletion();
                        return;
                    }
                } else {
                    const latest = await eventService.getEventWithRelations(currentEvent.$id);
                    if (latest) {
                        const registered = latest.teamSignup
                            ? (targetTeamId
                                ? Object.values(latest.teams || {}).some(t => t.parentTeamId === targetTeamId || t.$id === targetTeamId)
                                : Object.values(latest.teams || {}).some(t => (t.playerIds || []).includes(user.$id)))
                            : (latest.players || []).some(p => p.$id === user.$id);

                        if (registered) {
                            await loadEventDetails();
                            setConfirmingPurchase(false);
                            if (pendingPayment) {
                                setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
                                return;
                            }
                            navigateToPublicEventCompletion();
                            return;
                        }
                    }
                }

                await new Promise(res => setTimeout(res, pollIntervalMs));
            }

            if (pendingPayment) {
                await loadEventDetails();
                setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
            } else {
                setJoinError('Timed out');
            }
        } catch (e) {
            setJoinError(e instanceof Error ? e.message : 'Error confirming purchase.');
        } finally {
            setConfirmingPurchase(false);
        }
    };

    if (!currentEvent) return null;
    if (!isActive) return null;

    const { date, time } = getEventDateTime(currentEvent);
    const affiliateActionUrl = typeof currentEvent.affiliateUrl === 'string' ? currentEvent.affiliateUrl.trim() : '';
    const isAffiliateEvent = currentEvent.eventType === 'AFFILIATE';
    const isTeamSignup = currentEvent.teamSignup;
    const shouldScrollWeeklySessions = weeklySessionOptions.length > WEEKLY_SESSION_VISIBLE_ROWS;
    const startDateValue = parseDateValue(currentEvent.start ?? null);
    const endDateValue = parseDateValue(currentEvent.end ?? null);
    const sharesSingleDayWindow = Boolean(
        startDateValue
        && endDateValue
        && startDateValue.toDateString() === endDateValue.toDateString(),
    );
    const sportLabel = getSportLabel(currentEvent);
    const organizationName = getOrganizationName(currentEvent.organization);
    const isOrganizationEvent = typeof currentEvent.organizationId === 'string' && currentEvent.organizationId.trim().length > 0;
    const hostedByLabel = (() => {
        if (isOrganizationEvent && organizationName) {
            return organizationName;
        }
        if (hostUser) {
            return getUserFullName(hostUser);
        }
        if (organizationName) {
            return organizationName;
        }
        const normalizedHostId = typeof currentEvent.hostId === 'string' ? currentEvent.hostId.trim() : '';
        return normalizedHostId || 'Hosted by organizer';
    })();
    const hostedByHandle = !isOrganizationEvent && hostUser ? getUserHandle(hostUser) : null;
    const totalParticipants = isTeamSignup ? teams.length : players.length;
    const participantCapacity = resolveEventParticipantCapacity(currentEvent);
    const eventAtCapacity = participantCapacity > 0 && totalParticipants >= participantCapacity;
    const spotsLeft = participantCapacity > 0 ? Math.max(0, participantCapacity - totalParticipants) : 0;
    const eventFillPercent = participantCapacity > 0
        ? Math.min(100, Math.round((totalParticipants / participantCapacity) * 100))
        : 0;
    const normalizedFreeAgentIds = (() => {
        const fromEvent = collectUniqueUserIds(currentEvent.freeAgentIds);
        const additionalFromProfiles = freeAgents
            .map((entry) => normalizeUserId(entry?.$id))
            .filter((entry): entry is string => Boolean(entry));
        return Array.from(new Set([...fromEvent, ...additionalFromProfiles]));
    })();
    const normalizedWaitlistIds = (() => {
        const fromEvent = collectUniqueUserIds(currentEvent.waitListIds);
        const fromLegacy = collectUniqueUserIds(currentEvent.waitList);
        return Array.from(new Set([...fromEvent, ...fromLegacy]));
    })();
    const normalizedParticipantUserIds = collectUniqueUserIds(currentEvent.userIds);
    const normalizedFreeAgentIdSet = new Set(normalizedFreeAgentIds);
    const normalizedWaitlistIdSet = new Set(normalizedWaitlistIds);
    // Use expanded relations for registration state
    const isUserRegistered = !!user && (
        (!isTeamSignup && (players.some(p => p.$id === user.$id) || normalizedParticipantUserIds.includes(user.$id))) ||
        (isTeamSignup && teams.some(t => (t.playerIds || []).includes(user.$id)))
    );
    const isUserWaitlisted = !!user && normalizedWaitlistIdSet.has(user.$id);
    const isUserFreeAgent = !!user && normalizedFreeAgentIdSet.has(user.$id);
    const isChildEligible = (child: FamilyChild): boolean => {
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        if (!childDob) {
            return false;
        }
        const childAgeAtEvent = calculateAgeOnDate(childDob, eventStartDate ?? new Date());
        if (!Number.isFinite(childAgeAtEvent)) {
            return false;
        }
        if (hasAgeLimits) {
            return isAgeWithinRange(childAgeAtEvent, eventMinAge, eventMaxAge);
        }
        if (isTeamSignup) {
            return true;
        }
        if (!selectedDivisionOption) {
            return true;
        }
        const divisionEligibility = evaluateDivisionAgeEligibility({
            dateOfBirth: childDob,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
        if (!divisionEligibility.applies) {
            return true;
        }
        return divisionEligibility.eligible !== false;
    };
    const activeChildren = children.filter((child) => {
        const normalizedLinkStatus = typeof child.linkStatus === 'string'
            ? child.linkStatus.trim().toLowerCase()
            : 'active';
        return normalizedLinkStatus === 'active';
    });
    const hasActiveChildren = activeChildren.length > 0;
    const shouldShowChildRegistrationPanel = canRegisterChild
        && (childrenLoading || Boolean(childrenError) || hasActiveChildren);
    const childOptions = activeChildren.map((child) => {
        const name = `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Child';
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        const childAgeAtEvent = childDob ? calculateAgeOnDate(childDob, eventStartDate ?? new Date()) : undefined;
        const ageLabel = typeof childAgeAtEvent === 'number' && Number.isFinite(childAgeAtEvent)
            ? `${childAgeAtEvent}y at event`
            : 'age unknown';
        const eligible = isChildEligible(child);
        return {
            value: child.userId,
            label: `${name} (${ageLabel})${eligible ? '' : ' - not eligible'}`,
            disabled: !eligible,
        };
    });
    const selectedChild = activeChildren.find((child) => child.userId === selectedChildId);
    const selectedChildEligible = selectedChild ? isChildEligible(selectedChild) : false;
    const selectedChildHasEmail = selectedChild
        ? (typeof selectedChild.hasEmail === 'boolean' ? selectedChild.hasEmail : Boolean(selectedChild.email))
        : true;
    const selectedChildIsFreeAgent = Boolean(
        selectedChildId
        && normalizedFreeAgentIdSet.has(selectedChildId),
    );
    const selectedChildIsWaitlisted = Boolean(
        selectedChildId
        && normalizedWaitlistIdSet.has(selectedChildId),
    );
    const selectedChildIsRegistered = Boolean(
        selectedChildId
        && (players.some((participant) => participant.$id === selectedChildId) || normalizedParticipantUserIds.includes(selectedChildId)),
    );
    const showChildRegistrationStatus = Boolean(selectedChildId && childRegistrationChildId === selectedChildId);
    const hasCoordinates = Array.isArray(currentEvent.coordinates) && currentEvent.coordinates.length >= 2;
    const mapLat = hasCoordinates ? Number(currentEvent.coordinates[1]) : undefined;
    const mapLng = hasCoordinates ? Number(currentEvent.coordinates[0]) : undefined;
    const hasValidCoords = typeof mapLat === 'number' && typeof mapLng === 'number' && !Number.isNaN(mapLat) && !Number.isNaN(mapLng);
    const eventAddress = (currentEvent.address || '').trim();
    const mapQuery = eventAddress.length > 0
        ? eventAddress
        : (hasValidCoords ? `${mapLat},${mapLng}` : '');
    const encodedMapQuery = encodeURIComponent(mapQuery);
    const googleMapsLink = mapQuery
        ? `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`
        : null;
    const mapEmbedSrc = mapQuery
        ? `https://maps.google.com/maps?q=${encodedMapQuery}&z=14&output=embed`
        : null;
    const eventPriceSummary = `${formatEventDivisionPriceRange(currentEvent)} / ${isTeamSignup ? 'team' : 'player'}`;
    const maxParticipantsLabel = isTeamSignup ? 'Max teams' : 'Max players';
    const registrationCutoffSummary = formatRegistrationCutoffSummary(currentEvent.registrationCutoffHours);
    const refundSummary = formatRefundSummary(currentEvent.cancellationRefundHours);
    const officialPositionsSummary = uniqueNonEmptyStrings(
        (currentEvent.officialPositions ?? [])
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .map((position) => {
                const normalizedName = position.name?.trim() || 'Official';
                const normalizedCount = Number.isFinite(Number(position.count))
                    ? Math.max(1, Math.trunc(Number(position.count)))
                    : 1;
                return `${normalizedName} x${normalizedCount}`;
            }),
    ).join(', ') || 'None';
    const assistantHostNames = (() => {
        const hydratedIds = new Set((currentEvent.assistantHosts ?? []).map((entry) => entry.$id));
        return uniqueNonEmptyStrings([
            ...(currentEvent.assistantHosts ?? []).map((entry) => getUserFullName(entry)),
            ...((currentEvent.assistantHostIds ?? []).filter((entry) => !hydratedIds.has(entry))),
        ]);
    })();
    const officialNames = (() => {
        const hydratedIds = new Set((currentEvent.officials ?? []).map((entry) => entry.$id));
        return uniqueNonEmptyStrings([
            ...(currentEvent.officials ?? []).map((entry) => getUserFullName(entry)),
            ...((currentEvent.officialIds ?? []).filter((entry) => !hydratedIds.has(entry))),
        ]);
    })();
    const normalizedViewerId = typeof user?.$id === 'string' ? user.$id.trim() : '';
    const organizationHostIds = typeof currentEvent.organization === 'object' && currentEvent.organization
        ? collectOrganizationHostIds(currentEvent.organization)
        : [];
    const canViewStaffSection = Boolean(
        normalizedViewerId
        && (
            currentEvent.hostId === normalizedViewerId
            || (currentEvent.assistantHostIds ?? []).includes(normalizedViewerId)
            || (currentEvent.officialIds ?? []).includes(normalizedViewerId)
            || organizationHostIds.includes(normalizedViewerId)
        ),
    );
    const readOnlyFieldCount = (() => {
        if (Array.isArray(currentEvent.fields) && currentEvent.fields.length > 0) {
            return currentEvent.fields.length;
        }
        if (Array.isArray(currentEvent.fieldIds) && currentEvent.fieldIds.length > 0) {
            return currentEvent.fieldIds.length;
        }
        if (typeof currentEvent.fieldCount === 'number' && Number.isFinite(currentEvent.fieldCount)) {
            return Math.max(0, Math.trunc(currentEvent.fieldCount));
        }
        return 0;
    })();
    const scheduleDetailRows: ReadOnlyDetailField[] = (() => {
        const rows: ReadOnlyDetailField[] = [
            { label: 'Field count', value: String(readOnlyFieldCount) },
            { label: 'Weekly timeslots', value: String(currentEvent.timeSlots?.length ?? 0) },
        ];

        if (currentEvent.eventType === 'LEAGUE') {
            rows.push({ label: 'Games per opponent', value: String(currentEvent.gamesPerOpponent ?? 1) });
            if (currentEvent.usesSets) {
                rows.push({ label: 'Sets per match', value: String(currentEvent.setsPerMatch ?? 1) });
                rows.push({ label: 'Set duration', value: `${currentEvent.setDurationMinutes ?? 20} minutes` });
                if (Array.isArray(currentEvent.pointsToVictory) && currentEvent.pointsToVictory.length > 0) {
                    rows.push({ label: 'Points to victory', value: currentEvent.pointsToVictory.join(', ') });
                }
            } else {
                rows.push({ label: 'Match duration', value: `${currentEvent.matchDurationMinutes ?? 60} minutes` });
            }
            rows.push({ label: 'Rest time', value: `${currentEvent.restTimeMinutes ?? 0} minutes` });
            if (currentEvent.includePlayoffs) {
                rows.push({
                    label: 'Playoffs',
                    value: currentEvent.singleDivision
                        ? `${Math.max(2, currentEvent.playoffTeamCount ?? currentEvent.maxParticipants)} teams`
                        : 'Configured per division',
                });
            }
        }

        if (currentEvent.eventType === 'TOURNAMENT') {
            if (currentEvent.usesSets) {
                rows.push({ label: 'Set duration', value: `${currentEvent.setDurationMinutes ?? 20} minutes` });
            } else {
                rows.push({ label: 'Match duration', value: `${currentEvent.matchDurationMinutes ?? 60} minutes` });
            }
            rows.push({
                label: 'Bracket',
                value: currentEvent.doubleElimination ? 'Double elimination' : 'Single elimination',
            });
            if (typeof currentEvent.winnerSetCount === 'number') {
                rows.push({ label: 'Winner set count', value: String(currentEvent.winnerSetCount) });
            }
            if (Array.isArray(currentEvent.winnerBracketPointsToVictory) && currentEvent.winnerBracketPointsToVictory.length > 0) {
                rows.push({
                    label: currentEvent.doubleElimination ? 'Winner points' : 'Bracket set points',
                    value: currentEvent.winnerBracketPointsToVictory.join(', '),
                });
            }
            if (currentEvent.doubleElimination && typeof currentEvent.loserSetCount === 'number') {
                rows.push({ label: 'Loser set count', value: String(currentEvent.loserSetCount) });
            }
            if (currentEvent.doubleElimination && Array.isArray(currentEvent.loserBracketPointsToVictory) && currentEvent.loserBracketPointsToVictory.length > 0) {
                rows.push({ label: 'Loser points', value: currentEvent.loserBracketPointsToVictory.join(', ') });
            }
        }

        return rows;
    })();
    const scheduleFieldNamesById = new Map((currentEvent.fields ?? []).map((field) => [field.$id, field]));
    const fallbackDivisionIds = Array.isArray(currentEvent.divisions)
        ? currentEvent.divisions
            .map((entry) => getDivisionIdFromEventEntry(entry))
            .filter((entry): entry is string => Boolean(entry))
        : [];
    const scheduleTimeslotGroups = buildScheduleTimeslotGroups(currentEvent.timeSlots ?? []);
    const supportsScheduleDetails = currentEvent.eventType === 'LEAGUE'
        || currentEvent.eventType === 'TOURNAMENT'
        || currentEvent.eventType === 'WEEKLY_EVENT'
        || Boolean(readOnlyFieldCount)
        || Boolean(currentEvent.timeSlots?.length);
    const canShowScheduleButton = isEventHost && !renderInline && !isWeeklyParentEvent;
    const showParticipantsSection = !isWeeklyParentEvent;
    const scheduleButtonLabel = isEventHost ? 'Manage Event' : 'View Schedule';
    const renderHostManageQrActions = () => (
        <Group grow gap="sm" wrap="wrap">
            <Button
                variant="light"
                onClick={() => handleViewSchedule()}
            >
                {scheduleButtonLabel}
            </Button>
            <Button
                variant="default"
                leftSection={<QrCode size={16} />}
                onClick={() => setShowQrCodeModal(true)}
            >
                QR Code
            </Button>
        </Group>
    );
    const selectedTeamRegistration = selectedTeamId
        ? teams.find((team) => team.$id === selectedTeamId || team.parentTeamId === selectedTeamId) ?? null
        : null;
    const selectedTeamUsesSchedulableSlots = isTeamSignup && ['LEAGUE', 'TOURNAMENT'].includes(String(currentEvent.eventType ?? '').toUpperCase());
    const selectedTeamIsRegistered = Boolean(
        selectedTeamRegistration
        || (
            !selectedTeamUsesSchedulableSlots
            &&
            selectedTeamId
            && collectUniqueUserIds(currentEvent.teamIds).includes(selectedTeamId)
        ),
    );
    const selectedTeamPaymentFailed = Boolean(
        selectedTeamId
        && paymentFailedTeamIds.includes(selectedTeamId)
    );
    const selectedTeamIsWaitlisted = Boolean(selectedTeamId && normalizedWaitlistIdSet.has(selectedTeamId));
    const joinAtCapacity = eventAtCapacity || selectedDivisionAtCapacity;
    const showSelfWaitlistActions = !currentUserPaymentFailed && (joinAtCapacity || isUserWaitlisted);
    const childWaitlistMode = !isTeamSignup && (joinAtCapacity || selectedChildIsWaitlisted);
    const showTeamWaitlistActions = !selectedTeamPaymentFailed && !selectedTeamIsRegistered && (joinAtCapacity || selectedTeamIsWaitlisted);
    const selfJoinDisabled = weeklySelectionRequired || Boolean(selfRegistrationBlockedReason) || joining || confirmingPurchase || isDivisionSelectionMissing;
    const selfWaitlistJoinDisabled = weeklySelectionRequired || Boolean(selfRegistrationBlockedReason) || joining || isDivisionSelectionMissing;
    const selfWaitlistLeaveDisabled = joining || eventHasStarted;
    const freeAgentJoinBlockedReason = weeklySelectionRequired
                                ? 'Select a weekly session before joining as a free agent.'
        : selfRegistrationBlockedReason;
    const childPrimaryActionLabel = isTeamSignup
        ? (joiningChildFreeAgent
            ? 'Updating…'
            : (selectedChildIsFreeAgent ? 'Remove child from free agents' : 'Add child as free agent'))
        : childWaitlistMode
            ? (registeringChild
                ? 'Updating…'
                : (selectedChildIsWaitlisted ? 'Remove child from waitlist' : 'Add child to waitlist'))
            : (registeringChild ? 'Registering…' : 'Register child');
    const childJoinDisabled = !canRegisterChild
        || !selectedChildId
        || (isTeamSignup
            ? (!selectedChildEligible || joiningChildFreeAgent)
            : childWaitlistMode
                ? (
                    registeringChild
                    || (!selectedChildIsWaitlisted && (weeklySelectionRequired || !selectedChildEligible || isDivisionSelectionMissing || selectedChildIsRegistered))
                )
                : (weeklySelectionRequired || !selectedChildEligible || registeringChild || isDivisionSelectionMissing));
    const childRegistrationPanel = shouldShowChildRegistrationPanel ? (
        <Paper withBorder p="sm" radius="md" className="space-y-3">
            <Text size="sm" fw={600}>
                {isTeamSignup ? 'Child Free Agent' : (childWaitlistMode ? 'Child Waitlist' : 'Register a child')}
            </Text>
            {childrenError && (
                <Alert color="red" variant="light">
                    {childrenError}
                </Alert>
            )}
            {childrenLoading ? (
                <Text size="sm" c="dimmed">Loading children...</Text>
            ) : (
                <MantineSelect
                    placeholder="Select a child"
                    data={childOptions}
                    value={selectedChildId}
                    onChange={(value) => setSelectedChildId(value || '')}
                    comboboxProps={sharedComboboxProps}
                />
            )}
            {!childrenLoading && childOptions.length === 0 && (
                <Text size="xs" c="dimmed">
                    No active children linked yet. Add one from your profile.
                </Text>
            )}
            {isTeamSignup && (
                <Text size="xs" c="dimmed">
                    Team registration is only for teams. Child profiles can join as free agents.
                </Text>
            )}
            {!isTeamSignup && childWaitlistMode && (
                <Text size="xs" c="dimmed">
                    Manage the selected child&apos;s waitlist status.
                </Text>
            )}
            {selectedChild && !selectedChildHasEmail && !isTeamSignup && (
                <Alert color="yellow" variant="light">
                    The selected child can register now, but child-signature steps remain pending until an email is added.
                </Alert>
            )}
            {!isTeamSignup && childWaitlistMode && selectedChildIsRegistered && (
                <Alert color="green" variant="light">
                    The selected child is already registered for this event.
                </Alert>
            )}
            {!isTeamSignup && childWaitlistMode && selectedChildIsWaitlisted && (
                <Alert color="blue" variant="light">
                    The selected child is currently on the waitlist.
                </Alert>
            )}
            <Button
                fullWidth
                variant="light"
                onClick={handleRegisterChild}
                disabled={childJoinDisabled}
            >
                {childPrimaryActionLabel}
            </Button>
            {hasAgeLimits && (
                <Text size="xs" c="dimmed">
                    Eligible ages: {formatAgeRange(eventMinAge, eventMaxAge)}.
                </Text>
            )}
            {!isTeamSignup && showChildRegistrationStatus && childRegistration?.status && (
                <Text size="xs" c="dimmed">
                    Registration status: {childRegistration.status}
                </Text>
            )}
            {!isTeamSignup && showChildRegistrationStatus && childConsent?.status && (
                <Text size="xs" c="dimmed">
                    Consent status: {childConsent.status}
                </Text>
            )}
            {!isTeamSignup && showChildRegistrationStatus && (childConsent?.parentSignLink || childConsent?.childSignLink) && (
                <Group gap="xs">
                    {childConsent.parentSignLink && (
                        <Button
                            component="a"
                            href={childConsent.parentSignLink}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                        >
                            Parent Sign
                        </Button>
                    )}
                    {childConsent.childSignLink && (
                        <Button
                            component="a"
                            href={childConsent.childSignLink}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                            variant="light"
                        >
                            Child Sign
                        </Button>
                    )}
                </Group>
            )}
        </Paper>
    ) : null;

    const content = (
        <div className="space-y-6">
            {!renderInline && (
                <div
                    style={{
                        position: 'sticky',
                        top: 12,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        zIndex: SHEET_POPOVER_Z_INDEX + 20,
                    }}
                >
                    <ActionIcon
                        variant="filled"
                        color="gray"
                        radius="xl"
                        aria-label="Close"
                        onClick={onClose}
                        style={{
                            boxShadow: 'var(--mvp-shadow-overlay)',
                        }}
                    >
                        ×
                    </ActionIcon>
                </div>
            )}
            
            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                {/* Optional hero banner */}
                <div className="relative">
                    <Image
                        src={eventImageUrl}
                        alt={currentEvent.name}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 800px"
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                            e.currentTarget.src = eventImageFallbackUrl;
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                    {/* Event Info Overlay */}
                    <div className="absolute bottom-4 left-6 text-white">
                        <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {date} at {time}
                            </div>
                            <div className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {currentEvent.location}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Content */}
                        <div className="lg:col-span-2 space-y-6">
                            {renderInline ? (
                                <>
                                    <div>
                                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Details</h2>
                                        <div className="space-y-4">
                                            <Paper withBorder p="md" radius="md" className="space-y-4">
                                                <div>
                                                    <Text size="sm" c="dimmed">Hosted by</Text>
                                                    <Text fw={700}>{hostedByLabel}</Text>
                                                    {hostedByHandle && (
                                                        <Text size="sm" c="dimmed">{hostedByHandle}</Text>
                                                    )}
                                                </div>
                                                <ReadOnlyDetailsGrid
                                                    items={[
                                                        {
                                                            label: sharesSingleDayWindow ? 'Start Date & Time' : 'Start Date',
                                                            value: startDateValue
                                                                ? (
                                                                    sharesSingleDayWindow
                                                                        ? formatDisplayDateTime(startDateValue)
                                                                        : formatDisplayDate(startDateValue)
                                                                )
                                                                : '',
                                                        },
                                                        {
                                                            label: sharesSingleDayWindow ? 'End Time' : 'End Date',
                                                            value: endDateValue
                                                                ? (
                                                                    sharesSingleDayWindow
                                                                        ? formatDisplayTime(endDateValue)
                                                                        : formatDisplayDate(endDateValue)
                                                                )
                                                                : '',
                                                        },
                                                        { label: 'Location', value: currentEvent.location || 'Location coming soon' },
                                                        { label: 'Type', value: formatEnumDisplayLabel(currentEvent.eventType, 'Event') },
                                                        { label: 'Sport', value: sportLabel },
                                                        { label: 'Registration', value: isTeamSignup ? 'Team' : 'Individual' },
                                                        ...(typeof eventMinAge === 'number' || typeof eventMaxAge === 'number'
                                                            ? [{ label: 'Age Range', value: formatAgeRange(eventMinAge, eventMaxAge) }]
                                                            : []),
                                                    ]}
                                                />
                                                <div>
                                                    <Text size="sm" c="dimmed">About</Text>
                                                    <Text>
                                                        {currentEvent.description?.trim() || 'No description provided yet.'}
                                                    </Text>
                                                </div>
                                            </Paper>

                                            <Paper withBorder p="md" radius="md" className="space-y-4">
                                                <Text fw={700}>Event Details</Text>
                                                <ReadOnlyDetailsGrid
                                                    items={[
                                                        { label: 'Entry fee', value: eventPriceSummary },
                                                        { label: maxParticipantsLabel, value: String(currentEvent.maxParticipants) },
                                                        { label: 'Team size', value: String(currentEvent.teamSizeLimit) },
                                                        { label: 'Registration closes', value: registrationCutoffSummary },
                                                        { label: 'Refunds', value: refundSummary },
                                                        { label: 'Waitlist', value: String(normalizedWaitlistIds.length) },
                                                    ]}
                                                />
                                            </Paper>

                                            {divisionOptions.length > 0 && (
                                                <Paper withBorder p="md" radius="md" className="space-y-4">
                                                    <Text fw={700}>Divisions ({divisionOptions.length})</Text>
                                                    <div className="space-y-3">
                                                        {divisionOptions.map((division) => {
                                                            const priceCents = normalizePriceCents(
                                                                typeof division.priceCents === 'number'
                                                                    ? division.priceCents
                                                                    : currentEvent.price,
                                                            );
                                                            const maxDivisionParticipants = currentEvent.singleDivision
                                                                ? currentEvent.maxParticipants
                                                                : Math.max(
                                                                    2,
                                                                    Number.isFinite(Number(division.maxParticipants))
                                                                        ? Math.trunc(Number(division.maxParticipants))
                                                                        : currentEvent.maxParticipants,
                                                                );
                                                            const paymentPlanCount = Math.max(
                                                                typeof division.installmentCount === 'number' ? division.installmentCount : 0,
                                                                Array.isArray(division.installmentAmounts) ? division.installmentAmounts.length : 0,
                                                                Array.isArray(division.installmentDueDates) ? division.installmentDueDates.length : 0,
                                                            );
                                                            const playoffTeams = currentEvent.eventType === 'LEAGUE'
                                                                && currentEvent.includePlayoffs
                                                                && !currentEvent.singleDivision
                                                                && typeof division.playoffTeamCount === 'number'
                                                                ? Math.max(2, Math.trunc(division.playoffTeamCount))
                                                                : null;

                                                            return (
                                                                <div key={division.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                                                                    <Text fw={700}>{division.name}</Text>
                                                                    <ReadOnlyDetailsGrid
                                                                        items={[
                                                                            {
                                                                                label: 'Format',
                                                                                value: division.divisionTypeName,
                                                                            },
                                                                            ...(division.ageCutoffLabel
                                                                                ? [{ label: 'Age cutoff', value: division.ageCutoffLabel }]
                                                                                : []),
                                                                            {
                                                                                label: 'Price',
                                                                                value: formatPrice(priceCents),
                                                                            },
                                                                            {
                                                                                label: isTeamSignup ? 'Max teams' : 'Max participants',
                                                                                value: String(maxDivisionParticipants),
                                                                            },
                                                                            ...(division.allowPaymentPlans && paymentPlanCount > 0
                                                                                ? [{ label: 'Payment plan', value: `${paymentPlanCount} installments` }]
                                                                                : []),
                                                                            ...(playoffTeams !== null
                                                                                ? [{ label: 'Playoff teams', value: String(playoffTeams) }]
                                                                                : []),
                                                                        ]}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </Paper>
                                            )}

                                            {canViewStaffSection && (
                                                <Paper withBorder p="md" radius="md" className="space-y-4">
                                                    <Text fw={700}>Staff</Text>
                                                    <ReadOnlyDetailsGrid
                                                        items={[
                                                            { label: 'Primary host', value: hostedByLabel },
                                                            { label: 'Assistant host count', value: String(assistantHostNames.length) },
                                                            {
                                                                label: 'Assistant hosts',
                                                                value: formatReadOnlyValueList(assistantHostNames, 'No assistant hosts assigned'),
                                                            },
                                                            { label: 'Official count', value: String(officialNames.length) },
                                                            {
                                                                label: 'Officials',
                                                                value: formatReadOnlyValueList(officialNames, 'No officials assigned'),
                                                            },
                                                            {
                                                                label: 'Staffing mode',
                                                                value: formatOfficialSchedulingModeLabel(currentEvent.officialSchedulingMode),
                                                            },
                                                            { label: 'Official positions', value: officialPositionsSummary },
                                                            ...(currentEvent.doTeamsOfficiate === true
                                                                ? [{ label: 'Teams provide officials', value: 'Yes' }]
                                                                : []),
                                                            ...(currentEvent.doTeamsOfficiate === true
                                                                ? [{ label: 'Team officials may swap', value: currentEvent.teamOfficialsMaySwap === true ? 'Yes' : 'No' }]
                                                                : []),
                                                        ]}
                                                    />
                                                </Paper>
                                            )}

                                            {currentEvent.eventType === 'LEAGUE' && (
                                                <Paper withBorder p="md" radius="md" className="space-y-4">
                                                    <Text fw={700}>League Scoring Rules</Text>
                                                    <ReadOnlyDetailsGrid
                                                        items={[
                                                            {
                                                                label: 'Scoring profile',
                                                                value: sportLabel || 'Default',
                                                            },
                                                        ]}
                                                    />
                                                </Paper>
                                            )}

                                            {supportsScheduleDetails && (
                                                <Paper withBorder p="md" radius="md" className="space-y-4">
                                                    <Text fw={700}>Schedule</Text>
                                                    <ReadOnlyDetailsGrid items={scheduleDetailRows} />
                                                    <div className="space-y-3">
                                                        <Text size="sm" c="dimmed">Weekly timeslots</Text>
                                                        {scheduleTimeslotGroups.length === 0 ? (
                                                            <Text size="sm" c="dimmed">No weekly timeslots configured.</Text>
                                                        ) : (
                                                            <div className="space-y-4">
                                                                {scheduleTimeslotGroups.map(([dayOfWeek, slots]) => (
                                                                    <div key={`timeslot-day-${dayOfWeek}`} className="space-y-2">
                                                                        <Text fw={700}>{`${getDayOfWeekLabel(dayOfWeek)} (${slots.length})`}</Text>
                                                                        <div className="space-y-2">
                                                                            {slots.map((slot) => {
                                                                                const fieldNames = uniqueNonEmptyStrings(
                                                                                    (
                                                                                        Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
                                                                                            ? slot.scheduledFieldIds
                                                                                            : typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.trim().length > 0
                                                                                                ? [slot.scheduledFieldId]
                                                                                                : []
                                                                                    ).map((fieldId: string) => {
                                                                                        const resolved = scheduleFieldNamesById.get(fieldId);
                                                                                        return getFieldDisplayName(
                                                                                            {
                                                                                                $id: fieldId,
                                                                                                name: resolved?.name ?? '',
                                                                                            },
                                                                                            fieldId,
                                                                                        );
                                                                                    }),
                                                                                );
                                                                                const divisionNames = uniqueNonEmptyStrings(
                                                                                    (
                                                                                        Array.isArray(slot.divisions) && slot.divisions.length
                                                                                            ? slot.divisions
                                                                                            : fallbackDivisionIds
                                                                                    ).map((divisionId: string) => resolveDivisionDisplayName({
                                                                                        division: divisionId,
                                                                                        divisionNameIndex: divisionDisplayNameIndex,
                                                                                        sportInput: sportLabel,
                                                                                    }) ?? divisionId),
                                                                                );

                                                                                return (
                                                                                    <div key={slot.$id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                                                                                        <Text fw={700}>
                                                                                            {formatSlotTimeRange(slot.startTimeMinutes, slot.endTimeMinutes)}
                                                                                        </Text>
                                                                                        <ReadOnlyDetailsGrid
                                                                                            items={[
                                                                                                { label: 'Day', value: getDayOfWeekLabel(dayOfWeek) },
                                                                                                {
                                                                                                    label: `Fields (${fieldNames.length})`,
                                                                                                    value: formatReadOnlyValueList(fieldNames, 'Not assigned'),
                                                                                                },
                                                                                                {
                                                                                                    label: `Divisions (${divisionNames.length})`,
                                                                                                    value: formatReadOnlyValueList(divisionNames, 'Not assigned'),
                                                                                                },
                                                                                            ]}
                                                                                        />
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </Paper>
                                            )}

                                            {googleMapsLink && mapEmbedSrc && (
                                                <Paper withBorder p="md" radius="md" className="space-y-4">
                                                    <Text fw={700}>Map</Text>
                                                    <ReadOnlyDetailsGrid
                                                        items={[
                                                            { label: 'Location', value: currentEvent.location || 'Location coming soon' },
                                                            ...(eventAddress
                                                                ? [{ label: 'Address', value: eventAddress }]
                                                                : []),
                                                            ...(!eventAddress && hasValidCoords
                                                                ? [{ label: 'Coordinates', value: `${mapLat.toFixed(4)}, ${mapLng.toFixed(4)}` }]
                                                                : []),
                                                        ]}
                                                    />
                                                    <div>
                                                        <Button
                                                            component="a"
                                                            href={googleMapsLink}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            variant="light"
                                                            size="sm"
                                                        >
                                                            Open in Google Maps
                                                        </Button>
                                                    </div>
                                                    <div className="overflow-hidden rounded-md border border-gray-200" style={{ aspectRatio: '16 / 9' }}>
                                                        <iframe
                                                            title="Event location preview"
                                                            src={mapEmbedSrc}
                                                            className="w-full h-full"
                                                            loading="lazy"
                                                            allowFullScreen
                                                        />
                                                    </div>
                                                </Paper>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Event Info */}
                                    <div>
                                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Event Details</h2>
                                        <Paper withBorder p="md" radius="md" className="space-y-3">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-sm text-gray-600">Type</span>
                                                    <p className="font-medium">{formatEnumDisplayLabel(currentEvent.eventType, 'Event')}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-600">Registration</span>
                                                    <p className="font-medium">{isTeamSignup ? 'Team registration' : 'Individual registration'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-600">Price</span>
                                                    <p className="font-medium">
                                                        {selectedDivisionBilling.priceCents === 0
                                                            ? 'Free'
                                                            : `${formatPrice(selectedDivisionBilling.priceCents)}`}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-600">Sport</span>
                                                    <p className="font-medium">
                                                        {currentEvent.sport?.name || currentEvent.sportId || 'TBD'}
                                                    </p>
                                                </div>
                                                {(typeof eventMinAge === 'number' || typeof eventMaxAge === 'number') && (
                                                    <div>
                                                        <span className="text-sm text-gray-600">Age Range</span>
                                                        <p className="font-medium">{formatAgeRange(eventMinAge, eventMaxAge)}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {eventDivisionLabels.length > 0 && (
                                                <div>
                                                    <span className="text-sm text-gray-600">Divisions</span>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {eventDivisionLabels.map((divisionLabel, index) => (
                                                            <span key={index} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                                                {divisionLabel}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </Paper>
                                    </div>

                                    {/* Description */}
                                    <Paper withBorder p="md" radius="md">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                                        <p className="text-gray-700 leading-relaxed">{currentEvent.description}</p>
                                    </Paper>

                                    {googleMapsLink && mapEmbedSrc && (
                                        <Paper withBorder p="md" radius="md" className="space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <Text size="sm" c="dimmed">Location</Text>
                                                    <Text fw={600}>{currentEvent.location || 'Location coming soon'}</Text>
                                                    {hasValidCoords && (
                                                        <Text size="xs" c="dimmed">
                                                            {mapLat.toFixed(4)}, {mapLng.toFixed(4)}
                                                        </Text>
                                                    )}
                                                </div>
                                                <Button
                                                    component="a"
                                                    href={googleMapsLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    variant="light"
                                                    size="sm"
                                                >
                                                    Open in Google Maps
                                                </Button>
                                            </div>
                                            <div className="overflow-hidden rounded-md border border-gray-200" style={{ aspectRatio: '16 / 9' }}>
                                                <iframe
                                                    title="Event location preview"
                                                    src={mapEmbedSrc}
                                                    className="w-full h-full"
                                                    loading="lazy"
                                                    allowFullScreen
                                                />
                                            </div>
                                        </Paper>
                                    )}

                                    {/* Tournament Details */}
                                    {currentEvent.eventType === 'TOURNAMENT' && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Format</h3>
                                            <Paper withBorder p="md" radius="md" className="space-y-2">
                                                {currentEvent.doubleElimination && (
                                                    <p><span className="font-medium">Format:</span> Double Elimination</p>
                                                )}
                                                {currentEvent.prize && (
                                                    <p><span className="font-medium">Prize:</span> {currentEvent.prize}</p>
                                                )}
                                                {currentEvent.winnerSetCount && (
                                                    <p><span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}</p>
                                                )}
                                            </Paper>
                                        </div>
                                    )}

                                    {/* League Playoff Details */}
                                    {currentEvent.eventType === 'LEAGUE' && currentEvent.includePlayoffs && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Playoff Format</h3>
                                            <Paper withBorder p="md" radius="md" className="space-y-2">
                                                <p>
                                                    <span className="font-medium">Teams Included:</span>{' '}
                                                    {currentEvent.playoffTeamCount ?? 'Configured'}
                                                </p>
                                                {typeof currentEvent.doubleElimination === 'boolean' && (
                                                    <p>
                                                        <span className="font-medium">Format:</span>{' '}
                                                        {currentEvent.doubleElimination ? 'Double Elimination' : 'Single Elimination'}
                                                    </p>
                                                )}
                                                {typeof currentEvent.winnerSetCount === 'number' && currentEvent.winnerSetCount > 0 && (
                                                    <p>
                                                        <span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}
                                                    </p>
                                                )}
                                            </Paper>
                                        </div>
                                    )}

                                    {/* Event Stats */}
                                    <Paper withBorder p="md" radius="md">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Stats</h3>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Max Participants:</span>
                                                <span className="font-medium">{participantCapacity}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Team Size:</span>
                                                <span className="font-medium">{currentEvent.teamSizeLimit}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Registration Cutoff:</span>
                                                <span className="font-medium">{registrationCutoffSummary}</span>
                                            </div>
                                        </div>
                                    </Paper>
                                </>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            {showParticipantsSection && (
                                <>
                            {/* Participants */}
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Participants</h3>

                            <Paper withBorder p="md" radius="md" className="space-y-3">
                                <Group justify="space-between" align="flex-start" gap="xs">
                                    <div>
                                        <Text size="xs" c="dimmed">{isTeamSignup ? 'Teams' : 'Spots'}</Text>
                                        <Text fw={600}>
                                            {participantCapacity > 0
                                                ? `${totalParticipants}/${participantCapacity}`
                                                : totalParticipants}
                                        </Text>
                                    </div>
                                    <div>
                                        <Text size="xs" c="dimmed">{isTeamSignup ? 'Free Agents' : 'Waitlist'}</Text>
                                        <Text fw={600}>
                                            {isTeamSignup
                                                ? normalizedFreeAgentIds.length
                                                : normalizedWaitlistIds.length}
                                        </Text>
                                    </div>
                                    <div>
                                        <Text size="xs" c="dimmed">Left</Text>
                                        <Text fw={600}>{participantCapacity > 0 ? spotsLeft : '—'}</Text>
                                    </div>
                                </Group>
                                <Progress value={eventFillPercent} />
                                <Text size="xs" c="dimmed">
                                    {participantCapacity > 0
                                        ? `${eventFillPercent}% full • ${spotsLeft} left`
                                        : 'No capacity configured'}
                                </Text>

                                {divisionCapacityBreakdown.length > 0 && (
                                    <>
                                        <Button
                                            variant="subtle"
                                            size="xs"
                                            px={0}
                                            onClick={() => setShowCapacityBreakdown((prev) => !prev)}
                                        >
                                            {showCapacityBreakdown ? 'Hide division breakdown' : 'Show division breakdown'}
                                        </Button>
                                        <Collapse in={showCapacityBreakdown}>
                                            <div className="space-y-2 pt-2">
                                                {divisionCapacityBreakdown.map((divisionRow) => {
                                                    const sportInput = typeof currentEvent?.sport === 'string'
                                                        ? currentEvent.sport
                                                        : currentEvent?.sport?.name ?? currentEvent?.sportId ?? null;
                                                    const divisionLabel = resolveDivisionDisplayName({
                                                        division: divisionRow.divisionId,
                                                        divisionNameIndex: divisionDisplayNameIndex,
                                                        sportInput,
                                                    }) ?? divisionRow.name ?? 'Division';
                                                    const divisionLeft = divisionRow.capacity > 0
                                                        ? Math.max(0, divisionRow.capacity - divisionRow.filled)
                                                        : 0;
                                                    const divisionPercent = divisionRow.capacity > 0
                                                        ? Math.min(100, Math.round((divisionRow.filled / divisionRow.capacity) * 100))
                                                        : 0;
                                                    return (
                                                        <Paper
                                                            key={divisionRow.divisionId}
                                                            withBorder
                                                            p="sm"
                                                            radius="md"
                                                            className="space-y-2"
                                                        >
                                                            <Group justify="space-between" align="center" gap="xs">
                                                                <Text size="sm" fw={600}>
                                                                    {divisionLabel}
                                                                </Text>
                                                                <Text size="sm" c="dimmed" fw={600}>
                                                                    {divisionRow.capacity > 0
                                                                        ? `${divisionRow.filled}/${divisionRow.capacity}`
                                                                        : divisionRow.filled}
                                                                </Text>
                                                            </Group>
                                                            <Progress value={divisionPercent} size="sm" />
                                                            <Text size="xs" c="dimmed">
                                                                {divisionRow.capacity > 0
                                                                    ? `${divisionPercent}% full • ${divisionLeft} left`
                                                                    : 'No capacity configured'}
                                                            </Text>
                                                        </Paper>
                                                    );
                                                })}
                                            </div>
                                        </Collapse>
                                    </>
                                )}
                            </Paper>

                            {/* Players Section */}
                            {!isTeamSignup && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Players"
                                        participants={players}
                                        totalCount={players.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowPlayersDropdown(true)}
                                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                        emptyMessage="No players registered yet"
                                    />
                                </div>
                            )}

                            {/* Teams Section */}
                            {isTeamSignup && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Teams"
                                        participants={teams}
                                        totalCount={teams.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowTeamsDropdown(true)}
                                        getAvatarUrl={(participant) => getTeamAvatarUrl(participant as Team, 32)}
                                        emptyMessage="No teams registered yet"
                                    />
                                </div>
                            )}

                            {/* Free Agents Section */}
                            {isTeamSignup && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Free Agents"
                                        participants={freeAgents}
                                        totalCount={normalizedFreeAgentIds.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowFreeAgentsDropdown(true)}
                                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                        emptyMessage="No free agents yet"
                                    />
                                </div>
                            )}
                                </>
                            )}

                            {/* Join Options (includes total participants) */}
                            <Paper withBorder p="md" radius="md">
                                {joinError && <Alert color="red" variant="light" mb="sm">{joinError}</Alert>}
                                {joinNotice && <Alert color="green" variant="light" mb="sm">{joinNotice}</Alert>}
                                {isAffiliateEvent && (
                                    <Stack gap="xs">
                                        <Button
                                            component="a"
                                            href={affiliateActionUrl || undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            fullWidth
                                            disabled={!affiliateActionUrl}
                                        >
                                            View Event
                                        </Button>
                                        <Text size="xs" c="dimmed" ta="center">
                                            Registration or booking continues on the organizer&apos;s website.
                                        </Text>
                                    </Stack>
                                )}
                                {!isAffiliateEvent && isWeeklyParentEvent && (
                                    <div className="space-y-3 mb-4">
                                        <Group justify="space-between" align="center" gap="xs">
                                            <div>
                                                <Text size="sm" fw={600}>
                                            {selectedWeeklyOccurrenceOption ? 'Selected weekly session' : 'Select a weekly session'}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    Choose the day and slot you want to register for.
                                                </Text>
                                            </div>
                                            {selectedWeeklyOccurrenceOption && onWeeklyOccurrenceChange && (
                                                <Button
                                                    variant="subtle"
                                                    color="red"
                                                    size="compact-sm"
                                                    onClick={() => onWeeklyOccurrenceChange(null)}
                                                >
                                                    Clear
                                                </Button>
                                            )}
                                        </Group>
                                        {weeklySessionOptions.length === 0 ? (
                                            <Alert color="yellow" variant="light">
                                                No upcoming weekly sessions are available.
                                            </Alert>
                                        ) : (
                                            <div
                                                className={`space-y-2 ${shouldScrollWeeklySessions ? 'overflow-y-auto pr-1' : ''}`}
                                                style={shouldScrollWeeklySessions ? { maxHeight: WEEKLY_SESSION_LIST_MAX_HEIGHT_PX } : undefined}
                                            >
                                                {weeklySessionOptions.map((session) => {
                                                    const isSelected = selectedWeeklyOccurrenceOption?.slotId === session.slotId
                                                        && selectedWeeklyOccurrenceOption?.occurrenceDate === session.occurrenceDate;
                                                    return (
                                                        <button
                                                            key={session.id}
                                                            type="button"
                                                            onClick={() => { void handleWeeklySessionSelect(session); }}
                                                            className={`w-full rounded-lg border p-2 text-left transition ${
                                                                isSelected
                                                                    ? 'border-red-400 bg-red-50 shadow-sm'
                                                                    : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
                                                                    <Image
                                                                        src={eventImageUrl}
                                                                        alt={currentEvent.name}
                                                                        fill
                                                                        unoptimized
                                                                        sizes="96px"
                                                                        className="object-cover"
                                                                    />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <Text size="sm" fw={600} className="truncate">
                                                                        {session.label}
                                                                    </Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        Divisions: {session.divisionLabel}
                                                                    </Text>
                                                                    <Text size="xs" c={isSelected ? 'red' : 'dimmed'}>
                                                                        {isSelected ? 'Selected' : 'Tap to select'}
                                                                    </Text>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!isAffiliateEvent ? ((!isWeeklyParentEvent || !weeklySelectionRequired) ? (
                                    <>
                                {hasAgeLimits && (
                                    <Alert color="yellow" variant="light" mb="sm">
                                        <Text fw={600} size="sm">
                                            Age-restricted event
                                        </Text>
                                        <Text size="sm">
                                            Eligible ages: {formatAgeRange(eventMinAge, eventMaxAge)}. We only check eligibility using the date of birth you enter in your profile. The host may verify age at check-in (for example, photo ID).
                                        </Text>
                                    </Alert>
                                )}
                                {divisionOptions.length > 0 && (
                                    <Paper withBorder p="sm" radius="md" mb="sm" className="space-y-2">
                                        <Text size="sm" fw={600}>
                                            {registrationByDivisionType ? 'Division Type' : 'Division'}
                                        </Text>
                                        <MantineSelect
                                            placeholder={registrationByDivisionType ? 'Select a division type' : 'Select a division'}
                                            data={registrationByDivisionType
                                                ? divisionTypeOptions
                                                : divisionOptions.map((option) => ({
                                                    value: option.id,
                                                    label: option.name,
                                                }))}
                                            value={registrationByDivisionType
                                                ? (selectedDivisionTypeKey || null)
                                                : (selectedDivisionId || null)}
                                            onChange={(value) => {
                                                if (registrationByDivisionType) {
                                                    const nextValue = value || '';
                                                    setSelectedDivisionTypeKey(nextValue);
                                                    saveEventRegistrationProgress({
                                                        selectedDivisionTypeKey: nextValue || null,
                                                    });
                                                    return;
                                                }
                                                const nextValue = value || '';
                                                setSelectedDivisionId(nextValue);
                                                saveEventRegistrationProgress({
                                                    selectedDivisionId: nextValue || null,
                                                });
                                            }}
                                            comboboxProps={sharedComboboxProps}
                                        />
                                        {registrationByDivisionType && selectedDivisionOption && (
                                            <Text size="xs" c="dimmed">
                                                Auto-assigned division: {selectedDivisionOption.name}
                                            </Text>
                                        )}
                                        {!hasAgeLimits && selectedDivisionOption?.ageCutoffLabel && (
                                            <Text size="xs" c="dimmed">
                                                {selectedDivisionOption.ageCutoffLabel}
                                            </Text>
                                        )}
                                    </Paper>
                                )}
                                {isDivisionSelectionMissing && (
                                    <Alert color="yellow" variant="light" mb="sm">
                                        {registrationByDivisionType
                                            ? 'Choose a division type before registration.'
                                            : 'Choose a division before registration.'}
                                    </Alert>
                                )}

                                {!user ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <Button fullWidth color="blue" onClick={openAuthModal}>
                                            Register / Login
                                        </Button>
                                        <Text size="xs" c="dimmed" mt="xs">
                                            Sign in or create an account to register or purchase.
                                        </Text>
                                    </div>
                                ) : isUserRegistered ? (
                                    <>
                                        <Text size="sm" c="green" fw={500} ta="center">
                                            {"✓ You're registered for this event"}
                                        </Text>
                                        <div style={{ textAlign: 'center', marginTop: 8 }}>
                                            <Text size="sm" c="dimmed">
                                                {totalParticipants} / {participantCapacity} total participants
                                            </Text>
                                        </div>
                                        {canShowScheduleButton && (
                                            <div className="mt-4 space-y-2">
                                                {renderHostManageQrActions()}
                                                {currentEvent.eventType === 'TOURNAMENT' && (
                                                    <Button
                                                        fullWidth
                                                        color="green"
                                                        onClick={handleBracketClick}
                                                    >
                                                        View Tournament Bracket
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="space-y-3">
                                        {!isTeamSignup ? (
                                            <div className="space-y-3">
                                                {selfRegistrationBlockedReason && (
                                                    <Alert color="yellow" variant="light">
                                                        {selfRegistrationBlockedReason}
                                                    </Alert>
                                                )}
                                                {!selfRegistrationBlockedReason && isMinor && (
                                                    <Alert color="blue" variant="light">
                                                        Your join request will be sent to a linked parent/guardian for approval.
                                                    </Alert>
                                                )}

                                                {showSelfWaitlistActions ? (
                                                    isUserWaitlisted ? (
                                                        <div className="space-y-2">
                                                            <Text size="sm" c="blue" fw={500} ta="center">
                                                                {"✓ You're on the waitlist"}
                                                            </Text>
                                                            <Button
                                                                fullWidth
                                                                color="red"
                                                                variant="light"
                                                                onClick={async () => {
                                                                    if (!user) return;
                                                                    setJoining(true);
                                                                    setJoinError(null);
                                                                    try {
                                                                        await eventService.removeFromWaitlist(currentEvent.$id, user.$id, 'user', selectedWeeklyOccurrence);
                                                                        setJoinNotice('Removed from waitlist.');
                                                                        await loadEventDetails();
                                                                    } catch (e) {
                                                                        setJoinError(e instanceof Error ? e.message : 'Failed to leave waitlist');
                                                                    } finally {
                                                                        setJoining(false);
                                                                    }
                                                                }}
                                                                disabled={selfWaitlistLeaveDisabled}
                                                            >
                                                                {eventHasStarted ? 'Unavailable' : (joining ? 'Updating…' : 'Leave Waitlist')}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            fullWidth
                                                            color="orange"
                                                            onClick={() => { void handleJoinWaitlist(); }}
                                                            disabled={selfWaitlistJoinDisabled}
                                                        >
                                                            {eventHasStarted
                                                                ? 'Unavailable'
                                                                : joining
                                                                ? (isMinor ? 'Sending…' : 'Adding…')
                                                                : (isMinor ? 'Send' : 'Join Waitlist')}
                                                        </Button>
                                                    )
                                                ) : (
                                                    <Button
                                                        fullWidth
                                                        color="blue"
                                                            onClick={() => { void handleJoinEvent(); }}
                                                            disabled={selfJoinDisabled}
                                                        >
                                                            {eventHasStarted
                                                                ? 'Unavailable'
                                                                : confirmingPurchase
                                                            ? 'Confirming purchase…'
                                                                    : joining
                                                                        ? 'Submitting…'
                                                                        : isMinor
                                                                            ? 'Send'
                                                                    : selectedDivisionBilling.priceCents > 0
                                                                    ? (currentUserPaymentFailed ? 'Complete payment' : `Join Event - ${formatPrice(selectedDivisionBilling.priceCents)}`)
                                                                    : 'Join Event'}
                                                    </Button>
                                                )}

                                                {canShowScheduleButton && (
                                                    <div className="mt-2">
                                                        {renderHostManageQrActions()}
                                                    </div>
                                                )}

                                                {childRegistrationPanel}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {eventHasStarted && (
                                                    <Alert color="yellow" variant="light">
                                                        {isWeeklyParentEvent && selectedWeeklyOccurrenceOption
                                            ? 'This weekly session has already started. Joining and leaving are no longer available.'
                                                            : 'This event has already started. Joining and leaving are no longer available.'}
                                                    </Alert>
                                                )}
                                                <Button fullWidth disabled={eventHasStarted} onClick={() => setShowTeamJoinOptions(prev => !prev)}>
                                                    {showTeamJoinOptions ? 'Hide Team Options' : 'View Team Options'}
                                                </Button>

                                                {showTeamJoinOptions && (
                                                    <Paper withBorder p="md" radius="md" className="space-y-4">
                                                        {isLoadingTeams ? (
                                                            <div className="text-sm text-gray-600">Loading your teams...</div>
                                                        ) : userTeams.length > 0 ? (
                                                            <div className="space-y-4">
                                                                <div>
                                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                        Select your team
                                                                    </label>
                                                                    <MantineSelect
                                                                        placeholder="Choose a team"
                                                                        data={userTeams.map(t => ({
                                                                            value: t.$id,
                                                                            label: `${t.name || 'Team'} (${typeof t.division === 'string' ? t.division : (t.division as any)?.name || 'Division'})`
                                                                        }))}
                                                                        value={selectedTeamId}
                                                                        onChange={(value) => {
                                                                            const nextValue = value || '';
                                                                            setSelectedTeamId(nextValue);
                                                                            saveEventRegistrationProgress({
                                                                                selectedTeamId: nextValue || null,
                                                                            });
                                                                        }}
                                                                        searchable
                                                                        comboboxProps={sharedComboboxProps}
                                                                    />
                                                                </div>

                                                                {/* Manage Teams Button Section - Matching Hide/Show button height */}
                                                                <div className="flex justify-center">
                                                                    <Button variant="default"
                                                                        onClick={() => {
                                                                            router.push(`/teams?event=${currentEvent.$id}`);
                                                                            onClose();
                                                                        }}
                                                                    >
                                                                        Manage Teams
                                                                    </Button>
                                                                </div>

                                                                {/* Join/Waitlist Button Section - Matching Hide/Show button height */}
                                                                <div className="flex flex-col items-center gap-2 pt-2">
                                                                    {showTeamWaitlistActions ? (
                                                                        <Button
                                                                            onClick={() => { void handleJoinTeamWaitlist(); }}
                                                                            disabled={
                                                                                joining
                                                                                || eventHasStarted
                                                                                || weeklySelectionRequired
                                                                                || !selectedTeamId
                                                                                || (!selectedTeamIsWaitlisted && isDivisionSelectionMissing)
                                                                            }
                                                                            color="orange"
                                                                        >
                                                                            {eventHasStarted
                                                                                ? 'Unavailable'
                                                                                : joining
                                                                                ? 'Updating...'
                                                                                : (selectedTeamIsWaitlisted ? 'Leave Waitlist' : 'Join Waitlist')}
                                                                        </Button>
                                                                    ) : (
                                                                        <Button
                                                                            onClick={() => { void handleJoinAsTeam(); }}
                                                                            disabled={
                                                                                joining
                                                                                || eventHasStarted
                                                                                || weeklySelectionRequired
                                                                                || !selectedTeamId
                                                                                || confirmingPurchase
                                                                                || isDivisionSelectionMissing
                                                                                || selectedTeamIsRegistered
                                                                            }
                                                                            color={selectedTeamIsRegistered ? 'gray' : 'green'}
                                                                        >
                                                                            {eventHasStarted
                                                                                ? 'Unavailable'
                                                                                : selectedTeamIsRegistered
                                                                                ? 'Already in Event'
                                                                                : confirmingPurchase
                                                                                ? 'Confirming purchase...'
                                                                                : joining
                                                                                    ? 'Joining...'
                                                                                    : (!isFreeForUser && selectedDivisionBilling.priceCents > 0)
                                                                                        ? (selectedTeamPaymentFailed ? 'Complete payment' : `Join for ${formatPrice(selectedDivisionBilling.priceCents)}`)
                                                                                        : 'Join Event'}
                                                                        </Button>
                                                                    )}
                                                                    {selectedTeamIsRegistered && (
                                                                        <Button
                                                                            onClick={() => { void handleWithdrawTeam(); }}
                                                                            disabled={joining || eventHasStarted || weeklySelectionRequired || !selectedTeamId}
                                                                            color={!isFreeForUser && selectedDivisionBilling.priceCents > 0 ? 'orange' : 'red'}
                                                                            variant="light"
                                                                        >
                                                                            {joining
                                                                                ? 'Withdrawing...'
                                                                                : 'Withdraw Team'}
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center space-y-3">
                                                                <p className="text-sm text-gray-600">
                                                                    You have no managed teams for {currentEvent.sport?.name}.
                                                                </p>
                                                                <Button variant="default"
                                                                    onClick={() => {
                                                                        router.push(`/teams?event=${currentEvent.$id}`);
                                                                        onClose();
                                                                    }}
                                                                >
                                                                    Create Team
                                                                </Button>
                                                                {/* Total participants below actions */}
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <Text size="sm" c="dimmed">
                                                                        {totalParticipants} / {participantCapacity} total participants
                                                                    </Text>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Paper>

                                                )}
                                                {!selfRegistrationBlockedReason && isMinor && (
                                                    <Alert color="blue" variant="light">
                                                        Tap Send to request parent/guardian approval before joining as a free agent.
                                                    </Alert>
                                                )}
                                                {isUserFreeAgent ? (
                                                    <div className="space-y-2">
                                                        <div className="w-full py-2 px-4 rounded-lg bg-purple-50 text-purple-700 text-center font-medium">
                                                            You are listed as a free agent
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                if (!user) return;
                                                                setJoining(true);
                                                                setJoinError(null);
                                                                try {
                                                                    await eventService.removeFreeAgent(currentEvent.$id, user.$id, selectedWeeklyOccurrence);
                                                                    await loadEventDetails();
                                                                } catch (e) {
                                                                    setJoinError(e instanceof Error ? e.message : 'Failed to leave free agents');
                                                                } finally {
                                                                    setJoining(false);
                                                                }
                                                            }}
                                                            disabled={joining || eventHasStarted}
                                                            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${(joining || eventHasStarted) ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                                                        >
                                                            {eventHasStarted ? 'Unavailable' : (joining ? 'Updating…' : 'Leave Free Agent List')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={async () => {
                                                            if (!user) return;
                                                            if (freeAgentJoinBlockedReason) {
                                                                setJoinError(freeAgentJoinBlockedReason);
                                                                return;
                                                            }
                                                            if (isMinor) {
                                                                const minorIntent: JoinIntent = { mode: 'user' };
                                                                if (shouldAskRegistrationQuestions(minorIntent)) {
                                                                    openRegistrationQuestionsStep(minorIntent);
                                                                    return;
                                                                }
                                                            }
                                                            setJoining(true);
                                                            setJoinError(null);
                                                            try {
                                                                if (isMinor) {
                                                                    const result = await registrationService.registerSelfForEvent(
                                                                        currentEvent.$id,
                                                                        resolvedDivisionSelectionPayload,
                                                                    );
                                                                    if (result.requiresParentApproval) {
                                                                        setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                                                                    } else {
                                                                        setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                                                                    }
                                                                    await loadEventDetails();
                                                                    return;
                                                                }
                                                                // Free Agent listing is free; no payment
                                                                await eventService.addFreeAgent(currentEvent.$id, user.$id, selectedWeeklyOccurrence);
                                                                await loadEventDetails();
                                                            } catch (e) {
                                                                setJoinError(e instanceof Error ? e.message : 'Failed to join as free agent');
                                                            } finally {
                                                                setJoining(false);
                                                            }
                                                        }}
                                                        disabled={joining || Boolean(freeAgentJoinBlockedReason)}
                                                        className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${(joining || freeAgentJoinBlockedReason) ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                                                    >
                                                        {joining
                                                            ? (isMinor ? 'Sending…' : 'Adding…')
                                                            : freeAgentJoinBlockedReason
                                                                ? 'Unavailable'
                                                                : isMinor
                                                                    ? 'Send'
                                                                    : 'Join as Free Agent (Free)'}
                                                    </button>
                                                )}

                                                {childRegistrationPanel}

                                                {/* View Schedule / Bracket Buttons */}
                                                {canShowScheduleButton && (
                                                    <div className="mt-2">
                                                        {renderHostManageQrActions()}
                                                    </div>
                                                )}

                                                {!renderInline && currentEvent.eventType === 'TOURNAMENT' &&
                                                    <button
                                                        onClick={handleBracketClick}
                                                        className="w-full mt-2 py-2 px-4 rounded-lg bg-green-600 text-white hover:bg-green-700"
                                                    >
                                                        View Tournament Bracket
                                                    </button>
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                                    </>
                                ) : (
                                    <Alert color="blue" variant="light">
                                                            Select a weekly session to see registration options.
                                    </Alert>
                                )) : null}
                            </Paper>

                            {/* Refund Options */}
                            <RefundSection
                                event={currentEvent}
                                userRegistered={!!isUserRegistered}
                                linkedChildren={activeChildren}
                                selectedOccurrence={selectedWeeklyOccurrence ?? null}
                                effectiveStart={eventStartDate}
                                onRefundSuccess={loadEventDetails}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderEventTeamParticipant = (team: Team | UserData) => {
        const teamRow = team as Team;
        const organizationName = getOrganizationName(currentEvent.organization) ?? currentEvent.location ?? 'Event';
        const sportInput = typeof currentEvent?.sport === 'string'
            ? currentEvent.sport
            : currentEvent?.sport?.name ?? currentEvent?.sportId ?? null;
        const divisionLabel = resolveDivisionDisplayName({
            division: teamRow.division,
            divisionNameIndex: divisionDisplayNameIndex,
            sportInput,
        }) ?? 'Division';
        const divisionSuffix = /\bdivision\b/i.test(divisionLabel) ? '' : ' Division';

        return (
            <TeamRegistrationFlow
                team={teamRow}
                user={user}
                paymentSummary={{
                    name: teamRow.name || 'Team',
                    location: organizationName,
                    eventType: currentEvent.eventType,
                    price: Math.max(0, Math.round(Number(teamRow.registrationPriceCents ?? 0))),
                }}
                organization={{
                    $id: currentEvent.organizationId ?? undefined,
                    name: organizationName,
                }}
                onRequireAuth={openAuthModal}
                onTeamUpdated={() => {
                    void loadEventDetails(currentEvent.$id, { automatic: false });
                }}
                onCompleted={async () => {
                    setJoinNotice(`You joined ${teamRow.name || 'this team'}.`);
                    await loadEventDetails(currentEvent.$id, { automatic: false });
                }}
            >
                {(flow) => (
                    <div className="space-y-2 rounded-lg p-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                            <Image
                                src={getTeamAvatarUrl(teamRow, 40)}
                                alt={teamRow.name || 'Team'}
                                width={40}
                                height={40}
                                unoptimized
                                className="w-10 h-10 rounded-full object-cover"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-gray-900">{teamRow.name || 'Unnamed Team'}</div>
                                <div className="text-sm text-gray-500">
                                    {teamRow.currentSize} members &bull; {divisionLabel}{divisionSuffix}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400">
                                Team
                            </div>
                        </div>
                        {flow.registrationError ? (
                            <Alert color="red" variant="light" py="xs">
                                <Text size="xs">{flow.registrationError}</Text>
                            </Alert>
                        ) : null}
                        {flow.currentUserActiveMember && !flow.shouldOfferDocumentReview ? (
                            <Text size="xs" c="green" fw={600}>
                                Already on this team
                            </Text>
                        ) : null}
                        {flow.actionVisible ? (
                            <Button
                                size="xs"
                                fullWidth
                                loading={flow.actionLoading}
                                disabled={flow.actionDisabled}
                                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                                    event.stopPropagation();
                                    flow.openFlow();
                                }}
                            >
                                {flow.actionLabel}
                            </Button>
                        ) : null}
                    </div>
                )}
            </TeamRegistrationFlow>
        );
    };

    return (
        <>
            {content}

            <EventQrCodeModal
                eventId={currentEvent.$id}
                eventName={currentEvent.name || 'Event'}
                eventUrl={currentEventPublicUrl}
                organizationLogoId={currentOrganizationLogoId}
                opened={showQrCodeModal}
                onClose={() => setShowQrCodeModal(false)}
            />

            {/* Players Dropdown */}
            {showParticipantsSection && !isTeamSignup && (
                <ParticipantsDropdown
                    isOpen={showPlayersDropdown}
                    onClose={() => setShowPlayersDropdown(false)}
                    title="Event Players"
                    participants={players}
                    isLoading={isLoadingEvent}
                    renderParticipant={(player) => (
                        <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                            {(() => {
                                const participant = player as UserData;
                                const participantName = getUserFullName(participant);
                                const participantHandle = getUserHandle(participant);
                                return (
                                    <>
                                        <Image
                                            src={getUserAvatarUrl(participant, 40)}
                                            alt={participantName}
                                            width={40}
                                            height={40}
                                            unoptimized
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                        <div>
                                            <div className="font-medium text-gray-900">{participantName}</div>
                                            {participantHandle && (
                                                <div className="text-sm text-gray-500">{participantHandle}</div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    emptyMessage="No players have joined this event yet."
                />
            )}

            {/* Teams Dropdown */}
            {showParticipantsSection && isTeamSignup && (
                <ParticipantsDropdown
                    isOpen={showTeamsDropdown}
                    onClose={() => setShowTeamsDropdown(false)}
                    title="Event Teams"
                    participants={teams}
                    isLoading={isLoadingEvent}
                    renderParticipant={renderEventTeamParticipant}
                    emptyMessage="No teams have registered for this event yet."
                />
            )}

            {/* Free Agents Dropdown */}
            {showParticipantsSection && isTeamSignup && (
                <ParticipantsDropdown
                    isOpen={showFreeAgentsDropdown}
                    onClose={() => setShowFreeAgentsDropdown(false)}
                    title="Free Agents"
                    participants={freeAgents}
                    isLoading={isLoadingEvent}
                    renderParticipant={(agent) => (
                        <div className="p-1">
                            <UserCard
                                user={agent as UserData}
                                onClick={() => openFreeAgentActions(agent as UserData)}
                            />
                        </div>
                    )}
                    emptyMessage="No free agents have listed for this event yet."
                />
            )}

            <Modal
                opened={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                centered
                title={authModalMode === 'login' ? 'Sign in to register' : 'Create account'}
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <form onSubmit={handleAuthModalSubmit}>
                    <Stack gap="sm">
                        <Text size="sm" c="dimmed">
                            {authModalMode === 'login'
                                ? 'Sign in to continue with registration.'
                                : 'Create an account to continue with registration.'}
                        </Text>
                        {authModalMode === 'signup' && (
                            <>
                                <TextInput
                                    label="First name"
                                    value={authModalForm.firstName}
                                    onChange={(changeEvent) => handleAuthModalInputChange('firstName', changeEvent.currentTarget.value)}
                                    required
                                />
                                <TextInput
                                    label="Last name"
                                    value={authModalForm.lastName}
                                    onChange={(changeEvent) => handleAuthModalInputChange('lastName', changeEvent.currentTarget.value)}
                                    required
                                />
                                <TextInput
                                    label="Username"
                                    value={authModalForm.userName}
                                    onChange={(changeEvent) => handleAuthModalInputChange('userName', changeEvent.currentTarget.value)}
                                    required
                                />
                                <TextInput
                                    label="Date of birth"
                                    type="date"
                                    value={authModalForm.dateOfBirth}
                                    onChange={(changeEvent) => handleAuthModalInputChange('dateOfBirth', changeEvent.currentTarget.value)}
                                    max={maxAuthDob}
                                    required
                                />
                            </>
                        )}
                        <TextInput
                            label="Email address"
                            type="email"
                            value={authModalForm.email}
                            onChange={(changeEvent) => handleAuthModalInputChange('email', changeEvent.currentTarget.value)}
                            required
                        />
                        <PasswordInput
                            label="Password"
                            value={authModalForm.password}
                            onChange={(changeEvent) => handleAuthModalInputChange('password', changeEvent.currentTarget.value)}
                            required
                            minLength={8}
                        />
                        {authVerificationMessage && (
                            <Alert color={authVerificationMessageType === 'success' ? 'green' : 'yellow'} variant="light">
                                <Text size="sm">{authVerificationMessage}</Text>
                                {authVerificationEmail && (
                                    <Button
                                        type="button"
                                        variant="subtle"
                                        size="compact-sm"
                                        mt="xs"
                                        loading={authResendingVerification}
                                        onClick={() => { void handleAuthModalResendVerification(); }}
                                    >
                                        Resend verification email
                                    </Button>
                                )}
                            </Alert>
                        )}
                        {authModalError && (
                            <Alert color="red" variant="light">
                                {authModalError}
                            </Alert>
                        )}
                        <Button type="submit" fullWidth loading={authModalLoading}>
                            {authModalMode === 'login' ? 'Sign in' : 'Create account'}
                        </Button>
                        <Button
                            type="button"
                            variant="subtle"
                            onClick={() => {
                                setAuthModalMode((previous) => (previous === 'login' ? 'signup' : 'login'));
                                resetAuthModalFeedback();
                            }}
                        >
                            {authModalMode === 'login'
                                ? "Don't have an account? Sign up"
                                : 'Already have an account? Sign in'}
                        </Button>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <div className="h-px flex-1 bg-gray-200" />
                            <Text size="xs" c="dimmed">or</Text>
                            <div className="h-px flex-1 bg-gray-200" />
                        </Group>
                        <Button
                            type="button"
                            fullWidth
                            variant="default"
                            onClick={() => { void handleAuthModalGoogle(); }}
                            disabled={authModalLoading}
                        >
                            Continue with Google
                        </Button>
                    </Stack>
                </form>
            </Modal>

            <Modal
                opened={Boolean(selectedFreeAgentActionUser)}
                onClose={() => setSelectedFreeAgentActionUser(null)}
                centered
                title={selectedFreeAgentActionUser ? getUserFullName(selectedFreeAgentActionUser) : 'Free Agent Actions'}
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    {selectedFreeAgentActionUser && getUserHandle(selectedFreeAgentActionUser) && (
                        <Text size="sm" c="dimmed">
                            {getUserHandle(selectedFreeAgentActionUser)}
                        </Text>
                    )}
                    <Button
                        onClick={handleInviteFreeAgentToTeam}
                        disabled={!selectedFreeAgentActionUser || !currentEvent?.$id}
                    >
                        Invite to Team
                    </Button>
                    <Button
                        variant="default"
                        onClick={() => setSelectedFreeAgentActionUser(null)}
                    >
                        Close
                    </Button>
                </Stack>
            </Modal>

            <Modal
                opened={showJoinChoiceModal}
                onClose={() => setShowJoinChoiceModal(false)}
                centered
                title="Join for yourself or child?"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        You have linked child profiles. Do you want to join this event yourself, or register a child instead?
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => {
                                void handleJoinEvent('child');
                            }}
                        >
                            Register Child
                        </Button>
                        <Button
                            onClick={() => {
                                void handleJoinEvent('self');
                            }}
                        >
                            Join Myself
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={showRegistrationQuestionsModal}
                onClose={() => {
                    setShowRegistrationQuestionsModal(false);
                    setRegistrationQuestionsIntent(null);
                }}
                centered
                size="lg"
                title="Registration questions"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submitRegistrationQuestionsStep();
                    }}
                >
                    <Stack gap="sm">
                        {registrationQuestions.length > 0 ? (
                            <Stack gap="md">
                                {registrationQuestions.map((question) => (
                                    <Textarea
                                        key={question.id}
                                        label={question.prompt}
                                        required={Boolean(question.required)}
                                        autosize
                                        minRows={question.answerType === 'LONG_TEXT' ? 4 : 2}
                                        value={registrationQuestionAnswers[question.id] ?? ''}
                                        onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            const nextAnswers = {
                                                ...registrationQuestionAnswers,
                                                [question.id]: value,
                                            };
                                            setRegistrationQuestionAnswers(nextAnswers);
                                            saveEventRegistrationProgress({
                                                step: 'questions',
                                                answers: nextAnswers,
                                            });
                                        }}
                                    />
                                ))}
                            </Stack>
                        ) : (
                            <Text size="sm" c="dimmed">
                                Continue to finish registration.
                            </Text>
                        )}
                        {joinError ? (
                            <Alert color="red" variant="light">
                                {joinError}
                            </Alert>
                        ) : null}
                        <Group justify="flex-end" wrap="wrap">
                            <Button
                                variant="default"
                                onClick={() => {
                                    setShowRegistrationQuestionsModal(false);
                                    setRegistrationQuestionsIntent(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={joining || registeringChild}>
                                Continue
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            <Modal
                opened={Boolean(paymentPlanPreview)}
                onClose={() => setPaymentPlanPreview(null)}
                centered
                title="Payment plan preview"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        Continuing will join this event and start a payment plan for {paymentPlanPreview?.ownerLabel ?? 'you'}.
                    </Text>
                    {selectedDivisionOption?.name && (
                        <Text size="xs" c="dimmed">
                            Division: {selectedDivisionOption.name}
                        </Text>
                    )}
                    <Paper withBorder p="sm" radius="md">
                        <Group justify="space-between" align="center">
                            <Text fw={600}>Plan total</Text>
                            <Text fw={700}>{formatPaymentPlanPreviewPrice(selectedDivisionBilling.priceCents)}</Text>
                        </Group>
                    </Paper>
                    {paymentPlanPreviewRows.length > 0 ? (
                        <Paper withBorder p="sm" radius="md" className="space-y-2">
                            {paymentPlanPreviewRows.map((row) => (
                                <Group key={row.id} justify="space-between" align="flex-start" gap="xs">
                                    <div>
                                        <Text size="sm" fw={500}>
                                            Installment {row.installmentNumber}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Due {row.dueDateLabel}
                                        </Text>
                                    </div>
                                    <Text size="sm" fw={600}>
                                        {formatPaymentPlanPreviewPrice(row.amountCents)}
                                    </Text>
                                </Group>
                            ))}
                        </Paper>
                    ) : (
                        <Alert color="yellow" variant="light">
                            No installment schedule was configured. The plan will be created with event-level defaults.
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setPaymentPlanPreview(null)}>
                            Cancel
                        </Button>
                        <Button onClick={continuePaymentPlanPreview}>
                            Continue with Payment Plan
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={showPasswordModal}
                onClose={cancelPasswordConfirmation}
                centered
                title="Confirm your password"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void confirmPasswordAndStartSigning();
                    }}
                >
                    <Stack gap="sm">
                        <Text size="sm" c="dimmed">
                            Please confirm your password before signing required documents.
                        </Text>
                        <PasswordInput
                            label="Password"
                            value={password}
                            onChange={(event) => setPassword(event.currentTarget.value)}
                            error={passwordError ?? undefined}
                            required
                        />
                        <Group justify="flex-end">
                            <Button variant="default" onClick={cancelPasswordConfirmation}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={confirmingPassword}
                                disabled={!password.trim()}
                            >
                                Continue
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            <Modal
                opened={showSignModal}
                onClose={cancelSigning}
                centered
                size="xl"
                title="Sign required documents"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                {signLinks.length > 0 ? (
                    <div>
                        <Text size="sm" c="dimmed" mb="xs">
                            Document {currentSignIndex + 1} of {signLinks.length}
                            {signLinks[currentSignIndex]?.title ? ` • ${signLinks[currentSignIndex]?.title}` : ''}
                        </Text>
                        {signLinks[currentSignIndex]?.requiredSignerLabel && (
                            <Text size="xs" c="dimmed" mb="xs">
                                Required signer: {signLinks[currentSignIndex]?.requiredSignerLabel}
                            </Text>
                        )}
                        {signLinks[currentSignIndex]?.type === 'TEXT' ? (
                            <Stack gap="sm">
                                <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
                                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                                        {signLinks[currentSignIndex]?.content || 'No waiver text provided.'}
                                    </Text>
                                </Paper>
                                <Checkbox
                                    label="I agree to the waiver above."
                                    checked={textAccepted}
                                    onChange={(event) => setTextAccepted(event.currentTarget.checked)}
                                />
                                <Group justify="flex-end">
                                    <Button
                                        onClick={() => void handleTextAcceptance()}
                                        loading={recordingSignature}
                                        disabled={!textAccepted || recordingSignature}
                                    >
                                        Accept and continue
                                    </Button>
                                </Group>
                            </Stack>
                        ) : (
                            <Stack gap="xs">
                                <div style={{ height: 600 }}>
                                    <iframe
                                        src={signLinks[currentSignIndex]?.url}
                                        title="BoldSign Signing"
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                    />
                                </div>
                                <Group justify="flex-end">
                                    <Button
                                        variant="default"
                                        onClick={() => void handleSignedDocument()}
                                        loading={recordingSignature}
                                        disabled={recordingSignature}
                                    >
                                        I finished signing
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </div>
                ) : (
                    <Text size="sm" c="dimmed">Preparing documents...</Text>
                )}
            </Modal>

            <Modal
                opened={showDiscountCodeModal && Boolean(pendingEventCheckout)}
                onClose={() => {
                    setShowDiscountCodeModal(false);
                    setPendingEventCheckout(null);
                }}
                centered
                title="Apply discount code"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        Registration is {formatPrice(normalizePriceCents(selectedDivisionBilling.priceCents))} before any discount.
                    </Text>
                    <TextInput
                        label="Discount code"
                        placeholder="Enter code"
                        value={discountCode}
                        onChange={(event) => setDiscountCode(event.currentTarget.value)}
                    />
                    {joinError ? (
                        <Alert color="red" variant="light">
                            {joinError}
                        </Alert>
                    ) : null}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setDiscountCode('')}>
                            Clear
                        </Button>
                        <Button
                            loading={joining}
                            onClick={async () => {
                                if (!pendingEventCheckout) {
                                    return;
                                }
                                setJoining(true);
                                setJoinError(null);
                                try {
                                    await startEventCheckout({
                                        ...pendingEventCheckout,
                                        discountCode,
                                    });
                                } catch (error) {
                                    setJoinError(error instanceof Error ? error.message : 'Unable to start checkout.');
                                } finally {
                                    setJoining(false);
                                }
                            }}
                        >
                            Continue to payment
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <BillingAddressModal
                opened={showBillingAddressModal}
                onClose={() => {
                    setShowBillingAddressModal(false);
                    setPendingEventCheckout(null);
                }}
                onSaved={async (billingAddress) => {
                    if (!pendingEventCheckout) {
                        setShowBillingAddressModal(false);
                        return;
                    }
                    await startEventCheckout({
                        ...pendingEventCheckout,
                        billingAddress,
                    });
                }}
            />

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setPaymentData(null); // Clear payment data
                }}
                event={checkoutEvent ?? currentEvent}
                paymentData={paymentData} // Pass the already-created payment intent
                onPaymentSuccess={async () => {
                    setPaymentData(null);
                    clearEventRegistrationProgress();
                    await confirmRegistrationAfterPayment();
                }}
                onPaymentPending={async () => {
                    setPaymentData(null);
                    clearEventRegistrationProgress();
                    await confirmRegistrationAfterPayment({ pendingPayment: true });
                }}
            />
            <RegistrationHoldTimer
                expiresAt={registrationHoldExpiresAt}
                onExpire={handleEventRegistrationHoldExpired}
            />
        </>
    );
}

