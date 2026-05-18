import type {
  Supercharger,
  RouteRequest,
  RouteResponse,
  RouteStop,
} from '@volt/shared';
import { haversineKm } from '../graph/haversine.js';
import { getEdgeWeight, flushEdgeCache } from '../graph/edges.js';
import { MinHeap } from './heap.js';

// Tesla-ish efficiency: ~155 Wh/km → batteryCapacityKWh = rangeKm * 0.155.
// Charging modeled as linear at the charger's rated power (real DC fast
// charging tapers above ~80%; refine in a later phase if needed).
const EFFICIENCY_KWH_PER_KM = 0.155;
const SAFETY_BUFFER_PCT = 10; // min arrival battery at intermediate stops
const AVG_SPEED_KMH = 88; // for the A* heuristic
const RANGE_PREFILTER_FACTOR = 0.9; // skip edges Haversine-close to the range limit

const START_ID = '__start__';
const END_ID = '__end__';

interface EdgeRecord {
  prevId: string;
  distanceKm: number;
  drivingTimeMin: number;
  arrivalBatteryPct: number;
  chargingTimeAtPrevMin: number;
  departureBatteryFromPrevPct: number;
}

export async function planRoute(
  chargers: Supercharger[],
  req: RouteRequest,
): Promise<RouteResponse> {
  const maxRangeKm = req.vehicleRangeKm;
  const batteryCapacityKWh = maxRangeKm * EFFICIENCY_KWH_PER_KM;
  const prefilterKm = maxRangeKm * RANGE_PREFILTER_FACTOR;

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

  heap.push(START_ID, 0);
  gScore.set(START_ID, 0);
  arrivalBattery.set(START_ID, req.startBatteryPct);

  const visited = new Set<string>();

  while (heap.size > 0) {
    const currentId = heap.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (currentId === END_ID) {
      flushEdgeCache();
      return reconstruct(edgeIn, byId, gScore.get(END_ID)!);
    }

    const current = byId.get(currentId)!;
    const currentG = gScore.get(currentId)!;
    const currentBattery = arrivalBattery.get(currentId)!;

    for (const nb of neighbors(current)) {
      const edge = await getEdgeWeight(current, nb);

      const energyPct = (edge.distanceKm / maxRangeKm) * 100;
      if (energyPct >= 100) continue;

      const requiredArrival =
        nb.id === END_ID ? req.minArrivalBatteryPct : SAFETY_BUFFER_PCT;
      const requiredDeparture = requiredArrival + energyPct;
      if (requiredDeparture > 100) continue;

      let departureBattery = currentBattery;
      let chargingTimeMin = 0;
      if (departureBattery < requiredDeparture) {
        if (currentId === START_ID) continue; // can't charge at the start point
        const deltaPct = requiredDeparture - departureBattery;
        chargingTimeMin =
          ((deltaPct / 100) * batteryCapacityKWh) / current.powerKW * 60;
        departureBattery = requiredDeparture;
      }

      const arrival = departureBattery - energyPct;
      const tentativeG = currentG + chargingTimeMin + edge.drivingTimeMin;

      const prevG = gScore.get(nb.id);
      if (prevG !== undefined && tentativeG >= prevG) continue;

      gScore.set(nb.id, tentativeG);
      arrivalBattery.set(nb.id, arrival);
      edgeIn.set(nb.id, {
        prevId: currentId,
        distanceKm: edge.distanceKm,
        drivingTimeMin: edge.drivingTimeMin,
        arrivalBatteryPct: arrival,
        chargingTimeAtPrevMin: chargingTimeMin,
        departureBatteryFromPrevPct: departureBattery,
      });

      const h =
        (haversineKm(nb.location, endNode.location) / AVG_SPEED_KMH) * 60;
      heap.push(nb.id, tentativeG + h);
    }
  }

  flushEdgeCache();
  throw new Error('No feasible route found');
}

function reconstruct(
  edgeIn: Map<string, EdgeRecord>,
  byId: Map<string, Supercharger>,
  totalTripTimeMin: number,
): RouteResponse {
  // Walk back from end to start, collecting the node sequence.
  const path: string[] = [];
  let cur: string | undefined = END_ID;
  while (cur !== undefined) {
    path.push(cur);
    cur = edgeIn.get(cur)?.prevId;
  }
  path.reverse();
  // path: [START_ID, ...chargers, END_ID]

  let totalDistanceKm = 0;
  let totalDrivingTimeMin = 0;
  let totalChargingTimeMin = 0;
  const stops: RouteStop[] = [];

  for (let i = 1; i < path.length; i++) {
    const nodeId = path[i]!;
    const rec = edgeIn.get(nodeId)!;
    totalDistanceKm += rec.distanceKm;
    totalDrivingTimeMin += rec.drivingTimeMin;

    // We emit a stop for the *previous* node (which is the one being charged at)
    // unless prev is the virtual start.
    const prevId = rec.prevId;
    if (prevId !== START_ID) {
      const prevCharger = byId.get(prevId)!;
      const prevArrival = edgeIn.get(prevId)!;
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
