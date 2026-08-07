import type { Supercharger } from '@volt/shared';
import type { EdgeWeight } from './edges.js';
import type { EdgeProvider } from '../algo/aStar.js';
import {
  projectOntoRoute,
  type Projection,
  type RouteIndex,
} from './projection.js';

// Edge weights from positions along the driving polyline: the road distance
// between two nodes is the gap in their along-route positions plus one
// off-route leg per endpoint (each stop is entered and left, so a charger
// offset by k km costs 2k km across its in- and out-edges). No API calls.
export function makePolylineEdgeProvider(
  index: RouteIndex,
  projections: Map<string, Projection>,
  avgSpeedKmh: number,
): EdgeProvider {
  const proj = (s: Supercharger): Projection => {
    let p = projections.get(s.id);
    if (!p) {
      // Virtual nodes (start/end/waypoints) land here on first use.
      p = projectOntoRoute(index, s.location);
      projections.set(s.id, p);
    }
    return p;
  };

  return (a: Supercharger, b: Supercharger): EdgeWeight => {
    const pa = proj(a);
    const pb = proj(b);
    const distanceKm =
      Math.abs(pb.distAlongKm - pa.distAlongKm) + pa.offsetKm + pb.offsetKm;
    return { distanceKm, drivingTimeMin: (distanceKm / avgSpeedKmh) * 60 };
  };
}
