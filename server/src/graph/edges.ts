import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Supercharger } from '@volt/shared';
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

type Cache = Record<string, EdgeWeight>;
let cache: Cache | null = null;
let dirty = false;

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

export async function getEdgeWeight(
  a: Supercharger,
  b: Supercharger,
): Promise<EdgeWeight> {
  if (useHaversine()) return haversineEdge(a, b);

  const c = loadCache();
  const key = cacheKey(a.id, b.id);
  const hit = c[key];
  if (hit) return hit;

  const weight = await distanceMatrixEdge(a, b);
  c[key] = weight;
  dirty = true;
  return weight;
}
