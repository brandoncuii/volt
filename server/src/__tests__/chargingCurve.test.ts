import { describe, it, expect } from 'vitest';
import { chargeTimeMin, teslaV3 } from '../algo/chargingCurve.js';

describe('chargeTimeMin', () => {
  const batteryKWh = 75;
  const v3KW = 250;

  it('returns 0 when fromPct === toPct', () => {
    expect(chargeTimeMin(50, 50, v3KW, batteryKWh)).toBe(0);
  });

  it('throws when fromPct > toPct', () => {
    expect(() => chargeTimeMin(80, 50, v3KW, batteryKWh)).toThrow();
  });

  it('is monotonic: 10→80 < 10→95', () => {
    const t1 = chargeTimeMin(10, 80, v3KW, batteryKWh);
    const t2 = chargeTimeMin(10, 95, v3KW, batteryKWh);
    expect(t2).toBeGreaterThan(t1);
  });

  it('80→100 takes roughly as long as 10→80 (ratio 0.7–1.5)', () => {
    const low = chargeTimeMin(10, 80, v3KW, batteryKWh);
    const high = chargeTimeMin(80, 100, v3KW, batteryKWh);
    const ratio = high / low;
    expect(ratio).toBeGreaterThanOrEqual(0.7);
    expect(ratio).toBeLessThanOrEqual(1.5);
  });

  it('caps at charger rated power — 150 kW charger is slower than 250 kW for 10→50', () => {
    const slow = chargeTimeMin(10, 50, 150, batteryKWh);
    const fast = chargeTimeMin(10, 50, 250, batteryKWh);
    expect(slow).toBeGreaterThan(fast);
  });

  it('accepts the teslaV3 preset explicitly', () => {
    const t = chargeTimeMin(0, 100, v3KW, batteryKWh, teslaV3);
    expect(t).toBeGreaterThan(0);
  });
});
