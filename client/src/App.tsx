import { useState } from 'react';
import type { RouteRequest, RouteResponse } from '@volt/shared';
import { fetchRoute } from '@/lib/api';
import { useGoogleMaps } from '@/lib/maps';
import { RouteForm } from '@/components/RouteForm';
import { ResultsPanel } from '@/components/ResultsPanel';
import { MapView } from '@/components/MapView';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';

function App() {
  const { isLoaded, loadError } = useGoogleMaps();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [endpoints, setEndpoints] = useState<{
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  } | null>(null);

  const handleSubmit = async (req: RouteRequest) => {
    setLoading(true);
    setResult(null);
    setEndpoints({ start: req.start, end: req.end });
    try {
      const res = await fetchRoute(req);
      setResult(res);
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
            <RouteForm onSubmit={handleSubmit} loading={loading} />
          ) : loadError ? (
            <div className="text-sm text-destructive">
              Failed to load Google Maps. Check VITE_GOOGLE_MAPS_API_KEY.
            </div>
          ) : (
            <Skeleton className="h-[420px] w-full" />
          )}
          {result && <ResultsPanel result={result} />}
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
