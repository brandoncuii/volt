import { useState, useEffect, useCallback } from 'react';
import type { RouteRequest } from '@volt/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlacesAutocompleteInput } from '@/components/PlacesAutocompleteInput';
import { BrandFilter } from '@/components/BrandFilter';
import { CarSelector } from '@/components/CarSelector';
import { findCar, CUSTOM_CAR_ID } from '@/lib/cars';
import type { PlaceValue } from '@/lib/maps';
import { miToKm, kmToMi } from '@/lib/units';
import type { Brand } from '@volt/shared';
import { MapPin, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

const MAX_STOPS_ANY = 'any';
const DEFAULT_CAR_ID = 'tesla-model-y-lr';

interface Props {
  onSubmit: (req: RouteRequest) => void;
  loading: boolean;
  selectedBrands: Brand[];
  onSelectedBrandsChange: (brands: Brand[]) => void;
  onReady?: (ref: { populateAndSubmit: (req: RouteRequest) => void }) => void;
  isFavorite?: (type: 'charger' | 'brand', id: string) => boolean;
  onToggleFavorite?: (type: 'charger' | 'brand', id: string) => void;
}

export function RouteForm({
  onSubmit,
  loading,
  selectedBrands,
  onSelectedBrandsChange,
  onReady,
  isFavorite,
  onToggleFavorite,
}: Props) {
  const [start, setStart] = useState<PlaceValue | null>(null);
  const [end, setEnd] = useState<PlaceValue | null>(null);
  const defaultCar = findCar(DEFAULT_CAR_ID);
  const [carId, setCarId] = useState<string>(DEFAULT_CAR_ID);
  const [vehicleRangeMi, setVehicleRangeMi] = useState(
    defaultCar?.rangeMi ?? 250,
  );
  const [startBatteryPct, setStartBatteryPct] = useState(90);
  const [minArrivalBatteryPct, setMinArrivalBatteryPct] = useState(10);
  const [maxStops, setMaxStops] = useState<string>(MAX_STOPS_ANY);
  const [locating, setLocating] = useState(false);
  const [startFromLocation, setStartFromLocation] = useState(false);

  const canSubmit = start !== null && end !== null && !loading;

  const handleCarChange = (id: string) => {
    setCarId(id);
    const car = findCar(id);
    if (car) setVehicleRangeMi(car.rangeMi);
  };

  const handleRangeChange = (mi: number) => {
    setVehicleRangeMi(mi);
    if (carId !== CUSTOM_CAR_ID) {
      const car = findCar(carId);
      if (!car || car.rangeMi !== mi) setCarId(CUSTOM_CAR_ID);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation unavailable in this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let description = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          const geocoder = new google.maps.Geocoder();
          const result = await geocoder.geocode({ location: { lat, lng } });
          const formatted = result.results[0]?.formatted_address;
          if (formatted) description = formatted;
        } catch {
          // Fall back to lat/lng text — still functional for routing.
        }
        setStart({ lat, lng, description });
        setStartFromLocation(true);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error('Could not get your location', {
          description: err.message,
        });
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const populateAndSubmit = useCallback(
    (req: RouteRequest) => {
      const startPlace: PlaceValue = {
        lat: req.start.lat,
        lng: req.start.lng,
        description: `${req.start.lat.toFixed(4)}, ${req.start.lng.toFixed(4)}`,
      };
      const endPlace: PlaceValue = {
        lat: req.end.lat,
        lng: req.end.lng,
        description: `${req.end.lat.toFixed(4)}, ${req.end.lng.toFixed(4)}`,
      };
      setStart(startPlace);
      setEnd(endPlace);
      setVehicleRangeMi(Math.round(kmToMi(req.vehicleRangeKm)));
      setStartBatteryPct(req.startBatteryPct);
      setMinArrivalBatteryPct(req.minArrivalBatteryPct);
      if (req.maxStops !== undefined) {
        setMaxStops(String(req.maxStops));
      } else {
        setMaxStops(MAX_STOPS_ANY);
      }
      setCarId(CUSTOM_CAR_ID);
      onSubmit(req);
    },
    [onSubmit],
  );

  // Expose imperative handle to parent
  useEffect(() => {
    onReady?.({ populateAndSubmit });
  }, [onReady, populateAndSubmit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    const parsedMaxStops =
      maxStops === MAX_STOPS_ANY ? undefined : Number(maxStops);
    onSubmit({
      start: { lat: start.lat, lng: start.lng },
      end: { lat: end.lat, lng: end.lng },
      vehicleRangeKm: miToKm(vehicleRangeMi),
      startBatteryPct,
      minArrivalBatteryPct,
      ...(parsedMaxStops !== undefined && { maxStops: parsedMaxStops }),
    });
  };

  const handleStartPick = (place: PlaceValue) => {
    setStart(place);
    setStartFromLocation(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan a trip</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="start">Start</Label>
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={locating}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {locating ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                Use my location
              </button>
            </div>
            <PlacesAutocompleteInput
              id="start"
              label=""
              placeholder="San Francisco, CA"
              onChange={handleStartPick}
            />
            {start && startFromLocation && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                {start.description}
              </p>
            )}
          </div>

          <PlacesAutocompleteInput
            id="end"
            label="Destination"
            placeholder="Los Angeles, CA"
            onChange={setEnd}
          />

          <CarSelector value={carId} onChange={handleCarChange} />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="range">Vehicle range</Label>
              <span className="text-sm text-muted-foreground">
                {vehicleRangeMi} mi
              </span>
            </div>
            <Slider
              id="range"
              min={100}
              max={520}
              step={10}
              value={[vehicleRangeMi]}
              onValueChange={([v]) => handleRangeChange(v!)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="start-battery">Starting battery</Label>
              <span className="text-sm text-muted-foreground">
                {startBatteryPct}%
              </span>
            </div>
            <Slider
              id="start-battery"
              min={0}
              max={100}
              step={5}
              value={[startBatteryPct]}
              onValueChange={([v]) => setStartBatteryPct(v!)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="arrival-battery">Min arrival battery</Label>
              <span className="text-sm text-muted-foreground">
                {minArrivalBatteryPct}%
              </span>
            </div>
            <Slider
              id="arrival-battery"
              min={0}
              max={50}
              step={5}
              value={[minArrivalBatteryPct]}
              onValueChange={([v]) => setMinArrivalBatteryPct(v!)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-stops">Max stops</Label>
            <Select value={maxStops} onValueChange={setMaxStops}>
              <SelectTrigger id="max-stops" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MAX_STOPS_ANY}>Any</SelectItem>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <BrandFilter
            selected={selectedBrands}
            onChange={onSelectedBrandsChange}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {loading ? 'Planning…' : 'Plan route'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
