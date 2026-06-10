import type {
  RouteRequest,
  RouteResponse,
  PlacesResponse,
  FavoritesResponse,
  TripsResponse,
  ApiError,
} from '@volt/shared';

// Empty string in dev → Vite proxy forwards relative /api/* to the local
// server. Set to the AWS API Gateway URL in Vercel for production.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; parse?: boolean } = {},
): Promise<T> {
  const { token, body, parse = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`);
  }

  return (parse ? await res.json() : undefined) as T;
}

export function fetchRoute(req: RouteRequest): Promise<RouteResponse> {
  return request<RouteResponse>('POST', '/api/route', { body: req });
}

export function fetchPlaces(chargerIds: string[]): Promise<PlacesResponse> {
  return request<PlacesResponse>('POST', '/api/places', {
    body: { chargerIds },
  });
}

// Favorites
export function fetchFavorites(token: string): Promise<FavoritesResponse> {
  return request<FavoritesResponse>('GET', '/api/favorites', { token });
}

export function addFavorite(
  token: string,
  type: 'charger' | 'brand',
  id: string,
): Promise<void> {
  return request<void>('POST', '/api/favorites', { token, body: { type, id } });
}

export function removeFavorite(
  token: string,
  type: 'charger' | 'brand',
  id: string,
): Promise<void> {
  return request<void>('DELETE', `/api/favorites/${type}/${id}`, {
    token,
    parse: false,
  });
}

// Saved trips
export function fetchTrips(token: string): Promise<TripsResponse> {
  return request<TripsResponse>('GET', '/api/trips', { token });
}

export function saveTrip(
  token: string,
  name: string,
  req: RouteRequest,
): Promise<void> {
  return request<void>('POST', '/api/trips', {
    token,
    body: { name, request: req },
  });
}

export function deleteTrip(token: string, tripId: string): Promise<void> {
  return request<void>('DELETE', `/api/trips/${tripId}`, {
    token,
    parse: false,
  });
}

export function renameTrip(
  token: string,
  tripId: string,
  name: string,
): Promise<void> {
  return request<void>('PATCH', `/api/trips/${tripId}`, {
    token,
    body: { name },
    parse: false,
  });
}
