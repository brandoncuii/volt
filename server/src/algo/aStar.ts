import type {
  Supercharger,
  RouteRequest,
  RouteResponse,
  RouteStop,
} from '@volt/shared';
import { haversineKm } from '../graph/haversine.js';
import { chargeTimeMin } from './chargingCurve.js';
import { getEdgeWeight, flushEdgeCache } from '../graph/edges.js';
import { MinHeap } from './heap.js';

// Tesla-ish efficiency: ~155 Wh/km → batteryCapacityKWh = rangeKm * 0.155.
const EFFICIENCY_KWH_PER_KM = 0.155;
const SAFETY_BUFFER_PCT = 10; // min arrival battery at intermediate stops
const AVG_SPEED_KMH = 88; // for the A* heuristic
const RANGE_PREFILTER_FACTOR = 0.9; // skip edges Haversine-close to the range limit
const SOC_BUCKET_SIZE = 5; // 5% granularity → 20 buckets
const MAX_DEPARTURE_SOC = 95; // charging above 95% is extremely slow

const START_ID = '__start__';
const END_ID = '__end__';
const WP_PREFIX = '__wp__'; // waypoint node ids: __wp__0, __wp__1, …

// Start and waypoints can't charge: start is the driver's origin, a waypoint
// is a destination they pass through (not a charger).
function canCharge(id: string): boolean {
  return id !== START_ID && id !== END_ID && !id.startsWith(WP_PREFIX);
}

interface EdgeRecord {
  prevKey: string;
  distanceKm: number;
  drivingTimeMin: number;
  arrivalBatteryPct: number;
  chargingTimeAtPrevMin: number;
  departureBatteryFromPrevPct: number;
}

function socBucket(pct: number): number {
  return Math.floor(pct / SOC_BUCKET_SIZE) * SOC_BUCKET_SIZE;
}

function makeKey(
  id: string,
  stopCount: number,
  soc: number,
  wpIndex: number,
): string {
  return `${id}#${stopCount}#${socBucket(soc)}#${wpIndex}`;
}

export interface PlanMetrics {
  expansions: number;        // unique states popped from the heap
  candidates: number;        // chargers passed in to planRoute
}

let lastMetrics: PlanMetrics = { expansions: 0, candidates: 0 };
export function getLastPlanMetrics(): PlanMetrics {
  return lastMetrics;
}

function parseKey(key: string): {
  id: string;
  stopCount: number;
  soc: number;
  wpIndex: number;
} {
  const parts = key.split('#');
  return {
    id: parts[0]!,
    stopCount: Number(parts[1]!),
    soc: Number(parts[2]!),
    wpIndex: Number(parts[3]!),
  };
}

