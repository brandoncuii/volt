import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chargerSatisfiesBrands,
  type Restaurant,
  type PriceLevel,
  type Supercharger,
  type Brand,
} from '@volt/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, '..', 'data', 'places-cache.json');

const SEARCH_RADIUS_METERS = 800; // ~10 min walk while charging
const MAX_RESULTS = 6;
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
].join(',');

type Cache = Record<string, Restaurant[]>;
let cache: Cache | null = null;
let dirty = false;

function loadCache(): Cache {
  if (cache) return cache;
  cache = existsSync(CACHE_PATH)
    ? (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache)
    : {};
  return cache;
}

export function flushPlacesCache(): void {
  if (!dirty || !cache) return;
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  dirty = false;
}

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: PriceLevel;
}

async function fetchRestaurantsFromGoogle(location: {
  lat: number;
  lng: number;
}): Promise<Restaurant[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY not set');

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ['restaurant'],
      maxResultCount: MAX_RESULTS,
      locationRestriction: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius: SEARCH_RADIUS_METERS,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { places?: RawPlace[] };
  const places = json.places ?? [];

  return places
    .filter((p) => p.location)
    .map<Restaurant>((p) => ({
      id: p.id,
      name: p.displayName?.text ?? 'Unknown',
      formattedAddress: p.formattedAddress,
      location: { lat: p.location!.latitude, lng: p.location!.longitude },
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      priceLevel: p.priceLevel,
    }));
}

export async function getRestaurantsForCharger(
  chargerId: string,
  location: { lat: number; lng: number },
): Promise<Restaurant[]> {
  const c = loadCache();
  const hit = c[chargerId];
  if (hit) return hit;

  const restaurants = await fetchRestaurantsFromGoogle(location);
  c[chargerId] = restaurants;
  dirty = true;
  return restaurants;
}

// Parallel fetch + brand match; lookups failing for one charger don't drop
// the whole batch. Used by the route handler when the user has brand
// filters active.
export async function filterChargersByBrand(
  chargers: Supercharger[],
  brands: Brand[],
): Promise<Supercharger[]> {
  if (brands.length === 0) return chargers;
  const results = await Promise.all(
    chargers.map(async (c) => {
      try {
        const places = await getRestaurantsForCharger(c.id, c.location);
        return chargerSatisfiesBrands(places, brands) ? c : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((c): c is Supercharger => c !== null);
}
