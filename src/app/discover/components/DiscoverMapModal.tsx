'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Image from 'next/image';
import {
  Alert,
  Button,
  Chip,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Slider,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  GoogleMap,
  InfoWindowF,
  MarkerF,
  OVERLAY_LAYER,
  OverlayViewF,
  useJsApiLoader,
} from '@react-google-maps/api';
import { CalendarDays, Search, X } from 'lucide-react';

import {
  Event,
  Field,
  Organization,
  TimeSlot,
  getEventImageFallbackUrl,
  getEventImageUrl,
  getOrganizationAvatarUrl,
} from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import {
  GOOGLE_MAP_OPTIONS_WITH_MAP_ID,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_SCRIPT_ID,
} from '@/lib/googleMapsLoader';
import { getNextRentalOccurrence } from '../utils/rentals';

type MapCenter = { lat: number; lng: number };
type MapSearchTarget = 'events' | 'organizations' | 'rentals';

type RentalMapListing = {
  organization: Organization;
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
  coordinates: MapCenter;
  distanceKm?: number;
};

type MarkerSelection =
  | { type: 'event'; id: string }
  | { type: 'organization'; id: string }
  | { type: 'rental'; id: string };

type SearchResult =
  | { type: 'event'; id: string; label: string; description: string; coordinates: MapCenter; event: Event }
  | { type: 'organization'; id: string; label: string; description: string; coordinates: MapCenter; organization: Organization }
  | { type: 'rental'; id: string; label: string; description: string; coordinates: MapCenter; rental: RentalMapListing };

type DiscoverMapModalProps = {
  opened: boolean;
  onClose: () => void;
  location: MapCenter | null;
  requestLocation: () => Promise<void>;
  kmBetween: (a: MapCenter, b: MapCenter) => number;
  selectedEventTypes: Event['eventType'][];
  setSelectedEventTypes: Dispatch<SetStateAction<Event['eventType'][]>>;
  eventTypeOptions: readonly Event['eventType'][];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  defaultMaxDistance: number;
  onEventClick: (event: Event) => void;
  onOrganizationClick: (organization: Organization) => void;
};

const DEFAULT_CENTER: MapCenter = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_MAP_ZOOM = 11;
const MAP_SEARCH_RADIUS_KM = 50;
const MIN_MAP_SEARCH_RADIUS_KM = 1;
const SEARCH_AREA_THRESHOLD_KM = 2;
const SEARCH_AREA_RADIUS_THRESHOLD_RATIO = 0.15;
const KM_PER_MILE = 1.60934;
const DISTANCE_SLIDER_MIN_MILES = 10;
const DISTANCE_SLIDER_MAX_MILES = 100;
const DISTANCE_SLIDER_MARKS = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 75, label: '75' },
  { value: DISTANCE_SLIDER_MAX_MILES, label: String(DISTANCE_SLIDER_MAX_MILES) },
];
const MARKER_SIZE_PX = 44;
const MARKER_IMAGE_REQUEST_SIZE_PX = 96;
const MARKER_CLICK_TARGET_SIZE_PX = 52;
const TRANSPARENT_MARKER_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="26" fill="black" fill-opacity="0.01"/></svg>',
)}`;

const normalizeFilterValue = (value: string): string => value.trim().toLowerCase();
const kmToMiles = (value: number): number => value / KM_PER_MILE;
const milesToKm = (value: number): number => value * KM_PER_MILE;
const normalizeMapRadiusKm = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MAP_SEARCH_RADIUS_KM;
  }
  return Math.max(MIN_MAP_SEARCH_RADIUS_KM, value);
};
const clampMiles = (value: number): number =>
  Math.min(DISTANCE_SLIDER_MAX_MILES, Math.max(DISTANCE_SLIDER_MIN_MILES, Math.round(value)));
const mapCenterKey = (value: MapCenter): string => `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
const mapRadiusKey = (value: number): string => normalizeMapRadiusKm(value).toFixed(2);

const SEARCH_TARGETS: Array<{ value: MapSearchTarget; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'organizations', label: 'Organizations' },
  { value: 'rentals', label: 'Rentals' },
];

const MARKER_STYLES: Record<MapSearchTarget, {
  color: string;
  shortLabel: string;
  singular: string;
  plural: string;
}> = {
  events: {
    color: '#2563eb',
    shortLabel: 'E',
    singular: 'event',
    plural: 'events',
  },
  organizations: {
    color: '#16a34a',
    shortLabel: 'O',
    singular: 'org',
    plural: 'orgs',
  },
  rentals: {
    color: '#ea580c',
    shortLabel: 'R',
    singular: 'rental',
    plural: 'rentals',
  },
};

const getOrgCoordinates = (org: Organization): MapCenter | null => {
  if (Array.isArray(org.coordinates) && org.coordinates.length >= 2) {
    const [lng, lat] = org.coordinates;
    const latNum = typeof lat === 'number' ? lat : Number(lat);
    const lngNum = typeof lng === 'number' ? lng : Number(lng);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return { lat: latNum, lng: lngNum };
    }
  }
  const latRaw = (org as any).lat ?? (org as any).latitude;
  const lngRaw = (org as any).long ?? (org as any).longitude ?? (org as any).lng;
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
};

