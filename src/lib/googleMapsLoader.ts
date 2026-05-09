import type { Libraries } from '@react-google-maps/api';

export const GOOGLE_MAPS_SCRIPT_ID = 'google-map-script';
export const GOOGLE_MAPS_LIBRARIES: Libraries = ['places'];
export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || undefined;

export const GOOGLE_MAP_OPTIONS_WITH_MAP_ID = GOOGLE_MAPS_MAP_ID
    ? { mapId: GOOGLE_MAPS_MAP_ID }
    : {};
