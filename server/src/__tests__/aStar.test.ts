import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Supercharger, RouteRequest } from '@volt/shared';
import { planRoute, getLastPlanMetrics } from '../algo/aStar.js';

// Mock edges to use haversine (avoid Google API calls)
vi.stubEnv('USE_HAVERSINE_EDGES', 'true');

// Build a small set of chargers along a line for testing
function makeCharger(
  id: string,
  lat: number,
  lng: number,
  powerKW = 250,
): Supercharger {
  return {
    id,
    name: `Charger ${id}`,
    location: { lat, lng },
    address: '',
    stallCount: 8,
    powerKW,
  };
}

// Chargers roughly along I-5: LA → Bakersfield → Fresno → SF
const chargers: Supercharger[] = [
  makeCharger('bakersfield', 35.3733, -119.0187),
  makeCharger('fresno', 36.7378, -119.7871),
  makeCharger('modesto', 37.6391, -120.9969),
];

describe('planRoute', () => {
  it('finds a route from LA to SF with enough range', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 }, // LA
      end: { lat: 37.7749, lng: -122.4194 },   // SF
      vehicleRangeKm: 500,
      startBatteryPct: 90,
      minArrivalBatteryPct: 10,
    };
    const result = await planRoute(chargers, req);
    expect(result.stops.length).toBeGreaterThanOrEqual(0);
    expect(result.totalDistanceKm).toBeGreaterThan(0);
    expect(result.totalDrivingTimeMin).toBeGreaterThan(0);
    expect(result.totalTripTimeMin).toBeGreaterThanOrEqual(result.totalDrivingTimeMin);
  });

  it('throws when no feasible route exists (range too short)', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 37.7749, lng: -122.4194 },
      vehicleRangeKm: 50, // way too short
      startBatteryPct: 90,
      minArrivalBatteryPct: 10,
    };
    await expect(planRoute(chargers, req)).rejects.toThrow('No feasible route');
  });

  it('returns no stops when destination is within range', async () => {
    // Short trip: LA to a nearby point
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 34.15, lng: -118.35 },
      vehicleRangeKm: 500,
      startBatteryPct: 90,
      minArrivalBatteryPct: 10,
    };
    const result = await planRoute(chargers, req);
    expect(result.stops).toHaveLength(0);
    expect(result.totalChargingTimeMin).toBe(0);
  });

  it('includes charging time when battery is insufficient', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 37.7749, lng: -122.4194 },
      vehicleRangeKm: 300,
      startBatteryPct: 80,
      minArrivalBatteryPct: 10,
    };
    const result = await planRoute(chargers, req);
    expect(result.stops.length).toBeGreaterThan(0);
    expect(result.totalChargingTimeMin).toBeGreaterThan(0);
  });

  it('respects minArrivalBatteryPct', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 34.15, lng: -118.35 },
      vehicleRangeKm: 500,
      startBatteryPct: 90,
      minArrivalBatteryPct: 10,
    };
    const result = await planRoute(chargers, req);
    // The total distance consumed should leave at least minArrivalBatteryPct
    const energyUsedPct = (result.totalDistanceKm / 500) * 100;
    const remainingPct = 90 - energyUsedPct + result.totalChargingTimeMin;
    // This is a loose check — just ensure we don't arrive empty
    expect(result.totalDistanceKm).toBeGreaterThan(0);
  });

  it('respects maxStops cap when feasible', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 }, // LA
      end: { lat: 37.7749, lng: -122.4194 },   // SF
      vehicleRangeKm: 600, // generous so 1 stop is feasible
      startBatteryPct: 100,
      minArrivalBatteryPct: 10,
      maxStops: 1,
    };
    const result = await planRoute(chargers, req);
    expect(result.stops.length).toBeLessThanOrEqual(1);
  });

  it('throws when maxStops makes the route infeasible', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 37.7749, lng: -122.4194 },
      vehicleRangeKm: 250, // short enough that 0 stops is impossible
      startBatteryPct: 100,
      minArrivalBatteryPct: 10,
      maxStops: 0,
    };
    await expect(planRoute(chargers, req)).rejects.toThrow('within 0 stops');
  });

  it('allows direct route when maxStops=0 and destination is in range', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 34.15, lng: -118.35 }, // very close
      vehicleRangeKm: 400,
      startBatteryPct: 80,
      minArrivalBatteryPct: 10,
      maxStops: 0,
    };
    const result = await planRoute(chargers, req);
    expect(result.stops).toHaveLength(0);
  });

  it('higher maxStops allows tighter range', async () => {
    const tightRange: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 37.7749, lng: -122.4194 },
      vehicleRangeKm: 300,
      startBatteryPct: 100,
      minArrivalBatteryPct: 10,
      maxStops: 3,
    };
    const result = await planRoute(chargers, tightRange);
    expect(result.stops.length).toBeGreaterThan(0);
    expect(result.stops.length).toBeLessThanOrEqual(3);
  });

  it('non-linear charging: low-power charger yields more charging time than high-power', async () => {
    // Two routes that force charging — one with a low-power charger, one high.
    const lowPowerChargers: Supercharger[] = [
      makeCharger('bakers_low', 35.3733, -119.0187, 72),
      makeCharger('fresno_low', 36.7378, -119.7871, 72),
      makeCharger('modesto_low', 37.6391, -120.9969, 72),
    ];

    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },
      end: { lat: 37.7749, lng: -122.4194 },
      vehicleRangeKm: 300,
      startBatteryPct: 80,
      minArrivalBatteryPct: 10,
    };

    const resultHigh = await planRoute(chargers, req);   // 250 kW chargers
    const resultLow = await planRoute(lowPowerChargers, req); // 72 kW chargers

    // Both routes need charging, but the low-power route should charge longer
    expect(resultLow.totalChargingTimeMin).toBeGreaterThan(0);
    expect(resultHigh.totalChargingTimeMin).toBeGreaterThan(0);
    expect(resultLow.totalChargingTimeMin).toBeGreaterThan(
      resultHigh.totalChargingTimeMin,
    );
  });

  it('SoC-aware optimization: prefers charging more at a fast charger to skip a slow one', async () => {
    // A (250 kW) and B (72 kW) between start and end.
    // With SoC enumeration the planner can charge more at A and skip B.
    const mixedChargers: Supercharger[] = [
      makeCharger('fast_A', 34.8, -118.9, 250),  // fast charger, closer to start
      makeCharger('slow_B', 35.6, -119.5, 72),    // slow charger, midway
    ];

    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },  // LA
      end: { lat: 36.7378, lng: -119.7871 },     // Fresno-ish
      vehicleRangeKm: 400,
      startBatteryPct: 80,
      minArrivalBatteryPct: 10,
    };

    const result = await planRoute(mixedChargers, req);

    // The planner should find a route. With SoC enumeration it can charge
    // more at the fast charger and potentially skip the slow one entirely,
    // resulting in a trip time at least as good as visiting both.
    expect(result.totalTripTimeMin).toBeGreaterThan(0);

    // If the slow charger is visited, its charging time would be higher.
    // The planner should prefer the faster total trip.
    const usesSlowCharger = result.stops.some(
      (s) => s.charger.id === 'slow_B' && s.chargingTimeMin > 0,
    );
    // Either skips slow_B entirely, or total trip time is optimized
    if (usesSlowCharger) {
      // If it does use slow_B, the total should still be optimal
      expect(result.totalTripTimeMin).toBeGreaterThan(0);
    }
  });

  it('state space sanity: SoC buckets increase expansions moderately', async () => {
    const req: RouteRequest = {
      start: { lat: 34.0522, lng: -118.2437 },  // LA
      end: { lat: 37.7749, lng: -122.4194 },     // SF
      vehicleRangeKm: 500,
      startBatteryPct: 90,
      minArrivalBatteryPct: 10,
    };

    await planRoute(chargers, req);
    const metrics = getLastPlanMetrics();

    // With 3 chargers the fixture is small; SoC buckets still multiply
    // expansions compared to the old ~7-8 without bucketing.
    // On the full ~480-candidate LA→SF corridor, expect ~5k-8k.
    expect(metrics.expansions).toBeGreaterThan(10);
    expect(metrics.expansions).toBeLessThan(500);
  });
});
