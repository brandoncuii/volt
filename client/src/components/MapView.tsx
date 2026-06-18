import { useCallback, useEffect, useRef } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import type { RouteResponse } from '@volt/shared';

type LatLng = { lat: number; lng: number };

interface Props {
  result: RouteResponse | null;
  start: LatLng | null;
  end: LatLng | null;
  waypoints?: LatLng[];
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

export function MapView({ result, start, end, waypoints }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const wps = waypoints ?? [];

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !start || !end) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(start);
    bounds.extend(end);
    for (const w of wps) bounds.extend(w);
    if (result) {
      for (const s of result.stops) bounds.extend(s.charger.location);
    }
    map.fitBounds(bounds, 80);
    // wps is derived from the waypoints prop; depend on the prop itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, start, end, waypoints]);

  const polylinePath = (() => {
    if (!start || !end) return null;
    // The response lists only charging stops; waypoints aren't in it. Order
    // all intermediate points by their projection onto the start→end axis so
    // the line threads through them roughly in travel order.
    const intermediates: LatLng[] = [
      ...(result?.stops.map((s) => s.charger.location) ?? []),
      ...wps,
    ];
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const len2 = dx * dx + dy * dy || 1;
    const t = (p: LatLng) =>
      ((p.lng - start.lng) * dx + (p.lat - start.lat) * dy) / len2;
    intermediates.sort((a, b) => t(a) - t(b));
    return [start, ...intermediates, end];
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
      {wps.map((w, i) => (
        <MarkerF
          key={`wp-${i}`}
          position={w}
          title={`Stop ${i + 1}`}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#8b5cf6',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
          }}
        />
      ))}
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
