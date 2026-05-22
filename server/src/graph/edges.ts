import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Supercharger } from '@volt/shared';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { haversineKm } from './haversine.js';

export interface EdgeWeight {
  distanceKm: number;
  drivingTimeMin: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, '..', 'data', 'edge-cache.json');

// Haversine straight-line under-counts driving distance; this factor
// approximates real-road overhead. 88 km/h is a rough US highway average.
const DETOUR_FACTOR = 1.2;
const AVG_SPEED_KMH = 88;

const useHaversine = (): boolean =>
  process.env.USE_HAVERSINE_EDGES !== 'false';

// In Lambda the JSON file cache won't persist between invocations, so the
// CDK stack injects EDGE_CACHE_TABLE pointing at a DynamoDB table. Unset
// locally → fall back to the file cache.
const ddbTableName = (): string | undefined => process.env.EDGE_CACHE_TABLE;

let ddbClient: DynamoDBClient | null = null;
function getDdb(): DynamoDBClient {
  if (!ddbClient) ddbClient = new DynamoDBClient({});
  return ddbClient;
}

type Cache = Record<string, EdgeWeight>;
let cache: Cache | null = null;
let dirty = false;

// Per-request stats. Reset by the route handler, read after planRoute.
let stats = { hits: 0, misses: 0, haversineCalls: 0 };
export function resetEdgeStats(): void {
  stats = { hits: 0, misses: 0, haversineCalls: 0 };
}
export function getEdgeStats(): { hits: number; misses: number; haversineCalls: number } {
  return stats;
}

function loadCache(): Cache {
  if (cache) return cache;
  if (existsSync(CACHE_PATH)) {
    cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache;
  } else {
    cache = {};
  }
  return cache;
}

function cacheKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

export function flushEdgeCache(): void {
  if (!dirty || !cache) return;
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  dirty = false;
}

function haversineEdge(a: Supercharger, b: Supercharger): EdgeWeight {
  const straight = haversineKm(a.location, b.location);
  const distanceKm = straight * DETOUR_FACTOR;
  const drivingTimeMin = (distanceKm / AVG_SPEED_KMH) * 60;
  return { distanceKm, drivingTimeMin };
}

async function distanceMatrixEdge(
  a: Supercharger,
  b: Supercharger,
): Promise<EdgeWeight> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY not set — either set it or run with USE_HAVERSINE_EDGES=true',
    );
  }
  const origin = `${a.location.lat},${a.location.lng}`;
  const dest = `${b.location.lat},${b.location.lng}`;
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin}&destinations=${dest}&units=metric&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Distance Matrix HTTP ${res.status}`);
  const json = (await res.json()) as {
    rows: { elements: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[];
  };
  const el = json.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK' || !el.distance || !el.duration) {
    throw new Error(`Distance Matrix no result: ${el?.status ?? 'unknown'}`);
  }
  return {
    distanceKm: el.distance.value / 1000,
    drivingTimeMin: el.duration.value / 60,
  };
}

async function ddbGet(key: string): Promise<EdgeWeight | null> {
  const result = await getDdb().send(
    new GetItemCommand({
      TableName: ddbTableName(),
      Key: { pk: { S: key } },
    }),
  );
  if (!result.Item) return null;
  return {
    distanceKm: Number(result.Item.distanceKm?.N ?? '0'),
    drivingTimeMin: Number(result.Item.drivingTimeMin?.N ?? '0'),
  };
}

async function ddbPut(key: string, w: EdgeWeight): Promise<void> {
  await getDdb().send(
    new PutItemCommand({
      TableName: ddbTableName(),
      Item: {
        pk: { S: key },
        distanceKm: { N: String(w.distanceKm) },
        drivingTimeMin: { N: String(w.drivingTimeMin) },
      },
    }),
  );
}

export async function getEdgeWeight(
  a: Supercharger,
  b: Supercharger,
): Promise<EdgeWeight> {
  if (useHaversine()) {
    stats.haversineCalls++;
    return haversineEdge(a, b);
  }

  const key = cacheKey(a.id, b.id);

  if (ddbTableName()) {
    const hit = await ddbGet(key);
    if (hit) {
      stats.hits++;
      return hit;
    }
    stats.misses++;
    const weight = await distanceMatrixEdge(a, b);
    await ddbPut(key, weight);
    return weight;
  }

  const c = loadCache();
  const hit = c[key];
  if (hit) {
    stats.hits++;
    return hit;
  }

  stats.misses++;
  const weight = await distanceMatrixEdge(a, b);
  c[key] = weight;
  dirty = true;
  return weight;
}
