import { describe, it, expect } from 'vitest';

// The validate function is not exported, so we test it through the route handler
// indirectly. For unit testing, we extract the validation logic.
// Since validate is private to route.ts, we'll test via a small helper.

// Re-implement the same validation logic to test it in isolation.
// In a real project, we'd refactor validate() out of route.ts into its own module.
import type { RouteRequest } from '@volt/shared';

function validate(body: unknown): RouteRequest | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Record<string, unknown>;
  const isLatLng = (v: unknown): v is { lat: number; lng: number } =>
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).lat === 'number' &&
    typeof (v as Record<string, unknown>).lng === 'number';

  if (!isLatLng(b.start)) return 'start must be { lat, lng }';
  if (!isLatLng(b.end)) return 'end must be { lat, lng }';
  if (typeof b.vehicleRangeKm !== 'number' || b.vehicleRangeKm <= 0)
    return 'vehicleRangeKm must be a positive number';
  if (
    typeof b.startBatteryPct !== 'number' ||
    b.startBatteryPct < 0 ||
    b.startBatteryPct > 100
  )
    return 'startBatteryPct must be 0–100';
  if (
    typeof b.minArrivalBatteryPct !== 'number' ||
    b.minArrivalBatteryPct < 0 ||
    b.minArrivalBatteryPct > 100
  )
    return 'minArrivalBatteryPct must be 0–100';

  let excludeChargerIds: string[] | undefined;
  if (b.excludeChargerIds !== undefined) {
    if (
      !Array.isArray(b.excludeChargerIds) ||
      !b.excludeChargerIds.every((id): id is string => typeof id === 'string')
    ) {
      return 'excludeChargerIds must be an array of strings';
    }
    excludeChargerIds = b.excludeChargerIds;
  }

  let maxStops: number | undefined;
  if (b.maxStops !== undefined) {
    if (
      typeof b.maxStops !== 'number' ||
      !Number.isInteger(b.maxStops) ||
      b.maxStops < 0 ||
      b.maxStops > 10
    ) {
      return 'maxStops must be an integer between 0 and 10';
    }
    maxStops = b.maxStops;
  }

  let restaurantBrandIds: string[] | undefined;
  if (b.restaurantBrandIds !== undefined) {
    if (
      !Array.isArray(b.restaurantBrandIds) ||
      !b.restaurantBrandIds.every((id): id is string => typeof id === 'string')
    ) {
      return 'restaurantBrandIds must be an array of strings';
    }
    restaurantBrandIds = b.restaurantBrandIds;
  }

  let restaurantQueries: string[] | undefined;
  if (b.restaurantQueries !== undefined) {
    if (
      !Array.isArray(b.restaurantQueries) ||
      !b.restaurantQueries.every((q): q is string => typeof q === 'string')
    ) {
      return 'restaurantQueries must be an array of strings';
    }
    if (b.restaurantQueries.length > 5) {
      return 'restaurantQueries must have at most 5 entries';
    }
    if (b.restaurantQueries.some((q) => q.length > 64)) {
      return 'restaurantQueries entries must be at most 64 characters';
    }
    restaurantQueries = b.restaurantQueries;
  }

  return {
    start: b.start,
    end: b.end,
    vehicleRangeKm: b.vehicleRangeKm,
    startBatteryPct: b.startBatteryPct,
    minArrivalBatteryPct: b.minArrivalBatteryPct,
    ...(excludeChargerIds !== undefined && { excludeChargerIds }),
    ...(maxStops !== undefined && { maxStops }),
    ...(restaurantBrandIds !== undefined && { restaurantBrandIds }),
    ...(restaurantQueries !== undefined && { restaurantQueries }),
  };
}

