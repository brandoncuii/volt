import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { decodePolyline } from '@volt/shared';

interface LatLng {
  lat: number;
  lng: number;
}

export interface RoutePolyline {
  encoded: string;
  points: LatLng[];
  distanceKm: number;
  drivingTimeMin: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, '..', 'data', 'polyline-cache.json');

// Snap endpoints to a ~2 km grid so nearby origins/destinations share a
// cache entry ("downtown Portland → LA" variants hit the same polyline).
const SNAP_DEG = 0.02;

// Road geometry changes slowly — 30 days keeps entries fresh enough.
const TTL_SECONDS = 30 * 24 * 60 * 60;

// Route-first planning is on by default; set USE_ROUTE_POLYLINE=false to
// force the ellipse-corridor + haversine-edge fallback.
export const useRoutePolyline = (): boolean =>
  process.env.USE_ROUTE_POLYLINE !== 'false';

const ddbTableName = (): string | undefined => process.env.POLYLINE_CACHE_TABLE;

let ddbClient: DynamoDBClient | null = null;
function getDdb(): DynamoDBClient {
  if (!ddbClient) ddbClient = new DynamoDBClient({});
  return ddbClient;
}

// Persisted shape: the encoded polyline is stored, points are decoded on read.
interface CacheEntry {
  e: string; // encoded polyline
  d: number; // distanceKm
  t: number; // drivingTimeMin
}

type Cache = Record<string, CacheEntry>;
let fileCache: Cache | null = null;
let dirty = false;
const memCache = new Map<string, RoutePolyline>();

let stats = { memHits: 0, ddbHits: 0, misses: 0 };
export function resetPolylineStats(): void {
  stats = { memHits: 0, ddbHits: 0, misses: 0 };
}
export function getPolylineStats(): {
  memHits: number;
  ddbHits: number;
  misses: number;
} {
  return stats;
}

function loadFileCache(): Cache {
  if (fileCache) return fileCache;
  if (existsSync(CACHE_PATH)) {
    fileCache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache;
  } else {
    fileCache = {};
  }
  return fileCache;
}

export function flushPolylineCache(): void {
  if (!dirty || !fileCache) return;
  writeFileSync(CACHE_PATH, JSON.stringify(fileCache));
  dirty = false;
}

export function polylineCacheKey(points: LatLng[]): string {
  const snap = (v: number) => (Math.round(v / SNAP_DEG) * SNAP_DEG).toFixed(2);
  return `route#${points.map((p) => `${snap(p.lat)},${snap(p.lng)}`).join('|')}`;
}

function fromEntry(entry: CacheEntry): RoutePolyline {
  return {
    encoded: entry.e,
    points: decodePolyline(entry.e),
    distanceKm: entry.d,
    drivingTimeMin: entry.t,
  };
}

async function fetchFromGoogle(points: LatLng[]): Promise<RoutePolyline> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY not set — either set it or run with USE_ROUTE_POLYLINE=false',
    );
  }
  const toWp = (p: LatLng) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  });
  const body = {
    origin: toWp(points[0]!),
    destination: toWp(points[points.length - 1]!),
    ...(points.length > 2 && {
      intermediates: points.slice(1, -1).map(toWp),
    }),
    travelMode: 'DRIVE',
    // TRAFFIC_UNAWARE with ≤10 intermediates keeps every call on the cheaper
    // Compute Routes Essentials SKU.
    routingPreference: 'TRAFFIC_UNAWARE',
  };

  const res = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Routes API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    routes?: {
      polyline?: { encodedPolyline?: string };
      distanceMeters?: number;
      duration?: string; // e.g. "12345s"
    }[];
  };
  const route = json.routes?.[0];
  if (!route?.polyline?.encodedPolyline || !route.distanceMeters || !route.duration) {
    throw new Error('Routes API returned no route');
  }
  const encoded = route.polyline.encodedPolyline;
  return {
    encoded,
    points: decodePolyline(encoded),
    distanceKm: route.distanceMeters / 1000,
    drivingTimeMin: parseFloat(route.duration) / 60,
  };
}

async function ddbGet(key: string): Promise<CacheEntry | null> {
  const result = await getDdb().send(
    new GetItemCommand({
      TableName: ddbTableName(),
      Key: { pk: { S: key } },
    }),
  );
  if (!result.Item?.data?.S) return null;
  return JSON.parse(result.Item.data.S) as CacheEntry;
}

async function ddbPut(key: string, entry: CacheEntry): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await getDdb().send(
    new PutItemCommand({
      TableName: ddbTableName(),
      Item: {
        pk: { S: key },
        data: { S: JSON.stringify(entry) },
        ttl: { N: String(ttl) },
      },
    }),
  );
}

// One driving polyline for start → waypoints → end. Three-tier lookup:
// in-memory → DynamoDB (Lambda) or JSON file (local) → Routes API.
export async function getRoutePolyline(points: LatLng[]): Promise<RoutePolyline> {
  const key = polylineCacheKey(points);

  const memHit = memCache.get(key);
  if (memHit) {
    stats.memHits++;
    return memHit;
  }

  if (ddbTableName()) {
    const hit = await ddbGet(key);
    if (hit) {
      stats.ddbHits++;
      const route = fromEntry(hit);
      memCache.set(key, route);
      return route;
    }
  } else {
    const c = loadFileCache();
    const hit = c[key];
    if (hit) {
      stats.ddbHits++;
      const route = fromEntry(hit);
      memCache.set(key, route);
      return route;
    }
  }

  stats.misses++;
  const route = await fetchFromGoogle(points);
  memCache.set(key, route);
  const entry: CacheEntry = {
    e: route.encoded,
    d: route.distanceKm,
    t: route.drivingTimeMin,
  };
  if (ddbTableName()) {
    await ddbPut(key, entry);
  } else {
    loadFileCache()[key] = entry;
    dirty = true;
  }
  return route;
}
