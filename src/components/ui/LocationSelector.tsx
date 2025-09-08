
import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { locationService } from '@/lib/locationService';

interface LocationSelectorProps {
    value: string;
    coordinates: { lat: number; lng: number };
    onChange: (location: string, lat: number, lng: number) => void;
    isValid: boolean;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({
    value,
    coordinates,
    onChange,
    isValid
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Location *
            </label>
            <div className="space-y-2">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value, coordinates.lat, coordinates.lng)}
                        onKeyPress={(e) => e.key === 'Enter' && searchLocation(value)}
                        className={`flex-1 p-3 border rounded-md ${isValid ? 'border-gray-300' : 'border-red-300'
                            }`}
                        placeholder="Enter address or search location"
                    />
                    <button
                        type="button"
                        onClick={() => setShowMap(!showMap)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        {showMap ? 'Hide' : 'Show'} Map
                    </button>
                </div>

                {!isValid && value.length > 0 && (
                    <p className="text-red-500 text-sm">Please select a valid location</p>
                )}
            </div>

            {showMap && isLoaded && (
                <div className="mt-4 h-64 border rounded-md overflow-hidden">
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={center}
                        zoom={15}
                        onClick={onMapClick}
                        options={{
                            clickableIcons: true,
                            disableDefaultUI: false,
                        }}
                    >
                        {selectedLocation.lat !== 0 && selectedLocation.lng !== 0 && (
                            <Marker position={selectedLocation} />
                        )}
                    </GoogleMap>
                </div>
            )}
        </div>
    );
};

export default LocationSelector;
