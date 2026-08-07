import { describe, it, expect } from 'vitest';
import { buildRouteIndex, projectOntoRoute } from '../graph/projection.js';

// A north-south line at lng -120 from lat 34 to 35 (~111.2 km), vertices
// every 0.1° (~11 km, above the downsample threshold so all are kept).
function meridianRoute() {
  const points = [];
  for (let i = 0; i <= 10; i++) {
    points.push({ lat: 34 + i * 0.1, lng: -120 });
  }
  return buildRouteIndex(points);
}

describe('buildRouteIndex', () => {
  it('accumulates distances along the route', () => {
    const index = meridianRoute();
    expect(index.cumKm[0]).toBe(0);
    expect(index.totalKm).toBeCloseTo(111.2, 0);
    // Monotonically increasing.
    for (let i = 1; i < index.cumKm.length; i++) {
      expect(index.cumKm[i]!).toBeGreaterThan(index.cumKm[i - 1]!);
    }
  });

  it('downsamples dense vertices but keeps endpoints', () => {
    // Vertices every 0.001° (~110 m) — far below the ~1 km spacing.
    const dense = [];
    for (let i = 0; i <= 1000; i++) {
      dense.push({ lat: 34 + i * 0.001, lng: -120 });
    }
    const index = buildRouteIndex(dense);
    expect(index.points.length).toBeLessThan(150);
    expect(index.points[0]).toEqual(dense[0]);
    expect(index.points[index.points.length - 1]).toEqual(dense[dense.length - 1]);
    // Total length survives downsampling (straight line → identical).
    expect(index.totalKm).toBeCloseTo(111.2, 0);
  });
});

describe('projectOntoRoute', () => {
  const index = meridianRoute();

  it('projects an on-route point with ~zero offset', () => {
    const p = projectOntoRoute(index, { lat: 34.35, lng: -120 });
    expect(p.offsetKm).toBeCloseTo(0, 1);
    expect(p.distAlongKm).toBeCloseTo(index.totalKm * 0.35, 0);
  });

  it('measures perpendicular offset for an off-route point', () => {
    // 0.05° of longitude at lat 34.5 ≈ 4.6 km.
    const p = projectOntoRoute(index, { lat: 34.5, lng: -120.05 });
    expect(p.offsetKm).toBeCloseTo(4.6, 0);
    expect(p.distAlongKm).toBeCloseTo(index.totalKm * 0.5, 0);
  });

  it('clamps points beyond the route ends', () => {
    const before = projectOntoRoute(index, { lat: 33.8, lng: -120 });
    expect(before.distAlongKm).toBe(0);
    expect(before.offsetKm).toBeCloseTo(22.2, 0); // 0.2° lat

    const after = projectOntoRoute(index, { lat: 35.2, lng: -120 });
    expect(after.distAlongKm).toBeCloseTo(index.totalKm, 5);
    expect(after.offsetKm).toBeCloseTo(22.2, 0);
  });
});
