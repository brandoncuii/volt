import { Router, Request, Response } from 'express';
import type { RouteRequest, ApiError } from '@volt/shared';
import { loadSuperchargers } from '../data/loader.js';
import { planRoute } from '../algo/aStar.js';

export const routeRouter = Router();

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

  return {
    start: b.start,
    end: b.end,
    vehicleRangeKm: b.vehicleRangeKm,
    startBatteryPct: b.startBatteryPct,
    minArrivalBatteryPct: b.minArrivalBatteryPct,
    ...(excludeChargerIds !== undefined && { excludeChargerIds }),
  };
}

routeRouter.post('/route', async (req: Request, res: Response) => {
  const parsed = validate(req.body);
  if (typeof parsed === 'string') {
    const err: ApiError = { error: 'invalid_request', details: parsed };
    return res.status(400).json(err);
  }

  try {
    const all = loadSuperchargers();
    const excluded = new Set(parsed.excludeChargerIds ?? []);
    const chargers = excluded.size === 0
      ? all
      : all.filter((c) => !excluded.has(c.id));
    const result = await planRoute(chargers, parsed);
    return res.json(result);
  } catch (e) {
    const err: ApiError = {
      error: 'route_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    return res.status(422).json(err);
  }
});
