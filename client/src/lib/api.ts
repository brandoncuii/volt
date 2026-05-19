import type {
  RouteRequest,
  RouteResponse,
  PlacesResponse,
  ApiError,
} from '@volt/shared';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
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

export function fetchRoute(req: RouteRequest): Promise<RouteResponse> {
  return postJson<RouteResponse>('/api/route', req);
}

export function fetchPlaces(chargerIds: string[]): Promise<PlacesResponse> {
  return postJson<PlacesResponse>('/api/places', { chargerIds });
}
