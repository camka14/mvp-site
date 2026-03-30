
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TextInput, Button, Paper } from '@mantine/core';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { locationService } from '@/lib/locationService';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '@/lib/googleMapsLoader';

interface LocationSelectorProps {
    value: string;
    coordinates: { lat: number; lng: number };
    onChange: (location: string, lat: number, lng: number, address?: string) => void;
    isValid: boolean;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    errorMessage?: string;
    showStreetViewControl?: boolean;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({
    value,
    coordinates,
    onChange,
    isValid,
    disabled = false,
    label = 'Location',
    required = false,
    errorMessage = 'Location is required',
    showStreetViewControl = true,
}) => {
    const [showMap, setShowMap] = useState(false);
    const [center, setCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // NYC default
    const [mapSearchQuery, setMapSearchQuery] = useState('');
    const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
    const geolocationRequestedRef = useRef(false);
    const hasCoordinates = coordinates.lat !== 0 || coordinates.lng !== 0;
    const mapCenter = hasCoordinates ? coordinates : center;

    const { isLoaded } = useJsApiLoader({
        id: GOOGLE_MAPS_SCRIPT_ID,
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    useEffect(() => {
        if (!isLoaded || !showMap) return;
        if (geolocationRequestedRef.current) return;
        const hasExistingSelection = coordinates.lat !== 0 || coordinates.lng !== 0;
        if (hasExistingSelection) return;
        if (!('geolocation' in navigator)) return;

        geolocationRequestedRef.current = true;
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setCenter({ lat, lng });
            },
            () => {
                // ignore errors; keep default center
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        );
    }, [isLoaded, showMap, coordinates.lat, coordinates.lng]);

    const autocompleteOptions = useRef<google.maps.places.AutocompleteOptions>({
        fields: ['name', 'formatted_address', 'geometry', 'place_id'],
    });

    const getPlaceDetails = useCallback(async (placeId: string): Promise<google.maps.places.PlaceResult | null> => {
        if (!google.maps?.places) return null;
        return new Promise((resolve) => {
            const service = new google.maps.places.PlacesService(mapInstance ?? document.createElement('div'));
            service.getDetails(
                {
                    placeId,
                    fields: ['name', 'formatted_address', 'geometry', 'place_id'],
                },
                (place, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                        resolve(place);
                        return;
                    }
                    resolve(null);
                },
            );
        });
    }, [mapInstance]);

    const onMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
        if (disabled) return;
        if (e.latLng) {
            const iconEvent = e as google.maps.IconMouseEvent;
            if (iconEvent.placeId) {
                iconEvent.stop();
                const place = await getPlaceDetails(iconEvent.placeId);
                const placeLocation = place?.geometry?.location;
                if (placeLocation) {
                    const lat = placeLocation.lat();
                    const lng = placeLocation.lng();
                    const locationName = place.name?.trim() || place.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    const formattedAddress = place.formatted_address || undefined;
                    setCenter({ lat, lng });
                    onChange(locationName, lat, lng, formattedAddress);
                    setMapSearchQuery(locationName);
                    return;
                }
            }

            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setCenter({ lat, lng });

            // Reverse geocode to get address
            try {
                const geocoder = new google.maps.Geocoder();
                const result = await geocoder.geocode({ location: { lat, lng } });
                if (result.results[0]) {
                    const formattedAddress = result.results[0].formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    onChange(formattedAddress, lat, lng, formattedAddress);
                }
            } catch (error) {
                console.error('Geocoding failed:', error);
                const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                onChange(fallback, lat, lng);
            }
        }
    }, [disabled, getPlaceDetails, onChange]);

    const searchLocation = async (address: string) => {
        if (disabled) return;
        if (!address.trim()) return;

        try {
            const result = await locationService.geocodeLocation(address);
            setCenter({ lat: result.lat, lng: result.lng });
            onChange(address, result.lat, result.lng, result.formattedAddress);
            setMapSearchQuery(address);
        } catch (error) {
            console.error('Location search failed:', error);
        }
    };

    const handlePlaceChanged = useCallback(() => {
        if (!autocomplete) return;
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) return;

        const lat = location.lat();
        const lng = location.lng();
        const locationName = place.name?.trim() || place.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const formattedAddress = place.formatted_address || undefined;

        setCenter({ lat, lng });
        onChange(locationName, lat, lng, formattedAddress);
        setMapSearchQuery(locationName);
    }, [autocomplete, onChange]);

    return (
        <div>
            <div className="space-y-2">
                <div className="flex gap-2 items-end">
                    <TextInput
                        label={label}
                        withAsterisk={required}
                        disabled={disabled}
                        value={value}
                        onChange={(e) => {
                            if (disabled) return;
                            onChange(e.currentTarget.value, coordinates.lat, coordinates.lng);
                        }}
                        onKeyUp={(e) => (e.key === 'Enter') && searchLocation(value)}
                        placeholder="Enter address or search location"
                        error={!isValid ? errorMessage : undefined}
                        style={{ flex: 1 }}
                    />
                    <div className="ml-auto">
                        <Button
                            type="button"
                            onClick={() => {
                                if (disabled) return;
                                const nextShowMap = !showMap;
                                if (nextShowMap) {
                                    setMapSearchQuery('');
                                }
                                setShowMap(nextShowMap);
                            }}
                            disabled={disabled}
                        >
                            {showMap ? 'Hide' : 'Show'} Map
                        </Button>
                    </div>
                </div>
            </div>

            {showMap && isLoaded && (
                <Paper
                    mt="md"
                    withBorder
                    radius="md"
                    style={{ height: 256, overflow: 'hidden', position: 'relative' }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            zIndex: 2,
                            left: 0,
                            width: '50%',
                            top: 0,
                            padding: '12px',
                            boxSizing: 'border-box',
                        }}
                    >
                        <Autocomplete
                            onLoad={setAutocomplete}
                            onPlaceChanged={handlePlaceChanged}
                            options={autocompleteOptions.current}
                        >
                            <TextInput
                                value={mapSearchQuery}
                                onChange={(e) => {
                                    const next = e.currentTarget.value;
                                    setMapSearchQuery(next);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void searchLocation(mapSearchQuery);
                                    }
                                }}
                                placeholder="Search for an address or place"
                                disabled={disabled}
                                autoComplete="off"
                            />
                        </Autocomplete>
                    </div>
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={mapCenter}
                        zoom={15}
                        onLoad={setMapInstance}
                        onUnmount={() => setMapInstance(null)}
                        onClick={onMapClick}
                        options={{
                            clickableIcons: true,
                            disableDefaultUI: false,
                            mapTypeControl: false,
                            streetViewControl: showStreetViewControl,
                        }}
                    >
                        {hasCoordinates && (
                            <Marker position={coordinates} />
                        )}
                    </GoogleMap>
                </Paper>
            )}
        </div>
    );
};

export default LocationSelector;
