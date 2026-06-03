import type { SavedTrip, RouteRequest } from '@volt/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Bookmark, Trash2, Play } from 'lucide-react';

interface Props {
  trips: SavedTrip[];
  loading: boolean;
  onLoad: (request: RouteRequest) => void;
  onDelete: (tripId: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SavedTripsDrawer({ trips, loading, onLoad, onDelete }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <Bookmark className="h-4 w-4" />
          Saved trips
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Saved trips</SheetTitle>
          <SheetDescription>
            Load a previously saved route plan.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : trips.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No saved trips yet. Plan a route and save it!
            </div>
          ) : (
            <ul className="space-y-3">
              {trips.map((trip) => (
                <li
                  key={trip.tripId}
                  className="rounded-md border p-3 space-y-2"
                >
                  <div className="font-medium text-sm">{trip.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(trip.createdAt)}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onLoad(trip.request)}
                    >
                      <Play className="h-3 w-3" />
                      Load
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => onDelete(trip.tripId)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
