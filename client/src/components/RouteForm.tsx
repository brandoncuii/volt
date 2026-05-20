import { useState } from 'react';
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
import type { PlaceValue } from '@/lib/maps';
import { miToKm } from '@/lib/units';
import type { Brand } from '@volt/shared';

const MAX_STOPS_ANY = 'any';

interface Props {
  onSubmit: (req: RouteRequest) => void;
  loading: boolean;
  selectedBrands: Brand[];
  onSelectedBrandsChange: (brands: Brand[]) => void;
}

export function RouteForm({
  onSubmit,
  loading,
  selectedBrands,
  onSelectedBrandsChange,
}: Props) {
  const [start, setStart] = useState<PlaceValue | null>(null);
  const [end, setEnd] = useState<PlaceValue | null>(null);
  const [vehicleRangeMi, setVehicleRangeMi] = useState(250);
  const [startBatteryPct, setStartBatteryPct] = useState(90);
  const [minArrivalBatteryPct, setMinArrivalBatteryPct] = useState(10);
  const [maxStops, setMaxStops] = useState<string>(MAX_STOPS_ANY);

  const canSubmit = start !== null && end !== null && !loading;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan a trip</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <PlacesAutocompleteInput
            id="start"
            label="Start"
            placeholder="San Francisco, CA"
            onChange={setStart}
          />
          <PlacesAutocompleteInput
            id="end"
            label="Destination"
            placeholder="Los Angeles, CA"
            onChange={setEnd}
          />

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
              max={400}
              step={10}
              value={[vehicleRangeMi]}
              onValueChange={([v]) => setVehicleRangeMi(v!)}
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
          />

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {loading ? 'Planning…' : 'Plan route'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
