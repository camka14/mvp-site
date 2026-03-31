import React from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
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
    const [mapInstance, setMapInstance] = React.useState<google.maps.Map | null>(null);
    const markerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

    React.useEffect(() => {
        return () => {
            if (markerRef.current) {
                markerRef.current.map = null;
                markerRef.current = null;
            }
        };
    }, []);

    React.useEffect(() => {
        let cancelled = false;

        const syncMarker = async () => {
            if (!isLoaded || !mapInstance || !showMap) {
                if (markerRef.current) {
                    markerRef.current.map = null;
                    markerRef.current = null;
                }
                return;
            }

            const markerLibrary = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;
            if (cancelled) return;

            if (!markerRef.current) {
                markerRef.current = new markerLibrary.AdvancedMarkerElement({
                    map: mapInstance,
                    position: coordinates,
                    title: location || 'Event location',
                });
                return;
            }

            markerRef.current.map = mapInstance;
            markerRef.current.position = coordinates;
            markerRef.current.title = location || 'Event location';
        };

        void syncMarker();

        return () => {
            cancelled = true;
        };
    }, [coordinates, isLoaded, location, mapInstance, showMap]);

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
                        onLoad={setMapInstance}
                        onUnmount={() => setMapInstance(null)}
                    />
                </div>
            )}
        </div>
    );
};

export default EventLocationDisplay;
