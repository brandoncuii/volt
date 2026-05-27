import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DynamoDBClient,
  BatchGetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  chargerSatisfiesBrands,
  type Restaurant,
  type PriceLevel,
  type Supercharger,
  type Brand,
} from '@volt/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In Lambda with DynamoDB active the /tmp file is never used; locally we
// fall back to the JSON file cache.
const CACHE_PATH = ddbTableName()
  ? undefined
  : join(__dirname, '..', 'data', 'places-cache.json');

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

// 90 days in seconds — DynamoDB TTL attribute for cache expiry.
const TTL_SECONDS = 90 * 24 * 60 * 60;

// DynamoDB table for persistent places cache (Lambda). Locally we still
// use the JSON file. The CDK stack injects this env var.
function ddbTableName(): string | undefined {
  return process.env.PLACES_CACHE_TABLE;
}

let ddbClient: DynamoDBClient | null = null;
function getDdb(): DynamoDBClient {
  if (!ddbClient) ddbClient = new DynamoDBClient({});
  return ddbClient;
}

type Cache = Record<string, Restaurant[]>;
let cache: Cache | null = null;
let dirty = false;

let stats = { memHits: 0, ddbHits: 0, misses: 0 };
export function resetPlacesStats(): void {
  stats = { memHits: 0, ddbHits: 0, misses: 0 };
}
export function getPlacesStats(): {
  memHits: number;
  ddbHits: number;
  misses: number;
} {
  return stats;
}

function loadCache(): Cache {
  if (cache) return cache;
  if (CACHE_PATH && existsSync(CACHE_PATH)) {
    cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache;
  } else {
    cache = {};
  }
  return cache;
}

export function flushPlacesCache(): void {
  if (!dirty || !cache) return;
  // In Lambda with DynamoDB, writes happen inline (ddbPut) so we only
  // need to flush the JSON file when running locally.
  if (CACHE_PATH) {
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
  }
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

// ---------------------------------------------------------------------------
// DynamoDB helpers
// ---------------------------------------------------------------------------

const DDB_BATCH_LIMIT = 100;

async function ddbBatchGet(
  chargerIds: string[],
): Promise<Map<string, Restaurant[]>> {
  const table = ddbTableName()!;
  const result = new Map<string, Restaurant[]>();

  // BatchGetItem supports at most 100 keys per call.
  for (let i = 0; i < chargerIds.length; i += DDB_BATCH_LIMIT) {
    const batch = chargerIds.slice(i, i + DDB_BATCH_LIMIT);
    const keys = batch.map((id) => ({ pk: { S: `places#${id}` } }));

    const resp = await getDdb().send(
      new BatchGetItemCommand({
        RequestItems: { [table]: { Keys: keys } },
      }),
    );

    for (const item of resp.Responses?.[table] ?? []) {
      if (!item.pk?.S || !item.data?.S) continue;
      const id = item.pk.S.replace('places#', '');
      result.set(id, JSON.parse(item.data.S) as Restaurant[]);
    }

    // Retry unprocessed keys (throttling / partial failure).
    const unprocessed = resp.UnprocessedKeys?.[table]?.Keys;
    if (unprocessed && unprocessed.length > 0) {
      const retryResp = await getDdb().send(
        new BatchGetItemCommand({
          RequestItems: { [table]: { Keys: unprocessed } },
        }),
      );
      for (const item of retryResp.Responses?.[table] ?? []) {
        if (!item.pk?.S || !item.data?.S) continue;
        const id = item.pk.S.replace('places#', '');
        result.set(id, JSON.parse(item.data.S) as Restaurant[]);
      }
    }
  }

  return result;
}

async function ddbPut(
  chargerId: string,
  restaurants: Restaurant[],
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await getDdb().send(
    new PutItemCommand({
      TableName: ddbTableName(),
      Item: {
        pk: { S: `places#${chargerId}` },
        data: { S: JSON.stringify(restaurants) },
        ttl: { N: String(ttl) },
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Request coalescing — dedupe concurrent fetches for the same charger.
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<Restaurant[]>>();

export async function getRestaurantsForCharger(
  chargerId: string,
  location: { lat: number; lng: number },
): Promise<Restaurant[]> {
  // In-memory cache (warm Lambda or long-running local server)
  const c = loadCache();
  const memHit = c[chargerId];
  if (memHit) {
    stats.memHits++;
    return memHit;
  }

  // Coalesce concurrent requests for the same charger.
  const existing = inflight.get(chargerId);
  if (existing) return existing;

  const promise = fetchAndCache(chargerId, location);
  inflight.set(chargerId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(chargerId);
  }
}

async function fetchAndCache(
  chargerId: string,
  location: { lat: number; lng: number },
): Promise<Restaurant[]> {
  const c = loadCache();

  // DynamoDB single-key fallback (used by getRestaurantsForCharger when
  // the batch pre-warm path hasn't populated the in-memory cache yet).
  if (ddbTableName()) {
    const batch = await ddbBatchGet([chargerId]);
    const ddbHit = batch.get(chargerId);
    if (ddbHit) {
      stats.ddbHits++;
      c[chargerId] = ddbHit;
      return ddbHit;
    }
  }

  stats.misses++;
  const restaurants = await fetchRestaurantsFromGoogle(location);
  c[chargerId] = restaurants;
  dirty = true;

  if (ddbTableName()) {
    await ddbPut(chargerId, restaurants);
  }

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

  const c = loadCache();

  // Pre-warm from DynamoDB in bulk (BatchGetItem, 100 keys/call) so that
  // the per-charger calls below are in-memory hits.
  if (ddbTableName()) {
    const uncachedIds = chargers
      .filter((ch) => !c[ch.id])
      .map((ch) => ch.id);
    if (uncachedIds.length > 0) {
      const fromDdb = await ddbBatchGet(uncachedIds);
      for (const [id, restaurants] of fromDdb) {
        stats.ddbHits++;
        c[id] = restaurants;
      }
    }
  }

  const results = await Promise.all(
    chargers.map(async (ch) => {
      try {
        const places = await getRestaurantsForCharger(ch.id, ch.location);
        return chargerSatisfiesBrands(places, brands) ? ch : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((ch): ch is Supercharger => ch !== null);
}
