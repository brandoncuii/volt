import { describe, it, expect } from 'vitest';
import type { Supercharger, RouteRequest } from '@volt/shared';
import { buildRouteIndex, type Projection } from '../graph/projection.js';
import { chargersAlongRoute } from '../graph/corridor.js';
import { makePolylineEdgeProvider } from '../graph/polylineEdges.js';
import { planRoute } from '../algo/aStar.js';

function makeCharger(id: string, lat: number, lng: number): Supercharger {
  return {
    id,
    name: `Charger ${id}`,
    location: { lat, lng },
    address: '',
    stallCount: 8,
    powerKW: 250,
  };
}

// Straight north-south route at lng -120 starting at lat 34, ~398 km long.
function straightRoute() {
  const points = [];
  for (let i = 0; i <= 72; i++) {
    points.push({ lat: 34 + i * 0.05, lng: -120 });
  }
  return buildRouteIndex(points);
}

// L-shaped route: east along lat 34 from lng -118 to -116, then north to
// lat 36. A straight-line planner would cut the diagonal; the road doesn't.
function lRoute() {
  const points = [];
  for (let i = 0; i <= 40; i++) {
    points.push({ lat: 34, lng: -118 + i * 0.05 });
  }
  for (let i = 1; i <= 40; i++) {
    points.push({ lat: 34 + i * 0.05, lng: -116 });
  }
  return buildRouteIndex(points);
}

describe('chargersAlongRoute', () => {
  it('keeps on-route chargers and drops off-route ones when coverage is dense', () => {
    const index = straightRoute();
    const chargers = [
      makeCharger('on-80', 34.723, -120),
      makeCharger('on-160', 35.447, -120),
      makeCharger('on-240', 36.17, -120),
      makeCharger('on-320', 36.894, -120),
      makeCharger('off-18km', 36.261, -120.2), // ~18 km off the road
    ];
    const projections = new Map<string, Projection>();
    const kept = chargersAlongRoute(chargers, index, 120, projections);
    const ids = kept.map((c) => c.id).sort();
    expect(ids).toEqual(['on-160', 'on-240', 'on-320', 'on-80']);
    expect(projections.size).toBe(4);
    expect(projections.get('on-80')!.distAlongKm).toBeCloseTo(80, 0);
    expect(projections.get('on-80')!.offsetKm).toBeCloseTo(0, 1);
  });

  it('widens the corridor around coverage gaps', () => {
    const index = straightRoute();
    const chargers = [
      makeCharger('near', 34.904, -120.01), // ~100 km along, ~1 km off
      makeCharger('far', 36.261, -120.2), // ~250 km along, ~18 km off
    ];
    const projections = new Map<string, Projection>();
    // Max leg 120 km: without 'far' there's a 298 km gap from 'near' to the
    // end, so the corridor must widen to admit it.
    const kept = chargersAlongRoute(chargers, index, 120, projections);
    const ids = kept.map((c) => c.id).sort();
    expect(ids).toEqual(['far', 'near']);
  });

  it('does not widen when the vehicle can bridge the gap', () => {
    const index = straightRoute();
    const chargers = [
      makeCharger('near', 34.904, -120.01),
      makeCharger('far', 36.261, -120.2),
    ];
    const projections = new Map<string, Projection>();
    // Max leg 300 km: 'near' at 100 km covers 0→100→398, no gap → 'far' stays out.
    const kept = chargersAlongRoute(chargers, index, 300, projections);
    expect(kept.map((c) => c.id)).toEqual(['near']);
  });
});

describe('makePolylineEdgeProvider', () => {
  it('derives edge weights from distance along the route plus offsets', async () => {
    const index = lRoute();
    const projections = new Map<string, Projection>();
    const provider = makePolylineEdgeProvider(index, projections, 100);

    // Both on the east leg, 1° of longitude apart (~92 km of road).
    const a = makeCharger('a', 34, -117.5);
    const b = makeCharger('b', 34, -116.5);
    const edge = await provider(a, b);
    expect(edge.distanceKm).toBeCloseTo(92.3, 0);
    expect(edge.drivingTimeMin).toBeCloseTo((92.3 / 100) * 60, 0);

    // Across the corner: road distance, not the straight diagonal.
    const east = makeCharger('east', 34, -117);
    const north = makeCharger('north', 35, -116);
    const cornerEdge = await provider(east, north);
    // ~92 km to the corner + ~111 km up ≈ 203 km; straight line is ~144 km.
    expect(cornerEdge.distanceKm).toBeGreaterThan(195);
    expect(cornerEdge.distanceKm).toBeLessThan(210);
  });

  it('penalizes off-route chargers by their offset', async () => {
    const index = lRoute();
    const provider = makePolylineEdgeProvider(index, new Map(), 100);
    const onRoute = makeCharger('on', 34, -117);
    const offRoute = makeCharger('off', 34.1, -117); // ~11 km north of the road
    const edge = await provider(onRoute, offRoute);
    expect(edge.distanceKm).toBeCloseTo(11.1, 0);
  });
});

describe('planRoute with polyline edges', () => {
  it('follows the road around the corner instead of the straight line', async () => {
    const index = lRoute();
    const chargers = [
      makeCharger('mid-east', 34, -117),
      makeCharger('corner', 34, -116),
      makeCharger('mid-north', 35, -116),
    ];
    const projections = new Map<string, Projection>();
    const kept = chargersAlongRoute(chargers, index, 270, projections);
    expect(kept).toHaveLength(3);

    const req: RouteRequest = {
      start: { lat: 34, lng: -118 },
      end: { lat: 36, lng: -116 },
      vehicleRangeKm: 300,
      startBatteryPct: 90,
      minArrivalBatteryPct: 10,
    };
    const result = await planRoute(kept, req, {
      edgeProvider: makePolylineEdgeProvider(index, projections, 100),
      avgSpeedKmh: 100,
    });

    // Total distance reflects the L-shaped road (~406 km), not the ~287 km
    // diagonal a straight-line model would assume.
    expect(result.totalDistanceKm).toBeGreaterThan(index.totalKm - 2);
    expect(result.totalDistanceKm).toBeLessThan(index.totalKm + 30);
    expect(result.stops.length).toBeGreaterThan(0);
  });
});
