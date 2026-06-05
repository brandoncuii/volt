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
  excludeChargerIds?: string[];   // chargers to exclude from the graph
  maxStops?: number;              // cap on the number of charging stops in the result (0-10)
  restaurantBrandIds?: string[];  // when set, server pre-filters chargers to those near these brands
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

// A restaurant near a Supercharger, surfaced by POST /api/places.
export type PriceLevel =
  | 'PRICE_LEVEL_INEXPENSIVE'
  | 'PRICE_LEVEL_MODERATE'
  | 'PRICE_LEVEL_EXPENSIVE'
  | 'PRICE_LEVEL_VERY_EXPENSIVE';

export interface Restaurant {
  id: string;
  name: string;
  formattedAddress?: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: PriceLevel;
}

// What the frontend sends to POST /api/places
export interface PlacesRequest {
  chargerIds: string[];
}

// What the backend returns: chargerId -> top restaurants near that charger
export type PlacesResponse = Record<string, Restaurant[]>;

// Favorite item — a charger or brand the user has hearted
export interface Favorite {
  type: 'charger' | 'brand';
  id: string;
  createdAt: string;
}

// Saved trip — stores the RouteRequest so it can be re-run
export interface SavedTrip {
  tripId: string;
  name: string;
  request: RouteRequest;
  createdAt: string;
}

// API responses for favorites and trips
export type FavoritesResponse = Favorite[];
export type TripsResponse = SavedTrip[];
