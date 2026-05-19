import { BRANDS, type Brand } from '@/lib/brands';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Props {
  selected: Brand[];
  onChange: (next: Brand[]) => void;
}

export function BrandFilter({ selected, onChange }: Props) {
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
          return (
            <button
              key={brand.id}
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
          );
        })}
      </div>
    </div>
  );
}
