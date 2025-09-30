import Link from 'next/link';
import { Event, LocationCoordinates, formatPrice, getCategoryFromEvent, getEventDateTime, getEventImageUrl } from '@/types';
import { locationService } from '@/lib/locationService';

interface EventCardProps {
  event: Event;
  showDistance?: boolean;
  userLocation?: LocationCoordinates | null;
  onClick?: () => void;
}

export default function EventCard({ event, showDistance = false, userLocation, onClick }: EventCardProps) {
  const { date, time } = getEventDateTime(event);
  const category = getCategoryFromEvent(event);

  const getEventTypeInfo = () => {
    if (event.eventType === 'tournament') {
      return {
        label: 'Tournament',
        bgColor: 'bg-purple-600',
        icon: '🏆'
      };
    }

    if (event.eventType === 'league') {
      return {
        label: 'League',
        bgColor: 'bg-emerald-600',
        icon: '🏟️'
      };
    }

    return {
      label: 'Pickup Game',
      bgColor: 'bg-blue-600',
      icon: '🏐'
    };
  };

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
  const eventTypeInfo = getEventTypeInfo();
  const imageUrl = getEventImageUrl({imageId: event.imageId, width: 400, height: 200});

  return (
    <div
      className={`card ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-shadow duration-200 group h-[500px] flex flex-col`}
      onClick={onClick}
    >
        <div className="relative h-48 overflow-hidden rounded-t-xl">
          <img
            src={imageUrl}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-4 left-4 space-y-2">
            <span className={`${eventTypeInfo.bgColor} text-white px-2 py-1 rounded-full text-xs font-medium flex items-center`}>
              <span className="mr-1">{eventTypeInfo.icon}</span>
              {eventTypeInfo.label}
            </span>
            <span className="bg-gray-900/80 text-white px-2 py-1 rounded-full text-xs font-medium">
              {category}
            </span>
          </div>
          <div className="absolute top-4 right-4 space-x-2">
            {distance && (
              <span className="bg-green-600 text-white px-2 py-1 rounded-full text-xs font-medium">
                {distance}
              </span>
            )}
            <span className="bg-white/90 backdrop-blur-sm text-gray-900 px-2 py-1 rounded-full text-xs font-medium">
              {formatPrice(event.price)}
            </span>
          </div>
        </div>

        <div className="card-content flex-1 flex flex-col">
          <div className="mb-2">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200 line-clamp-2">
              {event.name}
            </h3>
          </div>

          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {event.description}
          </p>

          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center text-sm text-gray-500">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10m4-10v10m-4 4h4M4 7h16a2 2 0 012 2v8a2 2 0 01-2-2V9a2 2 0 012-2z" />
              </svg>
              {date} at {time}
            </div>

            <div className="flex items-center text-sm text-gray-500">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {event.location}
            </div>

            {/* Show divisions if available */}
            {event.divisions.length > 0 && (
              <div className="flex items-center text-sm text-gray-500">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {event.divisions.join(', ')}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 mt-auto">
              <div className="flex items-center text-sm text-gray-500">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {event.attendees} / {event.maxParticipants} going
              </div>

              <div className="text-xs text-gray-400">
                <span className="text-green-500">●</span>
                <span className="ml-1">{event.fieldType}</span>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
