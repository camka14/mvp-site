import { type ReactNode, useMemo } from 'react';
import Image from 'next/image';
import {
  Event,
  LocationCoordinates,
  formatEventDivisionPriceRange,
  getEventDateTime,
  getEventImageFallbackUrl,
  getEventImageUrl,
} from '@/types';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { locationService } from '@/lib/locationService';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { buildEventDivisionDisplayLabels } from '@/lib/eventDivisionDisplay';

interface EventCardProps {
  event: Event;
  showDistance?: boolean;
  userLocation?: LocationCoordinates | null;
  onClick?: () => void;
  actions?: ReactNode;
  hostOptions?: Array<{ value: string; label: string }>;
  selectedHostId?: string;
  onHostChange?: (hostId: string) => void;
  hostChangeDisabled?: boolean;
}

export default function EventCard({
  event,
  showDistance = false,
  userLocation,
  onClick,
  actions,
  hostOptions,
  selectedHostId,
  onHostChange,
  hostChangeDisabled = false,
}: EventCardProps) {
  const { date, time } = getEventDateTime(event);
  const isAffiliateEvent = typeof event.affiliateUrl === 'string' && event.affiliateUrl.trim().length > 0;
  const affiliateUrl = isAffiliateEvent ? event.affiliateUrl!.trim() : '';
  const normalizedDateDisplayMode = typeof event.dateDisplayMode === 'string'
    ? event.dateDisplayMode.trim().toUpperCase()
    : 'SCHEDULED';
  const isEvergreenProgram = normalizedDateDisplayMode === 'NO_FIXED_DATE' || normalizedDateDisplayMode === 'ONGOING';
  const scheduleDisplayText = isEvergreenProgram
    ? (event.dateDisplayText?.trim() || event.scheduleText?.trim() || 'No fixed start date')
    : `${date} at ${time}`;
  const normalizedState = typeof event.state === 'string' ? event.state.toUpperCase() : 'PUBLISHED';
  const lifecycleBadge = useMemo(() => {
    if (normalizedState === 'PRIVATE') {
      return {
        label: 'Private',
        className: 'discover-badge-private',
      };
    }
    if (normalizedState === 'UNPUBLISHED' || normalizedState === 'DRAFT') {
      return {
        label: 'Draft',
        className: 'discover-badge-draft',
      };
    }
    return null;
  }, [normalizedState]);

  const eventTypeInfo = useMemo(() => {
    const normalizedEventType = typeof event.eventType === 'string'
      ? event.eventType.trim().toUpperCase()
      : '';

    if (isEvergreenProgram) {
      return {
        label: 'Program',
        className: 'discover-badge-event',
        icon: '📌',
      };
    }

    if (normalizedEventType === 'TOURNAMENT') {
      return {
        label: 'Tournament',
        className: 'discover-badge-tournament',
        icon: '🏆',
      };
    }

    if (normalizedEventType === 'LEAGUE') {
      return {
        label: 'League',
        className: 'discover-badge-league',
        icon: '🏟️',
      };
    }

    if (normalizedEventType === 'WEEKLY_EVENT') {
      return {
        label: 'Weekly Event',
        className: 'discover-badge-event',
        icon: '📅',
      };
    }

    return {
      label: normalizedEventType === 'AFFILIATE' ? 'Event' : formatEnumDisplayLabel(event.eventType, 'Event'),
      className: 'discover-badge-event',
      icon: '📅',
    };
  }, [event.eventType, isEvergreenProgram]);

  const getDistance = () => {
    if (!showDistance || !userLocation) return null;

    const eventLng = event.coordinates?.[0];
    const eventLat = event.coordinates?.[1];
    if (
      typeof eventLat !== 'number'
      || typeof eventLng !== 'number'
      || !Number.isFinite(eventLat)
      || !Number.isFinite(eventLng)
      || (eventLat === 0 && eventLng === 0)
    ) {
      return null;
    }

    const distanceKm = locationService.calculateDistance(
      userLocation.lat,
      userLocation.lng,
      eventLat,
      eventLng
    );

    const distanceMiles = locationService.kmToMiles(distanceKm);

    return distanceMiles < 1
      ? `${(distanceMiles * 5280).toFixed(0)} ft`
      : `${distanceMiles.toFixed(1)} mi`;
  };

  const distance = getDistance();
  const canAssignHost = Array.isArray(hostOptions) && hostOptions.length > 0 && typeof onHostChange === 'function';
  const hostSelectValue = selectedHostId ?? event.hostId ?? (hostOptions?.[0]?.value ?? '');
  const selectedHostLabel = hostOptions?.find((option) => option.value === hostSelectValue)?.label ?? null;
  const imagePlaceholderUrl = getEventImageFallbackUrl({
    event,
    width: 640,
    height: 320,
    hostLabel: selectedHostLabel,
  });
  const imageUrl = getEventImageUrl({
    imageId: event.imageId,
    width: 640,
    height: 320,
    placeholderUrl: imagePlaceholderUrl,
  });

  const fieldLabels = useMemo(() => {
    const names = new Set<string>();
    const fieldsById = new Map<string, { name?: string }>();

    if (Array.isArray(event.fields)) {
      event.fields.forEach((field) => {
        if (field?.$id) {
          fieldsById.set(field.$id, field);
        }
        if (field?.name) {
          names.add(field.name);
        }
      });
    }

    if (Array.isArray(event.timeSlots)) {
      event.timeSlots.forEach((slot) => {
        const slotFieldIds = Array.from(
          new Set(
            (Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
              ? slot.scheduledFieldIds
              : slot.scheduledFieldId
                ? [slot.scheduledFieldId]
                : []
            )
              .map((value) => String(value).trim())
              .filter((value) => value.length > 0),
          ),
        );
        slotFieldIds.forEach((fieldId) => {
          const field = fieldsById.get(fieldId);
          if (field?.name) {
            names.add(field.name);
          }
        });
      });
    }

    return Array.from(names);
  }, [event.fields, event.timeSlots]);

  const divisionLabels = useMemo(() => buildEventDivisionDisplayLabels(event), [event]);

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
  const hostedByLink = useMemo(() => {
    const organization = typeof event.organization === 'object' && event.organization ? event.organization : null;
    if (!organization) {
      return null;
    }

    const organizationWebsite = typeof organization.website === 'string' ? organization.website.trim() : '';
    if (isAffiliateEvent) {
      return organizationWebsite || affiliateUrl || null;
    }

    const publicSlug = typeof organization.publicSlug === 'string' ? organization.publicSlug.trim() : '';
    if (publicSlug) {
      return `/o/${encodeURIComponent(publicSlug)}`;
    }

    const organizationId = typeof organization.$id === 'string' ? organization.$id.trim() : '';
    return organizationId ? `/organizations/${encodeURIComponent(organizationId)}` : null;
  }, [affiliateUrl, event.organization, isAffiliateEvent]);
  const hostedByText = `Hosted by ${isAffiliateEvent && event.organizerName ? event.organizerName : hostLabel}`;

  const participantCapacity = useMemo(
    () => resolveEventParticipantCapacity(event),
    [event],
  );
  const priceDisplay = isAffiliateEvent
    ? (event.priceText?.trim() || 'Price not specified')
    : formatEventDivisionPriceRange(event);

  const attendeeCount = useMemo(() => {
    if (Number.isFinite(event.participantCount)) {
      return Math.max(0, Math.trunc(Number(event.participantCount)));
    }
    if (Number.isFinite(event.attendees)) {
      return Math.max(0, Math.trunc(event.attendees));
    }
    if (event.teamSignup) {
      return 0;
    }
    return Array.isArray(event.userIds) ? event.userIds.length : 0;
  }, [event.attendees, event.participantCount, event.teamSignup, event.userIds]);

  return (
    <div
      className={`card discover-event-card ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-all duration-200 group h-full flex flex-col border border-slate-200/80`}
      onClick={onClick}
    >
      <div className="mvp-image-background relative h-44 overflow-hidden border-b border-slate-200">
        {actions && (
          <div className="absolute right-3 top-3 z-10">
            {actions}
          </div>
        )}
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
          <span className="discover-muted-pill">
            {isAffiliateEvent ? 'External registration' : event.teamSignup ? 'Team Registration' : 'Individual Registration'}
          </span>
          {lifecycleBadge && (
            <span className={`discover-event-badge ${lifecycleBadge.className}`}>
              {lifecycleBadge.label}
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
            {scheduleDisplayText}
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
            {hostedByLink ? (
              <a
                href={hostedByLink}
                target={hostedByLink.startsWith('http') ? '_blank' : undefined}
                rel={hostedByLink.startsWith('http') ? 'noreferrer' : undefined}
                className="font-semibold text-slate-700 underline-offset-2 hover:text-slate-950 hover:underline"
                onClick={(clickEvent) => clickEvent.stopPropagation()}
              >
                {hostedByText}
              </a>
            ) : (
              hostedByText
            )}
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
            <span className="text-sm font-semibold text-slate-900">
              {priceDisplay}
            </span>
            {!isAffiliateEvent && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500">
                  {attendeeCount} / {participantCapacity} going
                </span>
              </>
            )}
          </div>
          <span className="discover-details-pill">Details</span>
        </div>
      </div>
    </div>
  );
}
