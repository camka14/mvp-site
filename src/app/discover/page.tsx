'use client';

import { Dispatch, RefObject, SetStateAction, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Chip,
  Container,
  Drawer,
  Group,
  Loader,
  Paper,
  RangeSlider,
  Slider,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import { SlidersHorizontal, X } from 'lucide-react';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationCard from '@/components/ui/OrganizationCard';
import TeamCard from '@/components/ui/TeamCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { useDebounce } from '@/app/hooks/useDebounce';
import { Event, EventTag, Facility, Field, Organization, OrganizationTag, Team, TimeSlot } from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { teamService } from '@/lib/teamService';
import { getNextRentalOccurrence, weekdayLabel } from './utils/rentals';
import { useSports } from '@/app/hooks/useSports';
import { createId } from '@/lib/id';
import { buildIndividualEventCreateUrl } from '@/lib/eventCreateNavigation';
import {
  buildDiscoverHref,
  discoverDateParamToDate,
  parseDiscoverPreset,
  parseDiscoverSportFilters,
  resolveDiscoverSportFilters,
  type DiscoverTabValue,
} from '@/lib/discoverFilters';
import { formatDisplayTime } from '@/lib/dateUtils';
import { normalizeExternalHttpUrl } from '@/lib/externalUrl';
import EventsTabContent from './components/EventsTabContent';
import DiscoverSearchControls from './components/DiscoverSearchControls';
import DiscoverMapModal from './components/DiscoverMapModal';
import DivisionDiscoveryFilters, { type DivisionDiscoveryFilterValue } from './components/DivisionDiscoveryFilters';
import {
  buildTeamDivisionFilterOptions,
  filterOpenRegistrationTeams,
  type TeamDivisionFilterOption,
} from './utils/teamFilters';
import {
  organizationMatchesSports,
  rentalResourceMatchesSports,
} from './rentalSportFilters';

type RentalListing = {
  kind: 'slot' | 'affiliateFacility';
  organization: Organization;
  facility?: Facility;
  field?: Field;
  slot?: TimeSlot;
  nextOccurrence: Date;
  distanceKm?: number;
};

type RentalCardEntry = {
  key: string;
  organization: Organization;
  listings: RentalListing[];
  actionLabel: string;
};

type OrganizationResult = {
  organization: Organization;
  distanceKm?: number;
  relevance: number;
};

type DiscoverTab = DiscoverTabValue;

const EVENTS_LIMIT = 18;
const DISCOVERY_PAGE_SIZE = 100;
const DEFAULT_MAX_DISTANCE = 50;
const EMPTY_DIVISION_FILTERS: DivisionDiscoveryFilterValue = {
  genders: [],
  skillDivisionTypeIds: [],
  ageDivisionTypeIds: [],
  priceMinDollars: null,
  priceMaxDollars: null,
};
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

const kmToMiles = (value: number): number => value / KM_PER_MILE;
const milesToKm = (value: number): number => value * KM_PER_MILE;
const clampMiles = (value: number): number =>
  Math.min(DISTANCE_SLIDER_MAX_MILES, Math.max(DISTANCE_SLIDER_MIN_MILES, Math.round(value)));
const stringArraysEqual = (left: string[], right: string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

export default function DiscoverPage() {
  return (
    <Suspense fallback={<Loading text="Loading discover feed..." />}>
      <DiscoverPageContent />
    </Suspense>
  );
}

function DiscoverPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const urlSelectedSports = useMemo(
    () => parseDiscoverSportFilters(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const urlPreset = useMemo(
    () => parseDiscoverPreset(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const { location, locationInfo, requestLocation, setLocationFromInfo } = useLocation();

  const [activeTab, setActiveTab] = useState<DiscoverTab>(() => urlPreset.tab);

  /**
   * Events tab state
   */
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [eventOffset, setEventOffset] = useState(0);
  const [eventTotalCount, setEventTotalCount] = useState<number | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const hasLoadedEventsRef = useRef(false);
  const latestFirstPageRequestRef = useRef(0);
  const isFirstPageRequestInFlightRef = useRef(false);
  const isLoadMoreRequestInFlightRef = useRef(false);
  const visibleEventIdsRef = useRef<Set<string>>(new Set());

  const EVENT_TYPE_OPTIONS = useMemo(() => ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT', 'TRYOUT', 'AFFILIATE'] as const, []);
  const [selectedEventTypes, setSelectedEventTypes] =
    useState<(typeof EVENT_TYPE_OPTIONS)[number][]>(() => {
      const requested = urlPreset.eventTypes.filter(
        (value): value is (typeof EVENT_TYPE_OPTIONS)[number] => EVENT_TYPE_OPTIONS.includes(
          value as (typeof EVENT_TYPE_OPTIONS)[number],
        ),
      );
      return requested.length ? requested : [...EVENT_TYPE_OPTIONS];
    });
  const [selectedSports, setSelectedSports] = useState<string[]>(() => urlSelectedSports);
  const [selectedEventTags, setSelectedEventTags] = useState<string[]>(() => (
    urlPreset.tab === 'events' ? urlPreset.tags : []
  ));
  const [eventDivisionFilters, setEventDivisionFilters] = useState<DivisionDiscoveryFilterValue>(() => ({
    ...EMPTY_DIVISION_FILTERS,
    genders: urlPreset.tab === 'events' ? urlPreset.genders : [],
    skillDivisionTypeIds: urlPreset.tab === 'events' ? urlPreset.skillDivisionTypeIds : [],
    ageDivisionTypeIds: urlPreset.tab === 'events' ? urlPreset.ageDivisionTypeIds : [],
    priceMinDollars: urlPreset.tab === 'events' ? urlPreset.priceMinDollars : null,
    priceMaxDollars: urlPreset.tab === 'events' ? urlPreset.priceMaxDollars : null,
  }));
  const [eventTags, setEventTags] = useState<EventTag[]>([]);
  const [eventTagsLoading, setEventTagsLoading] = useState(false);
  const [eventTagsError, setEventTagsError] = useState<string | null>(null);
  const [selectedOrganizationTags, setSelectedOrganizationTags] = useState<string[]>(() => (
    urlPreset.tab === 'organizations' ? urlPreset.tags : []
  ));
  const [organizationDivisionFilters, setOrganizationDivisionFilters] = useState<DivisionDiscoveryFilterValue>(() => ({
    ...EMPTY_DIVISION_FILTERS,
    genders: urlPreset.tab === 'organizations' ? urlPreset.genders : [],
    skillDivisionTypeIds: urlPreset.tab === 'organizations' ? urlPreset.skillDivisionTypeIds : [],
    ageDivisionTypeIds: urlPreset.tab === 'organizations' ? urlPreset.ageDivisionTypeIds : [],
    priceMinDollars: urlPreset.tab === 'organizations' ? urlPreset.priceMinDollars : null,
    priceMaxDollars: urlPreset.tab === 'organizations' ? urlPreset.priceMaxDollars : null,
  }));
  const [organizationTags, setOrganizationTags] = useState<OrganizationTag[]>([]);
  const [organizationTagsLoading, setOrganizationTagsLoading] = useState(false);
  const [organizationTagsError, setOrganizationTagsError] = useState<string | null>(null);
  const [maxDistance, setMaxDistance] = useState<number | null>(() => (
    urlPreset.tab === 'events' && urlPreset.distanceMiles !== null
      ? milesToKm(urlPreset.distanceMiles)
      : null
  ));
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(() => (
    urlPreset.tab === 'events' ? discoverDateParamToDate(urlPreset.startDate) : null
  ));
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(() => (
    urlPreset.tab === 'events' ? discoverDateParamToDate(urlPreset.endDate) : null
  ));
  const [searchTerm, setSearchTerm] = useState(urlPreset.query);
  const debouncedSearch = useDebounce(searchTerm, 500);

  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const sportOptions = useMemo(() => sports.map((sport) => sport.name), [sports]);
  useEffect(() => {
    const controller = new AbortController();
    setEventTagsLoading(true);
    setEventTagsError(null);
    fetch('/api/event-tags?filterOnly=true', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load event tags')))
      .then((body) => {
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        setEventTags(tags);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setEventTagsError('Unable to load event tags.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEventTagsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setOrganizationTagsLoading(true);
    setOrganizationTagsError(null);
    fetch('/api/organization-tags?filterOnly=true', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load organization tags')))
      .then((body) => {
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        setOrganizationTags(tags);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setOrganizationTagsError('Unable to load organization tags.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setOrganizationTagsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);
  const hiddenEventIdsKey = (user?.hiddenEventIds ?? []).slice().sort().join('\0');
  const hiddenEventIds = useMemo(() => {
    if (!hiddenEventIdsKey) {
      return new Set<string>();
    }
    return new Set(hiddenEventIdsKey.split('\0'));
  }, [hiddenEventIdsKey]);

  useEffect(() => {
    visibleEventIdsRef.current = new Set(events.map((event) => event.$id));
  }, [events]);

  /**
   * Rentals tab state
   */
  const [rentalOrganizations, setRentalOrganizations] = useState<Organization[]>([]);
  const [rentalsLoaded, setRentalsLoaded] = useState(false);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [rentalsLoadingMore, setRentalsLoadingMore] = useState(false);
  const [hasMoreRentals, setHasMoreRentals] = useState(true);
  const [rentalOffset, setRentalOffset] = useState(0);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number]>(() => (
    urlPreset.tab === 'rentals'
    && urlPreset.startHour !== null
    && urlPreset.endHour !== null
    && urlPreset.startHour < urlPreset.endHour
      ? [urlPreset.startHour, urlPreset.endHour]
      : [8, 22]
  ));
  const [rentalsMaxDistance, setRentalsMaxDistance] = useState<number | null>(() => (
    urlPreset.tab === 'rentals' && urlPreset.distanceMiles !== null
      ? milesToKm(urlPreset.distanceMiles)
      : null
  ));

  /**
   * Organizations tab state
   */
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsLoadingMore, setOrganizationsLoadingMore] = useState(false);
  const [hasMoreOrganizations, setHasMoreOrganizations] = useState(true);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);
  const organizationOffsetRef = useRef(0);
  const hasMoreOrganizationsRef = useRef(true);
  const organizationRequestInFlightRef = useRef(false);
  const latestOrganizationRequestRef = useRef(0);
  const [organizationsMaxDistance, setOrganizationsMaxDistance] = useState<number | null>(() => (
    urlPreset.tab === 'organizations' && urlPreset.distanceMiles !== null
      ? milesToKm(urlPreset.distanceMiles)
      : null
  ));

  /**
   * Teams tab state
   */
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsLoadingMore, setTeamsLoadingMore] = useState(false);
  const [hasMoreTeams, setHasMoreTeams] = useState(true);
  const [teamOffset, setTeamOffset] = useState(0);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamSelectedSports, setTeamSelectedSports] = useState<string[]>(() => (
    urlPreset.tab === 'teams' ? urlSelectedSports : []
  ));
  const [teamSelectedDivisionTypeValues, setTeamSelectedDivisionTypeValues] = useState<string[]>(() => (
    urlPreset.tab === 'teams' ? urlPreset.teamDivisionTypeIds : []
  ));

  /**
   * Map modal state
   */
  const [mapOpened, setMapOpened] = useState(false);

  const hasGuestSession = isGuest || (
    typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1'
  );

  /**
   * Helpers
   */
  const kmBetween = useCallback((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const c = 2 * Math.asin(
      Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
    );
    return R * c;
  }, []);

  const getOrgCoordinates = useCallback((org: Organization) => {
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
  }, []);

  const getFacilityCoordinates = useCallback((facility: Facility) => {
    if (Array.isArray(facility.coordinates) && facility.coordinates.length >= 2) {
      const [lng, lat] = facility.coordinates;
      const latNum = typeof lat === 'number' ? lat : Number(lat);
      const lngNum = typeof lng === 'number' ? lng : Number(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        return { lat: latNum, lng: lngNum };
      }
    }
    return null;
  }, []);

  /**
   * Keep the active Discover search and filters in a reloadable, shareable URL.
   */
  useEffect(() => {
    if (pathname !== '/discover') {
      return;
    }
    if (typeof window === 'undefined' || window.location.pathname !== '/discover') {
      return;
    }
    const activeDivisionFilters = activeTab === 'organizations'
      ? organizationDivisionFilters
      : eventDivisionFilters;
    const activeDistanceKm = activeTab === 'organizations'
      ? organizationsMaxDistance
      : activeTab === 'rentals'
        ? rentalsMaxDistance
        : activeTab === 'events'
          ? maxDistance
          : null;
    const locationLabel = locationInfo?.formattedAddress?.trim()
      || [locationInfo?.city, locationInfo?.state].filter(Boolean).join(', ')
      || null;
    const nextUrl = buildDiscoverHref({
      tab: activeTab,
      query: debouncedSearch,
      sports: activeTab === 'teams' ? teamSelectedSports : selectedSports,
      tags: activeTab === 'organizations' ? selectedOrganizationTags : selectedEventTags,
      eventTypes: activeTab === 'events' && selectedEventTypes.length !== EVENT_TYPE_OPTIONS.length
        ? selectedEventTypes
        : [],
      genders: activeDivisionFilters.genders,
      skillDivisionTypeIds: activeDivisionFilters.skillDivisionTypeIds,
      ageDivisionTypeIds: activeDivisionFilters.ageDivisionTypeIds,
      priceMinDollars: activeDivisionFilters.priceMinDollars,
      priceMaxDollars: activeDivisionFilters.priceMaxDollars,
      startDate: activeTab === 'events' ? selectedStartDate : null,
      endDate: activeTab === 'events' ? selectedEndDate : null,
      startHour: activeTab === 'rentals' ? timeRange[0] : null,
      endHour: activeTab === 'rentals' ? timeRange[1] : null,
      teamDivisionTypeIds: activeTab === 'teams' ? teamSelectedDivisionTypeValues : [],
      location: activeTab !== 'teams' && location ? { ...location, label: locationLabel } : null,
      distanceMiles: typeof activeDistanceKm === 'number' ? kmToMiles(activeDistanceKm) : null,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) {
      return;
    }
    // Keep discover query params in sync without triggering router navigations
    // that can race with user-initiated route changes (Profile/Organizations).
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [
    EVENT_TYPE_OPTIONS.length,
    activeTab,
    debouncedSearch,
    eventDivisionFilters,
    location,
    locationInfo,
    maxDistance,
    organizationDivisionFilters,
    organizationsMaxDistance,
    pathname,
    rentalsMaxDistance,
    selectedEndDate,
    selectedEventTags,
    selectedEventTypes,
    selectedOrganizationTags,
    selectedSports,
    selectedStartDate,
    teamSelectedDivisionTypeValues,
    teamSelectedSports,
    timeRange,
  ]);

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) => {
      const resolved = resolveDiscoverSportFilters(current, sportOptions);
      return stringArraysEqual(current, resolved) ? current : resolved;
    });
    setTeamSelectedSports((current) => {
      const resolved = current.filter((sport) => sportOptions.includes(sport));
      return stringArraysEqual(current, resolved) ? current : resolved;
    });
  }, [sportOptions, sportsLoading]);

  const teamDivisionTypeOptions = useMemo(
    () => buildTeamDivisionFilterOptions(teamSelectedSports),
    [teamSelectedSports],
  );

  useEffect(() => {
    const availableValues = new Set(teamDivisionTypeOptions.map((option) => option.value));
    setTeamSelectedDivisionTypeValues((current) =>
      current.filter((value) => availableValues.has(value))
    );
  }, [teamDivisionTypeOptions]);

  const buildEventFilters = useCallback(
    (queryOverride?: string) => {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const normalizedQuery = (queryOverride ?? debouncedSearch).trim();
      const normalizedStartDate =
        selectedStartDate instanceof Date && !Number.isNaN(selectedStartDate.getTime())
          ? selectedStartDate
          : null;
      const normalizedEndDate =
        selectedEndDate instanceof Date && !Number.isNaN(selectedEndDate.getTime())
          ? selectedEndDate
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

      return {
        eventTypes: selectedEventTypes.length === EVENT_TYPE_OPTIONS.length ? undefined : selectedEventTypes,
        sports: selectedSports.length > 0 ? selectedSports : undefined,
        tags: selectedEventTags.length > 0 ? selectedEventTags : undefined,
        divisionGenders: eventDivisionFilters.genders.length ? eventDivisionFilters.genders as Array<'M' | 'F' | 'C'> : undefined,
        skillDivisionTypeIds: eventDivisionFilters.skillDivisionTypeIds.length ? eventDivisionFilters.skillDivisionTypeIds : undefined,
        ageDivisionTypeIds: eventDivisionFilters.ageDivisionTypeIds.length ? eventDivisionFilters.ageDivisionTypeIds : undefined,
        priceMin: eventDivisionFilters.priceMinDollars === null ? undefined : Math.round(eventDivisionFilters.priceMinDollars * 100),
        priceMax: eventDivisionFilters.priceMaxDollars === null ? undefined : Math.round(eventDivisionFilters.priceMaxDollars * 100),
        userLocation: location || undefined,
        maxDistance: location && typeof maxDistance === 'number' ? maxDistance : undefined,
        dateFrom,
        dateTo,
        query: normalizedQuery || undefined,
      };
    },
    [
      selectedEventTypes,
      selectedSports,
      selectedEventTags,
      eventDivisionFilters,
      location,
      maxDistance,
      debouncedSearch,
      selectedStartDate,
      selectedEndDate,
      EVENT_TYPE_OPTIONS,
    ],
  );

  const loadFirstPage = useCallback(async (queryOverride?: string) => {
    const requestId = latestFirstPageRequestRef.current + 1;
    latestFirstPageRequestRef.current = requestId;
    isFirstPageRequestInFlightRef.current = true;
    const shouldShowInitialLoader = !hasLoadedEventsRef.current;

    if (shouldShowInitialLoader) {
      setIsLoadingInitial(true);
    }
    setIsLoadingMore(false);
    setEventsError(null);
    try {
      const filters = buildEventFilters(queryOverride);
      const page = await eventService.getEventsPage(filters, EVENTS_LIMIT, 0);
      if (requestId !== latestFirstPageRequestRef.current) {
        return;
      }

      setEvents(page.events.filter((event) => !hiddenEventIds.has(event.$id)));
      setEventOffset(page.pagination.nextOffset);
      setEventTotalCount(page.pagination.totalCount);
      setHasMoreEvents(page.pagination.hasMore);
      hasLoadedEventsRef.current = true;
    } catch (error) {
      if (requestId !== latestFirstPageRequestRef.current) {
        return;
      }
      console.error('Failed to load events:', error);
      setEventsError('Failed to load events. Please try again.');
    } finally {
      if (requestId === latestFirstPageRequestRef.current) {
        isFirstPageRequestInFlightRef.current = false;
        setIsLoadingInitial(false);
      }
    }
  }, [buildEventFilters, hiddenEventIds]);

  const loadMoreEvents = useCallback(async () => {
    if (
      isLoadingInitial ||
      isFirstPageRequestInFlightRef.current ||
      isLoadingMore ||
      isLoadMoreRequestInFlightRef.current ||
      !hasMoreEvents
    ) return;
    isLoadMoreRequestInFlightRef.current = true;
    setIsLoadingMore(true);
    setEventsError(null);
    try {
      const filters = buildEventFilters();
      const page = await eventService.getEventsPage(filters, EVENTS_LIMIT, eventOffset);
      const visiblePageEvents = page.events.filter((event) => !hiddenEventIds.has(event.$id));
      const addedVisibleEventCount = visiblePageEvents.filter((event) => !visibleEventIdsRef.current.has(event.$id)).length;
      setEvents((prev) => {
        const merged = [...prev, ...visiblePageEvents];
        const seen = new Set<string>();
        return merged.filter((event) => {
          if (seen.has(event.$id)) return false;
          seen.add(event.$id);
          return true;
        });
      });
      setEventOffset(page.pagination.nextOffset);
      setEventTotalCount(page.pagination.totalCount);
      setHasMoreEvents(page.pagination.hasMore && addedVisibleEventCount > 0);
    } catch (error) {
      console.error('Failed to load more events:', error);
      setEventsError('Failed to load more events. Please try again.');
      setHasMoreEvents(false);
    } finally {
      isLoadMoreRequestInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [buildEventFilters, eventOffset, isLoadingInitial, isLoadingMore, hasMoreEvents, hiddenEventIds]);

  useEffect(() => {
    if (hiddenEventIds.size === 0) {
      return;
    }
    setEvents((previous) => previous.filter((event) => !hiddenEventIds.has(event.$id)));
  }, [hiddenEventIds]);

  /**
   * Rentals fetching
   */
  const mergeOrganizationsById = useCallback((previous: Organization[], incoming: Organization[]) => {
    const merged = new Map<string, Organization>();
    previous.forEach((organization) => merged.set(organization.$id, organization));
    incoming.forEach((organization) => merged.set(organization.$id, organization));
    return Array.from(merged.values());
  }, []);

  const mergeTeamsById = useCallback((previous: Team[], incoming: Team[]) => {
    const merged = new Map<string, Team>();
    previous.forEach((team) => merged.set(team.$id, team));
    incoming.forEach((team) => merged.set(team.$id, team));
    return Array.from(merged.values());
  }, []);

  const loadRentals = useCallback(async (reset = false) => {
    if (rentalsLoading || rentalsLoadingMore) return;
    if (rentalsLoaded && !reset) return;
    const nextOffset = reset ? 0 : rentalOffset;
    if (!reset && !hasMoreRentals) return;
    if (reset || !rentalsLoaded) {
      setRentalsLoading(true);
    } else {
      setRentalsLoadingMore(true);
    }
    setRentalsError(null);
    try {
      const page = await organizationService.listOrganizationsWithFieldsPage(DISCOVERY_PAGE_SIZE, nextOffset, {
        includeAffiliateRentals: true,
      });
      setRentalOrganizations((previous) => reset ? page.organizations : mergeOrganizationsById(previous, page.organizations));
      setRentalOffset(page.pagination.nextOffset);
      setHasMoreRentals(page.pagination.hasMore);
      setRentalsLoaded(true);
    } catch (error) {
      console.error('Failed to load rentals:', error);
      setRentalsError('Failed to load rentals. Please try again.');
    } finally {
      setRentalsLoading(false);
      setRentalsLoadingMore(false);
    }
  }, [
    hasMoreRentals,
    mergeOrganizationsById,
    rentalOffset,
    rentalsLoaded,
    rentalsLoading,
    rentalsLoadingMore,
  ]);

  const loadMoreRentals = useCallback(() => {
    void loadRentals(false);
  }, [loadRentals]);

  /**
   * Organizations fetching
   */
  const loadOrganizations = useCallback(async (reset = false) => {
    if (!reset && organizationRequestInFlightRef.current) return;
    const nextOffset = reset ? 0 : organizationOffsetRef.current;
    if (!reset && !hasMoreOrganizationsRef.current) return;

    const requestId = latestOrganizationRequestRef.current + 1;
    latestOrganizationRequestRef.current = requestId;
    organizationRequestInFlightRef.current = true;

    if (reset) {
      setOrganizationsLoading(true);
      setOrganizationsLoadingMore(false);
    } else {
      setOrganizationsLoadingMore(true);
    }
    setOrganizationsError(null);
    try {
      const page = await organizationService.listOrganizationsWithFieldsPage(DISCOVERY_PAGE_SIZE, nextOffset, {
        hydrateRelations: false,
        tagSlugs: selectedOrganizationTags,
        sports: selectedSports,
        divisionGenders: organizationDivisionFilters.genders,
        skillDivisionTypeIds: organizationDivisionFilters.skillDivisionTypeIds,
        ageDivisionTypeIds: organizationDivisionFilters.ageDivisionTypeIds,
        divisionPriceMin: organizationDivisionFilters.priceMinDollars === null ? undefined : Math.round(organizationDivisionFilters.priceMinDollars * 100),
        divisionPriceMax: organizationDivisionFilters.priceMaxDollars === null ? undefined : Math.round(organizationDivisionFilters.priceMaxDollars * 100),
      });
      if (requestId !== latestOrganizationRequestRef.current) return;
      setOrganizations((previous) => reset ? page.organizations : mergeOrganizationsById(previous, page.organizations));
      organizationOffsetRef.current = page.pagination.nextOffset;
      hasMoreOrganizationsRef.current = page.pagination.hasMore;
      setHasMoreOrganizations(page.pagination.hasMore);
    } catch (error) {
      if (requestId !== latestOrganizationRequestRef.current) return;
      console.error('Failed to load organizations:', error);
      setOrganizationsError('Failed to load organizations. Please try again.');
    } finally {
      if (requestId === latestOrganizationRequestRef.current) {
        organizationRequestInFlightRef.current = false;
        setOrganizationsLoading(false);
        setOrganizationsLoadingMore(false);
      }
    }
  }, [
    mergeOrganizationsById,
    selectedOrganizationTags,
    selectedSports,
    organizationDivisionFilters,
  ]);

  const loadMoreOrganizations = useCallback(() => {
    void loadOrganizations(false);
  }, [loadOrganizations]);

  const loadTeams = useCallback(async (reset = false) => {
    if (teamsLoading || teamsLoadingMore) return;
    const nextOffset = reset ? 0 : teamOffset;
    if (!reset && !hasMoreTeams) return;
    if (reset || teams.length === 0) {
      setTeamsLoading(true);
    } else {
      setTeamsLoadingMore(true);
    }
    setTeamsError(null);
    try {
      const page = await teamService.searchOpenRegistrationTeamsPage(searchTerm.trim(), DISCOVERY_PAGE_SIZE, nextOffset);
      setTeams((previous) => reset ? page.teams : mergeTeamsById(previous, page.teams));
      setTeamOffset(page.pagination.nextOffset);
      setHasMoreTeams(page.pagination.hasMore);
    } catch (error) {
      console.error('Failed to load open registration teams:', error);
      setTeamsError('Failed to load teams. Please try again.');
    } finally {
      setTeamsLoading(false);
      setTeamsLoadingMore(false);
    }
  }, [
    hasMoreTeams,
    mergeTeamsById,
    searchTerm,
    teamOffset,
    teams.length,
    teamsLoading,
    teamsLoadingMore,
  ]);

  const loadMoreTeams = useCallback(() => {
    void loadTeams(false);
  }, [loadTeams]);

  const handleSearchSubmit = useCallback(() => {
    if (activeTab === 'events') {
      void loadFirstPage(searchTerm);
    }
    if (activeTab === 'organizations') {
      void loadOrganizations(true);
    }
    if (activeTab === 'rentals') {
      void loadRentals(true);
    }
    if (activeTab === 'teams') {
      void loadTeams(true);
    }
  }, [activeTab, loadFirstPage, loadOrganizations, loadRentals, loadTeams, searchTerm]);

  /**
   * Effects
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated && !hasGuestSession) {
      router.push('/login');
      return;
    }
  }, [isAuthenticated, hasGuestSession, authLoading, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated && !hasGuestSession) {
      return;
    }
    if (activeTab !== 'events') {
      return;
    }
    loadFirstPage();
  }, [isAuthenticated, hasGuestSession, authLoading, activeTab, loadFirstPage]);

  const presetLocationAppliedRef = useRef(false);
  useEffect(() => {
    if (!urlPreset.location || presetLocationAppliedRef.current) {
      return;
    }
    const labelParts = (urlPreset.location.label ?? '').split(',').map((part) => part.trim()).filter(Boolean);
    setLocationFromInfo({
      lat: urlPreset.location.lat,
      lng: urlPreset.location.lng,
      city: labelParts[0],
      state: labelParts[1],
      formattedAddress: urlPreset.location.label ?? undefined,
    });
    presetLocationAppliedRef.current = true;
  }, [setLocationFromInfo, urlPreset.location]);

  const locationRequestAttemptedRef = useRef(false);
  useEffect(() => {
    if (location || urlPreset.location) {
      return;
    }
    if (locationRequestAttemptedRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    locationRequestAttemptedRef.current = true;
    requestLocation().catch(() => {});
  }, [location, requestLocation, urlPreset.location]);

  useEffect(() => {
    if (activeTab === 'rentals') {
      loadRentals();
    }
    if (activeTab === 'teams') {
      loadTeams();
    }
  }, [activeTab, loadRentals, loadTeams]);

  useEffect(() => {
    if (activeTab !== 'organizations') {
      return;
    }
    void loadOrganizations(true);
  }, [activeTab, loadOrganizations]);

  const handleCreateEventNavigation = useCallback(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    router.push(buildIndividualEventCreateUrl(createId()));
  }, [router, user]);

  const handleSelectRentalOrganization = useCallback(
    (organization: Organization, listings: RentalListing[] = []) => {
      const affiliateFacilityListings = listings.filter((listing) => listing.kind === 'affiliateFacility');
      if (affiliateFacilityListings.length === listings.length && affiliateFacilityListings.length > 0) {
        const affiliateUrl = normalizeExternalHttpUrl(affiliateFacilityListings[0]?.facility?.affiliateUrl);
        if (affiliateUrl) {
          window.open(affiliateUrl, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      router.push(`/organizations/${organization.$id}?tab=fields`);
    },
    [router],
  );

  const handleSelectOrganization = useCallback(
    (organization: Organization) => {
      router.push(`/organizations/${organization.$id}`);
    },
    [router],
  );

  const handleSelectEvent = useCallback(
    (event: Event) => {
      router.push(`/events/${event.$id}?tab=details`);
    },
    [router],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const organizationsSentinelRef = useRef<HTMLDivElement | null>(null);
  const rentalsSentinelRef = useRef<HTMLDivElement | null>(null);
  const teamsSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMoreEvents();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreEvents]);

  useEffect(() => {
    const sentinelByTab: Partial<Record<DiscoverTab, HTMLDivElement | null>> = {
      organizations: organizationsSentinelRef.current,
      rentals: rentalsSentinelRef.current,
      teams: teamsSentinelRef.current,
    };
    const loadMoreByTab: Partial<Record<DiscoverTab, () => void>> = {
      organizations: loadMoreOrganizations,
      rentals: loadMoreRentals,
      teams: loadMoreTeams,
    };
    const el = sentinelByTab[activeTab];
    const loadMore = loadMoreByTab[activeTab];
    if (!el || !loadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, loadMoreOrganizations, loadMoreRentals, loadMoreTeams]);

  /**
   * Rentals derived data
   */
  const rentalListings = useMemo(() => {
    const referenceDate = new Date();
    const listings: RentalListing[] = [];

    rentalOrganizations.forEach((organization) => {
      const coordinates = getOrgCoordinates(organization);

      (organization.facilities || []).forEach((facility) => {
        const affiliateUrl = normalizeExternalHttpUrl(facility.affiliateUrl);
        if (!affiliateUrl) {
          return;
        }
        if (String(facility.status ?? 'ACTIVE').trim().toUpperCase() !== 'ACTIVE') {
          return;
        }
        const listing: RentalListing = {
          kind: 'affiliateFacility',
          organization,
          facility,
          nextOccurrence: referenceDate,
        };
        const facilityCoordinates = getFacilityCoordinates(facility) ?? coordinates;
        if (location && facilityCoordinates) {
          try {
            listing.distanceKm = kmBetween(location, facilityCoordinates);
          } catch {
            // ignore distance issues
          }
        }
        listings.push(listing);
      });

      (organization.fields || []).forEach((field) => {
        (field.rentalSlots || []).forEach((slot) => {
          const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
          if (!nextOccurrence) {
            return;
          }
          const listing: RentalListing = {
            kind: 'slot',
            organization,
            field,
            slot,
            nextOccurrence,
          };

          if (location && coordinates) {
            try {
              listing.distanceKm = kmBetween(location, coordinates);
            } catch {
              // ignore distance issues
            }
          }

          listings.push(listing);
        });
      });
    });

    listings.sort((a, b) => {
      if (typeof a.distanceKm === 'number' && typeof b.distanceKm === 'number') {
        return a.distanceKm - b.distanceKm;
      }
      if (typeof a.distanceKm === 'number') return -1;
      if (typeof b.distanceKm === 'number') return 1;
      if (a.kind !== b.kind) {
        return a.kind === 'slot' ? -1 : 1;
      }
      return a.nextOccurrence.getTime() - b.nextOccurrence.getTime();
    });

    return listings;
  }, [rentalOrganizations, location, kmBetween, getOrgCoordinates, getFacilityCoordinates]);

  const defaultTimeRange = useMemo<[number, number]>(() => {
    if (!rentalListings.length) {
      return [8, 22];
    }
    let earliest = 24;
    let latest = 0;
    rentalListings.forEach((listing) => {
      if (listing.kind !== 'slot' || !listing.slot) {
        return;
      }
      const startHour =
        listing.nextOccurrence.getHours() + listing.nextOccurrence.getMinutes() / 60;
      const endMinutes =
        typeof listing.slot.endTimeMinutes === 'number'
          ? listing.slot.endTimeMinutes
          : listing.slot.startTimeMinutes ?? listing.nextOccurrence.getHours() * 60;
      const endHour = Math.floor(endMinutes / 60);
      earliest = Math.min(earliest, startHour);
      latest = Math.max(latest, endHour);
    });
    if (earliest === 24 && latest === 0) {
      return [8, 22];
    }
    const floor = Math.max(0, Math.floor(earliest));
    const ceil = Math.min(24, Math.ceil(latest));
    if (floor === ceil) {
      const adjusted = Math.min(24, floor + 1);
      return [Math.max(0, adjusted - 1), adjusted];
    }
    return [floor, ceil];
  }, [rentalListings]);

  useEffect(() => {
    setTimeRange(defaultTimeRange);
  }, [defaultTimeRange]);

  /**
   * Organizations derived data
   */
  const organizationResults = useMemo<OrganizationResult[]>(() => {
    const q = (searchTerm || '').trim().toLowerCase();
    const results: OrganizationResult[] = [];

    organizations.forEach((org) => {
      if (!organizationMatchesSports(org, selectedSports)) {
        return;
      }

      const coords = getOrgCoordinates(org);
      const hasCoords = Boolean(coords);
      const text = `${org.name} ${org.description ?? ''} ${org.location ?? ''} ${org.website ?? ''}`.toLowerCase();
      const matchesQuery = q ? text.includes(q) : true;

      if (!q && !hasCoords) {
        return;
      }
      if (q && !matchesQuery) {
        return;
      }

      let distanceKm: number | undefined;
      if (coords && location) {
        try {
          distanceKm = kmBetween(location, coords);
        } catch {
          distanceKm = undefined;
        }
      }

      if (location && typeof organizationsMaxDistance === 'number') {
        if (typeof distanceKm !== 'number' || distanceKm > organizationsMaxDistance) {
          return;
        }
      }

      const relevance = q && matchesQuery ? Math.max(0, text.indexOf(q)) : Number.MAX_SAFE_INTEGER;

      results.push({ organization: org, distanceKm, relevance });
    });

    results.sort((a, b) => {
      const aDist = a.distanceKm;
      const bDist = b.distanceKm;
      if (typeof aDist === 'number' && typeof bDist === 'number') {
        return aDist - bDist;
      }
      if (typeof aDist === 'number') return -1;
      if (typeof bDist === 'number') return 1;
      if (a.relevance !== b.relevance) return a.relevance - b.relevance;
      return a.organization.name.localeCompare(b.organization.name);
    });

    return results;
  }, [
    organizations,
    searchTerm,
    selectedSports,
    location,
    organizationsMaxDistance,
    kmBetween,
    getOrgCoordinates,
  ]);

  const filteredTeams = useMemo(
    () => filterOpenRegistrationTeams(teams, {
      selectedSports: teamSelectedSports,
      selectedDivisionTypeValues: teamSelectedDivisionTypeValues,
      divisionTypeOptions: teamDivisionTypeOptions,
    }),
    [teams, teamSelectedSports, teamSelectedDivisionTypeValues, teamDivisionTypeOptions],
  );

  /**
   * Auth guard
   */
  if (authLoading) {
    return <Loading fullScreen text="Loading discover feed..." />;
  }

  if (!isAuthenticated && !hasGuestSession) {
    return <Loading fullScreen text="Redirecting to login..." />;
  }

  /**
   * Render
   */
  return (
    <>
      <Navigation />
      <Container fluid py="xl" className="discover-shell">
        <div className="discover-page-header mb-8">
          <Title order={2} mb={6} className="discover-title">
            Discover
          </Title>
          <Text c="dimmed" className="discover-subtitle">
            Explore upcoming events and available rentals {location ? 'near you' : 'in your area'}.
          </Text>
        </div>

        <Tabs
          value={activeTab}
          onChange={(value) => {
            const next = (value as DiscoverTab) ?? 'events';
            setActiveTab(next);
          }}
          variant="pills"
          radius="xl"
          classNames={{
            list: 'discover-segment-list',
            tab: 'discover-segment-tab',
          }}
        >
          <Tabs.List mb="lg" grow>
            <Tabs.Tab value="events">Events</Tabs.Tab>
            <Tabs.Tab value="organizations">Organizations</Tabs.Tab>
            <Tabs.Tab value="rentals">Rentals</Tabs.Tab>
            <Tabs.Tab value="teams">Teams</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="events">
            <EventsTabContent
              location={location}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSearchSubmit={handleSearchSubmit}
              onOpenMap={() => setMapOpened(true)}
              selectedEventTypes={selectedEventTypes}
              setSelectedEventTypes={setSelectedEventTypes}
              eventTypeOptions={EVENT_TYPE_OPTIONS}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              selectedTags={selectedEventTags}
              setSelectedTags={setSelectedEventTags}
              eventTags={eventTags}
              eventTagsLoading={eventTagsLoading}
              eventTagsError={eventTagsError}
              maxDistance={maxDistance}
              setMaxDistance={setMaxDistance}
              selectedStartDate={selectedStartDate}
              setSelectedStartDate={setSelectedStartDate}
              selectedEndDate={selectedEndDate}
              setSelectedEndDate={setSelectedEndDate}
              divisionFilters={eventDivisionFilters}
              setDivisionFilters={setEventDivisionFilters}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              defaultMaxDistance={DEFAULT_MAX_DISTANCE}
              kmBetween={kmBetween}
              events={events}
              totalEvents={eventTotalCount}
              isLoadingInitial={isLoadingInitial}
              isLoadingMore={isLoadingMore}
              hasMoreEvents={hasMoreEvents}
              sentinelRef={sentinelRef}
              eventsError={eventsError}
              onEventClick={handleSelectEvent}
              onCreateEvent={handleCreateEventNavigation}
            />
          </Tabs.Panel>

          <Tabs.Panel value="organizations">
            <OrganizationsTabContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSearchSubmit={handleSearchSubmit}
              onOpenMap={() => setMapOpened(true)}
              location={location}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              selectedTags={selectedOrganizationTags}
              setSelectedTags={setSelectedOrganizationTags}
              divisionFilters={organizationDivisionFilters}
              setDivisionFilters={setOrganizationDivisionFilters}
              organizationTags={organizationTags}
              organizationTagsLoading={organizationTagsLoading}
              organizationTagsError={organizationTagsError}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              maxDistance={organizationsMaxDistance}
              setMaxDistance={setOrganizationsMaxDistance}
              defaultMaxDistance={DEFAULT_MAX_DISTANCE}
              results={organizationResults}
              loading={organizationsLoading}
              loadingMore={organizationsLoadingMore}
              hasMore={hasMoreOrganizations}
              sentinelRef={organizationsSentinelRef}
              error={organizationsError}
              onSelectOrganization={handleSelectOrganization}
            />
          </Tabs.Panel>

          <Tabs.Panel value="rentals">
            <RentalsTabContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSearchSubmit={handleSearchSubmit}
              onOpenMap={() => setMapOpened(true)}
              location={location}
              rentalsLoading={rentalsLoading}
              rentalsLoadingMore={rentalsLoadingMore}
              hasMoreRentals={hasMoreRentals}
              sentinelRef={rentalsSentinelRef}
              rentalsError={rentalsError}
              rentalListings={rentalListings}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              maxDistance={rentalsMaxDistance}
              setMaxDistance={setRentalsMaxDistance}
              defaultMaxDistance={DEFAULT_MAX_DISTANCE}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              defaultTimeRange={defaultTimeRange}
              onSelectOrganization={(org, listings) => handleSelectRentalOrganization(org, listings)}
            />
          </Tabs.Panel>

          <Tabs.Panel value="teams">
            <TeamsTabContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSearchSubmit={handleSearchSubmit}
              onOpenMap={() => setMapOpened(true)}
              teams={filteredTeams}
              totalTeams={teams.length}
              loading={teamsLoading}
              loadingMore={teamsLoadingMore}
              hasMore={hasMoreTeams}
              sentinelRef={teamsSentinelRef}
              error={teamsError}
              selectedSports={teamSelectedSports}
              setSelectedSports={setTeamSelectedSports}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              selectedDivisionTypeValues={teamSelectedDivisionTypeValues}
              setSelectedDivisionTypeValues={setTeamSelectedDivisionTypeValues}
              divisionTypeOptions={teamDivisionTypeOptions}
              onSelectTeam={(team) => {
                const affiliateUrl = normalizeExternalHttpUrl(team.affiliateUrl);
                if (affiliateUrl) {
                  window.open(affiliateUrl, '_blank', 'noopener,noreferrer');
                  return;
                }
                if (team.organizationId) {
                  router.push(`/organizations/${team.organizationId}?tab=teams`);
                  return;
                }
                router.push('/teams');
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Container>
      <DiscoverMapModal
        opened={mapOpened}
        onClose={() => setMapOpened(false)}
        location={location}
        requestLocation={requestLocation}
        kmBetween={kmBetween}
        selectedSports={selectedSports}
        setSelectedSports={setSelectedSports}
        selectedTags={selectedEventTags}
        setSelectedTags={setSelectedEventTags}
        eventTags={eventTags}
        eventTagsLoading={eventTagsLoading}
        eventTagsError={eventTagsError}
        sports={sportOptions}
        sportsLoading={sportsLoading}
        sportsError={sportsError?.message ?? null}
        maxDistance={maxDistance}
        setMaxDistance={setMaxDistance}
        selectedStartDate={selectedStartDate}
        setSelectedStartDate={setSelectedStartDate}
        selectedEndDate={selectedEndDate}
        setSelectedEndDate={setSelectedEndDate}
        defaultMaxDistance={DEFAULT_MAX_DISTANCE}
        onEventClick={handleSelectEvent}
        onOrganizationClick={handleSelectOrganization}
      />
    </>
  );
}

function OrganizationsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenMap: () => void;
  location: { lat: number; lng: number } | null;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
  divisionFilters: DivisionDiscoveryFilterValue;
  setDivisionFilters: (value: DivisionDiscoveryFilterValue) => void;
  organizationTags: OrganizationTag[];
  organizationTagsLoading: boolean;
  organizationTagsError: string | null;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  results: OrganizationResult[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  onSelectOrganization: (organization: Organization) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    location,
    selectedSports,
    setSelectedSports,
    selectedTags,
    setSelectedTags,
    divisionFilters,
    setDivisionFilters,
    organizationTags,
    organizationTagsLoading,
    organizationTagsError,
    sports,
    sportsLoading,
    sportsError,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    results,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    error,
    onSelectOrganization,
  } = props;

  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [filtersOpened, setFiltersOpened] = useState(false);
  const allSportsSelected = selectedSports.length === 0;
  const allTagsSelected = selectedTags.length === 0;
  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const tagsQuery = tagSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();
  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);
  const visibleOrganizationTags = useMemo(() => {
    const matchingTags = tagsQuery
      ? organizationTags.filter((tag) => tag.name.toLowerCase().includes(tagsQuery))
      : organizationTags;
    return matchingTags
      .slice()
      .sort((a, b) => {
        const countDiff = (b.organizationCount ?? 0) - (a.organizationCount ?? 0);
        return countDiff || a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [organizationTags, tagsQuery]);

  const hasResults = results.length > 0;
  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: 'query',
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(''),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  selectedTags.forEach((tagSlug) => {
    const tag = organizationTags.find((option) => (option.slug ?? option.name) === tagSlug);
    activeFilters.push({
      key: `tag-${tagSlug}`,
      label: tag?.name ?? tagSlug,
      onRemove: () => setSelectedTags((current) => current.filter((value) => value !== tagSlug)),
    });
  });

  const hasDivisionFilters = divisionFilters.genders.length > 0
    || divisionFilters.skillDivisionTypeIds.length > 0
    || divisionFilters.ageDivisionTypeIds.length > 0
    || divisionFilters.priceMinDollars !== null
    || divisionFilters.priceMaxDollars !== null;
  if (hasDivisionFilters) {
    activeFilters.push({
      key: 'division-filters',
      label: 'Division filters',
      onRemove: () => setDivisionFilters(EMPTY_DIVISION_FILTERS),
    });
  }

  if (location && typeof maxDistance === 'number') {
    activeFilters.push({
      key: 'distance',
      label: `Within ${Math.round(kmToMiles(maxDistance))} mi`,
      onRemove: () => setMaxDistance(null),
    });
  }

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedSports([]);
    setSelectedTags([]);
    setDivisionFilters(EMPTY_DIVISION_FILTERS);
    setMaxDistance(null);
  }, [setDivisionFilters, setSearchTerm, setSelectedSports, setSelectedTags, setMaxDistance]);

  const activeFilterCount = activeFilters.length;

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
          Tags
        </Text>
        <TextInput
          value={tagSearchTerm}
          onChange={(event) => setTagSearchTerm(event.currentTarget.value)}
          placeholder="Search tag..."
          mb="sm"
        />
        <Group gap="xs" align="center">
          <Chip
            color="blue"
            radius="xl"
            checked={allTagsSelected}
            disabled={organizationTagsLoading || !organizationTags.length}
            onChange={(checked) => {
              if (checked) {
                setSelectedTags([]);
              }
            }}
          >
            All
          </Chip>
          {organizationTagsLoading ? (
            <Loader size="sm" aria-label="Loading organization tags" />
          ) : visibleOrganizationTags.length ? (
            visibleOrganizationTags.map((tag) => {
              const identity = tag.slug ?? tag.name;
              return (
                <Chip
                  key={identity}
                  color="blue"
                  radius="xl"
                  checked={selectedTags.includes(identity)}
                  onChange={(checked) => {
                    setSelectedTags((current) => {
                      if (checked) {
                        const next = new Set(current);
                        next.add(identity);
                        return Array.from(next);
                      }
                      return current.filter((value) => value !== identity);
                    });
                  }}
                >
                  {tag.name} ({tag.organizationCount ?? 0})
                </Chip>
              );
            })
          ) : (
            <Text size="sm" c="dimmed">
              {tagsQuery ? 'No tags match this search.' : 'No tags available.'}
            </Text>
          )}
        </Group>
        {organizationTagsError && (
          <Alert color="red" radius="md" mt="sm">
            {organizationTagsError}
          </Alert>
        )}
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

      <DivisionDiscoveryFilters
        value={divisionFilters}
        onChange={setDivisionFilters}
        selectedSports={selectedSports}
      />

      {location && (
        <div>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
            Distance
          </Text>
          <Text size="sm" fw={600} mb={6}>
            {typeof maxDistance === 'number' ? `Within ${Math.round(kmToMiles(maxDistance))} mi` : 'Any distance'}
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
      )}
    </div>
  );

  return (
    <div className="space-y-6 mb-8">
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <DiscoverSearchControls
          value={searchTerm}
          onValueChange={setSearchTerm}
          placeholder="Search by name or description"
          onSearch={onSearchSubmit}
          onOpenMap={onOpenMap}
          searchLabel="Search organizations"
        />
        <Text size="sm" c="dimmed">
          {results.length} organization{results.length === 1 ? '' : 's'}
          {location ? ' near you.' : '. Enable location for distance filtering.'}
        </Text>
      </Group>

      <Drawer
        opened={filtersOpened}
        onClose={() => setFiltersOpened(false)}
        title="Filter Organizations"
        position="bottom"
        size="auto"
        padding="md"
      >
        <Group justify="space-between" align="center" mb="md">
          <Text fw={700} size="sm">
            Filters
          </Text>
          <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
            Reset
          </Button>
        </Group>
        {filterPanel}
      </Drawer>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-6.5rem)]">
          <Paper withBorder p={0} radius="lg" className="h-full overflow-hidden">
            <div className="discover-filter-panel h-full overflow-y-auto p-4">
              <Group justify="space-between" align="center" mb="md">
                <Text fw={700} size="sm">
                  Filters
                </Text>
                <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
                  Reset
                </Button>
              </Group>
              {filterPanel}
            </div>
          </Paper>
        </aside>

        <div className="space-y-4">
          <Button
            variant="default"
            leftSection={<SlidersHorizontal size={16} />}
            onClick={() => setFiltersOpened(true)}
            className="lg:hidden"
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>

          {activeFilters.length > 0 && (
            <Paper withBorder p="sm" radius="lg" className="discover-active-filters">
              <Group justify="space-between" align="flex-start" gap="xs" wrap="wrap">
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm" c="dimmed">
                    Active filters
                  </Text>
                  {activeFilters.map((filter) => (
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
                <Button variant="subtle" size="compact-sm" onClick={resetFilters}>
                  Clear all
                </Button>
              </Group>
            </Paper>
          )}

          {error && (
            <Alert color="red" radius="md">
              {error}
            </Alert>
          )}

          {loading ? (
            <Loading text="Loading organizations..." />
          ) : !hasResults ? (
            <Paper withBorder p="xl" radius="md">
              <Text fw={600} mb={4}>
                No organizations found
              </Text>
              <Text size="sm" c="dimmed">
                {activeFilterCount
                  ? 'Try adjusting your current filters.'
                  : 'Enable location or search to find organizations near you.'}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Organizations without a location are hidden until you search for them.
              </Text>
            </Paper>
          ) : (
            <ResponsiveCardGrid>
              {results.map(({ organization, distanceKm }) => (
                <OrganizationCard
                  key={organization.$id}
                  organization={organization}
                  onClick={() => onSelectOrganization(organization)}
                  actions={
                    typeof distanceKm === 'number' ? (
                      <Text size="xs" c="dimmed">
                        {distanceKm.toFixed(1)} km away
                      </Text>
                    ) : undefined
                  }
                />
              ))}
            </ResponsiveCardGrid>
          )}
          <div ref={sentinelRef} aria-hidden="true" />
          {loadingMore && (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          )}
          {!hasMore && results.length > 0 && (
            <Text size="sm" c="dimmed" ta="center">
              No more organizations to load
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenMap: () => void;
  teams: Team[];
  totalTeams: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  selectedDivisionTypeValues: string[];
  setSelectedDivisionTypeValues: Dispatch<SetStateAction<string[]>>;
  divisionTypeOptions: TeamDivisionFilterOption[];
  onSelectTeam: (team: Team) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    teams,
    totalTeams,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    error,
    selectedSports,
    setSelectedSports,
    sports,
    sportsLoading,
    sportsError,
    selectedDivisionTypeValues,
    setSelectedDivisionTypeValues,
    divisionTypeOptions,
    onSelectTeam,
  } = props;
  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const allSportsSelected = selectedSports.length === 0;
  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();
  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);
  const divisionOptionsBySport = useMemo(() => {
    const groups: Array<{ sport: string; options: TeamDivisionFilterOption[] }> = [];
    const groupIndexes = new Map<string, number>();
    divisionTypeOptions.forEach((option) => {
      const existingIndex = groupIndexes.get(option.sport);
      if (typeof existingIndex === 'number') {
        groups[existingIndex].options.push(option);
        return;
      }
      groupIndexes.set(option.sport, groups.length);
      groups.push({ sport: option.sport, options: [option] });
    });
    return groups;
  }, [divisionTypeOptions]);

  const divisionOptionByValue = useMemo(
    () => new Map(divisionTypeOptions.map((option) => [option.value, option])),
    [divisionTypeOptions],
  );

  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: 'query',
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(''),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  selectedDivisionTypeValues.forEach((value) => {
    const option = divisionOptionByValue.get(value);
    if (!option) {
      return;
    }
    activeFilters.push({
      key: `division-${value}`,
      label: option.label,
      onRemove: () => setSelectedDivisionTypeValues((current) => current.filter((item) => item !== value)),
    });
  });

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedSports([]);
    setSelectedDivisionTypeValues([]);
  }, [setSearchTerm, setSelectedSports, setSelectedDivisionTypeValues]);

  const activeFilterCount = activeFilters.length;

  const filterPanel = (
    <div className="space-y-6">
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
          Division Types
        </Text>
        {!selectedSports.length ? (
          <Text size="sm" c="dimmed">
            Select one or more sports to choose division types.
          </Text>
        ) : !divisionOptionsBySport.length ? (
          <Text size="sm" c="dimmed">
            No division types are available for the selected sports.
          </Text>
        ) : (
          <div className="space-y-3">
            {divisionOptionsBySport.map((group) => (
              <div key={group.sport}>
                {selectedSports.length > 1 && (
                  <Text size="xs" fw={600} c="dimmed" mb={6}>
                    {group.sport}
                  </Text>
                )}
                <Group gap="xs" align="center">
                  {group.options.map((option) => (
                    <Chip
                      key={option.value}
                      radius="xl"
                      checked={selectedDivisionTypeValues.includes(option.value)}
                      onChange={(checked) => {
                        setSelectedDivisionTypeValues((current) => {
                          if (checked) {
                            const next = new Set(current);
                            next.add(option.value);
                            return Array.from(next);
                          }
                          return current.filter((value) => value !== option.value);
                        });
                      }}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </Group>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 mb-8">
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <DiscoverSearchControls
          value={searchTerm}
          onValueChange={setSearchTerm}
          placeholder="Search teams with Open Registrations"
          onSearch={onSearchSubmit}
          onOpenMap={onOpenMap}
          searchLabel="Search teams"
        />
        <Text size="sm" c="dimmed">
          {teams.length}
          {totalTeams !== teams.length ? ` of ${totalTeams}` : ''} open team{teams.length === 1 ? '' : 's'}
          {activeQuery ? ` matching "${activeQuery}".` : '.'}
        </Text>
      </Group>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-6.5rem)]">
          <Paper withBorder p={0} radius="lg" className="h-full overflow-hidden">
            <div className="discover-filter-panel h-full overflow-y-auto p-4">
              <Group justify="space-between" align="center" mb="md">
                <Text fw={700} size="sm">
                  Filters
                </Text>
                <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
                  Reset
                </Button>
              </Group>
              {filterPanel}
            </div>
          </Paper>
        </aside>

        <div className="space-y-4">
          {activeFilters.length > 0 && (
            <Paper withBorder p="sm" radius="lg" className="discover-active-filters">
              <Group justify="space-between" align="flex-start" gap="xs" wrap="wrap">
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm" c="dimmed">
                    Active filters
                  </Text>
                  {activeFilters.map((filter) => (
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
                <Button variant="subtle" size="compact-sm" onClick={resetFilters}>
                  Clear all
                </Button>
              </Group>
            </Paper>
          )}

          {error && (
            <Alert color="red" radius="md">
              {error}
            </Alert>
          )}

          {loading ? (
            <Loading text="Loading open teams..." />
          ) : teams.length === 0 ? (
            <Paper withBorder p="xl" radius="md">
              <Text fw={600} mb={4}>
                No open-registration teams found
              </Text>
              <Text size="sm" c="dimmed">
                Try another team, sport, or division search.
              </Text>
            </Paper>
          ) : (
            <ResponsiveCardGrid>
              {teams.map((team) => (
                <TeamCard
                  key={team.$id}
                  team={team}
                  onClick={() => onSelectTeam(team)}
                  actions={
                    <Text size="xs" c={team.affiliateUrl?.trim() ? 'blue' : 'green'} fw={600}>
                      {team.affiliateUrl?.trim() ? 'External registration' : 'Open registration'}
                    </Text>
                  }
                />
              ))}
            </ResponsiveCardGrid>
          )}
          <div ref={sentinelRef} aria-hidden="true" />
          {loadingMore && (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          )}
          {!hasMore && teams.length > 0 && (
            <Text size="sm" c="dimmed" ta="center">
              No more teams to load
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

function RentalsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenMap: () => void;
  location: { lat: number; lng: number } | null;
  rentalsLoading: boolean;
  rentalsLoadingMore: boolean;
  hasMoreRentals: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  rentalsError: string | null;
  rentalListings: RentalListing[];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  timeRange: [number, number];
  setTimeRange: (range: [number, number]) => void;
  defaultTimeRange: [number, number];
  onSelectOrganization: (organization: Organization, listings: RentalListing[]) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    location,
    rentalsLoading,
    rentalsLoadingMore,
    hasMoreRentals,
    sentinelRef,
    rentalsError,
    rentalListings,
    selectedSports,
    setSelectedSports,
    sports,
    sportsLoading,
    sportsError,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    timeRange,
    setTimeRange,
    defaultTimeRange,
    onSelectOrganization,
  } = props;

  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const allSportsSelected = selectedSports.length === 0;
  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();
  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);

  const filteredListings = useMemo(() => {
    const [startHour, endHour] = timeRange;
    return rentalListings.filter((listing) => {
      if (!rentalResourceMatchesSports(listing, selectedSports)) {
        return false;
      }
      if (location && typeof maxDistance === 'number') {
        if (typeof listing.distanceKm !== 'number' || listing.distanceKm > maxDistance) {
          return false;
        }
      }
      if (activeQuery) {
        const searchBlob = `${listing.organization.name} ${listing.organization.description ?? ''} ${listing.organization.location ?? ''} ${listing.facility?.name ?? ''} ${listing.facility?.location ?? ''} ${listing.field?.name ?? ''}`.toLowerCase();
        if (!searchBlob.includes(activeQuery.toLowerCase())) {
          return false;
        }
      }
      if (listing.kind !== 'slot') {
        return true;
      }
      const start = listing.nextOccurrence;
      const hour = start.getHours() + start.getMinutes() / 60;
      return hour >= startHour && hour < endHour;
    });
  }, [rentalListings, timeRange, selectedSports, location, maxDistance, activeQuery]);

  const rentalCards = useMemo<RentalCardEntry[]>(() => {
    const groupedSlots = new Map<string, { organization: Organization; listings: RentalListing[] }>();
    const entries: RentalCardEntry[] = [];

    filteredListings.forEach((listing) => {
      if (listing.kind === 'affiliateFacility' && listing.facility) {
        const facilityName = listing.facility.name?.trim();
        const facilityLocation = listing.facility.location?.trim();
        entries.push({
          key: `affiliate-${listing.organization.$id}-${listing.facility.$id}`,
          organization: {
            ...listing.organization,
            name: facilityName || listing.organization.name,
            location: facilityLocation || listing.organization.location,
            address: listing.facility.address || listing.organization.address,
            description: listing.organization.name === facilityName
              ? listing.organization.description
              : [listing.organization.name, listing.organization.description].filter(Boolean).join(' - '),
          },
          listings: [listing],
          actionLabel: 'External booking',
        });
        return;
      }

      const orgId = listing.organization.$id;
      const existing = groupedSlots.get(orgId);
      if (existing) {
        existing.listings.push(listing);
      } else {
        groupedSlots.set(orgId, { organization: listing.organization, listings: [listing] });
      }
    });

    Array.from(groupedSlots.values()).forEach((entry) => {
      entries.push({
        key: `organization-${entry.organization.$id}`,
        organization: entry.organization,
        listings: entry.listings,
        actionLabel: `${entry.listings.length} rental${entry.listings.length === 1 ? '' : 's'} available`,
      });
    });

    return entries;
  }, [filteredListings]);

  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: 'query',
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(''),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  if (location && typeof maxDistance === 'number') {
    activeFilters.push({
      key: 'distance',
      label: `Within ${Math.round(kmToMiles(maxDistance))} mi`,
      onRemove: () => setMaxDistance(null),
    });
  }

  if (timeRange[0] !== defaultTimeRange[0] || timeRange[1] !== defaultTimeRange[1]) {
    activeFilters.push({
      key: 'time-range',
      label: `${formatHourLabel(timeRange[0])} - ${formatHourLabel(timeRange[1])}`,
      onRemove: () => setTimeRange(defaultTimeRange),
    });
  }

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedSports([]);
    setMaxDistance(null);
    setTimeRange(defaultTimeRange);
  }, [setSearchTerm, setSelectedSports, setMaxDistance, setTimeRange, defaultTimeRange]);

  const activeFilterCount = activeFilters.length;

  const filterPanel = (
    <div className="space-y-6">
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
          Time Range
        </Text>
        <RangeSlider
          className="discover-time-range-slider"
          min={0}
          max={24}
          step={1}
          minRange={1}
          value={timeRange}
          onChange={(value) => setTimeRange(value as [number, number])}
          marks={[
            { value: 0, label: formatHourTickLabel(0) },
            { value: 12, label: formatHourTickLabel(12) },
            { value: 24, label: formatHourTickLabel(24) },
          ]}
          label={(value) => formatHourLabel(value)}
          size="sm"
        />
      </div>

      {location && (
        <div>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
            Distance
          </Text>
          <Text size="sm" fw={600} mb={6}>
            {typeof maxDistance === 'number' ? `Within ${Math.round(kmToMiles(maxDistance))} mi` : 'Any distance'}
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
      )}
    </div>
  );

  return (
    <div className="space-y-6 mb-8">
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <DiscoverSearchControls
          value={searchTerm}
          onValueChange={setSearchTerm}
          placeholder="Search organizations and fields..."
          onSearch={onSearchSubmit}
          onOpenMap={onOpenMap}
          searchLabel="Search rentals"
        />
        <Text size="sm" c="dimmed">
          {rentalCards.length} rental listing{rentalCards.length === 1 ? '' : 's'}
          {location ? ' near you.' : '.'}
        </Text>
      </Group>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-6.5rem)]">
          <Paper withBorder p={0} radius="lg" className="h-full overflow-hidden">
            <div className="discover-filter-panel h-full overflow-y-auto p-4">
              <Group justify="space-between" align="center" mb="md">
                <Text fw={700} size="sm">
                  Filters
                </Text>
                <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
                  Reset
                </Button>
              </Group>
              {filterPanel}
            </div>
          </Paper>
        </aside>

        <div className="space-y-4">
          {activeFilters.length > 0 && (
            <Paper withBorder p="sm" radius="lg" className="discover-active-filters">
              <Group justify="space-between" align="flex-start" gap="xs" wrap="wrap">
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm" c="dimmed">
                    Active filters
                  </Text>
                  {activeFilters.map((filter) => (
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
                <Button variant="subtle" size="compact-sm" onClick={resetFilters}>
                  Clear all
                </Button>
              </Group>
            </Paper>
          )}

          {rentalsError && (
            <Alert color="red">
              {rentalsError}
            </Alert>
          )}

          {rentalsLoading ? (
            <Loading text="Loading rentals..." />
          ) : rentalCards.length === 0 ? (
            <Paper withBorder p="xl" radius="md">
              <Text fw={600} mb={4}>
                No rentals available
              </Text>
              <Text size="sm" c="dimmed">
                Try adjusting your current filters to explore more fields.
              </Text>
            </Paper>
          ) : (
            <ResponsiveCardGrid>
              {rentalCards.map(({ key, organization, listings, actionLabel }) => (
                <OrganizationCard
                  key={key}
                  organization={organization}
                  onClick={() => onSelectOrganization(organization, listings)}
                  actions={
                    <Text size="xs" c="dimmed">
                      {actionLabel}
                    </Text>
                  }
                />
              ))}
            </ResponsiveCardGrid>
          )}
          <div ref={sentinelRef} aria-hidden="true" />
          {rentalsLoadingMore && (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          )}
          {!hasMoreRentals && rentalCards.length > 0 && (
            <Text size="sm" c="dimmed" ta="center">
              No more rentals to load
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return formatDisplayTime(date);
}

function formatHourTickLabel(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  if (normalizedHour === 0) {
    return '12am';
  }
  if (normalizedHour === 12) {
    return '12pm';
  }
  if (normalizedHour < 12) {
    return `${normalizedHour}am`;
  }
  return `${normalizedHour - 12}pm`;
}