export async function planRoute(
  chargers: Supercharger[],
  req: RouteRequest,
): Promise<RouteResponse> {
  const maxRangeKm = req.vehicleRangeKm;
  const batteryCapacityKWh = maxRangeKm * EFFICIENCY_KWH_PER_KM;
  const prefilterKm = maxRangeKm * RANGE_PREFILTER_FACTOR;
  const maxStops = req.maxStops;
  const trackStops = maxStops !== undefined;

  const startNode: Supercharger = {
    id: START_ID,
    name: 'Start',
    location: req.start,
    address: '',
    stallCount: 0,
    powerKW: 250,
  };
  const endNode: Supercharger = {
    id: END_ID,
    name: 'End',
    location: req.end,
    address: '',
    stallCount: 0,
    powerKW: 250,
  };

  // Ordered intermediate destinations become forced, non-charging nodes.
  const wpNodes: Supercharger[] = (req.waypoints ?? []).map((w, i) => ({
    id: `${WP_PREFIX}${i}`,
    name: `Waypoint ${i + 1}`,
    location: w,
    address: '',
    stallCount: 0,
    powerKW: 0,
  }));
  const numWaypoints = wpNodes.length;

  const byId = new Map<string, Supercharger>();
  byId.set(START_ID, startNode);
  byId.set(END_ID, endNode);
  for (const wp of wpNodes) byId.set(wp.id, wp);
  for (const c of chargers) byId.set(c.id, c);

  // Straight-line lower bound on remaining travel time: from `loc`, through
  // every not-yet-visited waypoint in order, to the end. Admissible because
  // the waypoints are mandatory, so the route is at least this long.
  function heuristicMin(loc: { lat: number; lng: number }, wpIndex: number): number {
    let dist = 0;
    let from = loc;
    for (let k = wpIndex; k < numWaypoints; k++) {
      dist += haversineKm(from, wpNodes[k]!.location);
      from = wpNodes[k]!.location;
    }
    dist += haversineKm(from, endNode.location);
    return (dist / AVG_SPEED_KMH) * 60;
  }

  // Charger neighbor lists depend only on node id (prefilterKm and the
  // candidate list are constant per call), so memoize per id — the same
  // charger is expanded under many state keys. End and the next waypoint are
  // appended per-expansion since they depend on how many waypoints are left.
  const neighborCache = new Map<string, Supercharger[]>();

  function chargerNeighbors(node: Supercharger): Supercharger[] {
    if (node.id === END_ID) return [];
    const cached = neighborCache.get(node.id);
    if (cached !== undefined) return cached;
    const out: Supercharger[] = [];
    for (const c of chargers) {
      if (c.id === node.id) continue;
      if (haversineKm(node.location, c.location) <= prefilterKm) {
        out.push(c);
      }
    }
    neighborCache.set(node.id, out);
    return out;
  }

  const heap = new MinHeap<string>();
  const gScore = new Map<string, number>();
  const arrivalBattery = new Map<string, number>();
  const edgeIn = new Map<string, EdgeRecord>();

  const startKey = makeKey(START_ID, 0, req.startBatteryPct, 0);
  heap.push(startKey, 0);
  gScore.set(startKey, 0);
  arrivalBattery.set(startKey, req.startBatteryPct);

  const visited = new Set<string>();
  let expansions = 0;

  while (heap.size > 0) {
    const currentKey = heap.pop()!;
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    expansions++;

    const {
      id: currentId,
      stopCount: currentStopCount,
      wpIndex: currentWpIndex,
    } = parseKey(currentKey);

    if (currentId === END_ID) {
      flushEdgeCache();
      lastMetrics = { expansions, candidates: chargers.length };
      return reconstruct(edgeIn, byId, gScore.get(currentKey)!, currentKey);
    }

    const current = byId.get(currentId)!;
    const currentG = gScore.get(currentKey)!;
    const currentBattery = arrivalBattery.get(currentKey)!;
    const currentCanCharge = canCharge(currentId);

    // Candidates: all in-range chargers, plus either the next mandatory
    // waypoint (in order) or the end once every waypoint has been visited.
    const candidates = [...chargerNeighbors(current)];
    if (currentWpIndex < numWaypoints) {
      const nextWp = wpNodes[currentWpIndex]!;
      if (haversineKm(current.location, nextWp.location) <= prefilterKm) {
        candidates.push(nextWp);
      }
    } else if (haversineKm(current.location, endNode.location) <= prefilterKm) {
      candidates.push(endNode);
    }

    for (const nb of candidates) {
      const isEnd = nb.id === END_ID;
      const isWaypoint = nb.id.startsWith(WP_PREFIX);
      const newWpIndex = isWaypoint ? currentWpIndex + 1 : currentWpIndex;
      // Only real charger stops count toward maxStops.
      const newStopCount = trackStops
        ? (isEnd || isWaypoint ? currentStopCount : currentStopCount + 1)
        : 0;

      if (trackStops && !isEnd && !isWaypoint && newStopCount > maxStops) continue;

      const edge = await getEdgeWeight(current, nb);

      const energyPct = (edge.distanceKm / maxRangeKm) * 100;
      if (energyPct >= 100) continue;

      const requiredArrival = isEnd
        ? req.minArrivalBatteryPct
        : SAFETY_BUFFER_PCT;
      const requiredDeparture = requiredArrival + energyPct;
      if (requiredDeparture > 100) continue;

      // Build list of departure SoCs to evaluate
      const departureSoCs: number[] = [];

      if (!currentCanCharge) {
        // Start or waypoint — no charging possible, single option.
        if (currentBattery >= requiredDeparture) {
          departureSoCs.push(currentBattery);
        }
      } else if (isEnd) {
        // End node: no benefit to overcharging, use minimum
        const effMin = Math.max(requiredDeparture, currentBattery);
        if (effMin <= 100) departureSoCs.push(effMin);
      } else {
        // Charger → charger or charger → waypoint: enumerate feasible
        // departure SoCs. The high-SoC options let A* charge more here so a
        // following waypoint (where it can't charge) stays reachable.
        const effMin = Math.max(requiredDeparture, currentBattery);
        if (effMin <= 100) {
          departureSoCs.push(effMin);
          let next = Math.ceil(effMin / SOC_BUCKET_SIZE) * SOC_BUCKET_SIZE;
          if (next <= effMin) next += SOC_BUCKET_SIZE;
          for (let dep = next; dep <= MAX_DEPARTURE_SOC; dep += SOC_BUCKET_SIZE) {
            departureSoCs.push(dep);
          }
        }
      }

      const h = heuristicMin(nb.location, newWpIndex);

      for (const depSoC of departureSoCs) {
        const chargingMin = depSoC > currentBattery
          ? chargeTimeMin(
              currentBattery,
              depSoC,
              current.powerKW,
              batteryCapacityKWh,
            )
          : 0;
        const arrival = depSoC - energyPct;
        const tentativeG = currentG + chargingMin + edge.drivingTimeMin;

        const nbKey = makeKey(nb.id, newStopCount, arrival, newWpIndex);
        const prevG = gScore.get(nbKey);
        if (prevG !== undefined && tentativeG >= prevG) continue;

        gScore.set(nbKey, tentativeG);
        arrivalBattery.set(nbKey, arrival);
        edgeIn.set(nbKey, {
          prevKey: currentKey,
          distanceKm: edge.distanceKm,
          drivingTimeMin: edge.drivingTimeMin,
          arrivalBatteryPct: arrival,
          chargingTimeAtPrevMin: chargingMin,
          departureBatteryFromPrevPct: depSoC,
        });

        heap.push(nbKey, tentativeG + h);
      }
    }
  }

  flushEdgeCache();
  lastMetrics = { expansions, candidates: chargers.length };
  if (maxStops !== undefined) {
    throw new Error(`No feasible route found within ${maxStops} stops`);
  }
  throw new Error('No feasible route found');
}

