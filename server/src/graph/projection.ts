import { haversineKm } from './haversine.js';

interface LatLng {
  lat: number;
  lng: number;
}

// A charger's position relative to the driving route: how far along the
// road it sits and how far off the road it is.
export interface Projection {
  distAlongKm: number;
  offsetKm: number;
}

export interface RouteIndex {
  points: LatLng[];
  cumKm: number[]; // cumulative distance at each vertex
  totalKm: number;
}

// Same spherical model as haversine.ts (R = 6371 km) so offsets and
// along-route distances agree.
const KM_PER_DEG = (Math.PI * 6371) / 180; // ≈ 111.19

// Projection cost is chargers × segments; ~1 km vertex spacing keeps the
// segment count low while chords stay close to the road.
const MIN_VERTEX_SPACING_KM = 1;

export function buildRouteIndex(points: LatLng[]): RouteIndex {
  const kept: LatLng[] = [points[0]!];
  let last = points[0]!;
  for (let i = 1; i < points.length - 1; i++) {
    if (haversineKm(last, points[i]!) >= MIN_VERTEX_SPACING_KM) {
      kept.push(points[i]!);
      last = points[i]!;
    }
  }
  if (points.length > 1) kept.push(points[points.length - 1]!);

  const cumKm: number[] = [0];
  for (let i = 1; i < kept.length; i++) {
    cumKm.push(cumKm[i - 1]! + haversineKm(kept[i - 1]!, kept[i]!));
  }
  return { points: kept, cumKm, totalKm: cumKm[cumKm.length - 1]! };
}

// Nearest point on the polyline, via per-segment equirectangular projection
// (accurate to well under 1% at corridor-scale offsets). Returns the
// cumulative distance along the route at that point and the perpendicular
// offset from it.
export function projectOntoRoute(index: RouteIndex, loc: LatLng): Projection {
  const pts = index.points;
  let bestOffset = Infinity;
  let bestDistAlong = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;

    // Cheap reject: latitude distance to the segment's lat band already
    // exceeds the best offset found so far.
    const minLat = a.lat < b.lat ? a.lat : b.lat;
    const maxLat = a.lat < b.lat ? b.lat : a.lat;
    const dLat =
      loc.lat < minLat ? minLat - loc.lat : loc.lat > maxLat ? loc.lat - maxLat : 0;
    if (dLat * KM_PER_DEG > bestOffset) continue;

    const kx = KM_PER_DEG * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * KM_PER_DEG;
    const px = (loc.lng - a.lng) * kx;
    const py = (loc.lat - a.lat) * KM_PER_DEG;

    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const dx = px - t * bx;
    const dy = py - t * by;
    const offset = Math.sqrt(dx * dx + dy * dy);

    if (offset < bestOffset) {
      bestOffset = offset;
      bestDistAlong = index.cumKm[i]! + t * (index.cumKm[i + 1]! - index.cumKm[i]!);
    }
  }
  return { distAlongKm: bestDistAlong, offsetKm: bestOffset };
}