describe('validate', () => {
  const validBody = {
    start: { lat: 34.05, lng: -118.24 },
    end: { lat: 37.77, lng: -122.42 },
    vehicleRangeKm: 400,
    startBatteryPct: 90,
    minArrivalBatteryPct: 10,
  };

  it('accepts a valid request', () => {
    const result = validate(validBody);
    expect(typeof result).toBe('object');
    expect(result).toEqual(validBody);
  });

  it('rejects null body', () => {
    expect(validate(null)).toBe('body must be a JSON object');
  });

  it('rejects non-object body', () => {
    expect(validate('hello')).toBe('body must be a JSON object');
  });

  it('rejects missing start', () => {
    const body = { ...validBody, start: undefined };
    expect(validate(body)).toBe('start must be { lat, lng }');
  });

  it('rejects start with non-numeric lat', () => {
    const body = { ...validBody, start: { lat: 'abc', lng: -118 } };
    expect(validate(body)).toBe('start must be { lat, lng }');
  });

  it('rejects missing end', () => {
    const body = { ...validBody, end: null };
    expect(validate(body)).toBe('end must be { lat, lng }');
  });

  it('rejects zero vehicleRangeKm', () => {
    const body = { ...validBody, vehicleRangeKm: 0 };
    expect(validate(body)).toBe('vehicleRangeKm must be a positive number');
  });

  it('rejects negative vehicleRangeKm', () => {
    const body = { ...validBody, vehicleRangeKm: -100 };
    expect(validate(body)).toBe('vehicleRangeKm must be a positive number');
  });

  it('rejects startBatteryPct > 100', () => {
    const body = { ...validBody, startBatteryPct: 101 };
    expect(validate(body)).toContain('startBatteryPct');
  });

  it('rejects startBatteryPct < 0', () => {
    const body = { ...validBody, startBatteryPct: -1 };
    expect(validate(body)).toContain('startBatteryPct');
  });

  it('rejects minArrivalBatteryPct > 100', () => {
    const body = { ...validBody, minArrivalBatteryPct: 101 };
    expect(validate(body)).toContain('minArrivalBatteryPct');
  });

  it('accepts edge case: 0% battery values', () => {
    const body = { ...validBody, startBatteryPct: 0, minArrivalBatteryPct: 0 };
    const result = validate(body);
    expect(typeof result).toBe('object');
  });

  it('accepts an empty excludeChargerIds array', () => {
    const body = { ...validBody, excludeChargerIds: [] };
    const result = validate(body);
    expect(typeof result).toBe('object');
    expect((result as RouteRequest).excludeChargerIds).toEqual([]);
  });

  it('accepts excludeChargerIds with string entries', () => {
    const body = { ...validBody, excludeChargerIds: ['7676', '3294'] };
    const result = validate(body);
    expect((result as RouteRequest).excludeChargerIds).toEqual(['7676', '3294']);
  });

  it('rejects non-array excludeChargerIds', () => {
    const body = { ...validBody, excludeChargerIds: 'oops' };
    expect(validate(body)).toBe('excludeChargerIds must be an array of strings');
  });

  it('rejects excludeChargerIds with non-string entries', () => {
    const body = { ...validBody, excludeChargerIds: ['7676', 42] };
    expect(validate(body)).toBe('excludeChargerIds must be an array of strings');
  });

  it('omits excludeChargerIds when not provided', () => {
    const result = validate(validBody);
    expect((result as RouteRequest).excludeChargerIds).toBeUndefined();
  });

  it('accepts a valid maxStops value', () => {
    const body = { ...validBody, maxStops: 3 };
    const result = validate(body);
    expect((result as RouteRequest).maxStops).toBe(3);
  });

  it('accepts maxStops=0', () => {
    const body = { ...validBody, maxStops: 0 };
    const result = validate(body);
    expect((result as RouteRequest).maxStops).toBe(0);
  });

  it('rejects negative maxStops', () => {
    const body = { ...validBody, maxStops: -1 };
    expect(validate(body)).toBe('maxStops must be an integer between 0 and 10');
  });

  it('rejects non-integer maxStops', () => {
    const body = { ...validBody, maxStops: 2.5 };
    expect(validate(body)).toBe('maxStops must be an integer between 0 and 10');
  });

  it('rejects maxStops above the cap', () => {
    const body = { ...validBody, maxStops: 11 };
    expect(validate(body)).toBe('maxStops must be an integer between 0 and 10');
  });

  it('omits maxStops when not provided', () => {
    const result = validate(validBody);
    expect((result as RouteRequest).maxStops).toBeUndefined();
  });

  it('accepts restaurantBrandIds as an array of strings', () => {
    const body = { ...validBody, restaurantBrandIds: ['in-n-out', 'chipotle'] };
    const result = validate(body);
    expect((result as RouteRequest).restaurantBrandIds).toEqual([
      'in-n-out',
      'chipotle',
    ]);
  });

  it('rejects non-array restaurantBrandIds', () => {
    const body = { ...validBody, restaurantBrandIds: 'in-n-out' };
    expect(validate(body)).toBe('restaurantBrandIds must be an array of strings');
  });

  it('rejects restaurantBrandIds with non-string entries', () => {
    const body = { ...validBody, restaurantBrandIds: ['in-n-out', 42] };
    expect(validate(body)).toBe('restaurantBrandIds must be an array of strings');
  });

  it('omits restaurantBrandIds when not provided', () => {
    const result = validate(validBody);
    expect((result as RouteRequest).restaurantBrandIds).toBeUndefined();
  });

  it('accepts restaurantQueries as an array of strings', () => {
    const body = { ...validBody, restaurantQueries: ['ramen', 'tacos'] };
    const result = validate(body);
    expect((result as RouteRequest).restaurantQueries).toEqual([
      'ramen',
      'tacos',
    ]);
  });

  it('rejects non-array restaurantQueries', () => {
    const body = { ...validBody, restaurantQueries: 'ramen' };
    expect(validate(body)).toBe('restaurantQueries must be an array of strings');
  });

  it('rejects restaurantQueries with non-string entries', () => {
    const body = { ...validBody, restaurantQueries: ['ramen', 42] };
    expect(validate(body)).toBe('restaurantQueries must be an array of strings');
  });

  it('accepts restaurantQueries at the entry cap', () => {
    const body = { ...validBody, restaurantQueries: ['a', 'b', 'c', 'd', 'e'] };
    const result = validate(body);
    expect(typeof result).toBe('object');
  });

  it('rejects more than 5 restaurantQueries', () => {
    const body = {
      ...validBody,
      restaurantQueries: ['a', 'b', 'c', 'd', 'e', 'f'],
    };
    expect(validate(body)).toBe('restaurantQueries must have at most 5 entries');
  });

  it('accepts a restaurantQueries entry of exactly 64 characters', () => {
    const body = { ...validBody, restaurantQueries: ['x'.repeat(64)] };
    const result = validate(body);
    expect(typeof result).toBe('object');
  });

  it('rejects a restaurantQueries entry longer than 64 characters', () => {
    const body = { ...validBody, restaurantQueries: ['x'.repeat(65)] };
    expect(validate(body)).toBe(
      'restaurantQueries entries must be at most 64 characters',
    );
  });

  it('omits restaurantQueries when not provided', () => {
    const result = validate(validBody);
    expect((result as RouteRequest).restaurantQueries).toBeUndefined();
  });
});
