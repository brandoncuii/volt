import { useState, useEffect, useCallback } from 'react';
import type { SavedTrip, RouteRequest } from '@volt/shared';
import {
  fetchTrips,
  saveTrip as apiSaveTrip,
  deleteTrip as apiDeleteTrip,
} from '@/lib/api';

interface UseSavedTripsOptions {
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
}

export function useSavedTrips({
  isSignedIn,
  getToken,
}: UseSavedTripsOptions) {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const data = await fetchTrips(token);
        if (!cancelled) setTrips(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load trips');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const saveTripFn = useCallback(
    async (name: string, request: RouteRequest) => {
      const token = await getToken();
      if (!token) return;
      const optimistic: SavedTrip = {
        tripId: `temp-${Date.now()}`,
        name,
        request,
        createdAt: new Date().toISOString(),
      };
      setTrips((prev) => [optimistic, ...prev]);
      try {
        await apiSaveTrip(token, name, request);
        // Re-fetch to get real tripId from server
        const data = await fetchTrips(token);
        setTrips(data);
      } catch {
        setTrips((prev) =>
          prev.filter((t) => t.tripId !== optimistic.tripId),
        );
      }
    },
    [getToken],
  );

  const deleteTripFn = useCallback(
    async (tripId: string) => {
      const token = await getToken();
      if (!token) return;
      setTrips((prev) => prev.filter((t) => t.tripId !== tripId));
      try {
        await apiDeleteTrip(token, tripId);
      } catch {
        // Re-fetch to restore correct state
        try {
          const data = await fetchTrips(token);
          setTrips(data);
        } catch {
          // Silently fail
        }
      }
    },
    [getToken],
  );

  const effectiveTrips = isSignedIn ? trips : [];

  return {
    trips: effectiveTrips,
    loading,
    error,
    saveTrip: saveTripFn,
    deleteTrip: deleteTripFn,
  };
}
