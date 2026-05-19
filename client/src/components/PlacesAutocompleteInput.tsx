import { useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import type { PlaceValue } from '@/lib/maps';

interface Props {
  id: string;
  label: string;
  placeholder?: string;
  onChange: (val: PlaceValue) => void;
}

// Wraps Google's new <gmp-place-autocomplete> web component (registered by the
// Maps JS SDK once the 'places' library has loaded). We mount it imperatively
// so React doesn't fight with the custom element's own DOM.
export function PlacesAutocompleteInput({ id, label, placeholder, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('gmp-place-autocomplete') as HTMLElement & {
      placeholder?: string;
    };
    el.id = id;
    if (placeholder) el.placeholder = placeholder;
    el.setAttribute('included-region-codes', 'us');
    // The element reads color-scheme from its ancestor; without this it
    // follows the OS preference and renders dark in dark-mode systems.
    el.style.colorScheme = 'light';

    const handler = async (e: Event) => {
      // gmp-select fires with placePrediction as a direct property on the event,
      // not under event.detail. The TS DOM types don't know about this yet.
      const prediction = (e as Event & {
        placePrediction?: { toPlace: () => google.maps.places.Place };
      }).placePrediction;
      const place = prediction?.toPlace();
      if (!place) return;
      await place.fetchFields({
        fields: ['location', 'displayName', 'formattedAddress'],
      });
      const loc = place.location;
      if (!loc) return;
      onChangeRef.current({
        lat: loc.lat(),
        lng: loc.lng(),
        description: place.displayName ?? place.formattedAddress ?? '',
      });
    };
    el.addEventListener('gmp-select', handler);
    container.appendChild(el);

    return () => {
      el.removeEventListener('gmp-select', handler);
      if (el.parentNode === container) container.removeChild(el);
    };
  }, [id, placeholder]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div
        ref={containerRef}
        style={{ colorScheme: 'light' }}
        className="[&_gmp-place-autocomplete]:w-full [&_gmp-place-autocomplete]:rounded-md [&_gmp-place-autocomplete]:border [&_gmp-place-autocomplete]:border-input [&_gmp-place-autocomplete]:shadow-xs"
      />
    </div>
  );
}
