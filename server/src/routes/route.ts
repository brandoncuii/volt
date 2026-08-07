import { Router, Request, Response } from 'express';
import type { RouteRequest, ApiError, Supercharger } from '@volt/shared';
import { findBrand, type Brand } from '@volt/shared';
import { loadSuperchargers } from '../data/loader.js';
import {
  planRoute,
  getLastPlanMetrics,
  RANGE_PREFILTER_FACTOR,
  type PlanOptions,
} from '../algo/aStar.js';
import { chargersInCorridor, chargersAlongRoute } from '../graph/corridor.js';
import {
  filterChargersByBrand,
  flushPlacesCache,
  getPlacesStats,
  resetPlacesStats,
} from '../places/placesClient.js';
import { getEdgeStats, resetEdgeStats } from '../graph/edges.js';
import {
  getRoutePolyline,
  useRoutePolyline,
  flushPolylineCache,
  getPolylineStats,
  resetPolylineStats,
} from '../graph/routePolyline.js';
import { buildRouteIndex, type Projection } from '../graph/projection.js';
import { makePolylineEdgeProvider } from '../graph/polylineEdges.js';

export const routeRouter = Router();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  let waypoints: { lat: number; lng: number }[] | undefined;
  if (b.waypoints !== undefined) {
    if (!Array.isArray(b.waypoints) || !b.waypoints.every(isLatLng)) {
      return 'waypoints must be an array of { lat, lng }';
    }
    if (b.waypoints.length > 5) {
      return 'waypoints must have at most 5 entries';
    }
    waypoints = b.waypoints;
  }
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

  let minimizeStops: boolean | undefined;
  if (b.minimizeStops !== undefined) {
    if (typeof b.minimizeStops !== 'boolean') {
      return 'minimizeStops must be a boolean';
    }
    minimizeStops = b.minimizeStops;
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
    ...(waypoints !== undefined && { waypoints }),
    ...(excludeChargerIds !== undefined && { excludeChargerIds }),
    ...(maxStops !== undefined && { maxStops }),
    ...(minimizeStops !== undefined && { minimizeStops }),
    ...(restaurantBrandIds !== undefined && { restaurantBrandIds }),
    ...(restaurantQueries !== undefined && { restaurantQueries }),
  };
}

routeRouter.post('/route', async (req: Request, res: Response) => {
  const parsed = validate(req.body);
  if (typeof parsed === 'string') {
    const err: ApiError = { error: 'invalid_request', details: parsed };
    return res.status(400).json(err);
  }

  resetEdgeStats();
  resetPlacesStats();
  resetPolylineStats();
  const t0 = performance.now();

  try {
    const all = loadSuperchargers();
    const excluded = new Set(parsed.excludeChargerIds ?? []);
    let chargers = excluded.size === 0
      ? all
      : all.filter((c) => !excluded.has(c.id));

    // With waypoints the candidate set is the union of each leg's corridor,
    // so chargers near a detour aren't dropped. No waypoints → single ellipse.
    const points = [parsed.start, ...(parsed.waypoints ?? []), parsed.end];
    const unionCorridor = (
      src: Supercharger[],
      factor?: number,
    ): Supercharger[] => {
      if (points.length === 2) {
        return chargersInCorridor(src, points[0]!, points[1]!, factor);
      }
      const seen = new Set<string>();
      const out: Supercharger[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        for (const c of chargersInCorridor(src, points[i]!, points[i + 1]!, factor)) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            out.push(c);
          }
        }
      }
      return out;
    };

    const totalChargers = chargers.length;
    chargers = unionCorridor(chargers, 1.4);
    const corridorSize = chargers.length;

    // Route-first refinement: fetch the actual driving polyline (one cached
    // Routes API call), keep only chargers near the road, and derive edge
    // weights from distance along it. The ellipse above stays as a cheap
    // prefilter so projection only runs on plausible candidates. Any failure
    // (missing key, quota, outage) falls back to the ellipse + haversine path.
    let planOpts: PlanOptions | undefined;
    let encodedPolyline: string | undefined;
    if (useRoutePolyline()) {
      try {
        const route = await getRoutePolyline(points);
        flushPolylineCache();
        const index = buildRouteIndex(route.points);
        const projections = new Map<string, Projection>();
        chargers = chargersAlongRoute(
          chargers,
          index,
          parsed.vehicleRangeKm * RANGE_PREFILTER_FACTOR,
          projections,
        );
        const avgSpeedKmh = route.distanceKm / (route.drivingTimeMin / 60);
        planOpts = {
          edgeProvider: makePolylineEdgeProvider(index, projections, avgSpeedKmh),
          avgSpeedKmh,
        };
        encodedPolyline = route.encoded;
      } catch (e) {
        console.warn(
          `[route] polyline unavailable, falling back to ellipse corridor: ` +
          `${e instanceof Error ? e.message : e}`,
        );
      }
    }

    const brandFilters: Brand[] = [
      ...(parsed.restaurantBrandIds ?? [])
        .map((id) => findBrand(id))
        .filter((b): b is Brand => b !== undefined),
      ...(parsed.restaurantQueries ?? [])
        .map((q) => q.trim())
        .filter((q) => q.length > 0)
        .map((q) => ({
          id: `q:${q.toLowerCase()}`,
          name: q,
          pattern: new RegExp(escapeRegExp(q), 'i'),
        })),
    ];
    if (brandFilters.length > 0) {
      // The polyline corridor is already tighter than the brand ellipse.
      const corridor = planOpts ? chargers : unionCorridor(chargers);
      chargers = await filterChargersByBrand(corridor, brandFilters);
      flushPlacesCache();
    }

    const result = await planRoute(chargers, parsed, planOpts);
    if (encodedPolyline) result.encodedPolyline = encodedPolyline;
    const ms = performance.now() - t0;
    const pm = getLastPlanMetrics();
    const es = getEdgeStats();
    const ps = getPlacesStats();
    const ys = getPolylineStats();
    console.log(
      `[route] all=${totalChargers} corridor=${corridorSize} candidates=${pm.candidates} ` +
      `expansions=${pm.expansions} stops=${result.stops.length} ` +
      `edges(hit/miss/haversine)=${es.hits}/${es.misses}/${es.haversineCalls} ` +
      `places(mem/ddb/miss)=${ps.memHits}/${ps.ddbHits}/${ps.misses} ` +
      `polyline(mem/ddb/miss)=${ys.memHits}/${ys.ddbHits}/${ys.misses} ` +
      `t=${ms.toFixed(0)}ms`,
    );
    return res.json(result);
  } catch (e) {
    const err: ApiError = {
      error: 'route_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    return res.status(422).json(err);
  }
});
