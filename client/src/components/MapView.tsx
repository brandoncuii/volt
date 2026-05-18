import { useCallback, useEffect, useRef } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import type { RouteResponse } from '@volt/shared';

interface Props {
  result: RouteResponse | null;
  start: { lat: number; lng: number } | null;
  end: { lat: number; lng: number } | null;
}

const containerStyle = { width: '100%', height: '100%' };

// California center as a sensible default.
const defaultCenter = { lat: 36.7783, lng: -119.4179 };

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ],
};

export function MapView({ result, start, end }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !start || !end) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(start);
    bounds.extend(end);
    if (result) {
      for (const s of result.stops) bounds.extend(s.charger.location);
    }
    map.fitBounds(bounds, 80);
  }, [result, start, end]);

  const polylinePath = (() => {
    if (!start || !end) return null;
    return [start, ...(result?.stops.map((s) => s.charger.location) ?? []), end];
  })();

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={6}
      options={mapOptions}
      onLoad={onLoad}
    >
      {start && (
        <MarkerF position={start} label={{ text: 'A', color: 'white', fontWeight: '600' }} />
      )}
      {end && (
        <MarkerF position={end} label={{ text: 'B', color: 'white', fontWeight: '600' }} />
      )}
      {result?.stops.map((stop, i) => (
        <MarkerF
          key={stop.charger.id}
          position={stop.charger.location}
          label={{ text: String(i + 1), color: 'white', fontWeight: '600' }}
          title={stop.charger.name}
        />
      ))}
      {polylinePath && (
        <PolylineF
          path={polylinePath}
          options={{
            strokeColor: '#3b82f6',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          }}
        />
      )}
    </GoogleMap>
  );
}
