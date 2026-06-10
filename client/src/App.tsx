import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  RouteRequest,
  RouteResponse,
  PlacesResponse,
  Brand,
} from '@volt/shared';
import { fetchRoute, fetchPlaces } from '@/lib/api';
import { useGoogleMaps } from '@/lib/maps';
import { RouteForm } from '@/components/RouteForm';
import { ResultsPanel } from '@/components/ResultsPanel';
import { MapView } from '@/components/MapView';
import { SavedTripsDrawer } from '@/components/SavedTripsDrawer';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { encodeRouteRequest, decodeRouteRequest } from '@/lib/urlState';
import { useFavorites } from '@/hooks/useFavorites';
import { useSavedTrips } from '@/hooks/useSavedTrips';
import {
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';

const CLERK_CONFIGURED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const noopGetToken = async (): Promise<string | null> => null;

function useOptionalAuth() {
  if (CLERK_CONFIGURED) {
    // Hook call order is stable — CLERK_CONFIGURED is a build-time constant.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { isSignedIn, getToken } = useAuth();
    return { isSignedIn: isSignedIn ?? false, getToken, clerkReady: true };
  }
  return {
    isSignedIn: false,
    getToken: noopGetToken,
    clerkReady: false,
  };
}

function App() {
  const { isLoaded, loadError } = useGoogleMaps();
  const { isSignedIn, getToken, clerkReady } = useOptionalAuth();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [restaurants, setRestaurants] = useState<PlacesResponse | null>(null);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [endpoints, setEndpoints] = useState<{
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  } | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<Brand[]>([]);
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [partialFit, setPartialFit] = useState(false);
  const [lastRequest, setLastRequest] = useState<RouteRequest | null>(null);
  const pendingHashRef = useRef<RouteRequest | null>(
    (() => {
      const hash = window.location.hash.slice(1);
      if (!hash) return null;
      return decodeRouteRequest(hash);
    })(),
  );
  const [formRef, setFormRef] = useState<{
    populateAndSubmit: (req: RouteRequest) => void;
  } | null>(null);

  const stableGetToken = useCallback(
    () => getToken(),
    [getToken],
  );

  const { addFavorite, removeFavorite, isFavorite } = useFavorites({
    isSignedIn,
    getToken: stableGetToken,
  });

  const {
    trips,
    loading: tripsLoading,
    saveTrip,
    deleteTrip,
    renameTrip,
  } = useSavedTrips({ isSignedIn, getToken: stableGetToken });

  // Auto-submit when form is ready and we have a pending hash request
  useEffect(() => {
    if (pendingHashRef.current && formRef) {
      formRef.populateAndSubmit(pendingHashRef.current);
      pendingHashRef.current = null;
    }
  }, [formRef]);

  const handleSubmit = async (req: RouteRequest) => {
    setLoading(true);
    setResult(null);
    setRestaurants(null);
    setPartialFit(false);
    setEndpoints({ start: req.start, end: req.end });
    setLastRequest(req);

    // Update URL hash
    window.history.replaceState(null, '', '#' + encodeRouteRequest(req));

    const reqWithBrands: RouteRequest = {
      ...req,
      ...(selectedBrands.length > 0 && {
        restaurantBrandIds: selectedBrands.map((b) => b.id),
      }),
      ...(customTerms.length > 0 && { restaurantQueries: customTerms }),
    };

    try {
      let route: RouteResponse;
      try {
        route = await fetchRoute(reqWithBrands);
      } catch (e) {
        if (selectedBrands.length > 0 || customTerms.length > 0) {
          route = await fetchRoute(req);
          setPartialFit(true);
        } else {
          throw e;
        }
      }
      setResult(route);

      if (route.stops.length > 0) {
        setRestaurantsLoading(true);
        try {
          const places = await fetchPlaces(
            route.stops.map((s) => s.charger.id),
          );
          setRestaurants(places);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Places lookup failed';
          toast.warning('Could not load restaurants', { description: msg });
        } finally {
          setRestaurantsLoading(false);
        }
      } else {
        setRestaurants({});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Route failed';
      toast.error('Could not plan route', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleSaveTrip = async () => {
    if (!lastRequest) return;
    const name = `Trip ${new Date().toLocaleDateString()}`;
    await saveTrip(name, lastRequest);
    toast.success('Trip saved');
  };

  const handleLoadTrip = (request: RouteRequest) => {
    if (formRef) {
      formRef.populateAndSubmit(request);
    }
  };

  const toggleFavorite = isSignedIn
    ? (type: 'charger' | 'brand', id: string) => {
        if (isFavorite(type, id)) {
          void removeFavorite(type, id);
        } else {
          void addFavorite(type, id);
        }
      }
    : undefined;

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-6 py-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
        <h1 className="text-lg font-semibold">Volt</h1>
        <span className="text-sm text-muted-foreground ml-2">
          EV trip planner — US Superchargers
        </span>
        <div className="ml-auto flex items-center gap-2">
          {clerkReady && isSignedIn && (
            <SavedTripsDrawer
              trips={trips}
              loading={tripsLoading}
              onLoad={handleLoadTrip}
              onDelete={deleteTrip}
              onRename={renameTrip}
            />
          )}
          {clerkReady && !isSignedIn && (
            <SignInButton>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
          )}
          {clerkReady && isSignedIn && <UserButton />}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[400px_1fr] overflow-hidden">
        <aside className="border-r overflow-y-auto p-4 space-y-4">
          {isLoaded ? (
            <RouteForm
              onSubmit={handleSubmit}
              loading={loading}
              selectedBrands={selectedBrands}
              onSelectedBrandsChange={setSelectedBrands}
              customTerms={customTerms}
              onCustomTermsChange={setCustomTerms}
              onReady={setFormRef}
              isFavorite={isSignedIn ? isFavorite : undefined}
              onToggleFavorite={toggleFavorite}
            />
          ) : loadError ? (
            <div className="text-sm text-destructive">
              Failed to load Google Maps. Check VITE_GOOGLE_MAPS_API_KEY.
            </div>
          ) : (
            <Skeleton className="h-[420px] w-full" />
          )}
          {partialFit && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-900 px-3 py-2 text-xs">
              Couldn't find a route matching your restaurant filters. Showing
              the closest match without them.
            </div>
          )}
          {result && (
            <ResultsPanel
              result={result}
              restaurants={restaurants}
              restaurantsLoading={restaurantsLoading}
              selectedBrands={selectedBrands}
              onShare={handleShare}
              onSaveTrip={isSignedIn ? handleSaveTrip : undefined}
              isFavorite={isSignedIn ? isFavorite : undefined}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </aside>

        <main className="relative">
          {isLoaded ? (
            <MapView
              result={result}
              start={endpoints?.start ?? null}
              end={endpoints?.end ?? null}
            />
          ) : (
            <div className="h-full w-full grid place-items-center text-muted-foreground text-sm">
              Loading map…
            </div>
          )}
        </main>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}

export default App;
