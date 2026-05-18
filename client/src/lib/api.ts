import type { RouteRequest, RouteResponse, ApiError } from '@volt/shared';

export async function fetchRoute(req: RouteRequest): Promise<RouteResponse> {
  const res = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as RouteResponse;
}
