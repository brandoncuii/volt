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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

async function authGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

async function authPost<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

async function authDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`);
  }
}

export function fetchRoute(req: RouteRequest): Promise<RouteResponse> {
  return postJson<RouteResponse>('/api/route', req);
}

export function fetchPlaces(chargerIds: string[]): Promise<PlacesResponse> {
  return postJson<PlacesResponse>('/api/places', { chargerIds });
}

// Favorites
export function fetchFavorites(token: string): Promise<FavoritesResponse> {
  return authGet<FavoritesResponse>('/api/favorites', token);
}

export function addFavorite(
  token: string,
  type: 'charger' | 'brand',
  id: string,
): Promise<void> {
  return authPost<void>('/api/favorites', token, { type, id });
}

export function removeFavorite(
  token: string,
  type: 'charger' | 'brand',
  id: string,
): Promise<void> {
  return authDelete(`/api/favorites/${type}/${id}`, token);
}

// Saved trips
export function fetchTrips(token: string): Promise<TripsResponse> {
  return authGet<TripsResponse>('/api/trips', token);
}

export function saveTrip(
  token: string,
  name: string,
  request: RouteRequest,
): Promise<void> {
  return authPost<void>('/api/trips', token, { name, request });
}

export function deleteTrip(token: string, tripId: string): Promise<void> {
  return authDelete(`/api/trips/${tripId}`, token);
}
