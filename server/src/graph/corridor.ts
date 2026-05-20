import type { Supercharger } from '@volt/shared';
import { haversineKm } from './haversine.js';

interface LatLng {
  lat: number;
  lng: number;
}

// 30% detour budget is loose enough to cover realistic road meanders, tight
// enough to keep the brand-filter lookup set small on long routes.
const DEFAULT_FACTOR = 1.3;

// Returns chargers inside the ellipse with foci at `start` and `end` where
// haversine(start, c) + haversine(c, end) ≤ factor × haversine(start, end).
// Used to bound the candidate set when pre-filtering by restaurant brand.
export function chargersInCorridor(
  chargers: Supercharger[],
  start: LatLng,
  end: LatLng,
  factor: number = DEFAULT_FACTOR,
): Supercharger[] {
  const direct = haversineKm(start, end);
  const limit = direct * factor;
  return chargers.filter((c) => {
    const a = haversineKm(start, c.location);
    const b = haversineKm(c.location, end);
    return a + b <= limit;
  });
}
