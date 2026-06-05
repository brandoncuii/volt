import { BRANDS, type Brand } from '@volt/shared';
import { Label } from '@/components/ui/label';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  selected: Brand[];
  onChange: (next: Brand[]) => void;
  isFavorite?: (type: 'charger' | 'brand', id: string) => boolean;
  onToggleFavorite?: (type: 'charger' | 'brand', id: string) => void;
}

export function BrandFilter({
  selected,
  onChange,
  isFavorite,
  onToggleFavorite,
}: Props) {
  const selectedIds = new Set(selected.map((b) => b.id));

  function toggle(brand: Brand) {
    if (selectedIds.has(brand.id)) {
      onChange(selected.filter((b) => b.id !== brand.id));
    } else {
      onChange([...selected, brand]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Restaurants near stops</Label>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BRANDS.map((brand) => {
          const isSelected = selectedIds.has(brand.id);
          const favorited = isFavorite?.('brand', brand.id) ?? false;
          return (
            <div key={brand.id} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => toggle(brand)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-muted',
                )}
              >
                {brand.name}
              </button>
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite('brand', brand.id);
                  }}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  title={
                    favorited ? 'Remove from favorites' : 'Add to favorites'
                  }
                >
                  <Heart
                    className={cn(
                      'h-3 w-3',
                      favorited && 'fill-red-500 text-red-500',
                    )}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
