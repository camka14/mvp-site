'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Text,
  TextInput,
} from '@mantine/core';
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { Search } from 'lucide-react';

import { Event, Field, Organization, TimeSlot } from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
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
  onEventClick: (event: Event) => void;
  onOrganizationClick: (organization: Organization) => void;
};

const DEFAULT_CENTER: MapCenter = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_MAP_ZOOM = 11;
const MAP_SEARCH_RADIUS_KM = 50;
const SEARCH_AREA_THRESHOLD_KM = 2;

const SEARCH_TARGETS: Array<{ value: MapSearchTarget; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'organizations', label: 'Organizations' },
  { value: 'rentals', label: 'Rentals' },
];

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

export default function DiscoverMapModal({
  opened,
  onClose,
  location,
  requestLocation,
  kmBetween,
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
  const [events, setEvents] = useState<Event[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [rentals, setRentals] = useState<RentalMapListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState<MapSearchTarget>('events');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<MarkerSelection | null>(null);

  const loadMapData = useCallback(async (nextCenter: MapCenter) => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
      const [nearbyEvents, orgs] = await Promise.all([
        eventService.getEventsPaginated({
          userLocation: nextCenter,
          maxDistance: MAP_SEARCH_RADIUS_KM,
          dateFrom,
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
        .filter((entry) => entry.distanceKm <= MAP_SEARCH_RADIUS_KM)
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
            if (distanceKm > MAP_SEARCH_RADIUS_KM) return;
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
      setSelected(null);
    } catch (loadError) {
      console.error('Failed to load discover map data:', loadError);
      setError('Failed to load nearby map results. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [kmBetween]);

  useEffect(() => {
    if (!opened) return;
    if (location) {
      setCenter(location);
      void loadMapData(location);
      return;
    }

    let cancelled = false;
    let fallbackStarted = false;
    const loadFallback = () => {
      if (cancelled || fallbackStarted) {
        return;
      }
      fallbackStarted = true;
      void loadMapData(DEFAULT_CENTER);
    };
    setCenter(DEFAULT_CENTER);
    setSearchedCenter(null);
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
  }, [loadMapData, location, opened, requestLocation]);

  const showSearchArea = useMemo(() => {
    if (!searchedCenter) return false;
    return kmBetween(center, searchedCenter) >= SEARCH_AREA_THRESHOLD_KM;
  }, [center, kmBetween, searchedCenter]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    const results: SearchResult[] = [];

    if (searchTarget === 'events') {
      events.forEach((event) => {
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
      organizations.forEach((organization) => {
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

    rentals.forEach((rental) => {
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
  }, [events, organizations, rentals, searchTarget, searchTerm]);

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

  const selectedEvent = selected?.type === 'event'
    ? events.find((event) => event.$id === selected.id) ?? null
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
              onChange={(value) => setSearchTarget((value as MapSearchTarget) ?? 'events')}
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
            onClick={() => loadMapData(center)}
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
            onLoad={setMap}
            onUnmount={() => setMap(null)}
            onIdle={() => {
              const nextCenter = map?.getCenter();
              if (!nextCenter) return;
              setCenter({ lat: nextCenter.lat(), lng: nextCenter.lng() });
            }}
            options={{
              ...GOOGLE_MAP_OPTIONS_WITH_MAP_ID,
              clickableIcons: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          >
            {events.map((event) => {
              const coordinates = getEventCoordinates(event);
              if (!coordinates) return null;
              const markerId = event.$id;
              return (
                <MarkerF
                  key={`event-${markerId}`}
                  position={coordinates}
                  title={event.name}
                  label="E"
                  onClick={() => setSelected({ type: 'event', id: markerId })}
                />
              );
            })}
            {organizations.map((organization) => {
              const coordinates = getOrgCoordinates(organization);
              if (!coordinates) return null;
              return (
                <MarkerF
                  key={`org-${organization.$id}`}
                  position={coordinates}
                  title={organization.name}
                  label="O"
                  onClick={() => setSelected({ type: 'organization', id: organization.$id })}
                />
              );
            })}
            {rentals.map((rental) => {
              const id = `${rental.organization.$id}:${rental.field.$id}:${rental.slot.$id}`;
              return (
                <MarkerF
                  key={`rental-${id}`}
                  position={rental.coordinates}
                  title={rental.field.name || rental.organization.name}
                  label="R"
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
                  <strong>{selectedEvent.name}</strong>
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
                  <strong>{selectedOrganization.name}</strong>
                  <span>{selectedOrganization.location ?? 'Organization'}</span>
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
                  <strong>{selectedRental.field.name || selectedRental.organization.name}</strong>
                  <span>{selectedRental.organization.name}</span>
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
          <Group gap="sm">
            <Text size="xs" c="dimmed">{events.length} events</Text>
            <Text size="xs" c="dimmed">{organizations.length} orgs</Text>
            <Text size="xs" c="dimmed">{rentals.length} rentals</Text>
          </Group>
        </Paper>
      </div>
    </Modal>
  );
}
