import type { LocationCoordinates, LocationInfo } from '@/lib/locationService';
import type { Field, Organization } from '@/types';

import { formatLatLngLabel } from './helpers';
import type { LocationDefaults } from './helpers';

export const getFieldCoordinatesForRental = (field?: Field | null): [number, number] | undefined => {
  const lng = Number(field?.long);
  const lat = Number(field?.lat);
  if (Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0)) {
    return [lng, lat];
  }

  const facility = field?.facility;
  if (facility && typeof facility === 'object') {
    const coordinates = facility.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const facilityLng = Number(coordinates[0]);
      const facilityLat = Number(coordinates[1]);
      if (Number.isFinite(facilityLng) && Number.isFinite(facilityLat) && !(facilityLng === 0 && facilityLat === 0)) {
        return [facilityLng, facilityLat];
      }
    }
  }

  return undefined;
};

export const getUserLocationLabel = (
  userLocation: LocationCoordinates | null,
  userLocationInfo: LocationInfo | null,
): string => {
  if (userLocationInfo) {
    const parts = [userLocationInfo.city, userLocationInfo.state]
      .filter((part): part is string => Boolean(part && part.trim().length > 0));
    if (parts.length) {
      return parts.join(', ');
    }
    if (userLocationInfo.zipCode && userLocationInfo.zipCode.trim().length > 0) {
      return userLocationInfo.zipCode;
    }
    if (userLocationInfo.country && userLocationInfo.country.trim().length > 0) {
      return userLocationInfo.country;
    }
    if (typeof userLocationInfo.lat === 'number' && typeof userLocationInfo.lng === 'number') {
      return formatLatLngLabel(userLocationInfo.lat, userLocationInfo.lng);
    }
  }

  if (userLocation) {
    return formatLatLngLabel(userLocation.lat, userLocation.lng);
  }

  return '';
};

export const getUserLocationCoordinates = (
  userLocation: LocationCoordinates | null,
): [number, number] | null => {
  if (!userLocation) {
    return null;
  }
  if (
    typeof userLocation.lat !== 'number' ||
    typeof userLocation.lng !== 'number' ||
    !Number.isFinite(userLocation.lat) ||
    !Number.isFinite(userLocation.lng)
  ) {
    return null;
  }

  return [userLocation.lng, userLocation.lat];
};

export const buildScheduleLocationDefaults = ({
  organization,
  userLocationLabel,
  userCoordinates,
}: {
  organization?: Organization | null;
  userLocationLabel: string;
  userCoordinates: [number, number] | null;
}): LocationDefaults | undefined => {
  const orgLabel = organization?.location?.trim() ?? '';
  const orgAddress = organization?.address?.trim() ?? '';
  const orgCoordinates =
    Array.isArray(organization?.coordinates) &&
      typeof organization.coordinates[0] === 'number' &&
      typeof organization.coordinates[1] === 'number'
      ? (organization.coordinates as [number, number])
      : undefined;

  if (organization && (orgLabel || orgCoordinates)) {
    return {
      location: orgLabel || userLocationLabel,
      address: orgAddress || undefined,
      coordinates: orgCoordinates ?? userCoordinates ?? undefined,
    };
  }

  if (userLocationLabel || userCoordinates) {
    return {
      location: userLocationLabel,
      address: undefined,
      coordinates: userCoordinates ?? undefined,
    };
  }

  return undefined;
};

