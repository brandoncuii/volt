/**
 * Piecewise-linear DC fast charging model.
 *
 * Each preset is an array of breakpoints sorted by maxSoC. The delivered
 * power is constant within each band and capped at the charger's rated
 * power.
 */

export interface ChargingSegment {
  maxSoC: number;   // upper SoC boundary of this band (%)
  powerKW: number;  // delivered power in this band (kW)
}

/**
 * Tesla V3 Supercharger curve (simplified piecewise-linear).
 *
 * | SoC band  | Delivered power |
 * |-----------|-----------------|
 * | 0–50 %    | 250 kW          |
 * | 50–80 %   | 120 kW          |
 * | 80–95 %   | 60 kW           |
 * | 95–100 %  | 30 kW           |
 */
export const teslaV3: ChargingSegment[] = [
  { maxSoC: 50,  powerKW: 250 },
  { maxSoC: 80,  powerKW: 120 },
  { maxSoC: 95,  powerKW: 60 },
  { maxSoC: 100, powerKW: 30 },
];

/**
 * Compute the time (in minutes) to charge from `fromPct` to `toPct` on a
 * charger rated at `chargerKW` with a battery of `batteryKWh` capacity.
 *
 * The delivered power in each SoC band is `Math.min(segment.powerKW, chargerKW)`.
 * Time is integrated analytically per band.
 *
 * @throws If `fromPct > toPct`.
 */
export function chargeTimeMin(
  fromPct: number,
  toPct: number,
  chargerKW: number,
  batteryKWh: number,
  curve: ChargingSegment[] = teslaV3,
): number {
  if (fromPct > toPct) {
    throw new Error(
      `fromPct (${fromPct}) must be <= toPct (${toPct})`,
    );
  }
  if (fromPct === toPct) return 0;

  let totalMinutes = 0;
  let bandStart = 0; // lower SoC boundary of the current segment

  for (const seg of curve) {
    const bandEnd = seg.maxSoC;

    // Overlap of [fromPct, toPct] with [bandStart, bandEnd]
    const overlapLow = Math.max(fromPct, bandStart);
    const overlapHigh = Math.min(toPct, bandEnd);

    if (overlapHigh > overlapLow) {
      const overlapPct = overlapHigh - overlapLow;
      const effectivePower = Math.min(seg.powerKW, chargerKW);
      // energy = (overlapPct / 100) * batteryKWh   [kWh]
      // time   = energy / effectivePower            [hours]
      // timeMin = time * 60                         [minutes]
      totalMinutes += (overlapPct / 100) * batteryKWh / effectivePower * 60;
    }

    bandStart = bandEnd;
  }

  return totalMinutes;
}
