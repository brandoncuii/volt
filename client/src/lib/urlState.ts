import type { RouteRequest } from '@volt/shared';

export function encodeRouteRequest(req: RouteRequest): string {
  return btoa(JSON.stringify(req));
}

export function decodeRouteRequest(hash: string): RouteRequest | null {
  try {
    const json: unknown = JSON.parse(atob(hash));
    if (
      typeof json === 'object' &&
      json !== null &&
      'start' in json &&
      'end' in json &&
      'vehicleRangeKm' in json
    ) {
      return json as RouteRequest;
    }
    return null;
  } catch {
    return null;
  }
}
