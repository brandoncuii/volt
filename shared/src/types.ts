// Core supercharger entity (loaded from superchargers.json)
export interface Supercharger {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  address: string;
  city?: string;
  state?: string;
  stallCount: number;
  powerKW: number;
}

// What the frontend sends to POST /api/route
export interface RouteRequest {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  vehicleRangeKm: number;        // max range on full charge, e.g. 400
  startBatteryPct: number;       // 0-100, e.g. 90
  minArrivalBatteryPct: number;  // 0-100, e.g. 10 — must arrive with at least this much
}

// One stop along the computed route
export interface RouteStop {
  charger: Supercharger;
  arrivalBatteryPct: number;
  departureBatteryPct: number;
  chargingTimeMin: number;
  distanceFromPrevKm: number;
  drivingTimeFromPrevMin: number;
}

// What the backend returns from POST /api/route
export interface RouteResponse {
  stops: RouteStop[];
  totalDistanceKm: number;
  totalDrivingTimeMin: number;
  totalChargingTimeMin: number;
  totalTripTimeMin: number;
}

// Standard error shape for all endpoints
export interface ApiError {
  error: string;
  details?: string;
}