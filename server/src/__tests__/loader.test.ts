import { describe, it, expect } from 'vitest';
import { loadSuperchargers } from '../data/loader.js';

describe('loadSuperchargers', () => {
  it('returns a non-empty array', () => {
    const chargers = loadSuperchargers();
    expect(chargers.length).toBeGreaterThan(0);
  });

  it('only includes US chargers with valid GPS', () => {
    const chargers = loadSuperchargers();
    for (const c of chargers) {
      expect(typeof c.location.lat).toBe('number');
      expect(typeof c.location.lng).toBe('number');
      expect(c.location.lat).not.toBeNaN();
      expect(c.location.lng).not.toBeNaN();
    }
  });

  it('maps fields correctly', () => {
    const chargers = loadSuperchargers();
    const first = chargers[0]!;
    expect(typeof first.id).toBe('string');
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.stallCount).toBe('number');
    expect(typeof first.powerKW).toBe('number');
    expect(first.powerKW).toBeGreaterThan(0);
  });

  it('returns the same cached reference on repeated calls', () => {
    const a = loadSuperchargers();
    const b = loadSuperchargers();
    expect(a).toBe(b);
  });
});
