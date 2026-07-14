import { Paper, Text } from '@mantine/core';

import { formatAgeRange } from '@/lib/age';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import type { Event } from '@/types';
import { formatPrice } from '@/types';

import { formatNotSpecifiedValue } from './eventDetailPresentation';

type EventDetailSheetSummaryProps = {
    event: Event;
    isTeamSignup: boolean;
    priceCents: number;
    eventMinAge?: number;
    eventMaxAge?: number;
    divisionLabels: readonly string[];
    mapEmbedSrc: string | null;
    mapLat?: number;
    mapLng?: number;
    participantCapacity: number;
    registrationCutoffSummary: string;
};

export function EventDetailSheetSummary({
    event,
    isTeamSignup,
    priceCents,
    eventMinAge,
    eventMaxAge,
    divisionLabels,
    mapEmbedSrc,
    mapLat,
    mapLng,
    participantCapacity,
    registrationCutoffSummary,
}: EventDetailSheetSummaryProps) {
    const hasAgeRange = typeof eventMinAge === 'number' || typeof eventMaxAge === 'number';
    const hasValidCoordinates = typeof mapLat === 'number'
        && typeof mapLng === 'number'
        && !Number.isNaN(mapLat)
        && !Number.isNaN(mapLng);
    const sportName = event.sport && typeof event.sport === 'object'
        ? event.sport.name
        : undefined;

    return (
        <>
            <div>
                <h2 className="mb-4 text-xl font-semibold text-gray-900">Event Details</h2>
                <Paper withBorder p="md" radius="md" className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-sm text-gray-600">Type</span>
                            <p className="font-medium">{formatEnumDisplayLabel(event.eventType, 'Event')}</p>
                        </div>
                        <div>
                            <span className="text-sm text-gray-600">Registration</span>
                            <p className="font-medium">{isTeamSignup ? 'Team registration' : 'Individual registration'}</p>
                        </div>
                        <div>
                            <span className="text-sm text-gray-600">Price</span>
                            <p className="font-medium">{priceCents === 0 ? 'Free' : formatPrice(priceCents)}</p>
                        </div>
                        <div>
                            <span className="text-sm text-gray-600">Sport</span>
                            <p className="font-medium">{sportName || event.sportId || 'TBD'}</p>
                        </div>
                        {hasAgeRange ? (
                            <div>
                                <span className="text-sm text-gray-600">Age Range</span>
                                <p className="font-medium">{formatAgeRange(eventMinAge, eventMaxAge)}</p>
                            </div>
                        ) : null}
                    </div>

                    {divisionLabels.length > 0 ? (
                        <div>
                            <span className="text-sm text-gray-600">Divisions</span>
                            <div className="mt-1 flex flex-wrap gap-2">
                                {divisionLabels.map((divisionLabel) => (
                                    <span key={divisionLabel} className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                                        {divisionLabel}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </Paper>
            </div>

            <Paper withBorder p="md" radius="md">
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Description</h3>
                <p className="leading-relaxed text-gray-700">{event.description}</p>
            </Paper>

            {mapEmbedSrc ? (
                <Paper withBorder p="md" radius="md" className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <Text size="sm" c="dimmed">Location</Text>
                            <Text fw={600}>{event.location || 'Location coming soon'}</Text>
                            {hasValidCoordinates ? (
                                <Text size="xs" c="dimmed">
                                    {mapLat.toFixed(4)}, {mapLng.toFixed(4)}
                                </Text>
                            ) : null}
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-md border border-gray-200" style={{ aspectRatio: '16 / 9' }}>
                        <iframe
                            title="Event location preview"
                            src={mapEmbedSrc}
                            className="h-full w-full"
                            loading="lazy"
                            allowFullScreen
                        />
                    </div>
                </Paper>
            ) : null}

            {event.eventType === 'TOURNAMENT' ? (
                <div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">Tournament Format</h3>
                    <Paper withBorder p="md" radius="md" className="space-y-2">
                        {event.doubleElimination ? <p><span className="font-medium">Format:</span> Double Elimination</p> : null}
                        {event.prize ? <p><span className="font-medium">Prize:</span> {event.prize}</p> : null}
                        {event.winnerSetCount ? <p><span className="font-medium">Sets to Win:</span> {event.winnerSetCount}</p> : null}
                    </Paper>
                </div>
            ) : null}

            {event.eventType === 'LEAGUE' && event.includePlayoffs ? (
                <div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">Playoff Format</h3>
                    <Paper withBorder p="md" radius="md" className="space-y-2">
                        <p><span className="font-medium">Teams Included:</span> {event.playoffTeamCount ?? 'Configured'}</p>
                        {typeof event.doubleElimination === 'boolean' ? (
                            <p><span className="font-medium">Format:</span> {event.doubleElimination ? 'Double Elimination' : 'Single Elimination'}</p>
                        ) : null}
                        {typeof event.winnerSetCount === 'number' && event.winnerSetCount > 0 ? (
                            <p><span className="font-medium">Sets to Win:</span> {event.winnerSetCount}</p>
                        ) : null}
                    </Paper>
                </div>
            ) : null}

            <Paper withBorder p="md" radius="md">
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Event Stats</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-600">Max Participants:</span>
                        <span className="font-medium">{formatNotSpecifiedValue(participantCapacity)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">Team Size:</span>
                        <span className="font-medium">{event.teamSizeLimit}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">Registration Cutoff:</span>
                        <span className="font-medium">{registrationCutoffSummary}</span>
                    </div>
                </div>
            </Paper>
        </>
    );
}
