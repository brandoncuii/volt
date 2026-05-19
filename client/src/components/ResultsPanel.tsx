import type {
  RouteResponse,
  PlacesResponse,
  Restaurant,
  PriceLevel,
} from '@volt/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { BatteryCharging, MapPin, Star, Utensils } from 'lucide-react';
import { kmToMi } from '@/lib/units';

interface Props {
  result: RouteResponse;
  restaurants: PlacesResponse | null;
  restaurantsLoading: boolean;
}

const MAX_RESTAURANTS_SHOWN = 4;

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function priceLevelToDollars(level: PriceLevel | undefined): string {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '$';
    case 'PRICE_LEVEL_MODERATE':
      return '$$';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '$$$$';
    default:
      return '';
  }
}

export function ResultsPanel({ result, restaurants, restaurantsLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trip summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat
            label="Distance"
            value={`${kmToMi(result.totalDistanceKm).toFixed(0)} mi`}
          />
          <Stat label="Total time" value={formatDuration(result.totalTripTimeMin)} />
          <Stat label="Driving" value={formatDuration(result.totalDrivingTimeMin)} />
          <Stat label="Charging" value={formatDuration(result.totalChargingTimeMin)} />
        </div>

        <Separator />

        <div>
          <div className="text-sm font-medium mb-3">
            {result.stops.length === 0
              ? 'No charging stops needed'
              : `${result.stops.length} charging stop${result.stops.length === 1 ? '' : 's'}`}
          </div>

          <ol className="space-y-3">
            {result.stops.map((stop, i) => (
              <li
                key={stop.charger.id}
                className="rounded-md border p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {i + 1}. {stop.charger.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {stop.charger.address}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {stop.charger.powerKW} kW
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BatteryCharging className="h-3.5 w-3.5" />
                  <span>
                    Arrive {stop.arrivalBatteryPct.toFixed(0)}% → Leave{' '}
                    {stop.departureBatteryPct.toFixed(0)}%
                  </span>
                  <span className="ml-auto">
                    {formatDuration(stop.chargingTimeMin)} charging
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  {kmToMi(stop.distanceFromPrevKm).toFixed(0)} mi from previous ·{' '}
                  {formatDuration(stop.drivingTimeFromPrevMin)} drive
                </div>

                <RestaurantList
                  list={restaurants?.[stop.charger.id]}
                  loading={restaurantsLoading && !restaurants}
                />
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function RestaurantList({
  list,
  loading,
}: {
  list: Restaurant[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="pt-1 space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (!list) return null;

  if (list.length === 0) {
    return (
      <div className="pt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Utensils className="h-3 w-3" />
        No restaurants nearby
      </div>
    );
  }

  const shown = list.slice(0, MAX_RESTAURANTS_SHOWN);

  return (
    <div className="pt-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
        <Utensils className="h-3 w-3" />
        Eat nearby
      </div>
      <ul className="space-y-1">
        {shown.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 text-xs"
          >
            <span className="truncate">{r.name}</span>
            {typeof r.rating === 'number' && (
              <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                {r.rating.toFixed(1)}
              </span>
            )}
            {r.priceLevel && (
              <span className="text-muted-foreground shrink-0">
                {priceLevelToDollars(r.priceLevel)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
