
import React, { useState, useEffect, useCallback } from 'react';
import { TextInput, Button, Paper, Text } from '@mantine/core';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { locationService } from '@/lib/locationService';

interface LocationSelectorProps {
    value: string;
    coordinates: { lat: number; lng: number };
    onChange: (location: string, lat: number, lng: number) => void;
    isValid: boolean;
    disabled?: boolean;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({
    value,
    coordinates,
    onChange,
    isValid,
    disabled = false,
}) => {
    const [showMap, setShowMap] = useState(false);
    const [center, setCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // NYC default
    const [selectedLocation, setSelectedLocation] = useState(coordinates);

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

    return (
        <div>
            <Text fw={500} size="sm" mb={4}>Location *</Text>
            <div className="space-y-2">
                <div className="flex gap-2">
                    <TextInput
                        disabled={disabled}
                        value={value}
                        onChange={(e) => {
                            if (disabled) return;
                            onChange(e.currentTarget.value, coordinates.lat, coordinates.lng);
                        }}
                        onKeyUp={(e) => (e.key === 'Enter') && searchLocation(value)}
                        placeholder="Enter address or search location"
                        error={!isValid && value.length > 0 ? 'Please select a valid location' : undefined}
                        style={{ flex: 1 }}
                    />
                    <Button type="button" onClick={() => !disabled && setShowMap(!showMap)} disabled={disabled}>
                        {showMap ? 'Hide' : 'Show'} Map
                    </Button>
                </div>
            </div>

            {showMap && isLoaded && (
                <Paper mt="md" withBorder radius="md" style={{ height: 256, overflow: 'hidden' }}>
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
