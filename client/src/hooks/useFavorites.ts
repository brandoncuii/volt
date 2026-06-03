import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Favorite } from '@volt/shared';
import {
  fetchFavorites,
  addFavorite as apiAddFavorite,
  removeFavorite as apiRemoveFavorite,
} from '@/lib/api';

interface UseFavoritesOptions {
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
}

export function useFavorites({ isSignedIn, getToken }: UseFavoritesOptions) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
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
        const data = await fetchFavorites(token);
        if (!cancelled) setFavorites(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load favorites');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const addFavorite = useCallback(
    async (type: 'charger' | 'brand', id: string) => {
      const token = await getToken();
      if (!token) return;
      const optimistic: Favorite = {
        type,
        id,
        createdAt: new Date().toISOString(),
      };
      setFavorites((prev) => [...prev, optimistic]);
      try {
        await apiAddFavorite(token, type, id);
      } catch {
        setFavorites((prev) =>
          prev.filter((f) => !(f.type === type && f.id === id)),
        );
      }
    },
    [getToken],
  );

  const removeFavorite = useCallback(
    async (type: 'charger' | 'brand', id: string) => {
      const token = await getToken();
      if (!token) return;
      setFavorites((prev) =>
        prev.filter((f) => !(f.type === type && f.id === id)),
      );
      try {
        await apiRemoveFavorite(token, type, id);
      } catch {
        // Re-fetch to restore correct state
        try {
          const data = await fetchFavorites(token);
          setFavorites(data);
        } catch {
          // Silently fail — state may be stale
        }
      }
    },
    [getToken],
  );

  const effectiveFavorites = useMemo(
    () => (isSignedIn ? favorites : []),
    [isSignedIn, favorites],
  );

  const isFavoriteCheck = useCallback(
    (type: 'charger' | 'brand', id: string): boolean =>
      effectiveFavorites.some((f) => f.type === type && f.id === id),
    [effectiveFavorites],
  );

  return {
    favorites: effectiveFavorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    isFavorite: isFavoriteCheck,
  };
}
