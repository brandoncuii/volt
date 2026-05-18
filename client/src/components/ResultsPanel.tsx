import type { RouteResponse } from '@volt/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BatteryCharging, MapPin } from 'lucide-react';
import { kmToMi } from '@/lib/units';

interface Props {
  result: RouteResponse;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function ResultsPanel({ result }: Props) {
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
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
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
