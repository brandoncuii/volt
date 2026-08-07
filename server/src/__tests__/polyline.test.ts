import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decodePolyline, encodePolyline } from '@volt/shared';
import {
  getRoutePolyline,
  polylineCacheKey,
  useRoutePolyline,
} from '../graph/routePolyline.js';

describe('polyline encode/decode', () => {
  it('round-trips a path', () => {
    const points = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it('decodes the Google reference example', () => {
    // From the encoded-polyline docs.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('handles an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('polylineCacheKey', () => {
  it('snaps nearby endpoints to the same key', () => {
    const a = polylineCacheKey([
      { lat: 45.5231, lng: -122.6765 }, // Portland
      { lat: 34.0522, lng: -118.2437 }, // LA
    ]);
    const b = polylineCacheKey([
      { lat: 45.5265, lng: -122.6801 }, // a few blocks away
      { lat: 34.0530, lng: -118.2465 },
    ]);
    expect(a).toBe(b);
  });

  it('distinguishes far-apart endpoints', () => {
    const a = polylineCacheKey([
      { lat: 45.5231, lng: -122.6765 },
      { lat: 34.0522, lng: -118.2437 },
    ]);
    const b = polylineCacheKey([
      { lat: 45.5231, lng: -122.6765 },
      { lat: 37.7749, lng: -122.4194 }, // SF instead of LA
    ]);
    expect(a).not.toBe(b);
  });

  it('includes waypoints in the key', () => {
    const direct = polylineCacheKey([
      { lat: 45.52, lng: -122.68 },
      { lat: 34.05, lng: -118.24 },
    ]);
    const viaSac = polylineCacheKey([
      { lat: 45.52, lng: -122.68 },
      { lat: 38.58, lng: -121.49 },
      { lat: 34.05, lng: -118.24 },
    ]);
    expect(direct).not.toBe(viaSac);
  });
});

describe('useRoutePolyline', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults on, disabled only by explicit false', () => {
    vi.stubEnv('USE_ROUTE_POLYLINE', '');
    expect(useRoutePolyline()).toBe(true);
    vi.stubEnv('USE_ROUTE_POLYLINE', 'false');
    expect(useRoutePolyline()).toBe(false);
  });
});

describe('getRoutePolyline', () => {
  const encoded = encodePolyline([
    { lat: 10, lng: 10 },
    { lat: 10.5, lng: 10 },
    { lat: 11, lng: 10 },
  ]);

  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      routes: [
        {
          polyline: { encodedPolyline: encoded },
          distanceMeters: 120000,
          duration: '4800s',
        },
      ],
    }),
  }));

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fetches, parses, and serves repeats from the in-memory cache', async () => {
    // Unlikely-to-collide coordinates keep this isolated from any local cache.
    const points = [
      { lat: 10.011, lng: 10.011 },
      { lat: 11.011, lng: 10.011 },
    ];
    const first = await getRoutePolyline(points);
    expect(first.distanceKm).toBeCloseTo(120);
    expect(first.drivingTimeMin).toBeCloseTo(80);
    expect(first.encoded).toBe(encoded);
    expect(first.points).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same snapped key → no second API call.
    const second = await getRoutePolyline([
      { lat: 10.012, lng: 10.012 },
      { lat: 11.012, lng: 10.012 },
    ]);
    expect(second.encoded).toBe(encoded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a TRAFFIC_UNAWARE Essentials-tier request', async () => {
    await getRoutePolyline([
      { lat: 20.011, lng: 20.011 },
      { lat: 21.011, lng: 20.011 },
    ]);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('routes.googleapis.com');
    expect(init.headers['X-Goog-FieldMask']).toBe(
      'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
    );
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(body.intermediates).toBeUndefined();
  });

  it('passes waypoints as intermediates', async () => {
    await getRoutePolyline([
      { lat: 30.011, lng: 30.011 },
      { lat: 30.511, lng: 30.011 },
      { lat: 31.011, lng: 30.011 },
    ]);
    const [, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(init.body) as { intermediates?: unknown[] };
    expect(body.intermediates).toHaveLength(1);
  });

  it('throws without an API key', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    await expect(
      getRoutePolyline([
        { lat: 40.011, lng: 40.011 },
        { lat: 41.011, lng: 40.011 },
      ]),
    ).rejects.toThrow('GOOGLE_MAPS_API_KEY');
  });
});
