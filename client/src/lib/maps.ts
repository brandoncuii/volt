import { useJsApiLoader, type Libraries } from '@react-google-maps/api';

// Stable identity — passing a new array each render makes the loader thrash.
const LIBRARIES: Libraries = ['places', 'marker'];

export function useGoogleMaps() {
  return useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
    version: 'weekly',
  });
}

export interface PlaceValue {
  lat: number;
  lng: number;
  description: string;
}
