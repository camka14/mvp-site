import { Avatar, Text } from '@mantine/core';
import { ShieldCheck } from 'lucide-react';

import UserCard from '@/components/ui/UserCard';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime } from '@/lib/dateUtils';
import type { Organization, UserData } from '@/types';
import { getOrganizationAvatarUrl } from '@/types';

import { PublicEventMetaPill, PublicEventSection } from './PublicEventPrimitives';

type PublicEventOverviewProps = {
    description?: string | null;
    organization: Organization | null;
    hostUser: UserData | null;
    hostedByHref: string | null;
    hostedByLabel: string;
    hostedByHandle: string | null;
    isAffiliateEvent: boolean;
    registrationStatusClassName: string;
    registrationStatusLabel: string;
    isEvergreenProgram: boolean;
    sharesSingleDayWindow: boolean;
    scheduleDisplayText: string;
    startDate: Date | null;
    endDate: Date | null;
    displayTimeZone: string;
    locationSummary: string;
    address: string;
    mapEmbedSrc: string | null;
};

export function PublicEventOverview({
    description,
    organization,
    hostUser,
    hostedByHref,
    hostedByLabel,
    hostedByHandle,
    isAffiliateEvent,
    registrationStatusClassName,
    registrationStatusLabel,
    isEvergreenProgram,
    sharesSingleDayWindow,
    scheduleDisplayText,
    startDate,
    endDate,
    displayTimeZone,
    locationSummary,
    address,
    mapEmbedSrc,
}: PublicEventOverviewProps) {
    const startLabel = isEvergreenProgram ? 'Schedule' : (sharesSingleDayWindow ? 'Starts' : 'Start date');
    const startValue = isEvergreenProgram
        ? scheduleDisplayText
        : (startDate
            ? (sharesSingleDayWindow
                ? formatDisplayDateTime(startDate, { timeZone: displayTimeZone })
                : formatDisplayDate(startDate, { timeZone: displayTimeZone }))
            : '');
    const endLabel = sharesSingleDayWindow ? 'Ends' : 'End date';
    const endValue = endDate
        ? (sharesSingleDayWindow
            ? formatDisplayTime(endDate, { timeZone: displayTimeZone })
            : formatDisplayDate(endDate, { timeZone: displayTimeZone }))
        : '';

    return (
        <>
            <PublicEventSection title="About this event">
                <div className="space-y-5">
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                            {organization && hostedByHref ? (
                                <a
                                    href={hostedByHref}
                                    target={hostedByHref.startsWith('http') ? '_blank' : undefined}
                                    rel={hostedByHref.startsWith('http') ? 'noreferrer' : undefined}
                                    className="group flex max-w-md items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                    <Avatar
                                        src={getOrganizationAvatarUrl(organization, 48)}
                                        radius="md"
                                        size={48}
                                        alt={hostedByLabel}
                                    />
                                    <div className="min-w-0">
                                        <Text size="sm" c="dimmed">Hosted by</Text>
                                        <Text fw={800} className="truncate text-slate-950">{hostedByLabel}</Text>
                                        <Text size="sm" c="dimmed" className="truncate group-hover:text-slate-700">
                                            {isAffiliateEvent ? 'Open website' : 'Open organization page'}
                                        </Text>
                                    </div>
                                </a>
                            ) : hostUser ? (
                                <UserCard
                                    user={hostUser}
                                    showRole
                                    role="Host"
                                    className="max-w-md border border-slate-200 !p-3 !shadow-none"
                                />
                            ) : (
                                <div className="max-w-md rounded-md border border-slate-200 bg-white p-3">
                                    <Text size="sm" c="dimmed">Hosted by</Text>
                                    <Text fw={800} className="text-slate-950">{hostedByLabel}</Text>
                                    {hostedByHandle ? <Text size="sm" c="dimmed">{hostedByHandle}</Text> : null}
                                </div>
                            )}
                        </div>
                        <div className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 ${registrationStatusClassName}`}>
                            <ShieldCheck size={16} />
                            <Text size="sm" fw={700}>{registrationStatusLabel}</Text>
                        </div>
                    </div>
                    <Text className="text-base leading-7 text-slate-700">
                        {description?.trim() || 'No description provided yet.'}
                    </Text>
                </div>
            </PublicEventSection>

            <PublicEventSection>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-3">
                        <PublicEventMetaPill label={startLabel} value={startValue} />
                        {!isEvergreenProgram ? <PublicEventMetaPill label={endLabel} value={endValue} /> : null}
                        <PublicEventMetaPill label="Location" value={locationSummary} />
                        {address ? <PublicEventMetaPill label="Address" value={address} /> : null}
                    </div>
                    {mapEmbedSrc ? (
                        <div className="space-y-3">
                            <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-100" style={{ aspectRatio: '4 / 3' }}>
                                <iframe
                                    title="Event location preview"
                                    src={mapEmbedSrc}
                                    className="h-full w-full"
                                    loading="lazy"
                                    allowFullScreen
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            </PublicEventSection>
        </>
    );
}
