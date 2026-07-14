import type { ReactNode } from 'react';
import Image from 'next/image';
import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

import { formatAgeRange } from '@/lib/age';
import type { FamilyChild } from '@/lib/familyService';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import type { Event } from '@/types';
import { formatPrice } from '@/types';
import RefundSection from '@/components/ui/RefundSection';
import type { EventDivisionOption } from './divisionRegistration';
import type { WeeklySessionOption } from './weeklySessions';

const WEEKLY_SESSION_VISIBLE_ROWS = 10;
const WEEKLY_SESSION_CARD_HEIGHT_PX = 72;
const WEEKLY_SESSION_CARD_GAP_PX = 8;
const WEEKLY_SESSION_LIST_MAX_HEIGHT_PX = (
    WEEKLY_SESSION_VISIBLE_ROWS * WEEKLY_SESSION_CARD_HEIGHT_PX
) + ((WEEKLY_SESSION_VISIBLE_ROWS - 1) * WEEKLY_SESSION_CARD_GAP_PX);

type EventJoinCardProps = {
    renderInline: boolean;
    mobileExpanded: boolean;
    registrationTypeLabel: string;
    selectedDivisionOption: EventDivisionOption | null;
    priceCents: number;
    eventPriceSummary: string;
    joinError: string | null;
    joinNotice: string | null;
    event: Event;
    eventImageUrl: string;
    affiliateActionUrl: string;
    isAffiliateEvent: boolean;
    isWeeklyParentEvent: boolean;
    selectedWeeklyOccurrenceOption: WeeklySessionOption | null;
    weeklySessionOptions: WeeklySessionOption[];
    weeklySelectionRequired: boolean;
    hasAgeLimits: boolean;
    eventMinAge?: number;
    eventMaxAge?: number;
    divisionOptionCount: number;
    registrationCutoffSummary: string;
    refundSummary: string;
    isDivisionSelectionMissing: boolean;
    registrationByDivisionType: boolean;
    hasUser: boolean;
    isUserRegistered: boolean;
    totalParticipants: number;
    participantCapacity: number;
    canShowScheduleButton: boolean;
    hostManageQrActions: ReactNode;
    isTournament: boolean;
    registrationPanel: ReactNode;
    hasRefundTarget: boolean;
    activeChildren: FamilyChild[];
    selectedWeeklyOccurrence?: WeeklyOccurrenceSelection;
    eventStartDate: Date | null | undefined;
    showSecurePaymentNote: boolean;
    showPoweredByBracketIqNote: boolean;
    onToggleMobile: () => void;
    onAffiliateClick: () => void;
    onClearWeeklyOccurrence?: () => void;
    onWeeklySessionSelect: (session: WeeklySessionOption) => void;
    onAuthenticate: () => void;
    onViewBracket: () => void;
    onRefundSuccess: React.ComponentProps<typeof RefundSection>['onRefundSuccess'];
};

