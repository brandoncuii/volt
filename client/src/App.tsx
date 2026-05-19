import { useState } from 'react';
import type { RouteRequest, RouteResponse, PlacesResponse } from '@volt/shared';
import { fetchRoute, fetchPlaces } from '@/lib/api';
import { useGoogleMaps } from '@/lib/maps';
import { RouteForm } from '@/components/RouteForm';
import { ResultsPanel } from '@/components/ResultsPanel';
import { MapView } from '@/components/MapView';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { chargerSatisfiesBrands, type Brand } from '@/lib/brands';

const MAX_BRAND_REPLAN_ITERATIONS = 3;

function App() {
  const { isLoaded, loadError } = useGoogleMaps();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [restaurants, setRestaurants] = useState<PlacesResponse | null>(null);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [endpoints, setEndpoints] = useState<{
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  } | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<Brand[]>([]);
  const [partialFit, setPartialFit] = useState(false);

  const handleSubmit = async (req: RouteRequest) => {
    setLoading(true);
    setResult(null);
    setRestaurants(null);
    setPartialFit(false);
    setEndpoints({ start: req.start, end: req.end });

    const excluded = new Set<string>(req.excludeChargerIds ?? []);
    let route: RouteResponse | null = null;
    let places: PlacesResponse | null = null;

    try {
      for (let i = 0; i < MAX_BRAND_REPLAN_ITERATIONS; i++) {
        route = await fetchRoute({
          ...req,
          excludeChargerIds: [...excluded],
        });
        setResult(route);

        if (route.stops.length === 0) {
          places = {};
          setRestaurants({});
          break;
        }

        setRestaurantsLoading(true);
        try {
          places = await fetchPlaces(route.stops.map((s) => s.charger.id));
          setRestaurants(places);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Places lookup failed';
          toast.warning('Could not load restaurants', { description: msg });
          places = {};
        } finally {
          setRestaurantsLoading(false);
        }

        if (selectedBrands.length === 0) break;

        const offBrand = route.stops
          .map((s) => s.charger.id)
          .filter((id) => !chargerSatisfiesBrands(places?.[id], selectedBrands));

        if (offBrand.length === 0) break; // every stop matches a brand

        if (i === MAX_BRAND_REPLAN_ITERATIONS - 1) {
          setPartialFit(true);
          break;
        }

        for (const id of offBrand) excluded.add(id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Route failed';
      toast.error('Could not plan route', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-6 py-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
        <h1 className="text-lg font-semibold">Volt</h1>
        <span className="text-sm text-muted-foreground ml-2">
          EV trip planner — US Superchargers
        </span>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[400px_1fr] overflow-hidden">
        <aside className="border-r overflow-y-auto p-4 space-y-4">
          {isLoaded ? (
            <RouteForm
              onSubmit={handleSubmit}
              loading={loading}
              selectedBrands={selectedBrands}
              onSelectedBrandsChange={setSelectedBrands}
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
              Couldn't satisfy every brand filter without breaking the route.
              Showing the closest match.
            </div>
          )}
          {result && (
            <ResultsPanel
              result={result}
              restaurants={restaurants}
              restaurantsLoading={restaurantsLoading}
              selectedBrands={selectedBrands}
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
