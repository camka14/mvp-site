'use client';

import { useEffect, useState } from 'react';
import { useLocation } from '@/app/hooks/useLocation';
import { locationService } from '@/lib/locationService';
import { useDebounce } from '@/app/hooks/useDebounce';
import { Popover, Button, TextInput, Loader, ScrollArea, Text, Group } from '@mantine/core';
import Paper from '@mui/material/Paper';

export default function LocationSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const [predictions, setPredictions] = useState<Array<{ description: string; placeId: string }>>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<any | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

  const { location, locationInfo, loading, error, requestLocation, clearLocation, setLocationFromInfo } = useLocation();

  const handleUseCurrentLocation = async () => {
    await requestLocation();
  };

  const startSession = () => {
    if (!sessionToken) setSessionToken(locationService.createPlacesSessionToken());
  };
  const endSession = () => {
    setSessionToken(null);
    setPredictions([]);
    setSearchQuery('');
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // If user pressed Enter on a typed query without selecting a prediction, fallback to geocode
    try {
      const info = await locationService.geocodeLocation(searchQuery);
      setLocationFromInfo(info);
      setShowLocationOptions(false);
      endSession();
    } catch (e) {
      // ignore; error surfaced via hook if needed
    }
  };

  const handleClearLocation = () => {
    clearLocation();
    setShowLocationOptions(false);
    endSession();
  };

  // Fetch predictions when query changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debouncedQuery || !showLocationOptions) {
        setPredictions([]);
        return;
      }
      try {
        setPredictionsLoading(true);
        const preds = await locationService.getPlacePredictions(debouncedQuery, sessionToken || undefined);
        if (!cancelled) setPredictions(preds);
      } catch (e) {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setPredictionsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, sessionToken, showLocationOptions]);

  const selectPrediction = async (placeId: string) => {
    try {
      const info = await locationService.getPlaceDetails(placeId, sessionToken || undefined);
      setLocationFromInfo(info);
      setShowLocationOptions(false);
    } catch (e) {
      // noop
    } finally {
      endSession();
    }
  };

  return (
    <Popover opened={showLocationOptions} onChange={setShowLocationOptions} position="bottom-start" withArrow>
      <Popover.Target>
        <Button variant="default" onClick={() => { setShowLocationOptions(!showLocationOptions); if (!showLocationOptions) startSession(); }}>
          {locationInfo?.city ? `${locationInfo.city}${locationInfo.state ? `, ${locationInfo.state}` : ''}` : 'Set Location'}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Group mb="sm">
          <Button fullWidth onClick={handleUseCurrentLocation} disabled={loading} leftSection={<span>📍</span>}>
            {loading ? 'Getting location…' : 'Use Current Location'}
          </Button>
        </Group>
        <form onSubmit={handleSearchLocation}>
          <Group align="stretch" gap="xs">
            <TextInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Enter city, state, or ZIP"
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={loading || !searchQuery.trim()}>Search</Button>
          </Group>
        </form>
        {(predictionsLoading || predictions.length > 0) && (
          <ScrollArea.Autosize mah={180} mt="sm">
            {predictionsLoading && <Text size="xs" c="dimmed" px="xs">Loading suggestions…</Text>}
            {predictions.map((p) => (
              <Button key={p.placeId} variant="subtle" fullWidth justify="flex-start" onClick={() => selectPrediction(p.placeId)}>
                {p.description}
              </Button>
            ))}
          </ScrollArea.Autosize>
        )}
        {locationInfo && (
          <Group justify="space-between" mt="sm">
            <Text size="sm" c="dimmed">Current: {locationInfo.city}{locationInfo.state ? `, ${locationInfo.state}` : ''}</Text>
            <Button variant="subtle" color="red" size="xs" onClick={handleClearLocation}>Clear</Button>
          </Group>
        )}
        {error && (
          <Text size="xs" c="red" mt="sm">{error}</Text>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
