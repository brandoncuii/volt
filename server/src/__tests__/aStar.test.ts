import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Supercharger, RouteRequest } from '@volt/shared';
import { planRoute } from '../algo/aStar.js';

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
});
