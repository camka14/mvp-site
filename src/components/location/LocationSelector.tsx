
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TextInput, Button, Paper } from '@mantine/core';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { locationService } from '@/lib/locationService';

interface LocationSelectorProps {
    value: string;
    coordinates: { lat: number; lng: number };
    onChange: (location: string, lat: number, lng: number) => void;
    isValid: boolean;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    errorMessage?: string;
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
}) => {
    const [showMap, setShowMap] = useState(false);
    const [center, setCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // NYC default
    const [selectedLocation, setSelectedLocation] = useState(coordinates);
    const [searchQuery, setSearchQuery] = useState(value ?? '');
    const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
    const geolocationRequestedRef = useRef(false);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        libraries: ['places']
    });

    useEffect(() => {
        if (coordinates.lat !== 0 && coordinates.lng !== 0) {
            setCenter(coordinates);
            setSelectedLocation(coordinates);
        }
    }, [coordinates]);

    useEffect(() => {
        setSearchQuery(value ?? '');
    }, [value]);

    useEffect(() => {
        if (!isLoaded || !showMap) return;
        if (geolocationRequestedRef.current) return;
        const hasExistingSelection = (selectedLocation.lat !== 0 || selectedLocation.lng !== 0);
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
    }, [isLoaded, showMap, selectedLocation]);

    const onMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
        if (disabled) return;
        if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setSelectedLocation({ lat, lng });

            // Reverse geocode to get address
            try {
                const geocoder = new google.maps.Geocoder();
                const result = await geocoder.geocode({ location: { lat, lng } });
                if (result.results[0]) {
                    onChange(result.results[0].formatted_address, lat, lng);
                }
            } catch (error) {
                console.error('Geocoding failed:', error);
                onChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng);
            }
        }
    }, [onChange]);

    const searchLocation = async (address: string) => {
        if (disabled) return;
        if (!address.trim()) return;

        try {
            const result = await locationService.geocodeLocation(address);
            setCenter({ lat: result.lat, lng: result.lng });
            setSelectedLocation({ lat: result.lat, lng: result.lng });
            onChange(address, result.lat, result.lng);
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
        const address = place.formatted_address || place.name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        setCenter({ lat, lng });
        setSelectedLocation({ lat, lng });
        onChange(address, lat, lng);
        setSearchQuery(address);
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
                        <Button type="button" onClick={() => !disabled && setShowMap(!showMap)} disabled={disabled}>
                            {showMap ? 'Hide' : 'Show'} Map
                        </Button>
                    </div>
                </div>
            </div>

            {showMap && isLoaded && (
                <Paper mt="md" withBorder radius="md" style={{ height: 256, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', zIndex: 2, width: 'calc(100% - 24px)', padding: '12px' }}>
                        <Autocomplete
                            onLoad={setAutocomplete}
                            onPlaceChanged={handlePlaceChanged}
                        >
                            <TextInput
                                value={searchQuery}
                                onChange={(e) => {
                                    const next = e.currentTarget.value;
                                    setSearchQuery(next);
                                    if (!disabled) {
                                        onChange(next, coordinates.lat, coordinates.lng);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                    }
                                }}
                                placeholder="Search for an address or place"
                                disabled={disabled}
                            />
                        </Autocomplete>
                    </div>
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={center}
                        zoom={15}
                        onClick={onMapClick}
                        options={{ clickableIcons: true, disableDefaultUI: false }}
                    >
                        {selectedLocation.lat !== 0 && selectedLocation.lng !== 0 && (
                            <Marker position={selectedLocation} />
                        )}
                    </GoogleMap>
                </Paper>
            )}
        </div>
    );
};

export default LocationSelector;
