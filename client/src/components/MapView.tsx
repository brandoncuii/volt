import { useCallback, useEffect, useRef } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { decodePolyline, type RouteResponse } from '@volt/shared';

type LatLng = { lat: number; lng: number };

interface Props {
  result: RouteResponse | null;
  start: LatLng | null;
  end: LatLng | null;
  waypoints?: LatLng[];
  onStopClick?: (chargerId: string) => void;
}

const containerStyle = { width: '100%', height: '100%' };

// California center as a sensible default.
const defaultCenter = { lat: 36.7783, lng: -119.4179 };

// Text badge rendered above the marker (pill styling via .map-marker-label CSS).
// color/fontSize/fontWeight must be passed here rather than left to the class:
// Maps writes its own defaults inline on the label element, which would win.
// `dot` shifts the badge less, for the small circle waypoint markers.
function endpointLabel(text: string, dot = false): google.maps.MarkerLabel {
  return {
    text,
    className: dot ? 'map-marker-label map-marker-label--dot' : 'map-marker-label',
    color: 'white',
    fontSize: '11px',
    fontWeight: '600',
  };
}

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ],
};

export function MapView({ result, start, end, waypoints, onStopClick }: Props) {
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
    // Prefer the real road geometry when the server planned route-first.
    // (It follows start → waypoints → end; charger stops sit just off it.)
    if (result?.encodedPolyline) return decodePolyline(result.encodedPolyline);
    // Fallback: the response lists only charging stops; waypoints aren't in
    // it. Order all intermediate points by their projection onto the
    // start→end axis so the line threads through them roughly in travel order.
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
        <MarkerF position={start} title="Start" label={endpointLabel('Start')} />
      )}
      {end && (
        <MarkerF position={end} title="Destination" label={endpointLabel('Destination')} />
      )}
      {wps.map((w, i) => (
        <MarkerF
          key={`wp-${i}`}
          position={w}
          title={`Stop ${i + 1}`}
          label={endpointLabel(`Stop ${i + 1}`, true)}
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
          onClick={() => onStopClick?.(stop.charger.id)}
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
