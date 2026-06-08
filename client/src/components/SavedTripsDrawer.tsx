import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Bookmark, Trash2, Play, Pencil, Check, X } from 'lucide-react';

interface Props {
  trips: SavedTrip[];
  loading: boolean;
  onLoad: (request: RouteRequest) => void;
  onDelete: (tripId: string) => void;
  onRename: (tripId: string, name: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SavedTripsDrawer({
  trips,
  loading,
  onLoad,
  onDelete,
  onRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function startEdit(trip: SavedTrip) {
    setEditingId(trip.tripId);
    setDraft(trip.name);
  }

  function commitEdit(tripId: string) {
    const name = draft.trim();
    if (name) onRename(tripId, name);
    setEditingId(null);
  }

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
                  {editingId === trip.tripId ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(trip.tripId);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="h-7 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => commitEdit(trip.tripId)}
                        title="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm flex-1">
                        {trip.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(trip)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
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
