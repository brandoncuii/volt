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

const START_ID = '__start__';
const END_ID = '__end__';

interface EdgeRecord {
  prevKey: string;
  distanceKm: number;
  drivingTimeMin: number;
  arrivalBatteryPct: number;
  chargingTimeAtPrevMin: number;
  departureBatteryFromPrevPct: number;
}

// State key encodes both the node id and how many charger stops the path
// taking us here has visited so far. Different stopCounts for the same
// charger are distinct states — necessary when `maxStops` is active, since
// the time-optimal path to X may not respect the cap.
function makeKey(id: string, stopCount: number): string {
  return `${id}#${stopCount}`;
}

export interface PlanMetrics {
  expansions: number;        // unique states popped from the heap
  candidates: number;        // chargers passed in to planRoute
}

let lastMetrics: PlanMetrics = { expansions: 0, candidates: 0 };
export function getLastPlanMetrics(): PlanMetrics {
  return lastMetrics;
}

function parseKey(key: string): { id: string; stopCount: number } {
  const idx = key.lastIndexOf('#');
  return { id: key.slice(0, idx), stopCount: Number(key.slice(idx + 1)) };
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

  const byId = new Map<string, Supercharger>();
  byId.set(START_ID, startNode);
  byId.set(END_ID, endNode);
  for (const c of chargers) byId.set(c.id, c);

  function neighbors(node: Supercharger): Supercharger[] {
    if (node.id === END_ID) return [];
    const out: Supercharger[] = [];
    if (haversineKm(node.location, endNode.location) <= prefilterKm) {
      out.push(endNode);
    }
    for (const c of chargers) {
      if (c.id === node.id) continue;
      if (haversineKm(node.location, c.location) <= prefilterKm) {
        out.push(c);
      }
    }
    return out;
  }

  const heap = new MinHeap<string>();
  const gScore = new Map<string, number>();
  const arrivalBattery = new Map<string, number>();
  const edgeIn = new Map<string, EdgeRecord>();

  const startKey = makeKey(START_ID, 0);
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

    const { id: currentId, stopCount: currentStopCount } = parseKey(currentKey);

    if (currentId === END_ID) {
      flushEdgeCache();
      lastMetrics = { expansions, candidates: chargers.length };
      return reconstruct(edgeIn, byId, gScore.get(currentKey)!, currentKey);
    }

    const current = byId.get(currentId)!;
    const currentG = gScore.get(currentKey)!;
    const currentBattery = arrivalBattery.get(currentKey)!;

    for (const nb of neighbors(current)) {
      const isEnd = nb.id === END_ID;
      const newStopCount = trackStops
        ? (isEnd ? currentStopCount : currentStopCount + 1)
        : 0;

      if (trackStops && !isEnd && newStopCount > maxStops) continue;

      const edge = await getEdgeWeight(current, nb);

      const energyPct = (edge.distanceKm / maxRangeKm) * 100;
      if (energyPct >= 100) continue;

      const requiredArrival = isEnd
        ? req.minArrivalBatteryPct
        : SAFETY_BUFFER_PCT;
      const requiredDeparture = requiredArrival + energyPct;
      if (requiredDeparture > 100) continue;

      let departureBattery = currentBattery;
      let chargingTimeMin = 0;
      if (departureBattery < requiredDeparture) {
        if (currentId === START_ID) continue; // can't charge at the start point
        chargingTimeMin = chargeTimeMin(
          departureBattery,
          requiredDeparture,
          current.powerKW,
          batteryCapacityKWh,
        );
        departureBattery = requiredDeparture;
      }

      const arrival = departureBattery - energyPct;
      const tentativeG = currentG + chargingTimeMin + edge.drivingTimeMin;

      const nbKey = makeKey(nb.id, newStopCount);
      const prevG = gScore.get(nbKey);
      if (prevG !== undefined && tentativeG >= prevG) continue;

      gScore.set(nbKey, tentativeG);
      arrivalBattery.set(nbKey, arrival);
      edgeIn.set(nbKey, {
        prevKey: currentKey,
        distanceKm: edge.distanceKm,
        drivingTimeMin: edge.drivingTimeMin,
        arrivalBatteryPct: arrival,
        chargingTimeAtPrevMin: chargingTimeMin,
        departureBatteryFromPrevPct: departureBattery,
      });

      const h =
        (haversineKm(nb.location, endNode.location) / AVG_SPEED_KMH) * 60;
      heap.push(nbKey, tentativeG + h);
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
    if (prevId !== START_ID) {
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
