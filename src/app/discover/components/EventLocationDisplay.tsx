import React from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '@/lib/googleMapsLoader';

const EventLocationDisplay: React.FC<{
    location: string;
    coordinates: { lat: number; lng: number };
}> = ({ location, coordinates }) => {
    const { isLoaded } = useJsApiLoader({
        id: GOOGLE_MAPS_SCRIPT_ID,
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const [showMap, setShowMap] = React.useState(false);

    if (!coordinates.lat || !coordinates.lng) {
        return (
            <div className="text-gray-600">
                <p>{location}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <p className="text-gray-800">{location}</p>
                <button
                    onClick={() => setShowMap(!showMap)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                >
                    {showMap ? 'Hide' : 'View'} on Map
                </button>
            </div>

            {showMap && isLoaded && (
                <div className="h-48 border rounded-md overflow-hidden">
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={coordinates}
                        zoom={15}
                    >
                        <Marker position={coordinates} />
                    </GoogleMap>
                </div>
            )}
        </div>
    );
};