const getFieldCoordinates = (field: Field): MapCenter | null => {
  const lat = typeof field.lat === 'number' ? field.lat : Number(field.lat);
  const lng = typeof field.long === 'number' ? field.long : Number(field.long);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
};

const getEventCoordinates = (event: Event): MapCenter | null => {
  if (!Array.isArray(event.coordinates) || event.coordinates.length < 2) {
    return null;
  }
  const [lng, lat] = event.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

const resolveEventDateRange = (startDate: Date | null, endDate: Date | null): { dateFrom: string; dateTo?: string } => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const normalizedStartDate = startDate instanceof Date && !Number.isNaN(startDate.getTime())
    ? startDate
    : null;
  const normalizedEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime())
    ? endDate
    : null;
  const effectiveDate = normalizedStartDate
    ? normalizedStartDate
    : normalizedEndDate && normalizedEndDate < startOfToday
      ? normalizedEndDate
      : startOfToday;

  const dateFrom = new Date(
    effectiveDate.getFullYear(),
    effectiveDate.getMonth(),
    effectiveDate.getDate(),
    0,
    0,
    0,
    0,
  ).toISOString();
  const dateTo = normalizedEndDate
    ? new Date(
        normalizedEndDate.getFullYear(),
        normalizedEndDate.getMonth(),
        normalizedEndDate.getDate(),
        23,
        59,
        59,
        999,
      ).toISOString()
    : undefined;

  return { dateFrom, dateTo };
};

const parsePickerDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const eventMatchesSports = (event: Event, selectedSports: string[]): boolean => {
  if (!selectedSports.length) {
    return true;
  }
  const selected = new Set(selectedSports.map(normalizeFilterValue));
  const eventSportValues = [
    event.sportId,
    event.sport?.name,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeFilterValue);

  return eventSportValues.some((value) => selected.has(value));
};

const getInitials = (value: string, fallback: string): string => {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return fallback;
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || fallback;
};

const getEventMapImageUrl = (event: Event): string => (
  getEventImageUrl({
    imageId: event.imageId,
    width: 360,
    height: 180,
    placeholderUrl: getEventImageFallbackUrl({
      event,
      width: 360,
      height: 180,
    }),
  })
);

const getEventMarkerImageUrl = (event: Event): string | undefined => {
  const imageId = event.imageId?.trim();
  if (!imageId) {
    return undefined;
  }
  return getEventImageUrl({
    imageId,
    width: MARKER_IMAGE_REQUEST_SIZE_PX,
    height: MARKER_IMAGE_REQUEST_SIZE_PX,
  });
};

const getEventSummary = (event: Event): string | null => {
  const description = event.description?.trim();
  if (!description || description.toLowerCase() === event.location.trim().toLowerCase()) {
    return null;
  }
  return description;
};

const getEventSportLabel = (event: Event): string => (
  event.sport?.name?.trim() || event.sportId?.trim() || 'Sport not specified'
);

const getEventTypeSportLabel = (event: Event): string => {
  const eventTypeLabel = formatEnumDisplayLabel(event.eventType, 'Event');
  const sportLabel = getEventSportLabel(event);
  return sportLabel === 'Sport not specified' ? eventTypeLabel : `${eventTypeLabel}: ${sportLabel}`;
};

const getOrganizationSummary = (organization: Organization): string => (
  organization.description?.trim() || organization.location || 'Organization details'
);

function MapEntityMarker({
  position,
  title,
  markerStyle,
  initials,
  imageUrl,
  zIndex,
  clickTargetIcon,
  onClick,
}: {
  position: MapCenter;
  title: string;
  markerStyle: { color: string };
  initials: string;
  imageUrl?: string;
  zIndex?: number;
  clickTargetIcon?: google.maps.Icon;
  onClick: () => void;
}) {
  return (
    <Fragment>
      <MarkerF
        position={position}
        title={title}
        icon={clickTargetIcon}
        clickable
        zIndex={(zIndex ?? 0) + 1000}
        onClick={onClick}
      />
      <OverlayViewF
        position={position}
        mapPaneName={OVERLAY_LAYER}
        zIndex={zIndex}
        getPixelPositionOffset={(width, height) => ({
          x: -(width / 2),
          y: -height,
        })}
      >
        <div
          className="discover-map-marker"
          style={{
            background: imageUrl ? '#ffffff' : markerStyle.color,
            borderColor: markerStyle.color,
          }}
          title={title}
          aria-hidden="true"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              width={MARKER_SIZE_PX}
              height={MARKER_SIZE_PX}
              unoptimized
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
      </OverlayViewF>
    </Fragment>
  );
}