function reconstruct(
  edgeIn: Map<string, EdgeRecord>,
  byId: Map<string, Supercharger>,
  totalTripTimeMin: number,
  endKey: string,
): RouteResponse {
  // Walk back from end to start, collecting state keys.
  const path: string[] = [];
  let cur: string | undefined = endKey;
  while (cur !== undefined) {
    path.push(cur);
    cur = edgeIn.get(cur)?.prevKey;
  }
  path.reverse();
  // path: [start state key, ...charger state keys, end state key]

  let totalDistanceKm = 0;
  let totalDrivingTimeMin = 0;
  let totalChargingTimeMin = 0;
  const stops: RouteStop[] = [];

  for (let i = 1; i < path.length; i++) {
    const nodeKey = path[i]!;
    const rec = edgeIn.get(nodeKey)!;
    totalDistanceKm += rec.distanceKm;
    totalDrivingTimeMin += rec.drivingTimeMin;

    // Emit a stop for the *previous* node (the one we charged at) unless
    // prev is the virtual start.
    const prevKey = rec.prevKey;
    const { id: prevId } = parseKey(prevKey);
    if (prevId !== START_ID && !prevId.startsWith(WP_PREFIX)) {
      const prevCharger = byId.get(prevId)!;
      const prevArrival = edgeIn.get(prevKey)!;
      stops.push({
        charger: prevCharger,
        arrivalBatteryPct: round(prevArrival.arrivalBatteryPct),
        departureBatteryPct: round(rec.departureBatteryFromPrevPct),
        chargingTimeMin: round(rec.chargingTimeAtPrevMin),
        distanceFromPrevKm: round(prevArrival.distanceKm),
        drivingTimeFromPrevMin: round(prevArrival.drivingTimeMin),
      });
      totalChargingTimeMin += rec.chargingTimeAtPrevMin;
    }
  }

  return {
    stops,
    totalDistanceKm: round(totalDistanceKm),
    totalDrivingTimeMin: round(totalDrivingTimeMin),
    totalChargingTimeMin: round(totalChargingTimeMin),
    totalTripTimeMin: round(totalTripTimeMin),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
