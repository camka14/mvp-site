import { useMemo } from 'react';
import Image from 'next/image';
import { Event, LocationCoordinates, formatPrice, getEventDateTime, getEventImageUrl } from '@/types';
import { locationService } from '@/lib/locationService';
import { extractDivisionTokenFromId, inferDivisionDetails } from '@/lib/divisionTypes';

interface EventCardProps {
  event: Event;
  showDistance?: boolean;
  userLocation?: LocationCoordinates | null;
  onClick?: () => void;
  hostOptions?: Array<{ value: string; label: string }>;
  selectedHostId?: string;
  onHostChange?: (hostId: string) => void;
  hostChangeDisabled?: boolean;
}

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const startCase = (value: string): string => (
  value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(' ')
);

export default function EventCard({
  event,
  showDistance = false,
  userLocation,
  onClick,
  hostOptions,
  selectedHostId,
  onHostChange,
  hostChangeDisabled = false,
}: EventCardProps) {
  const { date, time } = getEventDateTime(event);

  const eventTypeInfo = useMemo(() => {
    if (event.eventType === 'TOURNAMENT') {
      return {
        label: 'Tournament',
        className: 'discover-badge-tournament',
        icon: '🏆',
      };
    }

    if (event.eventType === 'LEAGUE') {
      return {
        label: 'League',
        className: 'discover-badge-league',
        icon: '🏟️',
      };
    }

    return {
      label: 'Event',
      className: 'discover-badge-event',
      icon: '📅',
    };
  }, [event.eventType]);

  const getDistance = () => {
    if (!showDistance || !userLocation) return null;

    const distanceKm = locationService.calculateDistance(
      userLocation.lat,
      userLocation.lng,
      event.coordinates[1],
      event.coordinates[0]
    );

    const distanceMiles = locationService.kmToMiles(distanceKm);

    return distanceMiles < 1
      ? `${(distanceMiles * 5280).toFixed(0)} ft`
      : `${distanceMiles.toFixed(1)} mi`;
  };

  const distance = getDistance();
  const imageUrl = getEventImageUrl({ imageId: event.imageId, width: 640, height: 320 });
  const canAssignHost = Array.isArray(hostOptions) && hostOptions.length > 0 && typeof onHostChange === 'function';
  const hostSelectValue = selectedHostId ?? event.hostId ?? (hostOptions?.[0]?.value ?? '');

  const fieldLabels = useMemo(() => {
    const names = new Set<string>();

    if (Array.isArray(event.fields)) {
      event.fields.forEach((field) => {
        if (field?.name) {
          names.add(field.name);
        }
      });
    }

    if (Array.isArray(event.timeSlots)) {
      event.timeSlots.forEach((slot) => {
        if (event.fields) {
          const field = event.fields.find(field => slot.scheduledFieldId === field.$id);
          if (field && typeof field === 'object' && field.name) {
            names.add(field.name);
          }
        }
      });
    }

    return Array.from(names);
  }, [event.fields, event.timeSlots]);

  const divisionLabels = useMemo(() => {
    const details = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
    const detailsById = new Map<string, (typeof details)[number]>();
    const detailsByKey = new Map<string, (typeof details)[number]>();

    details.forEach((detail) => {
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

    const seen = new Set<string>();
    const labels: string[] = [];

    (event.divisions || []).forEach((division) => {
      const rawId = normalizeDivisionKey(
        typeof division === 'string'
          ? division
          : (division?.id ?? division?.key ?? division?.name),
      );
      if (!rawId) {
        return;
      }

      const detail = detailsById.get(rawId)
        ?? detailsByKey.get(rawId)
        ?? detailsByKey.get(extractDivisionTokenFromId(rawId) ?? '');
      const labelFromDetail = detail?.name?.trim();
      const fallbackIdentifier = detail?.key
        ?? detail?.id
        ?? extractDivisionTokenFromId(rawId)
        ?? rawId;
      const inferred = inferDivisionDetails({
        identifier: fallbackIdentifier,
        sportInput: event.sport?.name ?? event.sportId ?? undefined,
        fallbackName: labelFromDetail || undefined,
      });
      const resolvedLabel = labelFromDetail || inferred.defaultName || startCase(fallbackIdentifier);
      const dedupeKey = resolvedLabel.toLowerCase();
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      labels.push(resolvedLabel);
    });

    return labels;
  }, [event.divisionDetails, event.divisions, event.sport?.name, event.sportId]);

  const hostLabel = useMemo(() => {
    if (typeof event.organization === 'object' && event.organization && 'name' in event.organization) {
      const orgName = event.organization.name?.trim();
      if (orgName) return orgName;
    }

    const selectedOption = hostOptions?.find((option) => option.value === hostSelectValue);
    if (selectedOption?.label) {
      return selectedOption.label;
    }

    return 'Community host';
  }, [event.organization, hostOptions, hostSelectValue]);

  return (
    <div
      className={`card discover-event-card ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-all duration-200 group h-full flex flex-col border border-slate-200/80`}
      onClick={onClick}
    >
      <div className="relative h-44 overflow-hidden border-b border-slate-200">
        <Image
          src={imageUrl}
          alt={event.name}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/35 via-slate-900/10 to-transparent" />
      </div>
      <div className="card-content flex-1 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`discover-event-badge ${eventTypeInfo.className}`}>
            <span aria-hidden="true">{eventTypeInfo.icon}</span>
            <span>{eventTypeInfo.label}</span>
          </span>
          {event.sport?.name && (
            <span className="discover-muted-pill">
              {event.sport.name}
            </span>
          )}
          {distance && (
            <span className="discover-muted-pill">
              {distance} away
            </span>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900 group-hover:text-slate-950 transition-colors duration-200 line-clamp-2">
            {event.name}
          </h3>
          {event.description && (
            <p className="text-slate-600 text-sm mt-2 line-clamp-2">
              {event.description}
            </p>
          )}
        </div>

        <div className="space-y-2 flex-1 text-sm text-slate-600">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10m4-10v10m-4 4h4M4 7h16a2 2 0 012 2v8a2 2 0 01-2-2V9a2 2 0 012-2z" />
            </svg>
            {date} at {time}
          </div>

          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {event.location || 'Location TBD'}
          </div>

          {fieldLabels.length > 0 && (
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2h-5l-3 3-3-3H6a2 2 0 01-2-2V6z" />
              </svg>
              {fieldLabels.join(', ')}
            </div>
          )}

          {divisionLabels.length > 0 && (
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {divisionLabels.join(', ')}
            </div>
          )}

          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Hosted by {hostLabel}
          </div>

          {canAssignHost && (
            <div className="pt-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Host
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                value={hostSelectValue}
                disabled={hostChangeDisabled}
                onClick={(clickEvent) => clickEvent.stopPropagation()}
                onChange={(changeEvent) => {
                  changeEvent.stopPropagation();
                  onHostChange?.(changeEvent.currentTarget.value);
                }}
              >
                {hostOptions?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{formatPrice(event.price)}</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">
              {event.attendees} / {event.maxParticipants} going
            </span>
          </div>
          <span className="discover-details-pill">Details</span>
        </div>
      </div>
    </div>
  );
}