export function EventJoinCard({
    renderInline,
    mobileExpanded,
    registrationTypeLabel,
    selectedDivisionOption,
    priceCents,
    eventPriceSummary,
    joinError,
    joinNotice,
    event,
    eventImageUrl,
    affiliateActionUrl,
    isAffiliateEvent,
    isWeeklyParentEvent,
    selectedWeeklyOccurrenceOption,
    weeklySessionOptions,
    weeklySelectionRequired,
    hasAgeLimits,
    eventMinAge,
    eventMaxAge,
    divisionOptionCount,
    registrationCutoffSummary,
    refundSummary,
    isDivisionSelectionMissing,
    registrationByDivisionType,
    hasUser,
    isUserRegistered,
    totalParticipants,
    participantCapacity,
    canShowScheduleButton,
    hostManageQrActions,
    isTournament,
    registrationPanel,
    hasRefundTarget,
    activeChildren,
    selectedWeeklyOccurrence,
    eventStartDate,
    showSecurePaymentNote,
    showPoweredByBracketIqNote,
    onToggleMobile,
    onAffiliateClick,
    onClearWeeklyOccurrence,
    onWeeklySessionSelect,
    onAuthenticate,
    onViewBracket,
    onRefundSuccess,
}: EventJoinCardProps) {
    const shouldScrollWeeklySessions = weeklySessionOptions.length > WEEKLY_SESSION_VISIBLE_ROWS;

    return (
        <Paper
            withBorder
            p="lg"
            radius="md"
            className="rounded-t-xl border-slate-200 bg-white shadow-2xl lg:rounded-md lg:shadow-xl"
        >
            {renderInline ? (
                <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left lg:hidden"
                    onClick={onToggleMobile}
                    aria-expanded={mobileExpanded}
                >
                    <span>
                        <Text fw={800} className="text-slate-950">
                            {registrationTypeLabel}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {selectedDivisionOption?.name
                                ? `${selectedDivisionOption.name} · ${formatPrice(priceCents)}`
                                : eventPriceSummary}
                        </Text>
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        {mobileExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </span>
                </button>
            ) : null}
            <div className={`${!renderInline || mobileExpanded ? 'block' : 'hidden'} lg:block ${
                renderInline
                    ? 'mt-4 border-t border-slate-200 pt-4 lg:mt-0 lg:border-t-0 lg:pt-0'
                    : ''
            }`}>
                {joinError ? <Alert color="red" variant="light" mb="sm">{joinError}</Alert> : null}
                {joinNotice ? <Alert color="green" variant="light" mb="sm">{joinNotice}</Alert> : null}
                {isAffiliateEvent ? (
                    <Stack gap="xs">
                        <Button
                            component="a"
                            href={affiliateActionUrl || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            disabled={!affiliateActionUrl}
                            onClick={onAffiliateClick}
                        >
                            View Event
                        </Button>
                        <Text size="xs" c="dimmed" ta="center">
                            Registration or booking continues on the organizer&apos;s website.
                        </Text>
                    </Stack>
                ) : null}
                {!isAffiliateEvent && isWeeklyParentEvent ? (
                    <div className="mb-4 space-y-3">
                        <Group justify="space-between" align="center" gap="xs">
                            <div>
                                <Text size="sm" fw={600}>
                                    {selectedWeeklyOccurrenceOption
                                        ? 'Selected weekly session'
                                        : 'Select a weekly session'}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Choose the day and slot you want to register for.
                                </Text>
                            </div>
                            {selectedWeeklyOccurrenceOption && onClearWeeklyOccurrence ? (
                                <Button
                                    variant="subtle"
                                    color="red"
                                    size="compact-sm"
                                    onClick={onClearWeeklyOccurrence}
                                >
                                    Clear
                                </Button>
                            ) : null}
                        </Group>
                        {weeklySessionOptions.length === 0 ? (
                            <Alert color="yellow" variant="light">
                                No upcoming weekly sessions are available.
                            </Alert>
                        ) : (
                            <div
                                className={`space-y-2 ${shouldScrollWeeklySessions ? 'overflow-y-auto pr-1' : ''}`}
                                style={shouldScrollWeeklySessions
                                    ? { maxHeight: WEEKLY_SESSION_LIST_MAX_HEIGHT_PX }
                                    : undefined}
                            >
                                {weeklySessionOptions.map((session) => {
                                    const isSelected = selectedWeeklyOccurrenceOption?.slotId === session.slotId
                                        && selectedWeeklyOccurrenceOption?.occurrenceDate === session.occurrenceDate;
                                    return (
                                        <button
                                            key={session.id}
                                            type="button"
                                            onClick={() => onWeeklySessionSelect(session)}
                                            className={`w-full rounded-lg border p-2 text-left transition ${
                                                isSelected
                                                    ? 'border-red-400 bg-red-50 shadow-sm'
                                                    : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="mvp-image-background relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
                                                    <Image
                                                        src={eventImageUrl}
                                                        alt={event.name}
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
                ) : null}
                {!isAffiliateEvent ? (
                    !isWeeklyParentEvent || !weeklySelectionRequired ? (
                        <>
                            {hasAgeLimits ? (
                                <Alert color="yellow" variant="light" mb="sm">
                                    <Text fw={600} size="sm">Age-restricted event</Text>
                                    <Text size="sm">
                                        Eligible ages: {formatAgeRange(eventMinAge, eventMaxAge)}. We only check eligibility using the date of birth you enter in your profile. The host may verify age at check-in (for example, photo ID).
                                    </Text>
                                </Alert>
                            ) : null}
                            {divisionOptionCount > 0 && selectedDivisionOption ? (
                                <div className="mb-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <Text size="xs" c="dimmed" fw={800} tt="uppercase" className="tracking-normal">
                                                Selected division
                                            </Text>
                                            <Text size="sm" fw={800} className="text-slate-950">
                                                {selectedDivisionOption.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {selectedDivisionOption.divisionTypeName}
                                            </Text>
                                        </div>
                                        <Text size="sm" fw={800} className="text-emerald-700">
                                            {formatPrice(priceCents)}
                                        </Text>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 text-xs sm:grid-cols-2">
                                        <div>
                                            <Text size="xs" c="dimmed">Registration closes</Text>
                                            <Text size="xs" fw={700}>{registrationCutoffSummary}</Text>
                                        </div>
                                        <div>
                                            <Text size="xs" c="dimmed">Refunds</Text>
                                            <Text size="xs" fw={700}>{refundSummary}</Text>
                                        </div>
                                        {!hasAgeLimits && selectedDivisionOption.ageCutoffLabel ? (
                                            <div className="sm:col-span-2">
                                                <Text size="xs" c="dimmed">
                                                    {selectedDivisionOption.ageCutoffLabel}
                                                </Text>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                            {isDivisionSelectionMissing ? (
                                <Alert color="yellow" variant="light" mb="sm">
                                    {registrationByDivisionType
                                        ? 'Choose a division type before registration.'
                                        : 'Choose a division before registration.'}
                                </Alert>
                            ) : null}

                            {!hasUser ? (
                                <div className="text-center">
                                    <Button fullWidth color="blue" onClick={onAuthenticate}>
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
                                    <div className="mt-2 text-center">
                                        <Text size="sm" c="dimmed">
                                            {totalParticipants} / {participantCapacity} total participants
                                        </Text>
                                    </div>
                                    {canShowScheduleButton ? (
                                        <div className="mt-4 space-y-2">
                                            {hostManageQrActions}
                                            {isTournament ? (
                                                <Button fullWidth color="green" onClick={onViewBracket}>
                                                    View Tournament Bracket
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="space-y-3">{registrationPanel}</div>
                            )}
                        </>
                    ) : (
                        <Alert color="blue" variant="light">
                            Select a weekly session to see registration options.
                        </Alert>
                    )
                ) : null}
                {hasRefundTarget ? (
                    <div className="mt-5 border-t border-slate-200 pt-4">
                        <RefundSection
                            event={event}
                            userRegistered={isUserRegistered}
                            linkedChildren={activeChildren}
                            selectedOccurrence={selectedWeeklyOccurrence ?? null}
                            effectiveStart={eventStartDate}
                            onRefundSuccess={onRefundSuccess}
                        />
                    </div>
                ) : null}
                {showSecurePaymentNote || showPoweredByBracketIqNote ? (
                    <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
                        {showSecurePaymentNote ? (
                            <div className="flex items-center gap-2 text-emerald-800">
                                <ShieldCheck size={15} />
                                <Text size="xs" fw={700}>Secure payments</Text>
                            </div>
                        ) : null}
                        {showPoweredByBracketIqNote ? (
                            <Text size="xs" c="dimmed">Powered by BracketIQ</Text>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </Paper>
    );
}
