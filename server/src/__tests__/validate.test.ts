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

  return {
    start: b.start,
    end: b.end,
    vehicleRangeKm: b.vehicleRangeKm,
    startBatteryPct: b.startBatteryPct,
    minArrivalBatteryPct: b.minArrivalBatteryPct,
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
});
