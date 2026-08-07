import type { Supercharger } from '@volt/shared';
import { haversineKm } from './haversine.js';
import {
  projectOntoRoute,
  type Projection,
  type RouteIndex,
} from './projection.js';

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

// Chargers right along the highway; widened only where that leaves a gap.
const BASE_WIDTH_KM = 8;
const WIDEN_STEPS_KM = [25, 60];

// Route-first corridor: keep chargers within BASE_WIDTH_KM of the driving
// polyline. Where consecutive kept chargers (or an endpoint) are farther
// apart along the route than maxLegKm — sparse regions where the vehicle
// couldn't make the hop — progressively widen the corridor around that gap
// so off-route chargers become available (their offset penalizes them in
// the edge weights, so they're only chosen when needed).
//
// Fills `projections` with the along-route position of every kept charger
// for the polyline edge provider to reuse.
export function chargersAlongRoute(
  chargers: Supercharger[],
  index: RouteIndex,
  maxLegKm: number,
  projections: Map<string, Projection>,
): Supercharger[] {
  const projected = chargers.map((c) => ({
    c,
    p: projectOntoRoute(index, c.location),
  }));

  const kept = new Map<string, { c: Supercharger; p: Projection }>();
  for (const cp of projected) {
    if (cp.p.offsetKm <= BASE_WIDTH_KM) kept.set(cp.c.id, cp);
  }

  for (const width of WIDEN_STEPS_KM) {
    const gaps = findGaps(kept, index.totalKm, maxLegKm);
    if (gaps.length === 0) break;
    for (const cp of projected) {
      if (kept.has(cp.c.id) || cp.p.offsetKm > width) continue;
      const d = cp.p.distAlongKm;
      if (gaps.some((g) => d >= g.from - maxLegKm / 2 && d <= g.to + maxLegKm / 2)) {
        kept.set(cp.c.id, cp);
      }
    }
  }

  const out: Supercharger[] = [];
  for (const { c, p } of kept.values()) {
    projections.set(c.id, p);
    out.push(c);
  }
  return out;
}

// Stretches of route longer than maxLegKm with no kept charger. The route
// start (0) and end (totalKm) anchor the scan so gaps at either end count.
function findGaps(
  kept: Map<string, { c: Supercharger; p: Projection }>,
  totalKm: number,
  maxLegKm: number,
): { from: number; to: number }[] {
  const positions = [0, totalKm];
  for (const { p } of kept.values()) positions.push(p.distAlongKm);
  positions.sort((a, b) => a - b);

  const gaps: { from: number; to: number }[] = [];
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! - positions[i - 1]! > maxLegKm) {
      gaps.push({ from: positions[i - 1]!, to: positions[i]! });
    }
  }
  return gaps;
}
