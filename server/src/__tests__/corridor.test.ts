import { describe, it, expect } from 'vitest';
import type { Supercharger } from '@volt/shared';
import { chargersInCorridor } from '../graph/corridor.js';

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

describe('chargersInCorridor', () => {
  // Roughly SF -> LA
  const start = { lat: 37.7749, lng: -122.4194 };
  const end = { lat: 34.0522, lng: -118.2437 };

  it('includes a charger near the midpoint of start and end', () => {
    // Kettleman City is essentially on the I-5 line between SF and LA
    const kettleman = makeCharger('kettleman', 35.9876, -119.9623);
    const result = chargersInCorridor([kettleman], start, end);
    expect(result).toContain(kettleman);
  });

  it('excludes a charger far off the great-circle line', () => {
    // Lake Tahoe — well north and east of the SF-LA line
    const tahoe = makeCharger('tahoe', 39.0968, -120.0324);
    const result = chargersInCorridor([tahoe], start, end);
    expect(result).not.toContain(tahoe);
  });

  it('includes both endpoints as eligible chargers', () => {
    const nearStart = makeCharger('near-start', 37.78, -122.42);
    const nearEnd = makeCharger('near-end', 34.06, -118.25);
    const result = chargersInCorridor([nearStart, nearEnd], start, end);
    expect(result).toContain(nearStart);
    expect(result).toContain(nearEnd);
  });

  it('tighter factor excludes more chargers than looser factor', () => {
    // Sample a grid of chargers around CA and confirm tighter ellipse never
    // includes more than the looser one.
    const grid: Supercharger[] = [];
    for (let lat = 33; lat <= 39; lat++) {
      for (let lng = -123; lng <= -117; lng++) {
        grid.push(makeCharger(`${lat},${lng}`, lat, lng));
      }
    }
    const loose = chargersInCorridor(grid, start, end, 1.5);
    const tight = chargersInCorridor(grid, start, end, 1.05);
    expect(tight.length).toBeLessThan(loose.length);
    // Every tight match is also a loose match.
    const looseIds = new Set(loose.map((c) => c.id));
    for (const c of tight) expect(looseIds.has(c.id)).toBe(true);
  });
});