export default function DiscoverMapModal({
  opened,
  onClose,
  location,
  requestLocation,
  kmBetween,
  selectedEventTypes,
  setSelectedEventTypes,
  eventTypeOptions,
  selectedSports,
  setSelectedSports,
  sports,
  sportsLoading,
  sportsError,
  maxDistance,
  setMaxDistance,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  defaultMaxDistance,
  onEventClick,
  onOrganizationClick,
}: DiscoverMapModalProps) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState<MapCenter>(location ?? DEFAULT_CENTER);
  const [searchedCenter, setSearchedCenter] = useState<MapCenter | null>(null);
  const [viewportRadiusKm, setViewportRadiusKm] = useState(MAP_SEARCH_RADIUS_KM);
  const [searchedRadiusKm, setSearchedRadiusKm] = useState(MAP_SEARCH_RADIUS_KM);
  const [events, setEvents] = useState<Event[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [rentals, setRentals] = useState<RentalMapListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState<MapSearchTarget>('events');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<MarkerSelection | null>(null);
  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const latestLoadMapDataRef = useRef<(nextCenter: MapCenter, radiusKm?: number) => Promise<void>>(async () => {});
  const lastMapLoadKeyRef = useRef<string | null>(null);
  const initialViewportSearchDoneRef = useRef(false);

  const eventDateRange = useMemo(
    () => resolveEventDateRange(selectedStartDate, selectedEndDate),
    [selectedEndDate, selectedStartDate],
  );
  const eventFilterKey = useMemo(
    () => JSON.stringify({
      eventTypes: selectedEventTypes,
      sports: selectedSports,
      dateFrom: eventDateRange.dateFrom,
      dateTo: eventDateRange.dateTo ?? null,
      maxDistance: maxDistance ?? null,
    }),
    [eventDateRange.dateFrom, eventDateRange.dateTo, maxDistance, selectedEventTypes, selectedSports],
  );

  const userLocationIcon = useMemo<google.maps.Symbol | undefined>(() => {
    if (!isLoaded || typeof google === 'undefined') {
      return undefined;
    }
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#1c7ed6',
      fillOpacity: 1,
      scale: 8,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    };
  }, [isLoaded]);

  const markerClickTargetIcon = useMemo<google.maps.Icon | undefined>(() => {
    if (!isLoaded || typeof google === 'undefined') {
      return undefined;
    }
    return {
      url: TRANSPARENT_MARKER_ICON_URL,
      scaledSize: new google.maps.Size(MARKER_CLICK_TARGET_SIZE_PX, MARKER_CLICK_TARGET_SIZE_PX),
      anchor: new google.maps.Point(MARKER_CLICK_TARGET_SIZE_PX / 2, MARKER_CLICK_TARGET_SIZE_PX),
    };
  }, [isLoaded]);

  const resolveViewportRadiusKm = useCallback((mapInstance: google.maps.Map | null, fallbackCenter: MapCenter) => {
    const bounds = mapInstance?.getBounds();
    if (!bounds) {
      return MAP_SEARCH_RADIUS_KM;
    }

    const boundsCenter = mapInstance?.getCenter();
    const nextCenter = boundsCenter
      ? { lat: boundsCenter.lat(), lng: boundsCenter.lng() }
      : fallbackCenter;
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    return normalizeMapRadiusKm(Math.max(
      kmBetween(nextCenter, { lat: northEast.lat(), lng: northEast.lng() }),
      kmBetween(nextCenter, { lat: southWest.lat(), lng: southWest.lng() }),
    ));
  }, [kmBetween]);

  const loadMapData = useCallback(async (nextCenter: MapCenter, nextRadiusKm?: number) => {
    const mapSearchRadiusKm = normalizeMapRadiusKm(nextRadiusKm);
    const effectiveEventRadiusKm = typeof maxDistance === 'number'
      ? Math.min(maxDistance, mapSearchRadiusKm)
      : mapSearchRadiusKm;
    const loadKey = `${mapCenterKey(nextCenter)}|${mapRadiusKey(mapSearchRadiusKm)}|${eventFilterKey}`;
    lastMapLoadKeyRef.current = loadKey;
    setLoading(true);
    setError(null);
    try {
      const [nearbyEvents, orgs] = await Promise.all([
        eventService.getEventsPaginated({
          userLocation: nextCenter,
          maxDistance: effectiveEventRadiusKm,
          dateFrom: eventDateRange.dateFrom,
          dateTo: eventDateRange.dateTo,
          eventTypes: selectedEventTypes.length === eventTypeOptions.length ? undefined : selectedEventTypes,
          sports: selectedSports.length > 0 ? selectedSports : undefined,
        }, 100, 0),
        organizationService.listOrganizationsWithFields(),
      ]);

      const orgsWithDistance = orgs
        .map((organization) => {
          const coordinates = getOrgCoordinates(organization);
          if (!coordinates) return null;
          return {
            organization,
            distanceKm: kmBetween(nextCenter, coordinates),
          };
        })
        .filter((entry): entry is { organization: Organization; distanceKm: number } => Boolean(entry))
        .filter((entry) => entry.distanceKm <= mapSearchRadiusKm)
        .sort((left, right) => left.distanceKm - right.distanceKm);

      const referenceDate = new Date();
      const rentalRows: RentalMapListing[] = [];
      orgsWithDistance.forEach(({ organization }) => {
        const orgCoordinates = getOrgCoordinates(organization);
        (organization.fields ?? []).forEach((field) => {
          const fieldCoordinates = getFieldCoordinates(field) ?? orgCoordinates;
          if (!fieldCoordinates) return;
          (field.rentalSlots ?? []).forEach((slot) => {
            const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
            if (!nextOccurrence) return;
            const distanceKm = kmBetween(nextCenter, fieldCoordinates);
            if (distanceKm > mapSearchRadiusKm) return;
            rentalRows.push({
              organization,
              field,
              slot,
              nextOccurrence,
              coordinates: fieldCoordinates,
              distanceKm,
            });
          });
        });
      });

      setEvents(nearbyEvents.filter((event) => Boolean(getEventCoordinates(event))));
      setOrganizations(orgsWithDistance.map((entry) => entry.organization));
      setRentals(rentalRows.sort((left, right) => (left.distanceKm ?? 0) - (right.distanceKm ?? 0)));
      setSearchedCenter(nextCenter);
      setSearchedRadiusKm(mapSearchRadiusKm);
      setSelected(null);
    } catch (loadError) {
      console.error('Failed to load discover map data:', loadError);
      setError('Failed to load nearby map results. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    eventDateRange.dateFrom,
    eventDateRange.dateTo,
    eventFilterKey,
    eventTypeOptions.length,
    kmBetween,
    maxDistance,
    selectedEventTypes,
    selectedSports,
  ]);

  useEffect(() => {
    latestLoadMapDataRef.current = loadMapData;
  }, [loadMapData]);

  useEffect(() => {
    if (!opened) return;
    initialViewportSearchDoneRef.current = false;
    if (location) {
      setCenter(location);
      void latestLoadMapDataRef.current(location, MAP_SEARCH_RADIUS_KM);
      return;
    }

    let cancelled = false;
    let fallbackStarted = false;
    const loadFallback = () => {
      if (cancelled || fallbackStarted) {
        return;
      }
      fallbackStarted = true;
      void latestLoadMapDataRef.current(DEFAULT_CENTER, MAP_SEARCH_RADIUS_KM);
    };
    setCenter(DEFAULT_CENTER);
    setSearchedCenter(null);
    setViewportRadiusKm(MAP_SEARCH_RADIUS_KM);
    setSearchedRadiusKm(MAP_SEARCH_RADIUS_KM);
    setSelected(null);
    setEvents([]);
    setOrganizations([]);
    setRentals([]);
    setError(null);
    setLoading(true);

    void requestLocation().catch(loadFallback);

    const fallbackTimer = window.setTimeout(() => {
      loadFallback();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [location, opened, requestLocation]);

  useEffect(() => {
    if (!opened || !searchedCenter || initialViewportSearchDoneRef.current) {
      return;
    }
    if (mapRadiusKey(viewportRadiusKm) === mapRadiusKey(searchedRadiusKm)) {
      initialViewportSearchDoneRef.current = true;
      return;
    }
    if (kmBetween(center, searchedCenter) >= SEARCH_AREA_THRESHOLD_KM) {
      return;
    }
    initialViewportSearchDoneRef.current = true;
    void loadMapData(center, viewportRadiusKm);
  }, [
    center,
    kmBetween,
    loadMapData,
    opened,
    searchedCenter,
    searchedRadiusKm,
    viewportRadiusKm,
  ]);

  useEffect(() => {
    if (!opened || !searchedCenter) {
      return;
    }
    const loadKey = `${mapCenterKey(searchedCenter)}|${mapRadiusKey(searchedRadiusKm)}|${eventFilterKey}`;
    if (lastMapLoadKeyRef.current === loadKey) {
      return;
    }
    void loadMapData(searchedCenter, searchedRadiusKm);
  }, [eventFilterKey, loadMapData, opened, searchedCenter, searchedRadiusKm]);

  const showSearchArea = useMemo(() => {
    if (!searchedCenter) return false;
    const movedFarEnough = kmBetween(center, searchedCenter) >= SEARCH_AREA_THRESHOLD_KM;
    const radiusChangedEnough = Math.abs(viewportRadiusKm - searchedRadiusKm) >=
      Math.max(MIN_MAP_SEARCH_RADIUS_KM, searchedRadiusKm * SEARCH_AREA_RADIUS_THRESHOLD_RATIO);
    return movedFarEnough || radiusChangedEnough;
  }, [center, kmBetween, searchedCenter, searchedRadiusKm, viewportRadiusKm]);

  const visibleEvents = useMemo(() => {
    if (searchTarget !== 'events') {
      return [];
    }
    const selectedEventTypeSet = new Set(selectedEventTypes);
    const dateFromTime = new Date(eventDateRange.dateFrom).getTime();
    const dateToTime = eventDateRange.dateTo ? new Date(eventDateRange.dateTo).getTime() : null;
    const distanceCenter = searchedCenter ?? center;

    return events.filter((event) => {
      if (!selectedEventTypeSet.has(event.eventType)) {
        return false;
      }
      if (!eventMatchesSports(event, selectedSports)) {
        return false;
      }
      const startTime = new Date(event.start).getTime();
      if (Number.isNaN(startTime) || startTime < dateFromTime) {
        return false;
      }
      if (typeof dateToTime === 'number' && startTime > dateToTime) {
        return false;
      }
      const coordinates = getEventCoordinates(event);
      if (!coordinates) {
        return false;
      }
      if (typeof maxDistance === 'number' && kmBetween(distanceCenter, coordinates) > maxDistance) {
        return false;
      }
      return true;
    });
  }, [
    center,
    eventDateRange.dateFrom,
    eventDateRange.dateTo,
    events,
    kmBetween,
    maxDistance,
    searchedCenter,
    searchTarget,
    selectedEventTypes,
    selectedSports,
  ]);
  const visibleOrganizations = useMemo(
    () => (searchTarget === 'organizations' ? organizations : []),
    [organizations, searchTarget],
  );
  const visibleRentals = useMemo(() => (searchTarget === 'rentals' ? rentals : []), [rentals, searchTarget]);

  const activeResultCount = searchTarget === 'events'
    ? visibleEvents.length
    : searchTarget === 'organizations'
      ? visibleOrganizations.length
      : visibleRentals.length;
  const activeMarkerStyle = MARKER_STYLES[searchTarget];
  const activeMarkerLabel = `${activeResultCount} ${
    activeResultCount === 1 ? activeMarkerStyle.singular : activeMarkerStyle.plural
  } shown`;

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    const results: SearchResult[] = [];

    if (searchTarget === 'events') {
      visibleEvents.forEach((event) => {
        const coordinates = getEventCoordinates(event);
        if (!coordinates) return;
        const text = `${event.name} ${event.location} ${event.description ?? ''}`.toLowerCase();
        if (text.includes(query)) {
          results.push({
            type: 'event' as const,
            id: event.$id,
            label: event.name,
            description: event.location,
            coordinates,
            event,
          });
        }
      });
      return results;
    }

    if (searchTarget === 'organizations') {
      visibleOrganizations.forEach((organization) => {
        const coordinates = getOrgCoordinates(organization);
        if (!coordinates) return;
        const text = `${organization.name} ${organization.location ?? ''} ${organization.description ?? ''}`.toLowerCase();
        if (text.includes(query)) {
          results.push({
            type: 'organization' as const,
            id: organization.$id,
            label: organization.name,
            description: organization.location ?? 'Organization',
            coordinates,
            organization,
          });
        }
      });
      return results;
    }

    visibleRentals.forEach((rental) => {
      const text = `${rental.organization.name} ${rental.field.name ?? ''} ${rental.field.location ?? ''}`.toLowerCase();
      if (text.includes(query)) {
        results.push({
          type: 'rental' as const,
          id: `${rental.organization.$id}:${rental.field.$id}:${rental.slot.$id}`,
          label: rental.field.name || rental.organization.name,
          description: rental.organization.name,
          coordinates: rental.coordinates,
          rental,
        });
      }
    });
    return results;
  }, [searchTarget, searchTerm, visibleEvents, visibleOrganizations, visibleRentals]);

  const handleSearchTargetChange = useCallback((value: string | null) => {
    setSearchTarget((value as MapSearchTarget) ?? 'events');
    setSelected(null);
  }, []);

  const focusResult = useCallback((result: SearchResult) => {
    map?.panTo(result.coordinates);
    map?.setZoom(Math.max(map.getZoom() ?? DEFAULT_MAP_ZOOM, 13));
    setCenter(result.coordinates);
    if (result.type === 'event') {
      setSelected({ type: 'event', id: result.id });
    } else if (result.type === 'organization') {
      setSelected({ type: 'organization', id: result.id });
    } else {
      setSelected({ type: 'rental', id: result.id });
    }
  }, [map]);

  const handleSearchSubmit = useCallback(() => {
    if (searchResults.length > 0) {
      focusResult(searchResults[0]);
    }
  }, [focusResult, searchResults]);

  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);
  const allEventTypesSelected = selectedEventTypes.length === eventTypeOptions.length;
  const allSportsSelected = selectedSports.length === 0;
  const activeEventFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (!allEventTypesSelected) {
    if (selectedEventTypes.length) {
      selectedEventTypes.forEach((type) => {
        activeEventFilters.push({
          key: `event-type-${type}`,
          label: formatEnumDisplayLabel(type, 'Event'),
          onRemove: () => setSelectedEventTypes((current) => current.filter((value) => value !== type)),
        });
      });
    } else {
      activeEventFilters.push({
        key: 'event-type-none',
        label: 'No event types',
        onRemove: () => setSelectedEventTypes([...eventTypeOptions]),
      });
    }
  }

  selectedSports.forEach((sport) => {
    activeEventFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  if (selectedStartDate) {
    activeEventFilters.push({
      key: 'date-from',
      label: `From ${selectedStartDate.toLocaleDateString()}`,
      onRemove: () => setSelectedStartDate(null),
    });
  }

  if (selectedEndDate) {
    activeEventFilters.push({
      key: 'date-to',
      label: `Until ${selectedEndDate.toLocaleDateString()}`,
      onRemove: () => setSelectedEndDate(null),
    });
  }

  if (typeof maxDistance === 'number') {
    activeEventFilters.push({
      key: 'distance',
      label: `Within ${Math.round(kmToMiles(maxDistance))} mi`,
      onRemove: () => setMaxDistance(null),
    });
  }

  const resetEventFilters = useCallback(() => {
    setSelectedEventTypes([...eventTypeOptions]);
    setSelectedSports([]);
    setMaxDistance(null);
    setSelectedStartDate(null);
    setSelectedEndDate(null);
  }, [
    eventTypeOptions,
    setMaxDistance,
    setSelectedEndDate,
    setSelectedEventTypes,
    setSelectedSports,
    setSelectedStartDate,
  ]);
  const activeEventFilterCount = activeEventFilters.length;

  const selectedEvent = selected?.type === 'event'
    ? visibleEvents.find((event) => event.$id === selected.id) ?? null
    : null;
  const selectedOrganization = selected?.type === 'organization'
    ? organizations.find((organization) => organization.$id === selected.id) ?? null
    : null;
  const selectedRental = selected?.type === 'rental'
    ? rentals.find((rental) => `${rental.organization.$id}:${rental.field.$id}:${rental.slot.$id}` === selected.id) ?? null
    : null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Discover map"
      size="95vw"
      radius="md"
      styles={{
        body: { padding: 0 },
        content: { overflow: 'hidden' },
      }}
    >
      <div style={{ height: 'min(78vh, 760px)', position: 'relative' }}>
        <Paper
          withBorder
          radius="md"
          p="sm"
          shadow="md"
          style={{
            position: 'absolute',
            zIndex: 4,
            left: 16,
            right: 16,
            top: 16,
          }}
        >
          <Group align="stretch" gap="xs" wrap="wrap">
            <Select
              aria-label="Map search category"
              data={SEARCH_TARGETS}
              value={searchTarget}
              onChange={handleSearchTargetChange}
              allowDeselect={false}
              style={{ width: 150 }}
            />
            <TextInput
              aria-label="Map search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder={`Search ${SEARCH_TARGETS.find((target) => target.value === searchTarget)?.label.toLowerCase() ?? 'map'}...`}
              style={{ flex: 1, minWidth: 180 }}
            />
            <Button leftSection={<Search size={16} />} onClick={handleSearchSubmit}>
              Search
            </Button>
          </Group>
          {searchTerm.trim() && (
            <ScrollArea.Autosize mah={180} mt="xs">
              {searchResults.length > 0 ? (
                searchResults.slice(0, 8).map((result) => (
                  <button
                    key={`${result.type}:${result.id}`}
                    type="button"
                    onClick={() => focusResult(result)}
                    className="discover-map-search-result"
                  >
                    <span>{result.label}</span>
                    <small>{result.description}</small>
                  </button>
                ))
              ) : (
                <Text size="sm" c="dimmed" px="xs" py={6}>
                  No nearby {SEARCH_TARGETS.find((target) => target.value === searchTarget)?.label.toLowerCase()} match this search.
                </Text>
              )}
            </ScrollArea.Autosize>
          )}
        </Paper>

        {showSearchArea && (
          <Button
            onClick={() => loadMapData(center, viewportRadiusKm)}
            loading={loading}
            style={{
              position: 'absolute',
              zIndex: 5,
              top: 98,
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          >
            Search this area
          </Button>
        )}

        {searchTarget === 'events' && (
          <Paper
            withBorder
            radius="lg"
            p={0}
            shadow="md"
            className="discover-map-filter-shell"
          >
            <div className="discover-filter-panel discover-map-filter-scroll p-4">
              <Group justify="space-between" align="center" mb="md">
                <div>
                  <Text fw={700} size="sm">
                    Filters
                  </Text>
                  <Text size="xs" c="dimmed">
                    Events only
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={resetEventFilters}
                  disabled={!activeEventFilterCount}
                >
                  Reset
                </Button>
              </Group>

              <div className="space-y-6">
                <div>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
                    Event Type
                  </Text>
                  <Group gap="xs">
                    <Chip
                      radius="xl"
                      checked={allEventTypesSelected}
                      onChange={(checked) => setSelectedEventTypes(checked ? [...eventTypeOptions] : [])}
                    >
                      All
                    </Chip>
                    {eventTypeOptions.map((type) => (
                      <Chip
                        key={type}
                        radius="xl"
                        checked={selectedEventTypes.includes(type)}
                        onChange={(checked) => {
                          setSelectedEventTypes((current) => {
                            if (checked) {
                              const next = new Set(current);
                              next.add(type);
                              return eventTypeOptions.filter((option) => next.has(option));
                            }
                            return current.filter((value) => value !== type);
                          });
                        }}
                      >
                        {formatEnumDisplayLabel(type, 'Event')}
                      </Chip>
                    ))}
                  </Group>
                </div>

                <div>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
                    Sports
                  </Text>
                  <TextInput
                    value={sportSearchTerm}
                    onChange={(event) => setSportSearchTerm(event.currentTarget.value)}
                    placeholder="Search sport..."
                    mb="sm"
                  />
                  <Group gap="xs" align="center">
                    <Chip
                      radius="xl"
                      checked={allSportsSelected}
                      disabled={sportsLoading || !sports.length}
                      onChange={(checked) => {
                        if (checked) {
                          setSelectedSports([]);
                        }
                      }}
                    >
                      All
                    </Chip>
                    {sportsLoading ? (
                      <Loader size="sm" aria-label="Loading sports" />
                    ) : visibleSports.length ? (
                      visibleSports.map((sport) => (
                        <Chip
                          key={sport}
                          radius="xl"
                          checked={selectedSports.includes(sport)}
                          onChange={(checked) => {
                            setSelectedSports((current) => {
                              if (checked) {
                                const next = new Set(current);
                                next.add(sport);
                                return Array.from(next);
                              }
                              return current.filter((value) => value !== sport);
                            });
                          }}
                        >
                          {sport}
                        </Chip>
                      ))
                    ) : (
                      <Text size="sm" c="dimmed">
                        {sportsQuery ? 'No sports match this search.' : 'No sports available.'}
                      </Text>
                    )}
                  </Group>
                  {sportsError && (
                    <Alert color="red" radius="md" mt="sm">
                      {sportsError}
                    </Alert>
                  )}
                </div>

                <div>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
                    Date Range
                  </Text>
                  <div className="grid gap-2">
                    <DatePickerInput
                      value={selectedStartDate}
                      onChange={(value) => setSelectedStartDate(parsePickerDate(value))}
                      clearable
                      leftSection={<CalendarDays size={16} />}
                      placeholder="From today (default)"
                      aria-label="Filter map events by start date"
                      valueFormat="MMM D, YYYY"
                      highlightToday
                    />
                    <DatePickerInput
                      value={selectedEndDate}
                      onChange={(value) => setSelectedEndDate(parsePickerDate(value))}
                      clearable
                      leftSection={<CalendarDays size={16} />}
                      minDate={
                        selectedStartDate
                          ? new Date(
                              selectedStartDate.getFullYear(),
                              selectedStartDate.getMonth(),
                              selectedStartDate.getDate(),
                              0,
                              0,
                              0,
                              0,
                            )
                          : undefined
                      }
                      placeholder="No max date"
                      aria-label="Filter map events by end date"
                      valueFormat="MMM D, YYYY"
                      highlightToday
                    />
                  </div>
                </div>

                <div>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
                    Distance
                  </Text>
                  <Text size="sm" fw={600} mb={6}>
                    {typeof maxDistance === 'number' ? `Within ${Math.round(kmToMiles(maxDistance))} mi` : 'Search area'}
                  </Text>
                  <Slider
                    min={DISTANCE_SLIDER_MIN_MILES}
                    max={DISTANCE_SLIDER_MAX_MILES}
                    step={1}
                    value={clampMiles(typeof maxDistance === 'number' ? kmToMiles(maxDistance) : kmToMiles(defaultMaxDistance))}
                    onChange={(value) => setMaxDistance(milesToKm(value))}
                    marks={DISTANCE_SLIDER_MARKS}
                    mb="sm"
                  />
                </div>

                {activeEventFilters.length > 0 && (
                  <Paper withBorder p="sm" radius="lg" className="discover-active-filters">
                    <Group gap="xs" align="center">
                      <Text fw={600} size="sm" c="dimmed">
                        Active
                      </Text>
                      {activeEventFilters.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          className="discover-active-filter-chip"
                          onClick={filter.onRemove}
                        >
                          <span>{filter.label}</span>
                          <X size={12} />
                        </button>
                      ))}
                    </Group>
                  </Paper>
                )}
              </div>
            </div>
          </Paper>
        )}

        {(loading || error || loadError || !googleMapsApiKey) && (
          <Paper
            withBorder
            radius="md"
            p="sm"
            shadow="sm"
            style={{ position: 'absolute', zIndex: 5, left: 16, bottom: 16, maxWidth: 360 }}
          >
            {loading && (
              <Group gap="xs">
                <Loader size="sm" />
                <Text size="sm">Loading nearby results...</Text>
              </Group>
            )}
            {error && <Alert color="red">{error}</Alert>}
            {loadError && <Alert color="red">Google Maps failed to load.</Alert>}
            {!googleMapsApiKey && <Alert color="red">Google Maps API key is not configured.</Alert>}
          </Paper>
        )}

        {isLoaded && googleMapsApiKey ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={center}
            zoom={DEFAULT_MAP_ZOOM}
            onLoad={(nextMap) => {
              setMap(nextMap);
              setViewportRadiusKm(resolveViewportRadiusKm(nextMap, center));
            }}
            onUnmount={() => setMap(null)}
            onIdle={() => {
              const nextCenter = map?.getCenter();
              if (!nextCenter) return;
              const nextMapCenter = { lat: nextCenter.lat(), lng: nextCenter.lng() };
              setCenter(nextMapCenter);
              setViewportRadiusKm(resolveViewportRadiusKm(map, nextMapCenter));
            }}
            options={{
              ...GOOGLE_MAP_OPTIONS_WITH_MAP_ID,
              clickableIcons: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          >
            {location && (
              <MarkerF
                position={location}
                title="Your location"
                icon={userLocationIcon}
                zIndex={1000}
              />
            )}
            {visibleEvents.map((event) => {
              const coordinates = getEventCoordinates(event);
              if (!coordinates) return null;
              const markerId = event.$id;
              return (
                <MapEntityMarker
                  key={`event-${markerId}`}
                  position={coordinates}
                  title={event.name}
                  markerStyle={MARKER_STYLES.events}
                  initials={getInitials(event.name, MARKER_STYLES.events.shortLabel)}
                  imageUrl={getEventMarkerImageUrl(event)}
                  zIndex={30}
                  clickTargetIcon={markerClickTargetIcon}
                  onClick={() => setSelected({ type: 'event', id: markerId })}
                />
              );
            })}
            {visibleOrganizations.map((organization) => {
              const coordinates = getOrgCoordinates(organization);
              if (!coordinates) return null;
              return (
                <MapEntityMarker
                  key={`org-${organization.$id}`}
                  position={coordinates}
                  title={organization.name}
                  markerStyle={MARKER_STYLES.organizations}
                  initials={getInitials(organization.name, MARKER_STYLES.organizations.shortLabel)}
                  imageUrl={getOrganizationAvatarUrl(organization, 64)}
                  zIndex={20}
                  clickTargetIcon={markerClickTargetIcon}
                  onClick={() => setSelected({ type: 'organization', id: organization.$id })}
                />
              );
            })}
            {visibleRentals.map((rental) => {
              const id = `${rental.organization.$id}:${rental.field.$id}:${rental.slot.$id}`;
              return (
                <MapEntityMarker
                  key={`rental-${id}`}
                  position={rental.coordinates}
                  title={rental.field.name || rental.organization.name}
                  markerStyle={MARKER_STYLES.rentals}
                  initials={getInitials(rental.organization.name, MARKER_STYLES.rentals.shortLabel)}
                  imageUrl={getOrganizationAvatarUrl(rental.organization, 64)}
                  zIndex={10}
                  clickTargetIcon={markerClickTargetIcon}
                  onClick={() => setSelected({ type: 'rental', id })}
                />
              );
            })}

            {selectedEvent && getEventCoordinates(selectedEvent) && (
              <InfoWindowF
                position={getEventCoordinates(selectedEvent)!}
                onCloseClick={() => setSelected(null)}
              >
                <div className="discover-map-info">
                  <Image
                    src={getEventMapImageUrl(selectedEvent)}
                    alt=""
                    width={360}
                    height={180}
                    unoptimized
                    className="discover-map-card-image"
                  />
                  <strong>{selectedEvent.name}</strong>
                  <span>{getEventTypeSportLabel(selectedEvent)}</span>
                  {getEventSummary(selectedEvent) && (
                    <p>{getEventSummary(selectedEvent)}</p>
                  )}
                  <span>{selectedEvent.location}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEventClick(selectedEvent);
                    }}
                  >
                    View event
                  </button>
                </div>
              </InfoWindowF>
            )}
            {selectedOrganization && getOrgCoordinates(selectedOrganization) && (
              <InfoWindowF
                position={getOrgCoordinates(selectedOrganization)!}
                onCloseClick={() => setSelected(null)}
              >
                <div className="discover-map-info">
                  <div className="discover-map-card-header">
                    <Image
                      src={getOrganizationAvatarUrl(selectedOrganization, 64)}
                      alt=""
                      width={44}
                      height={44}
                      unoptimized
                      className="discover-map-card-avatar"
                    />
                    <div>
                      <strong>{selectedOrganization.name}</strong>
                      <span>{selectedOrganization.location ?? 'Organization'}</span>
                    </div>
                  </div>
                  <p>{getOrganizationSummary(selectedOrganization)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOrganizationClick(selectedOrganization);
                    }}
                  >
                    View organization
                  </button>
                </div>
              </InfoWindowF>
            )}
            {selectedRental && (
              <InfoWindowF
                position={selectedRental.coordinates}
                onCloseClick={() => setSelected(null)}
              >
                <div className="discover-map-info">
                  <div className="discover-map-card-header">
                    <Image
                      src={getOrganizationAvatarUrl(selectedRental.organization, 64)}
                      alt=""
                      width={44}
                      height={44}
                      unoptimized
                      className="discover-map-card-avatar"
                    />
                    <div>
                      <strong>{selectedRental.field.name || selectedRental.organization.name}</strong>
                      <span>{selectedRental.organization.name}</span>
                    </div>
                  </div>
                  <p>{getOrganizationSummary(selectedRental.organization)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOrganizationClick(selectedRental.organization);
                    }}
                  >
                    View rentals
                  </button>
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>
        ) : (
          <div className="discover-map-placeholder">
            <Text size="sm" c="dimmed">
              Map unavailable
            </Text>
          </div>
        )}

        <Paper
          withBorder
          radius="md"
          p="xs"
          shadow="sm"
          style={{ position: 'absolute', zIndex: 4, right: 16, bottom: 16 }}
        >
          <Group gap="sm" align="center">
            <Group gap={4} align="center">
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: activeMarkerStyle.color,
                  display: 'inline-block',
                }}
              />
              <Text size="xs" c="dimmed">{activeMarkerLabel}</Text>
            </Group>
            <Text size="xs" c="dimmed">
              Events {events.length} · Orgs {organizations.length} · Rentals {rentals.length}
            </Text>
          </Group>
        </Paper>
      </div>
    </Modal>
  );
}
