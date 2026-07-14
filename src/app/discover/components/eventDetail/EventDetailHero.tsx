import Image from 'next/image';
import { Text } from '@mantine/core';
import { CalendarDays, MapPin, Users } from 'lucide-react';

type EventDetailHeroProps = {
    imageUrl: string;
    imageFallbackUrl: string;
    eventName: string;
    eventTypeLabel: string;
    sportLabel: string | null;
    registrationTypeLabel: string;
    showHostedByLabel: boolean;
    hostedByLabel: string;
    scheduleLabel: string;
    locationLabel: string;
    spotsLabel: string;
};

export function EventDetailHero({
    imageUrl,
    imageFallbackUrl,
    eventName,
    eventTypeLabel,
    sportLabel,
    registrationTypeLabel,
    showHostedByLabel,
    hostedByLabel,
    scheduleLabel,
    locationLabel,
    spotsLabel,
}: EventDetailHeroProps) {
    return (
        <div className="mvp-image-background relative min-h-[340px] overflow-hidden sm:min-h-[420px]">
            <Image
                src={imageUrl}
                alt={eventName}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 1200px"
                className="object-cover"
                onError={(event) => {
                    event.currentTarget.src = imageFallbackUrl;
                }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-slate-950/5" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-950 shadow-sm">
                        {eventTypeLabel}
                    </span>
                    {sportLabel ? (
                        <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                            {sportLabel}
                        </span>
                    ) : null}
                    <span className="rounded-full border border-emerald-200/50 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-50 backdrop-blur">
                        {registrationTypeLabel}
                    </span>
                </div>
                <div className="max-w-4xl">
                    <h1 className="text-3xl font-bold leading-tight tracking-normal sm:text-5xl">
                        {eventName}
                    </h1>
                    {showHostedByLabel ? (
                        <Text className="mt-3 max-w-2xl text-base leading-7 text-slate-100 sm:text-lg">
                            {hostedByLabel}
                        </Text>
                    ) : null}
                </div>
                <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-100">
                    <span className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 backdrop-blur">
                        <CalendarDays size={16} />
                        {scheduleLabel}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 backdrop-blur">
                        <MapPin size={16} />
                        {locationLabel}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 backdrop-blur">
                        <Users size={16} />
                        {spotsLabel}
                    </span>
                </div>
            </div>
        </div>
    );
}
