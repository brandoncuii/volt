import { describe, it, expect } from 'vitest';
import { haversineKm } from '../graph/haversine.js';

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    const p = { lat: 34.0522, lng: -118.2437 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it('computes LA to SF within expected range (~559 km)', () => {
    const la = { lat: 34.0522, lng: -118.2437 };
    const sf = { lat: 37.7749, lng: -122.4194 };
    const dist = haversineKm(la, sf);
    expect(dist).toBeGreaterThan(540);
    expect(dist).toBeLessThan(580);
  });

  it('computes NY to London within expected range (~5,570 km)', () => {
    const ny = { lat: 40.7128, lng: -74.006 };
    const london = { lat: 51.5074, lng: -0.1278 };
    const dist = haversineKm(ny, london);
    expect(dist).toBeGreaterThan(5500);
    expect(dist).toBeLessThan(5650);
  });

  it('is symmetric', () => {
    const a = { lat: 34.0522, lng: -118.2437 };
    const b = { lat: 37.7749, lng: -122.4194 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});
